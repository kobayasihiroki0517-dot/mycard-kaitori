"""スプレッドシート（買取表シートのCSV）から X用画像・A4印刷用PDF・Webページを作成する。

環境変数:
  SHEET_CSV_URL  … 「買取表」シートをウェブに公開したCSVのURL
  SITE_URL       … 公開WebページのURL（X投稿の本文に入れる。なくても可）
出力: site/ フォルダ（index.html, kaitori.pdf, x_1.png …, logo_h.png, cards.json）
"""
import csv, io, json, os, re, shutil, sys, time, datetime, urllib.request
from concurrent.futures import ThreadPoolExecutor
from render import x_images, a4_pages, save_pdf
from web import build as build_web

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, 'site')
CACHE = os.path.join(HERE, '.cache', 'img')
JST = datetime.timezone(datetime.timedelta(hours=9))
WEEK = '月火水木金土日'

# 買取表シートの見出し名（列の位置が変わっても見出し名で読む）
COL = dict(exp='【】エキスパンション', num='()番号', name='カード名', reg='[]レギュレーション',
           price='買取価格', show='掲載', feat='目玉', order='表示順', rr='▼レアリティ（自動）',
           check='▼照合（自動）', img='▼画像URL（自動）', fullnum='▼番号表記（自動）', src='▼価格の出所')


def fetch(url, tries=4):
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 mycard-kaitori'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:
            if t == tries - 1:
                raise
            time.sleep(3 * (t + 1))


def updated_label(now=None):
    """更新日時は15分単位で切り下げる（例 15:43 → 15:30）"""
    now = now or datetime.datetime.now(JST)
    now = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
    return f"{now:%Y/%m/%d}({WEEK[now.weekday()]}) {now:%H:%M} 更新"


def to_int(v):
    """「1,230」「¥1230」→ 1230。「1cm10円」のような文字は None"""
    v = re.sub(r'[¥￥,，円\s]', '', str(v or ''))
    return int(v) if v.isdigit() else None


def price_of(v):
    """金額なら数値、「1cm10円」などの文字ならそのまま、空なら None"""
    v = str(v or '').strip()
    return to_int(v) if to_int(v) is not None else (v or None)


def read_sheet(url):
    text = fetch(url).decode('utf-8-sig')
    rows = list(csv.reader(io.StringIO(text)))
    head = [h.strip() for h in rows[0]]
    idx = {k: head.index(v) for k, v in COL.items() if v in head}
    missing = [COL[k] for k in ('exp', 'num', 'name', 'price', 'show', 'img') if k not in idx]
    if missing:
        sys.exit('買取表シートに次の見出しが見つかりません: ' + ', '.join(missing)
                 + '\n読み込んだ1行目: ' + ' / '.join(head[:8])
                 + '\n→「ウェブに公開」で「買取表」シートと「カンマ区切り形式（.csv）」を選んでいるか確認してください')
    g = lambda r, k: (r[idx[k]].strip() if k in idx and idx[k] < len(r) else '')
    cards, skipped, prices = [], [], {}
    for n, r in enumerate(rows[1:], start=2):
        if g(r, 'exp') and price_of(g(r, 'price')) is not None:
            key = '|'.join([g(r, 'exp'), g(r, 'num').zfill(3) if g(r, 'num').isdigit() else g(r, 'num'), g(r, 'name'), g(r, 'reg')])
            prices[key] = dict(price=price_of(g(r, 'price')), guar=g(r, 'src') == '買取保証',
                               feat=g(r, 'feat') in ('○', '◯', 'o', 'O') and g(r, 'show') in ('○', '◯', 'o', 'O'))
        if not g(r, 'exp') or g(r, 'show') not in ('○', '◯', 'o', 'O'):
            continue
        if not g(r, 'img').startswith(('http', 'file:')):
            skipped.append(f"{n}行目 {g(r, 'name')}（照合: {g(r, 'check') or '不明'}）")
            continue
        num = g(r, 'fullnum') or g(r, 'num')
        cards.append(dict(exp=g(r, 'exp'), num=num, name=g(r, 'name'), rr=g(r, 'rr'),
                          price=price_of(g(r, 'price')), guar=g(r, 'src') == '買取保証', feat=g(r, 'feat') in ('○', '◯', 'o', 'O'),
                          order=to_int(g(r, 'order')), url=g(r, 'img'), row=n))
    # 表示順（小さい順）→ 未入力は買取価格の高い順。買取保証は一番安い扱いで後ろへ
    num = lambda c: (-10**7 if c['guar'] else 0) + (c['price'] if isinstance(c['price'], int) else 0)
    cards.sort(key=lambda c: (c['order'] is None, c['order'] or 0, -num(c)))
    return cards, skipped, prices


CARDS_GID = '1723803105'   # 「カード一覧」シート


def read_all_cards(sheet_url, prices):
    """Webページ用：カード一覧の全カード。価格は 買取表 → POS買取価格 → カードラッシュ の順で採用"""
    url = os.environ.get('SHEET_CARDS_CSV_URL') or re.sub(r'gid=\d+', 'gid=' + CARDS_GID, sheet_url)
    try:
        text = fetch(url).decode('utf-8-sig')
    except Exception as e:
        print('カード一覧を読み込めませんでした（掲載カードのみWebに載せます）:', e)
        return None
    rows = list(csv.reader(io.StringIO(text)))
    head = [h.strip() for h in rows[0]]
    need = ['【】エキスパンション', '()番号', 'カード名', '[]レギュレーション', 'レアリティ', '画像URL（ドライブ）']
    if any(h not in head for h in need):
        print('カード一覧の見出しが読めませんでした（「ウェブに公開」に「カード一覧」シートを追加してください）。掲載カードのみWebに載せます')
        return None
    ix = {h: i for i, h in enumerate(head)}
    g = lambda r, h: (r[ix[h]].strip() if h in ix and ix[h] < len(r) else '')
    out = []
    for r in rows[1:]:
        exp, num = g(r, '【】エキスパンション'), g(r, '()番号')
        if not exp or not g(r, '画像URL（ドライブ）').startswith('http'):
            continue
        key = '|'.join([exp, num, g(r, 'カード名'), g(r, '[]レギュレーション')])
        p = prices.get(key)
        cls = g(r, '▼価格区分')
        if p and not p['guar']:            # 買取表で価格を決めているカード
            price, guar = p['price'], False
        elif cls:                           # 価格ルールの結果（▼表示価格・▼価格区分）
            price, guar = price_of(g(r, '▼表示価格')), cls == '買取保証'
            if p and p['guar']:
                price = p['price']
        else:                               # ルール未適用の古いシート
            price, guar = (to_int(g(r, '▼POS買取価格')) or to_int(g(r, '▼CR買取価格'))), False
        if not price and not guar:
            continue
        k = g(r, '種類')
        kind = 'ポケモン' if k in ('ワザ', '特性') else 'エネルギー' if 'エネルギー' in k else k
        out.append(dict(exp=exp, num=g(r, '番号表記') or num, name=g(r, 'カード名'), rr=g(r, 'レアリティ'), kind=kind,
                        price=price or '', g=1 if guar else 0, feat=bool(p and p['feat']), url=g(r, '画像URL（ドライブ）')))
    return out


RULES_GID = '224697346'   # 「価格ルール」シート
DEFAULT_RULES = dict(desc='カードラッシュに買取価格の掲載がないカードは、以下の金額で買取を保証します。', rows=[
    dict(rr='UR', reg='I,J', ex='', amount=200), dict(rr='SAR', reg='I,J', ex='', amount=200),
    dict(rr='SR', reg='I,J', ex='グッズ', amount=200), dict(rr='CHR', reg='', ex='', amount=30),
    dict(rr='AR', reg='', ex='', amount=30), dict(rr='RR', reg='I,J', ex='', amount=10),
    dict(rr='U,C,それ以外', reg='', kind='トレーナーズ', ex='', amount='1cm10円'),
    dict(rr='U,C,それ以外', reg='', kind='ポケモン', ex='', amount='1cm10円')])


def read_rules(sheet_url):
    """Webの「買取保証」ポップアップ用に価格ルールシートを読む（読めなければ既定値）"""
    url = os.environ.get('SHEET_RULES_CSV_URL') or re.sub(r'gid=\d+', 'gid=' + RULES_GID, sheet_url)
    try:
        rows = list(csv.reader(io.StringIO(fetch(url).decode('utf-8-sig'))))
        if not rows or '買取保証' not in rows[0][0]:
            raise ValueError('価格ルールシートではありません')
        out = [dict(rr=r[0].strip(), reg=r[1].strip(), kind=r[2].strip(), ex=r[3].strip(), amount=price_of(r[4]))
               for r in rows[2:12] if len(r) > 4 and r[0].strip() and price_of(r[4]) is not None]
        desc = next((r[0].strip() for r in rows[16:18] if r and r[0].strip() and not r[0].startswith('【')), DEFAULT_RULES['desc'])
        return dict(desc=desc, rows=out or DEFAULT_RULES['rows'])
    except Exception as e:
        print('価格ルールシートを読み込めませんでした（既定の内容を表示します）:', e)
        return DEFAULT_RULES


def download_images(cards):
    os.makedirs(CACHE, exist_ok=True)

    def one(c):
        m = re.search(r'/d/([\w-]+)', c['url'])
        key = m.group(1) if m else re.sub(r'\W', '_', c['url'])[-60:]
        path = os.path.join(CACHE, key + '.jpg')
        if not os.path.exists(path):
            src = c['url'] + ('=w900' if 'googleusercontent' in c['url'] else '')
            data = fetch(src)
            with open(path, 'wb') as f:
                f.write(data)
        c['img'] = path
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one, cards))


def main():
    url = os.environ.get('SHEET_CSV_URL')
    if not url:
        sys.exit('SHEET_CSV_URL が設定されていません')
    cards, skipped, prices = read_sheet(url)
    if not cards:
        print('掲載「○」のカードがないため、X用画像と印刷用PDFは作りません（Webページのみ作成）')
    print(f'掲載カード {len(cards)} 枚（目玉 {sum(c["feat"] for c in cards)} 枚）')
    for s in skipped:
        print('  画像なしのため除外:', s)
    download_images(cards)

    up = updated_label()
    if os.path.exists(SITE):
        shutil.rmtree(SITE)
    os.makedirs(SITE)

    xs = x_images(cards, up) if cards else []
    for i, im in enumerate(xs, 1):
        im.save(os.path.join(SITE, f'x_{i}.png'), optimize=True)
    if cards:
        save_pdf(a4_pages(cards, up), os.path.join(SITE, 'kaitori.pdf'))

    all_cards = read_all_cards(url, prices) or cards
    print(f'Webページ掲載 {len(all_cards)} 枚')
    web_cards = [dict(c, img=c['url']) for c in all_cards]
    with open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(build_web(web_cards, up, 'logo_h.png', read_rules(url)))
    shutil.copy(os.path.join(HERE, 'logo_h.png'), SITE)
    with open(os.path.join(SITE, 'cards.json'), 'w', encoding='utf-8') as f:
        json.dump(dict(updated=up, x_images=len(xs),
                       cards=[{k: c[k] for k in ('exp', 'num', 'name', 'rr', 'price', 'feat')} for c in cards]),
                  f, ensure_ascii=False, indent=1)
    print(f'作成完了: X用画像 {len(xs)} 枚 / A4 PDF / Webページ')


if __name__ == '__main__':
    main()
