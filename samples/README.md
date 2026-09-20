# عيّنات قواعد التوقيت

| الملف | في Git؟ | ماذا يكون |
|---|---|---|
| `timings-sample.db` | ✓ | قاعدة تُولَّد محلياً بـ `python3 tools/make_sample_db.py`. أزمنتها **تقديرية** (لا تلاوة حقيقية) — للغرض: تجربة المزامنة والتلوين وشكل لوحة «مطابقة الأعمدة». |
| `timings-segments.db` · `timings-warsh-segments.db` | ✗ (في `.gitignore`) | بنيتان من تصدير تطبيق خارجي (ترقيم حفص / ترقيم ورش) لتجربة قراءة عمود `segments` المضغوط والتعامل مع اختلاف ترقيم الآيات بين الروايتين. أعد توليدهما من ملف توقيت تملكه: |

```bash
python3 tools/make_db_from_json.py /path/to/segments.json samples/my-timings.db \
        --reciter 'اسم القارئ'
```

المخطط المطلوب (نفس مخطط الملف الشائع `timings.db`):

```sql
CREATE TABLE segments(
  surah_number INTEGER, ayah_number INTEGER, duration_sec INTEGER,
  timestamp_from INTEGER, timestamp_to INTEGER, segments TEXT);
CREATE TABLE surah_list(id INTEGER PRIMARY KEY, sura_no INTEGER,
  name TEXT, url TEXT, reciter TEXT);
```

* الأزمنة **بالميلي ثانية** ونسبية إلى بداية كل سورة.
* `segments` = `[[رقم الكلمة، من، إلى], …]` بأرقام كلمات **١‑based** — وتُقبل أيضاً
  الصيغ المخفَّفة (نص BLOB، أقباس مفردة، `w:من:إلى`، أزواج بلا أرقام كلمات).
* البسملة صفة مستقلة بـ `ayah_number = 0` (عدا الفاتحة والتوبة).
