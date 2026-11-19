extends Node3D
## Sensei Hakuun — Godot vertical slice: the pond garden, rebuilt with real lighting.

const PATH_PTS := [Vector2(0, 46), Vector2(2, 32), Vector2(8, 20), Vector2(17, 9), Vector2(18.5, -3), Vector2(13, -15), Vector2(3, -22), Vector2(0, -30), Vector2(0, -40)]
const POND := Vector3(0, 0, 0)   # x, z, unused
const PRX := 15.0
const PRZ := 10.5
const ISLAND := Vector2(7.5, 0.5)
const SIZE := 200.0
const RES := 200

var noise := FastNoiseLite.new()
var noise2 := FastNoiseLite.new()
var noise_tex: NoiseTexture2D
var detail_tex: NoiseTexture2D
var env: Environment
var sun: DirectionalLight3D
var sky_mat: ShaderMaterial
var lantern_lights: Array = []
var lantern_glows: Array = []
var koi: Array = []
var player: CharacterBody3D
var cam_pivot: Node3D
var cam_arm: SpringArm3D
var camera: Camera3D
var sensei: Node3D
var whisper: Label3D
var hud: Label
var fireflies: GPUParticles3D
var tod := 1
var tod_t := 1.0
var shot_path := ""
var shot_frames := 90
var frame := 0
var cam_override := []

# ---------------- terrain height ----------------
func path_dist(x: float, z: float) -> float:
	var best := 1e9
	var p := Vector2(x, z)
	for i in PATH_PTS.size() - 1:
		var a: Vector2 = PATH_PTS[i]
		var b: Vector2 = PATH_PTS[i + 1]
		var ab := b - a
		var t := clampf((p - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
		best = minf(best, p.distance_to(a + ab * t))
	return best

func pond_e(x: float, z: float) -> float:
	return pow(x / PRX, 2) + pow(z / PRZ, 2)

func raw_h(x: float, z: float) -> float:
	var r := Vector2(x, z).length()
	var h := 0.55 + noise.get_noise_2d(x, z) * 0.9
	h += smoothstep(38.0, 95.0, r) * (9.0 + noise2.get_noise_2d(x * 0.5, z * 0.5) * 9.0)
	# shrine terrace to the north
	var sd := Vector2(x, z + 44).length()
	h = lerpf(h, 2.2, 1.0 - smoothstep(7.0, 12.0, sd))
	return h

func H(x: float, z: float) -> float:
	var h := raw_h(x, z)
	var pd := path_dist(x, z)
	if pd < 3.5:
		var smoothed := (raw_h(x + 2, z) + raw_h(x - 2, z) + raw_h(x, z + 2) + raw_h(x, z - 2)) * 0.25
		h = lerpf(h, smoothed - 0.04, 1.0 - smoothstep(1.6, 3.5, pd))
	var e := pond_e(x, z) + noise.get_noise_2d(x * 3.0, z * 3.0) * 0.08
	var ie := Vector2(x - ISLAND.x, z - ISLAND.y).length()
	var bowl := 1.0 - smoothstep(0.55, 1.12, e)
	h = lerpf(h, -1.9 + e * 1.2, bowl)
	if ie < 3.6:
		h = lerpf(h, 0.55, 1.0 - smoothstep(2.2, 3.6, ie))
	return h

# ---------------- setup ----------------
func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="): shot_path = a.substr(7)
		elif a.begins_with("--frames="): shot_frames = int(a.substr(9))
		elif a.begins_with("--tod="): tod = int(a.substr(6))
		elif a.begins_with("--cam="):
			for v in a.substr(6).split(","): cam_override.append(float(v))
	noise.seed = 7; noise.frequency = 0.03; noise.fractal_octaves = 4
	noise2.seed = 11; noise2.frequency = 0.02; noise2.fractal_octaves = 3
	noise_tex = _ntex(256, 0.02, 4, false)
	detail_tex = _ntex(256, 0.08, 3, false)
	_environment()
	_terrain()
	_water()
	_grass()
	_trees()
	_rocks()
	_lanterns()
	_torii(Vector3(0, H(0, -30), -30), 0.0)
	_torii(Vector3(0, H(0, -37), -37), 0.0)
	_shrine(Vector3(0, H(0, -45), -45))
	_bridge()
	_stepping_stones()
	_koi_school()
	_player()
	_sensei()
	_particles()
	_hud()
	_apply_tod(tod, true)

func _ntex(sz: int, freq: float, oct: int, normal: bool) -> NoiseTexture2D:
	var t := NoiseTexture2D.new()
	var n := FastNoiseLite.new()
	n.frequency = freq; n.fractal_octaves = oct; n.seed = randi()
	t.noise = n; t.width = sz; t.height = sz; t.seamless = true
	if normal:
		t.as_normal_map = true; t.bump_strength = 6.0
	return t

func _environment() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	sky_mat = ShaderMaterial.new(); sky_mat.shader = load("res://shaders/sky.gdshader")
	sky_mat.set_shader_parameter("cloud_noise", _ntex(512, 0.012, 2, false))
	var sky := Sky.new(); sky.sky_material = sky_mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.55
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_white = 6.0; env.tonemap_exposure = 0.9
	env.ssao_enabled = true; env.ssao_radius = 1.6; env.ssao_intensity = 2.2
	env.ssr_enabled = true; env.ssr_max_steps = 48
	env.glow_enabled = true; env.glow_intensity = 0.6; env.glow_bloom = 0.06; env.glow_hdr_threshold = 0.9
	env.fog_enabled = true; env.fog_density = 0.0035; env.fog_aerial_perspective = 0.6; env.fog_sky_affect = 0.15
	env.volumetric_fog_enabled = true; env.volumetric_fog_density = 0.012; env.volumetric_fog_anisotropy = 0.6; env.volumetric_fog_length = 80.0
	env.sdfgi_enabled = OS.get_name() == "Windows"
	env.sdfgi_use_occlusion = true
	env.adjustment_enabled = true; env.adjustment_saturation = 1.12; env.adjustment_contrast = 1.05
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90.0
	sun.shadow_blur = 1.5
	sun.light_volumetric_fog_energy = 1.4
	add_child(sun)

func _terrain() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var step := SIZE / RES
	var half := SIZE * 0.5
	for j in RES + 1:
		for i in RES + 1:
			var x := -half + i * step
			var z := -half + j * step
			var h := H(x, z)
			var pd := path_dist(x, z)
			var path := 1.0 - smoothstep(0.8, 2.6, pd)
			var shrine := 1.0 - smoothstep(6.0, 9.0, Vector2(x, z + 44).length())
			var shore := 1.0 - smoothstep(-0.05, 0.45, h)
			st.set_color(Color(maxf(path, shrine * 0.8), shore, 0))
			st.set_uv(Vector2(x, z))
			st.add_vertex(Vector3(x, h, z))
	for j in RES:
		for i in RES:
			var a := j * (RES + 1) + i
			st.add_index(a); st.add_index(a + 1); st.add_index(a + RES + 1)
			st.add_index(a + 1); st.add_index(a + RES + 2); st.add_index(a + RES + 1)
	st.generate_normals()
	var mesh := st.commit()
	var mi := MeshInstance3D.new(); mi.mesh = mesh
	var m := ShaderMaterial.new(); m.shader = load("res://shaders/terrain.gdshader")
	m.set_shader_parameter("noise_tex", noise_tex); m.set_shader_parameter("detail_tex", detail_tex)
	mi.material_override = m
	add_child(mi)
	var body := StaticBody3D.new(); add_child(body)
	var cs := CollisionShape3D.new(); cs.shape = mesh.create_trimesh_shape(); body.add_child(cs)

func _water() -> void:
	var pm := PlaneMesh.new(); pm.size = Vector2(PRX * 2.4, PRZ * 2.4); pm.subdivide_width = 8; pm.subdivide_depth = 8
	var mi := MeshInstance3D.new(); mi.mesh = pm; mi.position = Vector3(0, 0.0, 0)
	var m := ShaderMaterial.new(); m.shader = load("res://shaders/water.gdshader")
	m.set_shader_parameter("n1", _ntex(256, 0.05, 3, true)); m.set_shader_parameter("n2", _ntex(256, 0.09, 2, true))
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	# invisible wall: you can't walk into deep water
	var body := StaticBody3D.new(); add_child(body)
	for k in 48:
		var a := TAU * k / 48.0
		var cs := CollisionShape3D.new(); var cyl := CylinderShape3D.new(); cyl.radius = 1.2; cyl.height = 4.0; cs.shape = cyl
		cs.position = Vector3(cos(a) * (PRX - 1.6), 1.0, sin(a) * (PRZ - 1.4))
		if Vector2(cs.position.x, cs.position.z).distance_to(Vector2(14, 0.5)) < 2.0: continue
		body.add_child(cs)

func _blade_mesh() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var segs := 4
	for s in segs:
		var y0 := float(s) / segs; var y1 := float(s + 1) / segs
		var w0 := 0.05 * (1.0 - y0); var w1 := 0.05 * (1.0 - y1)
		var b0 := y0 * y0 * 0.15; var b1 := y1 * y1 * 0.15
		var v := [Vector3(-w0, y0, b0), Vector3(w0, y0, b0), Vector3(w1, y1, b1), Vector3(-w1, y1, b1)]
		var uv := [Vector2(0, y0), Vector2(1, y0), Vector2(1, y1), Vector2(0, y1)]
		for idx in [0, 1, 2, 0, 2, 3]:
			st.set_uv(uv[idx]); st.set_normal(Vector3.UP); st.add_vertex(v[idx])
	return st.commit()

func _grass() -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true
	mm.mesh = _blade_mesh()
	var pts := []
	var rng := RandomNumberGenerator.new(); rng.seed = 3
	var target := 150000
	var tries := 0
	while pts.size() < target and tries < target * 4:
		tries += 1
		var r := sqrt(rng.randf()) * 44.0
		var a := rng.randf() * TAU
		var x := cos(a) * r; var z := sin(a) * r
		var h := H(x, z)
		if h < 0.3: continue
		if path_dist(x, z) < 1.9 + rng.randf() * 0.8: continue
		if Vector2(x, z + 44).length() < 8.0: continue
		var clump := noise.get_noise_2d(x * 4.0, z * 4.0)
		if clump < -0.35 and rng.randf() < 0.5: continue
		pts.append([x, h, z, clump])
	mm.instance_count = pts.size()
	for i in pts.size():
		var p = pts[i]
		var s: float = rng.randf_range(0.22, 0.5) * (1.0 + p[3] * 0.5)
		var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(1.0, s, 1.0))
		mm.set_instance_transform(i, Transform3D(b, Vector3(p[0], p[1] - 0.02, p[2])))
		var tint := rng.randf_range(0.85, 1.1)
		var au: float = clampf(noise2.get_noise_2d(p[0] * 2.0, p[2] * 2.0) + 0.3, 0.0, 1.0)
		mm.set_instance_color(i, Color(tint * (1.0 + au * 0.5), tint * (1.0 - au * 0.1), tint * (1.0 - au * 0.3)))
	var mi := MultiMeshInstance3D.new(); mi.multimesh = mm
	var m := ShaderMaterial.new(); m.shader = load("res://shaders/grass.gdshader")
	m.set_shader_parameter("wind_noise", noise_tex)
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

func _mat(c: Color, rough := 0.8) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.roughness = rough
	return m

func _mesh(mesh: Mesh, mat: Material, pos: Vector3, parent: Node = self, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = mat
	mi.position = pos; mi.rotation = rot; mi.scale = scl
	parent.add_child(mi)
	return mi

func _collider(pos: Vector3, radius: float, height: float) -> void:
	var b := StaticBody3D.new(); b.position = pos; add_child(b)
	var cs := CollisionShape3D.new(); var c := CylinderShape3D.new(); c.radius = radius; c.height = height; cs.shape = c
	cs.position.y = height * 0.5; b.add_child(cs)

func _free_spot(x: float, z: float, clearance: float) -> bool:
	if path_dist(x, z) < clearance + 1.6: return false
	if pond_e(x, z) < 1.25: return false
	if Vector2(x, z + 44).length() < 9.0: return false
	if Vector2(x, z).distance_to(Vector2(0, -30)) < 4.0 or Vector2(x, z).distance_to(Vector2(0, -37)) < 4.0: return false
	return true

func _trees() -> void:
	var rng := RandomNumberGenerator.new(); rng.seed = 21
	var fol := ShaderMaterial.new(); fol.shader = load("res://shaders/foliage.gdshader"); fol.set_shader_parameter("noise_tex", noise_tex)
	var fol2 := ShaderMaterial.new(); fol2.shader = fol.shader; fol2.set_shader_parameter("noise_tex", noise_tex)
	fol2.set_shader_parameter("col_a", Color(0.95, 0.55, 0.12)); fol2.set_shader_parameter("col_b", Color(0.98, 0.80, 0.25))
	var pine := ShaderMaterial.new(); pine.shader = fol.shader; pine.set_shader_parameter("noise_tex", noise_tex)
	pine.set_shader_parameter("col_a", Color(0.10, 0.25, 0.14)); pine.set_shader_parameter("col_b", Color(0.20, 0.38, 0.18)); pine.set_shader_parameter("lump", 0.25)
	var bark := _mat(Color(0.22, 0.15, 0.11), 0.95)
	var placed := []
	var tries := 0
	while placed.size() < 34 and tries < 600:
		tries += 1
		var r := rng.randf_range(17.0, 40.0); var a := rng.randf() * TAU
		var x := cos(a) * r; var z := sin(a) * r
		if not _free_spot(x, z, 2.5): continue
		var ok := true
		for p in placed:
			if Vector2(x, z).distance_to(p) < 6.5: ok = false; break
		if not ok: continue
		placed.append(Vector2(x, z))
		_maple(Vector3(x, H(x, z), z), rng, fol if rng.randf() < 0.65 else fol2, bark)
	# a ring of pines on the hills
	for k in 70:
		var r := rng.randf_range(46.0, 85.0); var a := rng.randf() * TAU
		var x := cos(a) * r; var z := sin(a) * r
		if not _free_spot(x, z, 1.0): continue
		_pine(Vector3(x, H(x, z), z), rng, pine, bark)

func _maple(p: Vector3, rng: RandomNumberGenerator, fol: Material, bark: Material) -> void:
	var t := Node3D.new(); t.position = p; t.rotation.y = rng.randf() * TAU; add_child(t)
	var s := rng.randf_range(0.9, 1.35); t.scale = Vector3.ONE * s
	var trunk := CylinderMesh.new(); trunk.top_radius = 0.18; trunk.bottom_radius = 0.34; trunk.height = 3.4
	_mesh(trunk, bark, Vector3(0, 1.7, 0), t, Vector3(0, 0, rng.randf_range(-0.12, 0.12)))
	for k in 3:
		var br := CylinderMesh.new(); br.top_radius = 0.05; br.bottom_radius = 0.12; br.height = 2.0
		var ang := TAU * k / 3.0 + rng.randf()
		_mesh(br, bark, Vector3(cos(ang) * 0.6, 3.4, sin(ang) * 0.6), t, Vector3(sin(ang) * 0.7, 0, -cos(ang) * 0.7))
	var blobs := rng.randi_range(5, 7)
	for k in blobs:
		var sm := SphereMesh.new(); sm.radius = 1.0; sm.height = 2.0; sm.radial_segments = 40; sm.rings = 20
		var ang := rng.randf() * TAU; var rr := rng.randf_range(0.4, 1.9)
		var sc := rng.randf_range(1.1, 1.8)
		var mi := _mesh(sm, fol, Vector3(cos(ang) * rr, rng.randf_range(4.0, 5.6), sin(ang) * rr), t, Vector3.ZERO, Vector3(sc, sc * 0.72, sc))
	_collider(p, 0.4 * s, 3.0)

func _pine(p: Vector3, rng: RandomNumberGenerator, mat: Material, bark: Material) -> void:
	var t := Node3D.new(); t.position = p; add_child(t)
	var s := rng.randf_range(1.2, 2.2); t.scale = Vector3.ONE * s
	var trunk := CylinderMesh.new(); trunk.top_radius = 0.12; trunk.bottom_radius = 0.28; trunk.height = 3.0
	_mesh(trunk, bark, Vector3(0, 1.5, 0), t)
	for k in 4:
		var c := CylinderMesh.new(); c.top_radius = 0.0; c.bottom_radius = 2.0 - k * 0.38; c.height = 2.2; c.radial_segments = 14
		_mesh(c, mat, Vector3(0, 2.4 + k * 1.15, 0), t)

func _rocks() -> void:
	var rng := RandomNumberGenerator.new(); rng.seed = 9
	var rock := ShaderMaterial.new(); rock.shader = load("res://shaders/foliage.gdshader"); rock.set_shader_parameter("noise_tex", detail_tex)
	rock.set_shader_parameter("col_a", Color(0.36, 0.35, 0.33)); rock.set_shader_parameter("col_b", Color(0.55, 0.53, 0.49)); rock.set_shader_parameter("lump", 0.35)
	# rocks around the pond rim, partly in the water
	for k in 26:
		var a := TAU * k / 26.0 + rng.randf() * 0.15
		var x := cos(a) * PRX * rng.randf_range(0.98, 1.06); var z := sin(a) * PRZ * rng.randf_range(0.98, 1.06)
		if path_dist(x, z) < 2.4: continue
		if Vector2(x, z).distance_to(Vector2(14, 0.5)) < 2.5: continue
		var sm := SphereMesh.new(); sm.radial_segments = 16; sm.rings = 8
		var sc := rng.randf_range(0.5, 1.2)
		_mesh(sm, rock, Vector3(x, H(x, z) - 0.15, z), self, Vector3(0, rng.randf() * TAU, 0), Vector3(sc * 1.3, sc * 0.7, sc))
	for k in 14:
		var r := rng.randf_range(18.0, 40.0); var a := rng.randf() * TAU
		var x := cos(a) * r; var z := sin(a) * r
		if not _free_spot(x, z, 1.0): continue
		var sm := SphereMesh.new(); sm.radial_segments = 16; sm.rings = 8
		var sc := rng.randf_range(0.6, 1.6)
		_mesh(sm, rock, Vector3(x, H(x, z) - 0.2, z), self, Vector3(0, rng.randf() * TAU, 0), Vector3(sc * 1.4, sc * 0.8, sc))
		_collider(Vector3(x, H(x, z) - 0.2, z), sc * 0.9, sc)

func _lantern(p: Vector3) -> void:
	var stone := _mat(Color(0.58, 0.56, 0.52), 0.95)
	var t := Node3D.new(); t.position = p; add_child(t)
	var c := CylinderMesh.new(); c.top_radius = 0.32; c.bottom_radius = 0.42; c.height = 0.25; c.radial_segments = 6
	_mesh(c, stone, Vector3(0, 0.12, 0), t)
	var post := CylinderMesh.new(); post.top_radius = 0.12; post.bottom_radius = 0.15; post.height = 0.9; post.radial_segments = 8
	_mesh(post, stone, Vector3(0, 0.7, 0), t)
	var plat := CylinderMesh.new(); plat.top_radius = 0.36; plat.bottom_radius = 0.3; plat.height = 0.12; plat.radial_segments = 6
	_mesh(plat, stone, Vector3(0, 1.2, 0), t)
	var box := BoxMesh.new(); box.size = Vector3(0.42, 0.38, 0.42)
	var glow := StandardMaterial3D.new(); glow.albedo_color = Color(1, 0.8, 0.5); glow.emission_enabled = true; glow.emission = Color(1.0, 0.62, 0.28); glow.emission_energy_multiplier = 0.0
	_mesh(box, glow, Vector3(0, 1.45, 0), t)
	for k in 4:
		var bar := BoxMesh.new(); bar.size = Vector3(0.08, 0.4, 0.08)
		_mesh(bar, stone, Vector3(0.2 if k % 2 == 0 else -0.2, 1.45, 0.2 if k < 2 else -0.2), t)
	var roof := CylinderMesh.new(); roof.top_radius = 0.04; roof.bottom_radius = 0.62; roof.height = 0.34; roof.radial_segments = 6
	_mesh(roof, stone, Vector3(0, 1.82, 0), t)
	var tip := SphereMesh.new(); tip.radius = 0.09; tip.height = 0.18
	_mesh(tip, stone, Vector3(0, 2.03, 0), t)
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.66, 0.35); l.omni_range = 7.0; l.light_energy = 0.0; l.shadow_enabled = false
	l.position = Vector3(0, 1.45, 0); t.add_child(l)
	lantern_lights.append(l); lantern_glows.append(glow)
	_collider(p, 0.4, 2.0)

func _lanterns() -> void:
	var spots := [Vector2(3.5, 40), Vector2(-1.5, 30), Vector2(10.5, 21), Vector2(20.5, 10), Vector2(21, -4), Vector2(16, -17), Vector2(6, -24), Vector2(-3, -29), Vector2(3, -29), Vector2(ISLAND.x - 0.6, ISLAND.y - 0.8)]
	for s in spots:
		_lantern(Vector3(s.x, H(s.x, s.y), s.y))

func _torii(p: Vector3, rot: float) -> void:
	var red := _mat(Color(0.72, 0.12, 0.08), 0.55)
	var black := _mat(Color(0.08, 0.07, 0.07), 0.6)
	var t := Node3D.new(); t.position = p; t.rotation.y = rot; add_child(t)
	for sx in [-1.9, 1.9]:
		var pil := CylinderMesh.new(); pil.top_radius = 0.2; pil.bottom_radius = 0.24; pil.height = 4.6
		_mesh(pil, red, Vector3(sx, 2.3, 0), t)
		var foot := CylinderMesh.new(); foot.top_radius = 0.27; foot.bottom_radius = 0.29; foot.height = 0.5
		_mesh(foot, black, Vector3(sx, 0.25, 0), t)
		_collider(p + Vector3(sx, 0, 0).rotated(Vector3.UP, rot), 0.3, 4.5)
	var nuki := BoxMesh.new(); nuki.size = Vector3(4.8, 0.3, 0.22)
	_mesh(nuki, red, Vector3(0, 3.6, 0), t)
	var kasa := BoxMesh.new(); kasa.size = Vector3(5.8, 0.34, 0.5)
	_mesh(kasa, red, Vector3(0, 4.55, 0), t)
	var top := BoxMesh.new(); top.size = Vector3(6.4, 0.22, 0.62)
	_mesh(top, black, Vector3(0, 4.82, 0), t)
	for sx in [-3.05, 3.05]:
		var curl := BoxMesh.new(); curl.size = Vector3(0.7, 0.22, 0.62)
		_mesh(curl, black, Vector3(sx, 4.95, 0), t, Vector3(0, 0, 0.35 if sx > 0 else -0.35))
	var plaque := BoxMesh.new(); plaque.size = Vector3(0.5, 0.7, 0.1)
	_mesh(plaque, black, Vector3(0, 4.1, 0.12), t)

func _shrine(p: Vector3) -> void:
	var wood := _mat(Color(0.30, 0.18, 0.12), 0.8)
	var white := _mat(Color(0.92, 0.89, 0.82), 0.9)
	var roofm := _mat(Color(0.16, 0.18, 0.22), 0.6)
	var stone := _mat(Color(0.55, 0.53, 0.49), 0.95)
	var t := Node3D.new(); t.position = p; add_child(t)
	var base := BoxMesh.new(); base.size = Vector3(8.5, 0.7, 7.0)
	_mesh(base, stone, Vector3(0, 0.35, 0), t)
	var floor := BoxMesh.new(); floor.size = Vector3(7.0, 0.25, 5.6)
	_mesh(floor, wood, Vector3(0, 0.85, 0), t)
	var walls := BoxMesh.new(); walls.size = Vector3(5.6, 2.6, 4.2)
	_mesh(walls, white, Vector3(0, 2.25, -0.2), t)
	for sx in [-3.2, -1.1, 1.1, 3.2]:
		var post := BoxMesh.new(); post.size = Vector3(0.24, 3.0, 0.24)
		_mesh(post, wood, Vector3(sx, 2.4, 2.4), t)
	var roof := PrismMesh.new(); roof.size = Vector3(9.2, 2.4, 7.6)
	_mesh(roof, roofm, Vector3(0, 4.9, 0), t, Vector3(0, PI * 0.5, 0), Vector3(7.6 / 9.2, 1, 9.2 / 7.6))
	var beam := BoxMesh.new(); beam.size = Vector3(7.6, 0.3, 0.3)
	_mesh(beam, wood, Vector3(0, 3.8, 2.4), t)
	var steps := BoxMesh.new(); steps.size = Vector3(2.4, 0.35, 1.2)
	_mesh(steps, stone, Vector3(0, 0.17, 3.9), t)
	var bs := StaticBody3D.new(); bs.position = p; add_child(bs)
	var cs := CollisionShape3D.new(); var bx := BoxShape3D.new(); bx.size = Vector3(5.6, 4.0, 4.2); cs.shape = bx; cs.position = Vector3(0, 2.5, -0.2); bs.add_child(cs)
	var cs2 := CollisionShape3D.new(); var bx2 := BoxShape3D.new(); bx2.size = Vector3(8.5, 1.0, 7.0); cs2.shape = bx2; cs2.position = Vector3(0, 0.45, 0); bs.add_child(cs2)

func _bridge() -> void:
	var red := _mat(Color(0.70, 0.14, 0.09), 0.5)
	var wood := _mat(Color(0.38, 0.26, 0.18), 0.85)
	var a := Vector3(10.0, 0, 0.5); var b := Vector3(16.8, 0, 0.5)
	var n := 16
	var body := StaticBody3D.new(); add_child(body)
	for i in n:
		var t := (i + 0.5) / n
		var x := lerpf(a.x, b.x, t)
		var y := lerpf(H(a.x, 0.5) if false else 0.55, H(b.x, 0.5), t) + sin(t * PI) * 1.1
		var plank := BoxMesh.new(); plank.size = Vector3((b.x - a.x) / n * 0.92, 0.1, 1.9)
		var slope := cos(t * PI) * 1.1 * PI / (b.x - a.x)
		_mesh(plank, wood, Vector3(x, y, 0.5), self, Vector3(0, 0, atan(slope)))
		var cs := CollisionShape3D.new(); var bx := BoxShape3D.new(); bx.size = Vector3((b.x - a.x) / n, 0.2, 1.9); cs.shape = bx
		cs.position = Vector3(x, y, 0.5); cs.rotation = Vector3(0, 0, atan(slope)); body.add_child(cs)
		if i % 3 == 0 or i == n - 1:
			for sz in [-0.45, 1.45]:
				var post := CylinderMesh.new(); post.top_radius = 0.05; post.bottom_radius = 0.06; post.height = 0.8
				_mesh(post, red, Vector3(x, y + 0.4, sz), self)
	for sz in [-0.45, 1.45]:
		for i in n:
			var t0 := float(i) / n; var t1 := float(i + 1) / n
			var y0 := lerpf(0.55, H(b.x, 0.5), t0) + sin(t0 * PI) * 1.1 + 0.82
			var y1 := lerpf(0.55, H(b.x, 0.5), t1) + sin(t1 * PI) * 1.1 + 0.82
			var x0 := lerpf(a.x, b.x, t0); var x1 := lerpf(a.x, b.x, t1)
			var rail := BoxMesh.new(); rail.size = Vector3(Vector2(x1 - x0, y1 - y0).length(), 0.07, 0.09)
			_mesh(rail, red, Vector3((x0 + x1) * 0.5, (y0 + y1) * 0.5, sz), self, Vector3(0, 0, atan2(y1 - y0, x1 - x0)))
	# rails block falling off
	for sz in [-0.55, 1.55]:
		var cs := CollisionShape3D.new(); var bx := BoxShape3D.new(); bx.size = Vector3(b.x - a.x, 2.4, 0.1); cs.shape = bx; cs.position = Vector3((a.x + b.x) * 0.5, 1.5, sz); body.add_child(cs)

func _stepping_stones() -> void:
	var stone := _mat(Color(0.34, 0.33, 0.31), 0.9)
	var rng := RandomNumberGenerator.new(); rng.seed = 5
	var d := 0.0
	var total := 0.0
	for i in PATH_PTS.size() - 1: total += (PATH_PTS[i] as Vector2).distance_to(PATH_PTS[i + 1])
	d = 1.0
	while d < total:
		var acc := 0.0
		for i in PATH_PTS.size() - 1:
			var a: Vector2 = PATH_PTS[i]; var b: Vector2 = PATH_PTS[i + 1]
			var L := a.distance_to(b)
			if acc + L >= d:
				var p := a.lerp(b, (d - acc) / L)
				var side := Vector2(-(b - a).y, (b - a).x).normalized() * rng.randf_range(-0.3, 0.3)
				p += side
				var c := CylinderMesh.new(); c.top_radius = rng.randf_range(0.3, 0.42); c.bottom_radius = c.top_radius + 0.05; c.height = 0.14; c.radial_segments = 7
				_mesh(c, stone, Vector3(p.x, H(p.x, p.y) + 0.03, p.y), self, Vector3(0, rng.randf() * TAU, 0))
				break
			acc += L
		d += rng.randf_range(1.0, 1.25)

func _koi_mesh() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var body := SphereMesh.new(); body.radius = 0.5; body.height = 1.0; body.radial_segments = 16; body.rings = 10
	st.append_from(body, 0, Transform3D(Basis.from_scale(Vector3(0.17, 0.13, 0.46)), Vector3.ZERO))
	var tail := PrismMesh.new(); tail.size = Vector3(0.3, 0.26, 0.02)
	st.append_from(tail, 0, Transform3D(Basis(Vector3.RIGHT, -PI * 0.5), Vector3(0, 0, -0.32)))
	var fin := PrismMesh.new(); fin.size = Vector3(0.18, 0.1, 0.01)
	st.append_from(fin, 0, Transform3D(Basis(Vector3.UP, PI * 0.5), Vector3(0, 0.07, -0.02)))
	return st.commit()

func _koi_school() -> void:
	var mesh := _koi_mesh()
	var sh := load("res://shaders/koi.gdshader")
	var rng := RandomNumberGenerator.new(); rng.seed = 4
	var palettes := [[Color(0.97, 0.95, 0.9), Color(0.92, 0.3, 0.06)], [Color(0.98, 0.6, 0.15), Color(0.98, 0.85, 0.5)], [Color(0.96, 0.94, 0.9), Color(0.1, 0.1, 0.11)], [Color(0.95, 0.85, 0.45), Color(0.98, 0.65, 0.1)], [Color(0.9, 0.2, 0.08), Color(0.96, 0.95, 0.92)]]
	for k in 11:
		var m := ShaderMaterial.new(); m.shader = sh
		var pal = palettes[k % palettes.size()]
		m.set_shader_parameter("body", pal[0]); m.set_shader_parameter("spot", pal[1]); m.set_shader_parameter("seed", rng.randf())
		m.set_shader_parameter("noise_tex", noise_tex)
		var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = m
		var s := rng.randf_range(1.6, 2.3); mi.scale = Vector3.ONE * s
		add_child(mi)
		koi.append({"n": mi, "a": rng.randf() * TAU, "r": rng.randf_range(0.3, 0.72), "sp": rng.randf_range(0.12, 0.25) * (1 if rng.randf() < 0.5 else -1), "y": rng.randf_range(-0.38, -0.18), "ph": rng.randf() * 10.0, "m": m})

func _player() -> void:
	player = CharacterBody3D.new()
	player.set_script(load("res://player.gd"))
	player.position = Vector3(1.5, H(1.5, 36) + 0.5, 36)
	add_child(player)
	cam_pivot = Node3D.new(); add_child(cam_pivot)
	cam_arm = SpringArm3D.new(); cam_arm.spring_length = 6.5; cam_arm.margin = 0.3
	var sph := SphereShape3D.new(); sph.radius = 0.3; cam_arm.shape = sph
	cam_arm.add_excluded_object(player.get_rid())
	cam_pivot.add_child(cam_arm)
	camera = Camera3D.new(); camera.fov = 58.0; camera.far = 600.0
	cam_arm.add_child(camera)
	cam_pivot.rotation = Vector3(-0.32, PI, 0)
	player.set("cam_pivot", cam_pivot)

func _sensei() -> void:
	sensei = Node3D.new(); add_child(sensei)
	var gm := ShaderMaterial.new(); gm.shader = load("res://shaders/ghost.gdshader")
	var robe := CylinderMesh.new(); robe.top_radius = 0.22; robe.bottom_radius = 0.55; robe.height = 1.4; robe.radial_segments = 20
	_mesh(robe, gm, Vector3(0, 0.7, 0), sensei)
	var head := SphereMesh.new(); head.radius = 0.26; head.height = 0.52
	_mesh(head, gm, Vector3(0, 1.62, 0), sensei)
	var hat := CylinderMesh.new(); hat.top_radius = 0.02; hat.bottom_radius = 0.55; hat.height = 0.28; hat.radial_segments = 24
	_mesh(hat, gm, Vector3(0, 1.92, 0), sensei)
	var gl := OmniLight3D.new(); gl.light_color = Color(0.6, 0.85, 1.0); gl.light_energy = 0.8; gl.omni_range = 4.0; gl.position.y = 1.2; sensei.add_child(gl)
	whisper = Label3D.new(); whisper.billboard = BaseMaterial3D.BILLBOARD_ENABLED; whisper.font_size = 42; whisper.outline_size = 10
	whisper.modulate = Color(1, 0.97, 0.9, 0); whisper.position = Vector3(0, 2.7, 0); whisper.width = 900; whisper.autowrap_mode = TextServer.AUTOWRAP_WORD
	whisper.pixel_size = 0.0045
	whisper.text = "Hm. So the student came after all.\nThe koi have been waiting. So have I."
	sensei.add_child(whisper)

func _particles() -> void:
	var leaves := GPUParticles3D.new(); leaves.amount = 260; leaves.lifetime = 14.0; leaves.preprocess = 14.0
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX; pm.emission_box_extents = Vector3(40, 1, 40)
	pm.gravity = Vector3(0.25, -0.55, 0.1); pm.initial_velocity_min = 0.1; pm.initial_velocity_max = 0.4
	pm.angular_velocity_min = -120; pm.angular_velocity_max = 120; pm.turbulence_enabled = true; pm.turbulence_noise_strength = 1.4
	pm.scale_min = 0.6; pm.scale_max = 1.2
	pm.color = Color(1, 1, 1)
	leaves.process_material = pm
	var q := QuadMesh.new(); q.size = Vector2(0.14, 0.12)
	var lm := StandardMaterial3D.new(); lm.albedo_color = Color(0.9, 0.32, 0.1); lm.cull_mode = BaseMaterial3D.CULL_DISABLED; lm.roughness = 0.8
	q.material = lm; leaves.draw_pass_1 = q
	leaves.position = Vector3(0, 14, 0); leaves.visibility_aabb = AABB(Vector3(-50, -20, -50), Vector3(100, 40, 100))
	add_child(leaves)
	fireflies = GPUParticles3D.new(); fireflies.amount = 120; fireflies.lifetime = 6.0; fireflies.preprocess = 6.0
	var fm := ParticleProcessMaterial.new(); fm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX; fm.emission_box_extents = Vector3(22, 1.2, 18)
	fm.gravity = Vector3.ZERO; fm.turbulence_enabled = true; fm.turbulence_noise_strength = 2.0; fm.turbulence_noise_scale = 3.0
	fireflies.process_material = fm
	var fq := SphereMesh.new(); fq.radius = 0.035; fq.height = 0.07
	var fmat := StandardMaterial3D.new(); fmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; fmat.albedo_color = Color(0.9, 1.0, 0.5); fmat.emission_enabled = true; fmat.emission = Color(0.8, 1.0, 0.4); fmat.emission_energy_multiplier = 6.0
	fq.material = fmat; fireflies.draw_pass_1 = fq
	fireflies.position = Vector3(0, 1.6, 0); add_child(fireflies)

func _hud() -> void:
	var cl := CanvasLayer.new(); add_child(cl)
	hud = Label.new(); hud.position = Vector2(24, 20)
	hud.add_theme_font_size_override("font_size", 17)
	hud.add_theme_color_override("font_color", Color(1, 0.97, 0.9, 0.85))
	hud.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6)); hud.add_theme_constant_override("outline_size", 6)
	hud.text = "Sensei Hakuun · Godot test\nWASD / left stick: walk   Shift: run   Space: jump   Mouse / right stick: camera\nT: time of day   F: toggle quality   Esc: free the mouse"
	if shot_path == "": cl.add_child(hud)

# ---------------- time of day ----------------
const TODS := [
	# name, sun pitch, sun yaw, sun color, energy, sky top, sky horizon, ground, fog color, lantern
	["Morning", -18.0, -60.0, Color(1.0, 0.82, 0.62), 1.5, Color(0.36, 0.55, 0.85), Color(0.95, 0.78, 0.62), Color(0.25, 0.22, 0.2), Color(0.92, 0.82, 0.72), 0.0],
	["Midday", -55.0, -35.0, Color(1.0, 0.95, 0.86), 1.8, Color(0.28, 0.5, 0.9), Color(0.72, 0.82, 0.92), Color(0.3, 0.28, 0.24), Color(0.75, 0.83, 0.92), 0.0],
	["Dusk", -6.0, 115.0, Color(1.0, 0.5, 0.25), 1.2, Color(0.16, 0.17, 0.38), Color(0.98, 0.5, 0.28), Color(0.2, 0.15, 0.14), Color(0.95, 0.6, 0.45), 1.0],
	["Night", -40.0, 150.0, Color(0.55, 0.66, 1.0), 0.35, Color(0.02, 0.03, 0.08), Color(0.08, 0.1, 0.2), Color(0.03, 0.03, 0.05), Color(0.08, 0.1, 0.18), 2.6],
]

func _apply_tod(i: int, instant := false) -> void:
	var T = TODS[i % TODS.size()]
	if instant:
		sun.rotation_degrees = Vector3(T[1], T[2], 0); sun.light_color = T[3]; sun.light_energy = T[4]
		sky_mat.set_shader_parameter("top", T[5]); sky_mat.set_shader_parameter("horizon", T[6]); sky_mat.set_shader_parameter("ground", T[7])
		sky_mat.set_shader_parameter("cloud_col", (T[3] as Color).lerp(Color.WHITE, 0.5) * (0.25 if i % TODS.size() == 3 else 1.0)); sky_mat.set_shader_parameter("stars", 1.0 if i % TODS.size() == 3 else 0.0)
		env.fog_light_color = T[8]; env.volumetric_fog_albedo = T[8]
		for l in lantern_lights: l.light_energy = T[9] * 1.4
		for g in lantern_glows: g.emission_energy_multiplier = T[9] * 2.5 + 0.2
		if fireflies: fireflies.emitting = i >= 2
		return
	var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_SINE)
	var d: float = 2.5
	tw.tween_property(sun, "rotation_degrees", Vector3(T[1], T[2], 0), d)
	tw.tween_property(sun, "light_color", T[3], d)
	tw.tween_property(sun, "light_energy", T[4], d)
	tw.tween_property(sky_mat, "shader_parameter/top", T[5], d)
	tw.tween_property(sky_mat, "shader_parameter/horizon", T[6], d)
	tw.tween_property(sky_mat, "shader_parameter/ground", T[7], d)
	tw.tween_property(sky_mat, "shader_parameter/cloud_col", (T[3] as Color).lerp(Color.WHITE, 0.5) * (0.25 if i % TODS.size() == 3 else 1.0), d)
	tw.tween_property(sky_mat, "shader_parameter/stars", 1.0 if i % TODS.size() == 3 else 0.0, d)
	tw.tween_property(env, "fog_light_color", T[8], d)
	tw.tween_property(env, "volumetric_fog_albedo", T[8], d)
	for l in lantern_lights: tw.tween_property(l, "light_energy", T[9] * 1.4, d)
	for g in lantern_glows: tw.tween_property(g, "emission_energy_multiplier", T[9] * 2.5 + 0.2, d)
	if fireflies: fireflies.emitting = i >= 2

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo:
		if e.keycode == KEY_T:
			tod = (tod + 1) % TODS.size(); _apply_tod(tod)
		elif e.keycode == KEY_F:
			env.sdfgi_enabled = not env.sdfgi_enabled; env.volumetric_fog_enabled = env.sdfgi_enabled
		elif e.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if e is InputEventMouseButton and e.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		cam_pivot.rotation.y -= e.relative.x * 0.004
		cam_pivot.rotation.x = clampf(cam_pivot.rotation.x - e.relative.y * 0.003, -1.2, 0.35)

# ---------------- per frame ----------------
func _process(dt: float) -> void:
	var t := Time.get_ticks_msec() / 1000.0
	# camera follows the player
	var rs := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	var jx := Input.get_joy_axis(0, JOY_AXIS_RIGHT_X); var jy := Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y)
	if absf(jx) > 0.15: cam_pivot.rotation.y -= jx * dt * 2.6
	if absf(jy) > 0.15: cam_pivot.rotation.x = clampf(cam_pivot.rotation.x - jy * dt * 1.8, -1.2, 0.35)
	cam_pivot.global_position = cam_pivot.global_position.lerp(player.global_position + Vector3(0, 1.4, 0), minf(1.0, dt * 10.0))
	# koi swim lazy loops, gathering when the player stands at the shore
	var pp := player.global_position
	var near_pond := pond_e(pp.x, pp.z) < 1.6
	for k in koi:
		k.a += k.sp * dt
		var rx: float = PRX * k.r * (0.9 + 0.1 * sin(t * 0.2 + k.ph)); var rz: float = PRZ * k.r * (0.9 + 0.1 * cos(t * 0.17 + k.ph))
		var target: Vector3 = Vector3(cos(k.a) * rx, k.y + sin(t * 0.7 + k.ph) * 0.05, sin(k.a) * rz)
		if Vector2(target.x - ISLAND.x, target.z - ISLAND.y).length() < 3.6:
			var dir: Vector2 = Vector2(target.x - ISLAND.x, target.z - ISLAND.y).normalized() * 3.6
			target.x = ISLAND.x + dir.x; target.z = ISLAND.y + dir.y
		if near_pond:
			var shore: Vector3 = Vector3(pp.x, k.y, pp.z) * 0.85
			target = target.lerp(shore + Vector3(sin(k.ph) * 1.2, 0, cos(k.ph) * 1.2), 0.6)
		var n: Node3D = k.n
		var prev := n.position
		n.position = n.position.lerp(target, minf(1.0, dt * 1.5))
		var v := n.position - prev
		if v.length() > 0.0005:
			var look := n.position + Vector3(v.x, 0, v.z).normalized()
			n.look_at(look, Vector3.UP, true)
		(k.m as ShaderMaterial).set_shader_parameter("speed", clampf(v.length() / dt * 1.2, 0.4, 2.2))
	# Sensei floats over his island and turns to you
	var sp := Vector3(ISLAND.x + 0.8, 0.9 + sin(t * 1.1) * 0.12, ISLAND.y + 0.6)
	sensei.position = sp
	var to := pp - sp; to.y = 0
	if to.length() > 0.1: sensei.rotation.y = lerp_angle(sensei.rotation.y, atan2(to.x, to.z), dt * 2.0)
	var near := pp.distance_to(sp) < 9.0
	whisper.modulate.a = move_toward(whisper.modulate.a, 1.0 if near else 0.0, dt * 1.2)
	# headless screenshot mode
	if shot_path != "":
		if cam_override.size() >= 6:
			camera.top_level = true
			camera.global_position = Vector3(cam_override[0], cam_override[1], cam_override[2])
			camera.look_at(Vector3(cam_override[3], cam_override[4], cam_override[5]))
		frame += 1
		if frame == shot_frames:
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(shot_path)
			get_tree().quit()
