/* ===========================================================
   Dot Forest — low-vision / hybrid accessibility engine
   Standalone, additive. Does not touch game or narrative logic.
   - persists visual prefs (contrast / scale / palette / captions
     / cues / tactile zoom) and applies them via data-a11y-* attrs
   - mirrors aria-live narration into an on-screen caption bar
   - mirrors spatial audio cues (dotforest:cue) into directional
     visual indicators (edge glow + labeled chip + hit flash)
   =========================================================== */
(function () {
  const KEY = 'dotforest.a11y';
  const root = document.documentElement;
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const defaults = {
    contrast: false,
    scale: 1,            // 1 | 1.25 | 1.5
    palette: false,      // high-visibility colors
    captions: true,      // narration caption bar
    cues: true,          // visual audio-cue indicators
    tactileZoom: false,
  };
  const state = Object.assign({}, defaults);
  try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(state, JSON.parse(raw)); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- i18n for dynamic cue labels ---------- */
  function lang() { return (window.DotForest && window.DotForest.lang) || 'ko'; }
  const STR = {
    hazardNear: { ko: '그림자 접근', en: 'Shadow nearby' },
    hazardHit:  { ko: '그림자 충돌!', en: 'Shadow hit!' },
    water:      { ko: '깊은 물', en: 'Deep water' },
    left:       { ko: '왼쪽', en: 'Left' },
    right:      { ko: '오른쪽', en: 'Right' },
  };
  function t(k) { const e = STR[k]; return e ? (e[lang()] || e.ko) : k; }

  /* ---------- apply settings to the document ---------- */
  function setAttr(name, on, val) { if (on) root.setAttribute(name, val); else root.removeAttribute(name); }
  function apply() {
    root.style.setProperty('--a11y-scale', String(state.scale || 1));
    setAttr('data-a11y-contrast', state.contrast, 'high');
    setAttr('data-a11y-palette', state.palette, 'hv');
    setAttr('data-a11y-captions', state.captions, 'on');
    setAttr('data-a11y-tactile', state.tactileZoom, 'zoom');
  }

  /* ---------- overlay DOM (caption bar + cue indicators) ---------- */
  let capEl, capText, capTimer = 0;
  let cueWrap, edgeL, edgeR, chip, chipArrow, chipIcon, chipLabel, chipBar, hitFlash;
  let cueTimer = 0, lastCapText = '';

  function buildOverlay() {
    const host = document.querySelector('#screen-game .stage--game') || document.getElementById('screen-game');
    if (!host || document.getElementById('a11yCaption')) return;

    cueWrap = document.createElement('div');
    cueWrap.id = 'a11yCueLayer';
    cueWrap.setAttribute('aria-hidden', 'true'); // visual mirror only; SR already gets aria-live
    cueWrap.innerHTML =
      '<div class="a11y-edge left"></div>' +
      '<div class="a11y-edge right"></div>' +
      '<div id="a11yHitFlash"></div>' +
      '<div class="a11y-cue-chip" id="a11yCueChip">' +
        '<span class="chip-arrow"></span>' +
        '<span class="chip-icon"></span>' +
        '<span class="chip-label"></span>' +
        '<span class="chip-bar"><i></i></span>' +
      '</div>';
    host.appendChild(cueWrap);

    capEl = document.createElement('div');
    capEl.id = 'a11yCaption';
    capEl.setAttribute('aria-hidden', 'true');
    capEl.innerHTML = '<span class="cap-text"></span>';
    host.appendChild(capEl);

    capText = capEl.querySelector('.cap-text');
    edgeL = cueWrap.querySelector('.a11y-edge.left');
    edgeR = cueWrap.querySelector('.a11y-edge.right');
    chip = cueWrap.querySelector('#a11yCueChip');
    chipArrow = chip.querySelector('.chip-arrow');
    chipIcon = chip.querySelector('.chip-icon');
    chipLabel = chip.querySelector('.chip-label');
    chipBar = chip.querySelector('.chip-bar i');
    hitFlash = cueWrap.querySelector('#a11yHitFlash');
  }

  /* ---------- caption bar (mirrors aria-live narration) ---------- */
  function showCaption(text, assertive) {
    if (!state.captions || !capEl || !capText) return;
    text = (text || '').trim();
    if (!text || text === lastCapText) return;
    lastCapText = text;
    capText.textContent = text;
    capEl.classList.toggle('is-alert', !!assertive);
    capEl.classList.remove('show'); void capEl.offsetWidth; capEl.classList.add('show');
    clearTimeout(capTimer);
    // keep readable: ~ reading time, min 4s, max 9s
    const dur = Math.min(9000, Math.max(4000, text.length * 90));
    capTimer = window.setTimeout(() => { if (capEl) capEl.classList.remove('show', 'is-alert'); capText.textContent = ''; lastCapText = ''; }, dur);
  }

  const attached = new WeakSet();
  function attachCaptionSources() {
    // #liveStatus (game) is assertive-ish status; narration regions are made by narrative-engine
    const sources = [
      { id: 'narrationAssertive', assertive: true },
      { id: 'narrationPolite', assertive: false },
      { id: 'liveStatus', assertive: false },
    ];
    sources.forEach((s) => {
      const el = document.getElementById(s.id);
      if (!el || attached.has(el)) return;
      attached.add(el);
      const obs = new MutationObserver(() => showCaption(el.textContent, s.assertive));
      obs.observe(el, { childList: true, characterData: true, subtree: true });
      if (el.textContent) showCaption(el.textContent, s.assertive);
    });
  }

  /* ---------- directional audio-cue indicators ---------- */
  function sideOf(pan) { return pan < -0.18 ? 'left' : pan > 0.18 ? 'right' : 'center'; }
  function colorVar(type, level) {
    if (type === 'water') return 'var(--a11y-water)';
    if (level === 'hit') return 'var(--a11y-hit)';
    return 'var(--a11y-warn)';
  }

  function onCue(detail) {
    if (!state.cues || !cueWrap) return;
    if (document.body.dataset.screen !== 'game') return;
    const { type, level, pan = 0, intensity = 0.5 } = detail || {};
    const side = sideOf(pan);
    const color = colorVar(type, level);
    cueWrap.style.setProperty('--a11y-cue-color', color);

    // edge glow on the relevant side (both for center)
    const strength = level === 'hit' ? 0.85 : Math.max(0.3, Math.min(0.85, 0.3 + intensity * 0.6));
    [edgeL, edgeR].forEach((e) => { e.style.setProperty('--a11y-cue-color', color); e.style.setProperty('--edge-strength', strength); e.classList.remove('on'); });
    if (side === 'left' || side === 'center') edgeL.classList.add('on');
    if (side === 'right' || side === 'center') edgeR.classList.add('on');

    // labeled chip
    let icon, label, arrow = '';
    if (type === 'water') { icon = '💧'; label = t('water'); }
    else if (level === 'hit') { icon = '💥'; label = t('hazardHit'); }
    else { icon = '⚠'; label = t('hazardNear'); }
    if (side === 'left') arrow = '◀';
    else if (side === 'right') arrow = '▶';
    chipArrow.textContent = arrow;
    chipIcon.textContent = icon;
    chipLabel.textContent = side === 'center' ? label : label + ' · ' + t(side);
    chipBar.parentElement.style.display = (level === 'hit') ? 'none' : '';
    chipBar.style.setProperty('--chip-strength', Math.round(Math.min(1, intensity) * 100) + '%');
    chipBar.style.width = Math.round(Math.min(1, intensity) * 100) + '%';
    chip.classList.remove('show'); void chip.offsetWidth; chip.classList.add('show');

    if (level === 'hit' && hitFlash && !REDUCE) {
      hitFlash.classList.remove('flash'); void hitFlash.offsetWidth; hitFlash.classList.add('flash');
    }

    clearTimeout(cueTimer);
    cueTimer = window.setTimeout(clearCues, level === 'hit' ? 600 : 480);
  }
  function clearCues() {
    if (!cueWrap) return;
    edgeL.classList.remove('on'); edgeR.classList.remove('on');
    chip.classList.remove('show');
  }

  /* ---------- settings UI wiring ---------- */
  function wireSettings() {
    const bind = (id, key, onChange) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = !!state[key];
      el.addEventListener('change', () => { state[key] = el.checked; save(); apply(); if (onChange) onChange(); });
    };
    bind('a11yContrast', 'contrast');
    bind('a11yPalette', 'palette');
    bind('a11yCaptions', 'captions', () => { if (!state.captions && capEl) { capEl.classList.remove('show', 'is-alert'); lastCapText = ''; } });
    bind('a11yCues', 'cues', () => { if (!state.cues) clearCues(); });
    bind('a11yTactileZoom', 'tactileZoom');

    const seg = document.getElementById('a11yScaleSeg');
    if (seg) {
      const btns = Array.from(seg.querySelectorAll('[data-scale]'));
      const sync = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(parseFloat(b.dataset.scale) === state.scale)));
      btns.forEach((b) => b.addEventListener('click', () => { state.scale = parseFloat(b.dataset.scale) || 1; save(); apply(); sync(); }));
      sync();
    }
  }

  /* ---------- public API ---------- */
  function exposeApi() {
    window.DotForest = window.DotForest || {};
    window.DotForest.a11y = {
      get: () => ({ ...state }),
      set: (patch) => { Object.assign(state, patch || {}); save(); apply(); },
      caption: showCaption,
    };
  }

  /* ---------- init ---------- */
  function init() {
    apply();
    buildOverlay();
    wireSettings();
    attachCaptionSources();
    exposeApi();
    window.addEventListener('dotforest:cue', (e) => onCue(e.detail));
    // narration regions are created by narrative-engine after load — retry to catch them
    window.setTimeout(attachCaptionSources, 1200);
    window.addEventListener('load', attachCaptionSources);
    // re-localize chip text on language change (next cue picks it up automatically)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
