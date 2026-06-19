/* ============================================================
   Dot Forest — TW(Tactile World) / Dot Games 임베드 통합 레이어 (v2)
   - URL 파라미터: ?embed ?preview ?controls=compact ?autostart ?theme ?lang
   - html 클래스 토글(CSS가 표시/레이아웃 처리) — is-embed / no-preview / controls-compact / theme-*
   - postMessage 브리지: 신규 DOT_FOREST_* 프로토콜 + 기존 dotforest:*(TW 정본 호환) 동시 발신
   - window.DotForestEmbed 공개 API (init guard + destroy 정리)
   게임 로직(script.js)은 건드리지 않고 window.DotForest.bridge 훅만 사용.
   screens.js / script.js 보다 "먼저" 로드.
   ============================================================ */
(function () {
  if (window.DotForestEmbed && window.DotForestEmbed.__ready) return;   // 중복 초기화 방지

  var Q = new URLSearchParams(location.search);
  var inIframe = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var embed   = Q.get('embed') === '1' || (inIframe && Q.get('embed') !== '0');
  var preview = Q.get('preview') !== '0';
  var compact = Q.get('controls') === 'compact';
  var autostart = Q.get('autostart') === '1';
  var theme   = (Q.get('theme') === 'dark' || Q.get('theme') === 'light') ? Q.get('theme') : null;
  var lang    = Q.get('lang') || null;

  window.TW = { embed: embed, preview: preview, compact: compact, autostart: autostart, theme: theme, lang: lang };

  /* ---- 오리진 정책 ----
     운영 시 ALLOWED_ORIGINS에 TW 오리진을 고정. 비어 있으면 개발용 개방(DEV_OPEN).
     실제 부모(나를 임베드한 창)의 오리진은 항상 신뢰(referrer). 이렇게 해야 GitHub Pages·
     TW·로컬 하니스가 모두 동작하면서 운영에서 조일 수 있다. */
  var ALLOWED_ORIGINS = ['https://tib-preview.vercel.app'];
  var DEV_OPEN = ALLOWED_ORIGINS.length === 0;
  var PARENT_ORIGIN = (function () { try { return document.referrer ? new URL(document.referrer).origin : ''; } catch (e) { return ''; } })();
  var OUT_TARGET = PARENT_ORIGIN || '*';   // 부모에게 보내는 대상(부모 자신이므로 안전, dev fallback '*')
  function originTrusted(o) { return DEV_OPEN || o === PARENT_ORIGIN || ALLOWED_ORIGINS.indexOf(o) !== -1; }

  var de = document.documentElement;
  de.classList.toggle('is-embed', embed);
  de.classList.toggle('no-preview', !preview);
  de.classList.toggle('controls-compact', compact);
  if (theme) de.setAttribute('data-theme', theme);
  if (lang) { try { de.lang = lang; } catch (e) {} }

  var bridge = function () { return window.DotForest && window.DotForest.bridge; };

  /* ---- postMessage 발신: 신규 DOT_FOREST_* + 기존 dotforest:*(TW 호환) ---- */
  function emit(type, payload) {
    if (window.parent === window) return;
    try { window.parent.postMessage(Object.assign({ type: type }, payload || {}), OUT_TARGET); } catch (e) {}
    // TW 정본(이미 배포된 부모) 호환: ready/resize/exit는 dotforest:* 로도 발신
    var legacy = { DOT_FOREST_READY: 'dotforest:ready', DOT_FOREST_EXIT: 'dotforest:exit' }[type];
    if (legacy) { try { window.parent.postMessage({ source: 'dotforest', type: legacy, payload: payload || {} }, OUT_TARGET); } catch (e) {} }
  }
  // 기존 코드(screens.js)가 참조하는 window.TWBridge 유지 — exit는 양쪽 프로토콜로
  window.TWBridge = {
    post: function (t, p) { emit(t, p); },
    ready: function () { emit('DOT_FOREST_READY', { game: 'dot-forest', version: '1.1.0' }); },
    resize: function (w, h) { emit('DOT_FOREST_RESIZE', { width: w, height: h }); },
    exit: function (reason) { emit('DOT_FOREST_EXIT', { reason: reason || 'user' }); },
  };

  /* ---- 부모 → 자식 수신 ---- */
  function onMessage(e) {
    if (!originTrusted(e.origin)) return;
    var d = e.data || {};
    var t = d.type;
    if (t === 'DOT_FOREST_START')   API.start();
    else if (t === 'DOT_FOREST_PAUSE')  API.pause();
    else if (t === 'DOT_FOREST_RESUME') API.resume();
    else if (t === 'DOT_FOREST_RESET')  API.reset();
    else if (t === 'DOT_FOREST_FOCUS')  API.focus();
    else if (t === 'DOT_FOREST_SET_PREVIEW') API.setPreviewVisible(d.visible !== false);
    else if (t === 'DOT_FOREST_SET_COMPACT') API.setCompactMode(!!d.enabled);
    else if (t === 'DOT_FOREST_MUTE')   API.setMuted(!!d.muted);
    // 기존 tw:* 호환
    else if (d.source === 'tw') {
      if (d.type === 'tw:pause') API.pause();
      else if (d.type === 'tw:resume') API.resume();
      else if ((d.type === 'tw:setLang' || d.type === 'lang') && d.lang) applyLang(d.lang);
    }
  }

  function applyLang(target) {
    var lt = document.getElementById('langToggle');
    if (!lt) return;
    var cur = lt.textContent.trim() === 'EN' ? 'ko' : 'en';
    if (cur !== target) lt.click();
  }

  /* ---- 공개 API ---- */
  var lastProgressKey = '', completed = false, started = false;
  var API = {
    __ready: true,
    isEmbed: embed,
    start: function () {
      var nav = document.querySelector('[data-nav="game"]');
      if (document.body.dataset.screen !== 'game' && nav) nav.click();
      this.focus();
      if (!started) { started = true; emit('DOT_FOREST_STARTED', {}); }
    },
    pause: function () { var b = bridge(); if (b && b.pause) b.pause(); emit('DOT_FOREST_PAUSED', {}); },
    resume: function () { var b = bridge(); if (b && b.resume) b.resume(); emit('DOT_FOREST_RESUMED', {}); },
    reset: function () { var b = bridge(); if (b && b.reset) b.reset(); completed = false; },
    focus: function () {
      var h = document.getElementById('gameHeading') || document.querySelector('#screen-game') || document.querySelector('.app');
      if (h) { try { h.setAttribute('tabindex', h.getAttribute('tabindex') || '-1'); h.focus({ preventScroll: true }); } catch (e) {} }
    },
    setPreviewVisible: function (v) { window.TW.preview = !!v; de.classList.toggle('no-preview', !v); },
    setCompactMode: function (en) { window.TW.compact = !!en; de.classList.toggle('controls-compact', !!en); },
    setMuted: function (m) { var b = bridge(); if (b && b.setMuted) b.setMuted(!!m); window.TW.muted = !!m; },
    getState: function () {
      var b = bridge();
      return {
        isEmbed: embed, preview: window.TW.preview, compact: window.TW.compact,
        theme: theme, lang: (de.lang || 'ko'),
        screen: document.body.dataset.screen,
        paused: !!(b && b.paused), muted: !!(b && b.muted),
        progress: (b && b.getProgress) ? b.getProgress() : null,
      };
    },
    destroy: function () {
      try { window.removeEventListener('message', onMessage); } catch (e) {}
      try { window.removeEventListener('resize', onResize); } catch (e) {}
      try { if (ro) ro.disconnect(); } catch (e) {}
      try { if (screenObs) screenObs.disconnect(); } catch (e) {}
      try { if (pollId) clearInterval(pollId); } catch (e) {}
      this.__ready = false;
    },
  };
  window.DotForestEmbed = API;

  /* ---- 텔레메트리: PROGRESS / TACTILE_UPDATE / COMPLETE (throttled, 변화 시에만) ---- */
  function tick() {
    var b = bridge(); if (!b || !b.getProgress) return;
    var p = b.getProgress();
    var st = b.state || {};
    var pl = st.player || { x: 0, z: 0 };
    var key = p.areaId + ':' + p.collected + ':' + Math.round(pl.x) + ':' + Math.round(pl.z);
    if (key === lastProgressKey) return;          // 변화 없으면 발신 안 함
    lastProgressKey = key;

    var missionId = (window.DotForest.narrative && window.DotForest.narrative.get)
      ? ((window.DotForest.narrative.get('mission') || {}).id || null) : null;
    emit('DOT_FOREST_PROGRESS', { missionId: missionId, collected: p.collected, total: p.total, areaId: p.areaId });

    // 60×40 전체 matrix 대신 요약만 (성능 보호)
    var itemsLeft = (st.items || []).filter(function (i) { return !i.collected; }).length;
    emit('DOT_FOREST_TACTILE_UPDATE', {
      width: 60, height: 40,
      matrixSummary: { areaId: p.areaId, player: { x: Math.round(pl.x), z: Math.round(pl.z) },
        itemsLeft: itemsLeft, hazards: (st.hazards || []).length, forestLight: +(p.forestLight || 0).toFixed(2) },
    });

    if (!completed && (p.grandTotal ? p.collected >= p.grandTotal : false) || (p.forestLight >= 0.999)) {
      completed = true;
      emit('DOT_FOREST_COMPLETE', { missionId: missionId, score: p.collected, time: Math.round(performance.now() / 1000) });
    }
  }

  /* ---- 리사이즈 → 게임 onResize 재사용 + 부모 통지 ---- */
  var rt;
  function onResize() { clearTimeout(rt); rt = setTimeout(function () { window.TWBridge.resize(window.innerWidth, window.innerHeight); }, 150); }

  var ro = null, screenObs = null, pollId = null;
  function onReady() {
    try {
      emit('DOT_FOREST_LOADED', {});
      window.addEventListener('message', onMessage);
      window.addEventListener('resize', onResize);

      var stage = document.getElementById('gameCanvas') || document.querySelector('.game-canvas') || document.querySelector('.app');
      if (stage && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(function () { window.dispatchEvent(new Event('resize')); });
        ro.observe(stage);
      }
      // 화면이 game으로 바뀌면 STARTED 1회
      screenObs = new MutationObserver(function () {
        if (document.body.dataset.screen === 'game' && !started) { started = true; emit('DOT_FOREST_STARTED', {}); }
      });
      screenObs.observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });

      if (lang) setTimeout(function () { applyLang(lang); }, 80);
      if (autostart) setTimeout(function () { API.start(); }, 60);   // 오디오는 첫 입력 후 unlockAudio가 처리

      // bridge 준비되면 READY, 이후 저속 폴링으로 텔레메트리
      var waitBridge = setInterval(function () {
        if (bridge()) { clearInterval(waitBridge); emit('DOT_FOREST_READY', { game: 'dot-forest', version: '1.1.0' }); pollId = setInterval(tick, 500); }
      }, 100);
    } catch (err) {
      emit('DOT_FOREST_ERROR', { message: String(err && err.message || err), code: 'INIT' });
    }
  }
  window.addEventListener('error', function (e) { emit('DOT_FOREST_ERROR', { message: String(e.message || 'error'), code: 'RUNTIME' }); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
