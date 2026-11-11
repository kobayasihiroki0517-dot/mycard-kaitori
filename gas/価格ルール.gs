/** 価格ルール
 *  ・カードラッシュに金額あり → POSとカードラッシュの安い方 × 在庫の割合 → 10円単位で切り捨て
 *  ・カードラッシュに金額なし → 「買取保証」。保証額は価格ルールシートの表（在庫に関係なく固定）
 *  結果はカード一覧の「▼表示価格」「▼価格区分」に書き、買取表の「POS連動」○の行にも反映する
 */
function readRules_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('価格ルール');
  if (!sh) throw new Error('「価格ルール」シートがありません');
  const v = sh.getRange(3, 1, 10, 7).getDisplayValues();
  const guarantee = v.filter(r => r[0] && r[3] !== '').map(r => ({
    rr: r[0].trim(),
    regs: r[1].split(/[,、\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean),
    exclude: r[2].split(/[,、\s]+/).map(s => s.trim()).filter(Boolean),
    amount: Number(String(r[3]).replace(/[^\d]/g, '')) || 0
  }));
  const ratio = v.filter(r => r[5] !== '' && r[6] !== '').map(r => ({ min: Number(r[5]), pct: Number(String(r[6]).replace(/[^\d.]/g, '')) }))
                 .sort((a, b) => a.min - b.min);
  return { guarantee: guarantee, ratio: ratio };
}
function ratioFor_(rules, stock) {
  let pct = 100;
  rules.ratio.forEach(r => { if (stock >= r.min) pct = r.pct; });
  return pct;
}
function guaranteeFor_(rules, rr, reg, kind) {
  const g = rules.guarantee.find(x => x.rr === rr && (!x.regs.length || x.regs.indexOf(String(reg).toUpperCase()) >= 0) &&
                                       x.exclude.indexOf(kind) < 0);
  return g ? g.amount : '';
}
/** 1枚分の価格を決める（戻り値: [表示価格, 区分]） */
function priceFor_(rules, pos, cr, stock, rr, reg, kind) {
  pos = Number(pos) || 0; cr = Number(cr) || 0;
  if (cr > 0) {
    const base = pos > 0 ? Math.min(pos, cr) : cr;
    let p = Math.floor(base * ratioFor_(rules, Number(stock) || 0) / 100 / 10) * 10;
    if (p <= 0 && base >= 10) p = 10;
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
