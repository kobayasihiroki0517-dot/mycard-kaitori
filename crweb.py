"""Webページ用の一覧を、カードラッシュ（cardrush.media）の買取価格一覧から直接作る。
スプレッドシート側（Apps Script）の処理に頼らず、GitHub上でいつも同じ結果になるようにする。

  表記   … カードラッシュのまま（エキスパンション・型番・カード名・仕様・レアリティ）。全件を載せる
  価格   … カードラッシュ価格 ×「基準の割合」（価格ルールJ8）× 在庫による割合 → 切り捨て
           （〜99円:10円 / 100〜999円:50円 / 1,000〜9,999円:100円 / 1万円以上:1,000円単位）
           割合込みでJ3以下、または買取保証額以下になったら「買取保証」
  画像   … カード一覧（ドライブの画像）と照合できたもの。できないものは「準備中」
  カードラッシュに通常版が載っていない公式カード … 「買取保証」
"""
import csv, io, json, re, time, urllib.request, urllib.parse

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
CR_URL = 'https://cardrush.media/pokemon/buying_prices?limit=500&display_category=' + urllib.parse.quote('スタンダード') + '&page='
TRAINERS = ['グッズ', 'ポケモンのどうぐ', 'サポート', 'スタジアム']


def _get(url, tries=4):
    for t in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception:
            if t == tries - 1:
                raise
            time.sleep(5 * (t + 1))


def fetch_cardrush():
    def page(p):
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>', _get(CR_URL + str(p)))
        if not m:
            raise RuntimeError('カードラッシュのページ形式が変わった可能性があります')
        return json.loads(m.group(1))['props']['pageProps']
    first = page(1)
    rows = list(first.get('buyingPrices') or [])
    for p in range(2, int(first.get('lastPage') or 1) + 1):
        rows += page(p).get('buyingPrices') or []
    return rows


def split_list(s):
    return [x.strip() for x in re.split(r'[,、，\s]+', str(s or '')) if x.strip()]


def kind_of(k):
    k = str(k or '')
    if k in ('ワザ', '特性', 'ポケモン'):
        return 'ポケモン'
    return 'エネルギー' if 'エネルギー' in k else k


def kind_list(s):
    out = []
    for x in split_list(s):
        out += TRAINERS if x == 'トレーナーズ' else [x]
    return out


def amount_of(s):
    s = str(s or '').strip()
    d = re.sub(r'[¥￥,，円\s]', '', s)
    return int(d) if d.isdigit() else s


def parse_rules(rows):
    """価格ルールシートのCSV（A〜E:保証の表、G〜H:在庫の割合、J3:保証に切り替える額、J8:基準の割合）"""
    cell = lambda r, c: (str(rows[r][c]).strip() if r < len(rows) and c < len(rows[r]) else '')
    guar, ratio = [], []
    for r in range(2, 12):
        if cell(r, 0) and cell(r, 4):
            guar.append(dict(rr=split_list(cell(r, 0)), regs=[x.upper() for x in split_list(cell(r, 1))],
                             kinds=kind_list(cell(r, 2)), exclude=kind_list(cell(r, 3)), amount=amount_of(cell(r, 4))))
        if cell(r, 6) and cell(r, 7):
            ratio.append((float(re.sub(r'[^\d.]', '', cell(r, 6)) or 0), float(re.sub(r'[^\d.]', '', cell(r, 7)) or 100)))
    low = re.sub(r'[^\d]', '', cell(2, 9))
    base = re.sub(r'[^\d.]', '', cell(7, 9))
    return dict(guarantee=guar, ratio=sorted(ratio), low=int(low) if low else None, base=float(base) if base else 100.0)


def ratio_for(rules, stock):
    pct = 100.0
    for mn, p in rules['ratio']:
        if stock >= mn:
            pct = p
    return pct


def guarantee_for(rules, rr, reg, kind):
    kind, reg = kind_of(kind), str(reg).upper()
    for g in rules['guarantee']:
        if (rr in g['rr'] or 'それ以外' in g['rr']) and (not g['regs'] or reg in g['regs']) \
                and (not g['kinds'] or kind in g['kinds']) and kind not in g['exclude']:
            return g['amount']
    return ''


def nice(p):
    if p >= 10000:
        return p // 1000 * 1000
    if p >= 1000:
        return p // 100 * 100
    if p >= 100:
        return p // 50 * 50
    return p


def price_for(rules, cr, stock, rr, reg, kind):
    """(表示価格, 買取保証か)"""
    if cr > 0:
        p = int(cr * rules['base'] / 100 * ratio_for(rules, stock) / 100) // 10 * 10
        p = nice(p)
        if rules['low'] is not None and p <= rules['low']:
            return guarantee_for(rules, rr, reg, kind), True
        g = guarantee_for(rules, rr, reg, kind)
        if isinstance(g, int) and g > 0 and p <= g:
            return g, True
        return p, False
    return guarantee_for(rules, rr, reg, kind), True


def exp_norm(s):
    return re.sub(r'[-\s]', '', str(s or '')).upper()


def name_norm(s):
    return re.sub(r'[（(].*?[）)]', '', re.sub(r'[\s　]', '', str(s or '')))


def build_list(cr_rows, official, rules, featured):
    """official: カード一覧の行（dict）。featured: 強化買取中の照合キー（exp|num|name|reg）"""
    idx = {}
    for i, o in enumerate(official):
        idx.setdefault(exp_norm(o['exp']) + '|' + o['num'] + '|' + name_norm(o['name']), i)
    used, out = set(), []
    for x in cr_rows:
        m = re.match(r'^(\w+)(?:/([\w-]+))?', x.get('model_number') or '')
        if not m:
            continue
        exp = x.get('pack_code') or ''
        if exp in ('PROMO', 'その他') and m.group(2) and re.search(r'-P$', m.group(2), re.I):
            exp = m.group(2)
        ed = x.get('extra_difference') or ''
        spec = '' if ed == 'ノーマル仕様' else ed
        oi = idx.get(exp_norm(exp) + '|' + m.group(1) + '|' + name_norm(x.get('name')))
        o = official[oi] if oi is not None else None
        if o is not None and not spec:
            used.add(oi)
        rr = x.get('rarity') if x.get('rarity') not in (None, '', '-') else (o['rr'] if o else '')
        kind = kind_of(o['kind']) if o else ''
        stock = o['stock'] if (o and not spec) else 0
        price, guar = price_for(rules, int(x.get('amount') or 0), stock, rr, o['reg'] if o else '', kind)
        key = '|'.join([o['exp'], o['num'], o['name'], o['reg']]) if o else ''
        if price in ('', None) and not guar:
            continue
        out.append(dict(exp=o['exp'] if o else exp, num=x.get('model_number') or '', name=x.get('name') or '', sp=spec,
                        rr=rr, kind=kind, price=price if price is not None else '', g=1 if guar else 0,
                        feat=bool(key and not spec and key in featured), url=o['img'] if o else ''))
    for i, o in enumerate(official):
        if i in used:
            continue
        price, _ = price_for(rules, 0, o['stock'], o['rr'], o['reg'], o['kind'])
        key = '|'.join([o['exp'], o['num'], o['name'], o['reg']])
        out.append(dict(exp=o['exp'], num=o['fullnum'] or o['num'], name=o['name'], sp='', rr=o['rr'],
                        kind=kind_of(o['kind']), price=price, g=1, feat=key in featured, url=o['img']))
    return out
