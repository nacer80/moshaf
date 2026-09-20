#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
يولّد قاعدة توقيت تجريبية (samples/timings-sample.db) للتجربة السريعة:
  CREATE TABLE surah_list(id, sura_no, name, url, reciter)
  CREATE TABLE segments(id, sura_no, aya_no, word_no, start_ms, end_ms)

الأزمنة هنا "مُقدَّرة" (ليست توقيتاً حقيقياً للتلاوة) — الغرض منها تجربة
الواجهة فقط. استبدلها بملفك timings.db الحقيقي.
"""
import json, os, sqlite3, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB_FILE = os.path.join(ROOT, 'assets', 'Madina05-Hafs-16px.json')
OUT = os.path.join(ROOT, 'samples', 'timings-sample.db')
RECITER = 'ar.alafasy'
URL_TPL = 'https://cdn.islamic.network/quran/audio-surah/128/%s/%d.mp3'

AR = re.compile(r'[\u0621-\u064A\u0671-\u06D3]')

def words_of(text):
    return [t for t in text.split() if t and AR.search(t)]

def main():
    data = json.load(open(DB_FILE, encoding='utf-8'))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    con = sqlite3.connect(OUT)
    cur = con.cursor()
    cur.execute("""CREATE TABLE surah_list(
        id INTEGER PRIMARY KEY, sura_no INTEGER, name TEXT, url TEXT, reciter TEXT)""")
    cur.execute("""CREATE TABLE segments(
        id INTEGER PRIMARY KEY, sura_no INTEGER, aya_no INTEGER,
        word_no INTEGER, start_ms INTEGER, end_ms INTEGER)""")
    cur.execute("CREATE INDEX idx_seg ON segments(sura_no, aya_no)")

    sid = 0
    t = 0
    for si, sura in enumerate(data['suras'], start=1):
        cur.execute("INSERT INTO surah_list VALUES (?,?,?,?,?)",
                    (si, si, sura['name'], URL_TPL % (RECITER, si), RECITER))
        t = 0
        for ai, aya in enumerate(sura['ayas']):
            aya_no = ai - 1               # -1 زخرفة، 0 بسملة، 1..n آية
            if aya_no < 0:
                continue
            if si == 1 and aya_no == 0:   # في الفاتحة البسملة هي الآية 1، والخانة 0 عنوانها
                continue
            t += 900                       # سكتة قبل الآية/البسملة
            for wi, w in enumerate(words_of(aya['r'][0]['t'] if len(aya['r']) == 1
                                            else ' '.join(p['t'] for p in aya['r'])), start=1):
                dur = 260 + 58 * len(w)
                cur.execute("INSERT INTO segments VALUES (?,?,?,?,?,?)",
                            (sid, si, aya_no, wi, int(t), int(t + dur)))
                sid += 1
                t += dur + 45
            t += 260
    con.commit()
    n = cur.execute("SELECT COUNT(*) FROM segments").fetchone()[0]
    con.close()
    print('wrote', OUT, 'segments:', n)

if __name__ == '__main__':
    main()
