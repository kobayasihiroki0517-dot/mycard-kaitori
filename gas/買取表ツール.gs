/** MyCard 買取表ツール（Google Apps Script） */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('買取表ツール')
    .addItem('チェックしたカードを買取表に追加', 'addCheckedCards')
    .addSeparator()
    .addItem('POSから買取価格を取り込む', 'importPosNow')
    .addItem('未入力の価格をカードラッシュから取得', 'fillFromCardrushNow')
    .addItem('価格ルールを適用（再計算）', 'applyPriceRulesNow')
    .addItem('強化買取候補を更新（在庫0枚）', 'updateCandidatesNow')
    .addItem('チェックした候補を強化買取にする', 'promoteCandidates')
    .addSeparator()
    .addItem('毎日の自動更新をオン（時刻を指定）', 'enableAutoUpdate')
    .addItem('毎日の自動更新をオフ', 'disableAutoUpdate')
    .addItem('自動更新の状況を見る', 'showAutoStatus')
    .addItem('自動更新を今すぐ実行（動作確認）', 'autoUpdateNow')
    .addSeparator()
    .addItem('在庫による自動掲載の設定', 'setStockRule')
    .addSeparator()
    .addItem('買取表を更新（Web・印刷用PDF）', 'runUpdate')
    .addItem('買取表を更新してXにも投稿', 'runUpdateAndPost')
    .addSeparator()
    .addItem('画像の名前変更と紐づけ', 'linkImages')
    .addItem('初期設定（GitHub連携）', 'setupGithub')
    .addToUi();
}

/* ---------- カード検索シート → 買取表に追加 ---------- */
function addCheckedCards() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const src = ss.getSheetByName('カード検索'), dst = ss.getSheetByName('買取表');
  const rows = src.getRange(8, 1, 100, 6).getValues();   // A:追加 B:画像 C:エキスパンション D:番号 E:カード名 F:レギュレーション
  const picked = [];
  rows.forEach((r, i) => { if (r[0] === true && r[2] && r[4]) picked.push({ i: i, v: [r[2], String(r[3]), r[4], r[5]] }); });
  if (!picked.length) { ui.alert('「追加」にチェックが入っているカードがありません。'); return; }
  const last = Math.max(dst.getLastRow(), 1);
  const cur = last > 1 ? dst.getRange(2, 1, last - 1, 4).getDisplayValues() : [];
  const have = new Set(cur.map(r => r.join('|')));
  let row = cur.findIndex(r => !r[0]);           // 買取表の最初の空き行
  row = row === -1 ? cur.length + 2 : row + 2;
  const added = [], skipped = [];
  const linkCol = dst.getRange(1, 1, 1, dst.getLastColumn()).getDisplayValues()[0].indexOf('POS連動') + 1;
  picked.forEach(p => {
    const key = p.v.join('|');
    if (have.has(key)) { skipped.push(p.v[2]); return; }
    while (row <= dst.getMaxRows() && dst.getRange(row, 1).getValue() !== '') row++;
    const r = dst.getRange(row, 1, 1, 4);
    dst.getRange(row, 2).setNumberFormat('@');
    r.setValues([p.v]);
    if (linkCol) dst.getRange(row, linkCol).setValue('○');
    have.add(key); added.push(p.v[2]); row++;
  });
  picked.forEach(p => src.getRange(8 + p.i, 1).setValue(false));
  ui.alert('買取表に ' + added.length + ' 枚追加しました。' +
    (skipped.length ? '\n（すでに買取表にあるため追加しなかったカード: ' + skipped.join('、') + '）' : '') +
    (linkCol ? '\n買取価格は次回のPOS取込で自動入力されます。「掲載」の○を入力してください。' : '\n買取表シートで価格と「掲載」の○を入力してください。'));
}

/* ---------- GitHub の自動作成を呼び出す ---------- */
function setupGithub() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();
  const r1 = ui.prompt('初期設定 1/2', 'GitHubのリポジトリ名を「ユーザー名/リポジトリ名」の形で入力してください。', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt('初期設定 2/2', 'GitHubのアクセストークン（github_pat_ から始まる文字列）を貼り付けてください。', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  props.setProperty('GH_REPO', r1.getResponseText().trim());
  props.setProperty('GH_TOKEN', r2.getResponseText().trim());
  ui.alert('保存しました。「買取表を更新」を実行して動作を確認してください。');
}
function runUpdate() { dispatch_(false); }
function runUpdateAndPost() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Xに投稿します', '買取表を作成して、MyCardのXアカウントに投稿します。よろしいですか？', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  dispatch_(true);
}
function dispatch_(postX) {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();
  const repo = props.getProperty('GH_REPO'), token = props.getProperty('GH_TOKEN');
  if (!repo || !token) { ui.alert('先に「買取表ツール」→「初期設定（GitHub連携）」を行ってください。'); return; }
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/actions/workflows/kaitori.yml/dispatches', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main', inputs: { post_x: postX } })
  });
  if (res.getResponseCode() === 204) {
    ui.alert('作成を開始しました。\n3〜5分ほどでWebページと印刷用PDFが更新されます。' + (postX ? '\nXへの投稿も行います。' : ''));
  } else {
    ui.alert('開始できませんでした（' + res.getResponseCode() + '）。\n' + res.getContentText().slice(0, 300));
  }
}

/* ---------- ドライブ上の画像の名前変更と紐づけ ---------- */
function linkImages() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActive().getSheetByName('カード一覧');
  const last = sh.getLastRow();
  const data = sh.getRange(2, 1, last - 1, 14).getValues();
  const props = PropertiesService.getDocumentProperties();
  let rootId = props.getProperty('IMG_FOLDER_ID');
  if (!rootId) {
    const it = DriveApp.getFoldersByName('カード画像');
    if (!it.hasNext()) { ui.alert('ドライブに「カード画像」フォルダが見つかりません。'); return; }
    rootId = it.next().getId();
    props.setProperty('IMG_FOLDER_ID', rootId);
  }
  const root = DriveApp.getFolderById(rootId);
  const need = {};
  data.forEach((r, i) => { if (!r[12]) (need[r[6]] = need[r[6]] || []).push(i); });
  const t0 = Date.now();
  let done = 0; const notFound = [];
  const save = () => sh.getRange(2, 13, data.length, 2).setValues(data.map(r => [r[12], r[13]]));
  for (const fname in need) {
    const fit = root.getFoldersByName(fname);
    if (!fit.hasNext()) { need[fname].forEach(i => notFound.push(data[i][5])); continue; }
    const files = {};
    const it = fit.next().getFiles();
    while (it.hasNext()) { const f = it.next(); files[f.getName()] = f; }
    for (const i of need[fname]) {
      const r = data[i];
      const f = files[r[5]] || files[r[10]];
      if (!f) { notFound.push(r[5]); continue; }
      if (f.getName() !== r[5]) f.setName(r[5]);
      r[12] = f.getId();
      r[13] = 'https://lh3.googleusercontent.com/d/' + f.getId();
      done++;
    }
    if (Date.now() - t0 > 270000) {
      save();
      ui.alert('途中まで完了しました（今回 ' + done + ' 枚）。\nもう一度「買取表ツール」→「画像の名前変更と紐づけ」を実行してください。');
      return;
    }
  }
  save();
  const left = data.filter(r => !r[12]).length;
  ui.alert(left === 0 ? 'すべて完了しました（今回 ' + done + ' 枚）。'
    : '完了しましたが、見つからない画像が ' + left + ' 枚あります。\n例: ' + notFound.slice(0, 5).join('\n'));
}
