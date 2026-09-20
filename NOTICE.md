# الإشعارات — مصادر البيانات والخطوط وحقوقها

الكود (HTML/CSS/JS في `src/` وأدوات `tools/` و`build_standalone.py`) مرخَّص بـ MIT (انظر `LICENSE`).
**أمّا الملفات في `assets/` فليست من تأليفنا**، وهي ملك أصحابها المذكورين أدناه؛ هذا المستودع
ينسخها لأغراض العرض والتشغيل فقط. راجع تراخيصها الأصلية قبل أي إعادة نشر تجارية أو تعديل
في نصّ المصحف ورسمه.

| الملف | المصدر | الترخيص (يُتحقَّق) |
|---|---|---|
| `Madina05-*.json` (٤ ملفات) | رسم مصحف المدينة ١٦ بكسل/خانة كما تنشره مكتبة [quran-madina-html](https://github.com/tarekeldeeb/quran-madina-html) عن مجمع الملك فهد لطباعة المصحف الشريف | ISC / حقوق مجمع الملك فهد للنصّ والرسم |
| `layout-1439.json` | مولَّده بـ `tools/make_layout_1439.py` من مواضع كلمات طبعة ١٤٣٩هـ المنشورة في [mutqin-resources](https://github.com/abdoadel123/mutqin-resources) (أصول المجمع عبر Quran.com) | انظر المستودع الأصلي |
| `Hafs.woff2` | خط مجمع الملك فهد (KFGQPC Uthmanic Hafs) | OFL 1.1 (يُتحقَّق) |
| `UthmanTN_v2-0.woff2` | KFGQPC Uthmanic Script TN | OFL 1.1 (يُتحقَّق) |
| `AmiriQuran.woff2`, `AmiriQuranColored.woff2` | خط أميري القرآن (Khaled Hosny) | SIL OFL 1.1 |
| `tajweed.json` | rules/تلوين من واجهة quran.com (`uthmani_tajweed`) عبر `tools/make_tajweed.py` | بيانات Quran.com — راجع شروطهم |
| `warsh.json` | كلمات رواية ورش من `words_warsh.json` (تصدير خارجي) + رسم مصحفنا، بـ `tools/make_warsh.py` | بيانات مصدر خارجي — تحقَّق قبل النشر |
| `ayah-markers.json` | زخارف أرقام الآيات من [quranpedia/ayah-markers](https://github.com/quranpedia/ayah-markers) | راجع المستودع |
| `sura_border_sym4.svg` | زخرفة رأس السورة من مجموعة مصحف المدينة | راجع المصدر |
| `sql-wasm.js`, `sql-wasm.wasm` | [sql.js](https://github.com/sql-js/sql.js) | MIT |
| `samples/timings-sample.db` | مولَّدة محلياً بـ `tools/make_sample_db.py`، وأزمنتها **تقديرية** وليست تلاوة حقيقية | بلا حقوق خارجية |
| روابط التلاوة في `samples/*.db` | `cdn.islamic.network` (تنزيل Quran.com) | **لا ملفات صوتية في المستودع** — الروابط تُنزَّل وقت التشغيل |

**غير موجود في المستودع قصداً:** أي ملف `timings.db` عائد للمستخدم، وأي ملف صوتي `.mp3`،
ونسخة «الملف الواحد» الناتجة عن `build_standalone.py`، ومجلد `screenshots/` التجريبي.
