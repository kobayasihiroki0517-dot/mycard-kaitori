/** POS（Mycalinks）商品マスタCSV → 管理シート 連携
 *  ・ドライブの「POS取込」フォルダに置いた最新CSVを読み込む
 *  ・カード一覧に POS買取価格／販売価格／照合結果 を書き込む
 *  ・買取表で「POS連動」が○の行は、買取価格をPOSの値に自動更新する
 */
const POS_FOLDER = 'POS取込';
const POS_HEAD = ['▼POS買取価格', '▼POS販売価格', '▼POS照合', '▼POS商品ID', '▼POS在庫数'];

function posFolder_() {
  const ss = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  const parent = ss.getParents().hasNext() ? ss.getParents().next() : DriveApp.getRootFolder();
  const it = parent.getFoldersByName(POS_FOLDER);
  return it.hasNext() ? it.next() : parent.createFolder(POS_FOLDER);
}
/* kind: 'item'（商品マスタ）／'stock'（在庫一覧）。POSのファイル名の先頭で見分ける */
function latestCsv_(kind) {
  let best = null;
  const it = posFolder_().getFiles();
  while (it.hasNext()) {
    const f = it.next(), n = f.getName();
    if (!/\.csv$/i.test(n)) continue;
    const isStock = /^stock/i.test(n) || /在庫/.test(n);
    if ((kind === 'stock') !== isStock) continue;
    if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
  }
  return best;
}
function readCsv_(f) {
  const t = f.getBlob().getDataAsString('UTF-8').replace(/^\uFEFF/, '');
  return Utilities.parseCsv(t);
}

/* メニューから実行 */
function importPosNow() { importPos_(true, true); }
/* 定時トリガーから実行（新しいCSVがあるときだけ） */
function importPosScheduled() { importPos_(false, false); }

function importPos_(force, interactive) {
  const props = PropertiesService.getDocumentProperties();
  const f = latestCsv_('item'), fs = latestCsv_('stock');
  const say = m => { if (interactive) SpreadsheetApp.getUi().alert(m); else console.log(m); };
  if (!f) { say('ドライブの「' + POS_FOLDER + '」フォルダに商品マスタのCSV（item_〜.csv）がありません。\nPOSの「商品マスタ」→「ダウンロード」で出したCSVを入れてください。'); return; }
  const stamp = [f, fs].filter(Boolean).map(x => x.getId() + '@' + x.getLastUpdated().getTime()).join(',');
  if (!force && props.getProperty('POS_LAST') === stamp) return;   // 新しいCSVなし

  // 在庫一覧CSV → 商品マスタIDごとの在庫数・独自買取価格
  const stock = {}, ownBuy = {};
  if (fs) {
    const sr = readCsv_(fs), sh = sr[0];
    const sId = sh.indexOf('商品マスタID'), sQ = sh.indexOf('在庫数'), sOwn = sh.indexOf('買取価格（独自）');
    for (let i = 1; i < sr.length; i++) {
      const id = sr[i][sId]; if (!id) continue;
      stock[id] = (stock[id] || 0) + (Number(sr[i][sQ]) || 0);
      if (sOwn >= 0 && sr[i][sOwn] !== '') ownBuy[id] = Number(sr[i][sOwn]);
    }
  }
  const rows = readCsv_(f);
  const h = rows[0], col = n => h.indexOf(n);
  const cE = col('エキスパンション'), cN = col('カード番号'), cName = col('商品名'), cR = col('レアリティ'),
        cB = col('買取価格'), cS = col('販売店舗価格'), cId = col('商品マスタID');
  if ([cE, cN, cName, cB].some(i => i < 0)) { say('CSVの形式が想定と違います（エキスパンション／カード番号／商品名／買取価格の列が必要です）。'); return; }

  // POS索引：エキスパンション(大文字)|番号の頭
  const idx = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; const m = /^(\w+)/.exec(r[cN] || '');
    if (!r[cE] || !m) continue;
    const k = r[cE].toUpperCase() + '|' + m[1];
    (idx[k] = idx[k] || []).push(r);
  }
  const norm = s => String(s || '').replace(/\s/g, '');
  const pick = (exp, num, name, rr) => {
    let c = idx[String(exp).toUpperCase() + '|' + num] || [];
    if (!c.length) return [null, 'POSに該当なし'];
    c = c.filter(x => !/エラー|（.*?）/.test(x[cName])).length ? c.filter(x => !/エラー|（.*?）/.test(x[cName])) : c;
    let c2 = c.filter(x => norm(x[cName]) === norm(name));
    if (!c2.length) return [null, '名前不一致'];
    if (c2.length > 1) { const b = c2.filter(x => (x[cR] || '').indexOf('ミラー') < 0); if (b.length) c2 = b; }
    if (c2.length > 1 && rr) { const b = c2.filter(x => x[cR] === rr); if (b.length) c2 = b; }
    if (new Set(c2.map(x => x[cB])).size > 1) return [null, '候補複数'];
    return [c2[0], 'OK'];
  };

  // カード一覧に書き込み（Q〜T列）
  const ss = SpreadsheetApp.getActive();
  const list = ss.getSheetByName('カード一覧');
  const n = list.getLastRow() - 1;
  if (list.getMaxColumns() < 21) list.insertColumnsAfter(list.getMaxColumns(), 21 - list.getMaxColumns());
  list.getRange(1, 17, 1, 5).setValues([POS_HEAD]).setFontWeight('bold').setBackground('#7A6A00').setFontColor('#FFFFFF');
  const mine = list.getRange(2, 1, n, 5).getDisplayValues();
  const out = [], map = {}, qty = {}; let ok = 0;
  mine.forEach(r => {
    const [m, st] = pick(r[0], r[1], r[2], r[4]);
    if (!m) { out.push(['', '', st, '', '']); return; }
    const id = m[cId], price = (id in ownBuy) ? ownBuy[id] : (Number(m[cB]) || 0);
    const q = fs ? (stock[id] || 0) : '';
    out.push([price, Number(m[cS]) || 0, st, id, q]);
    ok++; const k = [r[0], r[1], r[2], r[3]].join('|'); map[k] = price; qty[k] = q;
  });
  list.getRange(2, 17, n, 5).setValues(out);

  // 買取表：「POS連動」が○の行の買取価格を更新
  const buy = ss.getSheetByName('買取表');
  const head = buy.getRange(1, 1, 1, buy.getLastColumn()).getDisplayValues()[0];
  let cLink = head.indexOf('POS連動') + 1;
  if (!cLink) { cLink = buy.getLastColumn() + 1; if (buy.getMaxColumns() < cLink) buy.insertColumnAfter(buy.getMaxColumns());
    buy.getRange(1, cLink).setValue('POS連動').setFontWeight('bold').setBackground('#222222').setFontColor('#FFFFFF'); }
  let cQty = buy.getRange(1, 1, 1, buy.getLastColumn()).getDisplayValues()[0].indexOf('▼在庫数（POS）') + 1;
  if (!cQty) { cQty = buy.getLastColumn() + 1; if (buy.getMaxColumns() < cQty) buy.insertColumnAfter(buy.getMaxColumns());
    buy.getRange(1, cQty).setValue('▼在庫数（POS）').setFontWeight('bold').setBackground('#7A6A00').setFontColor('#FFFFFF'); }
  const last = Math.max(buy.getLastRow(), 2);
  const b = buy.getRange(2, 1, last - 1, Math.max(cLink, 5)).getDisplayValues();
  const prices = buy.getRange(2, 5, last - 1, 1).getValues();
  const shows = buy.getRange(2, 6, last - 1, 1).getValues();
  const qcol = buy.getRange(2, cQty, last - 1, 1).getValues();
  const rule = props.getProperty('STOCK_RULE');            // 在庫がこの枚数以下なら掲載（空欄でオフ）
  const changes = [], showChg = [];
  b.forEach((r, i) => {
    if (!r[0]) return;
    const k = [r[0], r[1], r[2], r[3]].join('|');
    if (k in qty) qcol[i][0] = qty[k];
    if (r[cLink - 1] !== '○' || !(k in map)) return;
    if (Number(prices[i][0]) !== map[k]) { changes.push(r[2] + ' ' + (prices[i][0] || '空欄') + '→' + map[k]); prices[i][0] = map[k]; }
    if (rule !== null && rule !== '' && fs && qty[k] !== '') {
      const want = Number(qty[k]) <= Number(rule) ? '○' : '';
      if (shows[i][0] !== want) { showChg.push(r[2] + '（在庫' + qty[k] + '）' + (want ? '掲載' : '掲載外し')); shows[i][0] = want; }
    }
  });
  buy.getRange(2, 5, last - 1, 1).setValues(prices);
  buy.getRange(2, 6, last - 1, 1).setValues(shows);
  buy.getRange(2, cQty, last - 1, 1).setValues(qcol);

  props.setProperty('POS_LAST', stamp);
  props.setProperty('POS_LAST_AT', new Date().toISOString());
  const msg = 'POSから取り込みました（' + f.getName() + (fs ? '／' + fs.getName() : '／在庫CSVなし') + '）\n' +
    'カード一覧：' + ok + ' / ' + n + ' 枚が一致\n' +
    '買取表：' + changes.length + ' 件の価格を更新' + (changes.length ? '\n' + changes.slice(0, 15).join('\n') + (changes.length > 15 ? '\n…ほか' + (changes.length - 15) + '件' : '') : '') +
    (showChg.length ? '\n掲載の自動変更：' + showChg.length + ' 件\n' + showChg.slice(0, 10).join('\n') : '');
  say(msg);
  // POSで埋まらなかった未入力の価格をカードラッシュで補完
  const crFilled = fillFromCardrush_(interactive) + applyPriceRules_(interactive);
  // 定時実行で価格が変わったら、Web・PDFを自動で作り直す
  if (!interactive && (changes.length || showChg.length || crFilled) && props.getProperty('POS_AUTO_PUBLISH') === '1') dispatchQuiet_(false);
}

/* 定時取込のオン・オフ */
function enablePosSchedule() {
  const ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'importPosScheduled').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importPosScheduled').timeBased().everyHours(1).create();
  const r = ui.alert('定時取込をオンにしました', '価格が変わったときに、Webページと印刷用PDFも自動で作り直しますか？', ui.ButtonSet.YES_NO);
  PropertiesService.getDocumentProperties().setProperty('POS_AUTO_PUBLISH', r === ui.Button.YES ? '1' : '0');
  posFolder_();
  ui.alert('1時間ごとに「' + POS_FOLDER + '」フォルダの最新CSVを確認して取り込みます。');
}
function disablePosSchedule() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'importPosScheduled').forEach(t => ScriptApp.deleteTrigger(t));
  SpreadsheetApp.getUi().alert('定時取込をオフにしました。');
}

/* 画面を出さずにGitHubの作成処理を呼び出す（定時実行用） */
function dispatchQuiet_(postX) {
  const p = PropertiesService.getDocumentProperties();
  const repo = p.getProperty('GH_REPO'), token = p.getProperty('GH_TOKEN');
  if (!repo || !token) return;
  UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/actions/workflows/kaitori.yml/dispatches', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main', inputs: { post_x: postX } })
  });
}

/* 在庫ルールの設定：POS連動○の行について、在庫がN枚以下なら掲載○、多ければ掲載を外す */
function setStockRule() {
  const ui = SpreadsheetApp.getUi(), p = PropertiesService.getDocumentProperties();
  const cur = p.getProperty('STOCK_RULE');
  const r = ui.prompt('在庫による自動掲載',
    '「POS連動」が○のカードについて、在庫が何枚以下なら掲載○にしますか？\n' +
    '（例：0 → 在庫切れのカードだけ掲載。2 → 在庫2枚以下を掲載）\n' +
    'それより在庫が多いカードは掲載が外れます。空欄でOKを押すとオフになります。\n現在：' + (cur === null || cur === '' ? 'オフ' : cur + '枚以下'),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const v = r.getResponseText().trim();
  if (v === '') { p.deleteProperty('STOCK_RULE'); ui.alert('在庫による自動掲載をオフにしました。'); return; }
  if (!/^\d+$/.test(v)) { ui.alert('0以上の数字で入力してください。'); return; }
  p.setProperty('STOCK_RULE', v);
  ui.alert('在庫 ' + v + ' 枚以下のカードを自動で掲載○にします。\n次回のPOS取込から反映されます。');
}
