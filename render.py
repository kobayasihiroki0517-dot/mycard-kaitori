"""MyCard シングル買取表 レンダラー（X用縦長PNG／A4縦PDF）
座標は横幅1080基準で設計し、Zで拡大して描画する（A4はZ≈2.3で300dpi相当）。"""
import os
from PIL import Image,ImageDraw,ImageFont,ImageFilter
HERE=os.path.dirname(os.path.abspath(__file__))
FONT=os.path.join(HERE,'fonts')
def _f(name,fallback): p=os.path.join(FONT,name); return p if os.path.exists(p) else fallback
LB=_f('Lato-Black.ttf','/usr/share/fonts/truetype/lato/Lato-Black.ttf')
LBO=_f('Lato-Bold.ttf','/usr/share/fonts/truetype/lato/Lato-Bold.ttf')
FB=_f('NotoSansCJKjp-Bold.otf',_f('NotoSansCJK-Bold.ttc','/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'))
FR=_f('NotoSansCJKjp-Regular.otf',_f('NotoSansCJK-Regular.ttc','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'))
RED=(196,15,36); DRED=(113,21,26); BLK=(35,25,22); GRY=(89,87,87); BG=(238,236,234); LINE=(214,210,208); WHT=(255,255,255)
LOGO=os.path.join(HERE,'logo_h.png')   # 支給ロゴ（無加工・縦横比維持で縮小のみ）
NOTE='※買取価格はカードの状態により変動します。'
_fc={}
class R:
    def __init__(s,W,H,Z,printmode=False):
        s.W,s.H,s.Z,s.pm=W,H,Z,printmode
        s.im=Image.new('RGB',(round(W*Z),round(H*Z)),WHT if printmode else BG); s.d=ImageDraw.Draw(s.im)
    def u(s,v): return round(v*s.Z)
    def P(s,*v): return tuple(s.u(x) for x in v)
    def font(s,path,size):
        k=(path,s.u(size))
        if k not in _fc: _fc[k]=ImageFont.truetype(path,max(1,s.u(size)),index=0)
        return _fc[k]
    def F(s,size,b=True): return s.font(FB if b else FR,size)
    def L(s,size,black=True): return s.font(LB if black else LBO,size)
    def tl(s,t,font): return s.d.textlength(t,font=font)/s.Z
    def text(s,xy,t,font,fill,anchor='la',bold=0):
        s.d.text(s.P(*xy),t,font=font,fill=fill,anchor=anchor,stroke_width=s.u(bold) if bold else 0,stroke_fill=fill)
    def rect(s,b,fill): s.d.rectangle(s.P(*b),fill=fill)
    def rrect(s,b,r,fill=None,outline=None,width=0): s.d.rounded_rectangle(s.P(*b),radius=s.u(r),fill=fill,outline=outline,width=s.u(width) if width else 0)
    def paste(s,img,xy,mask=None): s.im.paste(img,s.P(*xy),mask)
    def fit(s,t,font,w):
        if s.tl(t,font)<=w: return t
        while t and s.tl(t+'…',font)>w: t=t[:-1]
        return t+'…'
def yen(p): return f'{int(p):,}'
def tag(r,x,y,text,size,h,fill,fg,outline=False):
    f=r.L(size); tw=r.tl(text,f)+size*0.9
    r.rrect((x,y,x+tw,y+h),h/4,fill=fill,outline=BLK if outline else None,width=2 if outline else 0)
    r.text((x+tw/2,y+h/2),text,f,fg,'mm'); return x+tw
def dims(w,big):
    pad=14 if big else 9; iw=w-2*pad
    S=dict(pad=pad,iw=iw,ih=iw*1212/868,tag=20 if big else 14,th=30 if big else 22,num=20 if big else 14,
           name=32 if big else 21,nmin=22 if big else 15,price=70 if big else 40,pb=92 if big else 56)
    S['H']=pad+S['ih']+10+S['th']+8+S['name']+16+S['pb']; return S
def panel(r,x,y,w,c,big=False):
    S=dims(w,big); pad,iw,ih,H=S['pad'],S['iw'],S['ih'],S['H']
    if not r.pm:
        sh=Image.new('L',r.P(w+24,H+24),0); ImageDraw.Draw(sh).rounded_rectangle(r.P(12,14,w+12,H+12),radius=r.u(14),fill=70)
        r.paste((0,0,0),(x-12,y-12),sh.filter(ImageFilter.GaussianBlur(r.u(7))))
    r.rrect((x,y,x+w,y+H),14,fill=WHT,outline=LINE,width=2)
    try: ci=Image.open(c['img']).convert('RGB').resize(r.P(iw,ih),Image.LANCZOS)
    except Exception: ci=Image.new('RGB',r.P(iw,ih),BG)
    r.paste(ci,(x+pad,y+pad))
    ty=y+pad+ih+10; tx=x+pad
    if c.get('exp'): tx=tag(r,tx,ty,c['exp'],S['tag'],S['th'],WHT,BLK,True)+6
    if c.get('rr'): tx=tag(r,tx,ty,c['rr'],S['tag'],S['th'],BLK,WHT)
    if c.get('num'):
        room=x+w-pad-tx-6; ns=S['num']
        while ns>8 and r.tl(c['num'],r.L(ns,False))>room: ns-=1
        if r.tl(c['num'],r.L(ns,False))<=room: r.text((x+w-pad,ty+S['th']/2),c['num'],r.L(ns,False),GRY,'rm')
    ty+=S['th']+8
    size=S['name']
    while size>S['nmin'] and r.tl(c['name'],r.F(size))>iw: size-=1
    nf=r.F(size); r.text((x+pad,ty),r.fit(c['name'],nf,iw-2),nf,BLK,bold=1)
    by=y+H-S['pb']
    r.rrect((x,by,x+w,y+H),14,fill=RED); r.rect((x,by,x+w,by+16),RED)
    p=c.get('price')
    if p in (None,''):
        r.text((x+w/2,by+S['pb']/2),'―',r.F(S['price']),WHT,'mm')
    elif isinstance(p,str):   # 「1cm10円」など文字の保証額
        ps=int(S['price']*.6)
        while ps>12 and r.tl(p,r.F(ps))>iw: ps-=1
        r.text((x+w/2,by+S['pb']/2),p,r.F(ps),WHT,'mm',bold=1)
    else:
        txt=yen(p); ps=S['price']
        while ps>S['price']//2 and r.tl(txt,r.L(ps))+r.tl('¥',r.L(int(ps*.62)))+4>iw: ps-=1
        pf=r.L(ps); yf=r.L(int(ps*.62)); gw=r.tl('¥',yf)+4
        sx=x+(w-gw-r.tl(txt,pf))/2; base=by+S['pb']/2+ps*0.36
        for o,col in ((3,DRED),(0,WHT)):
            r.text((sx+o,base+o),'¥',yf,col,'ls'); r.text((sx+gw+o,base+o),txt,pf,col,'ls')
    return y+H
HH=150; FH=64; M=36
def header(r,updated):
    r.rect((0,0,r.W,HH),WHT); r.rect((0,HH,r.W,HH+8),RED)
    lg=Image.open(LOGO).convert('RGBA'); lh=92; lw=lh*lg.width/lg.height
    lg=lg.resize(r.P(lw,lh),Image.LANCZOS); top=(HH-lh)/2; r.paste(lg,(40,top),lg)
    r.text((r.W-40,top-4),'ポケモンカード シングル買取表',r.F(44),BLK,'ra',bold=1)
    r.text((r.W-40,top+lh+2),updated,r.F(22),RED,'rd')
def header_print(r,updated):
    lg=Image.open(LOGO).convert('RGBA'); lh=96; lw=lh*lg.width/lg.height
    lg=lg.resize(r.P(lw,lh),Image.LANCZOS); top=(HH-lh)/2-4; r.paste(lg,(4,top),lg)
    rx=r.W-4
    f1=r.F(22); t1='ポケモンカード'; w1=r.tl(t1,f1)+28
    r.rrect((rx-w1,top-2,rx,top+34),6,fill=BLK); r.text((rx-w1/2,top+16),t1,f1,WHT,'mm')
    r.text((rx,top+42),'シングル買取表',r.F(56),RED,'ra',bold=2)
    r.rect((0,HH+10,r.W,HH+22),RED); r.rect((0,HH+22,r.W,HH+26),BLK)
    r.text((rx,HH+34),updated,r.F(20),GRY,'ra')
def footer(r):
    if r.pm:
        r.rect((0,r.H-FH+14,r.W,r.H-FH+18),RED); r.text((r.W/2,r.H-FH/2+12),NOTE,r.F(24),BLK,'mm'); return
    r.rect((0,r.H-FH,r.W,r.H),BLK); r.text((r.W/2,r.H-FH/2),NOTE,r.F(24,False),WHT,'mm')
def pages(cards,updated,W=1080,H=1920,Z=1.0,cols=5,nfeat=3,printmode=False):
    feat=[c for c in cards if c.get('feat')][:nfeat]; rest=[c for c in cards if c not in feat]
    out=[]; first=True
    while first or rest:
        r=R(W,H,Z,printmode)
        if printmode: header_print(r,updated); y=HH+64
        else: header(r,updated); y=HH+34
        if first and feat:
            r.text((M,y),'★ 高価買取カード',r.F(34),RED); y+=58
            gap=26; cw=(W-2*M-gap*(nfeat-1))/nfeat
            y=max(panel(r,M+i*(cw+gap),y,cw,c,True) for i,c in enumerate(feat))+30
        gap=14; cw=(W-2*M-gap*(cols-1))/cols; ch=dims(cw,False)['H']
        avail=H-FH-y; rows=max(0,int((avail-16)//(ch+16)))
        take=rest[:rows*cols]; rest=rest[rows*cols:]
        rg=16; oy=0
        if rows and rest:
            rg=min((avail-rows*ch)/(rows+1),48); oy=(avail-rows*ch-(rows-1)*rg)/2
        for i,c in enumerate(take):
            q,k=divmod(i,cols); panel(r,M+k*(cw+gap),y+oy+q*(ch+rg),cw,c)
        footer(r); out.append(r.im); first=False
        if not rows: break
    return out
def x_images(cards,updated): return pages(cards,updated,1080,1920,1.0)
def a4_pages(cards,updated,margin_mm=10):
    """A4縦(2480x3508px=300dpi)。プリンターの印刷できない端で切れないよう四辺に余白を取り、内側に配置"""
    PW,PH=2480,3508; m=round(margin_mm/25.4*300)
    Z=(PW-2*m)/1080; Hb=round((PH-2*m)/Z)
    out=[]
    for im in pages(cards,updated,1080,Hb,Z,cols=6,nfeat=4,printmode=True):
        pg=Image.new('RGB',(PW,PH),WHT); pg.paste(im,(m,m)); out.append(pg)
    return out
def save_pdf(imgs,path): imgs[0].save(path,save_all=True,append_images=imgs[1:],resolution=300)
