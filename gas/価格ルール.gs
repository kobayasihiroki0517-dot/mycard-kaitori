/** 価格ルール
 *  ・カードラッシュに金額あり → POSとカードラッシュの安い方 × 在庫の割合 → 10円単位で切り捨て
 *  ・カードラッシュに金額なし → 「買取保証」。保証額は価格ルールシートの表（在庫に関係なく固定）
 *  結果はカード一覧の「▼表示価格」「▼価格区分」に書き、買取表の「POS連動」○の行にも反映する
 */
const TRAINERS_ = ['グッズ', 'ポケモンのどうぐ', 'サポート', 'スタジアム'];
const splitList_ = s => String(s).split(/[,、，\s]+/).map(x => x.trim()).filter(Boolean);
/** カード一覧の「種類」（ワザ・特性など）をWebと同じ6種類にそろえる */
function kindOf_(k) {
  k = String(k || '');
  if (k === 'ワザ' || k === '特性' || k === 'ポケモン') return 'ポケモン';
  if (k.indexOf('エネルギー') >= 0) return 'エネルギー';
  return k;
}
/** 「トレーナーズ」を4種類に広げる */
function kindList_(s) {
  const out = [];
  splitList_(s).forEach(x => x === 'トレーナーズ' ? TRAINERS_.forEach(t => out.push(t)) : out.push(x));
  return out;
}
/** 価格ルールシート：A〜E 買取保証の表 ／ G〜H 在庫による割合 */
function readRules_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('価格ルール');
  if (!sh) throw new Error('「価格ルール」シートがありません');
  const v = sh.getRange(3, 1, 10, 8).getDisplayValues();
  const guarantee = v.filter(r => r[0] && String(r[4]).trim() !== '').map(r => {
    const amt = String(r[4]).trim(), digits = amt.replace(/[¥￥,，円\s]/g, '');
    return {
      rr: splitList_(r[0]),
      regs: splitList_(r[1]).map(x => x.toUpperCase()),
      kinds: kindList_(r[2]),
      exclude: kindList_(r[3]),
      amount: /^\d+$/.test(digits) ? Number(digits) : amt     // 数字なら金額、それ以外（1cm10円など）は文字のまま
    };
  });
  const ratio = v.filter(r => r[6] !== '' && r[7] !== '').map(r => ({ min: Number(r[6]), pct: Number(String(r[7]).replace(/[^\d.]/g, '')) }))
                 .sort((a, b) => a.min - b.min);
  // J3：割合込みの価格がこの金額以下なら「買取保証」に切り替える（空欄なら切り替えない）
  const low = String(sh.getRange('J3').getDisplayValue()).replace(/[^\d]/g, '');
  return { guarantee: guarantee, ratio: ratio, lowLimit: low === '' ? null : Number(low) };
}
function ratioFor_(rules, stock) {
  let pct = 100;
  rules.ratio.forEach(r => { if (stock >= r.min) pct = r.pct; });
  return pct;
}
/** 上の行から順に判定し、最初に当てはまった行の保証額（「それ以外」はどのレアリティにも当てはまる） */
function guaranteeFor_(rules, rr, reg, kind) {
  kind = kindOf_(kind); reg = String(reg).toUpperCase();
  const g = rules.guarantee.find(x =>
    (x.rr.indexOf(rr) >= 0 || x.rr.indexOf('それ以外') >= 0) &&
    (!x.regs.length || x.regs.indexOf(reg) >= 0) &&
    (!x.kinds.length || x.kinds.indexOf(kind) >= 0) &&
    x.exclude.indexOf(kind) < 0);
  return g ? g.amount : '';
}
/** 1枚分の価格を決める（戻り値: [表示価格, 区分]） */
function priceFor_(rules, pos, cr, stock, rr, reg, kind) {
  pos = Number(pos) || 0; cr = Number(cr) || 0;
  if (cr > 0) {
    const base = pos > 0 ? Math.min(pos, cr) : cr;
    const p = Math.floor(base * ratioFor_(rules, Number(stock) || 0) / 100 / 10) * 10;
    // 割合込みで安くなりすぎたカードは買取保証に格下げ
    if (rules.lowLimit !== null && rules.lowLimit !== undefined && p <= rules.lowLimit)
      return [guaranteeFor_(rules, rr, reg, kind), '買取保証'];
    // 買取保証の対象カードで、価格が保証額以下なら「買取保証」表示（例：RR 保証10円 → 10円以下は買取保証）
    const g = guaranteeFor_(rules, rr, reg, kind);
    if (typeof g === 'number' && g > 0 && p <= g) return [g, '買取保証'];
    return [p, '通常'];
  }
  return [guaranteeFor_(rules, rr, reg, kind), '買取保証'];
}

function applyPriceRulesNow() { applyPriceRules_(true); }

function applyPriceRules_(interactive) {
  const say = m => { if (interactive) SpreadsheetApp.getUi().alert(m); else console.log(m); };
  let rules;
  try { rules = readRules_(); } catch (e) { say(String(e.message || e)); return 0; }
  const ss = SpreadsheetApp.getActive();
  const list = ss.getSheetByName('カード一覧'), n = list.getLastRow() - 1;
  if (list.getMaxColumns() < 24) list.insertColumnsAfter(list.getMaxColumns(), 24 - list.getMaxColumns());
  list.getRange(1, 23, 1, 2).setValues([['▼表示価格', '▼価格区分']]).setFontWeight('bold').setBackground('#7A6A00').setFontColor('#FFFFFF');
  const v = list.getRange(2, 1, n, 22).getDisplayValues();
  const out = [], map = {};
  let normal = 0, guar = 0;
  v.forEach(r => {
    const num = s => String(s).replace(/[^\d]/g, '');
    const res = priceFor_(rules, num(r[16]), num(r[21]), num(r[20]), r[4], r[3], r[8]);
    out.push(res);
    res[1] === '通常' ? normal++ : guar++;
    map[[r[0], r[1], r[2], r[3]].join('|')] = res;
  });
  list.getRange(2, 23, n, 2).setValues(out);

  // 買取表：「POS連動」○の行に反映
  const buy = ss.getSheetByName('買取表');
  const head = buy.getRange(1, 1, 1, buy.getLastColumn()).getDisplayValues()[0];
  const cLink = head.indexOf('POS連動') + 1;
  let cSrc = head.indexOf('▼価格の出所') + 1;
  if (!cSrc) { cSrc = buy.getLastColumn() + 1; if (buy.getMaxColumns() < cSrc) buy.insertColumnAfter(buy.getMaxColumns());
    buy.getRange(1, cSrc).setValue('▼価格の出所').setFontWeight('bold').setBackground('#7A6A00').setFontColor('#FFFFFF'); }
  const last = Math.max(buy.getLastRow(), 2);
  const b = buy.getRange(2, 1, last - 1, Math.max(cLink, 4)).getDisplayValues();
  const prices = buy.getRange(2, 5, last - 1, 1).getValues();
  const src = buy.getRange(2, cSrc, last - 1, 1).getValues();
  let upd = 0;
  b.forEach((r, i) => {
    if (!r[0] || !cLink || r[cLink - 1] !== '○') return;
    const res = map[[r[0], r[1], r[2], r[3]].join('|')];
    if (!res) return;
    if (prices[i][0] !== res[0]) upd++;
    prices[i][0] = res[0]; src[i][0] = res[1] === '通常' ? 'ルール（POS/CR）' : '買取保証';
  });
  buy.getRange(2, 5, last - 1, 1).setValues(prices);
  buy.getRange(2, cSrc, last - 1, 1).setValues(src);
  say('価格ルールを適用しました\n通常価格：' + normal + ' 枚／買取保証：' + guar + ' 枚\n買取表：' + upd + ' 件の価格を更新');
  return upd;
}
