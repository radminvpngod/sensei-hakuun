shader_type spatial;
uniform vec3 body : source_color = vec3(0.97, 0.95, 0.9);
uniform vec3 spot : source_color = vec3(0.92, 0.35, 0.08);
uniform vec3 spot2 : source_color = vec3(0.08, 0.08, 0.09);
uniform float seed = 0.0;
uniform float speed = 1.0;
uniform sampler2D noise_tex : repeat_enable, filter_linear;
varying vec3 opos;
void vertex(){
  opos = VERTEX;
  float back = max(-VERTEX.z, 0.0);
  VERTEX.x += sin(TIME * 6.0 * speed + VERTEX.z * 5.0 + seed * 10.0) * 0.06 * back * back * 4.0;
}
void fragment(){
  float n = texture(noise_tex, opos.xz * 1.6 + vec2(seed, seed * 1.7)).r;
  float n2 = texture(noise_tex, opos.zy * 2.1 + vec2(seed * 2.3, 0.4)).r;
  vec3 c = mix(body, spot, smoothstep(0.48, 0.55, n));
  c = mix(c, spot2, smoothstep(0.62, 0.68, n2) * step(0.5, fract(seed * 7.13)));
  ALBEDO = c;
  ROUGHNESS = 0.3;
  SPECULAR = 0.7;
  RIM = 0.4; RIM_TINT = 0.5;
}
