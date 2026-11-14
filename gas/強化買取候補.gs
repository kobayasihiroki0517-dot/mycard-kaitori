/** 強化買取候補
 *  在庫0枚（POSの在庫一覧にない／在庫数0）のカードのうち、表示価格が設定額以上のものを
 *  「強化買取候補」シートに高い順で一覧にする。チェックしたカードは買取表で「掲載」「目玉」を○にする。
 */
const CAND_SHEET = '強化買取候補';
const CAND_HEAD = ['追加', '画像', 'エキスパンション', '番号', 'カード名', 'レギュレーション', 'レアリティ', '種類', '表示価格', 'POS在庫', '強化買取中'];
const CAND_MAX = 500;   // 一覧に出す最大件数

function candSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CAND_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(CAND_SHEET, 2);
  sh.getRange('A1').setValue('【強化買取候補】在庫0枚のカード（表示価格の高い順）').setFontWeight('bold').setFontSize(13);
  sh.getRange('F1').setValue('表示価格がこの金額以上').setHorizontalAlignment('right');
  sh.getRange('G1').setValue(1000).setBackground('#FFF2CC').setFontWeight('bold').setNumberFormat('#,##0"円"');
  sh.getRange('A2').setValue('※「追加」にチェック →「買取表ツール」→「チェックした候補を強化買取にする」で、買取表の「掲載」「目玉」が○になります。買取保証のカードは候補に出しません。')
    .setFontSize(9).setFontColor('#595757');
  sh.getRange(3, 1, 1, CAND_HEAD.length).setValues([CAND_HEAD]).setFontWeight('bold').setBackground('#231916').setFontColor('#FFFFFF');
  sh.setFrozenRows(3);
  sh.setColumnWidth(1, 44); sh.setColumnWidth(2, 70); sh.setColumnWidth(5, 220);
  return sh;
}

function updateCandidatesNow() {
  const n = updateCandidates_();
  SpreadsheetApp.getActive().getSheetByName(CAND_SHEET).activate();
  SpreadsheetApp.getUi().alert('強化買取候補を更新しました：' + n + ' 枚');
}

function updateCandidates_() {
  const ss = SpreadsheetApp.getActive();
  const sh = candSheet_();
  const min = Number(String(sh.getRange('G1').getDisplayValue()).replace(/[^\d]/g, '')) || 0;
  const list = ss.getSheetByName('カード一覧');
  const head = list.getRange(1, 1, 1, list.getLastColumn()).getDisplayValues()[0];
  const ix = h => head.indexOf(h);
  const cPrice = ix('▼表示価格'), cCls = ix('▼価格区分'), cStock = ix('▼POS在庫数');
  if (cPrice < 0 || cCls < 0) throw new Error('先に「価格ルールを適用（再計算）」を実行してください');
  const v = list.getRange(2, 1, list.getLastRow() - 1, list.getLastColumn()).getDisplayValues();

  // 買取表で強化買取中（掲載○・目玉○）のカード
  const feat = featuredKeys_();
  const num = s => Number(String(s).replace(/[^\d]/g, '')) || 0;
  const rows = v.filter(r => r[0] && r[cCls] === '通常' && num(r[cStock]) === 0 && num(r[cPrice]) >= min)
    .sort((a, b) => num(b[cPrice]) - num(a[cPrice])).slice(0, CAND_MAX)
    .map(r => {
      const key = [r[0], r[1], r[2], r[3]].join('|');
      return [false, '', r[0], r[1], r[2], r[3], r[ix('レアリティ')], kindOf_(r[ix('種類')]), num(r[cPrice]),
              r[cStock] === '' ? 0 : num(r[cStock]), feat.has(key) ? '○' : '', r[ix('画像URL（ドライブ）')]];
    });

  // 書き込み（前回分は消してから）
  const old = sh.getLastRow();
  if (old > 3) { sh.getRange(4, 1, old - 3, CAND_HEAD.length).clearContent().removeCheckboxes(); }
  if (rows.length) {
    sh.getRange(4, 4, rows.length, 1).setNumberFormat('@');
    sh.getRange(4, 1, rows.length, CAND_HEAD.length).setValues(rows.map(r => r.slice(0, CAND_HEAD.length)));
    sh.getRange(4, 1, rows.length, 1).insertCheckboxes();
    sh.getRange(4, 2, rows.length, 1).setFormulas(rows.map(r => [r[11] ? '=IMAGE("' + r[11] + '=w200")' : '']));
    sh.getRange(4, 9, rows.length, 1).setNumberFormat('"¥"#,##0');
    sh.setRowHeights(4, rows.length, 90);
  }
  sh.getRange('I1').setValue('更新：' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d HH:mm')).setFontColor('#595757');
  return rows.length;
}

function featuredKeys_() {
  const buy = SpreadsheetApp.getActive().getSheetByName('買取表');
  const head = buy.getRange(1, 1, 1, buy.getLastColumn()).getDisplayValues()[0];
  const cShow = head.indexOf('掲載'), cFeat = head.indexOf('目玉');
  const set = new Set();
  if (buy.getLastRow() < 2) return set;
  const ok = s => ['○', '◯', 'o', 'O'].indexOf(String(s).trim()) >= 0;
  buy.getRange(2, 1, buy.getLastRow() - 1, buy.getLastColumn()).getDisplayValues()
    .forEach(r => { if (r[0] && ok(r[cShow]) && ok(r[cFeat])) set.add([r[0], r[1], r[2], r[3]].join('|')); });
  return set;
}

/* メニュー：チェックした候補を強化買取にする（買取表の「掲載」「目玉」を○。買取表にないカードは追加） */
function promoteCandidates() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CAND_SHEET);
  if (!sh || sh.getLastRow() < 4) { ui.alert('先に「強化買取候補を更新」を実行してください。'); return; }
  const v = sh.getRange(4, 1, sh.getLastRow() - 3, CAND_HEAD.length).getValues();
  const picked = v.map((r, i) => ({ r: r, i: i })).filter(x => x.r[0] === true);
  if (!picked.length) { ui.alert('「追加」にチェックが入っている候補がありません。'); return; }

  const buy = ss.getSheetByName('買取表');
  const head = buy.getRange(1, 1, 1, buy.getLastColumn()).getDisplayValues()[0];
  const cShow = head.indexOf('掲載') + 1, cFeat = head.indexOf('目玉') + 1, cLink = head.indexOf('POS連動') + 1;
  const last = Math.max(buy.getLastRow(), 1);
  const cur = last > 1 ? buy.getRange(2, 1, last - 1, 4).getDisplayValues() : [];
  const rowOf = {};
  cur.forEach((r, i) => { if (r[0]) rowOf[r.join('|')] = i + 2; });
  let next = last + 1, added = 0, updated = 0;
  picked.forEach(x => {
    const r = x.r, key = [r[2], String(r[3]), r[4], r[5]].join('|');
    let row = rowOf[key];
    if (!row) {
      row = next++;
      buy.getRange(row, 2).setNumberFormat('@');
      buy.getRange(row, 1, 1, 5).setValues([[r[2], String(r[3]), r[4], r[5], r[8]]]);
      added++;
    } else updated++;
    buy.getRange(row, cShow).setValue('○');
    buy.getRange(row, cFeat).setValue('○');
    if (cLink) buy.getRange(row, cLink).setValue('○');
    sh.getRange(4 + x.i, 1).setValue(false);
    sh.getRange(4 + x.i, 11).setValue('○');
  });
  ui.alert('強化買取にしました：' + picked.length + ' 枚（買取表に追加 ' + added + ' 枚／既存の行を更新 ' + updated + ' 枚）\n' +
           'Webに反映するには「買取表を更新（Web・印刷用PDF）」を押してください（毎日の自動更新でも反映されます）。');
}
