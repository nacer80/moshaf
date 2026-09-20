#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""يحوّل ملف «مقاطع» (JSON) إلى قاعدة توقيت SQLite بنفس مخطط المستخدم:

    CREATE TABLE segments(
      surah_number INTEGER, ayah_number INTEGER, duration_sec INTEGER,
      timestamp_from INTEGER, timestamp_to INTEGER, segments TEXT)
    CREATE TABLE surah_list(id INTEGER PRIMARY KEY, sura_no INTEGER,
      name TEXT, url TEXT, reciter TEXT)

الصيغة المقبولة في JSON: مصفوفة كائنات، لكل آية سطرٌ واحد، مثل:

    {"surah_number":2, "ayah_number":1, "duration_sec":14,
     "timestamp_from":7480, "timestamp_to":22210,
     "segments":"[[1,7480,14930],[2,14930,16970]]"}

أسماء الأعمدة تُكتشف تلقائياً (surah_number / surah / s …، وayah_number / ayah / a …).
«segments» مصفوفة [[رقم الكلمة، من، إلى], …] — رقماً أو نصاً.

الاستخدام:
    python3 tools/make_db_from_json.py segments.json samples/timings-warsh.db \
        --reciter 'warsh' --unit ms

ملاحظة: أرقام الآيات تبقى كما هي في الملف — أي على رواية القارئ (العدّ المدني
لورش)، والبرنامج يحوّلها إلى مفاتيحه الداخلية عند التحميل (انظر assets/warsh.json
«tinv»). لا حاجة إلى إعادة الترقيم هنا.
"""
import argparse
import json
import os
import re
import sqlite3
import sys

ALIASES = {
    'sura': ['surah_number', 'surah', 'sura', 'surano', 'suranumber', 'chapter', 'chapter_number', 's'],
    'aya': ['ayah_number', 'ayah', 'aya', 'verse', 'verse_number', 'ayah_no', 'a'],
    'segs': ['segments', 'words', 'segment', 'timings', 'data', 'payload'],
    'from': ['timestamp_from', 'time_from', 'from', 'start', 'start_ms', 'timestampfrom'],
    'to': ['timestamp_to', 'time_to', 'to', 'end', 'end_ms', 'timestampto'],
    'dur': ['duration_sec', 'duration', 'dur', 'length'],
}
NAMES = {1: 'الفاتحة', 9: 'التوبة'}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s or '').lower())


def pick_keys(row):
    keys = {norm(k): k for k in row}
    out = {}
    for role, cands in ALIASES.items():
        for c in cands:
            if norm(c) in keys:
                out[role] = keys[norm(c)]
                break
    return out


def to_int(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--reciter', default='')
    ap.add_argument('--url', default='', help='قالب رابط الصوت، يُستبدل فيه {no} برقم السورة')
    args = ap.parse_args()

    data = json.load(open(args.src, encoding='utf-8'))
    if isinstance(data, dict):                      # {"segments":[…]} أو {سورة: […]}
        for k in ('segments', 'rows', 'data', 'timings'):
            if isinstance(data.get(k), list):
                data = data[k]
                break
    if not isinstance(data, list) or not data:
        sys.exit('لم أفهم بنية الملف: المطلوب مصفوفة كائنات، سطر لكل آية')

    km = pick_keys(data[0])
    for role in ('sura', 'aya', 'segs'):
        if role not in km:
            sys.exit('لا أجد عمود «%s» في أول صفوف الملف (الأعمدة: %s)'
                     % (role, ', '.join(data[0].keys())))
    print('الأعمدة:', ', '.join('%s←%s' % (r, km[r]) for r in ALIASES if r in km))

    rows, skipped = [], 0
    for i, raw in enumerate(data):
        if not isinstance(raw, dict):
            skipped += 1
            continue
        s = to_int(raw.get(km['sura']))
        a = to_int(raw.get(km['aya']))
        if s is None or a is None or not (1 <= s <= 114) or a < 0:
            skipped += 1
            continue
        seg = raw.get(km['segs'])
        if isinstance(seg, str):
            try:
                seg = json.loads(seg)
            except ValueError:
                seg = None
        items = []
        if isinstance(seg, list):
            for it in seg:
                if isinstance(it, (list, tuple)) and len(it) >= 2:
                    w, t0 = to_int(it[0]), to_int(it[1])
                    t1 = to_int(it[2]) if len(it) > 2 else None
                    if w is None or t0 is None:
                        continue
                    items.append([w, t0, t1 if t1 is not None else t0])
        tf = to_int(raw.get(km.get('from'))) if km.get('from') else None
        tt = to_int(raw.get(km.get('to'))) if km.get('to') else None
        if items:
            if tf is None:
                tf = items[0][1]
            if tt is None:
                tt = max(x[2] for x in items)
        if tf is None or tt is None:
            skipped += 1
            continue
        dur = to_int(raw.get(km.get('dur'))) if km.get('dur') else None
        if dur is None:
            dur = int(round((tt - tf) / 1000.0))
        rows.append((s, a, dur, tf, tt, json.dumps(items, separators=(',', ':'))))
    if not rows:
        sys.exit('لم أستخرج أي صف صالح')

    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    if os.path.exists(args.out):
        os.remove(args.out)
    con = sqlite3.connect(args.out)
    cur = con.cursor()
    cur.execute("""CREATE TABLE segments(
        surah_number INTEGER, ayah_number INTEGER, duration_sec INTEGER,
        timestamp_from INTEGER, timestamp_to INTEGER, segments TEXT)""")
    cur.execute("CREATE INDEX idx_seg ON segments(surah_number, ayah_number)")
    cur.execute("""CREATE TABLE surah_list(id INTEGER PRIMARY KEY, sura_no INTEGER,
        name TEXT, url TEXT, reciter TEXT)""")
    cur.executemany('INSERT INTO segments VALUES (?,?,?,?,?,?)', rows)
    suras = sorted({r[0] for r in rows})
    for s in suras:
        url = args.url.replace('{no}', str(s)) if args.url else ''
        cur.execute('INSERT INTO surah_list VALUES (?,?,?,?,?)',
                    (s, s, NAMES.get(s, 'سورة %d' % s), url, args.reciter))
    con.commit()
    con.close()
    n = len(rows)
    print('كُتب: %s | سور: %d | آيات: %d%s' %
          (args.out, len(suras), n, (' (تُجِهل %d صفاً)' % skipped) if skipped else ''))


if __name__ == '__main__':
    main()
