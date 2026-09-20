/* ============================================================
   app.js — التطبيق: واجهة + ربط المصحف بالصوت والتوقيت
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ==================== الحالة ==================== */
  var S = {
    mushaf: null,
    db: null,
    dbName: '',
    timing: null,
    mapping: null,
    spread: 0,               // رقم الفتحة المعروضة
    rendered: [], markerAssets: null,   // الصفحات + أصول زخارف الآيات
    player: null,
    active: { s: null, a: null, w: null },
    detached: false,         // المستخدم يتصفح بعيداً عن موضع التلاوة
    hl: { ayah: [], word: [] },
    curSura: null,
    localFiles: new Map(),  /* مجلد الصوت المحلي: رقم السورة ← File */
    localUrls: {},         /* روابط object URL المُنشأة (تُبطَل عند الاستبدال) */
    srcKind: '',           /* وصف مصدر الصوت الحالي (ملف محلي / رابط …) */
    settings: {
      font: 'Hafs', zoom: 1, spread: true, basmalaLig: false, frame: true,
      hlAyah: true, hlWord: true, autoFlip: true, clickSeek: true, autoNext: false,
      colAyah: '#2e9e6b', colWord: '#e03131', dark: false,
      basmalaInAyah: 'auto', unit: 'auto', page: 1, splitDagger: false, hlMode: 'text',
      edition: '1439', marker: '012-extralight', tajweed: '',
      playerHidden: false, riwaya: 'hafs', timingRiwaya: 'auto'
    }
  };

  /* ==================== تخزين بسيط ==================== */
  var Cache = (function () {
    var DBN = 'quran-mushaf-cache', STORE = 'files', dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        var rq = indexedDB.open(DBN, 1);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
      return dbp;
    }
    return {
      get: function (k) {
        return open().then(function (d) {
          return new Promise(function (res) {
            var rq = d.transaction(STORE, 'readonly').objectStore(STORE).get(k);
            rq.onsuccess = function () { res(rq.result || null); };
            rq.onerror = function () { res(null); };
          });
        }).catch(function () { return null; });
      },
      put: function (k, v) {
        return open().then(function (d) {
          return new Promise(function (res) {
            var tx = d.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(v, k);
            tx.oncomplete = function () { res(true); };
            tx.onerror = function () { res(false); };
          });
        }).catch(function () { return false; });
      },
      clear: function () {
        return open().then(function (d) {
          return new Promise(function (res) {
            var tx = d.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).clear();
            tx.oncomplete = function () { res(true); };
            tx.onerror = function () { res(false); };
          });
        }).catch(function () { return false; });
      }
    };
  })();

  /* ==================== أدوات ==================== */
  function toast(msg, kind, ms) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 320);
    }, ms || 2600);
  }

  function fmt(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    var t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = t % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ارفع هذا الرقم عند تغيير الإعدادات الافتراضية: تُطبَّق الجديدة مرة واحدة على من سبق أن حفظ */
  var SETTINGS_V = 2;
  function saveSettings() {
    try {
      var o = {};
      for (var k in S.settings) o[k] = S.settings[k];
      o.__v = SETTINGS_V;
      localStorage.setItem('qm-settings', JSON.stringify(o));
    } catch (e) { }
  }
  /* جوال/شاشة ضيقة: نفتتح على صفحة واحدة بدل الوجه (صفحتين) */
  function isMobile() {
    try { if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) return true; } catch (e) { }
    try { if (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) <= 820) return true; } catch (e) { }
    return /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent || '');
  }
  function isNarrowPhone() {
    try { if (window.matchMedia && window.matchMedia('(max-width: 560px)').matches) return true; } catch (e) { }
    return false;
  }

  function loadSettings() {
    try {
      var j = JSON.parse(localStorage.getItem('qm-settings') || '{}') || {};
      /* إعدادات افتتاحية جديدة تُطبَّق مرة واحدة (الطبعة، الزخرفة، العرض) */
      if (!j || (j.__v || 0) < SETTINGS_V) {
        ['edition', 'marker', 'spread'].forEach(function (k) { delete j[k]; });
      }
      for (var k in j) if (S.settings.hasOwnProperty(k)) S.settings[k] = j[k];
      /* أول تشغيل على الجوال (أو شاشة هاتف ضيقة) ← صفحة واحدة افتراضياً */
      var first = !j || !Object.keys(j).length;
      if ((first && isMobile()) || isNarrowPhone()) S.settings.spread = false;
    } catch (e) { }
  }

  function suraLabel(s) {
    return S.mushaf ? S.mushaf.suraName(s) : ('سورة ' + s);
  }

  /* ==================== التنقّل بين الصفحات ==================== */
  /* الوجه الواحد = صفحتان متتاليتان: ١-٢، ٣-٤، ٥-٦ … والفردية على اليمين (بداية المصحف: الفاتحة يميناً وبداية البقرة يساراً) */
  function spreadPages(i) {
    i = Math.max(1, Math.min(302, i | 0));
    return [2 * i - 1, 2 * i];
  }
  function spreadOfPage(p) {
    p = Math.max(1, Math.min(604, p | 0));
    return Math.ceil(p / 2);
  }

  function gotoPage(p, silent) {
    p = Math.max(1, Math.min(604, p | 0));
    S.settings.page = p;
    S.spread = S.settings.spread ? spreadOfPage(p) : p;
    render();
    saveSettings();
    if (!silent) updateHud();
  }
  /* بعد تنقّل يدوي أثناء التشغيل: يتوقف قلب الصفحة التلقائي حتى يطلب المستخدم المتابعة */
  function markManual() {
    if (!S.player || !S.player.src || !S.active.s) return;
    var p = S.mushaf.pageOfAyah(S.active.s, S.active.a);
    var shown = S.rendered.map(function (r) { return r.page; });
    if (p && shown.indexOf(p) < 0) S.detached = true;
    updateFollowChip();
  }
  function updateFollowChip() {
    var chip = $('followChip');
    if (!chip) return;
    var show = S.detached && !!(S.player && S.player.src) && !!S.active.s;
    chip.hidden = !show;
  }
  function followRecitation() {
    S.detached = false;
    updateFollowChip();
    if (S.active.s && S.active.a) maybeFlipPage(S.active.s, S.active.a);
  }

  function nextPage() {
    if (S.settings.spread) {
      var nx = S.spread + 1;
      if (nx > 302) return;
      S.spread = nx;
      S.settings.page = spreadPages(nx)[0];
    } else {
      if (S.settings.page >= 604) return;
      S.settings.page++;
    }
    render(); saveSettings(); updateHud(); markManual();
  }
  function prevPage() {
    if (S.settings.spread) {
      var pv = S.spread - 1;
      if (pv < 0) return;
      S.spread = pv;
      S.settings.page = spreadPages(pv)[0];
    } else {
      if (S.settings.page <= 1) return;
      S.settings.page--;
    }
    render(); saveSettings(); updateHud(); markManual();
  }

  function updateHud() {
    var shown = S.rendered.map(function (r) { return r.page; });
    if (!shown.length) return;
    var p = shown[0];
    if ($('pagePill')) $('pagePill').textContent = 'صفحة ' + MushafLib.toArabicDigits(shown.length > 1 ? shown[1] + '–' + shown[0] : shown[0]);
    if ($('juzPill')) $('juzPill').textContent = 'الجزء ' + MushafLib.toArabicDigits(S.mushaf.juzOfPage(p));
    var names = shown.map(function (q) { return S.mushaf.suraName((S.mushaf.pages[q] || [{ s: 1 }])[0].s); });
    if ($('suraPill')) $('suraPill').textContent = names.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' — ');
    updatePageBounds();
  }

  /* ==================== الرسم ==================== */
  function render() {
    var pages = S.settings.spread ? spreadPages(S.spread) : [S.settings.page];
    if (!S.settings.spread && pages.length > 1) pages = [pages[0]];
    var book = $('book');
    book.innerHTML = '';
    book.classList.toggle('two', pages.length > 1);
    S.rendered = pages.map(function (p) {
      var r = S.mushaf.renderPage(p, {
        basmalaLigature: S.settings.basmalaLig,
        frame: S.settings.frame,
        splitDagger: S.settings.splitDagger
      });
      book.appendChild(r.el);
      return r;
    });
    var w = (pages.length > 1 ? 612 : 306) * (S.settings.zoom || 1);
    $('stageScroll').style.width = 'min(100%, ' + Math.round(w + 40) + 'px)';
    applyHighlight(true);
    updatePageBounds();
    updateHud();
    updateFollowChip();
  }

  function applyHighlight(force) {
    var a = S.active;
    /* إزالة سابقة */
    S.hl.ayah.forEach(function (sp) { sp.classList.remove('ayah-on'); });
    S.hl.word.forEach(function (sp) { sp.classList.remove('word-on'); });
    S.hl.ayah = []; S.hl.word = [];
    if (!a.s || a.a === null || a.a === undefined) return;   /* ٠ = البسملة: مسموح */
    var key = a.s + ':' + a.a;
    var wordKey = a.w ? (key + ':' + a.w) : null;
    if (S.settings.hlAyah) {
      S.rendered.forEach(function (r) {
        var arr = r.spansForAyah(a.s, a.a);
        if (arr) arr.forEach(function (sp) { sp.classList.add('ayah-on'); S.hl.ayah.push(sp); });
      });
    }
    if (S.settings.hlWord && wordKey) {
      S.rendered.forEach(function (r) {
        var arr = r.spansForKey(wordKey);
        if (arr) arr.forEach(function (sp) { sp.classList.add('word-on'); S.hl.word.push(sp); });
      });
    }
  }

  function setActive(s, a, w) {
    if (S.active.s === s && S.active.a === a && S.active.w === w) return false;
    S.active = { s: s, a: a, w: w };
    applyHighlight();
    updateNowPlaying();
    return true;
  }

  /* ==================== حدود الصفحة للتكرار ==================== */
  function updatePageBounds() {
    if (!S.player || !S.timing || !S.curSura) { if (S.player) S.player.setPageBounds(null, null); return; }
    var data = S.timing.bySura.get(S.curSura);
    if (!data) { S.player.setPageBounds(null, null); return; }
    var pages = S.rendered.map(function (r) { return r.page; });
    var t0 = Infinity, t1 = -Infinity, found = false;
    pages.forEach(function (p) {
      var list = S.mushaf.pages[p] || [];
      list.forEach(function (e) {
        if (e.a < 1) return;
        for (var i = 0; i < data.ayahList.length; i++) {
          if (data.ayahList[i].a === e.a) {
            if (data.ayahList[i].t0 < t0) t0 = data.ayahList[i].t0;
            if (data.ayahList[i].t1 > t1) t1 = data.ayahList[i].t1;
            found = true; break;
          }
        }
      });
    });
    S.player.setPageBounds(found ? t0 : null, found ? t1 : null);
  }

  /* ==================== التشغيل ==================== */
  function playerTick(st) {
    /* تحديث شريط التقدّم */
    var dur = st.dur || 0;
    var pct = dur ? Math.min(100, (st.t / dur) * 100) : 0;
    $('seekFill').style.width = pct + '%';
    $('seekKnob').style.right = 'calc(' + pct + '% - 0px)';
    $('seekKnob').style.transform = 'translateX(50%)';
    $('nowTime').textContent = fmt(st.t);
    $('durTime').textContent = fmt(dur);
    if (!st.seg) return;
    var s = S.curSura, a = st.ayah ? st.ayah.a : (st.seg ? st.seg.a : null);
    var w = st.seg ? st.seg.w : null;
    if (!s || a === null || a === undefined) return;          /* ٠ = البسملة: مسموح */
    var changed = setActive(s, a, w);
    if (changed && S.settings.autoFlip) maybeFlipPage(s, a);
  }

  function maybeFlipPage(s, a) {
    if (S.detached) { updateFollowChip(); return; }
    var p = S.mushaf.pageOfAyah(s, a);
    if (!p) return;
    var shown = S.rendered.map(function (r) { return r.page; });
    if (shown.indexOf(p) >= 0) return;
    if (S.settings.spread) {
      S.spread = spreadOfPage(p);
      S.settings.page = spreadPages(S.spread)[0];
    } else {
      S.settings.page = p;
    }
    render(); saveSettings();
  }

  function updateNowPlaying() {
    var a = S.active;
    var isWarsh = (S.mushaf && S.mushaf.riwaya === 'warsh');
    if (S.curSura && (a.a === 0 || (isWarsh && S.curSura === 1 && a.a === 1))) {
      $('nowMain').textContent = suraLabel(S.curSura) + ' — البسملة' + (a.w ? ' • كلمة ' + MushafLib.toArabicDigits(a.w) : '');
    } else if (S.curSura && a.a) {
      var an = (isWarsh && S.mushaf.ayahNo) ? S.mushaf.ayahNo(S.curSura, a.a) : a.a;
      var txt = suraLabel(S.curSura) + ' — الآية ' + MushafLib.toArabicDigits(an);
      if (a.w) txt += ' • كلمة ' + MushafLib.toArabicDigits(a.w);
      $('nowMain').textContent = txt;
    } else if (S.curSura) {
      $('nowMain').textContent = suraLabel(S.curSura);
    } else {
      $('nowMain').textContent = 'لا يوجد تلاوة محمّلة';
    }
  }

  /* يجلب رابط الصوت: من الذاكرة المحلية، أو من القاعدة، أو رابط/ملف يختاره المستخدم */
  function resolveAudio(no, row, preferDownload) {
    /* ملف محلي من «فتح مجلد الصوت» له الأولوية */
    var lf = S.localFiles.get(no);
    if (lf && !preferDownload) {
      if (!S.localUrls[no]) S.localUrls[no] = URL.createObjectURL(lf);
      return Promise.resolve({ src: S.localUrls[no], kind: 'ملف محلي: ' + lf.name });
    }
    var url = (row && row.url) || '';
    if (!url) return Promise.reject(new Error('لا يوجد رابط صوت لهذه السورة'));
    return Cache.get(url).then(function (blob) {
      if (blob && !preferDownload) return { src: URL.createObjectURL(blob), kind: 'مخزّن محلياً' };
      if (isBlockedHost(url)) {
        warnBlocked(url);
        var e = new Error('رابط غير قابل للتشغيل داخل المتصفح');
        e.blocked = true;
        throw e;
      }
      return { src: url, kind: 'رابط مباشر' };
    });
  }

  /* ==================== مجلد الصوت المحلي ==================== */
  var AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;

  /* تطبيع عربي: حذف التشكيل والتطويل وتوحيد الألف والياء والتاء والهمزة */
  function normArabic(t) {
    return String(t || '')
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
      .replace(/[\u0622\u0623\u0625\u0627]/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u0624/g, '\u0648')
      .replace(/\u0626/g, '\u064A')
      .replace(/[^\u0621-\u064Aa-zA-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* يخمّن رقم السورة من الاسم: 001.mp3 · 2-البقرة.mp3 · سورة 5.mp3 · Al-Baqarah.mp3 */
  function guessSuraFromName(name) {
    /* الأرقام العربية الهندية ← أرقام لاتينية حتى تُطابق (٠٠٢.mp3) */
    var base = String(name || '')
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    var m = base.match(/\d{1,3}/g);
    if (m) {
      for (var i = 0; i < m.length; i++) {
        var n = parseInt(m[i], 10);
        if (n >= 1 && n <= 114) return n;
      }
    }
    var nb = normArabic(base);
    if (!nb) return null;
    var best = null, bestLen = 0;
    for (var s = 1; s <= 114; s++) {
      var nm = normArabic(String(suraLabel(s)).replace(/^\u0633\u0648\u0631\u0629?\s*/, ''));
      if (nm.length >= 3 && nb.indexOf(nm) >= 0 && nm.length > bestLen) { bestLen = nm.length; best = s; }
    }
    return best;
  }

  /* صياغة عدد عربية مبسّطة: ١ ← مفرد، ٢ ← مثنى، ٣–١٠ ← جمع، وأكثر ← مفرد منصوب */
  function countWord(n, one, two, few) {
    var d = MushafLib.toArabicDigits(n);
    if (n === 1) return d + ' ' + one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return d + ' ' + few;
    return d + ' ' + one;
  }

  function setLocalFile(no, f) {
    if (S.localUrls[no]) { try { URL.revokeObjectURL(S.localUrls[no]); } catch (e) { } }
    S.localUrls[no] = null;
    S.localFiles.set(no, f);
  }

  function handleAudioFiles(list, silent) {
    var files = Array.prototype.slice.call(list || []);
    var audio = files.filter(function (f) { return AUDIO_EXT.test(f.name); });
    if (!audio.length) { if (!silent) toast('لا توجد ملفات صوت (MP3) في هذا المجلد', 'err'); return 0; }
    var unmatched = [];
    audio.forEach(function (f) {
      var n = guessSuraFromName(f.name);
      if (!n) { unmatched.push(f); return; }
      setLocalFile(n, f);
    });
    toast('تم ربط ' + countWord(S.localFiles.size, 'ملفاً صوتياً', 'ملفين صوتيين', 'ملفات صوتية') + ' بالسور' +
      (unmatched.length ? ' — تعذّر تعرّف ' + countWord(unmatched.length, 'ملف', 'ملفين', 'ملفات') : ''), 'ok', 4200);
    buildSurahList(); updateDbNote();
    if (unmatched.length) openFolderMap(unmatched);
    return audio.length;
  }

  function updateDbNote() {
    var el = $('dbNote');
    if (!el) return;
    var base = el.getAttribute('data-base');
    if (base === null) { base = el.innerHTML; el.setAttribute('data-base', base); }
    var n = S.localFiles.size;
    el.innerHTML = base + (n ? '<br><b>' + MushafLib.toArabicDigits(n) + '</b> ملف MP3 من مجلد الصوت المحلي.' : '');
  }

  /* نافذة مطابقة يدوية للملفات التي لم تُعرَّف تلقائياً */
  function openFolderMap(files) {
    var opts = '<option value="">— بدون —</option>';
    for (var i = 1; i <= 114; i++) {
      opts += '<option value="' + i + '">' + MushafLib.toArabicDigits(i) + ' — ' + esc(suraLabel(i)) + '</option>';
    }
    var html = '<div class="pane-note">اختر السورة لكل ملف لم نتمكّن من معرفته تلقائياً:</div>' +
      '<div style="max-height:52vh;overflow:auto"><div class="map-grid">';
    files.forEach(function (f, i) {
      html += '<div class="map-row"><label title="' + esc(f.name) + '">' +
        esc(String(f.name).replace(/^.*[\\/]/, '')) + '</label>' +
        '<select id="fmSel' + i + '">' + opts + '</select></div>';
    });
    html += '</div></div>';
    showModal('مطابقة ملفات المجلد', html, [
      { text: 'حفظ', primary: true, onClick: function () {
          files.forEach(function (f, i) {
            var sel = $('fmSel' + i);
            var v = sel ? parseInt(sel.value, 10) : 0;
            if (v >= 1 && v <= 114) setLocalFile(v, f);
          });
          closeModal(); buildSurahList(); updateDbNote();
          toast('تم ربط ' + countWord(S.localFiles.size, 'ملفاً صوتياً', 'ملفين صوتيين', 'ملفات صوتية'), 'ok');
        } },
      { text: 'تجاهل', onClick: closeModal }
    ]);
  }

  /* روابط لا يمكن للمتصفح تضمينها: ننبّه مبكراً ونفتحها في تبويب */
  function isBlockedHost(url) {
    try {
      var h = new URL(url, location.href).hostname;
      return /drive\.google\.com$|drive\.usercontent\.google\.com$|docs\.google\.com$/.test(h);
    } catch (e) { return false; }
  }
  function warnBlocked(url, name) {
    toast('رابط Google Drive لا يُشغَّل داخل المتصفح (جوجل تمنع التضمين).\n' +
          'سيُفتح في تبويب جديد — أو استخدم «ملف محلي».', 'err', 6500);
    try { window.open(url, '_blank', 'noopener'); } catch (e) {}
  }

  /* أول سورة بعد (from) يتوفر لها صوت: ملف من مجلد الصوت، أو رابط صالح في القاعدة */
  function nextPlayable(from) {
    for (var n = from + 1; n <= 114; n++) {
      if (S.localFiles.has(n)) return n;
      var r = findRow(n);
      if (r && r.url && !isBlockedHost(r.url)) return n;
    }
    return null;
  }

  /* الانتقال إلى كلمة محدّدة بعد جاهزية بيانات الملف (عند النقر على كلمة من سورة أخرى) */
  function seekWordWhenReady(no, a, w) {
    var au = S.player && S.player.audio;
    if (!au) return;
    var go = function () {
      try { S.player.seekWord(no, a, w); } catch (e) { }
      try { if (au.paused) S.player.play(); } catch (e) { }
    };
    if (au.readyState >= 1) go();
    else au.addEventListener('loadedmetadata', go, { once: true });
  }

  function playSurah(no, opts) {
    opts = opts || {};
    var row = findRow(no);
    var local = S.localFiles.get(no) || null;
    if (!row && !opts.src && !local) {
      toast('لا يوجد رابط لهذه السورة في القاعدة — استخدم "ملف محلي" أو "فتح مجلد الصوت"', 'err', 3600);
      return;
    }
    /* ملف محلي من مجلد الصوت ← يُشغَّل فوراً بلا أي فحص للرابط (حتى لو كان رابط القاعدة محجوباً) */
    var p = opts.src ? Promise.resolve({ src: opts.src, kind: opts.kind || 'ملف محلي' }) : resolveAudio(no, row);
    p.then(function (r) {
      S.curSura = no;
      S.detached = false;
      updateFollowChip();
      S.player.load(r.src, { sura: no });
      var data = S.timing ? (S.timing.bySura.get(no) || null) : null;
      S.player.setTiming(data);
      $('nowSrc').textContent = r.kind;
      S.srcKind = r.kind;
      if (!data) toast(suraLabel(no) + ': لا يوجد توقيت لهذه السورة في القاعدة', 'err', 3000);
      if (!opts.keepPage) gotoAyah(no, 1, true);   /* keepPage: نبقى في الصفحة التي نقر عليها المستخدم */
      markPlayingRow(no);
      S.player.play();
      buildTicks();
      updateNowPlaying();
      if (opts.seekTo) seekWordWhenReady(no, opts.seekTo[0], opts.seekTo[1]);
    }).catch(function (e) {
      if (e && e.blocked) return;      /* نُبه المستخدم مسبقاً في warnBlocked */
      toast(e.message || String(e), 'err', 3600);
    });
  }

  function findRow(no) {
    if (!S.timing) return null;
    for (var i = 0; i < S.timing.surahs.length; i++) {
      if (+S.timing.surahs[i].no === +no) return S.timing.surahs[i];
    }
    return null;
  }

  function gotoAyah(s, a, setPageOnly) {
    var p = S.mushaf.pageOfAyah(s, a);
    if (p) {
      S.settings.page = p;
      S.spread = S.settings.spread ? spreadOfPage(p) : p;
      render(); saveSettings();
    }
    setActive(s, a, null);
  }

  function buildTicks() {
    var box = $('seekTicks');
    box.innerHTML = '';
    if (!S.timing || !S.curSura) return;
    var data = S.timing.bySura.get(S.curSura);
    if (!data) return;
    var dur = data.dur || S.player.duration() || 0;
    if (!dur) return;
    var frag = document.createDocumentFragment();
    data.ayahList.forEach(function (ay) {
      var pct = (ay.t0 / dur) * 100;
      if (pct < 0 || pct > 100) return;
      var i = document.createElement('i');
      i.style.right = pct + '%';
      if (ay.a % 10 === 0) i.className = 'big';
      frag.appendChild(i);
    });
    box.appendChild(frag);
  }

  function markPlayingRow(no) {
    $$('.surah-item').forEach(function (el) {
      el.classList.toggle('playing', +el.dataset.no === +no);
    });
  }

  /* ==================== قائمة السور ==================== */
  function buildSurahList() {
    var box = $('surahList');
    box.innerHTML = '';
    var rows = (S.timing && S.timing.surahs) ? S.timing.surahs.slice() : [];
    var byNo = {};
    rows.forEach(function (r) { byNo[+r.no] = r; });

    for (var s = 1; s <= 114; s++) {
      var row = byNo[s] || { no: s, name: '', url: '' };
      var data = S.timing ? S.timing.bySura.get(s) : null;
      var el = document.createElement('div');
      el.className = 'surah-item';
      el.dataset.no = s;
      el.dataset.url = row.url || '';
      el.innerHTML =
        '<div class="surah-num">' + MushafLib.toArabicDigits(s) + '</div>' +
        '<div class="surah-meta">' +
          '<div class="surah-name' + (S.localFiles.has(s) ? ' has-audio' : '') + '">' + esc(row.name || suraLabel(s)) + '</div>' +
          '<div class="surah-sub">' +
            '<span>ص ' + MushafLib.toArabicDigits(S.mushaf.suraFirstPage(s)) + '</span>' +
            '<span>' + MushafLib.toArabicDigits(S.mushaf.ayahCount[s]) + ' آية</span>' +
            (data ? '<span class="ok">' + MushafLib.toArabicDigits(data.words || data.segs.length) + ' كلمة مُوقَّتة</span>'
                  : '<span class="no">بلا توقيت</span>') +
            (S.localFiles.has(s) ? '<span class="ok local">ملف محلي</span>' : (row.url ? '<span class="ok">رابط MP3</span>' : '<span class="no">بلا رابط</span>')) +
          '</div>' +
        '</div>' +
        '<div class="surah-acts">' +
          '<button class="sicon" data-act="go" title="الانتقال للسورة">' +
            '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 6v12" stroke="currentColor" stroke-width="2"/></svg></button>' +
          '<button class="sicon" data-act="play" title="تشغيل"' + ((row.url || S.localFiles.has(s)) ? '' : ' disabled') + '>' +
            '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></button>' +
          '<button class="sicon" data-act="dl" title="تحميل MP3"' + (row.url ? '' : ' disabled') + '>' +
            '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '</div>';
      box.appendChild(el);
    }
  }

  function filterSurahs(q) {
    q = (q || '').trim();
    $$('.surah-item').forEach(function (el) {
      if (!q) { el.style.display = ''; return; }
      var name = el.querySelector('.surah-name').textContent;
      var no = el.dataset.no;
      var show = name.indexOf(q) >= 0 || no === q || name.replace(/[\u064B-\u0652\u0670]/g, '').indexOf(q) >= 0;
      el.style.display = show ? '' : 'none';
    });
  }

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ==================== التحميل والحفظ ==================== */
  function fetchWithProgress(url, onProgress) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var total = +r.headers.get('content-length') || 0;
      var got = 0, chunks = [];
      var reader = r.body ? r.body.getReader() : null;
      if (!reader) return r.blob();
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) return new Blob(chunks);
          chunks.push(res.value); got += res.value.length;
          if (onProgress) onProgress(got, total);
          return pump();
        });
      }
      return pump();
    });
  }

  function saveBlob(blob, name) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 3000);
  }

  function downloadSurah(no, row, silent) {
    row = row || findRow(no);
    if (!row || !row.url) { toast('لا يوجد رابط لهذه السورة', 'err'); return Promise.resolve(false); }
    return Cache.get(row.url).then(function (c) {
      if (c) { if (!silent) { saveBlob(c, fileNameFor(no, row)); toast('تم التحميل من التخزين المحلي', 'ok'); } return true; }
      return fetchWithProgress(row.url, function (got, total) {
        if (!silent && total) $('nowSrc').textContent = 'تنزيل ' + Math.round(got / 1048576 * 10) / 10 + ' ميغابايت';
      }).then(function (blob) {
        return Cache.put(row.url, blob).then(function () {
          saveBlob(blob, fileNameFor(no, row));
          if (!silent) toast('تم تنزيل ' + suraLabel(no) + ' وحفظه محلياً', 'ok');
          $('nowSrc').textContent = 'مخزّن محلياً';
          return true;
        });
      }).catch(function (e) {
        if (!silent) {
          toast('تعذّر التنزيل المباشر (CORS) — سيُفتح الرابط', 'err', 3400);
          window.open(row.url, '_blank');
        }
        return false;
      });
    });
  }

  function fileNameFor(no, row) {
    var ext = '.mp3';
    try {
      var u = new URL(row.url, location.href);
      var m = u.pathname.match(/\.(mp3|m4a|ogg|wav|aac)(\?|$)/i);
      if (m) ext = '.' + m[1];
    } catch (e) { }
    return String(no).padStart(3, '0') + (row.reciter ? '-' + row.reciter.replace(/[^\w\u0600-\u06FF-]/g, '_') : '') + ext;
  }

  /* ==================== قاعدة التوقيت ==================== */
  function loadDbFile(file) {
    if (!file) return;
    $('bootSub').textContent = 'جارٍ قراءة ' + file.name + '…';
    $('boot').classList.remove('hide');
    var fr = new FileReader();
    fr.onload = function () {
      TimingDB.openDb(fr.result).then(function (db) {
        S.db = db; S.dbName = file.name;
        var mapping = TimingDB.guessMapping(db);
        S.mapping = mapping;
        applyMapping(mapping, true);
        $('boot').classList.add('hide');
      }).catch(function (e) {
        $('boot').classList.add('hide');
        toast('تعذّر فتح القاعدة: ' + (e.message || e), 'err', 5000);
      });
    };
    fr.onerror = function () { $('boot').classList.add('hide'); toast('تعذّر قراءة الملف', 'err'); };
    fr.readAsArrayBuffer(file);
  }

  function applyMapping(mapping, auto) {
    if (!mapping.segments || !mapping.segments.table) {
      toast('لم أتعرف على جدول المقاطع — اختر الجدول يدوياً', 'err', 4000);
      openMappingModal(mapping);
      return;
    }
    var res;
    try {
      res = TimingDB.extract(S.db, mapping, S.mushaf, {
        basmalaInAyah: S.settings.basmalaInAyah === 'auto' ? 'auto' : S.settings.basmalaInAyah,
        splitDagger: S.settings.splitDagger,
        forceRiwaya: (S.settings.timingRiwaya === 'warsh' || S.settings.timingRiwaya === 'hafs')
          ? S.settings.timingRiwaya : ''
      });
    } catch (e) {
      toast('خطأ في الاستخراج: ' + e.message, 'err', 4500);
      openMappingModal(mapping);
      return;
    }
    if (!res.bySura.size || res.stats.words === 0) {
      toast('لم أستخرج مقاطع — راجع مطابقة الأعمدة', 'err', 4200);
      S.timing = res; buildSurahList();
      openMappingModal(mapping);
      return;
    }
    /* ترقيم الملف لا يشبه مصحف حفص ولم تُحمَّل جداول ورش: نحمّلها ونعيد المطابقة،
       فنستطيع أن نقول للمستخدم على أي رواية هذا الملف.                       */
    var f = res.fit;
    if (f && !f.warshKnown && !f.strong && S.mushaf && S.mushaf.riwaya !== 'warsh' && !S.warshProbeDone &&
        f.tested >= 4 && f.confH < 0.85) {
      S.warshProbeDone = true;
      MushafLib.loadWarsh().then(function (d) {
        if (S.mushaf && S.mushaf.attachWarshTables(d)) { applyMapping(mapping, auto); return; }
        finishApplyMapping(res, mapping, auto);
      }).catch(function () { finishApplyMapping(res, mapping, auto); });
      return;
    }
    finishApplyMapping(res, mapping, auto);
  }

  function finishApplyMapping(res, mapping, auto) {
    S.timing = res;
    S.mapping = mapping;
    buildSurahList();
    updateMapNote(res, mapping);
    buildTicks();
    toast('تم تحميل القاعدة: ' + MushafLib.toArabicDigits(res.stats.suras) + ' سورة، ' +
      MushafLib.toArabicDigits(res.stats.words) + ' كلمة مُوقَّتة' +
      (res.stats.remapped ? (' • حُوِّل التوقيت من ترقيم ورش') : ''), 'ok', 4200);
    if (!auto) saveMappingHint(mapping);
    notifyRiwayaMismatch(res);
  }

  /* تنبيه المستخدم إن كان ملف التوقيت على رواية غير رواية المصحف المفتوح */
  function notifyRiwayaMismatch(res) {
    var f = res && res.fit;
    if (!f || f.tested < 4 || !S.mushaf) return;
    var isWarsh = S.mushaf.riwaya === 'warsh';
    var sure = function (c) { return !!f.strong || c >= 0.7; };
    if (isWarsh && !f.warshKnown && !sure(f.confH) && f.miss && f.miss.warsh < f.miss.asIs) {
      toast('الملف على ترقيم ورش، ونسخة ورش عندك بلا جدول التحويل (tinv) — حدّث البرنامج، أو ' +
        'اختر «ترقيم آيات ملف التوقيت: ورش» من الإعدادات', 'err', 8000);
      return;
    }
    var bad = isWarsh ? (f.verdict === 'hafs' && sure(f.confH))
                      : (f.verdict === 'warsh' && sure(f.confW));
    if (!bad) return;
    var n = MushafLib.toArabicDigits;
    var mine = isWarsh ? 'ورش عن نافع (العدّ المدني)' : 'حفص عن عاصم (العدّ الكوفي)';
    var other = isWarsh ? 'حفص عن عاصم (العدّ الكوفي)' : 'ورش عن نافع (العدّ المدني)';
    var got = isWarsh ? f.confH : f.confW, otherGot = isWarsh ? f.confW : f.confH;
    var html =
      '<p>ترقيم الآيات في <b>' + esc(S.dbName || 'الملف المرفوع') + '</b> لا يطابق مصحف <b>' + mine + '</b>.</p>' +
      '<p>طابقنا أعلى رقم كلمة في كل آية مع عدد كلماتها: وافق ترقيم <b>' + other + '</b> في ' +
      n(Math.round(got * 100)) + '٪ من ' + n(f.tested) + ' آية، ولم يوافق ترقيم مصحفك إلا في ' +
      n(Math.round(otherGot * 100)) + '٪ — وعدد الآيات يختلف بين الروايتين في ٦٠ سورة.</p>' +
      '<p>النتيجة: التلوين والانتقال سيتنقّلان في آيات غير التي تسمعها. ' +
      '<b>استخدم ملف توقيت على ' + (isWarsh ? 'ورش' : 'حفص') + '</b>، أو ' +
      '<b>بدّل المصحف إلى ' + other + '</b>؛ والتوقيت المحمَّل حالياً سيُطبَّق كما هو إن تجاهلت.</p>';
    showModal('التوقيتات ليست على رواية مصحفك', html, [
      {
        text: isWarsh ? 'تبديل المصحف إلى حفص' : 'تبديل المصحف إلى ورش', primary: true,
        onClick: function () { closeModal(); applyRiwaya(isWarsh ? 'hafs' : 'warsh'); }
      },
      {
        text: isWarsh ? 'اختيار ملف توقيت ورش' : 'اختيار ملف توقيت حفص',
        onClick: function () { closeModal(); $('fileDb').click(); }
      },
      { text: 'متابعة بلا تغيير', onClick: function () { closeModal(); } }
    ]);
  }

  function updateMapNote(res, mapping) {
    var m = mapping.segments, sl = mapping.surahList;
    var txt = 'القاعدة: <b>' + esc(S.dbName) + '</b><br>' +
      'المقاطع: <code>' + esc(m.table) + '</code> ← سورة:' + esc(m.sura || '?') +
      ' آية:' + esc(m.aya || '?') + ' كلمة:' + esc(m.word || (m.packed ? 'مضغوطة في ' + m.packed : '—')) +
      (m.packed ? '' : (' من:' + esc(m.start || m.time || '?') + ' إلى:' + esc(m.end || '?'))) + '<br>' +
      'الوحدة: ' + esc(res.stats.unit || '') + ' • أساس الكلمة: ' + res.stats.wordBase +
      ' • البسملة: ' + (res.mode === 'B' ? 'مدمجة في الآية 1' : 'مستقلة/غير محسوبة') +
      (sl ? '<br>الروابط: <code>' + esc(sl.table) + '</code> ← ' + esc(sl.url || '—') : '');
    if (res.stats.estimated) txt += '<br><b>تنبيه:</b> التوقيت على مستوى الآية فقط — أزمنة الكلمات مُقدَّرة بالتوزيع.';
    if (res.fit) txt += '<br>ترقيم آيات الملف: ' +
      (res.fit.verdict === 'warsh' ? '<b>ورش</b> (العدّ المدني)' :
       res.fit.verdict === 'hafs' ? '<b>حفص</b> (العدّ الكوفي)' : 'غير محدَّد') +
      ' — مطابق في ' + MushafLib.toArabicDigits(res.fit.hafs) + ' آية من ' + MushafLib.toArabicDigits(res.fit.tested) +
      ' لحفص، و' + MushafLib.toArabicDigits(res.fit.warsh) + ' لورش' +
      (res.stats.remapped ? (' • حُوِّل ' + MushafLib.toArabicDigits(res.stats.remapped) + ' مقطعاً إلى مفاتيح المصحف') : '') +
      '<br>توقيت الكلمات: ' + (res.stats.wordRows
        ? ('<b>' + MushafLib.toArabicDigits(res.stats.wordRows) + ' مقطع كلمة</b>')
        : '<b>لا يوجد — قُرئ توقيت الآية فقط وزُوِّعت أزمنة الكلمات تقديراً</b>') +
      (res.fit.miss ? (' • مقاطع خارج رسم المصحف: كما هي ' + MushafLib.toArabicDigits(res.fit.miss.asIs) +
        ' مقابل ' + MushafLib.toArabicDigits(res.fit.miss.warsh) + ' بعد التحويل (من ' +
        MushafLib.toArabicDigits(res.fit.miss.tot) + ')') : '') +
      (res.fit.forced ? ' • الترقيم مفروض يدوياً' : '');
    if (res.warnings && res.warnings.length) txt += '<br>' + res.warnings.map(esc).join(' • ');
    $('mapNote').innerHTML = txt;
    $('dbNote').innerHTML = 'القاعدة محمّلة: <b>' + esc(S.dbName) + '</b> — ' +
      MushafLib.toArabicDigits(res.surahs.filter(function (r) { return r.url; }).length) + ' رابط MP3. ' +
      'اضغط ▶ للتشغيل المباشر أو ⬇ للتنزيل.';
  }

  function saveMappingHint() { /* يمكن حفظ تفضيلات المستخدم لاحقاً */ }

  /* ---------- نافذة مطابقة الأعمدة ---------- */
  function openMappingModal(mapping) {
    var tables = mapping.tables || TimingDB.listTables(S.db);
    var cur = mapping.segments || {};
    var curSL = mapping.surahList || {};

    function options(table, selected, allowNull) {
      var t = null;
      tables.forEach(function (x) { if (x.name === table) t = x; });
      var cols = t ? t.cols : [];
      var h = allowNull ? '<option value="">— لا شيء —</option>' : '';
      cols.forEach(function (c) {
        h += '<option value="' + esc(c.name) + '"' + (c.name === selected ? ' selected' : '') + '>' +
          esc(c.name) + (c.type ? ' (' + esc(c.type) + ')' : '') + '</option>';
      });
      return h;
    }

    var tableOpts = tables.map(function (t) {
      return '<option value="' + esc(t.name) + '">' + esc(t.name) + ' (' + MushafLib.toArabicDigits(t.count) + ' صف)</option>';
    }).join('');

    var body =
      '<div class="map-hint">اختر الجدول والأعمدة الصحيحة، ثم اضغط <b>تطبيق</b>. ' +
      'يظهر أسفل النافذة نموذج من البيانات لمساعدتك.</div>' +
      '<div class="map-grid">' +
      '<div class="map-row"><label>جدول المقاطع</label><select id="mpTable">' + tableOpts + '</select></div>' +
      '<div class="map-row"><label>عمود السورة</label><select id="mpSura">' + options(cur.table, cur.sura, true) + '</select></div>' +
      '<div class="map-row"><label>عمود الآية</label><select id="mpAya">' + options(cur.table, cur.aya, true) + '</select></div>' +
      '<div class="map-row"><label>عمود الكلمة</label><select id="mpWord">' + options(cur.table, cur.word, true) + '</select></div>' +
      '<div class="map-row"><label>وقت البداية</label><select id="mpStart">' + options(cur.table, cur.start || cur.time, true) + '</select></div>' +
      '<div class="map-row"><label>وقت النهاية</label><select id="mpEnd">' + options(cur.table, cur.end, true) + '</select></div>' +
      '<div class="map-row"><label>جدول روابط السور</label><select id="mpSLTable"><option value="">— لا شيء —</option>' + tableOpts + '</select></div>' +
      '<div class="map-row"><label>رقم السورة فيه</label><select id="mpSLNo">' + options(curSL.table, curSL.no, true) + '</select></div>' +
      '<div class="map-row"><label>اسم السورة</label><select id="mpSLName">' + options(curSL.table, curSL.name, true) + '</select></div>' +
      '<div class="map-row"><label>رابط MP3</label><select id="mpSLUrl">' + options(curSL.table, curSL.url, true) + '</select></div>' +
      '<div class="map-row"><label>وحدة الوقت</label><select id="mpUnit">' +
        '<option value="auto">تلقائي</option><option value="ms">ميلي ثانية</option><option value="s">ثانية</option></select></div>' +
      '</div>' +
      '<div class="map-preview" id="mpPreview"></div>';

    showModal('مطابقة أعمدة قاعدة التوقيت', body, [
      { text: 'تطبيق', primary: true, onClick: function () {
        var m = {
          tables: tables,
          segments: {
            table: $('mpTable').value,
            sura: $('mpSura').value || null,
            aya: $('mpAya').value || null,
            word: $('mpWord').value || null,
            start: $('mpStart').value || null,
            end: $('mpEnd').value || null,
            time: null
          },
          surahList: $('mpSLTable').value ? {
            table: $('mpSLTable').value,
            no: $('mpSLNo').value || null,
            name: $('mpSLName').value || null,
            url: $('mpSLUrl').value || null,
            id: curSL.id || null,
            reciter: curSL.reciter || null
          } : null,
          unit: $('mpUnit').value
        };
        closeModal();
        applyMapping(m, false);
      } },
      { text: 'إلغاء', onClick: closeModal }
    ]);

    /* أحداث المعاينة */
    function refresh(tableSel, box) {
      var t = null;
      tables.forEach(function (x) { if (x.name === tableSel.value) t = x; });
      if (!t || !t.sample) { box.innerHTML = ''; return; }
      var h = '<table><tr>' + t.sample.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>';
      t.sample.rows.forEach(function (r) {
        h += '<tr>' + r.map(function (v) {
          var s = (v === null) ? 'NULL' : String(v);
          if (s.length > 28) s = s.slice(0, 28) + '…';
          return '<td>' + esc(s) + '</td>';
        }).join('') + '</tr>';
      });
      box.innerHTML = h + '</table>';
    }
    var prev = $('mpPreview');
    $('mpTable').value = cur.table || (tables[0] && tables[0].name);
    $('mpSLTable').value = curSL.table || '';
    if (!$('mpSura').value && $('mpTable').value) {
      fillRoles($('mpTable').value, ['mpSura', 'mpAya', 'mpWord', 'mpStart', 'mpEnd'],
                ['sura', 'aya', 'word', 'start', 'end']);
    }
    if ($('mpSLTable').value && !$('mpSLUrl').value) {
      fillRoles($('mpSLTable').value, ['mpSLNo', 'mpSLName', 'mpSLUrl'], ['no', 'name', 'urlx']);
    }
    function fillRoles(tableName, ids, keys) {
      var tbl = null;
      tables.forEach(function (x) { if (x.name === tableName) tbl = x; });
      var guess = TimingDB.guessColumns(tbl) || {};
      var slGuess = {};
      if (tbl) {
        slGuess.no = TimingDB.guessColumns === null ? null : null;
      }
      ids.forEach(function (id, i) {
        var key = keys[i];
        var val = guess[key] || '';
        if (key === 'no' && !val && tbl) {
          /* جدول الروابط: رقم السورة أو المعرّف */
          var n = null;
          tbl.cols.forEach(function (c) {
            if (!n && /sura|surah|chapter/i.test(c.name)) n = c.name;
          });
          if (!n) tbl.cols.forEach(function (c) { if (!n && /^id$/i.test(c.name)) n = c.name; });
          val = n || '';
        }
        if (key === 'name' && !val && tbl) {
          tbl.cols.forEach(function (c) { if (!val && /name|title|label/i.test(c.name)) val = c.name; });
        }
        if (key === 'urlx' && tbl) {
          val = '';
          tbl.cols.forEach(function (c) { if (!val && /url|link|mp3|file|path|audio|src/i.test(c.name)) val = c.name; });
        }
        $(id).innerHTML = options(tableName, val, true);
      });
    }
    $('mpTable').addEventListener('change', function () {
      fillRoles(this.value, ['mpSura', 'mpAya', 'mpWord', 'mpStart', 'mpEnd'],
                ['sura', 'aya', 'word', 'start', 'end']);
      refresh(this, prev);
    });
    $('mpSLTable').addEventListener('change', function () {
      if (!this.value) return;
      fillRoles(this.value, ['mpSLNo', 'mpSLName', 'mpSLUrl'], ['no', 'name', 'urlx']);
    });
    refresh($('mpTable'), prev);
  }

  /* ==================== النوافذ ==================== */
  function showModal(title, bodyHtml, buttons) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml;
    var foot = $('modalFoot');
    foot.innerHTML = '';
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' primary' : '');
      btn.textContent = b.text;
      btn.onclick = b.onClick;
      foot.appendChild(btn);
    });
    $('modal').classList.add('open');
    $('modal').setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    $('modal').classList.remove('open');
    $('modal').setAttribute('aria-hidden', 'true');
  }

  function openDrawer(tab) {
    $('drawer').classList.add('open');
    $('drawerBackdrop').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    if (tab) {
      $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tab); });
      $$('.tabpane').forEach(function (p) { p.classList.toggle('active', p.dataset.pane === tab); });
    }
  }
  function closeDrawer() {
    $('drawer').classList.remove('open');
    $('drawerBackdrop').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
  }

  /* ==================== الإعدادات ==================== */
  /* الخط الرقمي: مكدّس خطوط عربية شائعة في الأنظمة + إعادة تقطيع السطور بقياس فعلي */
  var DIGITAL_STACK = '"Noto Naskh Arabic", "Traditional Arabic", "Geeza Pro", "Al Bayan", "Segoe UI", Tahoma, Arial, sans-serif';

  function applySettings() {
    document.body.classList.toggle('theme-dark', !!S.settings.dark);
    document.body.classList.toggle('theme-light', !S.settings.dark);
    document.documentElement.style.setProperty('--hl-ayah', S.settings.colAyah);
    document.documentElement.style.setProperty('--hl-word', S.settings.colWord);
    document.documentElement.style.setProperty('--zoom', S.settings.zoom);
    var fam = (S.settings.font === 'Digital') ? DIGITAL_STACK
      : ("'" + S.settings.font + "', 'Amiri Quran', serif");
    document.documentElement.style.setProperty('--mushaf-font', fam);
    if (S.mushaf) S.mushaf.setReflow(S.settings.font === 'Digital' ? DIGITAL_STACK : null);
    $('setFont').value = S.settings.font;
    $('setZoom').value = S.settings.zoom;
    $('zoomVal').textContent = Math.round(S.settings.zoom * 100) + '%';
    $('setSpread').checked = !!S.settings.spread;
    $('setBasmala').checked = !!S.settings.basmalaLig;
    $('setHlAyah').checked = !!S.settings.hlAyah;
    $('setHlWord').checked = !!S.settings.hlWord;
    $('setAutoFlip').checked = !!S.settings.autoFlip;
    if ($('setAutoNext')) $('setAutoNext').checked = !!S.settings.autoNext;
    if (S.settings.playerHidden) setPlayerHidden(true);
    $('setClickSeek').checked = !!S.settings.clickSeek;
    $('setFrame').checked = !!S.settings.frame;
    $('setDark').checked = !!S.settings.dark;
    $('setColAyah').value = S.settings.colAyah;
    $('setColWord').value = S.settings.colWord;
    $('setUnit').value = S.settings.unit;
    $('setHlMode').value = S.settings.hlMode || 'text';
    document.body.dataset.hl = S.settings.hlMode || 'text';
    document.body.dataset.colored = (S.settings.font === 'Amiri Quran Colored') ? '1' : '0';
    if ($('setEdition')) $('setEdition').value = S.settings.edition || '1405';
    if ($('setMarker') && !$('setMarker').dataset.filled) fillMarkerList();
    else if ($('setMarker')) $('setMarker').value = S.settings.marker || '';
    if ($('setTajweed')) $('setTajweed').value = S.settings.tajweed || '';
    if ($('setSplit')) $('setSplit').checked = !!S.settings.splitDagger;
    $('setBasmalaInAyah').checked = (S.settings.basmalaInAyah === true);
    if ($('setRiwaya')) $('setRiwaya').value = S.settings.riwaya || 'hafs';
    if ($('setTimingRiwaya')) $('setTimingRiwaya').value = S.settings.timingRiwaya || 'auto';
  }

  function reloadFont(font) {
    S.settings.font = font;
    applySettings();
    saveSettings();
    $('bootSub').textContent = 'جارٍ تحميل رسم: ' + font + '…';
    $('boot').classList.remove('hide');
    var dbFont = (font === 'Digital') ? 'Hafs' : font;
    MushafLib.loadDB(dbFont).then(function (data) {
      var page = S.settings.page;
      S.mushaf = MushafLib.create(data, dbFont);
      S.mushaf.setReflow(font === 'Digital' ? DIGITAL_STACK : null);
      if (S.settings.riwaya === 'warsh') {          /* حفظ الرواية بعد تغيير الخط */
        S.mushaf.setRiwaya('warsh', S.warshData);
      }
      /* الحفاظ على طبعة المصحف بعد تغيير الخط */
      if (S.settings.edition === '1439') {
        return MushafLib.loadLayout().then(function (layout) {
          S.mushaf.useLayout(layout);
        }).catch(function () {});
      }
    }).then(function () {
      var page = S.settings.page;
      S.rendered = [];
      gotoPage(page, true);
      if (S.db) applyMapping(S.mapping || TimingDB.guessMapping(S.db), true);
      /* إعادة تطبيق زخارف الآيات والتجويد بعد إنشاء كائن الرسم الجديد */
      if (S.settings.marker) applyMarker(S.settings.marker);
      if (S.settings.tajweed) applyTajweedMode(S.settings.tajweed);
      /* الخط الجديد قد يكون لم يكتمل تحميله بعد: أعد الضبط عند الاكتمال */
      preloadFont(font).then(function () { if (S.mushaf) S.mushaf.rejustify(); });
      $('boot').classList.add('hide');
    }).catch(function (e) {
      $('boot').classList.add('hide');
      toast('تعذّر تحميل الرسم: ' + e.message, 'err');
    });
  }

  /* ==================== زخارف أرقام الآيات ==================== */
  function fillMarkerList() {
    var sel = $('setMarker');
    if (!sel) return;
    var set = S.markerAssets;
    if (!set) return;
    sel.dataset.filled = '1';
    set.markers.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.id;
      o.textContent = 'زخرفة ' + m.id.replace('-', ' — ');
      sel.appendChild(o);
    });
    sel.value = S.settings.marker || '';
  }

  function applyMarker(id) {
    S.settings.marker = id || '';
    saveSettings();
    var set = S.markerAssets;
    if (!S.mushaf) return;
    S.mushaf.markerSet = (set && S.settings.marker)
      ? { set: set, current: set.markers.filter(function (m) { return m.id === S.settings.marker; })[0] || null }
      : null;
    render();
  }

  /* ==================== تلوين التجويد ==================== */
  function buildTajweedKey(set) {
    var box = $('tajweedKey');
    if (!box || !set) return;
    var h = '<div class="tj-title">مفتاح الأحكام</div><div class="tj-grid">';
    set.rules.forEach(function (r) {
      h += '<span class="tj-item"><i style="background:' + r.c + '"></i>' + r.ar + '</span>';
    });
    h += '</div>';
    box.innerHTML = h;
    box.classList.toggle('hide', !S.settings.tajweed);
  }

  function applyTajweedMode(mode) {
    /* قواعد التجويد محسوبة على نصّ حفص: لا تُطبَّق مع رواية ورش */
    if (mode && S.settings.riwaya === 'warsh') {
      mode = '';
      if ($('setTajweed')) $('setTajweed').value = '';
      toast('تلوين التجويد موقوف مع رواية ورش (قواعده محسوبة على نصّ حفص)', 'ok', 3600);
    }
    S.settings.tajweed = mode || '';
    saveSettings();
    if ($('tajweedKey')) $('tajweedKey').classList.toggle('hide', !mode);
    if (!S.mushaf) return;
    if (!mode) {
      S.mushaf.tajweed = null;
      document.body.dataset.tj = '0';
      /* الخروج من الأحكام الملوّنة: رجوع إلى تلوين الخط */
      if (S.settings.hlMode === 'underline') {
        S.settings.hlMode = 'text';
        if ($('setHlMode')) $('setHlMode').value = 'text';
        saveSettings();
        applySettings();
      }
      render();
      return;
    }
    MushafLib.loadTajweed().then(function (set) {
      S.tajweedAssets = set;
      MushafLib.installTajweedCSS(set);
      buildTajweedKey(set);
      S.mushaf.tajweed = { on: true, words: set.words, code: set.code };
      document.body.dataset.tj = '1';
      /* مع أحكام التجويد الملوّنة: التمييز بالتسطير حتى تبقى ألوان الأحكام ظاهرة */
      if (S.settings.hlMode !== 'both' && S.settings.hlMode !== 'underline') {
        S.settings.hlMode = 'underline';
        if ($('setHlMode')) $('setHlMode').value = 'underline';
        saveSettings();
        applySettings();
      }
      render();
    }).catch(function (e) {
      toast('تعذّر تحميل بيانات التجويد: ' + (e.message || e), 'err', 4000);
      S.settings.tajweed = '';
      if ($('setTajweed')) $('setTajweed').value = '';
    });
  }

  /* ==================== طبعة المصحف ==================== */
  function applyEdition(ed) {
    ed = ed || '1405';
    if (ed === '1439' && !S.mushaf) return;
    if (ed === S.settings.edition && S.mushaf && (!!S.mushaf.layout) === (ed === '1439')) return;
    S.settings.edition = ed;
    saveSettings();
    if (ed !== '1439') {
      S.mushaf.useLayout(null);
      S.rendered = [];
      gotoPage(S.settings.page, true);
      return;
    }
    $('bootSub').textContent = 'جارٍ تحميل توزيع طبعة ١٤٣٩…';
    $('boot').classList.remove('hide');
    MushafLib.loadLayout().then(function (layout) {
      S.mushaf.useLayout(layout);
      S.rendered = [];
      gotoPage(S.settings.page, true);
      $('boot').classList.add('hide');
      toast('تم التحويل إلى توزيع طبعة ١٤٣٩ (النصّ الحقيقي محفوظ)', 'ok', 2200);
    }).catch(function (e) {
      $('boot').classList.add('hide');
      S.settings.edition = '1405';
      if ($('setEdition')) $('setEdition').value = '1405';
      toast('تعذّر تحميل توزيع ١٤٣٩: ' + e.message, 'err');
    });
  }

  /* ==================== الرواية (حفص / ورش) ==================== */
  function applyRiwaya(r) {
    r = (r === 'warsh') ? 'warsh' : 'hafs';
    if (!S.mushaf) { S.settings.riwaya = r; saveSettings(); return; }
    if (r === 'hafs') {
      S.mushaf.setRiwaya('hafs');
      S.settings.riwaya = 'hafs';
      saveSettings();
      S.rendered = [];
      gotoPage(S.settings.page, true);
      if (S.settings.tajweed) applyTajweedMode(S.settings.tajweed);
      if (S.db && S.mapping) applyMapping(S.mapping, true);   /* التوقيت يعود إلى ترقيم حفص */
      toast('الرواية: حفص عن عاصم', 'ok', 2200);
      return;
    }
    $('bootSub').textContent = 'جارٍ تحميل نصّ رواية ورش…';
    $('boot').classList.remove('hide');
    MushafLib.loadWarsh().then(function (data) {
      S.warshData = data;
      S.mushaf.setRiwaya('warsh', data);
      S.settings.riwaya = 'warsh';
      if (S.settings.tajweed) {
        S.settings.tajweed = '';
        if ($('setTajweed')) $('setTajweed').value = '';
        document.body.dataset.tj = '0';
        S.settings.hlMode = 'text';
        if ($('setHlMode')) $('setHlMode').value = 'text';
      }
      saveSettings();
      S.rendered = [];
      gotoPage(S.settings.page, true);
      $('boot').classList.add('hide');
      if (S.db && S.mapping) { S.warshProbeDone = true; applyMapping(S.mapping, true); }  /* ترقيم ورش ← مفاتيح المصحف */
      toast('الرواية: ورش عن نافع — نُصّ ورش على تخطيط المصحف نفسه', 'ok', 3000);
    }).catch(function (e) {
      $('boot').classList.add('hide');
      S.settings.riwaya = 'hafs';
      if ($('setRiwaya')) $('setRiwaya').value = 'hafs';
      toast('تعذّر تحميل نصّ ورش: ' + (e.message || e), 'err', 3600);
    });
  }

  /* ==================== الأحداث ==================== */
  function wire() {
    /* التنقل */
    $('prevPage').onclick = prevPage;
    $('nextPage').onclick = nextPage;
    if ($('followChip')) $('followChip').onclick = followRecitation;

    /* الشريط العلوي */
    $('btnLoadDb').onclick = function () { $('fileDb').click(); };
    $('fileDb').onchange = function () { loadDbFile(this.files[0]); this.value = ''; };
    $('btnSurahs').onclick = function () { openDrawer('surahs'); };
    $('btnSettings').onclick = function () { openDrawer('settings'); };
    $('btnHelp').onclick = function () { openDrawer('info'); };
    $('btnCloseDrawer').onclick = closeDrawer;
    $('drawerBackdrop').onclick = closeDrawer;
    $('btnTheme').onclick = function () { S.settings.dark = !S.settings.dark; applySettings(); saveSettings(); };
    $('btnFull').onclick = function () {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    };
    $('btnCloseModal').onclick = closeModal;
    $('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

    $$('.tab').forEach(function (t) {
      t.onclick = function () {
        $$('.tab').forEach(function (x) { x.classList.remove('active'); });
        $$('.tabpane').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        document.querySelector('.tabpane[data-pane="' + t.dataset.tab + '"]').classList.add('active');
      };
    });

    /* المشغّل */
    var P = S.player;
    $('btnPlay').onclick = function () {
      if (!P.src) { toast('اختر سورة من القائمة أو حمّل ملف MP3', 'err', 3200); openDrawer('surahs'); return; }
      P.toggle();
    };
    $('btnStop').onclick = function () { P.stop(); setActive(null, null, null); };
    $('btnPrevAyah').onclick = function () { P.prevAyah(); };
    $('btnNextAyah').onclick = function () { P.nextAyah(); };
    $('btnBack5').onclick = function () { P.nudge(-5000); };
    $('rate').onchange = function () { P.setRate(parseFloat(this.value)); };
    /* التكرار: أي تغيير في النمط أو العدد يُطبَّق فوراً من بداية الوحدة الحالية */
    function applyRepeat(notify) {
      var mode = $('repeatMode').value;
      var n = parseInt($('repeatCount').value, 10) || 1;
      var b = P.setRepeat(mode, n);
      if (mode === 'off') return;
      if (b && (P.time() < b.t0 || P.time() > b.t1 - 40)) P.seek(Math.max(0, b.t0));  /* ابدأ من رأس الوحدة */
      if (notify) toast('تكرار: ' + $('repeatMode').options[$('repeatMode').selectedIndex].text +
        (n > 1 ? ' (' + MushafLib.toArabicDigits(n) + ' مرات)' : ''), 'ok', 1800);
    }
    $('repeatMode').onchange = function () { applyRepeat(true); };
    $('repeatCount').onchange = function () { applyRepeat(true); };
    /* انتهاء العدد: أرجِع القائمة إلى «بدون» */
    P.onRepeatEnd = function () {
      var sel = $('repeatMode');
      if (sel) sel.value = 'off';
    };
    $('offset').oninput = function () {
      var v = parseInt(this.value, 10) || 0;
      S.player.setOffset(v);
      $('offsetVal').textContent = v > 0 ? '+' + v : String(v);
    };
    $('btnDownload').onclick = function () {
      if (!S.curSura) { toast('ابدأ تشغيل سورة أولاً', 'err'); return; }
      downloadSurah(S.curSura);
    };
    $('btnPickMp3').onclick = function () { $('fileMp3').click(); };
    if ($('btnOpenFolder')) $('btnOpenFolder').onclick = function () {
      var i = $('fileDir');
      if (!i) return;
      try { i.value = ''; } catch (e) { }
      i.click();
    };
    if ($('fileDir')) $('fileDir').onchange = function () {
      var files = this.files;
      if (files && files.length) handleAudioFiles(files);
      try { this.value = ''; } catch (e) { }
    };
    $('fileMp3').onchange = function () {
      var f = this.files[0];
      if (!f) return;
      var url = URL.createObjectURL(f);
      var guess = guessSuraFromName(f.name);
      S.curSura = guess || S.curSura || 1;
      S.player.load(url, { sura: S.curSura });
      S.player.setTiming(S.timing ? (S.timing.bySura.get(S.curSura) || null) : null);
      $('nowSrc').textContent = 'ملف: ' + f.name;
      S.srcKind = 'ملف: ' + f.name;
      gotoAyah(S.curSura, 1, true);
      buildTicks();
      S.player.play();
      if (!guess) toast('اختر السورة الصحيحة من القائمة لضبط التوقيت', 'ok', 3200);
      this.value = '';
    };
    $('btnPickUrl').onclick = function () {
      showModal('تشغيل من رابط مباشر',
        '<div class="map-grid">' +
        '<div class="map-row"><label>رابط MP3</label><input id="urlInput" style="width:100%;height:36px;border-radius:9px;border:1px solid var(--line);background:var(--glass-2);padding:0 10px" placeholder="https://…/001.mp3"></div>' +
        '<div class="map-row"><label>رقم السورة</label><input id="urlSura" type="number" min="1" max="114" value="' + (S.curSura || 1) + '" style="width:100%;height:36px;border-radius:9px;border:1px solid var(--line);background:var(--glass-2);padding:0 10px"></div>' +
        '</div>',
        [{ text: 'تشغيل', primary: true, onClick: function () {
          var u = $('urlInput').value.trim();
          var s = parseInt($('urlSura').value, 10) || 1;
          if (!u) return;
          closeModal();
          playSurah(s, { src: u, kind: 'رابط مباشر' });
        } }, { text: 'إلغاء', onClick: closeModal }]);
    };

    /* شريط التقدّم */
    var seek = $('seek'), dragging = false;
    function seekToEvent(e) {
      var r = seek.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      var ratio = 1 - Math.max(0, Math.min(1, x / r.width));   /* RTL */
      var dur = S.player.duration();
      if (dur) { S.player.seek(ratio * dur); }
    }
    seek.addEventListener('pointerdown', function (e) {
      dragging = true; seek.classList.add('dragging');
      seek.setPointerCapture && seek.setPointerCapture(e.pointerId);
      seekToEvent(e);
    });
    seek.addEventListener('pointermove', function (e) { if (dragging) seekToEvent(e); });
    seek.addEventListener('pointerup', function (e) { dragging = false; seek.classList.remove('dragging'); });
    seek.addEventListener('pointercancel', function () { dragging = false; seek.classList.remove('dragging'); });

    /* النقر على كلمة: إن كانت من سورة أخرى شغّل تلك السورة ثم انتقل إلى الكلمة */
    $('book').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.w') : null;
      if (!el || !el.dataset.k) return;
      var p = el.dataset.k.split(':');
      var s = +p[0], a = +p[1], wd = +p[2] || 0;
      if (!S.settings.clickSeek) return;
      S.detached = false;   /* النقر على كلمة يعني: تابع من هنا */
      updateFollowChip();
      if (S.player.src && S.curSura === s) { S.player.seekWord(s, a, wd); return; }
      var row = findRow(s);
      var has = S.localFiles.has(s) || (row && row.url);
      if (!has) {
        setActive(s, a, wd || null);
        toast('لا يوجد صوت لهذه السورة — استخدم «فتح مجلد الصوت» أو «ملف محلي»', 'err', 3200);
        return;
      }
      setActive(s, a, wd || null);   /* إضاءة فورية ريثما يُحمّل الصوت */
      playSurah(s, { keepPage: true, seekTo: [a, wd] });
    });

    /* قائمة السور */
    $('surahList').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var item = btn.closest('.surah-item');
      var no = +item.dataset.no;
      var act = btn.dataset.act;
      if (act === 'go') { gotoAyah(no, 1, true); markManual(); closeDrawer(); }
      else if (act === 'play') { playSurah(no); markPlayingRow(no); }
      else if (act === 'dl') downloadSurah(no);
    });
    $('surahSearch').addEventListener('input', function () { filterSurahs(this.value); });
    $('btnDownloadAll').onclick = function () {
      var rows = (S.timing ? S.timing.surahs : []).filter(function (r) { return r.url; });
      if (!rows.length) { toast('لا توجد روابط في القاعدة', 'err'); return; }
      if (!confirm('تنزيل ' + rows.length + ' ملف صوتي؟ قد يستغرق وقتاً طويلاً.')) return;
      var i = 0;
      (function step() {
        if (i >= rows.length) { toast('اكتمل تنزيل ' + rows.length + ' ملف', 'ok', 4000); return; }
        var r = rows[i++];
        $('nowSrc').textContent = 'تنزيل ' + i + '/' + rows.length;
        downloadSurah(+r.no, r, true).then(step);
      })();
    };

    /* الإعدادات */
    $('setFont').onchange = function () { reloadFont(this.value); };
    $('setEdition').onchange = function () { applyEdition(this.value); };
    if ($('setRiwaya')) $('setRiwaya').onchange = function () { applyRiwaya(this.value); };
    $('setMarker').onchange = function () { applyMarker(this.value); };
    $('setTajweed').onchange = function () { applyTajweedMode(this.value); };
    if ($('btnQuickSet')) $('btnQuickSet').onclick = function () { openDrawer('settings'); };
    if ($('btnHidePlayer')) $('btnHidePlayer').onclick = function () {
      setPlayerHidden(true);
      toast('أُخفي شريط التشغيل — الزر العائم (⌃) يُظهره', 'ok', 2600);
    };
    if ($('btnShowPlayer')) $('btnShowPlayer').onclick = function () { setPlayerHidden(false); };
    if ($('btnQuickSetH')) $('btnQuickSetH').onclick = function () { openDrawer('settings'); };
    if ($('btnHideUI')) $('btnHideUI').onclick = function () { setUiHidden(true); };
    if ($('btnShowUI')) $('btnShowUI').onclick = function () { setUiHidden(false); };

    /* نقر على اسم السورة / الجزء / رقم الصفحة داخل الصفحة */
    $('book').addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-jump]') : null;
      if (t) { openJump(t.dataset.jump); return; }
    });

    /* في وضع إخفاء الواجهة: أي نقرة على المسرح تُظهر أزرار التحكم بالصوت ٥ ثوان */
    var showPlayerTimer = null;
    $('stage').addEventListener('click', function () {
      if (!S.uiHidden) return;
      document.body.classList.add('show-player');
      clearTimeout(showPlayerTimer);
      showPlayerTimer = setTimeout(function () { document.body.classList.remove('show-player'); }, 5000);
    });

    /* ملف الإعدادات */
    if ($('btnExportSet')) $('btnExportSet').onclick = exportSettings;
    if ($('btnImportSet')) $('btnImportSet').onclick = function () { $('fileSet').click(); };
    if ($('fileSet')) $('fileSet').onchange = function () {
      if (this.files && this.files[0]) importSettings(this.files[0]);
      this.value = '';
    };
    $('setZoom').oninput = function () {
      S.settings.zoom = parseFloat(this.value);
      $('zoomVal').textContent = Math.round(S.settings.zoom * 100) + '%';
      document.documentElement.style.setProperty('--zoom', S.settings.zoom);
      var w = ((S.rendered.length > 1 ? 612 : 306) * S.settings.zoom + 48);
      $('stageScroll').style.width = 'min(100%, ' + Math.round(w) + 'px)';
      saveSettings();
    };
    $('setSpread').onchange = function () { S.settings.spread = this.checked; saveSettings(); gotoPage(S.settings.page, true); };
    $('setBasmala').onchange = function () { S.settings.basmalaLig = this.checked; saveSettings(); render(); };
    $('setFrame').onchange = function () { S.settings.frame = this.checked; saveSettings(); render(); };
    $('setHlMode').onchange = function () {
      S.settings.hlMode = this.value;
      document.body.dataset.hl = this.value;
      saveSettings(); applyHighlight(true);
    };
    $('setHlAyah').onchange = function () { S.settings.hlAyah = this.checked; saveSettings(); applyHighlight(true); };
    $('setHlWord').onchange = function () { S.settings.hlWord = this.checked; saveSettings(); applyHighlight(true); };
    $('setAutoFlip').onchange = function () { S.settings.autoFlip = this.checked; saveSettings(); };
    if ($('setAutoNext')) $('setAutoNext').onchange = function () { S.settings.autoNext = this.checked; saveSettings(); };
    $('setClickSeek').onchange = function () { S.settings.clickSeek = this.checked; saveSettings(); };
    $('setDark').onchange = function () { S.settings.dark = this.checked; applySettings(); saveSettings(); };
    $('setColAyah').oninput = function () { S.settings.colAyah = this.value; document.documentElement.style.setProperty('--hl-ayah', this.value); saveSettings(); };
    $('setColWord').oninput = function () { S.settings.colWord = this.value; document.documentElement.style.setProperty('--hl-word', this.value); saveSettings(); };
    $('setUnit').onchange = function () {
      S.settings.unit = this.value; saveSettings();
      if (S.db) applyMapping(S.mapping, false);
    };
    if ($('setSplit')) $('setSplit').onchange = function () {
      S.settings.splitDagger = this.checked; saveSettings(); render();
      if (S.db) applyMapping(S.mapping, false);
    };
    $('setBasmalaInAyah').onchange = function () {
      S.settings.basmalaInAyah = this.checked ? true : false; saveSettings();
      if (S.db) applyMapping(S.mapping, false);
    };
    if ($('setTimingRiwaya')) $('setTimingRiwaya').onchange = function () {
      S.settings.timingRiwaya = this.value; S.warshProbeDone = false; saveSettings();
      if (!S.db) { toast('حمّل ملف التوقيت أولاً ثم اختر ترقيم آياته', 'ok', 2800); return; }
      applyMapping(S.mapping || TimingDB.guessMapping(S.db), true);
      toast('ترقيم ملف التوقيت: ' + ({ auto: 'تلقائي', warsh: 'ورش — يُحوَّل إلى مفاتيح المصحف',
        hafs: 'حفص — بلا تحويل' })[this.value], 'ok', 3400);
    };
    $('btnRemap').onclick = function () { openMappingModal(S.mapping || TimingDB.guessMapping(S.db)); };
    $('btnClearCache').onclick = function () {
      Cache.clear().then(function () { toast('تم حذف الملفات المخزّنة', 'ok'); });
    };

    /* السحب والإفلات */
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (/\.(db|sqlite|sqlite3|db3)$/i.test(f.name)) loadDbFile(f);
      else {
        var all = e.dataTransfer.files || [];
        var audio = Array.prototype.slice.call(all).filter(function (x) { return AUDIO_EXT.test(x.name); });
        if (audio.length > 1) handleAudioFiles(all);
        else if (audio.length === 1) {
          $('fileMp3').files = all;
          $('fileMp3').dispatchEvent(new Event('change'));
        }
      }
    });

    /* إخفاء الواجهة للقراءة الصامتة */
    /* إخفاء/إظهار الواجهة بالكامل + ملء الشاشة بأكبر قياس بلا تمرير */
    function toggleChrome() { setUiHidden(!S.uiHidden); }

    /* لوحة المفاتيح */
    window.addEventListener('resize', function () { if (S.uiHidden) fitZoom(); });
    window.addEventListener('keydown', function (e) {
      if (/input|select|textarea/i.test((e.target.tagName || ''))) return;
      var k = e.key;
      if (k === ' ') { e.preventDefault(); if (S.player.src) S.player.toggle(); }
      else if (k === 'ArrowRight') { e.preventDefault(); S.player.prevAyah(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); S.player.nextAyah(); }
      else if (k === 'ArrowUp') { e.preventDefault(); prevPage(); }
      else if (k === 'ArrowDown') { e.preventDefault(); nextPage(); }
      else if (k === 'PageUp') { e.preventDefault(); prevPage(); }
      else if (k === 'PageDown') { e.preventDefault(); nextPage(); }
      else if ((k === '+' || k === '=')) { var r = Math.min(2, S.player.rate + 0.25); S.player.setRate(r); $('rate').value = String(r); }
      else if (k === '-') { var r2 = Math.max(0.5, S.player.rate - 0.25); S.player.setRate(r2); $('rate').value = String(r2); }
      else if (k === 'r' || k === 'R') {
        var sel = $('repeatMode');
        sel.value = (sel.value === 'ayah') ? 'off' : 'ayah';
        sel.dispatchEvent(new Event('change'));
      }
      else if (k === 'n' || k === 'N') { S.settings.dark = !S.settings.dark; applySettings(); saveSettings(); }
      else if (k === 'f' || k === 'F') { $('btnFull').click(); }
      else if (k === 'h' || k === 'H') { toggleChrome(); }
      else if (k === 's' || k === 'S') { openDrawer('surahs'); }
      else if (k === 'Escape') { if (S.uiHidden) setUiHidden(false); else { closeModal(); closeDrawer(); } }
    });
  }

  /* ==================== الإقلاع ==================== */
  /* اطلب تحميل خط المصحف صراحةً وانتظره: document.fonts.ready قد ينتهي قبل أن يبدأ الطلب
     (font-display:swap)، فتُقاس السطور بخط بديل ويضيع الضبط. */
  function preloadFont(family) {
    var p = Promise.resolve();
    if (document.fonts && document.fonts.load) {
      try { p = document.fonts.load('16px "' + family + '"').catch(function () { }); } catch (e) { }
    }
    return p.then(function () {
      if (document.fonts && document.fonts.ready) return document.fonts.ready;
    }).catch(function () { });
  }

  /* ==================== التكبير وإخفاء الواجهة ==================== */
  function setZoom(z) {
    z = Math.max(0.3, Math.min(4, z));
    S.settings.zoom = z;
    if ($('setZoom')) $('setZoom').value = z;
    if ($('zoomVal')) $('zoomVal').textContent = Math.round(z * 100) + '%';
    document.documentElement.style.setProperty('--zoom', z);
    var w = ((S.rendered && S.rendered.length > 1 ? 612 : 306) * z + 48);
    if ($('stageScroll')) $('stageScroll').style.width = 'min(100%, ' + Math.round(w) + 'px)';
    saveSettings();
  }
  /* تكبير يملأ الشاشة بلا تمرير */
  function fitZoom() {
    var stage = $('stage'), book = $('book');
    if (!stage || !book) return;
    var pgs = book.querySelectorAll('.mushaf-page');
    if (!pgs.length) return;
    var natW = 0, natH = 0;
    pgs.forEach(function (pg) { natW += pg.offsetWidth; natH = Math.max(natH, pg.offsetHeight); });
    natW += (pgs.length - 1) * 12 + 10;   /* فراغ بين الصفحتين وهوامش */
    natH += 8;
    if (!natW || !natH) return;
    var cs = getComputedStyle(stage);
    var availW = stage.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 6;
    var availH = stage.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - 6;
    var z = Math.min(availW / natW, availH / natH);
    setZoom(z);
  }
  /* إخفاء/إظهار شريط التشغيل وحده (يبقى المصحف بكامل الشاشة) */
  function setPlayerHidden(on) {
    S.settings.playerHidden = !!on;
    document.body.classList.toggle('player-hidden', !!on);
    var pl = $('player');
    if (pl) pl.classList.toggle('hidden', !!on);
    var b = $('btnShowPlayer');
    if (b) b.hidden = !on;
    saveSettings();
    if (S.uiHidden) requestAnimationFrame(function () { requestAnimationFrame(fitZoom); });
  }

  function setUiHidden(on) {
    S.uiHidden = !!on;
    document.body.classList.toggle('ui-hidden', S.uiHidden);
    var b = $('hiddenBar');
    if (b) b.hidden = !S.uiHidden;
    if (!$('hiddenBar') && $('btnShowUI')) $('btnShowUI').hidden = !S.uiHidden;
    if (S.uiHidden) {
      S.zoomBefore = S.settings.zoom;
      /* بعد إطارين: يكون التخطيط الجديد (اختفاء الشريطين) قد استقرّ */
      requestAnimationFrame(function () { requestAnimationFrame(fitZoom); });
      try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch (e) { }
      toast('الواجهة مخفية — H أو Esc للإظهار، ومسافة/أسهم للتنقّل', 'ok', 2600);
    } else {
      if (S.zoomBefore) setZoom(S.zoomBefore);
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { }
    }
  }


  /* ==================== تنقّل سريع: اسم السورة / الجزء / رقم الصفحة ==================== */
  function jumpGridHtml(kind, cur) {
    var out = [];
    if (kind === 'sura') {
      for (var i = 1; i <= 114; i++) {
        var nm = S.mushaf ? S.mushaf.suraName(i) : ('سورة ' + i);
        out.push('<button type="button" class="jcell' + (i === cur ? ' on' : '') + '" data-s="' + i + '">' +
          '<b>' + MushafLib.toArabicDigits(i) + '</b><span>' + nm + '</span></button>');
      }
    } else if (kind === 'juz') {
      for (var j = 1; j <= 30; j++) {
        out.push('<button type="button" class="jcell sq' + (j === cur ? ' on' : '') + '" data-j="' + j + '">' +
          '<b>' + MushafLib.toArabicDigits(j) + '</b></button>');
      }
    } else {
      for (var p2 = 1; p2 <= 604; p2++) {
        out.push('<button type="button" class="jcell pg' + (p2 === cur ? ' on' : '') + '" data-p="' + p2 + '">' +
          MushafLib.toArabicDigits(p2) + '</button>');
      }
    }
    return out.join('');
  }

  function jumpSura(cur) {
    showModal('اختر سورة (تُنتقى وتُشغَّل)',
      '<div class="jump-wrap"><input id="jumpFind" class="jump-find" type="text" placeholder="ابحث باسم السورة…">' +
      '<div class="jump-grid sura" id="jumpGrid">' + jumpGridHtml('sura', cur) + '</div></div>',
      [{ text: 'إغلاق', onClick: closeModal }]);
    var inp = $('jumpFind');
    if (inp) inp.oninput = function () {
      var q = this.value.trim();
      Array.prototype.forEach.call($('jumpGrid').children, function (c) {
        c.style.display = (!q || c.textContent.indexOf(q) >= 0) ? '' : 'none';
      });
    };
    $('jumpGrid').onclick = function (e) {
      var b = e.target.closest('[data-s]');
      if (!b) return;
      var n = parseInt(b.dataset.s, 10);
      closeModal();
      gotoAyah(n, 1);
      try { playSurah(n); } catch (err) { }
      toast('سورة ' + (S.mushaf ? S.mushaf.suraName(n) : n), 'ok', 2200);
    };
  }

  function jumpJuz(cur) {
    showModal('اختر جزءاً', '<div class="jump-grid juz" id="jumpGrid">' + jumpGridHtml('juz', cur) + '</div>',
      [{ text: 'إغلاق', onClick: closeModal }]);
    $('jumpGrid').onclick = function (e) {
      var b = e.target.closest('[data-j]');
      if (!b) return;
      var j = parseInt(b.dataset.j, 10);
      closeModal();
      gotoPage(MushafLib.JUZ_PAGES[j - 1] || 1);
    };
  }

  function jumpPage(cur) {
    showModal('اذهب إلى صفحة',
      '<div class="jump-wrap"><div class="jump-row"><input id="jumpNum" class="jump-find" type="number" min="1" max="604" value="' +
      cur + '"><button class="btn primary" id="jumpGo">اذهب</button></div>' +
      '<div class="jump-grid pages" id="jumpGrid">' + jumpGridHtml('page', cur) + '</div></div>',
      [{ text: 'إغلاق', onClick: closeModal }]);
    function go(v) {
      v = parseInt(v, 10);
      if (!(v >= 1 && v <= 604)) return;
      closeModal();
      gotoPage(v);
    }
    $('jumpGo').onclick = function () { go($('jumpNum').value); };
    $('jumpNum').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go(this.value); } };
    $('jumpGrid').onclick = function (e) {
      var b = e.target.closest('[data-p]');
      if (b) go(b.dataset.p);
    };
    var on = $('jumpGrid').querySelector('.jcell.on');
    if (on) setTimeout(function () { on.scrollIntoView({ block: 'center' }); }, 60);
  }

  function openJump(spec) {
    var pr = String(spec).split(':');
    var kind = pr[0], val = parseInt(pr[1], 10) || 1;
    if (kind === 'sura') jumpSura(val);
    else if (kind === 'juz') jumpJuz(val);
    else if (kind === 'page') jumpPage(val);
  }

  /* ==================== ملف الإعدادات ==================== */
  function exportSettings() {
    try {
      var o = { __app: 'quran-mushaf', __v: SETTINGS_V };
      for (var k in S.settings) o[k] = S.settings[k];
      var blob = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'mushaf-settings.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('حُفظت الإعدادات في ملف mushaf-settings.json', 'ok', 3200);
    } catch (e) { toast('تعذّر الحفظ: ' + e.message, 'err'); }
  }

  function importSettings(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var j = null;
      try { j = JSON.parse(fr.result); } catch (e) { j = null; }
      if (!j || typeof j !== 'object') { toast('ملف الإعدادات غير صالح', 'err'); return; }
      var n = 0;
      Object.keys(j).forEach(function (k) {
        if (S.settings.hasOwnProperty(k)) { S.settings[k] = j[k]; n++; }
      });
      saveSettings();
      applySettings();
      gotoPage(S.settings.page || 1, true);
      updateHud();
      toast('اسْتُوردت الإعدادات (' + n + ' بنداً)', 'ok', 3200);
    };
    fr.onerror = function () { toast('تعذّر قراءة الملف', 'err'); };
    fr.readAsText(file);
  }

  function boot() {
    loadSettings();
    S.player = new Player();
    S.player.onTick = playerTick;
    S.player.onState = function (st) {
      $('icPlay').style.display = (st === 'playing') ? 'none' : '';
      $('icPause').style.display = (st === 'playing') ? '' : 'none';
      if (st === 'loading') $('nowSrc').textContent = 'جارٍ التحميل…';
      else if (S.srcKind) $('nowSrc').textContent = S.srcKind;
    };
    S.player.onError = function (m) { toast('خطأ في الصوت: ' + m, 'err', 4200); };
    S.player.onEnded = function () {
      setActive(null, null, null);
      /* متابعة التشغيل إلى السورة التالية */
      if (S.settings.autoNext && S.curSura && S.curSura >= 1 && S.curSura < 114) {
        var nx = nextPlayable(S.curSura);
        if (!nx) { toast('لا يوجد صوت متاح للسور التالية', 'ok', 2800); return; }
        setTimeout(function () {
          try { playSurah(nx); toast('الانتقال إلى ' + suraLabel(nx), 'ok', 2600); }
          catch (e) { toast('تعذّر تشغيل السورة التالية', 'err'); }
        }, 500);
      }
    };

    applySettings();
    wire();

    var bar = $('bootBar');
    var step = function (p, txt) {
      bar.style.width = p + '%';
      if (txt) $('bootSub').textContent = txt;
    };
    step(12, 'جارٍ تحميل رسم مصحف المدينة…');

    MushafLib.loadDB(S.settings.font).then(function (data) {
      step(55, 'جارٍ تهيئة الصفحات…');
      S.mushaf = MushafLib.create(data, S.settings.font);
      return MushafLib.loadSuraFrame();
    }).then(function (frameUrl) {
      step(70, 'جارٍ تحميل الخط…');
      if (frameUrl) document.documentElement.style.setProperty('--sura-frame', frameUrl);
      if (S.settings.edition === '1439') {
        step(78, 'جارٍ تحميل توزيع طبعة ١٤٣٩…');
        return MushafLib.loadLayout().then(function (layout) {
          S.mushaf.useLayout(layout);
        }).catch(function () {
          S.settings.edition = '1405';
          if ($('setEdition')) $('setEdition').value = '1405';
        });
      }
    }).then(function () {
      step(90, 'جارٍ تحميل الخط…');
      /* الرواية المحفوظة: ورش تُحمَّل قبل أول رسم */
      if (S.settings.riwaya === 'warsh') {
        return MushafLib.loadWarsh().then(function (d) {
          S.warshData = d;
          S.mushaf.setRiwaya('warsh', d);
        }).catch(function () {
          S.settings.riwaya = 'hafs';
          if ($('setRiwaya')) $('setRiwaya').value = 'hafs';
        }).then(function () {
          return preloadFont(S.settings.font);
        });
      }
      return preloadFont(S.settings.font);
    }).then(function () {
      step(95, 'جارٍ الرسم…');
      gotoPage(S.settings.page || 1, true);
      buildSurahList();
      MushafLib.loadTajweed().then(function (set) {
        S.tajweedAssets = set;
        MushafLib.installTajweedCSS(set);
        buildTajweedKey(set);
        if (S.settings.tajweed) applyTajweedMode(S.settings.tajweed);
      }).catch(function () { });
      MushafLib.loadAyahMarkers().then(function (set) {
        S.markerAssets = set;
        fillMarkerList();
        if (S.settings.marker) applyMarker(S.settings.marker);
        else document.body.dataset.mk = '0';
      }).catch(function () { /* الزخارف اختيارية */ });
      step(100, 'جاهز');
      setTimeout(function () { $('boot').classList.add('hide'); }, 260);
      if (!S.db) setTimeout(function () {
        toast('حمّل قاعدة التوقيت timings.db لبدء المتابعة', 'ok', 4200);
      }, 900);
    }).catch(function (e) {
      $('bootSub').textContent = 'خطأ: ' + (e.message || e);
      toast('تعذّر التحميل: ' + (e.message || e), 'err', 6000);
    });

    /* واجهة اختيارية للتصحيح والاستخدام المتقدّم */
    window.QM = {
      state: S,
      gotoPage: gotoPage,
      gotoAyah: gotoAyah,
      render: render,
      playSurah: playSurah,
      get player() { return S.player; },
      get mushaf() { return S.mushaf; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
