"""Render the README demo GIF using the library's own timeline + path data."""
import json, math
from PIL import Image, ImageDraw

M = json.load(open("marks.json"))
SS = 4                      # supersample for clean edges
INK, ACCENT, BG = (16,16,20), (228,87,46), (255,255,255)

def subpaths(d):
    out=[]
    for chunk in d.split("M")[1:]:
        closed = chunk.rstrip().endswith("Z")
        pts=[tuple(map(float,p.split(","))) for p in
             chunk.replace("Z","").strip().split("L")]
        out.append((pts, closed))
    return out

def seglens(pts, closed):
    ring = pts+[pts[0]] if closed else pts
    return [math.dist(ring[i],ring[i+1]) for i in range(len(ring)-1)], ring

# RN easings
q      = lambda t: t*t
inout  = lambda t: 2*t*t if t < .5 else 1-2*(1-t)*(1-t)
easeout= lambda t: 1-(1-t)*(1-t)

def render(mark, frac_draw, fill_a, box, stroke_w, color, fill_color):
    """One frame. `frac_draw` is eased 0..1; SVG restarts the dash per subpath."""
    S=box*SS
    img=Image.new("RGBA",(S,S),(0,0,0,0))
    sc=S/100.0
    # fill first, under the stroke, exactly as SVG paints it
    if fill_a>0:
        lay=Image.new("RGBA",(S,S),(0,0,0,0)); dl=ImageDraw.Draw(lay)
        sp=subpaths(mark["path"])
        dl.polygon([(x*sc,y*sc) for x,y in sp[0][0]], fill=fill_color+(255,))
        for pts,_ in sp[1:]:                      # counters punch back out
            dl.polygon([(x*sc,y*sc) for x,y in pts], fill=(0,0,0,0))
        lay.putalpha(lay.getchannel("A").point(lambda v:int(v*fill_a)))
        img.alpha_composite(lay)
    d=ImageDraw.Draw(img)
    total=mark["length"]
    for pts,closed in subpaths(mark["path"]):
        lens,ring=seglens(pts,closed)
        budget=total*frac_draw                    # dash restarts per subpath
        acc=[]
        for i,L in enumerate(lens):
            if budget<=0: break
            if not acc: acc.append(ring[i])
            if budget>=L:
                acc.append(ring[i+1]); budget-=L
            else:
                t=budget/L
                acc.append((ring[i][0]+(ring[i+1][0]-ring[i][0])*t,
                            ring[i][1]+(ring[i+1][1]-ring[i][1])*t))
                budget=0
        if len(acc)>1:
            d.line([(x*sc,y*sc) for x,y in acc], fill=color+(255,),
                   width=int(stroke_w*sc), joint="curve")
    return img.resize((box,box), Image.LANCZOS)

DEMOS=[  # mark, stroke colour, fill colour, fillStart, duration, strokeWidth
 (M["Monogram"], INK,    INK,    70, 1200, 3),
 (M["Ring"],     ACCENT, ACCENT, 70, 1200, 2),
 (M["Spark"],    INK,    ACCENT, 40, 1600, 3),
]
BOX=200; PAD=40; FPS=25
CYCLE=max(d[4]+150 for d in DEMOS)+700           # longest cycle + a beat
N=int(CYCLE/1000*FPS)
W=PAD+len(DEMOS)*(BOX+PAD); H=BOX+PAD*2

frames=[]
for f in range(N):
    t=f/FPS*1000
    sheet=Image.new("RGB",(W,H),BG)
    for i,(mk,col,fc,fs,dur,sw) in enumerate(DEMOS):
        delay=dur*fs/100.0; fdur=dur-delay+150
        draw_t=min(max(t/dur,0),1) if dur else 1
        fill_t=min(max((t-delay)/fdur,0),1) if fdur else 1
        sheet.paste(render(mk, inout(draw_t), easeout(fill_t), BOX, sw, col, fc),
                    (PAD+i*(BOX+PAD), PAD),
                    render(mk, inout(draw_t), easeout(fill_t), BOX, sw, col, fc))
    frames.append(sheet)

frames[0].save("demo.gif", save_all=True, append_images=frames[1:],
               duration=int(1000/FPS), loop=0, optimize=True)
print(f"demo.gif  {N} frames  {W}x{H}  cycle {CYCLE}ms")
