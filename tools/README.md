# أدوات البناء (Python 3، بلا مكتبات خارجية)

كل سكربت يكتب ناتجه في `assets/` أو `samples/` داخل المستودع، فينبغي تشغيله عند تغيير
البيانات ثم يُرفَع **الناتج** (لا المدخلات الكبيرة).

| السكربت | المخرَج | ما يحتاجه من مدخلات |
|---|---|---|
| `make_sample_db.py` | `samples/timings-sample.db` | `assets/Madina05-Hafs-16px.json` |
| `make_db_from_json.py` | أي `*.db` تحدده | ملف JSON لآية لكل سطر؛ الاستعمال: `python3 tools/make_db_from_json.py segments.json out.db --reciter '…'` |
| `make_db_from_segments.py` | قاعدة بثلاثة سور حقيقية + الباقي تقديري | نفس الصيغة أعلاه |
| `make_warsh.py` | `assets/warsh.json` | `assets/Madina05-Hafs-16px.json` + ملف كلمات ورش `words_warsh.json` (لا يُرفَع في Git؛ مرِّره وسيغة: `python3 tools/make_warsh.py /path/words_warsh.json`) |
| `make_tajweed.py` | `assets/tajweed.json` | تنزيل من `api.quran.com` يُخزَّن في `--cache` (يُستخدم مرة واحدة) |
| `make_layout_1439.py` | `assets/layout-1439.json` | مواضع كلمات طبعة ١٤٣٩هـ (mutqin-resources) في `--cache` |
| `sura_names.py` | — | جدول أسماء السور المستعمل في السكربتات |

فوق هذه الأدوات:

```bash
python3 build_standalone.py          # → quran-mushaf-standalone.html (لا يُرفَع؛ انشره في Releases)
```
