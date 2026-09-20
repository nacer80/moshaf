#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
يحزم التطبيق في ملف HTML واحد يعمل بفتحه مباشرة (file://) بدون إنترنت.

  python3 build_standalone.py                     # كل الخطوط
  python3 build_standalone.py --fonts Hafs,Uthman # خطوط محددة
  python3 build_standalone.py --out اسم-الملف.html

المُخرَج: quran-mushaf-standalone.html
"""
import argparse
import base64
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(ROOT, *p)

DB_FILES = {
    'Hafs':                'Madina05-Hafs-16px.json',
    'Uthman':              'Madina05-Uthman-16px.json',
    'Amiri Quran':         'Madina05-Amiri_Quran-16px.json',
    'Amiri Quran Colored': 'Madina05-Amiri_Quran_Colored-16px.json',
}
FONTS = {
    'Hafs woff2':               ('Hafs', 'Hafs.woff2'),
    'Uthman woff2':             ('Uthman', 'UthmanTN_v2-0.woff2'),
    'Amiri Quran woff2':        ('Amiri Quran', 'AmiriQuran.woff2'),
    'Amiri Quran Colored woff2':('Amiri Quran Colored', 'AmiriQuranColored.woff2'),
}


def b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fonts', default='Hafs,Uthman,Amiri Quran,Amiri Quran Colored')
    ap.add_argument('--out', default=A('quran-mushaf-standalone.html'))
    args = ap.parse_args()
    fonts = [f.strip() for f in args.fonts.split(',') if f.strip()]

    html = read(A('index.html'))

    # 1) الخطوط كـ data URI داخل <style>
    css = read(A('assets', 'fonts.css'))
    for fam, fn in FONTS.values():
        p = A('assets', fn)
        if os.path.exists(p):
            css = css.replace("url('%s')" % fn,
                              "url(data:font/woff2;base64,%s)" % b64(p))
    style = '<style>\n' + read(A('src', 'app.css')) + '\n' + css + '\n</style>'
    html = html.replace('<link rel="stylesheet" href="assets/fonts.css">\n', '')
    html = html.replace('<link rel="stylesheet" href="src/app.css">', style)

    # 2) الأصول المضمّنة (قبل السكربتات)
    parts = ['<script>window.Assets = window.Assets || {};</script>']

    dbs = {}
    for f in fonts:
        fn = DB_FILES.get(f)
        if not fn:
            print('تحذير: خط غير معروف', f, file=sys.stderr)
            continue
        p = A('assets', fn)
        if not os.path.exists(p):
            print('تحذير: قاعدة الرسم غير موجودة', p, file=sys.stderr)
            continue
        dbs[f] = json.loads(read(p))
        print('  + رسم', f, os.path.getsize(p) // 1024, 'ك.ب')
    parts.append('<script>window.Assets.inlineDB = window.Assets.inlineDB || {}; '
                 'Object.assign(window.Assets.inlineDB, %s);</script>'
                 % json.dumps(dbs, ensure_ascii=False, separators=(',', ':')))

    svg = A('assets', 'sura_border_sym4.svg')
    if os.path.exists(svg):
        url = 'url("data:image/svg+xml;charset=utf-8,%s")' % (
            read(svg).replace('\r', '').replace('\n', ' ').replace('"', '&quot;'))
        parts.append('<script>window.Assets.suraFrame = %s;</script>' % json.dumps(url))
        lay = os.path.join(ROOT, 'assets', 'layout-1439.json')
        if os.path.exists(lay):
            with open(lay, encoding='utf-8') as lf:
                layout = json.load(lf)
            parts.append('<script>window.Assets.inlineLayout = %s;</script>'
                         % json.dumps(layout, ensure_ascii=False, separators=(',', ':')))
            print('  + توزيع طبعة ١٤٣٩ %.0f ك.ب' % (os.path.getsize(lay) / 1024))

        tj = os.path.join(ROOT, 'assets', 'tajweed.json')
        if os.path.exists(tj):
            with open(tj, encoding='utf-8') as tf:
                taj = json.load(tf)
            parts.append('<script>window.Assets.inlineTajweed = %s;</script>'
                         % json.dumps(taj, ensure_ascii=False, separators=(',', ':')))
            print('  + تلوين التجويد %.0f ك.ب' % (os.path.getsize(tj) / 1024))

        wr = os.path.join(ROOT, 'assets', 'warsh.json')
        if os.path.exists(wr):
            with open(wr, encoding='utf-8') as wf:
                warsh = json.load(wf)
            parts.append('<script>window.Assets.inlineWarsh = %s;</script>'
                         % json.dumps(warsh, ensure_ascii=False, separators=(',', ':')))
            print('  + نصّ رواية ورش %.0f ك.ب' % (os.path.getsize(wr) / 1024))

        mk = os.path.join(ROOT, 'assets', 'ayah-markers.json')
        if os.path.exists(mk):
            with open(mk, encoding='utf-8') as mf:
                markers = json.load(mf)
            parts.append('<script>window.Assets.inlineMarkers = %s;</script>'
                         % json.dumps(markers, ensure_ascii=False, separators=(',', ':')))
            print('  + زخارف أرقام الآيات %.0f ك.ب' % (os.path.getsize(mk) / 1024))

    wasm = A('assets', 'sql-wasm.wasm')
    if os.path.exists(wasm):
        parts.append('<script>window.Assets.sqlWasmB64 = "%s";</script>' % b64(wasm))
        print('  + محرّك SQLite المضمّن')

    html = html.replace('<script src="assets/sql-wasm.js"></script>',
                        '<script>\n' + read(A('assets', 'sql-wasm.js')) + '\n</script>\n' +
                        '\n'.join(parts))

    # 3) سكربتات التطبيق
    for src in ['mushaf.js', 'timingdb.js', 'player.js', 'app.js']:
        tag = '<script src="src/%s"></script>' % src
        html = html.replace(tag, '<script>\n' + read(A('src', src)) + '\n</script>')

    # 4) سلامة: أي مسار خارجي متبقٍ؟
    left = re.findall(r'(?:src|href)="(?!data:|#)([^"]+)"', html)
    left = [u for u in left if not u.startswith('data:')]
    if left:
        print('تحذير: مسارات غير مضمّنة:', left, file=sys.stderr)

    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('تم إنشاء:', args.out, round(os.path.getsize(args.out) / 1048576, 2), 'ميغابايت')


if __name__ == '__main__':
    main()
