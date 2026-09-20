/* ============================================================
   player.js — محرّك التشغيل والمزامنة مع توقيت الكلمات
   ============================================================ */
(function (global) {
  'use strict';

  /* يشرح سبب فشل التشغيل — أهم حالة: خوادم تمنع التضمين (Google Drive وغيرها) */
  function explainMediaError(src, fallback) {
    try {
      var u = new URL(src, location.href);
      var h = u.hostname;
      if (/drive\.google\.com$|drive\.usercontent\.google\.com$|docs\.google\.com$/.test(h)) {
        return 'روابط Google Drive لا تُشغَّل داخل المتصفح: جوجل تمنع تضمين ملفاتها في صفحات أخرى ' +
               '(Cross-Origin-Resource-Policy). ارفع الملف على استضافة عادية، أو نزّله وشغّله من «ملف محلي».';
      }
      if (!/^https?:$/.test(u.protocol)) return 'الرابط ليس http/https: ' + src.slice(0, 60);
      return 'تعذّر تشغيل الرابط: الخادم يمنع التضمين، أو الرابط ليس ملفاً صوتياً مباشراً. ' +
             'تأكد أن الرابط ينتهي بـ .mp3 ويسمح بالتشغيل المباشر (Accept-Ranges).';
    } catch (e) { return fallback; }
  }

  function Player() {
    var self = this;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    /* لا نضبط crossOrigin: يمنع تشغيل الملفات من خوادم بلا ترويسة CORS */
    this.segs = [];
    this.ayahs = [];
    this.sura = null;
    this.timingDur = 0;
    this.offset = 0;              // معايرة بالميلي ثانية
    this.rate = 1;
    this.repeat = { mode: 'off', count: 3, done: 0, from: null, to: null };
    this.bounds = null;           // {t0,t1} حدود التكرار الحالية
    this.onTick = null;
    this.onState = null;
    this.onError = null;
    this.onEnded = null;
    this.playing = false;
    this._last = { seg: null, ayah: null };
    this._raf = null;

    this.audio.addEventListener('play', function () { self.playing = true; self._loop(); self._emit(); });
    this.audio.addEventListener('pause', function () { self.playing = false; self._stopLoop(); self._emit(); });
    this.audio.addEventListener('ended', function () {
      self.playing = false; self._stopLoop(); self._emit();
      if (self.onEnded) self.onEnded();
    });
    this.audio.addEventListener('error', function () {
      self.playing = false; self._stopLoop();
      var e = self.audio.error;
      var msg = (e && e.message) ? e.message : 'خطأ غير معروف في الصوت';
      if (e && (e.code === 4 || e.code === 2)) {
        msg = explainMediaError(self.audio.src, msg);
      }
      if (self.onError) self.onError(msg);
      self._emit();
    });
    /* تحديث التتبّع عند القفز/التنقّل حتى لو كان المشغّل موقوفاً */
    this.audio.addEventListener('seeked', function () { self.tick(true); });
    this.audio.addEventListener('timeupdate', function () { if (!self.playing) self.tick(true); });
    this.audio.addEventListener('waiting', function () { self._emit('loading'); });
    this.audio.addEventListener('canplay', function () { self._emit(); });
    this.audio.addEventListener('loadedmetadata', function () { self._emit(); });
  }

  Player.prototype._emit = function (state) {
    if (this.onState) this.onState(state || (this.playing ? 'playing' : 'paused'), this);
  };

  Player.prototype._loop = function () {
    var self = this;
    if (this._raf) return;
    function frame() {
      if (!self.playing) { self._raf = null; return; }
      self.tick(true);
      self._raf = requestAnimationFrame(frame);
    }
    this._raf = requestAnimationFrame(frame);
  };
  Player.prototype._stopLoop = function () {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  };

  /* الزمن الحالي بالميلي ثانية بعد المعايرة */
  Player.prototype.time = function () {
    return (isFinite(this.audio.currentTime) ? this.audio.currentTime * 1000 : 0) + this.offset;
  };
  Player.prototype.duration = function () {
    var a = this.audio, d = NaN;
    if (a.readyState >= 1 && isFinite(a.duration) && a.duration > 0) d = a.duration * 1000;
    if (!(d > 0) && a.seekable && a.seekable.length) {
      try { d = a.seekable.end(a.seekable.length - 1) * 1000; } catch (e) { d = NaN; }
    }
    if (!(d > 0)) return this.timingDur || 0;
    /* إن كان زمن التوقيت أطول بكثير فملف الصوت لم يُحمَّل بالكامل بعد */
    if (this.timingDur && this.timingDur > d * 1.05 && this.timingDur - d > 2000) return this.timingDur;
    return d;
  };

  Player.prototype.load = function (src, meta) {
    this.stop();
    this.src = src;
    this.meta = meta || {};
    this.audio.src = src;
    this.audio.playbackRate = this.rate;
    this.audio.load();
  };

  Player.prototype.setTiming = function (suraData) {
    this.segs = (suraData && suraData.segs) || [];
    this.ayahs = (suraData && suraData.ayahList) || [];
    this.timingDur = (suraData && suraData.dur) || 0;
    this._last = { seg: null, ayah: null };
    this.repeat.done = 0;
    this._recomputeBounds();
  };

  Player.prototype.play = function () {
    var p = this.audio.play();
    if (p && p.catch) p.catch(function (e) { if (this.onError) this.onError(e.message || String(e)); }.bind(this));
  };
  Player.prototype.pause = function () { this.audio.pause(); };
  Player.prototype.toggle = function () { if (this.playing) this.pause(); else this.play(); };
  Player.prototype.stop = function () {
    try { this.audio.pause(); this.audio.currentTime = 0; } catch (e) { }
    this._stopLoop();
    this._last = { seg: null, ayah: null };
  };

  Player.prototype.seek = function (ms) {
    ms = Math.max(0, ms);
    var sec = (ms - this.offset) / 1000;
    try { this.audio.currentTime = Math.max(0, sec); } catch (e) { }
    this.tick(true);
  };
  Player.prototype.nudge = function (ms) { this.seek(this.time() + ms); };
  Player.prototype.setRate = function (r) {
    this.rate = r; this.audio.playbackRate = r;
  };
  Player.prototype.setOffset = function (ms) { this.offset = ms || 0; this.tick(true); };

  /* البحث الثنائي: آخر مقطع يبدأ قبل الزمن */
  Player.prototype.segAt = function (t) {
    var a = this.segs;
    if (!a.length) return null;
    var lo = 0, hi = a.length - 1, res = null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (a[mid].t0 <= t) { res = a[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return res;
  };
  Player.prototype.ayahAt = function (t) {
    var a = this.ayahs;
    if (!a.length) return null;
    var lo = 0, hi = a.length - 1, res = null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (a[mid].t0 <= t) { res = a[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return res;
  };

  Player.prototype.seekAyah = function (a) {
    for (var i = 0; i < this.ayahs.length; i++) {
      if (this.ayahs[i].a === a) { this.seek(this.ayahs[i].t0); return true; }
    }
    return false;
  };
  Player.prototype.nextAyah = function () {
    var t = this.time(), cur = this.ayahAt(t);
    if (!cur) return this.seek(0);
    for (var i = 0; i < this.ayahs.length; i++) {
      if (this.ayahs[i].t0 > t + 120) { this.seek(this.ayahs[i].t0); return true; }
    }
    return false;
  };
  Player.prototype.prevAyah = function () {
    var t = this.time(), cur = this.ayahAt(t);
    /* كأغلب المشغّلات: إن تجاوزنا بداية الآية الحالية نرجع إلى بدايتها أولاً */
    if (cur && (t - cur.t0) > 1500) { this.seek(cur.t0); return true; }
    /* وإلا: الآية التي قبل بداية الآية الحالية */
    var ref = cur ? cur.t0 : t, target = null;
    for (var i = 0; i < this.ayahs.length; i++) {
      if (this.ayahs[i].t0 < ref - 120) target = this.ayahs[i];
    }
    this.seek(target ? target.t0 : 0);
    return true;
  };
  Player.prototype.seekWord = function (s, a, w) {
    for (var i = 0; i < this.segs.length; i++) {
      var g = this.segs[i];
      if (g.a === a && g.w === w) { this.seek(Math.max(0, g.t0 - 60)); return true; }
    }
    return this.seekAyah(a);
  };

  /* حدود التكرار */
  Player.prototype.setRepeat = function (mode, count) {
    this.repeat.mode = mode || 'off';
    if (count) this.repeat.count = count;
    this.repeat.done = 0;               /* أي تغيير في الخيار يبدأ عدًّا جديداً */
    this.bounds = null;
    this._recomputeBounds();
    return this.bounds;
  };
  Player.prototype._recomputeBounds = function () {
    this.bounds = null;
    if (this.repeat.mode === 'off') return;
    var t = this.time(), cur = this.ayahAt(t);
    if (this.repeat.mode === 'ayah') {
      if (cur) this.bounds = { t0: cur.t0, t1: cur.t1 };
    } else if (this.repeat.mode === 'word') {
      var g = this.segAt(t);
      if (g) this.bounds = { t0: g.t0, t1: g.t1 };
    } else if (this.repeat.mode === 'page' || this.repeat.mode === 'sura') {
      if (this.pageBounds) this.bounds = { t0: this.pageBounds.t0, t1: this.pageBounds.t1 };
      else if (this.ayahs.length) this.bounds = { t0: this.ayahs[0].t0, t1: this.ayahs[this.ayahs.length - 1].t1 };
    }
  };
  /* يحدّد التطبيق مجال الصفحة/السورة بالأزمنة */
  Player.prototype.setPageBounds = function (t0, t1) {
    this.pageBounds = (t0 === null) ? null : { t0: t0, t1: t1 };
    this._recomputeBounds();
  };

  Player.prototype.tick = function (force) {
    var t = this.time();
    /* التكرار */
    if (this.bounds && this.playing && t >= this.bounds.t1) {
      var keep = (this.repeat.count <= 0) || (this.repeat.done < this.repeat.count - 1);
      if (keep) {
        this.repeat.done++;
        this.seek(this.bounds.t0);
        if (this.onRepeat) this.onRepeat(this.repeat.done + 1, this.repeat.count);
        return;
      }
      /* انتهى العدد المطلوب: نوقف التكرار فعلاً ولا نُعد حساب الحدود */
      this.repeat.done = 0;
      this.repeat.mode = 'off';
      this.bounds = null;
      if (this.onRepeatEnd) this.onRepeatEnd();
    }
    var seg = this.segAt(t);
    var ay = this.ayahAt(t);
    var changed = force || (seg !== this._last.seg) || (ay !== this._last.ayah);
    this._last.seg = seg; this._last.ayah = ay;
    if (this.onTick) this.onTick({
      t: t, seg: seg, ayah: ay, playing: this.playing,
      dur: this.duration(), changed: changed, repeat: this.repeat
    });
    return { seg: seg, ayah: ay, t: t };
  };

  global.Player = Player;
})(window);
