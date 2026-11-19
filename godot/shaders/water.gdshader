shader_type spatial;
render_mode cull_back, depth_draw_always, specular_schlick_ggx;
uniform sampler2D DEPTH_TEXTURE : hint_depth_texture, filter_linear_mipmap;
uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_linear_mipmap;
uniform sampler2D n1 : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D n2 : hint_normal, repeat_enable, filter_linear_mipmap;
uniform vec3 shallow : source_color = vec3(0.55, 0.72, 0.62);
uniform vec3 deep : source_color = vec3(0.02, 0.09, 0.10);
uniform float clarity = 2.6;
varying vec3 wpos;
void vertex(){ wpos = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz; }
void fragment(){
  vec3 na = texture(n1, wpos.xz * 0.09 + TIME * vec2(0.012, 0.008)).rgb;
  vec3 nb = texture(n2, wpos.xz * 0.17 - TIME * vec2(0.010, 0.016)).rgb;
  vec3 nm = normalize(mix(na, nb, 0.5) * 2.0 - 1.0);
  NORMAL_MAP = mix(na, nb, 0.5);
  NORMAL_MAP_DEPTH = 0.55;
  float z = texture(DEPTH_TEXTURE, SCREEN_UV).r;
  vec4 v = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, z, 1.0); v.xyz /= v.w;
  float depth = max(VERTEX.z - v.z, 0.0);
  vec2 off = nm.xy * 0.035 * smoothstep(0.0, 1.0, depth);
  float z2 = texture(DEPTH_TEXTURE, SCREEN_UV + off).r;
  vec4 v2 = INV_PROJECTION_MATRIX * vec4((SCREEN_UV + off) * 2.0 - 1.0, z2, 1.0); v2.xyz /= v2.w;
  if (VERTEX.z - v2.z < 0.0) off = vec2(0.0);
  vec3 refr = texture(SCREEN_TEXTURE, SCREEN_UV + off).rgb;
  float t = 1.0 - exp(-depth / clarity);
  vec3 col = mix(refr * shallow, deep, t);
  float foam = (1.0 - smoothstep(0.0, 0.08, depth)) * (0.5 + 0.5 * sin(TIME * 1.3 + wpos.x * 2.0 + wpos.z * 1.7)) * 0.4;
  float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
  ALBEDO = vec3(0.0);
  EMISSION = col * (1.0 - fres * 0.75) + vec3(foam * 0.3);
  ROUGHNESS = 0.04;
  METALLIC = 0.0;
  SPECULAR = 0.65;
}
