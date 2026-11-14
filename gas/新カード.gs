/** 新カードの取り込み
 *  GitHub（毎日14:20に公式サイトを確認）が見つけた新しいカードを、
 *  画像はドライブの「カード画像」フォルダへ、情報は「カード一覧」「エキスパンション一覧」へ追加する。
 *  ※未発売のカードは「発売日」の10時までは候補・Webに出ません（発売日.gs）
 */
function importNewCardsNow() {
  const r = importNewCards_(true);
  SpreadsheetApp.getUi().alert('新カードの取り込み', r, SpreadsheetApp.getUi().ButtonSet.OK);
}

function importNewCards_(interactive) {
  const props = PropertiesService.getDocumentProperties();
  const repo = props.getProperty('GH_REPO');
  if (!repo) return '先に「初期設定（GitHub連携）」を行ってください。';
  const base = 'https://github.com/' + repo + '/releases/download/newcards/';
  const res = UrlFetchApp.fetch(base + 'newcards.json', { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() === 404) return 'まだ新カードの一覧がありません（GitHubの「新カードを探す」が一度も動いていません）。';
  if (res.getResponseCode() !== 200) return '新カードの一覧を読み込めませんでした（' + res.getResponseCode() + '）';
  const info = JSON.parse(res.getContentText());

  const ss = SpreadsheetApp.getActive();
  const list = ss.getSheetByName('カード一覧');
  const last = list.getLastRow();
  const have = new Set(list.getRange(2, 8, last - 1, 1).getDisplayValues().map(r => String(r[0]).trim()));
  const todo = (info.cards || []).filter(c => !have.has(String(c.cardID)));
  if (!todo.length) {
    const m = '新しく取り込むカードはありません（GitHubの確認：' + info.updated + '）';
    props.setProperty('NEW_LAST', m); return m;
  }

  let rootId = props.getProperty('IMG_FOLDER_ID');
  if (!rootId) {
    const it = DriveApp.getFoldersByName('カード画像');
    if (!it.hasNext()) return 'ドライブに「カード画像」フォルダが見つかりません。';
    rootId = it.next().getId(); props.setProperty('IMG_FOLDER_ID', rootId);
  }
  const root = DriveApp.getFolderById(rootId);
  const folders = {};
  const folderOf = exp => {
    if (folders[exp]) return folders[exp];
    const it = root.getFoldersByName(exp);
    return (folders[exp] = it.hasNext() ? it.next() : root.createFolder(exp));
  };

  const t0 = Date.now(), rows = [], checks = [], perExp = {};
  for (const c of todo) {
    if (Date.now() - t0 > 240000) break;   // 1回の実行は約4分まで（残りは次回）
    const num = /^\d+$/.test(c.num) ? ('00' + c.num).slice(-3) : c.num;
    const fname = '【' + c.exp + '】(' + num + ')' + c.name + '[' + c.reg + ']' + (c.rarity ? '{' + c.rarity + '}' : '') + '.jpg';
    const img = UrlFetchApp.fetch(base + c.cardID + '.jpg', { muteHttpExceptions: true, followRedirects: true });
    if (img.getResponseCode() !== 200) continue;
    const file = folderOf(c.exp).createFile(img.getBlob().setName(fname));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* フォルダの共有設定に従う */ }
    rows.push([c.exp, num, c.name, c.reg, c.rarity, fname, c.exp, c.cardID, c.kind, [c.exp, num, c.name, c.reg].join('|'), fname,
               'https://www.pokemon-card.com' + c.img, file.getId(), 'https://lh3.googleusercontent.com/d/' + file.getId()]);
    if (c.reg_check) checks.push({ i: rows.length - 1, s: c.reg_score });
    perExp[c.exp] = perExp[c.exp] || { n: 0, denom: c.denom, release: c.release };
    perExp[c.exp].n++;
  }
  if (rows.length) {
    list.getRange(last + 1, 2, rows.length, 1).setNumberFormat('@');
    list.getRange(last + 1, 1, rows.length, 14).setValues(rows);
    checks.forEach(x => list.getRange(last + 1 + x.i, 4).setBackground('#FFF2CC')
      .setNote('レギュレーションは画像から自動判定しました（一致度 ' + x.s + '）。違っていたら直してください。'));
    // エキスパンション一覧：新しい記号は行を追加（発売日も入れる）
    const ex = ss.getSheetByName(EXP_SHEET);
    const codes = new Set(ex.getRange(2, 1, ex.getLastRow() - 1, 1).getDisplayValues().map(r => r[0].trim()));
    Object.keys(perExp).forEach(k => {
      if (codes.has(k)) return;
      const d = perExp[k];
      ex.appendRow([k, d.n, /^\d+$/.test(d.denom) ? Number(d.denom) : d.denom, d.release || '', '']);
    });
  }
  const left = todo.length - rows.length;
  const msg = '新カードを ' + rows.length + ' 枚取り込みました（' + Object.keys(perExp).map(k => k + ' ' + perExp[k].n + '枚').join('、') + '）' +
              (checks.length ? '\nレギュレーション要確認：' + checks.length + ' 枚（カード一覧の黄色いセル）' : '') +
              (left ? '\n残り ' + left + ' 枚は次回の実行で取り込みます。' : '');
  props.setProperty('NEW_LAST', msg.replace(/\n/g, ' '));
  return msg;
}
