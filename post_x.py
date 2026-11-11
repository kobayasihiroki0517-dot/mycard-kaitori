"""site/ に作成した買取表画像をXに投稿する（OAuth 1.0a）。
環境変数: X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET / SITE_URL
"""
import json, os, sys
import yaml, tweepy

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, 'site')


import re
URL_RE = re.compile(r'https?://\S+')


def x_len(text):
    """Xの文字数（日本語などは2、URLは23として数える。上限280）"""
    n = 0
    for u in URL_RE.findall(text):
        n += 23
    for ch in URL_RE.sub('', text):
        o = ord(ch)
        n += 1 if (o <= 0x10FF or 0x2000 <= o <= 0x200D or 0x2010 <= o <= 0x201F or 0x2032 <= o <= 0x2037) else 2
    return n


def compose(info, cfg, site_url):
    xc = cfg['x_post']
    feat = [c for c in info['cards'] if c['feat'] and c['price']] or \
           sorted([c for c in info['cards'] if c['price']], key=lambda c: -c['price'])
    lines = [xc['featured_line'].format(name=c['name'], rarity=c['rr'] or '', price=f"{c['price']:,}").replace('  ', ' ')
             for c in feat[:xc.get('max_featured', 3)]]
    while True:
        text = xc['text'].format(updated=info['updated'], featured='\n'.join(lines), web_url=site_url or '').strip()
        if not site_url:
            text = text.replace('全カードの買取価格はこちら👇\n', '')
        if URL_RE.search(text):
            print('注意: 投稿文にURLが含まれています（X APIの料金が高くなります）')
        if x_len(text) <= 280 or not lines:
            return text
        lines = lines[:-1]   # 長すぎるときは目玉カードの行を減らす


def main():
    keys = [os.environ.get(k) for k in ('X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET')]
    if not all(keys):
        sys.exit('XのAPIキーが設定されていないため投稿しません')
    cfg = yaml.safe_load(open(os.path.join(HERE, 'config.yml'), encoding='utf-8'))
    info = json.load(open(os.path.join(SITE, 'cards.json'), encoding='utf-8'))
    if not info.get('x_images'):
        print('掲載「○」のカードがないため、Xには投稿しません'); return
    text = compose(info, cfg, os.environ.get('SITE_URL', ''))
    print('---- 投稿文 ----\n' + text + '\n----------------')

    auth = tweepy.OAuth1UserHandler(*keys)
    api = tweepy.API(auth)
    client = tweepy.Client(consumer_key=keys[0], consumer_secret=keys[1],
                           access_token=keys[2], access_token_secret=keys[3])
    media = [api.media_upload(os.path.join(SITE, f'x_{i}.png')).media_id
             for i in range(1, min(info['x_images'], 4) + 1)]  # Xは1投稿4枚まで
    r = client.create_tweet(text=text, media_ids=media)
    print('投稿しました:', r.data.get('id'))


if __name__ == '__main__':
    main()
