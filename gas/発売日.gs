/** 発売日
 *  ・エキスパンション一覧の「発売日」（D列）で、発売日の10時（日本時間）まではカードを候補・Webに出さない
 *  ・公式サイト（pokemon-card.com）の商品情報から、新しいエキスパンションの発売日を自動で入れる
 */
const EXP_SHEET = 'エキスパンション一覧';

/* { code: Date(発売日10:00) } */
function releaseMap_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(EXP_SHEET);
  const map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues().forEach(r => {
    const m = String(r[3]).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
    if (r[0] && m) map[r[0].trim()] = Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' 10:00', 'Asia/Tokyo', 'yyyy-M-d HH:mm');
  });
  return map;
}
/* 発売済み（発売日10時を過ぎた／発売日が未登録）なら true */
function isReleased_(map, code, now) {
  const d = map[String(code).trim()];
  return !d || (now || new Date()) >= d;
}

/* 公式サイトから発売日を取得して、空欄の「発売日」を埋める（新しいエキスパンションは行を追加） */
function fetchReleaseDatesNow() {
  const r = fetchReleaseDates_();
  SpreadsheetApp.getUi().alert('発売日の取得', r, SpreadsheetApp.getUi().ButtonSet.OK);
}
function fetchReleaseDates_() {
  const base = 'https://www.pokemon-card.com';
  const opt = { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } };
  const norm = s => String(s).replace(/<[^>]+>/g, '').replace(/[\s　「」『』"“”]/g, '').replace(/ポケモンカードゲーム/g, '').replace(/[＆&]/g, '&').toLowerCase();

  // 1. カード検索の「商品」一覧（新しい順）
  const res = UrlFetchApp.fetch(base + '/card-search/index.php', opt);
  if (res.getResponseCode() !== 200) return '公式サイトに接続できませんでした（' + res.getResponseCode() + '）';
  const pgs = [];
  const re = /name: "pg", value: "(\d+)", group: "group-item-name", label: "([^"]*)"/g;
  let m;
  while ((m = re.exec(res.getContentText())) && pgs.length < 20) pgs.push({ pg: m[1], label: m[2] });

  // 2. 商品情報（発売日）…去年1月〜来年末
  const y = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy'));
  const prods = [];
  for (let page = 1; page <= 15; page++) {
    const r = UrlFetchApp.fetch(base + '/products/resultAPI.php?productType=all&dateLowerY=' + (y - 1) + '&dateLowerM=1&dateLowerD=1&dateUpperY=' + (y + 1) +
                                '&dateUpperM=12&dateUpperD=31&page=' + page, opt);
    if (r.getResponseCode() !== 200) break;
    const j = JSON.parse(r.getContentText());
    if (!j.products || !j.products.length) break;
    j.products.forEach(p => prods.push({ t: norm(p.productTitle), date: p.releaseDate }));
    if (page >= j.maxPage) break;
    Utilities.sleep(300);
  }

  // 3. エキスパンション一覧の現状
  const sh = SpreadsheetApp.getActive().getSheetByName(EXP_SHEET);
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues();
  const rowOf = {};
  v.forEach((r, i) => { if (r[0]) rowOf[r[0].trim().toUpperCase()] = { row: i + 2, code: r[0].trim(), date: r[3] }; });

  const done = [];
  const today = new Date(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd'));
  pgs.forEach(p => {
    const n = norm(p.label);
    const hit = prods.find(x => x.t === n) || prods.find(x => x.t.indexOf(n) >= 0) || prods.find(x => n.indexOf(x.t) >= 0 && x.t.length > 6);
    const dm = hit && String(hit.date).match(/(\d{4})年\s*(\d+)月\s*(\d+)日/);
    if (!dm) return;
    const iso = dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2);
    // 発売から60日以上たった商品は確認しない（通信を減らすため）
    if ((today - new Date(iso.replace(/-/g, '/'))) / 864e5 > 60) return;
    // 4. その商品のカード画像のフォルダ名＝エキスパンション記号
    const r = UrlFetchApp.fetch(base + '/card-search/resultAPI.php?keyword=&se_ta=&regulation_sidebar_form=all&pg=' + p.pg + '&illust=&sm_and_keyword=true&page=1', opt);
    Utilities.sleep(300);
    if (r.getResponseCode() !== 200) return;
    const cnt = {};
    (JSON.parse(r.getContentText()).cardList || []).forEach(c => {
      const f = (String(c.cardThumbFile).match(/large\/([^/]+)\//) || [])[1];
      if (f && f !== 'ENE') cnt[f] = (cnt[f] || 0) + 1;
    });
    const code = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    if (!code) return;
    const cur = rowOf[code.toUpperCase()];
    if (cur && cur.date) return;   // 入力済みはそのまま（手入力を優先）
    if (cur) sh.getRange(cur.row, 4).setValue(iso);
    else { sh.appendRow([code, '', '', iso, '']); rowOf[code.toUpperCase()] = { code: code, date: iso }; }
    done.push((cur ? cur.code : code + '（新規）') + '：' + iso);
  });
  const msg = done.length ? '発売日を入力しました\n' + done.join('\n') : '新しく入力する発売日はありませんでした（確認した商品 ' + pgs.length + ' 件）';
  PropertiesService.getDocumentProperties().setProperty('REL_LAST', msg.split('\n')[0] + (done.length ? '：' + done.join('、') : ''));
  return msg;
}
