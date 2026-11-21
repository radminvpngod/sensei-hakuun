"""
Sensei Hakuun - valley blockout builder (Unreal Engine 5.8, editor Python)

Builds a new level /Game/SenseiValley/SenseiValley_Blockout from LAYOUT.md:
ground, koi pond, castle on its own hill with a ring moat, one bridge and stairs,
Kumo Shrine hill with stairs, Kumo Peak, waterfall + stream, Mirror Lake, bamboo
maze, forest, sakura orchard, tea house, mini golf, a full-size village around
the Night Market square, a path network, rim mountains with a south-west exit,
lighting, and a PlayerStart at the Spirit Gate.

Run it in the editor: File > Execute Python Script... > pick this file.
(Needs the "Python Editor Script Plugin", which is on by default.)
Running it again rebuilds the level from scratch. Nothing outside the
/Game/SenseiValley folder is touched.

Coordinates: prototype units (x = east, z = south) * 200 cm.
Unreal X = north = -z*200, Y = east = x*200, Z = up.
"""
import math, random

S = 200.0  # cm per prototype unit
LEVEL = "/Game/SenseiValley/SenseiValley_Blockout"
MAT_DIR = "/Game/SenseiValley/Blockout/Materials"

COLORS = {
    "grass": (0.20, 0.42, 0.16), "grass2": (0.16, 0.36, 0.13), "dirt": (0.55, 0.43, 0.28),
    "stone": (0.52, 0.50, 0.48), "stone_dk": (0.32, 0.31, 0.30), "rock": (0.40, 0.37, 0.36),
    "water": (0.05, 0.32, 0.40), "water_lt": (0.35, 0.70, 0.80), "wall": (0.90, 0.86, 0.76),
    "roof": (0.12, 0.13, 0.20), "wood": (0.36, 0.22, 0.13), "red": (0.75, 0.12, 0.07),
    "gold": (0.90, 0.70, 0.25), "bark": (0.25, 0.16, 0.10), "leaf": (0.12, 0.33, 0.12),
    "leaf2": (0.20, 0.40, 0.14), "sakura": (0.95, 0.60, 0.75), "bamboo": (0.35, 0.55, 0.20),
    "spirit": (0.70, 0.95, 1.00), "lantern": (1.00, 0.55, 0.25), "mountain": (0.30, 0.33, 0.38),
    "golf": (0.25, 0.60, 0.22), "plaza": (0.70, 0.64, 0.52),
}

# ---------------------------------------------------------------- layout data (prototype units)
POND = (0, 0, 10, 7)
SPAWN = (0, 46)
GATE = (0, 44)
CASTLE = (34, -40)
TEA = (13, 13)
SHRINE = (0, -66, 9)               # x, z, plateau radius
PEAK = (-30, -72, 9.5)
CLIFF = (-34, -36)
POOL = (-21.3, -22.6)
STREAM = [(-21.3, -22.6), (-18, -16), (-15, -11), (-12, -6.5), (-8.6, -3.4), (-7.4, -2.9)]
BRIDGE = (-13.5, -8.75)
LAKE = (62, 22, 13, 10); ISLAND = (65, 21, 3); PIER = (45, 52, 22)
MAZE = (-64, -12, 7, 4.2)
FOREST = (-38, 16, 11)
ORCHARD = (-40, 52, 12)
GOLF = (33, 41, 24, 16)
SQUARE = (8, 76, 7)
WALK_R = 86          # walkable radius; props stay inside WALK_R - 4
RIM_R = 112          # rim mountains
GROUND_R = 125

# heights in cm
H_CASTLE = 600      # castle plateau
H_SHRINE = 2400     # shrine plateau
H_PEAK = 6800
H_CLIFF = 2200

# castle geometry (prototype units)
C_R = 10.0          # plateau radius
MOAT_IN, MOAT_OUT = 15.0, 18.5
_d = (26.5 - 34, -33 + 40); _l = math.hypot(*_d)
C_DIR = (_d[0] / _l, _d[1] / _l)   # towards the single entrance (south-west)
C_STAIR_END = (CASTLE[0] + C_DIR[0] * 14.0, CASTLE[1] + C_DIR[1] * 14.0)
C_BRIDGE_OUT = (CASTLE[0] + C_DIR[0] * 19.5, CASTLE[1] + C_DIR[1] * 19.5)

SHRINE_STAIR_BOTTOM = (0, -41.0)

PATHS = [
    [GATE, (0, 8)],                                     # spawn -> pond
    [(0, 44), (0, 48)],
    [(-6, -17), (0, -40), SHRINE_STAIR_BOTTOM],         # pond -> shrine stairs
    [(-4, -8), (-6, -17)],                              # pond rim -> shrine road
    [(8, -6), C_BRIDGE_OUT],                            # pond -> castle bridge
    [(10, 3), (22, 10), (40, 16), (45, 22)],            # pond -> pier
    [(-11.5, 2), (-26, 4), (-42, -6), (-64 + 7 * 4.2 / 2 + 1.5, -12)],  # pond -> maze entrance (east side)
    [(-4, 9), (-12, 30), (-30, 44)],                    # pond -> orchard
    [(-30, 44), (-52, 62), (-72, 80), (-80, 88)],       # orchard -> exit trail (south-west gap)
    [(0, 30), (-12, 30)],
    [(5, 46), (19.5, 43)],                              # gate -> golf
    [(29, 50.5), (26, 58), (18, 64), (11, 70)],         # golf -> village
    [(0, 48), (3, 60), (6, 70)],                        # gate -> village
    [(-4, -8), (-10.5, -8.7)],                          # pond -> stream bridge
    [(-16.5, -8.9), (-22, -11), (-26, 4)],              # stream bridge -> maze road (loop)
    [(4, 8), (9, 9.2), (13, 9.3)],                      # main path -> tea house front
    # village streets
    [(-16, 76), (1, 76)], [(15, 76), (34, 76)], [(8, 83), (8, 86)], [(-10, 86), (26, 86)],
    [(-16, 76), (-16, 66)], [(34, 76), (34, 64)],
]

# ---------------------------------------------------------------- helpers
def U(x, z):
    return (-z * S, x * S)


def seg_dist(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L))
    return math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t)


def path_dist(x, z):
    return min(seg_dist(x, z, p[i], p[i + 1]) for p in PATHS for i in range(len(p) - 1))


def stream_dist(x, z):
    return min(seg_dist(x, z, STREAM[i], STREAM[i + 1]) for i in range(len(STREAM) - 1))


PLAN = []        # placements
FOOT = []        # 2D footprints (x, z, r) of solid things, for tree/house avoidance


def put(name, folder, shape, x, z, zb, sx, sy, sh, mat, yaw=0.0, pitch=0.0, foot=None, collide=True):
    """x,z prototype units; zb bottom height cm; sx,sy,sh sizes in cm (sx along Unreal X/north)."""
    X, Y = U(x, z)
    PLAN.append(dict(name=name, folder=folder, shape=shape, X=X, Y=Y, zb=zb, sx=sx, sy=sy, sh=sh,
                     mat=mat, yaw=yaw, pitch=pitch, collide=collide))
    if foot:
        FOOT.append((x, z, foot))


def box_between(name, folder, a, b, width, zb, h, mat, collide=True):
    """flat box along the segment a->b (prototype units)."""
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    L = math.hypot(b[0] - a[0], b[1] - a[1]) * S
    # direction in Unreal: X=-z, Y=x
    yaw = math.degrees(math.atan2(b[0] - a[0], -(b[1] - a[1])))
    put(name, folder, "cube", mx, mz, zb, L, width, h, mat, yaw=yaw, collide=collide)


def stairs(name, folder, bottom, top_xz, rise, step=40.0, width=360.0, mat="stone", base=0.0):
    """solid steps from bottom point up to top point (each step is a full block down to the ground)."""
    L = math.hypot(top_xz[0] - bottom[0], top_xz[1] - bottom[1]) * S
    n = max(1, int(L // step))
    ux, uz = (top_xz[0] - bottom[0]) / n, (top_xz[1] - bottom[1]) / n
    yaw = math.degrees(math.atan2(ux, -uz))
    for i in range(n):
        h = rise * (i + 1) / n
        cx, cz = bottom[0] + ux * (i + .5), bottom[1] + uz * (i + .5)
        put(f"{name}_{i:02d}", folder, "cube", cx, cz, base, L / n + 1, width, h, mat, yaw=yaw)


def tree(name, folder, x, z, kind="pine", s=1.0):
    if kind == "sakura":
        put(name + "_trunk", folder, "cyl", x, z, 0, 40 * s, 40 * s, 300 * s, "bark")
        put(name + "_crown", folder, "sphere", x, z, 220 * s, 520 * s, 520 * s, 380 * s, "sakura", collide=False)
    elif kind == "bamboo":
        put(name, folder, "cyl", x, z, 0, 18, 18, 900 * s, "bamboo")
    else:
        put(name + "_trunk", folder, "cyl", x, z, 0, 50 * s, 50 * s, 380 * s, "bark")
        put(name + "_crown", folder, "cone", x, z, 280 * s, 520 * s, 520 * s, 760 * s, "leaf" if kind == "pine" else "leaf2", collide=False)
    FOOT.append((x, z, 1.6 * s))


def house(name, folder, x, z, w=8.0, d=7.0, yaw=0.0):
    put(name + "_walls", folder, "cube", x, z, 0, d * 100, w * 100, 380, "wall", yaw=yaw)
    put(name + "_roof", folder, "cube", x, z, 380, d * 100 + 120, w * 100 + 120, 60, "roof", yaw=yaw)
    put(name + "_ridge", folder, "cube", x, z, 440, d * 100 * .55, w * 100 + 60, 90, "roof", yaw=yaw)
    FOOT.append((x, z, max(w, d) / 2 / 2 + 1.2))


def free(x, z, r, path_clear=3.0):
    if math.hypot(x, z) > WALK_R - 4: return False
    if path_dist(x, z) < path_clear + r: return False
    if stream_dist(x, z) < 2.5 + r: return False
    for fx, fz, fr in FOOT:
        if math.hypot(x - fx, z - fz) < fr + r: return False
    # water and big features
    if ((x - POND[0]) / (POND[2] + 3)) ** 2 + ((z - POND[1]) / (POND[3] + 3)) ** 2 < 1: return False
    if ((x - LAKE[0]) / (LAKE[2] + 3)) ** 2 + ((z - LAKE[1]) / (LAKE[3] + 3)) ** 2 < 1: return False
    if math.hypot(x - CASTLE[0], z - CASTLE[1]) < MOAT_OUT + 3: return False
    if math.hypot(x - SHRINE[0], z - SHRINE[1]) < SHRINE[2] + 4: return False
    if math.hypot(x - PEAK[0], z - PEAK[1]) < PEAK[2] + 3: return False
    if math.hypot(x - POOL[0], z - POOL[1]) < 6: return False
    if abs(x - CLIFF[0]) < 9 and abs(z - CLIFF[1]) < 9: return False
    mh = MAZE[2] * MAZE[3] / 2 + 2
    if abs(x - MAZE[0]) < mh and abs(z - MAZE[1]) < mh: return False
    if abs(x - GOLF[0]) < GOLF[2] / 2 + 2 and abs(z - GOLF[1]) < GOLF[3] / 2 + 2: return False
    if math.hypot(x - SQUARE[0], z - SQUARE[1]) < SQUARE[2] + 2: return False
    if abs(x) < 5 and 38 < z < 50: return False  # spirit gate area
    # stair corridors
    if seg_dist(x, z, SHRINE_STAIR_BOTTOM, (0, -57)) < 4: return False
    return True


# ---------------------------------------------------------------- the plan
def plan():
    random.seed(20261121)
    PLAN.clear(); FOOT.clear()
    # ground
    put("Ground", "Valley/Ground", "cyl", 0, 0, -100, GROUND_R * S * 2, GROUND_R * S * 2, 100, "grass")

    # rim mountains, gap to the south-west for the trail out
    for i in range(30):
        a = i / 30 * math.tau
        x, z = math.cos(a) * RIM_R, math.sin(a) * RIM_R
        if math.degrees(math.atan2(z, x)) % 360 > 120 and math.degrees(math.atan2(z, x)) % 360 < 150:
            continue
        r = random.uniform(14, 22); h = random.uniform(3500, 9000)
        put(f"Rim_{i:02d}", "Valley/Rim", "cone", x, z, -50, r * S * 2, r * S * 2, h, "mountain")

    # koi pond: water, stone rim, sensei, sword in the stone, art board
    px, pz, ra, rb = POND
    put("KoiPond_Water", "Valley/KoiPond", "cyl", px, pz, 0, rb * S * 2, ra * S * 2, 6, "water", collide=False)
    for i in range(36):
        a = i / 36 * math.tau
        x, z = px + math.cos(a) * (ra + .6), pz + math.sin(a) * (rb + .6)
        if path_dist(x, z) < 2.0: continue            # gaps where paths arrive
        put(f"KoiPond_Rim_{i:02d}", "Valley/KoiPond", "cube", x, z, 0, 170, 150, 45, "stone",
            yaw=math.degrees(-a))
    put("Sensei_Marker", "Valley/KoiPond", "sphere", 0, -.5, 260, 120, 120, 120, "spirit", collide=False)
    put("SwordStone_Rock", "Valley/KoiPond", "sphere", 3, 2, 0, 160, 140, 70, "rock")
    put("SwordStone_Blade", "Valley/KoiPond", "cube", 3, 2, 50, 8, 30, 220, "stone_dk")
    put("ArtBoard_Easel", "Valley/KoiPond", "cube", 2.5, -9.8, 0, 20, 220, 200, "wood")

    # spirit gate (spawn): torii + checkpoint lantern pair
    for side in (-1, 1):
        put(f"Torii_Post_{side:+d}", "Valley/SpiritGate", "cyl", GATE[0] + side * 2.2, GATE[1], 0, 45, 45, 520, "red")
        put(f"Lantern_{side:+d}", "Valley/SpiritGate", "cube", GATE[0] + side * 3.6, GATE[1] - 2.5, 0, 60, 60, 160, "stone")
    put("Torii_Kasagi", "Valley/SpiritGate", "cube", GATE[0], GATE[1], 520, 60, 1150, 50, "red")
    put("Torii_Nuki", "Valley/SpiritGate", "cube", GATE[0], GATE[1], 400, 40, 950, 35, "red")
    FOOT.append((GATE[0], GATE[1], 3))

    # tea house
    house("TeaHouse", "Valley/TeaHouse", TEA[0], TEA[1], w=10, d=8)

    # castle: plateau, keep tiers, single stair + bridge over the ring moat
    cx, cz = CASTLE
    put("Castle_Hill", "Valley/Castle", "cyl", cx, cz, 0, C_R * S * 2, C_R * S * 2, H_CASTLE, "grass2")
    put("Castle_Base", "Valley/Castle", "cube", cx, cz, H_CASTLE, 2600, 2600, 300, "stone")
    tiers = [(2000, 500), (1500, 450), (1000, 400)]
    zb = H_CASTLE + 300
    for i, (w, h) in enumerate(tiers):
        put(f"Castle_Keep_{i}", "Valley/Castle", "cube", cx, cz, zb, w, w, h, "wall")
        put(f"Castle_Roof_{i}", "Valley/Castle", "cube", cx, cz, zb + h, w + 300, w + 300, 80, "roof")
        zb += h + 80
    put("Castle_Shachi", "Valley/Castle", "cube", cx, cz, zb, 200, 500, 120, "gold")
    edge = (cx + C_DIR[0] * C_R, cz + C_DIR[1] * C_R)
    stairs("Castle_Stair", "Valley/Castle", C_STAIR_END, edge, H_CASTLE, step=48, width=420)
    # gatehouse arch at the top of the stairs
    gx, gz = cx + C_DIR[0] * (C_R - 1.5), cz + C_DIR[1] * (C_R - 1.5)
    gyaw = math.degrees(math.atan2(C_DIR[0], -C_DIR[1]))
    for side in (-1, 1):
        ox, oz = -C_DIR[1] * side * 3.2, C_DIR[0] * side * 3.2
        put(f"Castle_Gate_Post_{side:+d}", "Valley/Castle", "cube", gx + ox, gz + oz, H_CASTLE, 200, 160, 520, "stone_dk", yaw=gyaw)
    put("Castle_Gate_Lintel", "Valley/Castle", "cube", gx, gz, H_CASTLE + 520, 220, 1450, 140, "roof", yaw=gyaw)
    # moat as a ring of water segments, with the bridge as the only crossing
    n = 48
    for i in range(n):
        a0, a1 = i / n * math.tau, (i + 1) / n * math.tau
        am = (a0 + a1) / 2
        if math.hypot(math.cos(am) - C_DIR[0], math.sin(am) - C_DIR[1]) < 0.2:
            continue  # leave room under the bridge, filled by a water slab below
        rm = (MOAT_IN + MOAT_OUT) / 2
        mx, mz = cx + math.cos(am) * rm, cz + math.sin(am) * rm
        seg = 2 * rm * math.sin(math.pi / n) * S + 40
        put(f"Moat_{i:02d}", "Valley/Castle", "cube", mx, mz, 0, (MOAT_OUT - MOAT_IN) * S, seg, 8, "water",
            yaw=math.degrees(-am) + 90, collide=False)
    bm = ((MOAT_IN + MOAT_OUT) / 2)
    put("Moat_UnderBridge", "Valley/Castle", "cube", cx + C_DIR[0] * bm, cz + C_DIR[1] * bm, 0,
        (MOAT_OUT - MOAT_IN) * S, 1400, 8, "water", yaw=gyaw, collide=False)
    # moat banks (low stone walls on both edges so it reads as a moat)
    for r, tag in ((MOAT_IN - .3, "In"), (MOAT_OUT + .3, "Out")):
        for i in range(n):
            am = (i + .5) / n * math.tau
            if math.hypot(math.cos(am) - C_DIR[0], math.sin(am) - C_DIR[1]) < 0.2: continue
            put(f"MoatWall{tag}_{i:02d}", "Valley/Castle", "cube", cx + math.cos(am) * r, cz + math.sin(am) * r, 0,
                60, 2 * r * math.sin(math.pi / n) * S + 30, 70, "stone", yaw=math.degrees(-am) + 90)
    box_between("Castle_Bridge", "Valley/Castle", (cx + C_DIR[0] * (MOAT_IN - 1), cz + C_DIR[1] * (MOAT_IN - 1)),
                C_BRIDGE_OUT, 420, 0, 60, "wood")
    for side in (-1, 1):
        ox, oz = -C_DIR[1] * side * 1.05, C_DIR[0] * side * 1.05
        box_between(f"Castle_Bridge_Rail_{side:+d}", "Valley/Castle",
                    (cx + C_DIR[0] * (MOAT_IN - 1) + ox, cz + C_DIR[1] * (MOAT_IN - 1) + oz),
                    (C_BRIDGE_OUT[0] + ox, C_BRIDGE_OUT[1] + oz), 20, 60, 90, "red")
    FOOT.append((cx, cz, MOAT_OUT + 1))

    # kumo shrine hill + stairs + shrine
    sx, sz, sr = SHRINE
    put("Shrine_Hill", "Valley/Shrine", "cyl", sx, sz, 0, sr * S * 2, sr * S * 2, H_SHRINE, "grass2")
    stairs("Shrine_Stair", "Valley/Shrine", SHRINE_STAIR_BOTTOM, (sx, sz + sr), H_SHRINE, step=42, width=380)
    put("Shrine_Hall", "Valley/Shrine", "cube", sx, sz - 2, H_SHRINE, 900, 1200, 450, "wood")
    put("Shrine_Roof", "Valley/Shrine", "cube", sx, sz - 2, H_SHRINE + 450, 1200, 1500, 100, "roof")
    for side in (-1, 1):
        put(f"Shrine_Torii_{side:+d}", "Valley/Shrine", "cyl", sx + side * 2, sz + sr - 1.5, H_SHRINE, 40, 40, 450, "red")
    put("Shrine_Torii_Top", "Valley/Shrine", "cube", sx, sz + sr - 1.5, H_SHRINE + 450, 50, 1000, 45, "red")

    # kumo peak (climbable later)
    put("KumoPeak", "Valley/KumoPeak", "cone", PEAK[0], PEAK[1], 0, PEAK[2] * S * 2.4, PEAK[2] * S * 2.4, H_PEAK, "rock")

    # waterfall cliff, falls, pool, stream, bridge
    put("Falls_Cliff", "Valley/Waterfall", "cube", CLIFF[0], CLIFF[1], 0, 2400, 2400, H_CLIFF, "rock",
        yaw=-45)
    fx, fz = CLIFF[0] + 4.35, CLIFF[1] + 4.35   # on the cliff face that looks at the pool
    put("Falls_Water", "Valley/Waterfall", "cube", fx, fz, 0, 40, 400, H_CLIFF - 200, "water_lt", yaw=-45, collide=False)
    box_between("Falls_Plunge", "Valley/Waterfall", (fx + .5, fz + .5), POOL, 380, 0, 7, "water", collide=False)
    put("Falls_Pool", "Valley/Waterfall", "cyl", POOL[0], POOL[1], 0, 1500, 1500, 7, "water", collide=False)
    for i in range(len(STREAM) - 1):
        box_between(f"Stream_{i}", "Valley/Waterfall", STREAM[i], STREAM[i + 1], 300, 0, 7, "water", collide=False)
    # bridge across the stream where the pond->maze path crosses (and the prototype bridge)
    box_between("Stream_Bridge", "Valley/Waterfall", (-10.5, -8.7), (-16.5, -8.9), 360, 0, 50, "wood")
    for side in (-1, 1):
        box_between(f"Stream_Bridge_Rail_{side:+d}", "Valley/Waterfall", (-10.5, -8.7 + side * .85), (-16.5, -8.9 + side * .85), 18, 50, 80, "red")

    # mirror lake, island shrine, pier
    lx, lz, la, lb = LAKE
    put("MirrorLake", "Valley/MirrorLake", "cyl", lx, lz, 0, lb * S * 2, la * S * 2, 7, "water", collide=False)
    put("Lake_Island", "Valley/MirrorLake", "cyl", ISLAND[0], ISLAND[1], 0, ISLAND[2] * S * 2, ISLAND[2] * S * 2, 60, "grass2")
    put("Lake_IslandShrine", "Valley/MirrorLake", "cube", ISLAND[0], ISLAND[1], 60, 250, 250, 260, "red")
    box_between("Lake_Pier", "Valley/MirrorLake", (PIER[0], PIER[2]), (PIER[1], PIER[2]), 260, 0, 45, "wood")

    # bamboo maze (perfect maze, deterministic), entrance on the east side
    mxc, mzc, mn, mc = MAZE
    walls = {(i, j, d) for i in range(mn) for j in range(mn) for d in "ES"}
    seen = {(0, 0)}; st = [(0, 0)]
    while st:
        i, j = st[-1]
        nb = [(i + di, j + dj) for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1))
              if 0 <= i + di < mn and 0 <= j + dj < mn and (i + di, j + dj) not in seen]
        if not nb: st.pop(); continue
        ni, nj = random.choice(nb)
        if ni != i: walls.discard((min(i, ni), j, "E"))
        else: walls.discard((i, min(j, nj), "S"))
        seen.add((ni, nj)); st.append((ni, nj))
    x0, z0 = mxc - mn * mc / 2, mzc - mn * mc / 2
    segs = []
    for (i, j, d) in sorted(walls):
        if d == "E":
            if i == mn - 1 and j == mn // 2: continue          # entrance, east side, where the path arrives
            segs.append(((x0 + (i + 1) * mc, z0 + j * mc), (x0 + (i + 1) * mc, z0 + (j + 1) * mc)))
        else:
            segs.append(((x0 + i * mc, z0 + (j + 1) * mc), (x0 + (i + 1) * mc, z0 + (j + 1) * mc)))
    for j in range(mn):                                         # west and north outer walls
        segs.append(((x0, z0 + j * mc), (x0, z0 + (j + 1) * mc)))
        segs.append(((x0 + j * mc, z0), (x0 + (j + 1) * mc, z0)))
    for k, (a_, b_) in enumerate(segs):
        box_between(f"Maze_Wall_{k:03d}", "Valley/BambooMaze", a_, b_, 90, 0, 420, "bamboo")

    # mini golf green
    gx, gz, gw, gd = GOLF
    put("MiniGolf_Green", "Valley/MiniGolf", "cube", gx, gz, 0, gd * S, gw * S, 20, "golf")

    # village around the night market square
    qx, qz, qr = SQUARE
    put("NightMarket_Square", "Valley/Village", "cyl", qx, qz, 0, qr * S * 2, qr * S * 2, 8, "plaza")
    put("NightMarket_Well", "Valley/Village", "cyl", qx + 3, qz - 3, 0, 220, 220, 100, "stone")
    for i, deg in enumerate((25, 60, 120, 155, 205, 335)):   # market stalls, clear of the streets
        a = math.radians(deg)
        put(f"Stall_{i}", "Valley/Village", "cube", qx + math.cos(a) * (qr - 2), qz + math.sin(a) * (qr - 2), 0,
            300, 400, 260, "red" if i % 2 else "wood", yaw=math.degrees(-a))
    FOOT.append((qx, qz, qr + 1))
    k = 0
    for hz in range(58, 92, 5):
        for hx in range(-22, 40, 6):
            x, z = hx + (2.5 if (hz // 5) % 2 else 0), hz
            if math.hypot(x - qx, z - qz) < qr + 4: continue
            if path_dist(x, z) < 3.6 or path_dist(x, z) > 9: continue
            if not free(x, z, 2.4, path_clear=1.2): continue
            house(f"House_{k:02d}", "Valley/Village", x, z, w=random.choice((7, 8, 9)), d=random.choice((6, 7)))
            k += 1

    # forest grove, sakura orchard, scattered pines, bamboo clumps
    def scatter(prefix, folder, cx, cz, rad, count, kind, scale=(0.9, 1.3), tries=400):
        n = 0
        for _ in range(tries):
            if n >= count: break
            a, r = random.uniform(0, math.tau), rad * math.sqrt(random.random())
            x, z = cx + math.cos(a) * r, cz + math.sin(a) * r
            s = random.uniform(*scale)
            if free(x, z, 1.6 * s):
                tree(f"{prefix}_{n:02d}", folder, x, z, kind, s); n += 1
    scatter("Forest", "Valley/Forest", FOREST[0], FOREST[1], FOREST[2], 26, "pine")
    scatter("Sakura", "Valley/Orchard", ORCHARD[0], ORCHARD[1], ORCHARD[2], 18, "sakura", (0.9, 1.2))
    scatter("Pine", "Valley/Trees", 0, 0, WALK_R - 4, 70, "pine", (0.8, 1.4), tries=3000)
    scatter("Maple", "Valley/Trees", 0, 0, WALK_R - 4, 40, "maple", (0.8, 1.2), tries=3000)

    # paths last-but-one, so props never sit on them (they were kept clear above)
    k = 0
    for p in PATHS:
        for i in range(len(p) - 1):
            box_between(f"Path_{k:03d}", "Valley/Paths", p[i], p[i + 1], 450, 0, 4 + (k % 2) * .5, "dirt", collide=False); k += 1
        for v in p:
            put(f"PathJoint_{k:03d}", "Valley/Paths", "cyl", v[0], v[1], 0, 450, 450, 5, "dirt", collide=False); k += 1
    return PLAN


# ---------------------------------------------------------------- unreal execution
def build():
    import unreal
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    eal = unreal.EditorAssetLibrary
    mel = unreal.MaterialEditingLibrary

    if not les.new_level(LEVEL):
        if eal.does_asset_exist(LEVEL):
            les.load_level(LEVEL)
            for a in eas.get_all_level_actors():
                eas.destroy_actor(a)
        else:
            raise RuntimeError("Could not create " + LEVEL)

    parent = unreal.load_asset("/Engine/BasicShapes/BasicShapeMaterial")
    mats = {}
    for name, (r, g, b) in COLORS.items():
        path = f"{MAT_DIR}/MI_Block_{name}"
        mi = unreal.load_asset(path) if eal.does_asset_exist(path) else tools.create_asset(
            f"MI_Block_{name}", MAT_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        mel.set_material_instance_parent(mi, parent)
        mel.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(r, g, b, 1))
        eal.save_loaded_asset(mi)
        mats[name] = mi

    meshes = {k: unreal.load_asset(v) for k, v in {
        "cube": "/Engine/BasicShapes/Cube", "cyl": "/Engine/BasicShapes/Cylinder",
        "sphere": "/Engine/BasicShapes/Sphere", "cone": "/Engine/BasicShapes/Cone"}.items()}

    # lighting & sky
    def spawn_cls(cls, label, loc=(0, 0, 0), rot=None):
        a = eas.spawn_actor_from_class(cls, unreal.Vector(*loc), rot or unreal.Rotator(0, 0, 0))
        a.set_actor_label(label); a.set_folder_path("Lighting"); return a
    sun = spawn_cls(unreal.DirectionalLight, "Sun", (0, 0, 5000), unreal.Rotator(roll=0, pitch=-38, yaw=-35))
    try:
        lc = sun.get_component_by_class(unreal.DirectionalLightComponent)
        lc.set_editor_property("atmosphere_sun_light", True); lc.set_editor_property("intensity", 8.0)
    except Exception as e: unreal.log_warning(f"sun settings: {e}")
    spawn_cls(unreal.SkyAtmosphere, "SkyAtmosphere")
    sky = spawn_cls(unreal.SkyLight, "SkyLight", (0, 0, 3000))
    try: sky.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)
    except Exception as e: unreal.log_warning(f"skylight: {e}")
    spawn_cls(unreal.ExponentialHeightFog, "HeightFog", (0, 0, -200))
    try: spawn_cls(unreal.VolumetricCloud, "Clouds")
    except Exception as e: unreal.log_warning(f"clouds: {e}")

    X, Y = U(*SPAWN)
    ps = eas.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(X, Y, 120), unreal.Rotator(0, 0, 0))
    ps.set_actor_label("PlayerStart_SpiritGate"); ps.set_folder_path("Valley/SpiritGate")

    plan()
    n = len(PLAN)
    with unreal.ScopedSlowTask(n, "Building Sensei's valley") as task:
        task.make_dialog(True)
        for i, p in enumerate(PLAN):
            if task.should_cancel(): break
            task.enter_progress_frame(1, p["name"])
            a = eas.spawn_actor_from_object(meshes[p["shape"]], unreal.Vector(p["X"], p["Y"], 0),
                                            unreal.Rotator(roll=0, pitch=p["pitch"], yaw=p["yaw"]))
            a.set_actor_label(p["name"]); a.set_folder_path(p["folder"])
            a.set_actor_scale3d(unreal.Vector(p["sx"] / 100, p["sy"] / 100, p["sh"] / 100))
            smc = a.static_mesh_component
            smc.set_material(0, mats[p["mat"]])
            if not p["collide"]:
                smc.set_collision_profile_name("NoCollision")
            origin, ext = a.get_actor_bounds(False)
            loc = a.get_actor_location()
            a.set_actor_location(unreal.Vector(loc.x, loc.y, loc.z + p["zb"] - (origin.z - ext.z)), False, False)
    les.save_current_level()
    unreal.log(f"Sensei valley blockout: {n} pieces placed in {LEVEL}")


if __name__ == "__main__":
    try:
        import unreal  # noqa
        build()
    except ImportError:
        print(f"planned {len(plan())} pieces (run inside Unreal to build)")
