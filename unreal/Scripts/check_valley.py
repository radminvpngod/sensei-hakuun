import sys, math; sys.path.insert(0, __import__('os').path.dirname(__file__))
import build_valley as B
from PIL import Image, ImageDraw
P=B.plan(); S=B.S
def corners(p):
    # footprint in prototype units (x east, z south); Unreal sx along X(north), sy along Y(east)
    X,Y=p['X'],p['Y']; yaw=math.radians(p['yaw']); hx,hy=p['sx']/2,p['sy']/2
    pts=[]
    for a,b in ((-hx,-hy),(hx,-hy),(hx,hy),(-hx,hy)):
        ux=a*math.cos(yaw)-b*math.sin(yaw); uy=a*math.sin(yaw)+b*math.cos(yaw)
        pts.append(((Y+uy)/S, -(X+ux)/S))
    return pts
def samples(p,n=5):
    c=corners(p); out=[]
    for i in range(n+1):
        for j in range(n+1):
            u,v=i/n,j/n
            a=(c[0][0]+(c[1][0]-c[0][0])*u, c[0][1]+(c[1][1]-c[0][1])*u)
            b=(c[3][0]+(c[2][0]-c[3][0])*u, c[3][1]+(c[2][1]-c[3][1])*u)
            out.append((a[0]+(b[0]-a[0])*v, a[1]+(b[1]-a[1])*v))
    return out
SKIP=("Path","Ground","Stream","Falls_Plunge","Castle_Bridge","Stream_Bridge","Shrine_Stair","Castle_Stair","Lake_Pier","Torii_Kasagi","Torii_Nuki","Rim_","KoiPond_Water","Moat","NightMarket_Square","MirrorLake","Falls_Pool","Sensei","MiniGolf")
bad=[]
for p in P:
    if p['name'].startswith(SKIP): continue
    pts=samples(p) if p['shape']=='cube' else [(p['Y']/S+math.cos(a)*p['sy']/2/S*k, -p['X']/S+math.sin(a)*p['sx']/2/S*k) for a in [i/12*math.tau for i in range(12)] for k in (0,.5,1)]
    d=min(B.path_dist(x,z) for x,z in pts)
    if d<1.125: bad.append((p['name'],round(d,2)))
print("on-path:",len(bad),bad[:15])
# building overlaps (houses, tea, stalls) using sampled points inside other footprints
bl=[p for p in P if p['name'].endswith('_walls') or p['name'].startswith('Stall_')]
def inside(pt,p):
    c=corners(p); x,z=pt; s=0
    for i in range(4):
        a,b=c[i],c[(i+1)%4]; cr=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])
        if cr==0: continue
        s+= 1 if cr>0 else -1
    return abs(s)==4
ov=[(a['name'],b['name']) for i,a in enumerate(bl) for b in bl[i+1:] if any(inside(q,b) for q in samples(a,6))]
print("building overlaps:",ov)
# trees inside buildings / water
trees=[p for p in P if p['name'].endswith('_trunk')]
tb=[(t['name'],b['name']) for t in trees for b in bl if inside((t['Y']/S,-t['X']/S),b)]
print("trees in buildings:",tb)
print("houses:",sum(1 for p in P if p['name'].startswith('House') and p['name'].endswith('_walls')),"trees:",len(trees),"pieces:",len(P))
# preview
W=1000; sc=W/(2*130); im=Image.new('RGB',(W,W),(20,24,40)); d=ImageDraw.Draw(im)
col={k:tuple(int(min(1,v)*255) for v in c) for k,c in B.COLORS.items()}
order=sorted(P,key=lambda p:(p['zb']+p['sh']))
for p in order:
    c=[((x+130)*sc,(z+130)*sc) for x,z in corners(p)]
    if p['shape']=='cube': d.polygon(c,fill=col[p['mat']])
    else:
        cx,cz=(p['Y']/S+130)*sc,(-p['X']/S+130)*sc; rx,rz=p['sy']/2/S*sc,p['sx']/2/S*sc
        d.ellipse([cx-rx,cz-rz,cx+rx,cz+rz],fill=col[p['mat']])
for n,x,z in [("spawn",*B.SPAWN)]: d.ellipse([(x+130)*sc-6,(z+130)*sc-6,(x+130)*sc+6,(z+130)*sc+6],outline=(255,255,0),width=3)
im.save('/tmp/valley_preview.png')
