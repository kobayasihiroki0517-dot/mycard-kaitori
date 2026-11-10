"""MyCard シングル買取表 Webページ生成（1ファイルのHTML）"""
import json,html
TEMPLATE=r'''<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>MyCard シングル買取表</title>
<meta name="description" content="カードショップ MyCard 取手駅前店のポケモンカード シングル買取価格表">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@700;900&family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
/* 白地のヘッダー＋赤ライン、グレー地に白パネルのカードを並べる（X画像・印刷物と同じ構成） */
:root{--red:#C40F24;--dred:#71151A;--ink:#231916;--sub:#595757;--bg:#EEECEA;--panel:#fff;--line:#D6D2D0;
 --jp:"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif;--en:"Lato","Helvetica Neue",Arial,sans-serif;color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--jp)}
header{background:var(--panel);border-bottom:6px solid var(--red);position:sticky;top:0;z-index:5}
.hd{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;
 padding-block:14px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.hd img{height:56px;width:auto;display:block}
.ttl{text-align:right;line-height:1.25}
.ttl h1{margin:0;font-size:clamp(17px,2.6vw,28px);font-weight:900;letter-spacing:.02em}
.ttl time{font-size:13px;color:var(--red);font-weight:700}
main{max-width:1200px;margin:0 auto;padding-block:20px 40px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:18px}
.tools input,.tools select{font:inherit;font-size:15px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);min-width:0}
.tools input{flex:1 1 220px}
.tools input:focus,.tools select:focus{outline:2px solid var(--red);outline-offset:1px}
.count{font-size:13px;color:var(--sub);margin-left:auto}
h2{font-size:20px;color:var(--red);margin:6px 0 12px;font-weight:900}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.grid.feat{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px;margin-bottom:28px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(35,25,22,.14);display:flex;flex-direction:column}
.card .im{padding:8px 8px 0}
.card img{width:100%;aspect-ratio:868/1212;object-fit:cover;display:block;border-radius:4px;background:var(--bg)}
.meta{display:flex;align-items:center;gap:5px;padding:7px 8px 0;font-family:var(--en);font-weight:900;font-size:11px;min-width:0}
.tag{border:1.5px solid var(--ink);border-radius:4px;padding:1px 5px;line-height:1.3}
.tag.r{background:var(--ink);color:#fff}
.num{margin-left:auto;color:var(--sub);font-weight:700;white-space:nowrap}
.nm{padding:4px 8px 8px;font-weight:900;font-size:15px;line-height:1.35;flex:1}
.pr{background:var(--red);color:#fff;text-align:center;font-family:var(--en);font-weight:900;font-size:26px;padding:6px 4px 7px;
 text-shadow:2px 2px 0 var(--dred);font-variant-numeric:tabular-nums;letter-spacing:.01em}
.pr small{font-size:.62em;margin-right:2px}
.feat .nm{font-size:19px}.feat .pr{font-size:36px}.feat .meta{font-size:13px}
.empty{padding:40px 0;text-align:center;color:var(--sub)}
footer{background:var(--ink);color:#fff;text-align:center;font-size:13px;padding-block:14px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
@media (max-width:480px){.hd img{height:40px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.grid.feat{grid-template-columns:repeat(2,minmax(0,1fr))}
 .pr{font-size:22px}.feat .pr{font-size:26px}.feat .nm{font-size:16px}}
@media (prefers-reduced-motion:no-preference){.card{transition:transform .15s}.card:hover{transform:translateY(-2px)}}
</style></head><body>
<header><div class="hd"><img src="__LOGO__" alt="MyCard マイカード"><div class="ttl"><h1>ポケモンカード シングル買取表</h1><time>__UPDATED__</time></div></div></header>
<main>
<div class="tools">
 <input id="q" type="search" placeholder="カード名で探す（例：ピカチュウ）" aria-label="カード名で検索">
 <select id="exp" aria-label="エキスパンション"><option value="">すべてのエキスパンション</option></select>
 <select id="rr" aria-label="レアリティ"><option value="">すべてのレアリティ</option></select>
 <select id="sort" aria-label="並び順"><option value="order">おすすめ順</option><option value="high">買取価格の高い順</option><option value="low">買取価格の安い順</option></select>
 <span class="count" id="count"></span>
</div>
<section id="featS"><h2>★ 高価買取カード</h2><div class="grid feat" id="feat"></div></section>
<div class="grid" id="list"></div>
<p class="empty" id="empty" hidden>条件に合うカードがありません。</p>
</main>
<footer>※買取価格はカードの状態により変動します。</footer>
<script>
const CARDS=__DATA__;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const yen=p=>p===''||p==null?'―':'<small>¥</small>'+Number(p).toLocaleString('ja-JP');
function opts(sel,key){[...new Set(CARDS.map(c=>c[key]).filter(Boolean))].forEach(v=>{const o=document.createElement('option');o.value=o.textContent=v;sel.appendChild(o)})}
opts($('exp'),'exp');opts($('rr'),'rr');
function card(c){return `<article class="card"><div class="im"><img loading="lazy" src="${esc(c.img)}" alt="${esc(c.name)}"></div>
<div class="meta">${c.exp?`<span class="tag">${esc(c.exp)}</span>`:''}${c.rr?`<span class="tag r">${esc(c.rr)}</span>`:''}<span class="num">${esc(c.num)}</span></div>
<div class="nm">${esc(c.name)}</div><div class="pr">${yen(c.price)}</div></article>`}
function render(){
 const q=$('q').value.trim(),e=$('exp').value,r=$('rr').value,s=$('sort').value;
 let L=CARDS.filter(c=>(!q||c.name.includes(q))&&(!e||c.exp===e)&&(!r||c.rr===r));
 if(s==='high')L=[...L].sort((a,b)=>(b.price||0)-(a.price||0));
 if(s==='low')L=[...L].sort((a,b)=>(a.price||0)-(b.price||0));
 const filtered=q||e||r||s!=='order';
 const F=filtered?[]:L.filter(c=>c.feat);
 $('featS').hidden=!F.length;$('feat').innerHTML=F.map(card).join('');
 const rest=filtered?L:L.filter(c=>!c.feat);
 $('list').innerHTML=rest.map(card).join('');
 $('empty').hidden=L.length>0;$('count').textContent=L.length+'件';
}
['q','exp','rr','sort'].forEach(id=>$(id).addEventListener('input',render));
render();
</script></body></html>'''
def build(cards,updated,logo_src):
    data=json.dumps([{k:c.get(k,'') for k in ('exp','num','name','rr','price','feat','img')} for c in cards],ensure_ascii=False)
    return TEMPLATE.replace('__DATA__',data.replace('</','<\\/')).replace('__UPDATED__',html.escape(updated)).replace('__LOGO__',logo_src)
