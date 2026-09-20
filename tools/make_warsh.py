#!/usr/bin/env python3
"""يبني assets/warsh.json — نصّ المصحف برواية ورش عن نافع (كلمة بكلمة).

المدخلان:
  1) assets/Madina05-Hafs-16px.json  → كلمات حفص مفهرَسة بمفاتيح (سورة:آية:كلمة)
  2) uploads/words_warsh.json        → كلمات ورش: {ID, surah_num, ayah_num, word_num,
       ayah_uthmani (الرسم العثماني برواية ورش), ayah_imlai, ayah_notashkil, page_num}

المشكلة: ترقيم الآيات يختلف بين الروايتين في ٥٢ سورة (العدّ المدني لورش مقابل
العدّ الكوفي لحفص)، فلا يكفي تطابق أرقام الآيات. لذلك تتم **محاذاة الكلمات**
سورةً بسورة بمطابقة هيكل الكلمة (بعد تجريدها من التشكيل والعلامات)، فيُعرَف لكل
كلمة حفص ما يقابلها عند ورش — ويُستخرج منه أيضاً جدول تحويل أرقام الآيات.

المِخرَج:
  {
    "basmala": "بِسْمِ اِ۬للَّهِ اِ۬لرَّحْمَـٰنِ اِ۬لرَّحِيمِ",   // البسملة ليست في بيانات ورش
    "w":    {"سورة": {"آية حفص": "كلمة1 كلمة2 …"}},   // بترتيب كلمات حفص
    "amap": {"سورة": {"آية حفص": "آية ورش"}},         // لتحويل أرقام الآيات
    "tinv": {"سورة": {"آية ورش": "من-الى:آية حفص:إزاحة|..."}},  // عكسه: لاستيراد توقيت ورش
    "wc":   {"سورة": "ن1,ن2,..."}                    // عدد كلمات كل آية ورق (للكشف)
  }
"""
import collections
import difflib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # مجلد المشروع (الدليل الأب لـ tools/)
HAFS = os.path.join(ROOT, 'assets', 'Madina05-Hafs-16px.json')
OUT = os.path.join(ROOT, 'assets', 'warsh.json')
# مُدخَل ورش: مرِّره كأول وسيطة، أو ضعه في assets/words_warsh.json
WARSH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'words_warsh.json')

if not os.path.exists(WARSH):
    sys.exit('لا يوجد ملف كلمات ورش عند: %s\nمرِّره وسيطاً أولاً: python3 tools/make_warsh.py /path/words_warsh.json' % WARSH)

MISS = '\u0001'          # موضع كلمة حفص التي لا مقابل لها عند ورش
AR = re.compile(r'[\u0621-\u064A\u0671-\u06D3]')
# التشكيل والعلامات الصغيرة والألف الخنجرية والتطويل والوسوم
MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200F]')


def skeleton(t, is_warsh=False):
    """هيكل الكلمة للمقارنة (بلا تشكيل ولا علامات ولا فروق رسم)."""
    if is_warsh:
        t = t.replace('\u06D2', '\u064A')      # ے (ياء ورش) → ي
        t = t.replace('\u06D3', '\u064A')
    t = MARKS.sub('', t)
    t = t.replace('\u0622', '\u0627').replace('\u0623', '\u0627') \
         .replace('\u0625', '\u0627').replace('\u0671', '\u0627') \
         .replace('\u0672', '\u0627').replace('\u0673', '\u0627')
    t = t.replace('\u0649', '\u064A').replace('\u06CC', '\u064A')
    t = t.replace('\u0629', '\u0647')
    return t


def hafs_words():
    """كلمات حفص: (سورة,آية) -> [كلمة,...] بنفس ترتيب البرنامج."""
    data = json.load(open(HAFS, encoding='utf-8'))
    out = {}
    for si, sura in enumerate(data['suras'], start=1):
        for ai, aya in enumerate(sura['ayas']):
            aNo = ai - 1                       # -1 زخرفة/عنوان، 0 بسملة، 1..n آية
            lst = []
            for part in aya['r']:
                for tok in re.split(r'\s+', part['t']):
                    if tok and AR.search(tok):
                        lst.append(tok)
            out[(si, aNo)] = lst
    return out


def warsh_words():
    """كلمات ورش: (سورة,آية) -> [كلمة,...] بترتيب المصحف (ترتيب ID)."""
    data = json.load(open(WARSH, encoding='utf-8'))
    out = collections.defaultdict(list)
    for x in sorted(data, key=lambda z: z['ID']):
        out[(int(x['surah_num']), int(x['ayah_num']))].append(x['ayah_uthmani'])
    return out


def build_basmala(wmap):
    """يولّد البسملة من الصور الواردة فعلاً في بيانات ورش."""
    want = ['بسم', 'الله', 'الرحمن', 'الرحيم']
    # نبحث عن أكثر صورة وروداً لكل كلمة (بالرسم غير المشكول)
    text = json.load(open(WARSH, encoding='utf-8'))
    cands = {}
    for t in want:
        c = collections.Counter(x['ayah_uthmani'] for x in text
                                if x['ayah_notashkil'] == t)
        cands[t] = c
    # «بِسْمِ» ثم صيغ الجرّ بالكسرة: اِ۬للَّهِ / اِ۬لرَّحْمَٰنِ / اِ۬لرَّحِيمِ
    pick = ['بِسْمِ', 'اِ۬للَّهِ', 'اِ۬لرَّحْمَٰنِ', 'اِ۬لرَّحِيمِ']
    for p, t in zip(pick, want):
        if p not in cands[t] and cands[t]:
            print('  تحذير: الصورة المختارة لـ%s غير موجودة، تُستخدم %s' % (t, cands[t].most_common(1)[0][0]))
    return ' '.join(pick)


def align(hflat, wflat):
    """محاذاة تسلسلَي كلمات: تُرجع قائمة بمقابل كل كلمة حفص (أو None)."""
    hs = [skeleton(t) for t in hflat]
    ws = [skeleton(t, True) for t in wflat]
    sm = difflib.SequenceMatcher(None, hs, ws, autojunk=False)
    res = [None] * len(hflat)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ('equal', 'replace'):
            n = min(i2 - i1, j2 - j1)
            for k in range(n):
                res[i1 + k] = wflat[j1 + k]
        # 'delete' → كلمة عند حفص بلا مقابل (تبقى None)
        # 'insert'  → كلمة زائدة عند ورش تُهمل
    return res


def main():
    for f in (HAFS, WARSH):
        if not os.path.exists(f):
            sys.exit('ملف مفقود: ' + f)
    hw = hafs_words()
    ww = warsh_words()
    basmala = build_basmala(ww)
    bwords = basmala.split(' ')
    # سور تنتهي بسملتها بعلامة الوقف ۖ (رواية ورش)
    BASM_WAQF = {75: 1, 83: 1, 90: 1, 104: 1}

    out_w, out_a, out_split, stats = {}, {}, {}, {'حفص': 0, 'محاذى': 0, 'سور': 0}
    out_t, out_wc = {}, {}          # tinv: ورش ← حفص للتوقيتات، wc: عدد كلمات آية ورش
    for s in range(1, 115):
        # تسلسل حفص للسورة: البسملة (إن وُجدت) ثم الآيات
        hkeys, hflat = [], []
        keys_a = sorted([a for (ss, a) in hw if ss == s])
        for a in keys_a:
            if a < 1:
                continue                     # ٠ = البسملة أو اسم السورة
            if s == 1 and a == 1:
                continue                     # الفاتحة: ١ هي البسملة عند حفص
            for i, t in enumerate(hw[(s, a)], start=1):
                hkeys.append((s, a, i))
                hflat.append(t)
        # مفتاح البسملة: ١ عند الفاتحة (كما يخزّنها البرنامج) و٠ عند بقية السور
        bkey = 1 if s == 1 else 0
        has_basm = (s == 1 and any(a == 1 for a in keys_a)) or ((s, 0) in hw and hw[(s, 0)])
        if has_basm:
            nb = len(hw[(s, bkey)])
            hkeys = [(s, bkey, i) for i in range(1, nb + 1)] + hkeys
            hflat = hw[(s, bkey)][:nb] + hflat

        # تسلسل ورش للسورة: البسملة (إلا التوبة) ثم الآيات
        wkeys, wflat = [], []
        for a in sorted([a for (ss, a) in ww if ss == s]):
            for i, t in enumerate(ww[(s, a)], start=1):
                wkeys.append((s, a, i))
                wflat.append(t)
        if has_basm and s != 9:
            bw = bwords[:]
            if s in BASM_WAQF:                 # «اِ۬لرَّحِيمِۖ»
                bw[3] = bw[3] + '\u06D6'
            wkeys = [(s, 0, i) for i in range(1, len(bw) + 1)] + wkeys
            wflat = bw + wflat

        mapped = align(hflat, wflat)
        stats['حفص'] += len(hflat)
        stats['محاذى'] += sum(1 for m in mapped if m)
        if mapped:
            stats['سور'] += 1

        # رقم آية ورش لكل كلمة حفص (من موضع المحاذاة)
        sm = difflib.SequenceMatcher(
            None, [skeleton(t) for t in hflat], [skeleton(t, True) for t in wflat], autojunk=False)
        opcodes = sm.get_opcodes()
        posmap = [None] * len(hflat)
        for tag, i1, i2, j1, j2 in opcodes:
            if tag in ('equal', 'replace'):
                n = min(i2 - i1, j2 - j1)
                for k in range(n):
                    posmap[i1 + k] = j1 + k
        wnum = []                       # رقم آية ورش لكل كلمة (0 = بلا)
        for p in posmap:
            wnum.append(wkeys[p][1] if (p is not None and p < len(wkeys)) else 0)

        # تجميع الكلمات بترتيب مفاتيح حفص
        per = collections.defaultdict(list)
        for (ss, a, i), w in zip(hkeys, mapped):
            per[(ss, a)].append(w if w else MISS)
        for (ss, a), lst in per.items():
            out_w.setdefault(str(ss), {})[str(a)] = ' '.join(lst)

        # زخارف أرقام الآيات: رقم الزخرفة عند كل نهاية آية حفص، والحدود الداخلية
        by_ayah = collections.defaultdict(list)     # آية حفص -> [(رقم الكلمة, رقم آية ورش)]
        for (ss, a, i), n in zip(hkeys, wnum):
            if a == bkey:                            # البسملة ليست آية
                continue
            by_ayah[a].append((i, n))
        # آخر آية حفص يحتوي كل رقم آية ورش (هناك توضع زخرفته)
        last_hafs = {}
        nums_in = {}
        for a in sorted(by_ayah):
            nums_in[a] = [n for (_, n) in by_ayah[a] if n]
            for n in set(nums_in[a]):
                last_hafs[n] = a
        amap_s, split_s = {}, {}
        for a in sorted(by_ayah):
            lst = by_ayah[a]
            if not lst:
                continue
            end_num = lst[-1][1]                       # رقم آية ورش لآخر كلمة
            ending = [n for n in set(nums_in[a]) if last_hafs[n] == a]
            amap_s[str(a)] = str(end_num) if end_num in ending else '0'
            ins = []
            for n in sorted(ending):
                if n == end_num:
                    continue                            # زخرفتها في نهاية الآية نفسها
                pos = max(i for (i, m) in lst if m == n)
                ins.append('%d:%d' % (pos, n))
            if ins:
                split_s[str(a)] = ','.join(sorted(ins, key=lambda z: int(z.split(':')[0])))
        if amap_s:
            out_a[str(s)] = amap_s
        if split_s:
            out_split[str(s)] = split_s

        # ---------- جدول التحويل العكسي: ترقيم ورش ← ترقيم حفص ----------
        # يُستعمل عند استيراد ملفات توقيت مرقّمة على رواية ورش (العدّ المدني)،
        # فداخلياً كل شيء مثبَّت على أرقام آيات حفص (مفاتيح 'سورة:آية:كلمة').
        inv = [None] * len(wflat)           # فهرس كلمة ورش → فهرس كلمة حفص المقابلة
        for tag, i1, i2, j1, j2 in opcodes:
            if tag in ('equal', 'replace'):
                n = min(i2 - i1, j2 - j1)
                for k in range(n):
                    inv[j1 + k] = i1 + k
        prev_i = 0
        for j in range(len(inv)):           # كلمة ورش بلا مقابل: تُمَدّ بعد السابقة
            if inv[j] is None:
                inv[j] = min(prev_i + 1, len(hkeys) - 1) if hkeys else 0
            else:
                prev_i = inv[j]
        by_w = collections.defaultdict(list)
        for j, i in enumerate(inv):
            if not hkeys:
                break
            by_w[wkeys[j][1]].append((wkeys[j][2], hkeys[i][1], hkeys[i][2]))
        counts = {n: len(v) for n, v in by_w.items()}
        tinv_s = {}
        for n in sorted(by_w):
            if n == 0:
                continue                    # البسملة: رقمها ٠ في الروايتين (وآية ١ للفاتحة)
            pieces, cur = [], None
            for (wi, ha, hi) in sorted(by_w[n]):
                off = hi - wi
                if cur and cur[2] == ha and cur[3] == off and wi == cur[1] + 1:
                    cur[1] = wi
                else:
                    if cur:
                        pieces.append(cur)
                    cur = [wi, wi, ha, off]
            if cur:
                pieces.append(cur)
            if len(pieces) == 1 and pieces[0][0] == 1 and pieces[0][1] == counts[n] \
               and pieces[0][2] == n and pieces[0][3] == 0:
                continue                    # مطابقة تماماً لحفص: لا حاجة إلى تحويل
            tinv_s[str(n)] = '|'.join('%d-%d:%d:%d' % (p[0], p[1], p[2], p[3]) for p in pieces)
        if tinv_s:
            out_t[str(s)] = tinv_s
        if counts:
            out_wc[str(s)] = ','.join(str(counts.get(i, 0)) for i in range(1, max(counts) + 1))

    out = {'__src': 'محاذاة كلمة بكلمة: حفص (Madina05) ↔ ورش (words_warsh.json)',
           '__note': MISS + ' = لا مقابل عند ورش، يُستعمل نصّ حفص',
           'basmala': basmala, 'w': out_w, 'amap': out_a, 'split': out_split,
           'tinv': out_t, 'wc': out_wc}
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    nT = sum(len(v) for v in out_t.values())
    print('تحويل التوقيت (tinv): %d سورة، %d آية | عدد كلمات آيات ورش (wc): %d سورة'
          % (len(out_t), nT, len(out_wc)))
    print('تم:', OUT, '%.0f ك.ب' % (os.path.getsize(OUT) / 1024.0))
    print('كلمات حفص: %d | محاذاة مع ورش: %d (%.2f%%)' %
          (stats['حفص'], stats['محاذى'], 100.0 * stats['محاذى'] / max(1, stats['حفص'])))
    print('البسملة:', basmala)
    print('عيّنة 1:1 (بسملة) =', out_w['1']['1'])
    print('عيّنة 1:2 =', out_w['1']['2'])
    print('عيّنة 1:5 =', out_w['1']['5'])
    print('عيّنة 1:7 =', out_w['1']['7'])
    print('تحويل آيات سورة ١:', out_a['1'])


if __name__ == '__main__':
    main()
