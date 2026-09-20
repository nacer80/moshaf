/* ============================================================
   timingdb.js — قراءة قاعدة بيانات التوقيت (SQLite) داخل المتصفح
   - يكتشف الجداول والأعمدة تلقائياً (surah_list / segments)
   - يحوّل الأزمنة إلى ميلي ثانية
   - يطابق ترقيم الكلمات مع رسم المصحف (البسملة، الأساس 0 أو 1)
   ============================================================ */
(function (global) {
  'use strict';

  var SQL = null, initPromise = null;

  /* ---------- تهيئة sql.js ---------- */
  function initSql() {
    if (initPromise) return initPromise;
    initPromise = new Promise(function (resolve, reject) {
      function go(cfg) {
        try {
          global.initSqlJs(cfg).then(function (S) { SQL = S; resolve(S); })
            .catch(function (e) { reject(e); });
        } catch (e) { reject(e); }
      }
      if (global.initSqlJs) {
        var A = global.Assets || {};
        if (A.sqlWasmB64) {
          go({ wasmBinary: b64ToU8(A.sqlWasmB64) });
        } else {
          fetch('assets/sql-wasm.wasm')
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (b) { go({ wasmBinary: new Uint8Array(b) }); })
            .catch(function () { go({}); });
        }
      } else {
        reject(new Error('تعذّر تحميل sql.js'));
      }
    });
    return initPromise;
  }

  function b64ToU8(b64) {
    var bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function openDb(buf) {
    return initSql().then(function (S) { return new S.Database(new Uint8Array(buf)); });
  }

  /* ---------- استكشاف المخطط ---------- */
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function listTables(db) {
    var res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    var out = [];
    if (!res.length) return out;
    res[0].values.forEach(function (row) {
      var name = row[0];
      var cols = [];
      try {
        var c = db.exec('PRAGMA table_info("' + name.replace(/"/g, '""') + '")');
        if (c.length) c[0].values.forEach(function (r) { cols.push({ name: r[1], type: r[2] || '' }); });
      } catch (e) { /* تجاهل */ }
      var n = 0;
      try { var q = db.exec('SELECT COUNT(*) FROM "' + name.replace(/"/g, '""') + '"'); if (q.length) n = q[0].values[0][0]; } catch (e) { }
      var sample = [];
      try {
        var s = db.exec('SELECT * FROM "' + name.replace(/"/g, '""') + '" LIMIT 5');
        if (s.length) sample = { cols: s[0].columns, rows: s[0].values };
      } catch (e) { }
      out.push({ name: name, cols: cols, count: n, sample: sample, norm: norm(name) });
    });
    return out;
  }

  var PATTERNS = {
    suraNo: ['surahno', 'suranumber', 'surano', 'suranumber', 'surah', 'sura', 'soura', 'chapter', 'chapterid', 'chapter no', 'suraid', 'surahid', 'suraidx', 'suraindex', 's'],
    ayaNo:  ['ayano', 'ayahno', 'ayanumber', 'ayahnumber', 'aya', 'ayah', 'verse', 'verseid', 'verseno', 'ayat', 'ayatno', 'a'],
    wordNo: ['wordno', 'wordindex', 'wordidx', 'wordid', 'word', 'kalima', 'w', 'wordnumber', 'index', 'idx', 'segment', 'segmentno', 'wordposition', 'position'],
    start:  ['timestampfrom', 'timefrom', 'fromtime', 'starttime', 'startms', 'startsec', 'start', 'begin', 'from', 't0', 'timestart', 'st', 'beginning', 'startat'],
    end:    ['timestampto', 'timeto', 'totime', 'endtime', 'endms', 'endsec', 'end', 'finish', 'to', 't1', 'timeend', 'en', 'stop', 'endat'],
    time:   ['time', 'timestamp', 't', 'at'],
    url:    ['url', 'link', 'mp3', 'file', 'path', 'audio', 'src', 'audiourl', 'fileurl', 'filepath', 'download'],
    name:   ['name', 'title', 'surahname', 'suraname', 'arabicname', 'label', 'surat'],
    reciter:['reciter', 'reader', 'qari', 'sheikh', 'voice'],
    id:     ['id', 'rowid', 'surahid', 'suraid', 'sid']
  };

  function pick(cols, patterns, exclude) {
    var best = null, bestScore = 1e9;
    for (var i = 0; i < cols.length; i++) {
      var n = norm(cols[i].name);
      if (!n) continue;
      if (exclude && exclude.indexOf(cols[i].name) >= 0) continue;
      var idx = patterns.indexOf(n);
      if (idx >= 0 && idx < bestScore) { best = cols[i].name; bestScore = idx; continue; }
      for (var p = 0; p < patterns.length; p++) {
        if (p >= bestScore) break;
        if (n.indexOf(patterns[p]) === 0 || (n.length > 2 && n.indexOf(patterns[p]) >= 0 && patterns[p].length >= 5)) {
          best = cols[i].name; bestScore = p + 0.5; break;
        }
      }
    }
    return best;
  }

  function findTable(tables, keys) {
    for (var k = 0; k < keys.length; k++) {
      for (var i = 0; i < tables.length; i++) {
        if (tables[i].norm.indexOf(keys[k]) >= 0) return tables[i];
      }
    }
    return null;
  }

  /* يخمّن أدوار الأعمدة لجدول بعينه (يُستخدم عند اختيار الجدول يدوياً) */
  function guessColumns(tbl, db) {
    if (!tbl) return null;
    var start = pick(tbl.cols, PATTERNS.start);
    var end = pick(tbl.cols, PATTERNS.end);
    var time = pick(tbl.cols, PATTERNS.time, [start, end]);
    var packed = detectPacked(tbl, db);
    var used = [start, end, time, packed].filter(Boolean);
    return {
      table: tbl.name,
      sura: pick(tbl.cols, PATTERNS.suraNo),
      aya: pick(tbl.cols, PATTERNS.ayaNo),
      word: pick(tbl.cols, PATTERNS.wordNo, used),
      start: start,
      end: end,
      time: time,
      packed: packed
    };
  }

  function guessMapping(db) {
    var tables = listTables(db);
    var sl = findTable(tables, ['surahlist', 'suralist', 'surahs', 'suras', 'soar', 'chapters', 'playlist', 'files', 'audio']) ||
      findTable(tables, ['surah', 'sura']);
    var sg = findTable(tables, ['segments', 'segment', 'timing', 'timings', 'word', 'words', 'ayas', 'ayat', 'verses']) ||
      (tables.length ? tables[tables.length - 1] : null);

    var m = { tables: tables, surahList: null, segments: null, unit: 'auto', basmalaInAyah: 'auto' };

    if (sl) {
      m.surahList = {
        table: sl.name,
        no: pick(sl.cols, PATTERNS.suraNo) || pick(sl.cols, PATTERNS.id),
        name: pick(sl.cols, PATTERNS.name),
        url: pick(sl.cols, PATTERNS.url),
        id: pick(sl.cols, PATTERNS.id),
        reciter: pick(sl.cols, PATTERNS.reciter)
      };
    }
    if (sg) m.segments = guessColumns(sg, db);
    /* إن لم يوفّر الجدول المختار توقيت الكلمات (لا عمود مقاطع ولا عمود كلمة)،
       جرّب بقية الجداول: فبعض القواعد تفصل جدول words عن جدول segments.      */
    if (m.segments && !m.segments.packed && !m.segments.word) {
      for (var i = 0; i < tables.length; i++) {
        var t2 = tables[i];
        if (t2 === sg || !t2.cols) continue;
        var g2 = guessColumns(t2, db);
        if (g2 && (g2.packed || g2.word) && g2.sura && g2.aya) {
          m.altTable = sg.name; m.segments = g2; break;
        }
      }
    }
    return m;
  }

  /* ---------- العمود «المضغوط»: توقيت الكلمات داخل عمود واحد ----------
     صيغه المدعومة:
       [[1,13400,14240],[2,14240,15070]]        مصفوفة JSON (صيغة جدول segments)
       [[1,13400,14240], …] بأقباس مفردة أو مسافات
       {"words":[[1,13400,14240]]} أو [{"word":1,"start":..,"end":..}]
       "1:13400:14240,2:14240:15070"   و "14240:15070,…" (بلا أرقام كلمات)
     وقد يكون العمود BLOB (بايتات) لا نصاً — يُفكّ ترميزه هنا.                */
  function asText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v && typeof v.length === 'number' && typeof v !== 'string') {     /* Uint8Array/BLOB */
      try { if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(v); } catch (e) { }
      try {
        var o = '';
        for (var i = 0; i < v.length && i < 8000; i++) o += String.fromCharCode(v[i]);
        return o;
      } catch (e2) { }
    }
    try { return JSON.stringify(v); } catch (e3) { return String(v); }
  }
  function tryJSON(t) {
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }
  /* يفكّ قيمة إلى قائمة {w,t0,t1} أو يعيد null إن لم تكن مقاطع كلمات */
  function parsePacked(v) {
    if (v === null || v === undefined || v === '') return null;
    /* مصفوفة بايتات (BLOB في SQLite) → نص أولاً ثم تُفكّ */
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.length === 'number') v = asText(v);
    var arr = null;
    if (Array.isArray(v)) arr = v;
    else if (v && typeof v === 'object') {
      for (var kk in v) { if (Array.isArray(v[kk])) { arr = v[kk]; break; } }   /* {"words":[…]} */
      if (!arr) arr = [v];                                                       /* كائن واحد */
    } else {
      var t = asText(v).trim();
      if (!t) return null;
      arr = (t.charAt(0) === '[' || t.charAt(0) === '{') ? tryJSON(t) : null;
      if (!arr) {
        var u = t.replace(/[\s']/g, function (c) { return c === "'" ? '"' : ''; });
        arr = (u.charAt(0) === '[' || u.charAt(0) === '{') ? tryJSON(u) : null;
      }
      if (!arr) {                                   /* أرقام متتابعة بلا أقواس */
        arr = [];
        var m, re3 = /(-?[\d.]+)\s*[:,]\s*(-?[\d.]+)\s*[:,]\s*(-?[\d.]+)/g;
        while ((m = re3.exec(t))) arr.push([+m[1], +m[2], +m[3]]);
        if (!arr.length) {
          var n = 0, re2 = /(-?[\d.]+)\s*[:,]\s*(-?[\d.]+)/g;
          while ((m = re2.exec(t))) arr.push([++n, +m[1], +m[2]]);
        }
        if (!arr.length) arr = null;
      }
    }
    if (!arr || !arr.length) return null;
    var out = [];
    arr.forEach(function (it) {
      if (Array.isArray(it)) {
        if (it.length >= 3) out.push({ w: num(it[0]), t0: num(it[1]), t1: num(it[2]) });
        else if (it.length === 2) out.push({ w: null, t0: num(it[0]), t1: num(it[1]) });
      } else if (it && typeof it === 'object') {
        var w = num(it.word !== undefined ? it.word : (it.w !== undefined ? it.w : (it.i !== undefined ? it.i : it.index)));
        var t0 = num(it.start !== undefined ? it.start : (it.from !== undefined ? it.from : (it.t0 !== undefined ? it.t0 : it.s)));
        var t1 = num(it.end !== undefined ? it.end : (it.to !== undefined ? it.to : (it.t1 !== undefined ? it.t1 : it.e)));
        if (t0 !== null) out.push({ w: w, t0: t0, t1: t1 });
      }
    });
    if (!out.length) return null;
    /* بلا أرقام كلمات صريحة؟ لترقيمها بترتيب الورود (حتى لا يضيع توقيت الكلمات) */
    var noW = out.every(function (x) { return x.w === null; });
    if (noW) out.forEach(function (x, i) { x.w = i + 1; x.implicit = true; });
    return out.length ? out : null;
  }
  /* يختار العمود المضغوط. يفحص حتى ١٥٠ صفاً من الجدول نفسه — لا أول خمسة أسطر
     فقط؛ فقد تبدأ القاعدة بصفوف بلا مقاطع (بسملة/رأس سورة) فيفوت الكشف ويُقرأ
     توقيت الآية وحدها فتُضاء الآية كلها بدل كلماتها.                        */
  function detectPacked(t, db) {
    if (!t) return null;
    var cols = null, vals = null;
    if (db && t.name) {
      try {
        var res = db.exec('SELECT * FROM "' + String(t.name).replace(/"/g, '""') + '" LIMIT 150');
        if (res.length) { cols = res[0].columns; vals = res[0].values; }
      } catch (e) { /* تجاهل */ }
    }
    if ((!vals || !vals.length) && t.sample) { cols = t.sample.cols; vals = t.sample.rows; }
    if (!cols || !vals || !vals.length) return null;
    var best = null, bestScore = 0;
    for (var c = 0; c < cols.length; c++) {
      var hits = 0, seen = 0;
      for (var r = 0; r < vals.length && seen < 80; r++) {
        var v = vals[r][c];
        if (v === null || v === undefined || v === '' || typeof v === 'number') continue;
        seen++;
        var items = parsePacked(v);
        if (items && items.length >= 2) hits++;
      }
      if (!hits) continue;
      var need = Math.max(2, Math.min(6, Math.round(seen * 0.2)));
      if (hits < need) continue;
      var named = /word|segment|timing|time|aya|ayah|verse/i.test(cols[c]) ? 1.4 : 1;
      var score = (hits / Math.max(1, seen)) * named + hits * 0.01;
      if (score > bestScore) { bestScore = score; best = cols[c]; }
    }
    return best;
  }

  /* ---------- الاستخراج ---------- */
  function col(t, c) { return c ? '"' + String(c).replace(/"/g, '""') + '"' : null; }

  function queryAll(db, table, cols) {
    var list = cols.filter(Boolean);
    var sql = 'SELECT ' + (list.length ? list.map(function (c) { return col(null, c); }).join(', ') : '*') +
      ' FROM "' + String(table).replace(/"/g, '""') + '"';
    var res = db.exec(sql);
    if (!res.length) return { columns: [], values: [] };
    return { columns: res[0].columns, values: res[0].values };
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  /* يحكم على ترقيم ملف التوقيت: هل هو على حفص أم على ورش؟
     المقياس الأول: أعلى رقم كلمة في كل آية مقابل عدد كلماتها في كل رواية؛
     فالمطابقة التامة دليل قوي، وتجاوز العدد دليل استحالة (لا يزاد كلام الآية).
     وإن لم يكن في الملف توقيت كلمات (آية بصفّ فقط) نقيس عدد آيات كل سورة:
     العدّ الكوفي (حفص) والمدني (ورش) يختلفان في ٦٠ سورة.                    */
  function riwayaFit(maxBy, mushaf, split, bySura, miss) {
    var f = {
      tested: 0, hafs: 0, warsh: 0, overH: 0, overW: 0,
      warshKnown: false, verdict: 'unknown', confH: 0, confW: 0, level: 'word',
      strong: false, byMiss: false, forced: false, miss: null
    };
    if (!mushaf) return f;
    f.warshKnown = !!(mushaf.warshT || (mushaf.warshAmap && mushaf.riwaya === 'warsh'));
    var useWords = maxBy && maxBy.size;
    if (useWords) {
      maxBy.forEach(function (m, k) {
        var p = String(k).split(':'), s = +p[0], a = +p[1];
        if (!(a >= 1) || !(m >= 1)) return;
        var h = (mushaf.wordCount(s, a, split) || 0);
        var w = f.warshKnown ? (mushaf.warshWordCount(s, a) || 0) : 0;
        if (!h && !w) return;
        f.tested++;
        if (h) { if (h === m) f.hafs++; else if (m > h) f.overH++; }
        if (w) { if (w === m) f.warsh++; else if (m > w) f.overW++; }
      });
    }
    if (!f.tested && bySura && bySura.size) {          /* لا توقيت كلمات: نقيس عدد الآيات */
      f.level = 'sura';
      bySura.forEach(function (v, s) {
        var h = (mushaf.ayahCount && mushaf.ayahCount[s]) || 0;
        var w = (f.warshKnown && mushaf.warshAyahs) ? (mushaf.warshAyahs(s) || 0) : 0;
        if (!h && !w) return;
        f.tested++;
        if (h) { if (h === v.max) f.hafs++; else if (v.max > h) f.overH++; }
        if (w) { if (w === v.max) f.warsh++; else if (v.max > w) f.overW++; }
      });
    }
    if (!f.tested && !miss) return f;
    f.confH = f.tested ? f.hafs / f.tested : 0;
    f.confW = f.tested ? f.warsh / f.tested : 0;
    var margin = f.level === 'word' ? Math.max(3, 0.05 * f.tested) : Math.max(2, 0.1 * f.tested);
    if (f.tested) {
      if (f.warshKnown) {
        if (f.warsh > f.hafs + margin) { f.verdict = 'warsh'; f.strong = true; }
        else if (f.hafs > f.warsh + margin) { f.verdict = 'hafs'; f.strong = true; }
        else if (f.overW > f.overH + margin) f.verdict = 'hafs';
        else if (f.overH > f.overW + margin) f.verdict = 'warsh';
      } else if (f.confH >= 0.85) { f.verdict = 'hafs'; f.strong = true; }
    }
    /* ثم الترجيح بمقياس الرسم: أي التفسيرين يُبقي المقاطع داخل كلمات آياتها؟ */
    if (miss && miss.tot >= 20) {
      var okMax = Math.max(1, Math.round(0.02 * miss.tot));
      var asClean = miss.asIs <= okMax, wClean = !!(f.warshKnown && miss.warsh <= okMax);
      f.miss = miss;
      if (asClean || wClean) { f.verdict = wClean && !asClean ? 'warsh' : 'hafs'; f.strong = true; f.byMiss = true; }
    }
    return f;
  }

  /**
   * يستخرج كل شيء من القاعدة.
   * mushaf: كائن Mushaf (لحساب عدد كلمات كل آية ومطابقة البسملة)
   */
  function extract(db, mapping, mushaf, opts) {
    opts = opts || {};
    var split = !!opts.splitDagger;
    var wc = function (s, a) { return mushaf ? mushaf.wordCount(s, a, split) : 0; };
    var out = { surahs: [], bySura: new Map(), stats: {}, mode: 'A', warnings: [] };
    var sg = mapping.segments;

    /* ---- روابط السور ---- */
    var idToNo = {};
    if (mapping.surahList && mapping.surahList.table) {
      var sl = mapping.surahList;
      var q = queryAll(db, sl.table, [sl.id, sl.no, sl.name, sl.url, sl.reciter]);
      var ci = {}, i;
      for (i = 0; i < q.columns.length; i++) ci[q.columns[i]] = i;
      q.values.forEach(function (r) {
        var no = num(r[ci[sl.no]]);
        var id = num(r[ci[sl.id]]);
        var url = sl.url ? r[ci[sl.url]] : '';
        var name = sl.name ? r[ci[sl.name]] : '';
        var reciter = sl.reciter ? r[ci[sl.reciter]] : '';
        if (no === null && id === null) return;
        if (id !== null && no !== null) idToNo[id] = no;
        out.surahs.push({
          no: no !== null ? no : id, id: id, name: name || '',
          url: (url || '').toString().trim(), reciter: (reciter || '').toString().trim()
        });
      });
    }

    /* ---- المقاطع ---- */
    if (!sg || !sg.table) return out;
    var wantCols = [sg.sura, sg.aya, sg.word, sg.start, sg.end, sg.time, sg.packed].filter(Boolean);
    var qs = queryAll(db, sg.table, wantCols);
    var idx = {};
    qs.columns.forEach(function (c, i) { idx[c] = i; });
    var gS = function (r) { var v = r[idx[sg.sura]]; return num(v); };
    var gA = function (r) { var v = r[idx[sg.aya]]; return num(v); };
    var gW = function (r) { return sg.word ? num(r[idx[sg.word]]) : null; };
    var gT0 = function (r) { return sg.start ? num(r[idx[sg.start]]) : num(r[idx[sg.time]]); };
    var gT1 = function (r) { return sg.end ? num(r[idx[sg.end]]) : (sg.start ? num(r[idx[sg.start]]) : null); };

    var rows = [], raw, packSkipped = 0, packSample = '';
    for (var ri = 0; ri < qs.values.length; ri++) {
      raw = qs.values[ri];
      var s = gS(raw), a = gA(raw), w = gW(raw);
      if (s === null || a === null) continue;
      if (sg.packed) {
        var items = parsePacked(raw[idx[sg.packed]]);
        if (!items) {
          var pv = raw[idx[sg.packed]];
          if (pv !== null && pv !== undefined && String(pv).trim() !== '') {
            packSkipped++;
            if (!packSample) packSample = asText(pv).slice(0, 60);
          }
        }
        if (items && items.length) {
          var ayEnd = gT1(raw);
          for (var q = 0; q < items.length; q++) {
            var it = items[q];
            if (it.w === null || it.t0 === null) continue;
            var e1 = it.t1;
            if (e1 === null || e1 === undefined) {
              e1 = (q + 1 < items.length && items[q + 1].t0 !== null) ? items[q + 1].t0
                 : (ayEnd !== null ? ayEnd : it.t0);
            }
            rows.push({ s: s, a: a, w: it.w, t0: it.t0, t1: e1 });
          }
          continue;   /* العمود المضغوط يكفي */
        }
        /* لا بيانات مضغوطة في هذا الصف: نكمل لاستخدام توقيت الآية */
      }
      var t0 = gT0(raw), t1 = gT1(raw);
      if (t0 === null) continue;
      if (t1 === null) t1 = t0;
      rows.push({ s: s, a: a, w: w, t0: t0, t1: t1 });
    }

    if (!rows.length) return out;
    out.stats.rows = rows.length;
    var wordRows = 0;
    rows.forEach(function (r) { if (r.w !== null) wordRows++; });
    out.stats.wordRows = wordRows;
    if (packSkipped) {
      out.warnings.push('عمود المقاطع «' + sg.packed + '» فيه ' + packSkipped +
        ' صفاً لم تُفهم صيغته — مثال: ' + packSample);
    }
    if (!wordRows && !sg.packed) {
      out.warnings.push('لم أجد عمود مقاطع الكلمات (segments) في جدول ' + sg.table +
        ' — فالتوقيت على مستوى الآية فقط وأزمنة الكلمات مُقدَّرة');
    }

    /* ---- الوحدة: ثانية أم ميلي ثانية ---- */
    var unit = mapping.unit || 'auto';
    if (unit === 'auto') {
      var durs = [];
      for (var k = 0; k < Math.min(rows.length, 4000); k++) {
        var d = rows[k].t1 - rows[k].t0;
        if (isFinite(d) && d > 0) durs.push(d);
      }
      durs.sort(function (x, y) { return x - y; });
      var med = durs.length ? durs[Math.floor(durs.length / 2)] : 0;
      unit = med > 20 ? 'ms' : 's';
      out.stats.unit = unit + ' (median ' + (med ? med.toFixed(3) : 0) + ')';
    } else out.stats.unit = unit;
    var K = (unit === 's') ? 1000 : 1;

    /* ---- أساس ترقيم الكلمات: 0 أم 1 ---- */
    var wbase = 1, minW = Infinity;
    rows.forEach(function (r) { if (r.w !== null && r.w < minW) minW = r.w; });
    if (minW === 0) wbase = 0;
    out.stats.wordBase = wbase;

    /* ---- رقم السورة عبر جدول surah_list إن كان مفتاحاً أجنبياً ---- */
    var distinct = {};
    rows.forEach(function (r) { distinct[r.s] = 1; });
    var keys = Object.keys(distinct).map(Number);
    var maxS = Math.max.apply(null, keys);
    if (Object.keys(idToNo).length && maxS <= 114) {
      var allIn = keys.every(function (v) { return idToNo[v] !== undefined; });
      /* نطبّق التحويل فقط إذا كان فعلاً مفتاحاً أجنبياً (يغيّر الأرقام) */
      var changes = keys.some(function (v) { return idToNo[v] !== v; });
      if (allIn && changes) {
        rows.forEach(function (r) { r.s = idToNo[r.s]; });
        out.warnings.push('تم تحويل رقم السورة عبر جدول ' + mapping.surahList.table);
      }
    }

    /* ---- ترقيم الآيات: هل الملف على رواية المصحف؟ ---- */
    /* ملفات التوقيت تُرقَّم على رواية القارئ: توقيت ورش يحمل أرقام العدّ المدني،
       وهي تختلف عن أرقام العدّ الكوفي (حفص) في ٦٠ سورة. والمفاتيح داخل البرنامج
       كلها على أرقام حفص، فلا بدّ من فحص الملف ثم تحويله إن كان على ورش.        */
    var maxBy = new Map();                 /* 'س:آ' -> أعلى رقم كلمة ورد في الملف */
    var suraAya = new Map();               /* 'س'  -> {max: آخر آية, n: عدد الآيات} */
    rows.forEach(function (r) {
      var s = Math.round(r.s), a = Math.round(r.a);
      if (s >= 1 && s <= 114 && a >= 1) {
        var sv = suraAya.get(s) || { max: 0, set: new Set() };
        if (a > sv.max) sv.max = a;
        sv.set.add(a);
        suraAya.set(s, sv);
      }
      if (r.w === null) return;
      var k = s + ':' + a;
      var wv = Math.round(r.w) + (wbase === 0 ? 1 : 0);
      var m = maxBy.get(k);
      if (m === undefined || wv > m) maxBy.set(k, wv);
    });
    suraAya.forEach(function (v, k) { suraAya.set(k, { max: v.max, n: v.set.size }); });
    /* مقياس مباشر لا يعتمد على الأرقام بل على الرسم: كم مقطعاً يقع خارج كلمات آيته
       «كما هو»، وكم يقع خارجها «لو حُوِّل إلى ترقيم ورش»؟ التفسير الذي يُبقي
       المقاطع داخل رسم المصحف هو ترقيم الملف الصحيح.                          */
    var miss = null, adjM = (wbase === 0 ? 1 : 0);
    if (mushaf.mapWarshTiming && wordRows) {
      var st = Math.max(1, Math.floor(rows.length / 6000)), mA = 0, mW = 0, mT = 0;
      for (var mi = 0; mi < rows.length; mi += st) {
        var mr = rows[mi];
        if (mr.w === null) continue;
        var ms = Math.round(mr.s), ma = Math.round(mr.a);
        if (ma < 1) continue;
        var mw = Math.round(mr.w) + adjM, limH = wc(ms, ma, split);
        mT++;
        if (!limH || mw < 1 || mw > limH) mA++;
        var mp0 = mushaf.mapWarshTiming(ms, ma, mw);
        var ha0 = mp0 ? mp0[0] : ma, hw0 = mp0 ? mp0[1] : mw, limW = wc(ms, ha0, split);
        if (!limW || hw0 < 1 || hw0 > limW) mW++;
      }
      if (mT >= 20) miss = { asIs: mA, warsh: mW, tot: mT };
    }
    var force = (opts.forceRiwaya === 'warsh' || opts.forceRiwaya === 'hafs') ? opts.forceRiwaya : '';
    var fit = riwayaFit(maxBy, mushaf, split, suraAya, miss);
    if (force) {
      fit.verdict = force; fit.forced = true; fit.strong = true;
      out.warnings.push('ترقيم التوقيت مفروض يدوياً على ' + (force === 'warsh' ? 'ورش' : 'حفص'));
    }
    out.fit = fit;
    out.stats.riwaya = fit.verdict;
    out.stats.miss = miss ? (miss.asIs + '/' + miss.tot) : '';
    if (mushaf.riwaya === 'warsh' && !fit.warshKnown && miss && miss.warsh < miss.asIs) {
      out.warnings.push('الملف على ترقيم ورش لكن بيانات ورش عندك بلا جدول التحويل (tinv) — ' +
        'أعد توليد assets/warsh.json أو حدّث النسخة المستقلة');
    }
    /* التحويل: في مصحف ورش عند ثبوت أن الملف على ترقيمها، أو إذا فرضه المستخدم */
    var canMap = !!(mushaf.mapWarshTiming && (mushaf.riwaya === 'warsh' || force === 'warsh'));
    if (canMap && fit.verdict === 'warsh') {
      var adj = (wbase === 0 ? 1 : 0), moved = 0, clamped = 0, spread = 0;
      var newRows = [];
      rows.forEach(function (r) {
        var s = Math.round(r.s), a = Math.round(r.a);
        if (a < 1) { newRows.push(r); return; }   /* البسملة: رقمها ٠ في الروايتين */
        if (r.w === null) {
          /* توقيت على مستوى الآية: يُقسَّم على آيات حفص التي تغطيها آية ورق واحدة */
          var pcs = mushaf.warshTimingPieces ? mushaf.warshTimingPieces(s, a) : null;
          if (!pcs) { newRows.push(r); return; }
          if (pcs.length === 1) { r.a = pcs[0][2]; moved++; newRows.push(r); return; }
          var span = 0, i2, tot = Math.max(1, r.t1 - r.t0), acc = 0;
          for (i2 = 0; i2 < pcs.length; i2++) span += pcs[i2][1] - pcs[i2][0] + 1;
          for (i2 = 0; i2 < pcs.length; i2++) {
            var sh = (pcs[i2][1] - pcs[i2][0] + 1) / (span || 1);
            newRows.push({ s: s, a: pcs[i2][2], w: null, t0: r.t0 + acc * tot, t1: r.t0 + (acc + sh) * tot });
            acc += sh; moved++; spread++;
          }
          return;
        }
        var wv = Math.round(r.w) + adj;
        var mp = mushaf.mapWarshTiming(s, a, wv);
        var ha = mp ? mp[0] : a, hw = mp ? mp[1] : wv;
        var lim = wc(s, ha, split);
        if (lim) {
          if (hw > lim) { hw = lim; clamped++; }
          else if (hw < 1) { hw = 1; clamped++; }
        }
        if (ha !== a || hw !== wv) { r.a = ha; r.w = hw - adj; moved++; }
        newRows.push(r);
      });
      rows = newRows;
      if (moved) {
        out.stats.remapped = moved;
        out.warnings.push('الملف على ترقيم ورش: حُوِّل ' + moved + ' مقطعاً إلى أرقام آيات المصحف' +
          (spread ? (' وقُسِّم ' + spread + ' توقيت آية') : '') +
          (clamped ? (' وصُحِّح موضع ' + clamped + ' كلمة') : ''));
      }
    } else if (mushaf && fit.verdict === 'unknown') {
      out.warnings.push('تعذّر الجزم بترقيم الآيات في هذا الملف (' + fit.tested + ' آية صالحة للمقارنة)');
    } else if (fit.verdict === 'hafs' && mushaf.riwaya === 'warsh') {
      out.warnings.push('تحذير: الملف على ترقيم حفص بينما المصحف على رواية ورش — الأرقام لن تتطابق');
    }

    /* ---- مطابقة البسملة ---- */
    var mode = 'A';
    if (opts.basmalaInAyah === true) mode = 'B';
    else if (opts.basmalaInAyah === false) mode = 'A';
    else mode = detectBasmalaMode(rows, mushaf, wbase, split);
    out.mode = mode;
    out.stats.basmalaMode = mode;

    /* السور التي فيها صفوف بسملة صريحة (رقم آية = ٠) تُعامل دائماً بالنمط A،
       لأن كلمات آيتها ١ مرقّمة من ١ ولا يجوز نقلها إلى البسملة. */
    var hasZero = new Set();
    rows.forEach(function (r) {
      var s = Math.round(r.s), a = Math.round(r.a);
      if (a === 0 && s >= 1 && s <= 114) hasZero.add(s);
    });

    var fixed = [];
    rows.forEach(function (r) {
      var s = Math.round(r.s), a = Math.round(r.a);
      if (s < 1 || s > 114) return;
      var w = (r.w === null) ? null : (Math.round(r.w) + (wbase === 0 ? 1 : 0));
      var t0 = r.t0 * K, t1 = r.t1 * K;
      if (t1 < t0) { var tmp = t0; t0 = t1; t1 = tmp; }
      var m = hasZero.has(s) ? 'A' : mode;      /* لكل سورة نمطها */
      if (m === 'B' && a === 1 && w !== null && mushaf && wc(s, 0) === 4) {
        var nb = wc(s, 0);   /* 4 كلمات بسملة */
        if (w <= nb) { fixed.push({ s: s, a: 0, w: w, t0: t0, t1: t1 }); return; }
        fixed.push({ s: s, a: 1, w: w - nb, t0: t0, t1: t1 }); return;
      }
      fixed.push({ s: s, a: a, w: w, t0: t0, t1: t1 });
    });

    /* ---- تنقية: نحذف المقاطع الشاردة قبل أول كلمة في الآية، ونُبقي التكرار (إعادة القراءة) ----
       مثال: [[2,..],[1,..],[2,..],[3,..]]  → نحذف المقطع الأول الشارد
             [[1,..]..[6,..],[5,..],[6,..],[7,..]] → نُبقي الكل كما هو (القارئ أعاد ٥ و٦) */
    var groups = new Map();
    fixed.forEach(function (r) {
      if (r.w === null) return;
      var k = r.s + ':' + r.a;
      var g = groups.get(k);
      if (!g) groups.set(k, [r]); else g.push(r);
    });
    var drops = new Set();
    groups.forEach(function (arr) {
      if (arr.length < 2) return;
      var mn = Infinity, i;
      for (i = 0; i < arr.length; i++) if (arr[i].w < mn) mn = arr[i].w;
      for (i = 0; i < arr.length && arr[i].w !== mn; i++) drops.add(arr[i]);
    });
    if (drops.size) {
      out.warnings.push('حُذفت ' + drops.size + ' مقاطع شاردة قبل بداية آياتها');
      var cleaned2 = [];
      fixed.forEach(function (r) { if (!drops.has(r)) cleaned2.push(r); });
      fixed = cleaned2;
    }

    /* ---- تجميع حسب السورة ---- */
    var bySura = new Map();
    fixed.forEach(function (r) {
      var o = bySura.get(r.s);
      if (!o) { o = { segs: [], ayahs: new Map(), dur: 0, words: 0 }; bySura.set(r.s, o); }
      o.segs.push(r);
      if (r.t1 > o.dur) o.dur = r.t1;
      if (r.w !== null) o.words++;
      var ak = r.a, cur = o.ayahs.get(ak);
      if (!cur) o.ayahs.set(ak, { a: ak, t0: r.t0, t1: r.t1 });
      else { if (r.t0 < cur.t0) cur.t0 = r.t0; if (r.t1 > cur.t1) cur.t1 = r.t1; }
    });

    var totalWords = 0, estimated = false;
    bySura.forEach(function (o, s) {
      o.segs.sort(function (x, y) { return x.t0 - y.t0; });
      o.ayahList = Array.from(o.ayahs.values()).sort(function (x, y) { return x.t0 - y.t0; });
      /* تقدير زمن الكلمات عندما تكون التوقيتات على مستوى الآية فقط */
      if (o.words === 0 && mushaf) { estimateWords(o, mushaf, s, split); }
      if (o.estimated) estimated = true;
      totalWords += o.words;
    });

    out.bySura = bySura;
    out.stats.suras = bySura.size;
    out.stats.words = totalWords;
    out.stats.estimated = estimated;
    return out;
  }

  /* يكتشف: هل البسملة مدمجة في الآية 1 (النمط B) أم مستقلة/غائبة (النمط A) */
  function detectBasmalaMode(rows, mushaf, wbase, split) {
    if (!mushaf) return 'A';
    var bySura = {};
    rows.forEach(function (r) {
      var s = Math.round(r.s), a = Math.round(r.a);
      var w = r.w === null ? null : Math.round(r.w) + (wbase === 0 ? 1 : 0);
      if (w === null) return;
      (bySura[s] = bySura[s] || {})[a] = Math.max(bySura[s][a] || 0, w);
    });
    var scoreA = 0, scoreB = 0, tested = 0, zeroSuras = 0;
    Object.keys(bySura).forEach(function (s) {
      var s = +s;
      if (s === 1 || s === 9) return;               /* الفاتحة بسملتها آية 1، والتوبة لا بسملة لها */
      var cnt = bySura[s];
      if (cnt[0]) { zeroSuras++; return; }          /* بسملة صريحة (آية ٠): لا تُحسب في الترجيح */
      if (mushaf.wordCount(s, 0, split) !== 4) return;   /* لا بسملة في الرسم لهذه السورة */
      var m1 = mushaf.wordCount(s, 1, split);
      if (!m1) return;
      tested++;
      var a1 = cnt[1] || 0;
      if (a1 === m1) scoreA++;                       /* البسملة غير محسوبة ضمن الآية 1 */
      if (a1 === m1 + 4) scoreB++;                   /* البسملة محسوبة ضمن الآية 1 */
    });
    if (!tested) return 'A';                            /* لا سور قابلة للاختبار */
    if (zeroSuras >= Math.max(3, tested)) return 'A';   /* أغلب السور فيها بسملة صريحة */
    return (scoreB > scoreA) ? 'B' : 'A';
  }

  /* توزيع زمن الآية على كلماتها (تقدير ذكي عند غياب توقيت الكلمات) */
  function estimateWords(o, mushaf, s, split) {
    if (!mushaf || !o.ayahList) return;
    var total = 0, items = [];
    o.ayahList.forEach(function (ay) {
      var n = mushaf.wordCount(s, ay.a, split);
      for (var w = 1; w <= n; w++) items.push({ a: ay.a, w: w, len: 4 });
      total += n;
    });
    if (!total) return;
    o.ayahList.forEach(function (ay) {
      var n = mushaf.wordCount(s, ay.a, split);
      if (!n) return;
      var dur = (ay.t1 - ay.t0) / n;
      for (var w = 1; w <= n; w++) {
        o.segs.push({ s: s, a: ay.a, w: w, t0: ay.t0 + (w - 1) * dur, t1: ay.t0 + w * dur, estimated: true });
      }
    });
    o.segs = o.segs.filter(function (x) { return x.w !== null; });
    o.segs.sort(function (x, y) { return x.t0 - y.t0; });
    o.words = o.segs.length;
    o.estimated = true;
  }

  global.TimingDB = {
    guessColumns: guessColumns,
    riwayaFit: riwayaFit,
    parsePacked: parsePacked,
    initSql: initSql,
    openDb: openDb,
    listTables: listTables,
    guessMapping: guessMapping,
    extract: extract,
    PATTERNS: PATTERNS
  };
})(window);
