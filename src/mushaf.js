/* ============================================================
   mushaf.js — رسم صفحات مصحف المدينة (نصّ حقيقي، بلا صور)
   مبني على قاعدة بيانات مكتبة quran-madina-html:
   لكل سورة: آيات، ولكل آية أجزاء سطور {l: رقم السطر, t: النص, s: معامل المطّ}
   ============================================================ */
(function (global) {
  'use strict';

  /* كلمة = أي رمز يحوي حرفاً عربياً. علامات الآيات ﴿١﴾ وعلامات الوقف لا تُحسب. */
  var AR = /[\u0621-\u064A\u0671-\u06D3]/;
  var BASMALA_LIG = '\uFDFD';
  var DAGGER = '\u0670';   /* الألف الخنجرية: نص quran.com يفصلها ككلمة مستقلة */

  /* يقسّم الرمز إلى كلمات حسب نمط العدّ (split: فصل الألف الخنجرية) */
  function splitToken(tok, split) {
    if (!split || tok.indexOf(DAGGER) < 0) return [tok];
    var out = [], buf = '';
    for (var i = 0; i < tok.length; i++) {
      if (tok[i] === DAGGER && buf) { out.push(buf); buf = DAGGER; }
      else buf += tok[i];
    }
    if (buf) out.push(buf);
    return out;
  }

  /* أسماء السور بالتشكيل كما في رؤوس صفحات مصحف المدينة (١١٤ اسماً) */
  var SURA_NAMES = [
    "سُورَةُ ٱلْفَاتِحَةِ",
    "سُورَةُ ٱلْبَقَرَةِ",
    "سُورَةُ ءَالِ عِمْرَانَ",
    "سُورَةُ ٱلنِّسَاءِ",
    "سُورَةُ ٱلْمَائِدَةِ",
    "سُورَةُ ٱلْأَنْعَامِ",
    "سُورَةُ ٱلْأَعْرَافِ",
    "سُورَةُ ٱلْأَنْفَالِ",
    "سُورَةُ ٱلتَّوْبَةِ",
    "سُورَةُ يُونُسَ",
    "سُورَةُ هُودٍ",
    "سُورَةُ يُوسُفَ",
    "سُورَةُ ٱلرَّعْدِ",
    "سُورَةُ إِبْرَاهِيمَ",
    "سُورَةُ ٱلْحِجْرِ",
    "سُورَةُ ٱلنَّحْلِ",
    "سُورَةُ ٱلْإِسْرَاءِ",
    "سُورَةُ ٱلْكَهْفِ",
    "سُورَةُ مَرْيَمَ",
    "سُورَةُ طه",
    "سُورَةُ ٱلْأَنْبِيَاءِ",
    "سُورَةُ ٱلْحَجِّ",
    "سُورَةُ ٱلْمُؤْمِنُونَ",
    "سُورَةُ ٱلنُّورِ",
    "سُورَةُ ٱلْفُرْقَانِ",
    "سُورَةُ ٱلشُّعَرَاءِ",
    "سُورَةُ ٱلنَّمْلِ",
    "سُورَةُ ٱلْقَصَصِ",
    "سُورَةُ ٱلْعَنْكَبُوتِ",
    "سُورَةُ ٱلرُّومِ",
    "سُورَةُ لُقْمَانَ",
    "سُورَةُ ٱلسَّجْدَةِ",
    "سُورَةُ ٱلْأَحْزَابِ",
    "سُورَةُ سَبَإٍ",
    "سُورَةُ فَاطِرٍ",
    "سُورَةُ يس",
    "سُورَةُ ٱلصَّافَّاتِ",
    "سُورَةُ ص",
    "سُورَةُ ٱلزُّمَرِ",
    "سُورَةُ غَافِرٍ",
    "سُورَةُ فُصِّلَتْ",
    "سُورَةُ ٱلشُّورَىٰ",
    "سُورَةُ ٱلزُّخْرُفِ",
    "سُورَةُ ٱلدُّخَانِ",
    "سُورَةُ ٱلْجَاثِيَةِ",
    "سُورَةُ ٱلْأَحْقَافِ",
    "سُورَةُ مُحَمَّدٍ",
    "سُورَةُ ٱلْفَتْحِ",
    "سُورَةُ ٱلْحُجُرَاتِ",
    "سُورَةُ ق",
    "سُورَةُ ٱلذَّارِيَاتِ",
    "سُورَةُ ٱلطُّورِ",
    "سُورَةُ ٱلنَّجْمِ",
    "سُورَةُ ٱلْقَمَرِ",
    "سُورَةُ ٱلرَّحْمَٰنِ",
    "سُورَةُ ٱلْوَاقِعَةِ",
    "سُورَةُ ٱلْحَدِيدِ",
    "سُورَةُ ٱلْمُجَادِلَةِ",
    "سُورَةُ ٱلْحَشْرِ",
    "سُورَةُ ٱلْمُمْتَحِنَةِ",
    "سُورَةُ ٱلصَّفِّ",
    "سُورَةُ ٱلْجُمُعَةِ",
    "سُورَةُ ٱلْمُنَافِقُونَ",
    "سُورَةُ ٱلتَّغَابُنِ",
    "سُورَةُ ٱلطَّلَاقِ",
    "سُورَةُ ٱلتَّحْرِيمِ",
    "سُورَةُ ٱلْمُلْكِ",
    "سُورَةُ ٱلْقَلَمِ",
    "سُورَةُ ٱلْحَاقَّةِ",
    "سُورَةُ ٱلْمَعَارِجِ",
    "سُورَةُ نُوحٍ",
    "سُورَةُ ٱلْجِنِّ",
    "سُورَةُ ٱلْمُزَّمِّلِ",
    "سُورَةُ ٱلْمُدَّثِّرِ",
    "سُورَةُ ٱلْقِيَامَةِ",
    "سُورَةُ ٱلْإِنسَانِ",
    "سُورَةُ ٱلْمُرْسَلَاتِ",
    "سُورَةُ ٱلنَّبَإِ",
    "سُورَةُ ٱلنَّازِعَاتِ",
    "سُورَةُ عَبَسَ",
    "سُورَةُ ٱلتَّكْوِيرِ",
    "سُورَةُ ٱلِانفِطَارِ",
    "سُورَةُ ٱلْمُطَفِّفِينَ",
    "سُورَةُ ٱلِانشِقَاقِ",
    "سُورَةُ ٱلْبُرُوجِ",
    "سُورَةُ ٱلطَّارِقِ",
    "سُورَةُ ٱلْأَعْلَىٰ",
    "سُورَةُ ٱلْغَاشِيَةِ",
    "سُورَةُ ٱلْفَجْرِ",
    "سُورَةُ ٱلْبَلَدِ",
    "سُورَةُ ٱلشَّمْسِ",
    "سُورَةُ ٱللَّيْلِ",
    "سُورَةُ ٱلضُّحَىٰ",
    "سُورَةُ ٱلشَّرْحِ",
    "سُورَةُ ٱلتِّينِ",
    "سُورَةُ ٱلْعَلَقِ",
    "سُورَةُ ٱلْقَدْرِ",
    "سُورَةُ ٱلْبَيِّنَةِ",
    "سُورَةُ ٱلزَّلْزَلَةِ",
    "سُورَةُ ٱلْعَادِيَاتِ",
    "سُورَةُ ٱلْقَارِعَةِ",
    "سُورَةُ ٱلتَّكَاثُرِ",
    "سُورَةُ ٱلْعَصْرِ",
    "سُورَةُ ٱلْهُمَزَةِ",
    "سُورَةُ ٱلْفِيلِ",
    "سُورَةُ قُرَيْشٍ",
    "سُورَةُ ٱلْمَاعُونِ",
    "سُورَةُ ٱلْكَوْثَرِ",
    "سُورَةُ ٱلْكَافِرُونَ",
    "سُورَةُ ٱلنَّصْرِ",
    "سُورَةُ ٱلْمَسَدِ",
    "سُورَةُ ٱلْإِخْلَاصِ",
    "سُورَةُ ٱلْفَلَقِ",
    "سُورَةُ ٱلنَّاسِ"
  ];

  var DB_FILES = {
    'Hafs':                 'Madina05-Hafs-16px.json',
    'Uthman':               'Madina05-Uthman-16px.json',
    'Amiri Quran':          'Madina05-Amiri_Quran-16px.json',
    'Amiri Quran Colored':  'Madina05-Amiri_Quran_Colored-16px.json'
  };

  /* أول صفحة لكل جزء في مصحف المدينة (604 صفحة) */
  var JUZ_PAGES = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262,
                   282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502,
                   522, 542, 562, 582];

  var AR_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function toArabicDigits(n) {
    return String(n).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; });
  }

  /* ---------- تحميل الأصول: من المتغيّرات المضمّنة (ملف واحد) أو عبر الشبكة ---------- */
  function assets() {
    return global.Assets || (global.Assets = {});
  }

  function loadDB(font) {
    var A = assets();
    if (A.inlineDB && A.inlineDB[font]) return Promise.resolve(A.inlineDB[font]);
    if (A.dbCache && A.dbCache[font]) return Promise.resolve(A.dbCache[font]);
    var file = DB_FILES[font] || DB_FILES['Hafs'];
    return fetch('assets/' + file).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      (A.dbCache = A.dbCache || {})[font] = j;
      return j;
    });
  }

  function loadSuraFrame() {
    var A = assets();
    if (A.suraFrame) return Promise.resolve(A.suraFrame);
    return fetch('assets/sura_border_sym4.svg')
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; })
      .then(function (txt) {
        if (!txt) return '';
        var url = 'url("data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(txt.replace(/\r?\n/g, ' ')) + '")';
        return (A.suraFrame = url);
      });
  }

  /* زخارف أرقام الآيات (github.com/quranpedia/ayah-markers) — اختياري */
  function loadAyahMarkers() {
    var A = assets();
    if (A.inlineMarkers) return Promise.resolve(A.inlineMarkers);
    if (A.markerCache) return Promise.resolve(A.markerCache);
    return fetch('assets/ayah-markers.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return (A.markerCache = j); });
  }

  /* يبني عنصر الزخرفة (إن كانت مفعّلة) */
  function markerOrnament(self, a) {
    var set = self.markerSet;
    if (!set || !set.current) return null;
    var m = set.current;
    var span = document.createElement('span');
    span.className = 'aym';
    span.innerHTML = m.svg;
    var i = document.createElement('i');
    i.textContent = toArabicDigits(a);
    var vb = m.vb || [0, 0, 1000, 1000], n = m.n || {};
    var lx = ((n.cx - vb[0]) / vb[2] * 100), ty = ((n.cy - vb[1]) / vb[3] * 100);
    i.style.left = lx.toFixed(2) + '%';
    i.style.top = ty.toFixed(2) + '%';
    /* حجم الرقم = ارتفاع صندوق الرقم في وحدات الزخرفة ÷ نسبة ارتفاع الأرقام في الخط */
    i.style.fontSize = ((n.h || 300) / vb[3] * 2.0).toFixed(3) + 'em';
    span.appendChild(i);
    return span;
  }

  /* يزخرف علامة الآية داخل عنصرها (إن أمكن) */
  function decorateMarker(self, span, s, a, text) {
    if (text.indexOf('\uFD3F') < 0) return false;       /* ليست علامة آية */
    var n = (self.riwaya === 'warsh') ? warshAyah(self, s, a) : a;
    if (n === 0) { span.textContent = ''; return true; } /* آية ورش مستمرة: بلا زخرفة */
    if (!self.markerSet || !self.markerSet.current) return false;
    var orn = markerOrnament(self, n);
    if (!orn) return false;
    span.textContent = '';
    span.classList.add('orn');
    span.appendChild(orn);
    return true;
  }

  /* رقم الكلمة داخل الآية (يُشتقّ من المفتاح s:a:w) */
  function wIdx(inf, idx, keys) {
    var p = String(keys[idx] || '').split(':');
    return (p.length >= 3) ? (parseInt(p[2], 10) || 1) : 1;
  }

  /* ==================== رواية ورش عن نافع ==================== */
  function loadWarsh() {
    var A = assets();
    if (A.inlineWarsh) return Promise.resolve(A.inlineWarsh);
    if (A.warshCache) return Promise.resolve(A.warshCache);
    return fetch('assets/warsh.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return (A.warshCache = j); });
  }

  /* كلمة ورش المقابلة لمفتاح (سورة:آية:كلمة) — نفس عدد الكلمات في الروايتين (٩٩٫٩٪ من الآيات) */
  function warshWord(self, s, a, w) {
    var W = self.warsh;
    if (!W) return null;
    var d = W[String(s)];
    if (!d) return null;
    var txt = d[String(a)];
    if (txt == null && a === 0) txt = d['0'];
    if (txt == null) return null;
    var parts = self._wcache && self._wcache[txt];
    if (!parts) {
      parts = txt.split(' ');
      if (!self._wcache) self._wcache = {};
      self._wcache[txt] = parts;
    }
    if (w >= 1 && w <= parts.length) {
      var t = parts[w - 1];
      return (t === '\u0001') ? null : t;      /* لا مقابل عند ورش */
    }
    return null;
  }

  /* رقم الآية بحسب رواية ورش (العدّ المدني يختلف عن الكوفي في ٥٢ سورة) — ٠ = لا زخرفة هنا */
  function warshAyah(self, s, a) {
    var M = self.warshAmap;
    if (!M) return a;
    var d = M[String(s)];
    if (!d) return a;
    var v = d[String(a)];
    return (v == null) ? 0 : (+v);      /* بلا مقابل (كالبسملة) = بلا زخرفة */
  }
  /* هل تنتهي آية ورش داخل هذه الكلمة؟ (زخرفة إضافية في وسط آية حفص) */
  function warshSplitNo(self, s, a, w) {
    if (!self.warshSplit) return 0;
    var d = self.warshSplit[String(s)];
    if (!d) return 0;
    var v = d[String(a)];
    if (!v) return 0;
    var parts = v.split(',');
    for (var i = 0; i < parts.length; i++) {
      var pr = parts[i].split(':');
      if (+pr[0] === w) return +pr[1];
    }
    return 0;
  }
  /* زخرفة داخلية: تُنشأ بعد الكلمة التي تنتهي عندها آية ورش */
  function addWarshMark(self, parent, s, a, w, key) {
    if (self.riwaya !== 'warsh') return null;
    var n = warshSplitNo(self, s, a, w);
    if (!n) return null;
    var mk = document.createElement('span');
    mk.className = 'w mk seekable orn';
    mk.dataset.k = key;
    mk.dataset.a = s + ':' + a;
    var orn = markerOrnament(self, n);
    if (orn) mk.appendChild(orn);
    else mk.textContent = '\uFD3F' + toArabicDigits(n) + '\uFD3E';
    parent.appendChild(document.createTextNode(' '));
    parent.appendChild(mk);
    return mk;
  }
  Mushaf.prototype.ayahNo = function (s, a) {
    if (this.riwaya !== 'warsh') return a;
    var n = warshAyah(this, s, a);
    return n > 0 ? n : a;               /* ٠ (بلا زخرفة) لا يصلح رقماً معروضاً */
  };

  var WAQF = '\u06D6';                       /* علامة الوقف في رواية ورش */
  var BSM_SHADDA = { 95: 1, 97: 1 };      /* حفص: البسملة في التين والقدر بشدّة فوق الباء */

  /* قياس مرة واحدة: هل يضع الخط العلامة فوق الحرف بلا عرض إضافي؟ */
  function waqfIsZero(self) {
    if (self._waqfZero !== undefined) return self._waqfZero;
    var out = false;
    try {
      var ml = document.querySelector('.mline');
      var ff = ml ? getComputedStyle(ml).fontFamily : ('"' + (self.font || 'Hafs') + '"');
      var el = document.createElement('span');
      el.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;font-size:40px;line-height:2;font-family:' + ff;
      document.body.appendChild(el);
      el.textContent = 'مُسْلِمُونَ';
      var w0 = el.getBoundingClientRect().width;
      el.textContent = 'مُسْلِمُونَ' + WAQF;
      var w1 = el.getBoundingClientRect().width;
      el.remove();
      out = Math.abs(w1 - w0) < 1.0;
    } catch (e) { out = false; }
    self._waqfZero = out;
    return out;
  }

  /* يضع نصّ الكلمة مع المحافظة على علامة الوقف:
     إن كان الخط يضعها فوق الحرف (عرض صفر) تُترك كما هي، وإلا تُرسم «ص» صغيرة فوق السطر */
  function setWaqf(self, span, txt) {
    if (waqfIsZero(self)) return;                 /* الخط يتكفّل بموضعها */
    var i = txt.indexOf(WAQF);
    if (i < 0) return;
    span.textContent = txt.slice(0, i);
    var m = document.createElement('i');
    m.className = 'waqf';
    m.textContent = WAQF;
    span.appendChild(m);
    var rest = txt.slice(i + 1);
    if (rest) span.appendChild(document.createTextNode(rest));
  }

  function wordText(self, s, a, w, fallback) {
    if (self.riwaya !== 'warsh') {
      /* حفص: «بِّسْمِ» بشدّة فوق الباء في سورتي التين والقدر */
      if (a === 0 && w === 1 && BSM_SHADDA[s] && String(fallback).indexOf('\u0651') < 0) {
        var sh = String(fallback).replace('\u0628\u0650', '\u0628\u0651\u0650');
        if (sh !== fallback) return sh;
      }
      return fallback;
    }
    var t = warshWord(self, s, a, w);
    return (t == null || t === '') ? fallback : t;
  }

  /* ==================== تلوين التجويد (بيانات quran.com) ==================== */
  function loadTajweed() {
    var A = assets();
    if (A.inlineTajweed) return Promise.resolve(A.inlineTajweed);
    if (A.tajweedCache) return Promise.resolve(A.tajweedCache);
    return fetch('assets/tajweed.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return (A.tajweedCache = j); });
  }

  function decodeRules(s, len) {
    if (!s) return null;
    if (s.charAt(0) === '*') return s.slice(1);
    var out = [];
    for (var i = 0; i < len; i++) out.push('.');
    for (var j = 0; j + 1 < s.length; j += 2) {
      var p = parseInt(s.charAt(j), 36);
      if (p >= 0 && p < len) out[p] = s.charAt(j + 1);
    }
    return out.join('');
  }

  /* يلوّن حروف الكلمة بحسب القاعدة — الحروف المتجاورة بنفس القاعدة في عنصر واحد */
  function applyTajweed(self, span, key, text, off) {
    var T = self.tajweed;
    if (!T || !T.on || !text || text.indexOf('\uFD3F') >= 0) return;
    var code = T.words[key];
    if (!code) return;
    off = off || 0;
    var rules = decodeRules(code, text.length + off);
    if (!rules) return;
    span.textContent = '';
    var i = 0;
    while (i < text.length) {
      var r = rules.charAt(i + off), j = i;
      while (j < text.length && rules.charAt(j + off) === r) j++;
      var chunk = text.slice(i, j);
      if (!r || r === '.') {
        span.appendChild(document.createTextNode(chunk));
      } else {
        var s2 = document.createElement('span');
        s2.className = 'tj t-' + (T.code[r] || 'x');
        s2.textContent = chunk;
        span.appendChild(s2);
      }
      i = j;
    }
  }

  /* تنصيب ألوان القواعد (من الملف نفسه) */
  function installTajweedCSS(set) {
    if (document.getElementById('tj-css') || !set.rules) return;
    var css = [];
    set.rules.forEach(function (r) {
      css.push('.tj.t-' + r.id + '{color:' + r.c + '}');
      css.push('body.theme-dark .tj.t-' + r.id + '{color:' + r.cd + '}');
    });
    var st = document.createElement('style');
    st.id = 'tj-css';
    st.textContent = css.join('\n');
    document.head.appendChild(st);
  }

  /* مقياس عروض النص: عنصر مخفي يقيس بنفس خط الصفحة تماماً (الـ canvas قد يختار خطاً آخر) */
  var _measEl = null;
  function measureEl(fontStack, fs) {
    if (!_measEl) {
      _measEl = document.createElement('span');
      _measEl.setAttribute('aria-hidden', 'true');
      _measEl.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;' +
        'white-space:pre;pointer-events:none;direction:rtl';
      document.body.appendChild(_measEl);
    }
    _measEl.style.fontSize = fs + 'px';
    _measEl.style.fontFamily = fontStack || 'serif';
    _measEl.style.fontWeight = '400';
    _measEl.style.letterSpacing = '0';
    return _measEl;
  }

  /* إعادة تقطيع سطور الصفحة لخط رقمي: قياس فعلي للكلمات ثم ملء السطور بعددها المعهود.
     العنوان والبسملة سطرٌ خاصٌ كلٌّ منها، والترتيب محفوظ (قد يأتي العنوان في وسط الصفحة). */
  Mushaf.prototype.reflowList = function (page) {
    var src = this.pages[page] || [];
    if (!src.length) return src;
    var fs = this.fontSize || 16;
    var el = measureEl(this.fontStack, fs);
    var mw = function (t) { el.textContent = t; return el.getBoundingClientRect().width; };
    var sp = mw('ك كل') - mw('ك') - mw('كل');
    if (!(sp > 0.5)) sp = fs * 0.28;

    var items = [], maxLine = 0;
    src.forEach(function (part) {
      if (part.l > maxLine) maxLine = part.l;
      if (part.a === -1 || part.a === 0) {
        items.push({ t: part.t, s: part.s, a: part.a, l: 0, st: -1, wi: part.wi, sp: 1 });
        return;
      }
      String(part.t).split(/\s+/).forEach(function (t) {
        if (t) items.push({ t: t, s: part.s, a: part.a, l: 0, st: 1, wi: part.wi, sp: 0 });
      });
    });
    var nSpec = 0;
    items.forEach(function (x) { if (x.sp) nSpec++; });
    var words = items.filter(function (x) { return !x.sp; });
    if (!words.length) return src;

    words.forEach(function (x) { x.w = mw(x.t); });
    var widest = 0, total = 0;
    words.forEach(function (x) { if (x.w > widest) widest = x.w; total += x.w; });
    var nText = Math.max(1, maxLine - nSpec);

    var avail = this.lineWidth || 270;

    /* يوزّع الكلمات على السطور بهدف T، ويحسب عدد السطور وأكبر تجاوز */
    function distribute(T) {
      var ln = 1, cur = 0, over = 0;
      for (var i = 0; i < items.length; i++) {
        var x = items[i];
        if (x.sp) {                     /* عنوان أو بسملة: سطر خاص موسّط */
          if (cur > 0) { ln++; cur = 0; }
          x.l = ln++;
          continue;
        }
        var w = x.w + (cur ? sp : 0);
        if (cur && cur + w > T) { ln++; cur = x.w; }
        else cur += w;
        if (cur - avail > over) over = cur - avail;
        x.l = ln;
      }
      return { lines: ln, over: over };
    }

    var lo = widest, hi = Math.max(widest + 1, total);
    for (var it = 0; it < 44; it++) {
      var mid = (lo + hi) / 2;
      if (distribute(mid).lines > maxLine) lo = mid; else hi = mid;
    }
    var res = distribute(hi);
    /* أمان: وسّع الهدف ما دام ذلك يقلّل التجاوز ويبقي عدد السطور في حدّها */
    for (var g = 0; g < 40 && res.over > 0; g++) {
      var t2 = hi * 1.02, r2 = distribute(t2);
      if (r2.lines > maxLine || r2.over >= res.over) break;
      hi = t2; res = r2;
    }
    distribute(hi);
    /* إن ظلّ هناك تجاوز (خط عريض جداً) نصغّر قياس الخط للصفحة بما يكفي */
    this._fit = res.over > 0 ? Math.max(0.6, avail / (avail + res.over)) : 1;
    return items;
  };

  /* إعادة تقطيع سطور طبعة ١٤٣٩ للخط الرقمي (نفس الخوارزمية، على مستوى المفاتيح) */
  Mushaf.prototype.reflowLayoutLines = function (page) {
    var src = (this.layout && this.layout.pages) ? (this.layout.pages[page - 1] || []) : [];
    if (!src.length) return src;
    var fs = this.fontSize || 16;
    var el = measureEl(this.fontStack, fs);
    var mw = function (t) { el.textContent = t; return el.getBoundingClientRect().width; };
    var sp = mw('ك كل') - mw('ك') - mw('كل');
    if (!(sp > 0.5)) sp = fs * 0.28;
    var avail = this.lineWidth || 270;
    var items = [], maxLine = 0;
    src.forEach(function (keys, i) {
      if (!keys || !keys.length) return;
      maxLine = i + 1;
      var spec = keys.some(function (k) {
        var pr = String(k).split(':');
        return pr[1] === '-1' || pr[1] === '0';
      });
      if (spec) { items.push({ keys: keys, sp: 1 }); return; }
      keys.forEach(function (k) { items.push({ keys: [k], sp: 0 }); });
    });
    if (!items.length) return src;
    var km = this.keyMap || {};
    items.forEach(function (x) {
      var t = x.keys.map(function (k) {
        var inf = km[k];
        return inf ? (inf.t + ' ' + (inf.marks || []).join(' ')) : '';
      }).join(' ');
      x.w = mw(t);
    });
    var widest = 0, total = 0;
    items.forEach(function (x) { if (x.w > widest) widest = x.w; total += x.w; });
    function distribute(T) {
      var ln = 1, cur = 0, over = 0;
      items.forEach(function (x) {
        if (x.sp) { if (cur > 0) { ln++; cur = 0; } x.l = ln++; return; }
        var w = x.w + (cur ? sp : 0);
        if (cur && cur + w > T) { ln++; cur = x.w; } else cur += w;
        if (cur - avail > over) over = cur - avail;
        x.l = ln;
      });
      return { lines: ln, over: over };
    }
    var lo = widest, hi = Math.max(widest + 1, total);
    for (var it = 0; it < 44; it++) {
      var mid = (lo + hi) / 2;
      if (distribute(mid).lines > maxLine) lo = mid; else hi = mid;
    }
    var res = distribute(hi);
    for (var g = 0; g < 40 && res.over > 0; g++) {
      var t2 = hi * 1.02, r2 = distribute(t2);
      if (r2.lines > maxLine || r2.over >= res.over) break;
      hi = t2; res = r2;
    }
    distribute(hi);
    this._fit = res.over > 0 ? Math.max(0.6, avail / (avail + res.over)) : 1;
    var out = [];
    for (var i = 0; i < maxLine; i++) out.push([]);
    items.forEach(function (x) { (out[x.l - 1] = out[x.l - 1] || []).push.apply(out[x.l - 1], x.keys); });
    return out;
  };

  function self_keyMap(self, k) { return self.keyMap ? self.keyMap[k] : null; }

  /* أعد ضبط السطور بعد اكتمال تحميل الخطوط:
     (font-display:swap يعني أن النص يُرسم أولاً بخط بديل، فتكون قياساتنا الأولى خاطئة) */
  var _fontsHooked = false;
  function hookFonts(self) {
    if (!document.fonts || _fontsHooked) return;
    _fontsHooked = true;
    var re = function () { self.rejustify(); };
    try {
      document.fonts.ready.then(re);
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', re);
    } catch (e) { /* غير مدعوم */ }
  }

  /* إعادة ضبط كل السطور المرسومة حالياً (آمنة: الضبط عملية مطّابقة) */
  Mushaf.prototype.rejustify = function () {
    var pages = document.querySelectorAll('.mushaf-page');
    for (var i = 0; i < pages.length; i++) {
      var lines = pages[i].querySelectorAll('.mline');
      var ovals = pages[i].querySelectorAll('.mline[data-oval]');
      if (ovals.length) layoutOval(Array.prototype.slice.call(ovals), ovals[0].clientWidth || this.lineWidth || 270);
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (line.classList.contains('has-title')) continue;      /* سطر العنوان */
        if (line.dataset.oval) continue;                          /* سطر افتتاحي بيضاوي */
        if (line.dataset.st === '' || line.dataset.st === null) { /* سطر نص عادي */ }
        else if (parseFloat(line.dataset.st) < 0) continue;        /* سطر موسّط في الرسم */
        line.style.transform = '';
        justifyLine(line, line.clientWidth || this.lineWidth || 270);
      }
    }
  };

  /* ==================== جداول ترقيم الآيات بين الروايتين ====================
     ملفات التوقيت الخارجية (timings.db) مرقّمة على رواية القارئ: توقيت ورش
     يحمل أرقام آيات العدّ المدني، وهي تختلف عن أرقام العدّ الكوفي (حفص) في ٦٠ سورة.
     داخل البرنامج كل المفاتيح على أرقام حفص ('سورة:آية:كلمة')، فنحتاج تحويلين:
       wc   : عدد كلمات كل آية ورق      ← نكتشف به ترقيم الملف المُستورد
       tinv : «من-إلى:آية حفص:إزاحة»     ← نُعيد به كتابة مقاطع الملف على مفاتيحنا
     البسملة لا تحتاج تحويلاً: رقمها ٠ في الروايتين (و١ في الفاتحة).            */
  function warshTables(data) {
    if (!data || (!data.tinv && !data.wc)) return null;
    return { wc: data.wc || {}, tinv: data.tinv || {}, _c: {}, _p: {} };
  }
  /* عدد كلمات آية ورق رقمها a (٠ = لا نُعرفها) */
  function warshWc(T, s, a) {
    if (!T || a < 1) return 0;
    var arr = T._c[String(s)];
    if (!arr) { var str = T.wc[String(s)]; if (!str) return 0; arr = T._c[String(s)] = String(str).split(','); }
    var v = parseInt(arr[a - 1], 10);
    return isFinite(v) && v > 0 ? v : 0;
  }
  /* عدد آيات سورة ورش */
  function warshLast(T, s) {
    if (!T) return 0;
    var str = T.wc[String(s)];
    if (!str) return 0;
    var arr = T._c[String(s)];
    if (!arr) arr = T._c[String(s)] = String(str).split(',');
    return arr.length;
  }
  /* تحويل (آية ورق، كلمة) → [آية حفص، كلمة حفص]؛ null = بلا تحويل (مطابق) */
  function warshPieces(T, s, a) {
    if (!T || a < 1) return null;
    var d = T._p[String(s)];
    if (!d) {
      d = {};
      var src = T.tinv[String(s)] || {};
      for (var n in src) {
        d[n] = String(src[n]).split('|').map(function (pc) {
          var p = pc.split(':'), rg = String(p[0]).split('-');
          return [parseInt(rg[0], 10) || 1, parseInt(rg[1], 10) || parseInt(rg[0], 10) || 1,
                  parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0];
        });
      }
      T._p[String(s)] = d;
    }
    return d[String(a)] || null;
  }
  function warshMap(T, s, a, w) {
    var ps = warshPieces(T, s, a);
    if (!ps) return null;
    for (var i = 0; i < ps.length; i++) {
      if (w >= ps[i][0] && w <= ps[i][1]) return [ps[i][2], w + ps[i][3]];
    }
    return null;
  }

  /* تفعيل/إلغاء إعادة التقطيع (للخط الرقمي) */
  /* الرواية: 'hafs' (افتراضي) أو 'warsh' — ورش تستبدل نصّ الكلمة مع نفس التخطيط والتوقيت */
  Mushaf.prototype.resetWaqfProbe = function () { this._waqfZero = undefined; };
  Mushaf.prototype.setRiwaya = function (r, data) {
    this.riwaya = (r === 'warsh') ? 'warsh' : 'hafs';
    if (data) { this.warsh = (data.w || data); this.warshAmap = data.amap || null; this.warshSplit = data.split || null; this.warshT = warshTables(data) || this.warshT; }
    if (this.riwaya !== 'warsh') { this.warsh = null; this.warshAmap = null; }
    this._wcache = null;
    if (this.riwaya === 'warsh') this.tajweed = null;   /* قواعد التجويد محسوبة على نصّ حفص */
    return this.riwaya;
  };
  /* نحمّل جداول ورش للكشف عن ترقيم الملفات المُستوردة دون تبديل الرواية */
  Mushaf.prototype.attachWarshTables = function (data) {
    var T = warshTables(data);
    if (T) this.warshT = T;
    return !!T;
  };
  Mushaf.prototype.warshWordCount = function (s, a) { return warshWc(this.warshT, s, a); };
  Mushaf.prototype.warshAyahs = function (s) { return warshLast(this.warshT, s); };
  Mushaf.prototype.mapWarshTiming = function (s, a, w) { return warshMap(this.warshT, s, a, w); };
  /* كل مقاطع تحويل آية ورق رقمها a: [[من، إلى، آية حفص، إزاحة]…] أو null */
  Mushaf.prototype.warshTimingPieces = function (s, a) { return warshPieces(this.warshT, s, a); };

  Mushaf.prototype.setReflow = function (stack) {
    this.reflow = !!stack;
    this.fontStack = stack || '';
  };

  /* عدد الفراغات بين كلمات السطر (هي التي يتوزّع عليها الفرق) */
  function countGaps(line) {
    var n = 0;
    try {
      var tw = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null);
      while (tw.nextNode()) {
        var v = tw.currentNode.nodeValue;
        for (var i = 0; i < v.length; i++) if (v.charCodeAt(i) === 32) n++;
      }
    } catch (e) { }
    return n;
  }

  /* ضبط السطر: الفراغ الإضافي يتوزّع بين الكلمات (word-spacing) فتبقى الحروف على شكلها،
     وما فضل بعد أقصى ضغط مسموح يُعالَج بمطّ خفيف جداً. */
  function justifyLine(line, avail) {
    line.style.transform = '';
    line.style.wordSpacing = '';
    /* التكبير مطبَّق كـ transform:scale على الأب، فـ getBoundingClientRect يُرجع أبعاداً مكبَّرة
       بينما clientWidth/المقاس المحسوب غير مكبَّر — نردّ القياس إلى مقياس التنسيق (CSS px) */
    var rect0 = line.getBoundingClientRect();
    var cssW = parseFloat(getComputedStyle(line).width) || line.clientWidth || 0;
    var scale = (cssW > 0 && rect0.width > 0) ? (rect0.width / cssW) : 1;
    if (!(scale > 0.01)) scale = 1;
    var nat = contentWidth(line) / scale;
    if (nat <= 4 || avail <= 4) return;
    var fs = parseFloat(getComputedStyle(line).fontSize) || 16;
    var gaps = countGaps(line);
    if (gaps > 0) {
      var slack = avail - nat;
      var ws = slack / gaps;
      var hi = fs * 0.45;        /* أقصى توسيع للفراغ (تجاوزه يصير مطّاً خفيفاً بدل ثقوب بين الكلمات) */
      var lo = -fs * 0.17;       /* أقصى ضغط للفراغ (تبقى الكلمات مفصولة) */
      if (ws > hi) ws = hi;
      if (ws < lo) ws = lo;
      if (ws > 0.02 || ws < -0.02) line.style.wordSpacing = ws.toFixed(2) + 'px';
      nat = contentWidth(line) / scale;
    }
    var k = avail / nat;
    if (k > 1.13) { line.classList.add('center'); line.style.transform = ''; return; }
    if (k >= 0.68 && k <= 1.55) line.style.transform = 'scaleX(' + k.toFixed(4) + ')';
  }

  /* معامل التكبير المطبَّق على العنصر من خارجه (المصحف يُكبَّر بـ transform) */
  function scaleOf(el) {
    var rect0 = el.getBoundingClientRect();
    var cssW = parseFloat(getComputedStyle(el).width) || el.clientWidth || 0;
    var sc = (cssW > 0 && rect0.width > 0) ? (rect0.width / cssW) : 1;
    return (sc > 0.01) ? sc : 1;
  }

  /* الصفحتان الافتتاحيتان (١ و٢) في طبعة ١٤٣٩: السطور **موسّطة** بعروضها الطبيعية،
     ويُقرَّب كل سطر من عرض يتبع قوس دائرة (قصير في الأطراف، أطول في الوسط) بفراغات
     بين الكلمات فقط — ثم تكبير موحّد لكل السطور يحفظ نسبها. النتيجة: كتلة النص تظهر
     على شكل بيضاوي/دائري كما في المصحف المطبوع، بلا مطّ مشوّه للحروف. */
  /* امتداد الكلمات فعلياً (من حافة أول كلمة إلى حافة آخرها) بمقياس التنسيق */
  function extentOf(el) {
    var ws = el.querySelectorAll('.w');
    var sc = scaleOf(el);
    if (ws.length) {
      var a = ws[0].getBoundingClientRect();
      var b = ws[ws.length - 1].getBoundingClientRect();
      var w = (a.right - b.left);
      if (!(w > 0)) w = (b.right - a.left);
      return (w > 0) ? (w / sc) : 0;
    }
    return contentWidth(el) / sc;
  }

  /* الصفحتان الافتتاحيتان (١ و٢) في طبعة ١٤٣٩: السطور **موسّطة** بعروضها الطبيعية،
     ويُقرَّب كل سطر من عرض يتبع قوس دائرة (قصير في الأطراف، أطول في الوسط) بفراغات
     بين الكلمات فقط — ثم تكبير/تصغير موحّد لكل السطور يحفظ نسبها. النتيجة: كتلة النص
     تظهر على شكل بيضاوي كما في المصحف المطبوع، بلا مطّ مشوّه للحروف. */
  function layoutOval(lines, avail) {
    if (!lines || !lines.length) return;
    var i;
    for (i = 0; i < lines.length; i++) { lines[i].style.transform = ''; lines[i].style.wordSpacing = ''; }
    var fs = parseFloat(getComputedStyle(lines[0]).fontSize) || 16;
    var hi = fs * 0.42, lo = -fs * 0.18;   /* ضغط الفراغ مسموح به لئلا يتجاوز السطر عرض الصفحة */
    var nats = [], maxNat = 0;
    for (i = 0; i < lines.length; i++) {
      var n0 = extentOf(lines[i]);
      nats.push(n0);
      if (n0 > maxNat) maxNat = n0;
    }
    if (!(maxNat > 4) || !(avail > 4)) return;
    /* هدف دائري: نسبة كل سطر = جذر(١ - ((بعده عن المركز)/نصف القطر)²) */
    var n = lines.length, c = (n + 1) / 2, r = n / 2 + 0.85;
    for (i = 0; i < n; i++) {
      var f = Math.sqrt(Math.max(0.28, 1 - Math.pow((i + 1 - c) / r, 2)));
      var target = avail * (0.55 + 0.45 * f);
      var gaps = Math.max(1, countGaps(lines[i]));
      var ws = (target - nats[i]) / gaps;
      if (ws > hi) ws = hi;
      if (ws < lo) ws = lo;
      if (ws > 0.02 || ws < -0.02) lines[i].style.wordSpacing = ws.toFixed(2) + 'px';
      /* إن ظلّ السطر أعرض من الصفحة: هوامش سالبة متساوية فيبقى التوسيط متناظراً */
      var ex = extentOf(lines[i]);
      if (ex > avail) {
        var ov = ((ex - avail) / 2).toFixed(2);
        lines[i].style.marginLeft = '-' + ov + 'px';
        lines[i].style.marginRight = '-' + ov + 'px';
      } else { lines[i].style.marginLeft = ''; lines[i].style.marginRight = ''; }
    }
    /* تكبير موحّد (أو تصغير طفيف) مرّتين: مرة للقياس ومرة للتأكد من عدم تجاوز العرض */
    for (var pass = 0; pass < 2; pass++) {
      var maxT = 0;
      for (i = 0; i < n; i++) { var w2 = extentOf(lines[i]); if (w2 > maxT) maxT = w2; }
      if (!(maxT > 4)) return;
      var k = (avail * 0.985) / maxT;
      if (k > 1.16) k = 1.16;
      if (k < 0.88) k = 0.88;
      for (i = 0; i < n; i++) lines[i].style.transform = 'scaleX(' + k.toFixed(4) + ')';
    }
  }

  /* عرض المحتوى الحقيقي لعنصر: scrollWidth يرجع عرض الحاوية إذا كان المحتوى أقصر! */
  function contentWidth(el) {
    try {
      var r = document.createRange();
      r.selectNodeContents(el);
      var w = r.getBoundingClientRect().width;
      return w || el.scrollWidth;
    } catch (e) { return el.scrollWidth; }
  }

  /* توزيع طبعة ١٤٣٩ (QCF V2) — اختياري */
  function loadLayout() {
    var A = assets();
    if (A.inlineLayout) return Promise.resolve(A.inlineLayout);
    if (A.layoutCache) return Promise.resolve(A.layoutCache);
    return fetch('assets/layout-1439.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return (A.layoutCache = j); });
  }

  /* ============================================================
     الصنف الرئيسي
     ============================================================ */
  function Mushaf(data, font) {
    this.data = data;
    this.font = font || data.font_family || 'Hafs';
    this.lineWidth = data.line_width || 270;
    this.fontSize = data.font_size || 16;
    this.pages = [];        // 1..604 -> مصفوفة الأجزاء بترتيب القراءة
    this.pageOf = {};       // 's:a' -> صفحة
    this.wordsInAyah = {};  // 's:a' -> عدد الكلمات (نمط رسم المصحف)
    this.wordsSplit = {};   // 's:a' -> عدد الكلمات (نمط الفصل عند الألف الخنجرية)
    this.ayahCount = [];    // عدد آيات كل سورة
    this.suraPage = [];     // أول صفحة لكل سورة
    this.layout = null;     // توزيع بديل (طبعة ١٤٣٩)
    this.markerSet = null;  // زخارف أرقام الآيات
    this.tajweed = null;    // تلوين التجويد {on, words, code}
    this.reflow = false;    // إعادة التقطيع للخط الرقمي
    this._fit = 1;          // معامل تصغير الخط عند الضرورة
    this.fontStack = '';
    this.keyMap = null;
    this.layoutBounds = [];
    this.buildIndex();
  }

  Mushaf.prototype.buildIndex = function () {
    var suras = this.data.suras, si, ai, pi, aya, part;
    this.pages = [];
    for (si = 0; si < suras.length; si++) {
      // عدد الآيات الحقيقي = عدد المدخلات ناقص (الزخرفة + البسملة/العنوان)
      this.ayahCount[si + 1] = suras[si].ayas.length - 2;
      for (ai = 0; ai < suras[si].ayas.length; ai++) {
        aya = suras[si].ayas[ai];
        if (ai === 0 && !this.suraPage[si + 1]) this.suraPage[si + 1] = aya.p;
        var ayaNo = ai - 1;                    // -1 زخرفة/عنوان، 0 بسملة، 1..n آية
        var wcount = 0, scount = 0, key = (si + 1) + ':' + ayaNo;
        for (pi = 0; pi < aya.r.length; pi++) {
          part = aya.r[pi];
          var toks = part.t.split(/\s+/), k;
          for (k = 0; k < toks.length; k++) {
            if (toks[k] && AR.test(toks[k])) {
              wcount++;
              scount += splitToken(toks[k], true).length;
            }
          }
          var entry = {
            s: si + 1, a: ayaNo, p: aya.p, l: part.l,
            t: part.t, st: part.s, wi: pi
          };
          (this.pages[aya.p] = this.pages[aya.p] || []).push(entry);
          this.pageOf[key] = aya.p;
        }
        this.wordsInAyah[key] = wcount;
        this.wordsSplit[key] = scount;
      }
    }
    // ترتيب كل صفحة حسب السطر ثم ترتيب القراءة (يضمنه بناء الفهرس أصلاً)
    for (var p = 1; p < this.pages.length; p++) {
      if (!this.pages[p]) continue;
      this.pages[p].sort(function (x, y) { return x.l === y.l ? 0 : (x.l < y.l ? -1 : 1); });
    }
  };

  Mushaf.prototype.juzOfPage = function (p) {
    var j = 1;
    for (var i = 0; i < JUZ_PAGES.length; i++) if (p >= JUZ_PAGES[i]) j = i + 1;
    return j;
  };
  Mushaf.prototype.pageOfAyah = function (s, a) { return this.pageOf[s + ':' + a] || null; };
  /* عدد كلمات الآية: split=true بأسلوب الفصل عند الألف الخنجرية (نص quran.com) */
  Mushaf.prototype.wordCount = function (s, a, split) {
    var k = s + ':' + a;
    if (split) return this.wordsSplit[k] || this.wordsInAyah[k] || 0;
    return this.wordsInAyah[k] || 0;
  };
  Mushaf.prototype.suraFirstPage = function (s) { return this.suraPage[s] || 1; };
  Mushaf.prototype.suraName = function (s) {
    var r = this.data.suras[s - 1];
    return r ? r.name : '';
  };
  /* أول آية (أو آخرها) تُعرض في صفحة ما */
  Mushaf.prototype.pageBounds = function (p) {
    if (this.layout) return this.layoutBounds[p] || { first: null, last: null };
    var list = this.pages[p] || [], first = null, last = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].a >= 1) { if (!first) first = list[i]; last = list[i]; }
    }
    return { first: first, last: last };
  };

  /* ================= توزيع طبعة ١٤٣٩ ================= */
  /* خريطة 'سورة:آية:كلمة' -> {النص، العلامات اللاحقة} */
  Mushaf.prototype.buildKeyMap = function () {
    var map = {}, pend = {}, suras = this.data.suras;
    for (var si = 0; si < suras.length; si++) {
      for (var ai = 0; ai < suras[si].ayas.length; ai++) {
        var ayah = suras[si].ayas[ai], a = ai - 1, s = si + 1, cur = null, w = 0;
        for (var pi = 0; pi < ayah.r.length; pi++) {
          var toks = ayah.r[pi].t.split(/\s+/);
          for (var k = 0; k < toks.length; k++) {
            var tok = toks[k];
            if (!tok) continue;
            if (AR.test(tok)) {
              w++;
              var key = s + ':' + a + ':' + w;
              cur = map[key] = { t: tok, marks: [], s: s, a: a };
              if (pend[s + ':' + a]) { cur.marks = pend[s + ':' + a]; delete pend[s + ':' + a]; }
            } else if (cur) {
              cur.marks.push(tok);
            } else {
              (pend[s + ':' + a] = pend[s + ':' + a] || []).push(tok);
            }
          }
        }
      }
    }
    this.keyMap = map;
  };

  Mushaf.prototype.indexLayout = function () {
    var pages = this.layout.pages || [];
    this.pageOf = {}; this.suraPage = []; this.layoutBounds = [];
    for (var i = 0; i < pages.length; i++) {
      var p = i + 1, first = null, last = null, lines = pages[i] || [];
      for (var li = 0; li < lines.length; li++) {
        var keys = lines[li] || [];
        for (var ki = 0; ki < keys.length; ki++) {
          var pr = String(keys[ki]).split(':'), s = +pr[0], a = +pr[1];
          if (a >= 1) {
            var ak = s + ':' + a;
            if (this.pageOf[ak] === undefined) this.pageOf[ak] = p;
            if (!first) first = { s: s, a: a };
            last = { s: s, a: a };
          }
          if (a >= 0 && !this.suraPage[s]) this.suraPage[s] = p;
        }
      }
      this.layoutBounds[p] = { first: first, last: last };
    }
    /* احتياط: أي سورة لم تُحسب تُرجع لصفحتها الأصلية */
    var orig = this.suraPage.slice();
    this.buildSuraPages();
    for (var q = 1; q <= 114; q++) if (!this.suraPage[q] && orig[q]) this.suraPage[q] = orig[q];
  };

  Mushaf.prototype.buildSuraPages = function () {
    var suras = this.data.suras;
    for (var si = 0; si < suras.length; si++) {
      if (!this.suraPage[si + 1] && suras[si].ayas[0]) this.suraPage[si + 1] = suras[si].ayas[0].p;
    }
  };

  /* تفعيل/إلغاء توزيع الطبعة الجديدة */
  Mushaf.prototype.useLayout = function (layout) {
    this.layout = layout || null;
    if (!this.layout) { this.buildIndex(); return true; }
    this.buildKeyMap();
    this.indexLayout();
    return true;
  };

  /* ---------- بناء صفحة ---------- */
  Mushaf.prototype.renderPage = function (page, opts) {
    opts = opts || {};
    if (this.layout) return this.renderPageLayout(page, opts);
    var self = this;
    var list = this.reflow ? this.reflowList(page) : (this.pages[page] || []);
    var el = document.createElement('div');
    el.className = 'mushaf-page' + (opts.frame === false ? ' noframe' : '');
    el.dataset.page = page;
    /* إن ضاق النص عن السطور (خط عريض) نصغّر قياس الخط لهذه الصفحة فقط */
    if (this.reflow && this._fit < 1) el.style.setProperty('--mushaf-size', ((this.fontSize || 16) * this._fit).toFixed(2) + 'px');

    var byLine = {}, maxLine = 0, i, e, measure = [], ovalLines = [];
    var ovalPage = (page === 1 || page === 2);      /* الصفحتان الافتتاحيتان: شكل بيضاوي */
    for (i = 0; i < list.length; i++) {
      e = list[i];
      (byLine[e.l] = byLine[e.l] || []).push(e);
      if (e.l > maxLine) maxLine = e.l;
    }

    /* الترويسة: اسم السورة + الجزء */
    var suraNums = [], seen = {};
    for (i = 0; i < list.length; i++) if (!seen[list[i].s]) { seen[list[i].s] = 1; suraNums.push(list[i].s); }
    var headTxt = suraNums.map(function (s) { return self.suraName(s); }).join(' — ');
    if (suraNums.length > 2) headTxt = this.suraName(suraNums[0]) + ' … ' + this.suraName(suraNums[suraNums.length - 1]);

    var head = document.createElement('div');
    head.className = 'mp-head';
    var jz = this.juzOfPage(page);
    head.innerHTML = '<button type="button" class="side link" data-jump="sura:' + (suraNums[0] || 1) + '">' + esc(headTxt) + '</button>' +
                     '<button type="button" class="side link" data-jump="juz:' + jz + '">الجزء ' + toArabicDigits(jz) + '</button>';
    el.appendChild(head);

    var body = document.createElement('div');
    body.className = 'mp-body';
    el.appendChild(body);

    var words = new Map();     // 's:a:w' -> [span]
    var ayahs = new Map();     // 's:a'   -> [span]
    var ligs = new Map();      // 's:0'   -> span (رمزة البسملة)
    var wc = {};               // عدّاد الكلمات لكل آية
    var firstAyah = null, lastAyah = null;

    function push(key, ayahKey, span) {
      (words.get(key) || words.set(key, []).get(key)).push(span);
      var arr = ayahs.get(ayahKey);
      if (!arr) { arr = []; ayahs.set(ayahKey, arr); }
      if (arr.indexOf(span) < 0) arr.push(span);
    }

    for (var l = 1; l <= maxLine; l++) {
      var parts = byLine[l];
      var line = document.createElement('div');
      line.className = 'mline';
      body.appendChild(line);
      if (!parts || !parts.length) { line.innerHTML = '&nbsp;'; continue; }

      var st0 = (parts[0] && parts[0].st);
      line.dataset.st = (st0 === undefined || st0 === null) ? '' : String(st0);
      if (ovalPage) {
        /* الصفحتان الافتتاحيتان: توسيط + توزيع بيضاوي (كما في المصحف المطبوع) */
        line.dataset.oval = '1';
        line.classList.add('center');
        line.style.transform = '';
        ovalLines.push(line);
      } else if (st0 >= 0) {
        line.style.transform = 'scaleX(' + st0 + ')';
        measure.push(line);
      } else {
        line.classList.add('center');
      }

      for (i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (i === 0) {
          /* المعامل من قاعدة الرسم يُطبَّق أعلاه، ويُضبط بقياس فعلي في نهاية الرسم */
        }
        var isTitle = (part.a === -1) || (part.s === 1 && part.a === 0);
        var isBasm  = (part.a === 0 && !isTitle);
        var span = document.createElement('span');

        if (isTitle) {
          span.className = 'part';
          if (part.t) {
            line.classList.add('has-title');
            var tt = document.createElement('span');
            tt.className = 'title-txt';
            tt.textContent = SURA_NAMES[part.s - 1] || part.t;
            span.appendChild(tt);
          }
          line.appendChild(span);
          continue;
        }

        span.className = 'part';
        if (isBasm && opts.basmalaLigature && part.t) {
          var lig = document.createElement('span');
          lig.className = 'w basmala-lig';
          lig.dataset.k = part.s + ':0:1';
          lig.dataset.a = part.s + ':0';
          lig.textContent = BASMALA_LIG;
          span.appendChild(lig);
          ligs.set(part.s + ':0', lig);
          line.appendChild(span);
          continue;
        }

        var aKey = part.s + ':' + part.a;
        if (wc[aKey] === undefined) wc[aKey] = 0;
        var toks = part.t.split(/(\s+)/);
        for (var t = 0; t < toks.length; t++) {
          var tok = toks[t];
          if (tok === '') continue;
          if (/^\s+$/.test(tok)) { span.appendChild(document.createTextNode(tok)); continue; }
          var w = document.createElement('span');
          if (AR.test(tok)) {
            var subs = splitToken(tok, opts.splitDagger);
            var off = 0;
            for (var q = 0; q < subs.length; q++) {
              wc[aKey]++;
              var ws = (q === 0) ? w : document.createElement('span');
              ws.className = 'w seekable';
              ws.dataset.k = part.s + ':' + part.a + ':' + wc[aKey];
              ws.dataset.a = aKey;
              var wt1405 = wordText(self, part.s, part.a, wc[aKey], subs[q]);
            ws.textContent = wt1405;
            applyTajweed(self, ws, ws.dataset.k, wt1405, off);
            if (!ws.children.length && wt1405.indexOf(WAQF) >= 0) setWaqf(self, ws, wt1405);
              off += subs[q].length;
              push(ws.dataset.k, aKey, ws);
              span.appendChild(ws);
              var wm14 = addWarshMark(self, span, part.s, part.a, wc[aKey], ws.dataset.k);
              if (wm14) push(wm14.dataset.k, aKey, wm14);
            }
            continue;
          } else {
            /* علامة آية أو وقف: تتبع الكلمة السابقة */
            w.className = 'w mk seekable';
            w.dataset.k = part.s + ':' + part.a + ':' + (wc[aKey] || 1);
            w.dataset.a = aKey;
          }
          if (!decorateMarker(self, w, part.s, part.a, tok)) {
            var wt1 = wordText(self, part.s, part.a, wc[aKey] || 1, tok);
            w.textContent = wt1;
            if (wt1.indexOf(WAQF) >= 0) setWaqf(self, w, wt1);
          }
          span.appendChild(w);
        }
        line.appendChild(span);
        if (part.a >= 1) { if (!firstAyah) firstAyah = { s: part.s, a: part.a }; lastAyah = { s: part.s, a: part.a }; }
      }
    }

    /* ضبط السطور: قياس فعلي لعرض كل سطر ومطّه إلى عرض الصفحة (يضمن تساوي الطرفين) */
    if (measure.length || ovalLines.length) {
      hookFonts(self);
      requestAnimationFrame(function () {
        measure.forEach(function (line) {
          if (line.dataset.st === '' || line.dataset.st === null) return;
          if (parseFloat(line.dataset.st) < 0) return;        /* سطر موسّط في الرسم الأصلي */
          if (line.classList.contains('center')) return;
          line.style.transform = '';            /* أزل معامل قاعدة الرسم قبل القياس (وإلا قِسنا العرض بعد المطّ) */
          justifyLine(line, line.clientWidth || self.lineWidth);
        });
        if (ovalLines.length) layoutOval(ovalLines, ovalLines[0].clientWidth || self.lineWidth);
      });
    }


    var foot = document.createElement('div');
    foot.className = 'mp-foot';
    foot.innerHTML = '<button type="button" class="mp-num" data-jump="page:' + page + '">' +
      toArabicDigits(page) + '</button>';
    el.appendChild(foot);

    return {
      el: el, page: page, words: words, ayahs: ayahs, ligs: ligs,
      firstAyah: firstAyah, lastAyah: lastAyah, suras: suraNums,
      /* تحديد العناصر المطابقة */
      spansForKey: function (k) {
        var arr = words.get(k);
        if (arr && arr.length) return arr;
        var p = k.split(':');
        if (p[1] === '0') { var lg = ligs.get(p[0] + ':0'); if (lg) return [lg]; }
        return null;
      },
      spansForAyah: function (s, a) { return ayahs.get(s + ':' + a) || null; }
    };
  };

  /* ===== رسم صفحة من توزيع طبعة ١٤٣٩ (نصّ حقيقي، سطور الطبعة الجديدة) ===== */
  Mushaf.prototype.renderPageLayout = function (page, opts) {
    var self = this;
    var lines = this.reflow && this.keyMap ? this.reflowLayoutLines(page)
      : ((this.layout.pages || [])[page - 1] || []);
    var el = document.createElement('div');
    el.className = 'mushaf-page' + (opts.frame === false ? ' noframe' : '');
    el.dataset.page = page;
    if (this.reflow && this._fit < 1) el.style.setProperty('--mushaf-size', ((this.fontSize || 16) * this._fit).toFixed(2) + 'px');

    /* الترويسة: اسم السورة + الجزء */
    var suraNums = [], seen = {};
    lines.forEach(function (keys) {
      keys.forEach(function (k) {
        var pr = String(k).split(':'), s = +pr[0];
        if (!seen[s]) { seen[s] = 1; suraNums.push(s); }
      });
    });
    var headTxt = suraNums.map(function (s) { return self.suraName(s); }).join(' — ');
    if (suraNums.length > 2) headTxt = this.suraName(suraNums[0]) + ' … ' +
      this.suraName(suraNums[suraNums.length - 1]);
    var head = document.createElement('div');
    head.className = 'mp-head';
    var jz = this.juzOfPage(page);
    head.innerHTML = '<button type="button" class="side link" data-jump="sura:' + (suraNums[0] || 1) + '">' + esc(headTxt) + '</button>' +
                     '<button type="button" class="side link" data-jump="juz:' + jz + '">الجزء ' + toArabicDigits(jz) + '</button>';
    el.appendChild(head);

    var body = document.createElement('div');
    body.className = 'mp-body';
    el.appendChild(body);

    var words = new Map(), ayahs = new Map(), ligs = new Map();
    function push(key, ayahKey, span) {
      var arr = words.get(key);
      if (!arr) { arr = []; words.set(key, arr); }
      arr.push(span);
      var a2 = ayahs.get(ayahKey);
      if (!a2) { a2 = []; ayahs.set(ayahKey, a2); }
      if (a2.indexOf(span) < 0) a2.push(span);
    }

    var firstAyah = null, lastAyah = null, measure = [], emptyRun = 0, headEmpty = 0;
    var ovalPage = (page === 1 || page === 2);      /* الصفحتان الافتتاحيتان: شكل بيضاوي */
    var ovalLines = [];
    var lh = (this.fontSize || 16) * 2.05;
    /* توزيع السطور بالتساوي على ارتفاع الصفحة (بلا فراغات كبيرة) */
    body.classList.add('even');

    lines.forEach(function (keys) {
      if (!keys || !keys.length) { emptyRun++; return; }
      /* اسم السورة: a=-1 عادةً، أما الفاتحة فيُخزَّن اسمها في ١:٠ (والبسملة في ١:١) */
      var isSuraName = keys.some(function (k) {
        var pr = String(k).split(':');
        return pr[1] === '-1' || (pr[0] === '1' && pr[1] === '0');
      });
      var isTitle = isSuraName;
      var isBasm = !isTitle && keys.some(function (k) { return String(k).split(':')[1] === '0'; });
      /* فراغ رأس الصفحة الافتتاحية: يُقسَّم نصفين فوق النص وتحته ليصير النص في وسط الصفحة */
      if (emptyRun >= 4) {
        headEmpty = emptyRun;
        var gTop = headEmpty / 2;
        if (gTop > 0) {
          var gEl = document.createElement('div');
          gEl.className = 'mp-gap';
          gEl.style.height = Math.round(gTop * lh) + 'px';
          body.appendChild(gEl);
        }
      }
      emptyRun = 0;

      var line = document.createElement('div');
      line.className = 'mline';
      body.appendChild(line);

      if (isTitle) {
        line.classList.add('has-title', 'center');
        var tt = document.createElement('span');
        tt.className = 'title-txt';
        var s0 = parseInt(String(keys[0]).split(':')[0], 10);
        tt.textContent = SURA_NAMES[s0 - 1] || keys.map(function (k) {
          var inf = self.keyMap[k];
          return inf ? inf.t : '';
        }).join(' ');
        line.appendChild(tt);
        /* لا تسجيل كلمات للعنوان */
        return;
      }

      var span = document.createElement('span');
      span.className = 'part';
      if (isBasm) { line.classList.add('center'); measure = measure.filter(function (x) { return x !== line; }); }
      if (ovalPage && !isTitle) { line.classList.add('center'); line.dataset.oval = '1'; }
      if (isBasm && opts.basmalaLigature) {
        var lg = document.createElement('span');
        lg.className = 'w basmala-lig';
        lg.dataset.k = keys[0];
        lg.dataset.a = String(keys[0]).split(':').slice(0, 2).join(':');
        lg.textContent = BASMALA_LIG;
        span.appendChild(lg);
        ligs.set(String(keys[0]).split(':')[0] + ':0', lg);
        push(keys[0], String(keys[0]).split(':').slice(0, 2).join(':'), lg);
      } else {
        keys.forEach(function (k, idx) {
          var inf = self.keyMap[k];
          if (!inf) return;
          if (idx) span.appendChild(document.createTextNode(' '));
          var w = document.createElement('span');
          w.className = 'w seekable' + (isBasm ? ' basmala-lig' : '');
          w.dataset.k = k;
          w.dataset.a = inf.s + ':' + inf.a;
          var wtx = wordText(self, inf.s, inf.a, wIdx(inf, idx, keys), inf.t);
          w.textContent = wtx;
          applyTajweed(self, w, k, wtx, 0);
          if (!w.children.length && wtx.indexOf(WAQF) >= 0) setWaqf(self, w, wtx);
          push(k, inf.s + ':' + inf.a, w);
          span.appendChild(w);
          var wm = addWarshMark(self, span, inf.s, inf.a, wIdx(inf, idx, keys), k);
          if (wm) push(k, inf.s + ':' + inf.a, wm);
          (inf.marks || []).forEach(function (m) {
            span.appendChild(document.createTextNode(' '));
            var mk = document.createElement('span');
            mk.className = 'w mk seekable';
            mk.dataset.k = k;
            mk.dataset.a = inf.s + ':' + inf.a;
            if (!decorateMarker(self, mk, inf.s, inf.a, m)) mk.textContent = m;
            push(k, inf.s + ':' + inf.a, mk);
            span.appendChild(mk);
          });
          if (inf.a >= 1) {
            if (!firstAyah) firstAyah = { s: inf.s, a: inf.a };
            lastAyah = { s: inf.s, a: inf.a };
          }
        });
      }
      line.appendChild(span);
      if (line.dataset.oval) ovalLines.push(line); else measure.push(line);
    });

    /* مطّ السطور: قياس العرض الطبيعي ثم مده إلى عرض الصفحة */
    if (measure.length || ovalLines.length) {
      hookFonts(self);
      requestAnimationFrame(function () {
        measure.forEach(function (line) {
          if (line.classList.contains('center')) return;
          justifyLine(line, line.clientWidth || self.lineWidth);
        });
        if (ovalLines.length) layoutOval(ovalLines, ovalLines[0].clientWidth || self.lineWidth);
      });
    }

    /* النصف الثاني من الفراغ: يُضاف في الذيل فيتوسّط النص الصفحة */
    if (headEmpty >= 4) {
      var gBot = headEmpty - (headEmpty / 2);
      var gEl2 = document.createElement('div');
      gEl2.className = 'mp-gap';
      gEl2.style.height = Math.round(gBot * lh) + 'px';
      body.appendChild(gEl2);
    }


    var foot = document.createElement('div');
    foot.className = 'mp-foot';
    foot.innerHTML = '<button type="button" class="mp-num" data-jump="page:' + page + '">' +
      toArabicDigits(page) + '</button>';
    el.appendChild(foot);

    return {
      el: el, page: page, words: words, ayahs: ayahs, ligs: ligs,
      firstAyah: firstAyah, lastAyah: lastAyah, suras: suraNums,
      spansForKey: function (k) {
        var arr = words.get(k);
        if (arr && arr.length) return arr;
        var p = String(k).split(':');
        if (p[1] === '0') { var lg = ligs.get(p[0] + ':0'); if (lg) return [lg]; }
        return null;
      },
      spansForAyah: function (s, a) { return ayahs.get(s + ':' + a) || null; }
    };
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  global.MushafLib = {
    AR: AR,
    DB_FILES: DB_FILES,
    loadLayout: loadLayout,
    loadAyahMarkers: loadAyahMarkers,
    loadTajweed: loadTajweed,
    loadWarsh: loadWarsh,
    warshTables: warshTables,
    installTajweedCSS: installTajweedCSS,
    JUZ_PAGES: JUZ_PAGES,
    SURA_NAMES: SURA_NAMES,
    toArabicDigits: toArabicDigits,
    loadDB: loadDB,
    loadSuraFrame: loadSuraFrame,
    create: function (data, font) { return new Mushaf(data, font); }
  };
})(window);
