#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
يولّد ملف توزيع طبعة ١٤٣٩هـ (رسم QCF V2 كما تنشره Quran.com) مع إبقاء النصّ الحقيقي.

المدخلات:
  assets/Madina05-Hafs-16px.json   ← رسمنا الحقيقي (نصّ + ترقيم الكلمات)
  <cache>/pages/{1..604}.json      ← مواضع الكلمات لكل سطر في طبعة ١٤٣٩
      (المصدر: github.com/abdoadel123/mutqin-resources — أصول مجمع الملك فهد عبر Quran.com)

المخرجات:
  assets/layout-1439.json
      مصفوفة ٦٠٤ صفحة؛ كل صفحة مصفوفة سطور (١٥ خانة)؛ كل سطر مصفوفة مفاتيح "سورة:آية:كلمة"
      (السطر الفارغ = خانة عمودية فارغة كما في الصفحة المطبوعة)

الفكرة: نُحاذي تسلسل كلمات الطبعة الجديدة مع تسلسل كلماتنا (نصّنا الحقيقي)،
ثم نضع كلماتنا على سطور الطبعة الجديدة. النصّ والترقيم والتلوين يبقى كما هو.
"""
import argparse
import collections
import json
import os
import re
import sys
import urllib.request

AR = re.compile(r'[\u0621-\u064A\u0671-\u06D3]')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'assets', 'Madina05-Hafs-16px.json')
OUT = os.path.join(ROOT, 'assets', 'layout-1439.json')
CACHE = os.path.join(os.path.dirname(ROOT), '.dev', 'mq')
BASE_URL = 'https://raw.githubusercontent.com/abdoadel123/mutqin-resources/main/mushaf/pages/%d.json'


# ------------------------------------------------------------------ 1) كلماتنا
def load_mine():
    data = json.load(open(DB, encoding='utf-8'))
    words, heads = [], []          # كلمات الآيات / كلمات العنوان والبسملة
    wc = collections.Counter()
    for si, sura in enumerate(data['suras'], start=1):
        for ai, ayah in enumerate(sura['ayas']):
            a = ai - 1
            for part in ayah['r']:
                for tok in part['t'].split():
                    if not tok:
                        continue
                    if not AR.search(tok):
                        continue                      # علامة آية/وقف (ليست كلمة)
                    wc[(si, a)] += 1
                    key = '%d:%d:%d' % (si, a, wc[(si, a)])
                    rec = (si, a, key, ayah['p'], part['l'])
                    (heads if a <= 0 else words).append(rec)
    return data, words, heads


# ------------------------------------------- 2) كلمات الطبعة الجديدة (١٤٣٩)
def fetch_cache(quiet=True):
    os.makedirs(CACHE, exist_ok=True)
    need = [p for p in range(1, 605) if not os.path.exists(os.path.join(CACHE, '%d.json' % p))]
    if need:
        print('تنزيل %d ملف…' % len(need))
        import concurrent.futures
        def get(p):
            for _ in range(3):
                try:
                    with urllib.request.urlopen(BASE_URL % p, timeout=30) as r:
                        open(os.path.join(CACHE, '%d.json' % p), 'wb').write(r.read())
                    return True
                except Exception:
                    pass
            return False
        with concurrent.futures.ThreadPoolExecutor(24) as ex:
            list(ex.map(get, need))


def load_new():
    entries = []                   # (صفحة، سطر، سورة، آية)
    for p in range(1, 605):
        j = json.load(open(os.path.join(CACHE, '%d.json' % p), encoding='utf-8'))
        for L in j['lines']:
            for _g, s, a in L['w']:
                entries.append((p, L['l'], s, a))
    # آخر ورود لكل آية = علامة الآية ﴿n﴾ (ليست كلمة)
    last = {}
    for i, (p, l, s, a) in enumerate(entries):
        last[(s, a)] = i
    marks = set(last.values())
    words = [(p, l, s, a) for i, (p, l, s, a) in enumerate(entries) if i not in marks]
    return words


# ------------------------------------------------------------- 3) المحاذاة
def align(theirs, mine, win=10):
    """محاذاة تتابعية greedy مع نافذة تطلّع"""
    pairs, extra_mine, extra_theirs, errors = [], [], [], []
    i = j = 0
    n, m = len(theirs), len(mine)
    while i < n and j < m:
        tp, tl, ts, ta = theirs[i]
        ms, ma, mkey, mp, ml = mine[j]
        if (ts, ta) == (ms, ma):
            pairs.append((i, j)); i += 1; j += 1; continue
        hit = None
        for k in range(1, win + 1):
            if i + k < n and theirs[i + k][2:] == (ms, ma):
                hit = ('t', k); break
            if j + k < m and mine[j + k][:2] == (ts, ta):
                hit = ('m', k); break
        if hit == ('t', k):
            for x in range(k): extra_theirs.append(i + x)
            i += k
        elif hit == ('m', k):
            for x in range(k): extra_mine.append(j + x)
            j += k
        else:
            errors.append((i, j)); extra_theirs.append(i); extra_mine.append(j)
            i += 1; j += 1
    for x in range(i, n): extra_theirs.append(x)
    for x in range(j, m): extra_mine.append(x)
    return pairs, extra_mine, extra_theirs, errors


# ------------------------------------------------------------ 4) بناء التوزيع
def build(mine_words, mine_heads, new_words, pairs, extra_mine):
    SLOTS = 15
    pages = [[[] for _ in range(SLOTS)] for _ in range(605)]   # (ترتيب القراءة، المفتاح)
    slot_of = {}                                   # فهرس كلماتنا -> (صفحة، سطر)
    for i, j in pairs:
        p, l, _s, _a = new_words[i]
        key = mine_words[j][2]
        pages[p][l - 1].append((j, key))
        slot_of[j] = (p, l - 1)
    # كلماتنا الزائدة: نُلحقها بأقرب سطر سابق
    orphans = 0
    for j in extra_mine:
        jj = j - 1
        while jj >= 0 and jj not in slot_of:
            jj -= 1
        if jj < 0:
            orphans += 1
            continue
        p, sl = slot_of[jj]
        pages[p][sl].append((j, mine_words[j][2]))
        slot_of[j] = (p, sl)
    # ترتيب كل سطر حسب ترتيب القراءة (فهرس الكلمة في تسلسلنا)
    # العناوين والبسملات
    head_by_page = collections.defaultdict(lambda: collections.defaultdict(list))
    for si, a, key, p, l in mine_heads:
        head_by_page[si][a].append(key)
    first_slot = {}                                # السورة -> أول سطر نصّ في صفحتها
    for j, (p, sl) in slot_of.items():
        s = mine_words[j][0]
        if s not in first_slot or (p, sl) < first_slot[s]:
            first_slot[s] = (p, sl)
    for si, groups in head_by_page.items():
        if si not in first_slot:
            print('تحذير: لا مكان لعنوان السورة %d' % si)
            continue
        p, sl = first_slot[si]
        title = groups.get(-1, [])
        basm = groups.get(0, [])
        # الموضع: عنوان ثم بسملة قبل أول سطر نصّ (أو أعلى الصفحة)
        tslot = sl - 2 if sl - 2 >= 0 else 0
        while tslot > 0 and pages[p][tslot]:
            tslot -= 1
        if title:
            pages[p][tslot] = [(-2, k) for k in title] + pages[p][tslot]
        if basm:
            bslot = tslot + 1
            if bslot >= sl:
                bslot = tslot
            if bslot != tslot:
                pages[p][bslot] = [(-1, k) for k in basm] + pages[p][bslot]
            else:
                pages[p][bslot] = [(-2, k) for k in title] + [(-1, k) for k in basm] + \
                    [x for x in pages[p][bslot] if x[1] not in title and x[1] not in basm]
    return pages, orphans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true')
    args = ap.parse_args()
    if args.fetch or not os.path.isdir(CACHE):
        fetch_cache()
    data, mine_words, mine_heads = load_mine()
    new_words = load_new()
    print('كلماتنا (الآيات): %d | كلمات الطبعة الجديدة: %d | عناوين/بسملات: %d'
          % (len(mine_words), len(new_words), len(mine_heads)))
    pairs, extra_mine, extra_theirs, errors = align(new_words, mine_words)
    print('محاذاة: %d زوج | زائد عندنا %d | زائد عندهم %d | تعذّر %d'
          % (len(pairs), len(extra_mine), len(extra_theirs), len(errors)))
    pages, orphans = build(mine_words, mine_heads, new_words, pairs, extra_mine)
    print('كلمات يتيمة:', orphans)

    # ---------------- تحقّق ----------------
    # ترتيب كل سطر ثم استخراج المفاتيح
    for p in range(1, 605):
        for sl in range(len(pages[p])):
            pages[p][sl].sort(key=lambda x: x[0])
    allkeys = collections.Counter()
    for p in range(1, 605):
        for sl in pages[p]:
            allkeys.update(k for _o, k in sl)
    mine_all = set(w[2] for w in mine_words) | set(h[2] for h in mine_heads)
    print('مفاتيح في التوزيع: %d | كلماتنا: %d | مفقود: %d | مكرر: %d'
          % (sum(allkeys.values()), len(mine_all), len(mine_all - set(allkeys)),
             sum(1 for v in allkeys.values() if v > 1)))
    # هل تسلسل (سورة،آية) في كل صفحة مطابق للطبعة الجديدة؟
    key2sa = {}
    for si, a, key, p, l in list(mine_words) + list(mine_heads):
        key2sa[key] = (si, a)
    bad = 0
    new_by_page = collections.defaultdict(list)
    for p, l, s, a in new_words:
        new_by_page[p].append((s, a))
    for p in range(1, 605):
        mine_seq = [key2sa[k] for sl in pages[p] for _o, k in sl if key2sa[k][1] >= 1]
        if mine_seq != new_by_page[p]:
            bad += 1
    print('صفحات غير مطابقة تماماً للطبعة الجديدة: %d من ٦٠٤' % bad)

    out = {
        'title': 'توزيع مصحف المدينة النبوية — طبعة ١٤٣٩هـ (رسم QCF V2)',
        'source': 'موضّع الكلمات: github.com/abdoadel123/mutqin-resources عن أصول مجمع الملك فهد (Quran.com)',
        'slots': 15,
        'pages': [[[k for _o, k in sl] for sl in pages[p]] for p in range(1, 605)]
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('كُتب:', OUT, '%.0f ك.ب' % (os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
