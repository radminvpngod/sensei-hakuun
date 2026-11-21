# Sensei's valley: layout from the browser prototype

This is the map Gabriel playtested, extracted so you don't need to read the prototype source. See `valley_map.jpg` (top-down, north up, axis numbers are prototype units).

## Scale and axes
- 1 prototype unit = **2 m = 200 Unreal units**. The prototype was compact; this makes treks feel longer. Ask Gabriel before changing the scale.
- Prototype: x = east, z = south, y = up. Unreal: **X = north = -z·200, Y = east = x·200, Z = up = y·200**.
- The walkable valley is a circle of radius 84 (≈168 m), ringed by mountains/forest you can see past. Ground is gently rolling, around height 0.

## Landmarks
| Landmark | Prototype (x, z) | Unreal (cm) | Notes |
|---|---|---|---|
| Koi pond (ellipse 10×7 radii; Sensei floats above it) | (0, 0) | X      0, Y      0 | Pond floor ~1.7 below ground. Sword in the stone at the bottom. Sensei's spot at the north rim. |
| Spirit Gate = player spawn | (0, 44) | X  -8800, Y      0 | Torii + checkpoint lanterns. Main path runs north from here to the pond. |
| Tea house | (13, 13) | X  -2600, Y   2600 | Front faces the pond path. |
| Castle (own hill, top ~5.2 up) | (34, -40) | X   8000, Y   6800 | Ring moat around the hill. ONE entrance: bridge over the moat from the south-west. |
| Castle gate / moat bridge | (26.5, -33) | X   6600, Y   5300 | Road from the pond area climbs to here. |
| Kumo Shrine hill (12 up, radius 9) | (0, -66) | X  13200, Y      0 | Stone stairs climb its south face from the pond road. |
| Kumo Peak (climbing mountain, 34 high) | (-30, -72) | X  14400, Y  -6000 | Climbable; ledges at 11 and 22. |
| Waterfall cliff | (-34, -36) | X   7200, Y  -6800 | Falls into a pool; stream runs SE to the koi pond. |
| Falls pool | (-21.3, -22.6) | X   4520, Y  -4260 |  |
| Stream bridge | (-13.5, -8.75) | X   1750, Y  -2700 |  |
| Mirror Lake (ellipse 13×10) | (62, 22) | X  -4400, Y  12400 | Island shrine at (65,21) r3. Pier from x45 to x52 at z22. |
| Bamboo Maze (7×7 cells of 4.2) | (-64, -12) | X   2400, Y -12800 |  |
| Forest grove | (-38, 16) | X  -3200, Y  -7600 |  |
| Sakura Orchard (r12) | (-40, 52) | X -10400, Y  -8000 |  |
| Mini golf green (24×16) | (33, 41) | X  -8200, Y   6600 | Keep or drop; Gabriel's call. |
| Night Market / village square | (8, 76) | X -15200, Y   1600 | EXPAND into a full-size village (see changes). |
| Onsen site | (60, -48) | X   9600, Y  12000 | REMOVE from valley (moves to future snow biome). |

## Paths (polylines, prototype x,z)
Dirt/stone paths ~4.5 wide. All must join into one network; add a short link anywhere one dead-ends.
- (0,44) → (0,48)
- (-6,-17) → (0,-40) → (0,-57)
- (22,10) → (40,16) → (45,22)
- (28,-30) → (44,-40) → (55,-46)
- (-26,4) → (-42,-6) → (-48,-12)
- (-12,30) → (-30,44)
- (5,46) → (19.5,43)
- (29,50.5) → (26,58) → (18,64) → (11,70)
- (0,48) → (3,60) → (6,70)
- (0,44) → (0,8)

## Changes Gabriel asked for (apply these, don't copy the prototype blindly)
1. **Castle** stands alone on its own hill with a full ring moat and exactly one entrance: a bridge over the moat leading to the gate. Approach should feel legendary.
2. **No snow in the valley.** Drop the onsen from this map; it returns later in a snow biome.
3. **The Night Market becomes a real village**: normal-sized houses and streets around the square at (8,76), extending south/east as needed, with a path to the Spirit Gate.
4. Buildings on levelled ground, nothing floating or overlapping, nothing on paths (world rules in CLAUDE.md).
5. Leave clear space for future: friend houses near the pond, an art board by Sensei, a kyudo range, and a trail out of the valley toward the next village (south-west is a good exit).
