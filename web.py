"""MyCard シングル買取表 Webページ生成（1ファイルのHTML）
リスト表示／画像表示の切り替え、エキスパンション・レアリティでの絞り込み、
リスト表示では左の画像にカーソルを合わせると大きな画像を表示"""
import json, html

TEMPLATE = r'''<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>MyCard シングル買取表</title>
<meta name="description" content="カードショップ MyCard 取手駅前店のポケモンカード シングル買取価格表">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@700;900&family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
/* 白地ヘッダー＋赤ライン／グレー地。画像表示は白パネル、リスト表示は行で一覧（買取表画像・印刷物と同じ配色） */
:root{--red:#C40F24;--dred:#71151A;--ink:#231916;--sub:#595757;--bg:#EEECEA;--panel:#fff;--line:#D6D2D0;--row:#FAF9F8;
 --jp:"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif;--en:"Lato","Helvetica Neue",Arial,sans-serif;color-scheme:light}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--jp)}
header{background:var(--panel);border-bottom:6px solid var(--red);position:sticky;top:0;z-index:5}
.wrap{max-width:1200px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.hd{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:12px}
.hd img{height:52px;width:auto;display:block}
.ttl{text-align:right;line-height:1.25}
.ttl h1{margin:0;font-size:clamp(14px,2.6vw,26px);font-weight:900;letter-spacing:.02em;white-space:nowrap}
.ttl time{font-size:12px;color:var(--red);font-weight:700}
main{padding-block:18px 40px}
.tools{display:grid;grid-template-columns:minmax(0,2fr) repeat(4,minmax(0,1fr)) auto;gap:10px;align-items:center;margin-bottom:12px}
.tools input,.tools select{font:inherit;font-size:15px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);width:100%;min-width:0}
.tools input:focus,.tools select:focus,.view button:focus-visible,.more:focus-visible{outline:2px solid var(--red);outline-offset:1px}
.view{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel)}
.view button{font:inherit;font-size:14px;font-weight:700;border:0;background:transparent;color:var(--sub);padding:9px 14px;cursor:pointer}
.view button[aria-pressed="true"]{background:var(--ink);color:#fff}
/* 検索・絞り込み欄はスクロールしても見出しの下に付いてくる */
.tools{position:sticky;top:var(--hh,0px);z-index:4;background:var(--bg);padding-block:10px;margin-top:-10px}
.tools.stuck{box-shadow:0 8px 12px -10px rgba(35,25,22,.45)}
#fbtn{display:none;font:inherit;font-size:14px;font-weight:700;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);cursor:pointer;white-space:nowrap}
#fbtn[aria-expanded="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.bar{display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 12px;font-size:13px;color:var(--sub)}
.bar b{color:var(--ink);font-family:var(--en);font-size:15px}
h2{font-size:19px;color:var(--red);margin:4px 0 12px;font-weight:900}
.tag{display:inline-block;border:1.5px solid var(--ink);border-radius:4px;padding:0 5px;line-height:1.45;font-family:var(--en);font-weight:900;font-size:11px;white-space:nowrap}
.tag.r{background:var(--ink);color:#fff}
.yen{font-family:var(--en);font-weight:900;font-variant-numeric:tabular-nums}
.yen small{font-size:.62em;margin-right:2px}
/* 画像表示 */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.grid.feat{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px;margin-bottom:26px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(35,25,22,.12);display:flex;flex-direction:column}
.card .im{padding:8px 8px 0}
.card img{width:100%;aspect-ratio:868/1212;object-fit:cover;display:block;border-radius:4px;background:var(--bg)}
.meta{display:flex;align-items:center;gap:5px;padding:7px 8px 0;min-width:0}
.num{margin-left:auto;color:var(--sub);font-family:var(--en);font-weight:700;font-size:11px;white-space:nowrap}
.card .nm{padding:4px 8px 8px;font-weight:900;font-size:15px;line-height:1.35;flex:1}
.card .pr{background:var(--red);color:#fff;text-align:center;font-size:26px;padding:6px 4px 7px;text-shadow:2px 2px 0 var(--dred)}
.feat .card .nm{font-size:18px}.feat .card .pr{font-size:34px}
/* リスト表示：パソコンは表形式（画像・エキスパンション・型番・レアリティ・カード名・種類・買取価格）、スマホは名前の下にタグ */
.list{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.li{display:grid;grid-template-columns:52px 104px 88px 80px minmax(0,1fr) 120px 140px;gap:16px;align-items:center;padding:8px 16px;border-top:1px solid var(--line)}
.li.hd{border-top:0;background:var(--ink);color:#fff;font-size:12px;font-weight:700;padding-block:9px}
/* 見出しと中身の位置をそろえる：パソコンはすべての列を中央ぞろえ */
@media (min-width:641px){.li>*{text-align:center;justify-self:stretch}#out .li .pr,.list .li.hd .pr{text-align:center}#out .li .gp{align-items:center}}
.li .th{justify-self:center}
.li.hd .c-kind{color:#fff;font-size:12px}
.li:nth-child(odd):not(.hd){background:var(--row)}
.li img{width:48px;aspect-ratio:868/1212;object-fit:cover;border-radius:3px;background:var(--bg);display:block}
.li .c-num{font-family:var(--en);font-weight:700;font-size:13px;color:var(--sub);white-space:nowrap}
.li .c-kind{font-size:13px;color:var(--sub)}
.li .cn{display:block;font-weight:900;font-size:16px;line-height:1.35}
.li .sub{display:none}
.li .pr{color:var(--red);font-size:22px;text-align:right;white-space:nowrap}
.li.hd .pr{color:#fff;font-size:12px;font-family:var(--jp)}
.li.f:not(.hd){box-shadow:inset 4px 0 0 var(--red)}
.li .th{border:0;padding:0;background:none;cursor:zoom-in;display:block;border-radius:3px}
.li .th:hover img{outline:2px solid var(--red);outline-offset:1px}
.li .th:focus-visible{outline:2px solid var(--red);outline-offset:2px}
@media (max-width:900px){.li{grid-template-columns:52px 96px 84px 72px minmax(0,1fr) 120px}.li .c-kind{display:none}}
@media (max-width:640px){
 .li{grid-template-columns:48px minmax(0,1fr) auto;gap:10px;padding:8px 10px}
 .li .c-exp,.li .c-num,.li .c-rr,.li .c-kind{display:none}
 .li.hd{display:none}
 .li .sub{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:4px}
 .li .sub .num{margin:0 0 0 2px;font-size:12px}
 .li .pr{font-size:19px}
}
#pop{position:fixed;z-index:20;pointer-events:none;width:260px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35);background:var(--panel);padding:6px}
#pop img{width:100%;display:block;border-radius:6px;aspect-ratio:868/1212;object-fit:cover;background:var(--bg)}
#modal{position:fixed;inset:0;z-index:30;background:rgba(20,15,14,.78);display:grid;place-items:center;padding:24px}
#modal img{max-width:min(420px,90vw);max-height:80vh;border-radius:10px}
#modal p{color:#fff;text-align:center;font-weight:900;margin:10px 0 0}
.gb{display:inline-flex;align-items:center;gap:4px;font:inherit;font-family:var(--jp);font-weight:900;font-size:12px;line-height:1;letter-spacing:.04em;padding:5px 8px;border-radius:999px;border:0;background:var(--ink);color:#fff;cursor:help;vertical-align:middle;text-shadow:none}
.gb::after{content:'?';display:inline-grid;place-items:center;width:14px;height:14px;border-radius:50%;background:#fff;color:var(--ink);font-size:10px}
.tx{font-family:var(--jp);font-size:.62em;font-weight:900;white-space:nowrap}
#gpop td.a .tx{font-size:13px}
.gp{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.card .gp{align-items:center}.card .pr .gb{background:#fff;color:var(--red)}.card .pr .gb::after{background:var(--red);color:#fff}
#gpop{position:fixed;z-index:25;width:min(340px,calc(100vw - 32px));background:var(--panel);color:var(--ink);border:2px solid var(--red);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.3);padding:14px 16px;font-size:14px}
#gpop h3{margin:0 0 6px;color:var(--red);font-size:17px}
#gpop p{margin:0 0 10px;line-height:1.6}
#gpop table{width:100%;border-collapse:collapse}
#gpop th,#gpop td{padding:6px 4px;border-bottom:1px solid var(--line);text-align:left;font-size:13px}
#gpop th{color:var(--sub);font-weight:700;font-size:11px}
#gpop td.a{text-align:right;font-family:var(--num,inherit);font-weight:900;color:var(--red);font-size:16px;white-space:nowrap}
#gpop .x{position:absolute;top:6px;right:8px;border:0;background:none;font-size:20px;color:var(--sub);cursor:pointer}
.more{display:block;margin:18px auto 0;font:inherit;font-weight:700;padding:10px 28px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
.empty{padding:40px 0;text-align:center;color:var(--sub)}
footer{background:var(--ink);color:#fff;text-align:center;font-size:13px;padding-block:14px}
@media (max-width:760px){.tools{grid-template-columns:repeat(2,minmax(0,1fr))}.tools input{grid-column:1/-1}.view{grid-column:1/-1;justify-self:start}
 /* スマホでスクロール中は「検索窓＋絞り込みボタン」だけにして画面を広く使う */
 .tools.stuck{grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto}
 .tools.stuck input{grid-column:1/3}
 .tools.stuck #fbtn{display:block;grid-column:3}
 .tools.stuck:not(.open) select,.tools.stuck:not(.open) .view{display:none}
 .tools.stuck select:nth-of-type(odd){grid-column:1}
 .tools.stuck select:nth-of-type(even){grid-column:2/4}
 .tools.stuck .view{grid-column:1/-1}}
@media (max-width:480px){.hd img{height:38px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.grid.feat{grid-template-columns:repeat(2,minmax(0,1fr))}
 .card .pr{font-size:21px}.feat .card .pr{font-size:24px}.feat .card .nm{font-size:15px}}
@media (prefers-reduced-motion:no-preference){.card{transition:transform .15s}.card:hover{transform:translateY(-2px)}}
</style></head><body>
<header><div class="wrap hd"><img src="__LOGO__" alt="MyCard マイカード"><div class="ttl"><h1>ポケモンカード シングル買取表</h1><time>__UPDATED__</time></div></div></header>
<main class="wrap">
<div id="sent" aria-hidden="true"></div>
<div class="tools" id="tools">
 <input id="q" type="search" placeholder="カード名で探す（例：ピカチュウ）" aria-label="カード名で検索">
 <button id="fbtn" type="button" aria-expanded="false" aria-controls="tools">絞り込み</button>
 <select id="exp" aria-label="エキスパンション"><option value="">全エキスパンション</option></select>
 <select id="rr" aria-label="レアリティ"><option value="">全レアリティ</option></select>
 <select id="kind" aria-label="カードの種類"><option value="">全種類</option></select>
 <select id="sort" aria-label="並び順"><option value="feat">★ 強化買取中</option><option value="high">買取価格の高い順</option><option value="low">買取価格の安い順</option><option value="no">発売の新しい順（エキスパンション・番号）</option></select>
 <div class="view" role="group" aria-label="表示切替"><button id="vList" type="button">リスト</button><button id="vGrid" type="button">画像</button></div>
</div>
<div class="bar"><span><b id="count">0</b> 件</span><span>価格は1枚あたりの買取価格（税込）です</span></div>
<section id="featS"><h2>★ 強化買取中</h2><div class="grid feat" id="feat"></div></section>
<div id="out"></div>
<button class="more" id="more" type="button" hidden>もっと見る</button>
<p class="empty" id="empty" hidden>条件に合うカードがありません。</p>
</main>
<footer class="wrap">※買取価格はカードの状態により変動します。</footer>
<div id="pop" hidden><img alt=""></div>
<div id="gpop" hidden role="dialog" aria-label="買取保証について"><button class="x" type="button" aria-label="閉じる">×</button><div id="gbody"></div></div>
<div id="modal" hidden><div><img alt=""><p></p></div></div>
<script>
const CARDS=__DATA__;
const RULES=__RULES__;
const EO=__EXPORDER__; // エキスパンションの発売順（1＝新しい。未登録は新しい扱いで先頭）
const eo=e=>EO[e]||0;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const yen=p=>p===''||p==null?'―':typeof p==='string'?`<span class="tx">${esc(p)}</span>`:'<small>¥</small>'+Number(p).toLocaleString('ja-JP');
const ptxt=p=>p===''||p==null?'':typeof p==='string'?p:'¥'+Number(p).toLocaleString('ja-JP');
// 並び順用の値：買取保証は通常価格のカードより必ず安い扱い（保証どうしは保証額の順）
const pnum=c=>(c.g?-1e7:0)+(typeof c.price==='number'?c.price:0);
const pv=c=>c.g?`<span class="gp"><button type="button" class="gb">買取保証</button>${c.price!==''&&c.price!=null?`<span>${yen(c.price)}</span>`:''}</span>`:yen(c.price);
const sized=(u,w)=>/googleusercontent/.test(u)?u+'=w'+w:u;
const PAGE=120; let shown=PAGE, view='list', L=[];
try{view=localStorage.getItem('mycard_view')||'list'}catch(e){}
// 絞り込みの選択肢（エキスパンションは発売の新しい順、レアリティは高い順）
const cnt=k=>{const o={};CARDS.forEach(c=>{if(c[k])o[c[k]]=(o[c[k]]||0)+1});return o};
const ec=cnt('exp');Object.keys(ec).sort((a,b)=>eo(a)-eo(b)||a.localeCompare(b)).forEach(v=>$('exp').add(new Option(v+'（'+ec[v]+'）',v)));
const RO=['MUR','SAR','UR','SR','MA','AR','BWR','TR','RR','R','U','C'];const rc=cnt('rr');
Object.keys(rc).sort((a,b)=>(RO.indexOf(a)+99)%99-(RO.indexOf(b)+99)%99).forEach(v=>$('rr').add(new Option(v+'（'+rc[v]+'）',v)));
const KO=['ポケモン','グッズ','ポケモンのどうぐ','サポート','スタジアム','エネルギー'];const kc=cnt('kind');
KO.filter(v=>kc[v]).forEach(v=>$('kind').add(new Option(v+'（'+kc[v]+'）',v)));if(!Object.keys(kc).length)$('kind').hidden=true;
const tags=c=>(c.exp?`<span class="tag">${esc(c.exp)}</span>`:'')+(c.rr?`<span class="tag r">${esc(c.rr)}</span>`:'');
const card=(c,i)=>`<article class="card"><div class="im"><img loading="lazy" src="${esc(sized(c.img,400))}" alt="${esc(c.name)}"></div>
<div class="meta">${tags(c)}<span class="num">${esc(c.num)}</span></div><div class="nm">${esc(c.name)}</div><div class="pr yen">${pv(c)}</div></article>`;
const row=(c,i)=>`<div class="li${c.feat?' f':''}"><button type="button" class="th" data-i="${i}" aria-label="${esc(c.name)}の画像を拡大"><img loading="lazy" src="${esc(sized(c.img,100))}" alt=""></button>
<div class="c-exp">${c.exp?`<span class="tag">${esc(c.exp)}</span>`:''}</div><div class="c-num">${esc(c.num)}</div><div class="c-rr">${c.rr?`<span class="tag r">${esc(c.rr)}</span>`:''}</div>
<div class="nm"><span class="cn">${esc(c.name)}</span><span class="sub">${tags(c)}<span class="num">${esc(c.num)}</span></span></div><div class="c-kind">${esc(c.kind||'')}</div><div class="pr yen">${pv(c)}</div></div>`;
const HEAD='<div class="li hd" aria-hidden="true"><span>画像</span><span>エキスパンション</span><span>型番</span><span>レアリティ</span><span>カード名</span><span class="c-kind">種類</span><span class="pr">買取価格</span></div>';
function filtered(){
 const q=$('q').value.trim(),e=$('exp').value,r=$('rr').value,k=$('kind').value,s=$('sort').value;
 let A=CARDS.filter(c=>(!q||c.name.includes(q))&&(!e||c.exp===e)&&(!r||c.rr===r)&&(!k||c.kind===k));
 if(s==='feat')A=A.filter(c=>c.feat).sort((a,b)=>pnum(b)-pnum(a));
 else if(s==='high')A.sort((a,b)=>pnum(b)-pnum(a));
 else if(s==='low')A.sort((a,b)=>pnum(a)-pnum(b));
 else A.sort((a,b)=>eo(a.exp)-eo(b.exp)||a.exp.localeCompare(b.exp)||a.num.localeCompare(b.num,'ja',{numeric:true}));
 return A;
}
function render(reset){
 if(reset){shown=PAGE;L=filtered()}
 const plain=!$('q').value.trim()&&!$('exp').value&&!$('rr').value&&!$('kind').value;
 const F=plain&&$('sort').value!=='feat'?CARDS.filter(c=>c.feat).sort((a,b)=>pnum(b)-pnum(a)):[];
 $('featS').hidden=!F.length;$('feat').innerHTML=F.map(card).join('');
 const part=L.slice(0,shown);
 $('out').className=view==='grid'?'grid':'list';
 $('out').innerHTML=view==='grid'?part.map(card).join(''):HEAD+part.map((c,j)=>row(c,j)).join('');
 $('out').hidden=!part.length;
 $('more').hidden=shown>=L.length;$('empty').hidden=L.length>0;$('empty').textContent=$('sort').value==='feat'?'現在、強化買取中のカードはありません。':'条件に合うカードがありません。';$('count').textContent=L.length.toLocaleString('ja-JP');
 $('vList').setAttribute('aria-pressed',view==='list');$('vGrid').setAttribute('aria-pressed',view==='grid');
}
// 見出しの高さぶん下に検索欄を固定。固定中は影を付け、スマホは検索窓だけにたたむ
const tools=$('tools'),hdr=document.querySelector('header');
const setHH=()=>document.documentElement.style.setProperty('--hh',hdr.offsetHeight+'px');setHH();
if('ResizeObserver' in window)new ResizeObserver(setHH).observe(hdr);else addEventListener('resize',setHH);
if('IntersectionObserver' in window){let io;const watch=()=>{io&&io.disconnect();io=new IntersectionObserver(es=>{const st=!es[0].isIntersecting&&es[0].boundingClientRect.top<hdr.offsetHeight+1;tools.classList.toggle('stuck',st);if(!st){tools.classList.remove('open');$('fbtn').setAttribute('aria-expanded','false')}},{rootMargin:`-${hdr.offsetHeight+1}px 0px 0px 0px`});io.observe($('sent'))};watch();addEventListener('resize',watch)}
$('fbtn').addEventListener('click',()=>{const o=tools.classList.toggle('open');$('fbtn').setAttribute('aria-expanded',o)});
// 条件を変えたら、一覧の先頭が見える位置まで戻す（スクロール中に絞り込んだとき）
const toTop=()=>{if(tools.classList.contains('stuck')){const y=$('sent').getBoundingClientRect().top+scrollY-hdr.offsetHeight;scrollTo({top:y})}};
$('sort').value=CARDS.some(c=>c.feat)?'feat':'high';
['q','exp','rr','kind','sort'].forEach(id=>$(id).addEventListener('input',()=>{render(true);toTop()}));
$('more').addEventListener('click',()=>{shown+=PAGE;render(false)});
const setView=v=>{view=v;try{localStorage.setItem('mycard_view',v)}catch(e){}render(false)};
$('vList').addEventListener('click',()=>setView('list'));$('vGrid').addEventListener('click',()=>setView('grid'));
// 下までスクロールしたら自動で続きを表示
if('IntersectionObserver' in window)new IntersectionObserver(es=>{if(es[0].isIntersecting&&!$('more').hidden){shown+=PAGE;render(false)}},{rootMargin:'600px'}).observe($('more'));
// リスト表示：左の画像にカーソルで大きい画像、タップで拡大表示
const pop=$('pop'),pimg=pop.querySelector('img');const hoverable=matchMedia('(hover:hover)').matches;
$('out').addEventListener('mouseover',e=>{const b=e.target.closest('.li .th');if(!b||!hoverable)return;pimg.src=sized(L[b.dataset.i].img,600);pop.hidden=false});
$('out').addEventListener('mousemove',e=>{if(pop.hidden)return;const w=260,h=370,x=e.clientX+24+w>innerWidth?e.clientX-w-24:e.clientX+24;pop.style.left=x+'px';pop.style.top=Math.max(8,Math.min(e.clientY-h/2,innerHeight-h-8))+'px'});
$('out').addEventListener('mouseout',e=>{if(e.target.closest('.li .th'))pop.hidden=true});
$('out').addEventListener('click',e=>{const b=e.target.closest('.li .th');if(!b)return;const c=L[b.dataset.i];pop.hidden=true;
 $('modal').querySelector('img').src=sized(c.img,800);$('modal').querySelector('p').textContent=c.name+'　'+(c.g?'買取保証 ':'')+ptxt(c.price);$('modal').hidden=false});
$('modal').addEventListener('click',()=>{$('modal').hidden=true});
addEventListener('keydown',e=>{if(e.key==='Escape'){$('modal').hidden=true;gpop.hidden=true;gpin=false}});
// 「買取保証」：カーソルを合わせる（スマホはタップ）と保証内容を表示
$('gbody').innerHTML=`<h3>買取保証</h3><p>${esc(RULES.desc)}</p><table><thead><tr><th>レアリティ</th><th>対象</th><th style="text-align:right">保証額</th></tr></thead><tbody>${RULES.rows.map(r=>`<tr><td><span class="tag r">${esc(r.rr)}</span></td><td>${[r.kind?esc(r.kind):'',r.reg?'レギュレーション '+esc(r.reg):''].filter(Boolean).join('<br>')||'すべて'}${r.ex?'<br><small>※'+esc(r.ex)+'を除く</small>':''}</td><td class="a">${yen(r.amount)}</td></tr>`).join('')}</tbody></table>`;
const gpop=$('gpop');let gpin=false;
const placeG=b=>{const r=b.getBoundingClientRect(),w=gpop.offsetWidth,h=gpop.offsetHeight;gpop.style.left=Math.max(16,Math.min(r.right-w+20,innerWidth-w-16))+'px';gpop.style.top=(r.bottom+h+12>innerHeight?Math.max(8,r.top-h-8):r.bottom+8)+'px'};
document.addEventListener('mouseover',e=>{if(!hoverable||gpin)return;const b=e.target.closest('.gb');if(b){gpop.hidden=false;placeG(b)}else if(!e.target.closest('#gpop'))gpop.hidden=true});
document.addEventListener('click',e=>{const b=e.target.closest('.gb');if(b){e.stopPropagation();gpin=true;gpop.hidden=false;placeG(b);return}
 if(e.target.closest('.x')||!e.target.closest('#gpop')){gpin=false;gpop.hidden=true}},true);
addEventListener('scroll',()=>{if(!gpin)gpop.hidden=true},{passive:true});
render(true);
</script></body></html>'''


def build(cards, updated, logo_src, rules=None, exp_order=None):
    rules = rules or dict(desc='', rows=[])
    data = json.dumps([{k: c.get(k, '') for k in ('exp', 'num', 'name', 'rr', 'kind', 'price', 'feat', 'img', 'g')} for c in cards],
                      ensure_ascii=False, separators=(',', ':'))
    return TEMPLATE.replace('__DATA__', data.replace('</', '<\\/')).replace('__UPDATED__', html.escape(updated)).replace('__LOGO__', logo_src).replace(
        '__EXPORDER__', json.dumps(exp_order or {}, ensure_ascii=False)).replace(
        '__RULES__', json.dumps(rules, ensure_ascii=False).replace('</', '<\\/'))
