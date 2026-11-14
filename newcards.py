"""公式サイト（pokemon-card.com）に載った新しいカードを探して、スプレッドシートに取り込むためのデータを作る。

  1. カード検索（スタンダード）を新しい商品から順に見て、カード一覧（スプレッドシート）にまだないカードを探す
     （基本エネルギーは除く。プロモカード M-P も確認）
  2. そのカードの情報（エキスパンション・番号・名前・レアリティ・種類）を取得。発売日は商品情報から
  3. カード画像を取得し、左下のレギュレーションマーク（G/H/I/J…）を画像から判定
  4. 画像と newcards.json を GitHub の Release「newcards」に置く → スプレッドシートの「新カードを取り込む」で読み込む
環境変数: SHEET_CSV_URL（買取表シートの公開CSV。gid を差し替えてカード一覧を読む）
"""
import csv, html, io, json, os, re, sys, time, datetime, urllib.request
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'newcards')
SITE = 'https://www.pokemon-card.com'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
JST = datetime.timezone(datetime.timedelta(hours=9))
CARDS_GID = '1723803105'
WAIT = 1.2   # 公式サイトへの負荷を抑えるため、1回ごとに少し待つ


def get(url, binary=False, tries=5):
    for t in range(tries):
        try:
            req = urllib.request.Request(url if url.startswith('http') else SITE + url,
                                         headers={'User-Agent': UA, 'Referer': SITE + '/card-search/'})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            time.sleep(WAIT)
            return data if binary else data.decode('utf-8', 'replace')
        except Exception as e:
            if t == tries - 1:
                raise
            print('  再試行:', url, e)
            time.sleep(30 * (t + 1))


def norm(s):
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'[\s　「」『』"“”]', '', s).replace('ポケモンカードゲーム', '')
    return s.replace('＆', '&').lower()


def known_ids():
    url = os.environ.get('SHEET_CARDS_CSV_URL') or re.sub(r'gid=\d+', 'gid=' + CARDS_GID, os.environ['SHEET_CSV_URL'])
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    rows = list(csv.reader(io.StringIO(urllib.request.urlopen(req, timeout=60).read().decode('utf-8-sig'))))
    i = rows[0].index('カードID')
    return {r[i].strip() for r in rows[1:] if len(r) > i and r[i].strip()}


def products():
    """商品名 → 発売日（YYYY-MM-DD）"""
    y = datetime.datetime.now(JST).year
    out = []
    for page in range(1, 20):
        j = json.loads(get(f'/products/resultAPI.php?productType=all&dateLowerY={y-1}&dateLowerM=1&dateLowerD=1'
                           f'&dateUpperY={y+1}&dateUpperM=12&dateUpperD=31&page={page}'))
        for p in j.get('products') or []:
            m = re.search(r'(\d{4})年\s*(\d+)月\s*(\d+)日', p.get('releaseDate', ''))
            if m:
                out.append((norm(p['productTitle']), f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}', p['productTitle']))
        if page >= j.get('maxPage', 1):
            break
    return out


def code_dates(prods):
    """発売前〜発売後60日の商品について {エキスパンション記号: 発売日}"""
    html = get('/card-search/index.php')
    pgs = re.findall(r'name: "pg", value: "(\d+)", group: "group-item-name", label: "([^"]*)"', html)
    today = datetime.datetime.now(JST).date()
    out = {}
    for pg, label in pgs[:30]:
        n = norm(label)
        hit = next((p for p in prods if p[0] == n), None) or next((p for p in prods if n in p[0]), None) \
            or next((p for p in prods if p[0] in n and len(p[0]) > 6), None)
        if not hit or not (-60 <= (datetime.date.fromisoformat(hit[1]) - today).days <= 60):
            continue
        cnt = {}
        for c in search(f'pg={pg}', 1)[0]:
            if c['folder'] != 'ENE':
                cnt[c['folder']] = cnt.get(c['folder'], 0) + 1
        if cnt:
            code = max(cnt, key=cnt.get)
            out.setdefault(code, hit[1])
    return out


def search(q, page):
    j = json.loads(get(f'/card-search/resultAPI.php?keyword=&se_ta=&illust=&sm_and_keyword=true&{q}&page={page}'))
    cards = [dict(id=c['cardID'], folder=(re.search(r'large/([^/]+)/', c['cardThumbFile']) or [None, ''])[1])
             for c in j.get('cardList') or []]
    return cards, int(j.get('maxPage') or 1)


def find_new(have):
    """スタンダードを1ページ目から見て、未登録カードがないページが5ページ続いたら終わり。プロモ M-P は全ページ"""
    new, quiet, page = [], 0, 1
    while quiet < 5 and page <= 60:
        cards, maxp = search('regulation_sidebar_form=XY&pg=', page)
        add = [c['id'] for c in cards if c['id'] not in have and c['folder'] != 'ENE']
        new += add
        quiet = 0 if add else quiet + 1
        if page >= maxp:
            break
        page += 1
    page = 1
    while True:
        cards, maxp = search('regulation_sidebar_form=all&pg=M-P', page)
        new += [c['id'] for c in cards if c['id'] not in have and c['folder'] != 'ENE']
        if page >= maxp:
            break
        page += 1
    return list(dict.fromkeys(new))


RARE = lambda icon: re.sub(r'_c$', '', icon.replace('ic_rare_', '')).upper() if icon else ''


def details(cid):
    h = get(f'/card-search/details.php/card/{cid}/regu/all')
    name = re.search(r'<h1 class="Heading1[^"]*">\s*([^<]+?)\s*</h1>', h)
    sub = re.search(r'<div class="subtext Text-fjalla">([\s\S]*?)</div>', h)
    sub = sub.group(1) if sub else ''
    exp = re.search(r'alt="([^"]+)"', sub)
    num = re.search(r'&nbsp;\s*([0-9A-Za-z]+)\s*&nbsp;/&nbsp;\s*([0-9A-Za-z\-]+)', sub)
    rar = re.search(r'rarity/([^".]+)\.(?:gif|png)', sub)
    kinds = re.findall(r'<h2[^>]*>\s*([^<]+?)\s*</h2>', h)
    img = re.search(r'(/assets/images/card_images/large/[^"]+\.jpg)', h)
    return dict(cardID=str(cid), name=name.group(1).strip() if name else '', exp=exp.group(1) if exp else '',
                num=num.group(1) if num else '', denom=num.group(2) if num else '',
                rarity=RARE(rar.group(1) if rar else ''), kind=kinds[0] if kinds else '', img=img.group(1) if img else '')


T = json.load(open(os.path.join(HERE, 'reg_templates.json'), encoding='utf-8'))


def regulation(im):
    """左下のレギュレーションマークを、既存カードから作ったお手本と比べて判定（類似度も返す）"""
    x0, y0, x1, y1 = T['box']
    sx, sy = im.width / 868, im.height / 1212   # お手本は 868×1212 の画像で作成
    best = (-1, '')
    for dx in range(-4, 5, 2):
        for dy in range(-4, 5, 2):
            c = im.crop((int((x0 + dx) * sx), int((y0 + dy) * sy), int((x1 + dx) * sx), int((y1 + dy) * sy)))
            a = np.asarray(c.convert('L').resize(tuple(T['size'])), dtype=float).ravel()
            a = (a - a.mean()) / (a.std() + 1e-6)
            for k, t in T['templates'].items():
                t = np.asarray(t)
                s = float(a @ t / (np.linalg.norm(a) * np.linalg.norm(t) + 1e-9))
                if s > best[0]:
                    best = (s, k)
    return best[1], round(best[0], 3)


def main():
    os.makedirs(OUT, exist_ok=True)
    have = known_ids()
    print('スプレッドシートのカード:', len(have), '枚')
    ids = find_new(have)
    print('未登録のカード:', len(ids), '枚')
    dates = code_dates(products()) if ids else {}
    print('発売日:', dates)
    new = []
    for cid in ids:
        d = details(cid)
        if not d['exp'] or not d['img'] or d['kind'] == '基本エネルギー':
            continue
        if not d['name']:
            print('  カード名が読めないため除外:', cid); continue
        data = get(d['img'], binary=True)
        with open(os.path.join(OUT, cid + '.jpg'), 'wb') as f:
            f.write(data)
        im = Image.open(io.BytesIO(data)).convert('RGB')
        d['reg'], d['reg_score'] = regulation(im)
        d['reg_check'] = d['reg_score'] < 0.8      # 自信が低いものは「要確認」
        d['name'] = html.unescape(d['name'])
        d['release'] = dates.get(d['exp'], '')
        new.append(d)
        print(f"  {d['exp']} {d['num']}/{d['denom']} {d['name']} [{d['reg']} {d['reg_score']}] {{{d['rarity']}}} {d['kind']} 発売日:{d['release'] or '不明'}")
    json.dump(dict(updated=datetime.datetime.now(JST).isoformat(timespec='minutes'), cards=new),
              open(os.path.join(OUT, 'newcards.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('新しいカード:', len(new), '枚（要確認', sum(c['reg_check'] for c in new), '枚）')


if __name__ == '__main__':
    main()
