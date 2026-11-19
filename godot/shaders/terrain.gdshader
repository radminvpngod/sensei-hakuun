shader_type spatial;
render_mode diffuse_burley;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform sampler2D detail_tex : repeat_enable, filter_linear_mipmap;
uniform vec3 grass_a : source_color = vec3(0.09, 0.17, 0.04);
uniform vec3 grass_b : source_color = vec3(0.19, 0.26, 0.06);
uniform vec3 autumn : source_color = vec3(0.42, 0.28, 0.08);
uniform vec3 dirt : source_color = vec3(0.24, 0.19, 0.13);
uniform vec3 gravel : source_color = vec3(0.36, 0.33, 0.28);
uniform vec3 rock : source_color = vec3(0.42, 0.41, 0.39);
uniform vec3 mud : source_color = vec3(0.24, 0.21, 0.16);
varying vec3 wpos;
varying vec3 wnrm;
void vertex(){ wpos = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz; wnrm = normalize((MODEL_MATRIX * vec4(NORMAL,0.0)).xyz); }
void fragment(){
  float n1 = texture(noise_tex, wpos.xz * 0.012).r;
  float n2 = texture(noise_tex, wpos.xz * 0.07).r;
  float d = texture(detail_tex, wpos.xz * 0.45).r;
  vec3 g = mix(grass_a, grass_b, smoothstep(0.35, 0.7, n1));
  g = mix(g, autumn, smoothstep(0.55, 0.8, n2) * 0.45);
  g *= 0.85 + d * 0.3;
  float path = COLOR.r; float shore = COLOR.g;
  float edge = smoothstep(0.35, 0.65, path + (n2 - 0.5) * 0.35);
  vec3 p = mix(dirt, gravel, smoothstep(0.55, 0.95, path)) * (0.8 + d * 0.4);
  vec3 c = mix(g, p, edge);
  float slope = 1.0 - wnrm.y;
  c = mix(c, rock * (0.8 + d * 0.4), smoothstep(0.28, 0.45, slope + (n2 - 0.5) * 0.1));
  c = mix(c, mud * (0.8 + d * 0.3), smoothstep(0.3, 0.8, shore));
  ALBEDO = c * 0.8;
  ROUGHNESS = mix(0.95, 0.55, smoothstep(0.5, 1.0, shore));
  SPECULAR = 0.25;
}
