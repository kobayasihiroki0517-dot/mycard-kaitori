/** カードラッシュ（cardrush.media）の買取価格を取得し、
 *  ・カード一覧に「▼CR買取価格」を書き込む（POS価格との比較用）
 *  ・買取表で買取価格が未入力の行（または前回カードラッシュから入れた行）に価格を入れる
 */
const CR_URL = 'https://cardrush.media/pokemon/buying_prices?limit=500&display_category=' +
  encodeURIComponent('スタンダード') + '&page=';

function crFetchAll_() {
  const opt = { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } };
  const parse = res => {
    if (res.getResponseCode() !== 200) throw new Error('カードラッシュに接続できませんでした（' + res.getResponseCode() + '）');
    const m = res.getContentText().match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('カードラッシュのページ形式が変わった可能性があります');
    return JSON.parse(m[1]).props.pageProps;
  };
  const first = parse(UrlFetchApp.fetch(CR_URL + 1, opt));
  let rows = first.buyingPrices || [];
  const reqs = [];
  for (let p = 2; p <= (first.lastPage || 1); p++) reqs.push(Object.assign({ url: CR_URL + p }, opt));
  if (reqs.length) UrlFetchApp.fetchAll(reqs).forEach(r => { rows = rows.concat(parse(r).buyingPrices || []); });
  return { rows: rows, updatedAt: first.updatedAt || '' };
}

/* エキスパンション表記をそろえる（大文字・ハイフン除去） 例: SV-P → SVP, sA → SA */
function crExp_(s) { return String(s || '').toUpperCase().replace(/[-\s]/g, ''); }

function crIndex_(rows) {
  const idx = {};
  rows.forEach(x => {
    const mm = /^(\w+)(?:\/([\w-]+))?/.exec(x.model_number || '');
    if (!mm) return;
    let exp = x.pack_code;
    if ((exp === 'PROMO' || exp === 'その他') && mm[2] && /-P$/i.test(mm[2])) exp = mm[2];
    const k = crExp_(exp) + '|' + mm[1];
    (idx[k] = idx[k] || []).push(x);
  });
  return idx;
}
function crPick_(idx, exp, num, name) {
  const norm = s => String(s || '').replace(/\s/g, '');
  let c = (idx[crExp_(exp) + '|' + num] || []).filter(x => norm(x.name) === norm(name));
  if (!c.length) return null;
  const base = c.filter(x => x.extra_difference === '' || x.extra_difference === 'ノーマル仕様');
  const notVariant = c.filter(x => !/ミラー|エラー|未開封|マーク|当選|LEGEND/.test(x.extra_difference || ''));
  c = base.length ? base : notVariant.length ? notVariant : c;
  return c.length === 1 ? c[0] : (new Set(c.map(x => x.amount)).size === 1 ? c[0] : null);
}

/* メニューから実行 */
function fillFromCardrushNow() { fillFromCardrush_(true); }

function fillFromCardrush_(interactive) {
  const say = m => { if (interactive) SpreadsheetApp.getUi().alert(m); else console.log(m); };
  let data;
  try { data = crFetchAll_(); } catch (e) { say(String(e.message || e)); return 0; }
  const idx = crIndex_(data.rows);
  const ss = SpreadsheetApp.getActive();

  // カード一覧：V列に比較用の価格
  const list = ss.getSheetByName('カード一覧'), n = list.getLastRow() - 1;
  if (list.getMaxColumns() < 22) list.insertColumnsAfter(list.getMaxColumns(), 22 - list.getMaxColumns());
  list.getRange(1, 22).setValue('▼CR買取価格').setFontWeight('bold').setBackground('#7A6A00').setFontColor('#FFFFFF');
  const mine = list.getRange(2, 1, n, 3).getDisplayValues();
  let hit = 0;
  list.getRange(2, 22, n, 1).setValues(mine.map(r => { const m = crPick_(idx, r[0], r[1], r[2]); if (m) hit++; return [m ? m.amount : '']; }));

  // 買取表：未入力 or 前回カードラッシュ由来の行を更新
  const buy = ss.getSheetByName('買取表');
  const head = buy.getRange(1, 1, 1, buy.getLastColumn()).getDisplayValues()[0];
  let cSrc = head.indexOf('▼価格の出所') + 1;
  if (!cSrc) { cSrc = buy.getLastColumn() + 1; if (buy.getMaxColumns() < cSrc) buy.insertColumnAfter(buy.getMaxColumns());
    buy.getRange(1, cSrc).setValue('▼価格の出所').setFontWeight('bold').setBackground('#7A6A00').setFontColor('#FFFFFF'); }
  const last = Math.max(buy.getLastRow(), 2);
  const b = buy.getRange(2, 1, last - 1, 4).getDisplayValues();
  const prices = buy.getRange(2, 5, last - 1, 1).getValues();
  const src = buy.getRange(2, cSrc, last - 1, 1).getValues();
  const filled = [];
  b.forEach((r, i) => {
    if (!r[0]) return;
    const blank = prices[i][0] === '' || prices[i][0] === null;
    if (!blank && src[i][0] !== 'カードラッシュ') { if (!src[i][0]) src[i][0] = '手入力/POS'; return; }
    const m = crPick_(idx, r[0], r[1], r[2]);
    if (!m) { if (blank) src[i][0] = '取得できず'; return; }
    if (Number(prices[i][0]) !== m.amount) filled.push(r[2] + '（' + r[0] + ' ' + r[1] + '）→ ' + m.amount + '円');
    prices[i][0] = m.amount; src[i][0] = 'カードラッシュ';
  });
  buy.getRange(2, 5, last - 1, 1).setValues(prices);
  buy.getRange(2, cSrc, last - 1, 1).setValues(src);
  say('カードラッシュの買取価格を取得しました（' + data.rows.length + '件・' + data.updatedAt + '時点）\n' +
      'カード一覧：' + hit + ' 枚に比較用の価格を入力\n' +
      '買取表：' + filled.length + ' 件の未入力価格を補完' + (filled.length ? '\n' + filled.slice(0, 15).join('\n') : ''));
  return filled.length;
}
