#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
يولّد قاعدة توقيت بنفس مخطط المستخدم:

  CREATE TABLE segments(
    surah_number INTEGER, ayah_number INTEGER, duration_sec INTEGER,
    timestamp_from INTEGER, timestamp_to INTEGER, segments TEXT)

حيث segments = [[word_index, start_ms, end_ms], ...]

السور ١ و ٢ و ٣ تُكتب من البيانات الحقيقية التي أرسلها المستخدم،
وباقي السور تُولَّد بأزمنة تقديرية لإكمال التجربة.

ملاحظة: الجدول surah_list يُبنى بروابط من cdn.islamic.network
(بدّلها بروابطك عند الحاجة).
"""
import json
import os
import re
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_FILE = os.path.join(ROOT, 'assets', 'Madina05-Hafs-16px.json')
OUT = os.path.join(ROOT, 'samples', 'timings-segments.db')
AR = re.compile(r'[\u0621-\u064A\u0671-\u06D3]')

# ---- البيانات الحقيقية (كما أرسلها المستخدم) ----
REAL = """
1	1	4	20	4750	[[1,150,640],[2,640,1380],[3,1380,2600],[4,2600,4750]]
1	2	4	5003	9703	[[1,5033,5853],[2,5853,6753],[3,6753,7353],[4,7353,9703]]
1	3	3	10183	13843	[[1,10183,11563],[2,11563,13843]]
1	4	4	14003	18313	[[1,14103,14953],[2,14953,15653],[3,15653,18313]]
1	5	6	18370	24560	[[1,18370,19370],[2,19370,20140],[3,20140,21380],[4,21380,24560]]
1	6	4	24657	29307	[[1,24657,25477],[2,25477,26517],[3,26517,29307]]
1	7	15	29837	45007	[[1,29867,30717],[2,30717,31687],[3,31687,32717],[4,32717,33847],[5,34467,35047],[6,35047,36287],[7,36287,37427],[8,37427,37837],[9,37837,45007]]
2	1	7	0	7369	[[1,0,7369]]
2	2	8	7569	16316	[[1,8080,8750],[2,8800,9390],[3,9440,9870],[4,9920,10550],[5,10600,12710],[6,12760,13310],[7,13360,16316]]
2	3	11	16516	27743	[[1,17280,17790],[2,17840,18870],[3,18920,19830],[4,19880,21150],[5,21200,22150],[6,22200,23350],[7,23400,24870],[8,24920,27743]]
2	4	15	27943	43565	[[1,28360,29310],[2,29360,30390],[3,30440,32270],[4,32320,33510],[5,33560,34070],[6,34120,36030],[7,36080,37190],[8,37240,38030],[9,38080,38870],[10,38920,40350],[11,40400,40720],[12,40720,43565]]
2	5	11	43765	55225	[[1,44200,46510],[2,46560,47070],[3,47120,48110],[4,48160,48550],[5,48600,49510],[6,49560,52030],[7,52080,52510],[8,52560,55225]]
2	6	12	55425	67657	[[1,56440,56950],[2,57000,57550],[3,57600,58310],[4,58360,60430],[5,60480,61270],[6,61320,63110],[7,63160,63400],[8,63440,63910],[9,63960,65310],[10,65360,65870],[11,65920,67657]]
2	7	12	67857	80838	[[1,68200,68910],[2,68960,69310],[3,69360,70030],[4,70080,71150],[5,71200,71870],[6,71920,73270],[7,73320,74910],[8,74960,76190],[9,76240,77630],[10,77680,78350],[11,78400,79230],[12,79280,80838]]
2	8	11	81038	92900	[[1,81480,82470],[2,82520,83230],[3,83280,83990],[4,84040,84950],[5,85000,86310],[6,86360,87310],[7,87360,88510],[8,88560,89270],[9,89320,89910],[10,89960,90830],[11,90880,92900]]
2	9	12	93100	105504	[[1,93520,94990],[2,95040,95510],[3,95560,96630],[4,96680,97510],[5,97560,98070],[6,98120,99310],[7,99360,101310],[8,101360,102830],[9,102880,103470],[10,103520,105504]]
2	10	13	105704	119067	[[1,106000,106390],[2,106440,107990],[3,108040,109270],[4,109320,110630],[5,110680,111270],[6,111320,112590],[7,112640,113310],[8,113360,114230],[9,114280,115510],[10,115560,116110],[11,116160,116870],[12,116920,119067]]
3	1	6	0	6320	[[1,0,6320]]
3	2	8	6520	15372	[[2,6560,6830],[1,6880,7430],[2,7480,9470],[3,9520,10350],[4,10400,11110],[5,11160,11630],[6,11680,12470],[7,12520,15372]]
"""


def words_of(text):
    return [t for t in text.split() if t and AR.search(t)]


def main():
    data = json.load(open(DB_FILE, encoding='utf-8'))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    con = sqlite3.connect(OUT)
    cur = con.cursor()
    cur.execute("""CREATE TABLE segments(
        surah_number INTEGER, ayah_number INTEGER, duration_sec INTEGER,
        timestamp_from INTEGER, timestamp_to INTEGER, segments TEXT)""")
    cur.execute("CREATE INDEX idx_seg ON segments(surah_number, ayah_number)")
    cur.execute("""CREATE TABLE surah_list(id INTEGER PRIMARY KEY, sura_no INTEGER,
        name TEXT, url TEXT, reciter TEXT)""")

    real = {}
    for line in REAL.strip().split('\n'):
        parts = line.split('\t')
        if len(parts) < 6:
            continue
        s, a = int(parts[0]), int(parts[1])
        real[(s, a)] = (int(parts[2]), int(parts[3]), int(parts[4]), parts[5].strip())
    print('صفوف حقيقية:', len(real))

    for si, sura in enumerate(data['suras'], start=1):
        cur.execute("INSERT INTO surah_list VALUES (?,?,?,?,?)",
                    (si, si, sura['name'],
                     'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/%d.mp3' % si,
                     'ar.alafasy'))
        t = 0
        for ai, aya in enumerate(sura['ayas']):
            an = ai - 1
            if an < 1 or (si == 1 and an == 0):
                continue
            if (si, an) in real:
                dsec, tf, tt, segs = real[(si, an)]
                cur.execute("INSERT INTO segments VALUES (?,?,?,?,?,?)", (si, an, dsec, tf, tt, segs))
                t = tt + 200
                continue
            # تقديري لباقي السور
            ws = words_of(' '.join(p['t'] for p in aya['r']))
            t += 900
            start = t
            segs = []
            for i, w in enumerate(ws, start=1):
                dur = int(260 + 58 * len(w))
                segs.append([i, int(t), int(t + dur)])
                t += dur + 45
            t += 260
            dur_sec = int(round((t - start) / 1000))
            cur.execute("INSERT INTO segments VALUES (?,?,?,?,?,?)",
                        (si, an, dur_sec, int(start), int(t), json.dumps(segs, separators=(',', ':'))))
    con.commit()
    n = cur.execute('SELECT COUNT(*) FROM segments').fetchone()[0]
    con.close()
    print('كُتب:', OUT, '| صفوف:', n)


if __name__ == '__main__':
    main()
