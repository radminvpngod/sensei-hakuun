extends CharacterBody3D
## The student: a small robed figure with a red scarf. Third-person, keyboard + gamepad.

var cam_pivot: Node3D
var model: Node3D
var walk_t := 0.0
const WALK := 3.6
const RUN := 6.8
const JUMP := 5.2
const GRAV := 15.0

func _ready() -> void:
	var cs := CollisionShape3D.new(); var cap := CapsuleShape3D.new(); cap.radius = 0.32; cap.height = 1.3
	cs.shape = cap; cs.position.y = 0.65; add_child(cs)
	floor_snap_length = 0.4; floor_max_angle = deg_to_rad(50)
	model = Node3D.new(); add_child(model)
	var robe_m := StandardMaterial3D.new(); robe_m.albedo_color = Color(0.13, 0.2, 0.34); robe_m.roughness = 0.75
	var skin_m := StandardMaterial3D.new(); skin_m.albedo_color = Color(0.2, 0.26, 0.4); skin_m.roughness = 0.6
	var scarf_m := StandardMaterial3D.new(); scarf_m.albedo_color = Color(0.85, 0.16, 0.1); scarf_m.roughness = 0.7
	var robe := CylinderMesh.new(); robe.top_radius = 0.16; robe.bottom_radius = 0.34; robe.height = 0.85; robe.radial_segments = 20
	_add(robe, robe_m, Vector3(0, 0.43, 0))
	var head := SphereMesh.new(); head.radius = 0.22; head.height = 0.44
	_add(head, skin_m, Vector3(0, 1.05, 0))
	var scarf := TorusMesh.new(); scarf.inner_radius = 0.1; scarf.outer_radius = 0.2
	_add(scarf, scarf_m, Vector3(0, 0.84, 0))
	var tail := BoxMesh.new(); tail.size = Vector3(0.08, 0.36, 0.03)
	_add(tail, scarf_m, Vector3(0.06, 0.68, -0.18), Vector3(0.3, 0, 0.1))
	var eye_m := StandardMaterial3D.new(); eye_m.albedo_color = Color(0.95, 0.95, 0.9); eye_m.emission_enabled = true; eye_m.emission = Color(0.9, 0.95, 1.0); eye_m.emission_energy_multiplier = 0.6
	for sx in [-0.08, 0.08]:
		var eye := SphereMesh.new(); eye.radius = 0.035; eye.height = 0.07
		_add(eye, eye_m, Vector3(sx, 1.08, 0.19))

func _add(m: Mesh, mat: Material, p: Vector3, r := Vector3.ZERO) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = m; mi.material_override = mat; mi.position = p; mi.rotation = r; model.add_child(mi)

func _physics_process(dt: float) -> void:
	var inp := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W): inp.y -= 1
	if Input.is_physical_key_pressed(KEY_S): inp.y += 1
	if Input.is_physical_key_pressed(KEY_A): inp.x -= 1
	if Input.is_physical_key_pressed(KEY_D): inp.x += 1
	var joy := Vector2(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(0, JOY_AXIS_LEFT_Y))
	if joy.length() > 0.2: inp = joy
	inp = inp.limit_length(1.0)
	var running := Input.is_physical_key_pressed(KEY_SHIFT) or Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT) > 0.4
	var yaw := cam_pivot.rotation.y if cam_pivot else 0.0
	var dir := Vector3(inp.x, 0, inp.y).rotated(Vector3.UP, yaw)
	var spd := RUN if running else WALK
	velocity.x = move_toward(velocity.x, dir.x * spd, dt * 30.0)
	velocity.z = move_toward(velocity.z, dir.z * spd, dt * 30.0)
	if is_on_floor():
		if Input.is_physical_key_pressed(KEY_SPACE) or Input.is_joy_button_pressed(0, JOY_BUTTON_A): velocity.y = JUMP
	else:
		velocity.y -= GRAV * dt
	move_and_slide()
	var hv := Vector2(velocity.x, velocity.z)
	if hv.length() > 0.3:
		model.rotation.y = lerp_angle(model.rotation.y, atan2(velocity.x, velocity.z), dt * 12.0)
		walk_t += dt * hv.length() * 2.6
	else:
		walk_t = lerpf(walk_t, roundf(walk_t / PI) * PI, dt * 8.0)
	model.position.y = absf(sin(walk_t)) * 0.07
	model.rotation.x = lerpf(model.rotation.x, clampf(hv.length() * 0.03, 0.0, 0.2), dt * 8.0)
	model.rotation.z = sin(walk_t) * 0.05
	if global_position.y < -6.0: global_position = Vector3(1.5, 3.0, 36)
