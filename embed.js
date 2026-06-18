/* ============================================================
   Dot Forest — TW(Tactile World) embed integration layer
   - ?embed / ?preview / ?lang 파싱 → html 클래스 토글 (CSS가 표시/숨김 처리)
   - 부모(TW) <-> 자식 postMessage 브리지 (오리진 검증, '*' 미사용)
   - ResizeObserver로 컨테이너 크기 변화 시 게임 리사이즈 트리거
   게임 로직(script.js)은 건드리지 않음. screens.js / script.js 보다 먼저 로드.
   ============================================================ */
(function () {
  var Q = new URLSearchParams(location.search);
  // iframe(예: TW) 안에서 실행되면 ?embed=1 이 없어도 자동 임베드 모드.
  // top-level 단독 실행(직접 접속)은 그대로 타이틀부터. ?embed=0 으로 강제 해제 가능.
  var inIframe = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  window.TW = {
    embed:   Q.get('embed') === '1' || (inIframe && Q.get('embed') !== '0'),
    preview: Q.get('preview') !== '0',   // 기본 표시, ?preview=0 일 때만 숨김
    lang:    Q.get('lang') || null,
  };
  var root = document.documentElement;
  root.classList.toggle('is-embed', window.TW.embed);
  root.classList.toggle('no-preview', !window.TW.preview);
  if (window.TW.lang) { try { root.lang = window.TW.lang; } catch (e) {} }

  /* ---- 부모(TW) 오리진 허용 목록 — 배포 시 실제 TW 오리진으로 갱신 ---- */
  var TW_ORIGINS = [
    'https://tib-preview.vercel.app',
    'https://tactile-world.example'
  ];
  function refOrigin() { try { return document.referrer ? new URL(document.referrer).origin : ''; } catch (e) { return ''; } }
  var TARGET = (TW_ORIGINS.indexOf(refOrigin()) !== -1) ? refOrigin() : (TW_ORIGINS[0] || '');

  var TWBridge = {
    post: function (type, payload) {
      if (window.parent === window || !TARGET) return;   // 단독 실행/대상 미확정이면 no-op ('*' 미사용)
      try { window.parent.postMessage({ source: 'dotforest', type: type, payload: payload || {} }, TARGET); } catch (e) {}
    },
    ready:  function () { this.post('dotforest:ready', { game: 'dot-forest', version: '1.0.0' }); },
    resize: function (w, h) { this.post('dotforest:resize', { width: w, height: h }); },
    exit:   function (reason) { this.post('dotforest:exit', { reason: reason || 'user' }); }
  };
  window.TWBridge = TWBridge;

  /* ---- 부모 → 자식 수신 (오리진 검증 필수) ---- */
  window.addEventListener('message', function (e) {
    if (TW_ORIGINS.indexOf(e.origin) === -1) return;
    var d = e.data || {}; var type = d.type;
    if (type === 'tw:pause')  { try { window.DotForest && DotForest.bridge && DotForest.bridge.pause && DotForest.bridge.pause(); } catch (x) {} }
    if (type === 'tw:resume') { try { window.DotForest && DotForest.bridge && DotForest.bridge.resume && DotForest.bridge.resume(); } catch (x) {} }
    if (type === 'tw:setLang') {
      var lt = document.getElementById('langToggle');
      var cur = (document.documentElement.lang || 'ko');
      if (lt && d.payload && d.payload.lang && d.payload.lang !== cur) lt.click();
    }
  });

  /* ---- DOM 준비 후: 컨테이너 리사이즈 관찰 + ready 알림 ---- */
  function onReady() {
    var stage = document.getElementById('gameCanvas') || document.querySelector('.game-canvas') || document.querySelector('.app');
    if (stage && typeof ResizeObserver !== 'undefined') {
      try {
        var ro = new ResizeObserver(function () { window.dispatchEvent(new Event('resize')); });
        ro.observe(stage);
      } catch (e) {}
    }
    TWBridge.ready();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
