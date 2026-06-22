/* ===========================================================
   Dot Forest — TTS Engine v2

   우선순위:
     1) GPT-SoVITS (로컬 추론 서버, http://127.0.0.1:9880)
        - Zero-shot / Few-shot 고품질 한국어 음성
        - WAV 스트리밍 or 단일 파일 반환
     2) Web Speech API (브라우저 내장 폴백)
        - 한국어 최적 음성 자동 선택

   API 레퍼런스: github.com/RVC-Boss/GPT-SoVITS  (api_v2.py)
     POST http://127.0.0.1:9880/tts
       { text, text_lang, ref_audio_path, prompt_lang, prompt_text,
         speed_factor, streaming_mode, text_split_method }
     → WAV 바이너리 스트림 반환

   사용:
     window.DotForest.tts.speak(text)
     window.DotForest.tts.stop()
     window.DotForest.tts.replay()
     window.DotForest.tts.setEnabled(bool)
     window.DotForest.tts.getStatus() → { mode, available, speaking }
   =========================================================== */
(function () {
  'use strict';

  const STORE_KEY = 'dotforest.tts2';
  const DEDUP_MS  = 350;   // 동일 텍스트 중복 발화 방지 (ms)
  const CACHE_MAX = 12;    // 오디오 캐시 최대 항목 수

  /* ---- 기본 설정 ---- */
  const DEFAULT_CFG = {
    enabled:       true,
    mode:          'auto',   // 'auto'|'gptsovits'|'webspeech'
    gptsovits: {
      endpoint:    'http://127.0.0.1:9880',
      refAudio:    '',       // 서버 측 참조 음성 파일 경로 (필수)
      promptText:  '',       // 참조 음성의 트랜스크립트
      promptLang:  'ko',     // 참조 음성 언어
      speedFactor: 1.0,      // 0.5 ~ 2.0
      streaming:   false,    // true = 청크 스트리밍 (저지연)
      textSplit:   'cut5',   // cut0~cut5, 한국어는 cut5 권장
    },
    webspeech: {
      lang:    'ko-KR',
      rate:    0.92,
      pitch:   1.0,
      volume:  1.0,
      voice:   '',           // voice.name (빈 문자열 = 자동)
    },
  };

  let cfg     = JSON.parse(JSON.stringify(DEFAULT_CFG));
  let _voices = [];
  let _selectedVoice = null;
  let _audioCtx      = null;
  let _currentSrc    = null;
  let _speaking      = false;
  let _queue         = [];
  let _lastText      = '';
  let _lastTime      = 0;
  let _mode          = 'webspeech'; // 실제 사용 중인 모드
  const _cache       = new Map();   // text → AudioBuffer 캐시

  /* ========================================================
     저장 / 복원
     ======================================================== */
  function loadCfg() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) deepMerge(cfg, JSON.parse(raw));
    } catch (e) {}
  }
  function saveCfg() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function deepMerge(target, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        deepMerge(target[k], src[k]);
      } else { target[k] = src[k]; }
    }
  }

  /* ========================================================
     Web Audio Context
     ======================================================== */
  function getAudioCtx() {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    return _audioCtx;
  }

  /* ========================================================
     GPT-SoVITS: 연결 확인
     ======================================================== */
  let _gsvAvail  = false;
  let _gsvChecked = false;

  async function checkGPTSoVITS(endpoint) {
    try {
      const url = (endpoint || cfg.gptsovits.endpoint).replace(/\/$/, '');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(url + '/tts', {
        method: 'GET',
        signal: ctrl.signal,
        mode: 'cors',
      }).catch(() => null);
      clearTimeout(t);
      // 400 도 서버 응답이므로 available로 간주
      _gsvAvail = !!(r && (r.ok || r.status === 400 || r.status === 422));
    } catch (e) {
      _gsvAvail = false;
    }
    _gsvChecked = true;
    updateModeLabel();
    return _gsvAvail;
  }

  function updateModeLabel() {
    if (cfg.mode === 'gptsovits') _mode = _gsvAvail ? 'gptsovits' : 'webspeech';
    else if (cfg.mode === 'webspeech') _mode = 'webspeech';
    else _mode = (cfg.gptsovits.enabled && _gsvAvail && cfg.gptsovits.refAudio) ? 'gptsovits' : 'webspeech';
    dispatchStatus();
  }

  function dispatchStatus() {
    document.dispatchEvent(new CustomEvent('dotforest:tts-status', {
      detail: { mode: _mode, available: _gsvAvail, speaking: _speaking, config: cfg }
    }));
  }

  /* ========================================================
     GPT-SoVITS: 오디오 가져오기
     POST /tts → WAV ArrayBuffer
     ======================================================== */
  async function fetchGPTSoVITS(text) {
    const g   = cfg.gptsovits;
    const url = g.endpoint.replace(/\/$/, '') + '/tts';
    const langMap = { ko: 'ko', en: 'en', zh: 'zh', ja: 'ja' };
    const curLang = (window.DotForest && window.DotForest.lang) || 'ko';
    const textLang = langMap[curLang] || 'ko';

    const body = {
      text:              text,
      text_lang:         textLang,
      ref_audio_path:    g.refAudio,
      prompt_text:       g.promptText || '',
      prompt_lang:       g.promptLang || textLang,
      speed_factor:      g.speedFactor || 1.0,
      text_split_method: g.textSplit   || 'cut5',
      batch_size:        1,
      media_type:        'wav',
      streaming_mode:    false,   // 단일 파일로 받아 캐시 활용
      repetition_penalty: 1.35,
      top_k:             15,
      top_p:             1.0,
      temperature:       1.0,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000); // 12s timeout
    try {
      const resp = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
        mode:    'cors',
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error('GPT-SoVITS HTTP ' + resp.status);
      const buf = await resp.arrayBuffer();
      return buf;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /* ========================================================
     GPT-SoVITS: 스트리밍 모드
     chunk 단위 ReadableStream → 실시간 재생
     ======================================================== */
  async function fetchGPTSoVITSStreaming(text) {
    const g   = cfg.gptsovits;
    const url = g.endpoint.replace(/\/$/, '') + '/tts';
    const curLang = (window.DotForest && window.DotForest.lang) || 'ko';

    const body = {
      text:              text,
      text_lang:         curLang === 'en' ? 'en' : 'ko',
      ref_audio_path:    g.refAudio,
      prompt_text:       g.promptText || '',
      prompt_lang:       g.promptLang || (curLang === 'en' ? 'en' : 'ko'),
      speed_factor:      g.speedFactor || 1.0,
      text_split_method: g.textSplit   || 'cut5',
      batch_size:        1,
      media_type:        'wav',
      streaming_mode:    3,   // 모드3: 낮은 지연 + 낮은 품질 (게임에 적합)
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const resp  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
      mode:    'cors',
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error('GPT-SoVITS HTTP ' + resp.status);
    return resp; // caller handles ReadableStream
  }

  /* ========================================================
     Web Audio: ArrayBuffer → 재생
     ======================================================== */
  async function playArrayBuffer(buf) {
    const ctx = getAudioCtx();
    if (!ctx) throw new Error('No AudioContext');
    const decoded = await ctx.decodeAudioData(buf);
    return new Promise((resolve, reject) => {
      if (_currentSrc) { try { _currentSrc.stop(); } catch (e) {} }
      const src  = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.onended = () => { _currentSrc = null; resolve(); };
      src.start(0);
      _currentSrc = src;
    });
  }

  /* ========================================================
     스트리밍 청크 재생 (GPT-SoVITS streaming_mode=3)
     각 청크는 독립적인 WAV이므로 순차 디코딩·재생
     ======================================================== */
  async function playStreaming(resp) {
    const ctx    = getAudioCtx();
    if (!ctx) { await resp.arrayBuffer(); return; } // drain
    const reader = resp.body.getReader();
    let buf = new Uint8Array(0);
    const MIN_CHUNK = 8192; // 최소 청크 크기 (8KB)

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // 청크 누적
      const merged = new Uint8Array(buf.length + value.length);
      merged.set(buf); merged.set(value, buf.length);
      buf = merged;

      // 충분히 쌓이면 디코딩 시도
      if (buf.length >= MIN_CHUNK || done) {
        try {
          const copy = buf.buffer.slice(0);
          await playArrayBuffer(copy);
          buf = new Uint8Array(0);
        } catch (e) {
          // 불완전한 청크: 더 쌓을 때까지 대기
        }
      }
    }
    // 잔여 버퍼 재생
    if (buf.length > 44) { // WAV header(44B) 이상이면 시도
      try { await playArrayBuffer(buf.buffer.slice(0)); } catch (e) {}
    }
  }

  /* ========================================================
     LRU 캐시 관리
     ======================================================== */
  function cacheGet(key)      { return _cache.get(key); }
  function cacheSet(key, val) {
    if (_cache.size >= CACHE_MAX) {
      _cache.delete(_cache.keys().next().value); // 가장 오래된 항목 제거
    }
    _cache.set(key, val);
  }

  /* ========================================================
     텍스트 정제 (한국어 TTS 발화 개선)
     ======================================================== */
  function cleanText(text) {
    return text
      .replace(/F(\d)/g, 'F$1 키')
      .replace(/←/g, '왼쪽 방향')
      .replace(/→/g, '오른쪽 방향')
      .replace(/↑/g, '앞 방향')
      .replace(/↓/g, '뒤 방향')
      .replace(/·/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\(.*?\)/g, '')  // 괄호 안 영문 제거
      .trim();
  }

  /* ========================================================
     GPT-SoVITS 모드: 텍스트 → 재생
     ======================================================== */
  async function speakGPTSoVITS(text) {
    const cached = cacheGet(text);
    if (cached) {
      // 캐시된 ArrayBuffer 복사본으로 재생
      const copy = cached.slice(0);
      await playArrayBuffer(copy);
      return;
    }

    if (cfg.gptsovits.streaming) {
      const resp = await fetchGPTSoVITSStreaming(text);
      await playStreaming(resp);
    } else {
      const buf = await fetchGPTSoVITS(text);
      cacheSet(text, buf);
      const copy = buf.slice(0);
      await playArrayBuffer(copy);
    }
  }

  /* ========================================================
     Web Speech API: 음성 선택
     ======================================================== */
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const populate = () => {
      _voices = window.speechSynthesis.getVoices();
      _selectedVoice = pickBestVoice();
    };
    populate();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populate;
    }
  }

  function pickBestVoice() {
    if (!_voices.length) return null;
    const curLang = (window.DotForest && window.DotForest.lang) || 'ko';
    const savedName = cfg.webspeech.voice;

    // 사용자가 직접 선택한 voice 우선
    if (savedName) {
      const found = _voices.find(v => v.name === savedName);
      if (found) return found;
    }

    if (curLang !== 'en') {
      /* 한국어 음성 우선순위:
         1) Google 한국어 (ko-KR) - 가장 자연스러움
         2) Microsoft 한국어
         3) 기타 ko-KR
         4) ko-* 전체 */
      const ko = _voices.filter(v => v.lang.startsWith('ko'));
      if (!ko.length) return null;
      return (
        ko.find(v => /google/i.test(v.name) && v.lang === 'ko-KR') ||
        ko.find(v => /google/i.test(v.name)) ||
        ko.find(v => /microsoft/i.test(v.name) && v.lang === 'ko-KR') ||
        ko.find(v => /microsoft/i.test(v.name)) ||
        ko.find(v => v.lang === 'ko-KR') ||
        ko[0]
      );
    } else {
      const en = _voices.filter(v => v.lang.startsWith('en'));
      return (
        en.find(v => /google/i.test(v.name) && v.lang === 'en-US') ||
        en.find(v => v.lang === 'en-US') ||
        en[0] || null
      );
    }
  }

  /* ========================================================
     Web Speech API 모드: 텍스트 → 발화
     ======================================================== */
  function speakWebSpeech(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const curLang = (window.DotForest && window.DotForest.lang) || 'ko';
      u.lang   = curLang === 'en' ? 'en-US' : (cfg.webspeech.lang || 'ko-KR');
      u.rate   = cfg.webspeech.rate   || 0.92;
      u.pitch  = cfg.webspeech.pitch  || 1.0;
      u.volume = cfg.webspeech.volume || 1.0;

      // lang이 바뀐 경우 음성 재선택
      if (!_selectedVoice || !_selectedVoice.lang.startsWith(curLang === 'en' ? 'en' : 'ko')) {
        _selectedVoice = pickBestVoice();
      }
      if (_selectedVoice) u.voice = _selectedVoice;

      u.onend   = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  /* ========================================================
     큐 처리기
     ======================================================== */
  async function processQueue() {
    if (_speaking || !_queue.length || !cfg.enabled) return;
    _speaking = true;
    dispatchStatus();

    while (_queue.length) {
      const text = _queue.shift();
      if (!text) continue;
      try {
        if (_mode === 'gptsovits') {
          await speakGPTSoVITS(cleanText(text));
        } else {
          await speakWebSpeech(cleanText(text));
        }
      } catch (e) {
        // GPT-SoVITS 실패 시 자동 폴백
        if (_mode === 'gptsovits') {
          console.warn('[TTS] GPT-SoVITS 실패, Web Speech로 폴백:', e.message);
          _gsvAvail = false;
          updateModeLabel();
          try { await speakWebSpeech(cleanText(text)); } catch (e2) {}
        }
      }
    }

    _speaking = false;
    dispatchStatus();
  }

  /* ========================================================
     텍스트 분할 (Web Speech 전용, GPT-SoVITS는 내부 분할)
     ======================================================== */
  function splitText(text) {
    if (text.length <= 80) return [text];
    // 문장 단위 분할: .!?。 뒤
    const chunks = [];
    let cur = '';
    for (const char of text) {
      cur += char;
      if (/[.!?。\n]/.test(char) && cur.trim().length > 4) {
        chunks.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim().length > 2) chunks.push(cur.trim());
    return chunks.length ? chunks : [text];
  }

  /* ========================================================
     공개 API
     ======================================================== */
  const api = {
    /* 텍스트 발화 (메인 진입점) */
    speak(text, { priority = 'polite', force = false } = {}) {
      if (!text || !cfg.enabled) return;
      const now = Date.now();
      // 빠른 중복 방지
      if (!force && text === _lastText && now - _lastTime < DEDUP_MS) return;
      _lastText = text;
      _lastTime = now;

      if (priority === 'assertive') {
        // 즉시 발화: 큐 초기화 + 현재 재생 중단
        api.stop();
      }

      if (_mode === 'gptsovits') {
        // GPT-SoVITS는 텍스트를 통째로 보냄 (내부에서 cut5 분할)
        _queue.push(text);
      } else {
        // Web Speech는 짧게 분할
        splitText(text).forEach(c => _queue.push(c));
      }
      processQueue();
    },

    stop() {
      _queue = [];
      _speaking = false;
      if (_currentSrc) { try { _currentSrc.stop(); } catch (e) {} _currentSrc = null; }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      dispatchStatus();
    },

    replay() {
      if (!_lastText) return;
      api.stop();
      api.speak(_lastText, { force: true });
    },

    /* GPT-SoVITS 연결 확인 (비동기) */
    async checkConnection(endpoint) {
      const ep = endpoint || cfg.gptsovits.endpoint;
      const ok = await checkGPTSoVITS(ep);
      return ok;
    },

    /* 설정 업데이트 */
    setConfig(patch) {
      deepMerge(cfg, patch);
      saveCfg();
      updateModeLabel();
      // voice 재선택
      if (patch.webspeech) _selectedVoice = pickBestVoice();
    },

    getConfig() { return JSON.parse(JSON.stringify(cfg)); },

    setEnabled(v) {
      cfg.enabled = !!v;
      if (!v) api.stop();
      saveCfg();
      dispatchStatus();
    },

    /* Web Speech voice 목록 */
    getVoices()         { return _voices.slice(); },
    getSelectedVoice()  { return _selectedVoice; },
    setVoiceByName(name) {
      const v = _voices.find(v => v.name === name);
      if (v) { _selectedVoice = v; cfg.webspeech.voice = name; saveCfg(); }
    },

    getStatus() {
      return {
        mode:      _mode,
        available: _gsvAvail,
        speaking:  _speaking,
        enabled:   cfg.enabled,
        queueLen:  _queue.length,
      };
    },

    /* (내부용) mode 강제 설정 */
    _setMode(m) { _mode = m; updateModeLabel(); },
  };

  /* ========================================================
     초기화
     ======================================================== */
  function init() {
    loadCfg();
    loadVoices();

    // auto 모드일 때 GPT-SoVITS 연결 확인 (비동기)
    if (cfg.mode !== 'webspeech') {
      checkGPTSoVITS().then(ok => {
        if (ok && !cfg.gptsovits.refAudio) {
          // 서버는 있지만 refAudio 미설정 → Web Speech 폴백
          console.info('[TTS] GPT-SoVITS 감지됨. 참조 음성 경로를 설정하면 활성화됩니다.');
        }
      });
    } else {
      updateModeLabel();
    }

    // 언어 변경 시 음성 재선택
    document.addEventListener('dotforest:lang', () => {
      _selectedVoice = pickBestVoice();
      updateModeLabel();
    });

    // 전역 등록
    window.DotForest        = window.DotForest || {};
    window.DotForest.tts    = api;
    window.DotForest.ttsAPI = api; // alias

    // narrative-engine.js의 기존 say() 패치 (로드 순서 무관)
    patchNarrativeEngine();

    document.dispatchEvent(new CustomEvent('dotforest:tts-ready', { detail: api }));
  }

  /* ========================================================
     narrative-engine.js 패치
     DotForest.narrative.say 를 이 엔진으로 교체
     ======================================================== */
  function patchNarrativeEngine() {
    // narrative-engine 초기화 후 bridge에 연결
    const patch = () => {
      if (window.DotForest && window.DotForest.narrative) {
        const orig = window.DotForest.narrative.say;
        if (orig && orig._patched) return;
        window.DotForest.narrative.say = function (text, priority) {
          api.speak(text, { priority: priority || 'polite' });
          // aria-live는 기존 코드가 처리하므로 그대로 유지
        };
        window.DotForest.narrative.say._patched = true;
      }
    };
    // DOMContentLoaded 이후 narrative가 등록됐을 수 있으므로 약간 대기
    setTimeout(patch, 200);
    document.addEventListener('dotforest:tts-ready', patch);
  }

  /* ---- Boot ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
