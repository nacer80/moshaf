# -*- coding: utf-8 -*-
"""
يبني assets/tajweed.json من بيانات quran.com (طبعة uthmani_tajweed)،
محاذاةً على رسم مصحفنا كلمة بكلمة وحرفاً بحرف.

المدخلات:
  1) quran-mushaf/assets/Madina05-Hafs-16px.json  — رسمنا (المصدر المعتمد للترتيب)
  2) api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=N
     (تُنزَّل مرة واحدة وتُحفظ في .dev/tajweed/، أو أي مجلد عبر --cache)

المخرجات: assets/tajweed.json
  {
    "rules": [{"id":"madda_normal","ar":"مد طبيعي","c":"#537FFF","cd":"#8fa8ff"}, ...],
    "code":  {"a":"madda_normal", ...},
    "words": { "2:5:1": "..a.b..", ... }   ← رمز القاعدة لكل حرف من حروف الكلمة ('.' = بلا قاعدة)
  }
"""
import json, os, re, sys, argparse, collections, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'assets', 'Madina05-Hafs-16px.json')
OUT = os.path.join(ROOT, 'assets', 'tajweed.json')
API = 'https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=%d'

TAT = '\u0640'      # التطويل
DAG = '\u0670'      # الألف الخنجرية
ZWNJ = '\u200c'

# ألوان quran.com الرسمية (ونظيراتها للوضع الليلي)
RULES = [
    ('ham_wasl',             'همزة وصل',      '#AAAAAA', '#8a8a8a'),
    ('slnt',                 'حرف صامت',      '#AAAAAA', '#8a8a8a'),
    ('laam_shamsiyah',       'لام شمسية',     '#AAAAAA', '#8a8a8a'),
    ('madda_normal',         'مد طبيعي',      '#537FFF', '#9db4ff'),
    ('madda_permissible',    'مد جائز',       '#4050FF', '#8f99ff'),
    ('madda_obligatory',     'مد واجب متصل',  '#2144C1', '#7d96f0'),
    ('madda_necessary',      'مد لازم',       '#000EBC', '#6b78e8'),
    ('qalaqah',              'قلقلة',         '#DD0008', '#ff6b60'),
    ('ikhafa',               'إخفاء',         '#9400A8', '#d478de'),
    ('ikhafa_shafawi',       'إخفاء شفوي',    '#D500B7', '#e87ae0'),
    ('idgham_shafawi',       'إدغام شفوي',    '#58B800', '#9ee06a'),
    ('iqlab',                'إقلاب',         '#26BFFD', '#7fdcff'),
    ('idgham_ghunnah',       'إدغام بغنة',    '#169777', '#5fd6ae'),
    ('idgham_wo_ghunnah',    'إدغام بلا غنة', '#169200', '#63d65c'),
    ('idgham_mutajanisayn',  'إدغام متجانسين', '#A1A1A1', '#8a8a8a'),
    ('idgham_mutaqaribayn',  'إدغام متقاربين', '#A1A1A1', '#8a8a8a'),
    ('ghunnah',              'غنة',           '#FF7E1E', '#ffb063'),
]
BY_RULE = {r[0]: r for r in RULES}
CODES = 'abcdefghijklmnopq'
CODE2RULE = {CODES[i]: RULES[i][0] for i in range(len(RULES))}
RULE2CODE = {v: k for k, v in CODE2RULE.items()}

OPEN = re.compile(r'<(tajweed|span)\s+class=([\w\-]+)>')
CLOSE = {'tajweed': re.compile(r'</tajweed>'), 'span': re.compile(r'</span>')}
ANY = re.compile(r'</?(?:tajweed|span)[^>]*>')


def split_words(raw):
    """يقسّم نص الآية إلى كلمات — مع حماية المسافات الموجودة داخل الوسوم"""
    prot = re.sub(r'<[^>]*>', lambda m: m.group(0).replace(' ', '\x01'), raw)
    return [t.replace('\x01', ' ') for t in prot.split() if t]


def norm_char(ch):
    """تطبيع خفيف للحرف قبل المقارنة (فروق رسمية غير جوهرية)"""
    if ch == '\u0672' or ch == '\u0673':
        return DAG
    return ch


def parse_ayah(raw):
    """يفكّك نص الآية إلى كلمات، كل كلمة قائمة (حرف، قاعدة).
       بعض وسوم quran.com تعبر المسافات (مثل: <tajweed class=idgham_ghunnah>دًى م</tajweed>)
       فالمعالجة تكون على الآية كلها لا على كلمة كلمة."""
    out = [[]]
    i, n = 0, len(raw)
    while i < n:
        m = OPEN.match(raw, i)
        if m:
            rule = m.group(2) if m.group(2) in BY_RULE else ''
            close = CLOSE[m.group(1)].search(raw, m.end())
            end = close.start() if close else n
            for ch in raw[m.end():end]:
                if ch == ' ':
                    out.append([])
                else:
                    out[-1].append((ch, rule))
            i = close.end() if close else n
        else:
            ch = raw[i]
            if ch == ' ':
                out.append([])
            else:
                out[-1].append((ch, ''))
            i += 1
    return [w for w in out if w]


def core_indexes(word):
    """أي حروف الكلمة «أصلية» (التطويل المستقل يُحذف، والمطّ قبل ألف خنجرية يُبقى)"""
    keep = []
    for i, ch in enumerate(word):
        if ch == TAT:
            prev_dag = i > 0 and word[i - 1] in (DAG, '\u0672', '\u0673')
            next_dag = i + 1 < len(word) and word[i + 1] in (DAG, '\u0672', '\u0673')
            if not (prev_dag or next_dag):
                continue
        keep.append(i)
    return keep


def align(a, b):
    """محاذاة حروفنا (a) مع حروفهم (b) ببرمجة ديناميكية — يطابق الحروف ويتحمل الحذف/الإضافة"""
    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return [-1] * n
    INF = 10 ** 6
    prev = list(range(m + 1))
    prev = [j * 3 for j in range(m + 1)]
    ptr = []
    for i in range(1, n + 1):
        cur = [i * 3] + [0] * m
        row = [0] * (m + 1)
        for j in range(1, m + 1):
            same = norm_char(a[i - 1]) == norm_char(b[j - 1][0])
            d = prev[j - 1] + (0 if same else 5)
            u = prev[j] + 3
            l = cur[j - 1] + 3
            if d <= u and d <= l:
                cur[j] = d
                row[j] = 0
            elif u <= l:
                cur[j] = u
                row[j] = 1
            else:
                cur[j] = l
                row[j] = 2
        prev = cur
        ptr.append(row)
    # تتبّع رجعي
    i, j, out = n, m, [-1] * n
    while i > 0:
        mv = ptr[i - 1][j]
        if mv == 0:
            out[i - 1] = j - 1
            i -= 1
            j -= 1
        elif mv == 1:
            i -= 1
        else:
            j -= 1
    return out


B36 = '0123456789abcdefghijklmnopqrstuvwxyz'


def encode(code):
    """ترميز مُدمج: موضع القاعدة (base36) + رمزها، مثال: 2a5b"""
    out = []
    for i, ch in enumerate(code):
        if ch == '.':
            continue
        if i >= 36:
            return '*' + code          # كلمة طويلة جداً: نخزّنها كاملة
        out.append(B36[i] + ch)
    return ''.join(out)


def build(cache):
    db = json.load(open(DB, encoding='utf-8'))
    words = {}
    stats = collections.Counter()

    for s in range(1, 115):
        path = os.path.join(cache, '%d.json' % s)
        if not os.path.exists(path):
            sys.stdout.write('\rtنزيل سورة %d…' % s)
            sys.stdout.flush()
            with urllib.request.urlopen(API % s, timeout=90) as r:
                data = json.loads(r.read().decode('utf-8'))
            os.makedirs(cache, exist_ok=True)
            json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
        else:
            data = json.load(open(path, encoding='utf-8'))

        for v in data['verses']:
            a = int(v['verse_key'].split(':')[1])
            raw = v['text_uthmani_tajweed']
            their_words = [w for w in parse_ayah(raw)
                           if not all(re.match(r'^[٠-٩\u0660-\u0669]$', c) for c, _ in w)]
            # كلماتنا من الرسم (بلا علامات الآيات)
            mine = []
            ay = db['suras'][s - 1]['ayas'][a + 1]
            for part in ay['r']:
                for t in part['t'].split():
                    if t and not re.search(r'[\uFD3E\uFD3F]', t):
                        mine.append(t)
            stats['ayahs'] += 1
            if len(mine) != len(their_words):
                stats['skip_words'] += 1
                continue
            for wi, (mw, tw) in enumerate(zip(mine, their_words)):
                idx = core_indexes(mw)
                my_core = [mw[i] for i in idx]
                mp = align(my_core, tw)
                rules = ['' for _ in mw]
                last_rule = ''
                for k, pos in enumerate(mp):
                    ch = my_core[k]
                    rule = tw[pos][1] if pos >= 0 else ''
                    # التطويل يرث قاعدة ما قبله
                    start = idx[k]
                    end = idx[k + 1] if k + 1 < len(idx) else len(mw)
                    for p in range(start, end):
                        rules[p] = rule
                    if rule:
                        last_rule = rule
                # الحروف المحذوفة (التطويل المستقل) ترث السابق
                for p in range(len(mw)):
                    if p not in idx:
                        rules[p] = last_rule if False else (rules[p - 1] if p > 0 else '')
                code = ''.join(RULE2CODE.get(r, '.') for r in rules)
                if set(code) != {'.'}:
                    words['%d:%d:%d' % (s, a, wi + 1)] = encode(code)
                    stats['colored_words'] += 1
                    for r in rules:
                        if r:
                            stats['rule_' + r] = stats.get('rule_' + r, 0) + 1
                stats['words'] += 1
    return words, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(os.path.dirname(ROOT), '.dev', 'tajweed'))
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()

    words, stats = build(args.cache)
    out = {
        'source': 'api.quran.com — طبعة uthmani_tajweed (محاذاة على رسم مصحف المدينة)',
        'rules': [{'id': r[0], 'ar': r[1], 'c': r[2], 'cd': r[3]} for r in RULES],
        'code': CODE2RULE,
        'words': words,
    }
    json.dump(out, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('\nإحصاءات:')
    for k in sorted(stats):
        print('  %-16s %d' % (k, stats[k]))
    print('كلمات ملوّنة: %d | حجم الملف: %.0f ك.ب' % (len(words), os.path.getsize(args.out) / 1024))


if __name__ == '__main__':
    main()
