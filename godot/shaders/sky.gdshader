shader_type sky;
uniform vec3 top : source_color = vec3(0.28, 0.5, 0.9);
uniform vec3 horizon : source_color = vec3(0.72, 0.82, 0.92);
uniform vec3 ground : source_color = vec3(0.3, 0.28, 0.24);
uniform vec3 cloud_col : source_color = vec3(1.0, 1.0, 1.0);
uniform float stars = 0.0;
uniform sampler2D cloud_noise : repeat_enable, filter_linear_mipmap;
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++){ v += texture(cloud_noise, p).r * a; p *= 2.03; a *= 0.5; } return v; }
void sky(){
  vec3 d = EYEDIR;
  float h = d.y;
  vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55));
  c = mix(c, ground, smoothstep(0.0, -0.08, h));
  // sun
  float sd = distance(d, LIGHT0_DIRECTION);
  c += LIGHT0_COLOR * LIGHT0_ENERGY * (smoothstep(0.035, 0.025, sd) * 4.0 + pow(max(0.0, 1.0 - sd), 8.0) * 0.35);
  if (h > 0.0 && !AT_CUBEMAP_PASS) {
    vec2 uv = d.xz / (h + 0.18) * 0.35 + TIME * vec2(0.002, 0.001);
    float n = fbm(uv);
    float cl = smoothstep(0.48, 0.72, n) * smoothstep(0.0, 0.2, h);
    float lit = 0.75 + 0.35 * fbm(uv + LIGHT0_DIRECTION.xz * 0.02);
    vec3 cc = cloud_col * lit + LIGHT0_COLOR * pow(max(0.0, 1.0 - sd), 4.0) * 0.4;
    c = mix(c, cc, cl * 0.85);
  }
  if (stars > 0.0 && h > 0.0) {
    vec2 g = floor(d.xz / (h + 0.3) * 260.0);
    float r = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
    c += vec3(step(0.996, r) * stars * smoothstep(0.0, 0.3, h));
  }
  COLOR = c;
}
