/* ===========================================================
   Dot Forest — UI Controls (게임 UI 상호작용 레이어)
   역할: 도움말 오버레이, 결과 화면, TTS 패널, DotPad 콤팩트 카드,
         챕터 배지 업데이트, TTS 토글 버튼
   screens.js / script.js / narrative-engine.js 에서 독립적으로 동작.
   =========================================================== */
(function () {
  'use strict';

  /* ---- helpers ---- */
  const $ = (id) => document.getElementById(id);
  const onGame = () => document.body.dataset.screen === 'game';

  /* ===========================================================
     1. 도움말 오버레이 (Help Overlay)
     =========================================================== */
  function initHelp() {
    const btn    = $('helpBtn');
    const overlay = $('helpOverlay');
    const closeBtn = $('helpClose');
    if (!btn || !overlay) return;

    function open() {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      // focus first focusable element
      const first = overlay.querySelector('button, [tabindex="0"], a');
      if (first) first.focus();
      document.addEventListener('keydown', onEsc);
    }
    function close() {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      btn.focus();
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }

    btn.addEventListener('click', () => overlay.hidden ? open() : close());
    if (closeBtn) closeBtn.addEventListener('click', close);
    // close on backdrop click
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  /* ===========================================================
     2. 결과 오버레이 (Result Overlay)
     =========================================================== */
  function showResult(opts) {
    /* opts: { badge?, title?, subtitle?, collected?, light?, companions? } */
    const overlay  = $('resultOverlay');
    if (!overlay) return;
    const o = opts || {};
    const setText = (id, val) => { const el = $(id); if (el && val !== undefined) el.textContent = val; };

    setText('resultBadge',      o.badge      || '챕터 완료');
    setText('resultTitle',      o.title      || '숲이 깨어났어요!');
    setText('resultSubtitle',   o.subtitle   || '루미가 도트링을 모두 모아 숲의 빛을 되살렸습니다.');
    setText('resultCollected',  o.collected  !== undefined ? o.collected : '—');
    setText('resultLight',      o.light      !== undefined ? o.light + '%' : '—');
    setText('resultCompanions', o.companions !== undefined ? o.companions : '—');

    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('show');
    // focus first button
    const first = overlay.querySelector('.result-btn');
    if (first) setTimeout(() => first.focus(), 400);
  }

  function hideResult() {
    const overlay = $('resultOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function initResultOverlay() {
    const nextBtn  = $('resultNext');
    const replayBtn = $('resultReplay');
    const retryBtn  = $('resultRetry');

    if (nextBtn) nextBtn.addEventListener('click', () => {
      hideResult();
      // advance story if narrative API available
      const narrative = window.DotForest && window.DotForest.narrative;
      if (narrative) narrative.infoAction('mission');
    });
    if (replayBtn) replayBtn.addEventListener('click', () => {
      const narrative = window.DotForest && window.DotForest.narrative;
      if (narrative) narrative.infoAction('mission');
      // also replay TTS
      if (window.DotForest && window.DotForest.tts) window.DotForest.tts.replay();
    });
    if (retryBtn) retryBtn.addEventListener('click', () => {
      hideResult();
      const narrative = window.DotForest && window.DotForest.narrative;
      if (narrative) narrative.reset();
      const resetBtn = $('resetButton');
      if (resetBtn) resetBtn.click();
    });

    // expose globally for narrative-engine / script.js to call
    window.DotForest = window.DotForest || {};
    window.DotForest.ui = window.DotForest.ui || {};
    window.DotForest.ui.showResult = showResult;
    window.DotForest.ui.hideResult = hideResult;
  }

  /* ===========================================================
     3. TTS 토글 버튼 (HUD)
     =========================================================== */
  function initTTSToggle() {
    const btn = $('ttsToggleBtn');
    if (!btn) return;

    function getEnabled() {
      const tts = window.DotForest && window.DotForest.tts;
      if (tts) return tts.getStatus().enabled;
      const settings = window.DotForest && window.DotForest.narrative && window.DotForest.narrative.get('settings');
      return settings ? settings.ttsEnabled : true;
    }

    function sync() {
      const enabled = getEnabled();
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      btn.setAttribute('aria-label', enabled ? '음성 내레이션 끄기 (TTS)' : '음성 내레이션 켜기 (TTS)');
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel  = $('ttsPanelOverlay');
      const tts    = window.DotForest && window.DotForest.tts;
      const newVal = !getEnabled();

      if (tts) {
        tts.setEnabled(newVal);
      } else {
        const settings = window.DotForest && window.DotForest.narrative && window.DotForest.narrative.get('settings');
        if (settings) {
          settings.ttsEnabled = newVal;
          if (!newVal && 'speechSynthesis' in window) window.speechSynthesis.cancel();
          const settToggle = $('ttsToggle');
          if (settToggle) settToggle.checked = newVal;
          try { localStorage.setItem('dotforest.settings', JSON.stringify(settings)); } catch (_) {}
        }
      }
      sync();

      // also open/close panel
      if (panel) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          const first = panel.querySelector('select, input, button');
          if (first) first.focus();
          setTimeout(() => {
            document.addEventListener('click', closePanelOutside, { once: true, capture: true });
          }, 0);
        }
      }
    });

    function closePanelOutside(e) {
      const panel = $('ttsPanelOverlay');
      if (panel && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
    }

    document.addEventListener('dotforest:tts-status', sync);
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
    document.addEventListener('dotforest:lang', sync);
    sync();
  }

  /* ===========================================================
     4. TTS 설정 패널 (Web Speech + GPT-SoVITS)
     =========================================================== */
  function initTTSPanel() {
    const rateSlider  = $('ttsRateSlider');
    const rateVal     = $('ttsRateVal');
    const pitchSlider = $('ttsPitchSlider');
    const pitchVal    = $('ttsPitchVal');
    const voiceSel    = $('ttsVoiceSelect');
    const stopBtn     = $('ttsStopBtn');
    const replayBtn   = $('ttsReplayBtn');
    const modeLbl     = $('ttsModeLabel');
    const modeDesc    = $('ttsModeDesc');

    /* ---- 모드 상태 표시 ---- */
    function syncModeLabel(detail) {
      if (!modeLbl || !modeDesc) return;
      const mode = (detail && detail.mode) || 'webspeech';
      if (mode === 'gptsovits') {
        modeLbl.textContent = 'GPT-SoVITS';
        modeLbl.className   = 'tts-mode-badge gptsovits';
        modeDesc.textContent = '고품질 로컬 신경망 TTS';
      } else {
        modeLbl.textContent = 'Web Speech';
        modeLbl.className   = 'tts-mode-badge';
        modeDesc.textContent = '브라우저 내장 TTS';
      }
    }
    document.addEventListener('dotforest:tts-status', (e) => syncModeLabel(e.detail));

    /* ---- Web Speech: 속도 슬라이더 ---- */
    if (rateSlider) {
      const loadRate = () => {
        const tts = window.DotForest && window.DotForest.tts;
        const val = tts ? tts.getConfig().webspeech.rate : 0.92;
        rateSlider.value = val;
        if (rateVal) rateVal.textContent = parseFloat(val).toFixed(2);
      };
      setTimeout(loadRate, 500);
      rateSlider.addEventListener('input', () => {
        const v = parseFloat(rateSlider.value);
        if (rateVal) rateVal.textContent = v.toFixed(2);
        const tts = window.DotForest && window.DotForest.tts;
        if (tts) tts.setConfig({ webspeech: { rate: v } });
      });
    }

    /* ---- Web Speech: 음높이 슬라이더 ---- */
    if (pitchSlider) {
      const loadPitch = () => {
        const tts = window.DotForest && window.DotForest.tts;
        const val = tts ? tts.getConfig().webspeech.pitch : 1.0;
        pitchSlider.value = val;
        if (pitchVal) pitchVal.textContent = parseFloat(val).toFixed(2);
      };
      setTimeout(loadPitch, 500);
      pitchSlider.addEventListener('input', () => {
        const v = parseFloat(pitchSlider.value);
        if (pitchVal) pitchVal.textContent = v.toFixed(2);
        const tts = window.DotForest && window.DotForest.tts;
        if (tts) tts.setConfig({ webspeech: { pitch: v } });
      });
    }

    /* ---- Web Speech: 음성 목록 ---- */
    if (voiceSel) {
      const populate = () => {
        const tts = window.DotForest && window.DotForest.tts;
        if (!tts) return;
        const voices = tts.getVoices();
        if (!voices || !voices.length) return;
        const cur  = tts.getSelectedVoice();
        const lang = (window.DotForest && window.DotForest.lang) || 'ko';
        const filt = voices.filter(v => v.lang.startsWith(lang === 'en' ? 'en' : 'ko'));
        voiceSel.innerHTML = '';
        (filt.length ? filt : voices).forEach(v => {
          const opt = document.createElement('option');
          opt.value       = v.name;
          opt.textContent = v.name + ' (' + v.lang + ')';
          if (cur && v.name === cur.name) opt.selected = true;
          voiceSel.appendChild(opt);
        });
      };
      setTimeout(populate, 900);
      voiceSel.addEventListener('change', () => {
        const tts = window.DotForest && window.DotForest.tts;
        if (tts) tts.setVoiceByName(voiceSel.value);
      });
      document.addEventListener('dotforest:lang', () => setTimeout(populate, 150));
    }

    /* ---- GPT-SoVITS 설정 ---- */
    const gsvEnabled   = $('ttsGSVEnabled');
    const gsvEndpoint  = $('ttsGSVEndpoint');
    const gsvRefAudio  = $('ttsGSVRefAudio');
    const gsvPromptTxt = $('ttsGSVPromptText');
    const gsvSpeed     = $('ttsGSVSpeed');
    const gsvSpeedVal  = $('ttsGSVSpeedVal');
    const gsvTestBtn   = $('ttsGSVTestBtn');
    const gsvStatus    = $('ttsGSVStatus');

    /* sync from saved config */
    const loadGSVConfig = () => {
      const tts = window.DotForest && window.DotForest.tts;
      if (!tts) return;
      const c = tts.getConfig();
      const g = c.gptsovits;
      if (gsvEnabled)   gsvEnabled.checked   = !!(c.mode !== 'webspeech' && g.enabled);
      if (gsvEndpoint)  gsvEndpoint.value     = g.endpoint  || 'http://127.0.0.1:9880';
      if (gsvRefAudio)  gsvRefAudio.value     = g.refAudio  || '';
      if (gsvPromptTxt) gsvPromptTxt.value    = g.promptText || '';
      if (gsvSpeed)     { gsvSpeed.value = g.speedFactor || 1.0; if (gsvSpeedVal) gsvSpeedVal.textContent = parseFloat(g.speedFactor || 1.0).toFixed(1) + '×'; }
    };
    setTimeout(loadGSVConfig, 600);

    function saveGSVConfig() {
      const tts = window.DotForest && window.DotForest.tts;
      if (!tts) return;
      tts.setConfig({
        mode: (gsvEnabled && gsvEnabled.checked) ? 'auto' : 'webspeech',
        gptsovits: {
          enabled:     !!(gsvEnabled && gsvEnabled.checked),
          endpoint:    gsvEndpoint  ? gsvEndpoint.value.trim()  : 'http://127.0.0.1:9880',
          refAudio:    gsvRefAudio  ? gsvRefAudio.value.trim()  : '',
          promptText:  gsvPromptTxt ? gsvPromptTxt.value.trim() : '',
          speedFactor: gsvSpeed     ? parseFloat(gsvSpeed.value) : 1.0,
        }
      });
    }

    if (gsvEnabled)   gsvEnabled.addEventListener  ('change', saveGSVConfig);
    if (gsvEndpoint)  gsvEndpoint.addEventListener ('change', saveGSVConfig);
    if (gsvRefAudio)  gsvRefAudio.addEventListener ('change', saveGSVConfig);
    if (gsvPromptTxt) gsvPromptTxt.addEventListener('change', saveGSVConfig);
    if (gsvSpeed)     gsvSpeed.addEventListener    ('input', () => {
      const v = parseFloat(gsvSpeed.value);
      if (gsvSpeedVal) gsvSpeedVal.textContent = v.toFixed(1) + '×';
      saveGSVConfig();
    });

    /* 연결 테스트 */
    if (gsvTestBtn) {
      gsvTestBtn.addEventListener('click', async () => {
        const tts = window.DotForest && window.DotForest.tts;
        if (!tts) return;
        gsvTestBtn.classList.add('testing');
        gsvTestBtn.disabled = true;
        const icon = $('ttsGSVTestIcon');
        if (icon) icon.textContent = '⏳';
        const endpoint = gsvEndpoint ? gsvEndpoint.value.trim() : '';
        try {
          const ok = await tts.checkConnection(endpoint);
          if (gsvStatus) {
            gsvStatus.hidden = false;
            gsvStatus.className = 'tts-connect-status ' + (ok ? 'ok' : 'fail');
            gsvStatus.textContent = ok
              ? '✓ 서버 연결 성공! 참조 음성 경로를 설정하면 활성화됩니다.'
              : '✗ 서버 연결 실패. GPT-SoVITS가 실행 중인지 확인하세요.';
          }
          if (icon) icon.textContent = ok ? '✓' : '✗';
        } catch (e) {
          if (gsvStatus) {
            gsvStatus.hidden = false;
            gsvStatus.className = 'tts-connect-status fail';
            gsvStatus.textContent = '✗ 오류: ' + (e.message || '알 수 없음');
          }
          if (icon) icon.textContent = '✗';
        } finally {
          gsvTestBtn.classList.remove('testing');
          gsvTestBtn.disabled = false;
        }
      });
    }

    /* 공통 중지 / 다시 재생 */
    if (stopBtn)   stopBtn.addEventListener  ('click', () => { const t = window.DotForest && window.DotForest.tts; if (t) t.stop(); });
    if (replayBtn) replayBtn.addEventListener('click', () => { const t = window.DotForest && window.DotForest.tts; if (t) t.replay(); });

    /* ESC 닫기 */
    const panel = $('ttsPanelOverlay');
    if (panel) {
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { panel.hidden = true; const b = $('ttsToggleBtn'); if (b) b.focus(); }
      });
    }
  }

  /* ===========================================================
     5. DotPad 콤팩트 카드 (미니 매트릭스 + 상태)
     =========================================================== */
  function initDotpadCompact() {
    const card   = $('dotpadCompact');
    const matrix = $('dpMiniMatrix');
    const pill   = $('dpCompactStatus');
    const msg    = $('dpCompactMsg');
    if (!card) return;

    const COLS = 15, ROWS = 10;
    let dots = [];

    // Build 150-dot grid
    if (matrix) {
      matrix.innerHTML = '';
      for (let i = 0; i < COLS * ROWS; i++) {
        const d = document.createElement('div');
        d.className = 'dp-mini-dot';
        matrix.appendChild(d);
        dots.push(d);
      }
    }

    // State sync from DotPad connection manager or bridge
    function updateStatus(state) {
      if (!pill || !msg) return;
      pill.className = 'dp-compact-pill ' + state;
      const labels = {
        connected: 'Connected',
        disconnected: '미연결',
        mock: 'Mock 모드'
      };
      pill.textContent = labels[state] || '미연결';
      const msgs = {
        connected: '촉각 출력 활성화',
        disconnected: '연결 대기 중…',
        mock: 'Mock 모드 실행 중'
      };
      msg.textContent = msgs[state] || '연결 대기 중…';
      msg.className = 'dp-compact-msg' + (state === 'connected' ? ' active' : '');
    }

    // Downsample 60×40 → 15×10 for mini preview
    function updateMatrix(fullMatrix) {
      if (!dots.length || !fullMatrix) return;
      const scaleX = 60 / COLS, scaleY = 40 / ROWS;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const srcRow = Math.floor(row * scaleY);
          const srcCol = Math.floor(col * scaleX);
          const val    = fullMatrix[srcRow] && fullMatrix[srcRow][srcCol];
          const dot    = dots[row * COLS + col];
          if (!dot) continue;
          dot.className = 'dp-mini-dot';
          if (val === 8) dot.classList.add('player');
          else if (val === 6) dot.classList.add('item');
          else if (val === 7) dot.classList.add('hazard');
          else if (val >= 1 && val <= 5) dot.classList.add('on');
        }
      }
    }

    // Watch DotPad state changes via DotpadConnectionManager state
    function pollState() {
      const mgr = window.DotForest && window.DotForest.bridge && window.DotForest.bridge.dotpadManager;
      if (mgr) {
        const connected = mgr.isConnected && mgr.isConnected();
        const mock = mgr.mockMode;
        updateStatus(mock ? 'mock' : connected ? 'connected' : 'disconnected');
      } else {
        // Fallback: read dotpad mirror pill
        const mirror = document.querySelector('.dotpad-mirror');
        if (mirror) {
          const isConn = mirror.classList.contains('connected');
          updateStatus(isConn ? 'connected' : 'disconnected');
        }
      }
      // Update mini matrix from bridge state
      const bridge = window.DotForest && window.DotForest.bridge;
      if (bridge && bridge.state && bridge.state.matrix) {
        updateMatrix(bridge.state.matrix);
      }
    }

    // Poll every second while on game screen
    setInterval(() => { if (onGame()) pollState(); }, 1000);
    // Also sync on screen change
    new MutationObserver(() => { if (onGame()) pollState(); })
      .observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  }

  /* ===========================================================
     6. 챕터 배지 업데이트
     =========================================================== */
  function initChapterBadge() {
    const label = $('chapterLabel');
    const name  = $('chapterName');
    if (!label || !name) return;

    const CHAPTER_NAMES = {
      'ko': { ch1_find_pip: '씨앗의 숲', ch2_berries_for_bramble: '베리 숲', ch3_cross_river: '강가' },
      'en': { ch1_find_pip: 'Seed Forest', ch2_berries_for_bramble: 'Berry Grove', ch3_cross_river: 'Riverside' }
    };
    const CHAPTER_NUM = { ch1_find_pip: 1, ch2_berries_for_bramble: 2, ch3_cross_river: 3 };

    function syncBadge() {
      const narrative = window.DotForest && window.DotForest.narrative;
      const lang = (window.DotForest && window.DotForest.lang) || 'ko';
      if (!narrative) return;
      const mission = narrative.get('mission');
      if (!mission) return;
      const num  = CHAPTER_NUM[mission.id] || 1;
      const cName = (CHAPTER_NAMES[lang] || CHAPTER_NAMES['ko'])[mission.id] || mission.id;
      label.textContent = 'Chapter ' + num;
      name.textContent  = cName;
    }

    // Watch score/liveStatus for chapter transitions
    const scoreEl = $('scoreText');
    if (scoreEl) new MutationObserver(syncBadge).observe(scoreEl, { childList: true, characterData: true, subtree: true });

    // Also sync on screen change and language change
    new MutationObserver(syncBadge).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
    document.addEventListener('dotforest:lang', syncBadge);
    setTimeout(syncBadge, 1200);
  }

  /* ===========================================================
     7. ESC key global handler for overlays
     =========================================================== */
  function initEscHandler() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!onGame()) return;
      const helpOverlay = $('helpOverlay');
      if (helpOverlay && !helpOverlay.hidden) {
        helpOverlay.hidden = true;
        const b = $('helpBtn'); if (b) b.focus();
        return;
      }
      const ttsPanel = $('ttsPanelOverlay');
      if (ttsPanel && !ttsPanel.hidden) {
        ttsPanel.hidden = true;
        const b = $('ttsToggleBtn'); if (b) b.focus();
        return;
      }
    });
  }

  /* ===========================================================
     DotPad panel collapse toggle
     =========================================================== */
  function initDotpadPanelCollapse() {
    const btn = $('dotpadPanelToggle');
    const panel = btn && btn.closest('.tactile-dock');
    if (!btn || !panel) return;

    btn.addEventListener('click', () => {
      const willCollapse = !panel.classList.contains('is-collapsed');
      panel.classList.toggle('is-collapsed', willCollapse);
      btn.setAttribute('aria-expanded', String(!willCollapse));
      btn.setAttribute('aria-label', willCollapse ? 'DotPad 패널 펼치기' : 'DotPad 패널 접기');
    });
  }

  /* ===========================================================
     DotPad HUD actions collapse toggle
     =========================================================== */
  function initDotpadHudToggle() {
    const btn = $('dotpadHudToggle');
    const actions = $('dotpadHudActions');
    if (!btn || !actions) return;

    btn.addEventListener('click', () => {
      const isOpen = !actions.hidden;
      actions.hidden = isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  /* ===========================================================
     Boot
     =========================================================== */
  function boot() {
    initHelp();
    initResultOverlay();
    initTTSToggle();
    initTTSPanel();
    initDotpadCompact();
    initChapterBadge();
    initEscHandler();
    initDotpadPanelCollapse();
    initDotpadHudToggle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
