shader_type spatial;
render_mode diffuse_burley;
uniform vec3 col_a : source_color = vec3(0.78, 0.18, 0.10);
uniform vec3 col_b : source_color = vec3(0.95, 0.52, 0.12);
uniform sampler2D noise_tex : repeat_enable, filter_linear;
uniform float lump = 0.32;
varying vec3 opos;
varying vec3 wp;
varying float ny;
void vertex(){
  opos = VERTEX; ny = NORMAL.y;
  vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
  float n = texture(noise_tex, normalize(VERTEX).xz * 0.25 + normalize(VERTEX).y * 0.13 + NODE_POSITION_WORLD.xz * 0.05).r;
  VERTEX += NORMAL * (n - 0.5) * lump;
  float sway = sin(TIME * 1.2 + w.x * 0.3 + w.z * 0.2) * 0.05 * max(VERTEX.y, 0.0);
  VERTEX.x += sway;
  wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment(){
  float n = (texture(noise_tex, wp.xz * 0.11).r + texture(noise_tex, wp.xy * 0.11 + 0.5).r) * 0.5;
  float fine = (texture(noise_tex, wp.xz * 0.8).r + texture(noise_tex, wp.xy * 0.8 + 0.37).r + texture(noise_tex, wp.zy * 0.8 + 0.71).r) / 3.0;
  vec3 c = mix(col_a, col_b, smoothstep(0.35, 0.7, n));
  c *= 0.7 + 0.6 * fine;
  c *= mix(0.55, 1.05, smoothstep(-0.6, 0.7, ny));
  ALBEDO = c;
  ROUGHNESS = 0.85;
  BACKLIGHT = ALBEDO * 0.6;
}
