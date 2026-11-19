shader_type spatial;
render_mode blend_add, unshaded, cull_back, depth_draw_never;
uniform vec3 tint : source_color = vec3(0.75, 0.9, 1.0);
void vertex(){ VERTEX.x += sin(TIME * 1.5 + VERTEX.y * 2.0) * 0.03 * (1.0 - VERTEX.y); }
void fragment(){
  float f = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
  float flick = 0.85 + 0.15 * sin(TIME * 3.0);
  ALBEDO = tint * (0.18 + f * 1.1) * flick;
  ALPHA = 1.0;
}
