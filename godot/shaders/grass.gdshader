shader_type spatial;
render_mode cull_disabled, diffuse_burley;
uniform vec3 base : source_color = vec3(0.07, 0.15, 0.03);
uniform vec3 tip : source_color = vec3(0.40, 0.52, 0.14);
uniform sampler2D wind_noise : repeat_enable, filter_linear;
varying float h;
void vertex(){
  h = UV.y;
  vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
  float gust = texture(wind_noise, w.xz * 0.02 + TIME * vec2(0.05, 0.03)).r;
  float sway = (sin(TIME * 1.7 + w.x * 0.6 + w.z * 0.4) * 0.12 + (gust - 0.4) * 0.55) * h * h;
  VERTEX.x += sway; VERTEX.z += sway * 0.6;
  NORMAL = vec3(0.0, 1.0, 0.0);
}
void fragment(){
  vec3 c = mix(base, tip, h) * COLOR.rgb;
  ALBEDO = c;
  ROUGHNESS = 0.8;
  SPECULAR = 0.2;
  BACKLIGHT = vec3(0.35, 0.4, 0.15) * h;
  AO = mix(0.35, 1.0, h); AO_LIGHT_AFFECT = 0.6;
}
