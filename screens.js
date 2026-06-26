/* ===========================================================
   Dot Forest — screen router (title / game / settings)
   Non-invasive: does NOT touch game logic in script.js.
   - toggles which screen is visible
   - resizes the 3D canvas when the game screen first appears
   - mirrors DotPad connection state into the game HUD pill
   - drives the language toggle from the Settings segmented control
   - blocks movement keys from reaching the game while off the game screen
   =========================================================== */
(function () {
  const SCREENS = { title: 'screen-title', game: 'screen-game', settings: 'screen-settings' };
  const HEADINGS = { title: 'titleHeading', game: 'gameHeading', settings: 'settingsHeading' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const independentStart = { active: false, trigger: null };
  let current = 'title';

  function show(name) {
    if (!SCREENS[name] || name === current) return;

    const prevName = current;

    // BrowserQuest / Phaser 패턴: 나가는 화면은 먼저 fade-out, 그 후 새 화면 진입
    function commit() {
      current = name;
      Object.keys(SCREENS).forEach((key) => {
        const el = document.getElementById(SCREENS[key]);
        if (!el) return;
        const active = key === name;
        el.classList.remove('is-leaving');
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      document.body.dataset.screen = name;

      // The 3D canvas may have initialised at 0×0 while hidden — re-measure it.
      if (name === 'game') {
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      }

      const heading = document.getElementById(HEADINGS[name]);
      if (heading) heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    const prevEl = document.getElementById(SCREENS[prevName]);
    if (prevEl && prevEl.classList.contains('is-active') && !reduceMotion) {
      prevEl.classList.add('is-leaving');
      setTimeout(commit, 185);
    } else {
      if (prevEl) prevEl.classList.remove('is-leaving');
      commit();
    }
  }

  function sayIndependentStart(message) {
    const live = document.getElementById('liveStatus');
    if (live) live.textContent = message;
    const narrative = window.DotForest && window.DotForest.narrative;
    if (narrative && typeof narrative.say === 'function') {
      narrative.say(message, 'assertive');
      return;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = document.documentElement.lang === 'en' ? 'en-US' : 'ko-KR';
        window.speechSynthesis.speak(utterance);
      } catch (error) {}
    }
  }

  function restoreOnboardingButtons() {
    const back = document.getElementById('onboardingBack');
    const next = document.getElementById('onboardingNext');
    const start = document.getElementById('onboardingStart');
    if (back) back.textContent = '이전';
    if (next) next.textContent = '다음';
    if (start) start.textContent = '게임 시작';
  }

  function closeIndependentStart() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.hidden = true;
    independentStart.active = false;
    restoreOnboardingButtons();
  }

  function openIndependentStart(trigger) {
    const overlay = document.getElementById('onboardingOverlay');
    const dialog = document.getElementById('onboardingDialog');
    const progress = document.getElementById('onboardingProgress');
    const title = document.getElementById('onboardingTitle');
    const text = document.getElementById('onboardingText');
    const details = document.getElementById('onboardingDetails');
    const back = document.getElementById('onboardingBack');
    const next = document.getElementById('onboardingNext');
    const start = document.getElementById('onboardingStart');
    if (!overlay || !dialog || !progress || !title || !text || !details || !next || !start) return false;

    independentStart.active = true;
    independentStart.trigger = trigger || document.activeElement;
    overlay.hidden = false;
    progress.textContent = '독립 플레이 모드';
    title.textContent = '혼자 시작할 준비';
    text.textContent = '첫 스테이지에 들어가기 전에 핵심 조작과 길을 잃었을 때의 복구 방법을 확인합니다.';
    details.innerHTML = '<ol>'
      + '<li>이동: 방향키 또는 W A S D, DotPad는 PanningLeft·PanningRight와 위·아래 패닝 조합을 사용합니다.</li>'
      + '<li>수집/확인: F2 또는 Enter/Space를 누릅니다.</li>'
      + '<li>길을 잃었을 때: F4를 누르면 현재 위치, 가까운 목표, 위험, 추천 방향을 다시 듣고 촉각 프레임을 재전송합니다.</li>'
      + '<li>촉각 지도: 루미는 가장 강한 2×2 블록, 목표는 다이아몬드, 위험은 X 패턴입니다.</li>'
      + '</ol>';
    if (back) {
      back.hidden = true;
      back.disabled = false;
      back.textContent = '이전';
    }
    next.hidden = false;
    next.disabled = false;
    next.textContent = '조작 연습 듣기';
    start.hidden = false;
    start.disabled = false;
    start.textContent = '첫 스테이지 시작';
    window.setTimeout(() => dialog.focus(), 0);
    sayIndependentStart(`${title.textContent}. ${text.textContent} 바로 시작하려면 첫 스테이지 시작을 누르세요. 조작을 먼저 익히려면 조작 연습 듣기를 누르세요.`);
    return true;
  }

  function beginIndependentFirstStage() {
    closeIndependentStart();
    show('game');
    window.setTimeout(() => {
      const situation = window.DotForest
        && window.DotForest.bridge
        && typeof window.DotForest.bridge.describeCurrentSituation === 'function'
        ? window.DotForest.bridge.describeCurrentSituation()
        : 'F4를 누르면 현재 위치와 추천 방향을 다시 들을 수 있습니다.';
      sayIndependentStart(`독립 플레이 준비가 끝났습니다. 첫 스테이지를 시작합니다. ${situation}`);
      const heading = document.getElementById('gameHeading');
      if (heading) heading.focus({ preventScroll: true });
    }, 300);
  }

  function openPracticeFromIndependentStart() {
    closeIndependentStart();
    const practice = document.getElementById('practiceControls');
    if (practice) window.setTimeout(() => practice.click(), 0);
    else if (independentStart.trigger && independentStart.trigger.focus) independentStart.trigger.focus();
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-title-action="independent-start"]');
    if (!trigger || !openIndependentStart(trigger)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);

  document.addEventListener('click', (e) => {
    if (!independentStart.active) return;
    if (e.target.closest('#onboardingStart')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      beginIndependentFirstStage();
    } else if (e.target.closest('#onboardingNext')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openPracticeFromIndependentStart();
    } else if (e.target.closest('#onboardingClose')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closeIndependentStart();
      if (independentStart.trigger && independentStart.trigger.focus) independentStart.trigger.focus();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!independentStart.active || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeIndependentStart();
    if (independentStart.trigger && independentStart.trigger.focus) independentStart.trigger.focus();
  }, true);

  // --- navigation buttons ([data-nav="title|game|settings"]) ---
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    // 임베드에서 'title' 이동은 숨긴 타이틀로 가지 않고 부모(TW) 종료 신호로 치환
    if (window.TW && window.TW.embed && nav.dataset.nav === 'title') {
      e.preventDefault();
      if (window.TWBridge) window.TWBridge.exit('user');
      return;
    }
    show(nav.dataset.nav);
  });
  document.addEventListener('dotforest:navigate', (e) => {
    const name = e.detail && e.detail.screen;
    if (name) show(name);
  });
  window.DotForest = window.DotForest || {};
  window.DotForest.showScreen = show;

  // --- ESC from settings returns to the game ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current === 'settings') show('game');
  });

  // --- block movement keys off the game screen (capture phase, before script.js) ---
  const MOVE_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
  ]);
  document.addEventListener('keydown', (e) => {
    if (current === 'game' || !MOVE_KEYS.has(e.key)) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') e.stopPropagation();
  }, true);

  // --- mirror DotPad connection state into HUD pill(s) ---
  const stateEl = document.getElementById('dotpadState');
  const mirrors = document.querySelectorAll('.dotpad-mirror');
  function syncMirror() {
    if (!stateEl) return;
    const connected = stateEl.classList.contains('connected');
    mirrors.forEach((m) => {
      m.textContent = stateEl.textContent;
      m.classList.toggle('connected', connected);
    });
  }
  if (stateEl) {
    syncMirror();
    new MutationObserver(syncMirror).observe(stateEl, {
      attributes: true, childList: true, characterData: true, subtree: true,
    });
  }

  // --- language segmented control drives the existing #langToggle ---
  const seg = document.getElementById('langSeg');
  function currentLang() {
    const lt = document.getElementById('langToggle');
    if (!lt) return document.documentElement.lang || 'ko';
    // #langToggle shows the language it will switch TO: 'EN' means we're on ko.
    return lt.textContent.trim() === 'EN' ? 'ko' : 'en';
  }
  function refreshSeg() {
    if (!seg) return;
    const cur = currentLang();
    seg.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === cur));
  }
  if (seg) {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lang]');
      if (!btn) return;
      const lt = document.getElementById('langToggle');
      if (lt && currentLang() !== btn.dataset.lang) lt.click();
      setTimeout(refreshSeg, 40);
    });
    setTimeout(refreshSeg, 60);
  }

  // --- start on the title screen (embed: jump straight to the game) ---
  show(window.TW && window.TW.embed ? 'game' : 'title');
})();
