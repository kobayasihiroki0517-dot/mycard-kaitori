/** 毎日の自動更新
 *  1. ドライブの「POS取込」フォルダの最新CSV（商品マスタ・在庫一覧）を取り込む
 *  2. カードラッシュの買取価格を取得
 *  3. 価格ルール（安い方×在庫割合／買取保証）を適用
 *  4. Webページ・印刷用PDFを作り直す（Xには投稿しない）
 */
function autoUpdateDaily() {
  const p = PropertiesService.getDocumentProperties();
  const log = [];
  const t0 = new Date();
  try {
    const item = latestCsv_('item'), stock = latestCsv_('stock');
    if (item) {
      importPos_(true, false, true);   // 中でカードラッシュ取得・価格ルール適用まで行う
      log.push('POS：' + item.getName() + (stock ? '／' + stock.getName() : '／在庫CSVなし') +
               '（' + Utilities.formatDate(item.getLastUpdated(), 'Asia/Tokyo', 'M/d HH:mm') + ' 保存）');
    } else {
      fillFromCardrush_(false); applyPriceRules_(false);
      log.push('POS：CSVなし（カードラッシュと価格ルールのみ更新）');
    }
    log.push('カードラッシュ：' + (p.getProperty('CR_LAST') || '不明'));
    try { log.push('強化買取候補：' + updateCandidates_() + ' 枚'); } catch (e) { log.push('強化買取候補：更新できず（' + (e.message || e) + '）'); }
    cleanupPosFolder_();
    dispatchQuiet_(false);
    log.push('Web・PDF：更新を依頼しました');
    p.setProperty('AUTO_LAST', Utilities.formatDate(t0, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + ' 成功\n' + log.join('\n'));
  } catch (e) {
    p.setProperty('AUTO_LAST', Utilities.formatDate(t0, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + ' 失敗\n' + log.join('\n') + '\nエラー：' + (e.message || e));
    throw e;   // 失敗したときはGoogleからメールで通知が届く
  }
}

/* 古いCSVをゴミ箱へ（商品マスタ・在庫一覧それぞれ新しい3つを残す） */
function cleanupPosFolder_() {
  const files = { item: [], stock: [] };
  const it = posFolder_().getFiles();
  while (it.hasNext()) {
    const f = it.next(), n = f.getName();
    if (!/\.csv$/i.test(n)) continue;
    files[/^stock/i.test(n) || /在庫/.test(n) ? 'stock' : 'item'].push(f);
  }
  Object.keys(files).forEach(k => files[k].sort((a, b) => b.getLastUpdated() - a.getLastUpdated())
    .slice(3).forEach(f => f.setTrashed(true)));
}

/* メニュー：毎日の自動更新をオン（時刻を指定） */
function enableAutoUpdate() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('毎日の自動更新', '何時に更新しますか？（0〜23 の数字。例：9 → 毎朝9時台）', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const h = Number(String(r.getResponseText()).replace(/[^\d]/g, ''));
  if (!(h >= 0 && h <= 23) || r.getResponseText().trim() === '') { ui.alert('0〜23 の数字で入力してください'); return; }
  removeAutoTriggers_();
  ScriptApp.newTrigger('autoUpdateDaily').timeBased().everyDays(1).atHour(h).inTimezone('Asia/Tokyo').create();
  PropertiesService.getDocumentProperties().setProperty('AUTO_HOUR', String(h));
  posFolder_();
  ui.alert('自動更新をオンにしました',
    '毎日 ' + h + '時台 に次の順で自動更新します。\n' +
    '① ドライブ「' + POS_FOLDER + '」フォルダの最新POSのCSVを取り込み\n② カードラッシュの価格を取得\n③ 価格ルールを適用\n④ Webページ・印刷用PDFを更新（Xには投稿しません）\n\n' +
    '※Googleの仕様で、実行は指定した時刻から1時間以内のどこかになります。', ui.ButtonSet.OK);
}
function disableAutoUpdate() {
  removeAutoTriggers_();
  PropertiesService.getDocumentProperties().deleteProperty('AUTO_HOUR');
  SpreadsheetApp.getUi().alert('毎日の自動更新をオフにしました。');
}
function removeAutoTriggers_() {
  // 以前の「1時間ごとのPOS取込」も止めて、毎日の自動更新に一本化する
  ScriptApp.getProjectTriggers().filter(t => ['autoUpdateDaily', 'importPosScheduled'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/* メニュー：自動更新の状況 */
function showAutoStatus() {
  const p = PropertiesService.getDocumentProperties();
  const on = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'autoUpdateDaily');
  const item = latestCsv_('item'), stock = latestCsv_('stock');
  const fmt = f => f ? f.getName() + '（' + Utilities.formatDate(f.getLastUpdated(), 'Asia/Tokyo', 'M/d HH:mm') + '）' : 'なし';
  SpreadsheetApp.getUi().alert('自動更新の状況',
    '自動更新：' + (on ? 'オン（毎日 ' + p.getProperty('AUTO_HOUR') + '時台）' : 'オフ') + '\n\n' +
    '「' + POS_FOLDER + '」フォルダの最新CSV\n　商品マスタ：' + fmt(item) + '\n　在庫一覧：' + fmt(stock) + '\n\n' +
    '前回の自動更新：\n' + (p.getProperty('AUTO_LAST') || 'まだ実行されていません'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/* メニュー：今すぐ自動更新と同じ処理を実行（動作確認用） */
function autoUpdateNow() {
  autoUpdateDaily();
  showAutoStatus();
}
