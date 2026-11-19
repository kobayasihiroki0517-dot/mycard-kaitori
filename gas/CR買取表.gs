/** CR買取表（Webに載せる一覧）
 *  基準はすべてカードラッシュ（cardrush.media）の買取価格一覧（スタンダード）。
 *  ・表記（エキスパンション・型番・カード名・仕様・レアリティ）はカードラッシュのまま、全件を載せる
 *  ・表示価格＝カードラッシュ価格 ×「基準の割合」（価格ルールJ8・初期80%）× 在庫による割合 → 10円単位で切り捨て
 *  ・画像はドライブのカード画像（公式カードと照合できたもの）。照合できないものは画像なし（Webでは「準備中」）
 *  ・カードラッシュに載っていない公式カードは、これまでどおり「買取保証」として載せる
 */
const CRB_SHEET = 'CR買取表';
const CRB_HEAD = ['エキスパンション', '型番', 'カード名', '仕様', 'レアリティ', '種類', 'CR価格', 'POS在庫', '在庫割合', '表示価格', '区分', '画像URL', '照合キー', '強化買取', '出所'];
let CR_ROWS_CACHE = null;   // 同じ実行の中でカードラッシュを取り直さないため

function crNorm_(s) { return String(s || '').replace(/[\s　]/g, '').replace(/[（(].*?[）)]/g, ''); }
function isMirror_(s) { return /ミラー|ボール/.test(String(s || '')); }

/* POSの在庫：CRの1行（通常／ミラーなど）に対応する在庫数を返す関数 */
function posStockFinder_() {
  const f = latestCsv_('item'), fs = latestCsv_('stock');
  if (!f || !fs) return () => '';
  const stock = {};
  const sr = readCsv_(fs), sh = sr[0], sId = sh.indexOf('商品マスタID'), sQ = sh.indexOf('在庫数');
  for (let i = 1; i < sr.length; i++) if (sr[i][sId]) stock[sr[i][sId]] = (stock[sr[i][sId]] || 0) + (Number(sr[i][sQ]) || 0);
  const rows = readCsv_(f), h = rows[0], c = n => h.indexOf(n);
  const cE = c('エキスパンション'), cN = c('カード番号'), cName = c('商品名'), cR = c('レアリティ'), cId = c('商品マスタID');
  const idx = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], m = /^(\w+)/.exec(r[cN] || '');
    if (!r[cE] || !m) continue;
    const k = crExp_(r[cE]) + '|' + m[1] + '|' + crNorm_(r[cName]);
    (idx[k] = idx[k] || []).push({ rr: r[cR] || '', q: stock[r[cId]] || 0 });
  }
  return (exp, num, name, spec) => {
    const c2 = idx[crExp_(exp) + '|' + num + '|' + crNorm_(name)];
    if (!c2) return '';
    let hit;
    if (isMirror_(spec)) hit = c2.find(x => x.rr === spec) || (spec === 'ミラー' ? c2.find(x => isMirror_(x.rr)) : null);
    else hit = c2.find(x => !isMirror_(x.rr));
    return hit ? hit.q : '';
  };
}

function buildCrSheet_(rules) {
  const ss = SpreadsheetApp.getActive();
  const rows = CR_ROWS_CACHE || (CR_ROWS_CACHE = crFetchAll_().rows);
  const sh = ss.getSheetByName(CRB_SHEET) || ss.insertSheet(CRB_SHEET, 2);

  // 公式カード（カード一覧）の索引：エキスパンション|番号|名前 → 行
  const list = ss.getSheetByName('カード一覧');
  const lh = list.getRange(1, 1, 1, list.getLastColumn()).getDisplayValues()[0];
  const lv = list.getRange(2, 1, list.getLastRow() - 1, list.getLastColumn()).getDisplayValues();
  const L = n => lh.indexOf(n);
  const cImg = L('画像URL（ドライブ）'), cKind = L('種類'), cPrice = L('▼表示価格'), cCls = L('▼価格区分'), cStock = L('▼POS在庫数');
  const official = {};
  lv.forEach((r, i) => { if (r[0]) official[crExp_(r[0]) + '|' + r[1] + '|' + crNorm_(r[2])] = i; });
  const feat = featuredKeys_();
  const findStock = posStockFinder_();
  const rel = releaseMap_(), now = new Date();

  const out = [], usedOfficial = new Set();
  rows.forEach(x => {
    const mm = /^(\w+)(?:\/([\w-]+))?/.exec(x.model_number || '');
    if (!mm) return;
    let exp = x.pack_code;
    if ((exp === 'PROMO' || exp === 'その他') && mm[2] && /-P$/i.test(mm[2])) exp = mm[2];
    const spec = x.extra_difference === 'ノーマル仕様' ? '' : (x.extra_difference || '');
    const oi = official[crExp_(exp) + '|' + mm[1] + '|' + crNorm_(x.name)];
    const o = oi === undefined ? null : lv[oi];
    if (o && !spec) usedOfficial.add(oi);
    const code = o ? o[0] : exp;
    const reg = o ? o[3] : '';
    const kind = o ? kindOf_(o[cKind]) : '';
    const key = o ? [o[0], o[1], o[2], o[3]].join('|') : '';
    let stock = findStock(code, mm[1], x.name, spec);
    if (stock === '' && o && !spec) stock = o[cStock] === '' ? '' : Number(o[cStock]) || 0;
    const res = priceFor_(rules, 0, Number(x.amount) || 0, stock, x.rarity || (o ? o[4] : ''), reg, kind);
    out.push([code, x.model_number, x.name, spec, x.rarity || (o ? o[4] : ''), kind, Number(x.amount) || 0,
              stock, res[1] === '通常' ? ratioFor_(rules, Number(stock) || 0) + '%' : '', res[0], res[1],
              o ? o[cImg] : '', key, key && !spec && feat.has(key) ? '○' : '', 'カードラッシュ']);
  });
  // カードラッシュに通常版が載っていない公式カード → 買取保証（これまでどおり）
  lv.forEach((r, i) => {
    if (!r[0] || usedOfficial.has(i) || r[cCls] !== '買取保証') return;
    const key = [r[0], r[1], r[2], r[3]].join('|');
    out.push([r[0], r[ix_(lh, '番号表記')] || r[1], r[2], '', r[4], kindOf_(r[cKind]), '', r[cStock], '', r[cPrice], '買取保証',
              r[cImg], key, feat.has(key) ? '○' : '', '公式（カードラッシュ掲載なし）']);
  });

  if (sh.getFilter()) sh.getFilter().remove();
  sh.clearContents();
  sh.getRange(1, 1, 1, CRB_HEAD.length).setValues([CRB_HEAD]).setFontWeight('bold').setBackground('#231916').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (out.length) {
    if (sh.getMaxRows() < out.length + 1) sh.insertRowsAfter(sh.getMaxRows(), out.length + 1 - sh.getMaxRows());
    sh.getRange(2, 2, out.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, out.length, CRB_HEAD.length).setValues(out);
    sh.getRange(1, 1, out.length + 1, CRB_HEAD.length).createFilter();
  }
  PropertiesService.getDocumentProperties().setProperty('CRB_LAST', out.length + ' 件（カードラッシュ ' + rows.length + ' 件）');
  return out.length;
}
function ix_(head, name) { return head.indexOf(name); }

function buildCrSheetNow() {
  const n = buildCrSheet_(readRules_());
  SpreadsheetApp.getUi().alert('CR買取表を作り直しました：' + n + ' 件\nWebに反映するには「買取表を更新（Web・印刷用PDF）」を押してください。');
}
