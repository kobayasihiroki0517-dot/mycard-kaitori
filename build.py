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
           check='▼照合（自動）', img='▼画像URL（自動）', fullnum='▼番号表記（自動）')


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
    v = re.sub(r'[^\d]', '', str(v or ''))
    return int(v) if v else None


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
    cards, skipped = [], []
    for n, r in enumerate(rows[1:], start=2):
        if not g(r, 'exp') or g(r, 'show') not in ('○', '◯', 'o', 'O'):
            continue
        if not g(r, 'img').startswith(('http', 'file:')):
            skipped.append(f"{n}行目 {g(r, 'name')}（照合: {g(r, 'check') or '不明'}）")
            continue
        num = g(r, 'fullnum') or g(r, 'num')
        cards.append(dict(exp=g(r, 'exp'), num=num, name=g(r, 'name'), rr=g(r, 'rr'),
                          price=to_int(g(r, 'price')), feat=g(r, 'feat') in ('○', '◯', 'o', 'O'),
                          order=to_int(g(r, 'order')), url=g(r, 'img'), row=n))
    # 表示順（小さい順）→ 未入力は後ろで買取価格の高い順
    cards.sort(key=lambda c: (c['order'] is None, c['order'] or 0, -(c['price'] or 0)))
    return cards, skipped


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
    cards, skipped = read_sheet(url)
    if not cards:
        sys.exit('掲載「○」のカードがありません')
    print(f'掲載カード {len(cards)} 枚（目玉 {sum(c["feat"] for c in cards)} 枚）')
    for s in skipped:
        print('  画像なしのため除外:', s)
    download_images(cards)

    up = updated_label()
    if os.path.exists(SITE):
        shutil.rmtree(SITE)
    os.makedirs(SITE)

    xs = x_images(cards, up)
    for i, im in enumerate(xs, 1):
        im.save(os.path.join(SITE, f'x_{i}.png'), optimize=True)
    save_pdf(a4_pages(cards, up), os.path.join(SITE, 'kaitori.pdf'))

    web_cards = [dict(c, img=c['url'] + ('=w600' if 'googleusercontent' in c['url'] else '')) for c in cards]
    with open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(build_web(web_cards, up, 'logo_h.png'))
    shutil.copy(os.path.join(HERE, 'logo_h.png'), SITE)
    with open(os.path.join(SITE, 'cards.json'), 'w', encoding='utf-8') as f:
        json.dump(dict(updated=up, x_images=len(xs),
                       cards=[{k: c[k] for k in ('exp', 'num', 'name', 'rr', 'price', 'feat')} for c in cards]),
                  f, ensure_ascii=False, indent=1)
    print(f'作成完了: X用画像 {len(xs)} 枚 / A4 PDF / Webページ')


if __name__ == '__main__':
    main()
