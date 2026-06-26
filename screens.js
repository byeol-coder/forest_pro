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
