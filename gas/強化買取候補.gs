/** 強化買取候補
 *  在庫0枚（POSの在庫一覧にない／在庫数0）のカードのうち、右側の「候補の条件」に当てはまるものを
 *  「強化買取候補」シートに一覧にする（条件の順 → 表示価格の高い順）。チェックしたカードは買取表で「掲載」「目玉」を○にする。
 */
const CAND_SHEET = '強化買取候補';
const CAND_HEAD = ['追加', '画像', 'エキスパンション', '番号', 'カード名', 'レギュレーション', 'レアリティ', '種類', '表示価格', 'POS在庫', '強化買取中', '該当条件'];
const CAND_MAX = 300;   // 条件1つあたりの最大件数
const COND_COL = 14;    // 条件の表：N列〜Q列（3行目が見出し、4〜9行目が条件）
const COND_HEAD = ['対象レアリティ（空欄＝すべて）', '対象の種類（空欄＝すべて）', '表示価格（円以上）', '表示価格（円以下・空欄＝上限なし）'];

function candSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CAND_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(CAND_SHEET, 2);
  sh.getRange('A1').setValue('【強化買取候補】在庫0枚のカード（表示価格の高い順）').setFontWeight('bold').setFontSize(13);
  sh.getRange('A2').setValue('※「追加」にチェック →「買取表ツール」→「チェックした候補を強化買取にする」で、買取表の「掲載」「目玉」が○になります。候補の条件は右側の黄色い表で変えられます。買取保証のカードは候補に出しません。')
    .setFontSize(9).setFontColor('#595757');
  sh.getRange(3, 1, 1, CAND_HEAD.length).setValues([CAND_HEAD]).setFontWeight('bold').setBackground('#231916').setFontColor('#FFFFFF');
  sh.setFrozenRows(3);
  sh.setColumnWidth(1, 44); sh.setColumnWidth(2, 70); sh.setColumnWidth(5, 220);
  ensureCondTable_(sh, 1000);
  return sh;
}

/* 右側に「候補の条件」の表を用意（以前のG1の金額設定があれば条件1に引き継ぐ） */
function ensureCondTable_(sh, firstMin) {
  if (sh.getRange(3, COND_COL).getDisplayValue() === COND_HEAD[0]) return;
  const g1 = String(sh.getRange('G1').getDisplayValue()).replace(/[^\d]/g, '');
  if (g1) { firstMin = Number(g1); sh.getRange('F1:G1').clearContent().clearFormat(); }
  sh.getRange(2, COND_COL).setValue('【候補の条件】在庫0枚で、どれかの行に当てはまるカードを候補にします（1行＝1条件）').setFontWeight('bold');
  sh.getRange(3, COND_COL - 1, 1, 5).setValues([['条件'].concat(COND_HEAD)]).setFontWeight('bold').setBackground('#231916').setFontColor('#FFFFFF').setWrap(true);
  sh.getRange(4, COND_COL - 1, 6, 5).setValues([
    [1, '', '', firstMin || 1000, ''],
    [2, '', 'トレーナーズ', 10, 999],
    [3, '', 'ポケモン', 10, 999],
    [4, '', '', '', ''], [5, '', '', '', ''], [6, '', '', '', '']]);
  sh.getRange(4, COND_COL, 6, 4).setBackground('#FFF2CC');
  sh.getRange(10, COND_COL).setValue('※種類：ポケモン／トレーナーズ（＝グッズ・ポケモンのどうぐ・サポート・スタジアム）／グッズ／ポケモンのどうぐ／サポート／スタジアム／エネルギー。レアリティは「C,U」のようにカンマ区切りで複数指定できます。')
    .setFontSize(9).setFontColor('#595757').setWrap(true);
  sh.setColumnWidth(COND_COL - 1, 44);
  for (let c = 0; c < 4; c++) sh.setColumnWidth(COND_COL + c, 150);
}

function readConds_(sh) {
  return sh.getRange(4, COND_COL, 6, 4).getDisplayValues().map((r, i) => ({
    no: i + 1,
    rr: splitList_(r[0]),
    kinds: kindList_(r[1]),
    min: r[2] === '' ? null : Number(String(r[2]).replace(/[^\d]/g, '')),
    max: r[3] === '' ? null : Number(String(r[3]).replace(/[^\d]/g, ''))
  })).filter(c => c.rr.length || c.kinds.length || c.min !== null || c.max !== null);
}

function updateCandidatesNow() {
  const n = updateCandidates_();
  SpreadsheetApp.getActive().getSheetByName(CAND_SHEET).activate();
  SpreadsheetApp.getUi().alert('強化買取候補を更新しました：' + n + ' 枚');
}

function updateCandidates_() {
  const ss = SpreadsheetApp.getActive();
  const sh = candSheet_();
  ensureCondTable_(sh, 1000);
  const conds = readConds_(sh);
  const list = ss.getSheetByName('カード一覧');
  const head = list.getRange(1, 1, 1, list.getLastColumn()).getDisplayValues()[0];
  const ix = h => head.indexOf(h);
  const cPrice = ix('▼表示価格'), cCls = ix('▼価格区分'), cStock = ix('▼POS在庫数');
  if (cPrice < 0 || cCls < 0) throw new Error('先に「価格ルールを適用（再計算）」を実行してください');
  const v = list.getRange(2, 1, list.getLastRow() - 1, list.getLastColumn()).getDisplayValues();

  // 買取表で強化買取中（掲載○・目玉○）のカード
  const feat = featuredKeys_();
  const num = s => Number(String(s).replace(/[^\d]/g, '')) || 0;
  const cRr = ix('レアリティ'), cKind = ix('種類');
  const used = new Set(), rows = [];
  conds.forEach(cd => {
    v.filter(r => {
      if (!r[0] || r[cCls] !== '通常' || num(r[cStock]) !== 0) return false;
      const p = num(r[cPrice]);
      return (cd.min === null || p >= cd.min) && (cd.max === null || p <= cd.max) &&
             (!cd.rr.length || cd.rr.indexOf(r[cRr]) >= 0) &&
             (!cd.kinds.length || cd.kinds.indexOf(kindOf_(r[cKind])) >= 0);
    }).sort((a, b) => num(b[cPrice]) - num(a[cPrice])).slice(0, CAND_MAX).forEach(r => {
      const key = [r[0], r[1], r[2], r[3]].join('|');
      if (used.has(key)) return;   // 先の条件で出したカードは重複させない
      used.add(key);
      rows.push([false, '', r[0], r[1], r[2], r[3], r[cRr], kindOf_(r[cKind]), num(r[cPrice]),
                 r[cStock] === '' ? 0 : num(r[cStock]), feat.has(key) ? '○' : '', cd.no, r[ix('画像URL（ドライブ）')]]);
    });
  });

  // 書き込み（前回分は消してから）
  sh.getRange(3, 1, 1, CAND_HEAD.length).setValues([CAND_HEAD]).setFontWeight('bold').setBackground('#231916').setFontColor('#FFFFFF');
  const old = sh.getLastRow();
  if (old > 3) { sh.getRange(4, 1, old - 3, CAND_HEAD.length).clearContent().removeCheckboxes(); }
  if (rows.length) {
    sh.getRange(4, 4, rows.length, 1).setNumberFormat('@');
    sh.getRange(4, 1, rows.length, CAND_HEAD.length).setValues(rows.map(r => r.slice(0, CAND_HEAD.length)));
    sh.getRange(4, 1, rows.length, 1).insertCheckboxes();
    sh.getRange(4, 2, rows.length, 1).setFormulas(rows.map(r => [r[12] ? '=IMAGE("' + r[12] + '=w200")' : '']));
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
