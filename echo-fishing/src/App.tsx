// ============================================================
// Echo Fishing — App 오케스트레이터
//  - URL 파라미터(embed/preview/lang) 파싱 + html 클래스 토글
//  - GameEngine ↔ AudioEngine / Speech / DotPad 어댑터 결선
//  - 부모(TW) postMessage 브리지: { source:'dotarcade', type:'ready'|'resize'|'exit' }
//  - 키보드/Dot Pad 키 매핑 + 화면 라우팅
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine, GameState, EngineEvent, SpeakIntent } from './game/gameState';
import { LocationId } from './game/fishData';
import { Collection, CollectionMap } from './game/scoring';
import { makeT, Lang, StringKey } from './game/strings';
import { AudioEngine } from './audio/audioEngine';
import { Speech } from './audio/speech';
import { RealDotPadAdapter, DotKeyAction } from './dotpad/RealDotPadAdapter';
import StartScreen from './components/StartScreen';
import FishingScene from './components/FishingScene';
import CollectionBook from './components/CollectionBook';
import SettingsPanel from './components/SettingsPanel';
import fishingBg from './assets/fishing_bg.png';

// ---- URL 파라미터 / 임베드 감지 -------------------------------------
function readParams() {
  const q = new URLSearchParams(location.search);
  let inIframe = true;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  // iframe 안에서 실행되면 ?embed=1 이 없어도 자동 임베드(?embed=0 으로 해제).
  const embed = q.get('embed') === '1' || (inIframe && q.get('embed') !== '0');
  const previewParam = q.get('preview');
  // embed 면 기본 preview off. 명시적 ?preview= 값이 있으면 그것을 우선.
  const preview = previewParam != null ? previewParam !== '0' : !embed;
  const langParam = q.get('lang');
  const lang: Lang = langParam === 'en' ? 'en' : 'ko';
  return { embed, preview, lang };
}

// ---- 부모(TW) 브리지: dotarcade 프로토콜 ----------------------------
const Bridge = {
  post(type: 'ready' | 'resize' | 'exit', extra?: Record<string, unknown>) {
    if (window.parent === window) return; // 단독 실행이면 no-op
    try {
      window.parent.postMessage({ source: 'dotarcade', type, ...(extra || {}) }, '*');
    } catch {
      /* ignore */
    }
  },
  ready() {
    this.post('ready');
  },
  resize() {
    this.post('resize', { height: document.documentElement.scrollHeight });
  },
  exit() {
    this.post('exit');
  },
};

export default function App() {
  const params = useMemo(readParams, []);
  const [lang, setLang] = useState<Lang>(params.lang);
  const t = useMemo(() => makeT(lang), [lang]);

  const [snap, setSnap] = useState<GameState | null>(null);
  const [coll, setColl] = useState<CollectionMap>({});
  const [dotConnected, setDotConnected] = useState(false);
  const [dotStatus, setDotStatus] = useState<'mock' | 'connecting' | 'connected' | 'error'>('mock');
  const [deviceName, setDeviceName] = useState('');
  const [muted, setMuted] = useState(false);
  const [showA11y, setShowA11y] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [motionOff, setMotionOff] = useState(false);

  // 떠오르는 기포 (장식, aria-hidden) — 1회 생성
  const bubbles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: Math.round(Math.random() * 100),
        size: 6 + Math.round(Math.random() * 16),
        dur: 11 + Math.random() * 12,
        delay: Math.random() * 12,
        key: i,
      })),
    [],
  );

  // 핵심 모듈 (1회 생성)
  const audioRef = useRef<AudioEngine | null>(null);
  const speechRef = useRef<Speech | null>(null);
  const dotRef = useRef<RealDotPadAdapter | null>(null);
  const collectionRef = useRef<Collection | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const lastSpokenRef = useRef<string>('');
  const prevConnectedRef = useRef(false);

  if (!engineRef.current) {
    audioRef.current = new AudioEngine();
    speechRef.current = new Speech(params.lang);
    dotRef.current = new RealDotPadAdapter();
    collectionRef.current = new Collection();
    engineRef.current = new GameEngine({
      onRegister: (fish, at) => collectionRef.current!.register(fish.id, at),
    });
  }

  const ensureAudio = useCallback(() => {
    void audioRef.current?.resume();
  }, []);

  // ---- 음성 의도 → 현지화 텍스트 ----
  const localizeSpeak = useCallback(
    (intent: SpeakIntent): string => {
      if (intent.type === 'caught') {
        const name = lang === 'ko' ? intent.fish.nameKo : intent.fish.nameEn;
        return `${t('saySuccess')} ${name}${t('sayCaughtFish')}`;
      }
      return t(intent.key);
    },
    [lang, t],
  );

  // ---- 엔진 이벤트 결선 ----
  useEffect(() => {
    const engine = engineRef.current!;
    const audio = audioRef.current!;
    const speech = speechRef.current!;
    const dot = dotRef.current!;

    setSnap({ ...engine.getState() });
    setColl(collectionRef.current!.snapshot());

    const unsub = engine.subscribe((e: EngineEvent) => {
      if (e.kind === 'tactile') {
        dot.render(e.matrix); // preview 여부와 무관하게 항상 출력
        setSnap((prev) => (prev ? { ...prev, matrix: e.matrix } : prev));
      } else if (e.kind === 'state') {
        setSnap({ ...e.state });
        if (e.state.phase === 'caught') setColl(collectionRef.current!.snapshot());
      } else if (e.kind === 'speak') {
        const text = localizeSpeak(e.intent);
        lastSpokenRef.current = text;
        speech.speak(text);
      } else if (e.kind === 'audio') {
        const c = e.cue;
        if (c.type === 'cast') audio.playCast();
        else if (c.type === 'pulse') audio.playPulse(c.proximity);
        else if (c.type === 'bite') audio.playBite();
        else if (c.type === 'catch') audio.playCatch();
        else if (c.type === 'miss') audio.playMiss();
        else if (c.type === 'ambient') audio.setAmbient(c.location);
        else if (c.type === 'stop') audio.stopPulse();
      }
    });
    return () => {
      unsub();
    };
  }, [localizeSpeak]);

  // ---- 마운트: html 클래스 토글 + ready + resize 관찰 ----
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('is-embed', params.embed);
    root.classList.toggle('no-preview', !params.preview);
    root.lang = lang;

    const t0 = window.setTimeout(() => {
      Bridge.ready();
      Bridge.resize();
    }, 60);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      let raf = 0;
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => Bridge.resize());
      });
      ro.observe(document.body);
    }
    return () => {
      window.clearTimeout(t0);
      ro?.disconnect();
    };
  }, [params.embed, params.preview, lang]);

  // ---- 정리 ----
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  // ---- 상태/패턴 텍스트 도우미 ----
  const statusText = useCallback(
    (s: GameState): string => {
      switch (s.phase) {
        case 'intro':
        case 'select-location':
          return t('statusSelect');
        case 'ready':
        case 'casting':
          return t('statusReady');
        case 'waiting':
          return t('sayWaiting');
        case 'approaching':
          return s.direction === 'left'
            ? t('sayApproachLeft')
            : s.direction === 'right'
              ? t('sayApproachRight')
              : t('sayApproachCenter');
        case 'bite':
        case 'pull-window':
          return t('sayBite');
        case 'caught':
          return t('saySuccess');
        case 'missed':
          return s.missReason === 'early' ? t('sayTooEarly') : t('sayMiss');
        case 'paused':
          return t('sayPaused');
        default:
          return '';
      }
    },
    [t],
  );

  const patternDescKey = (s: GameState): StringKey => {
    switch (s.phase) {
      case 'approaching':
        return 'descApproaching';
      case 'bite':
      case 'pull-window':
        return 'descBite';
      case 'caught':
        return 'descCaught';
      case 'missed':
        return 'descMissed';
      default:
        return 'descWaiting';
    }
  };

  // ---- 동작 핸들러 ----
  const engine = engineRef.current!;

  const doPrimary = useCallback(() => {
    ensureAudio();
    engine.primary();
  }, [engine, ensureAudio]);

  const doSelect = useCallback(
    (id: LocationId) => {
      ensureAudio();
      engine.selectLocation(id);
    },
    [engine, ensureAudio],
  );

  const doStart = useCallback(() => {
    ensureAudio();
    engine.start();
  }, [engine, ensureAudio]);

  const repeatVoice = useCallback(() => {
    if (lastSpokenRef.current) speechRef.current?.speak(lastSpokenRef.current);
  }, []);

  const describePattern = useCallback(() => {
    if (snap) speechRef.current?.speak(t(patternDescKey(snap)));
  }, [snap, t]);

  const readStatus = useCallback(() => {
    if (snap) speechRef.current?.speak(statusText(snap));
  }, [snap, statusText]);

  const connectDotPad = useCallback(async () => {
    ensureAudio();
    const dot = dotRef.current!;
    if (dot.isConnected()) {
      await dot.disconnect();
      return;
    }
    try {
      await dot.connect();
    } catch (e) {
      const msg = String((e as Error)?.message ?? '');
      const key =
        msg === 'web-bluetooth-unavailable'
          ? 'dpNoBluetooth'
          : msg === 'no-device-selected'
            ? 'dpCancelled'
            : 'dpConnectFail';
      setDotStatus(dot.status());
      speechRef.current?.speak(t(key));
    }
  }, [ensureAudio, t]);

  const exit = useCallback(() => {
    if (params.embed) {
      Bridge.exit();
    } else {
      engine.goIntro();
    }
  }, [engine, params.embed]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      speechRef.current?.setEnabled(!next);
      return next;
    });
  }, []);

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next: Lang = l === 'ko' ? 'en' : 'ko';
      speechRef.current?.setLang(next);
      return next;
    });
  }, []);

  // 모션 효과 토글 → 루트 클래스
  useEffect(() => {
    document.documentElement.classList.toggle('motion-off', motionOff);
  }, [motionOff]);

  // ---- 전역 키보드 + Dot Pad 키 매핑 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = engine.getState();
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const onInteractive = ['button', 'a', 'summary', 'input', 'select'].includes(tag);
      const inCollection = s.phase === 'collection';

      // 첫 입력에서 오디오 활성화
      ensureAudio();

      switch (e.key) {
        case 'Enter':
        case ' ':
        case 'Spacebar': {
          if (onInteractive) return; // 버튼 포커스 시 native click 우선
          if (inCollection || showA11y) return;
          e.preventDefault();
          engine.primary();
          break;
        }
        case 'F3': {
          e.preventDefault();
          engine.primary();
          break;
        }
        case 'ArrowLeft':
        case '[': {
          if (inCollection) return;
          e.preventDefault();
          engine.moveCast(-6);
          break;
        }
        case 'ArrowRight':
        case ']': {
          if (inCollection) return;
          e.preventDefault();
          engine.moveCast(6);
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          // 도감은 컴포넌트가 처리. 그 외엔 무시.
          break;
        }
        case 'Escape': {
          e.preventDefault();
          if (showA11y) {
            setShowA11y(false);
          } else if (showSettings) {
            setShowSettings(false);
          } else if (inCollection) {
            engine.closeCollection();
          } else if (['waiting', 'approaching', 'bite', 'pull-window', 'ready', 'paused'].includes(s.phase)) {
            engine.togglePause();
          } else {
            exit();
          }
          break;
        }
        case 'F1': {
          e.preventDefault();
          readStatus();
          break;
        }
        case 'F2': {
          e.preventDefault();
          repeatVoice();
          break;
        }
        case 'F4': {
          e.preventDefault();
          describePattern();
          break;
        }
        case 'r':
        case 'R':
        case '\\': {
          // Pan All: 음성 안내 다시 듣기
          if (onInteractive) return;
          repeatVoice();
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, ensureAudio, showA11y, showSettings, readStatus, repeatVoice, describePattern, exit]);

  // ---- Dot Pad 실기기 콜백 결선 (상태 변화 + 물리 키) ----
  useEffect(() => {
    const dot = dotRef.current!;
    dot.onStatusChange = (s, name) => {
      setDotStatus(s);
      setDeviceName(name);
      const connected = s === 'connected';
      setDotConnected(connected);
      if (connected && !prevConnectedRef.current) {
        speechRef.current?.speak(t('dpConnectedMsg'));
      } else if (!connected && prevConnectedRef.current) {
        speechRef.current?.speak(t('dpDisconnectedMsg'));
      }
      prevConnectedRef.current = connected;
    };
    dot.onKey = (a: DotKeyAction) => {
      ensureAudio();
      switch (a) {
        case 'primary':
        case 'f3':
          engine.primary();
          break;
        case 'panLeft':
          engine.moveCast(-6);
          break;
        case 'panRight':
          engine.moveCast(6);
          break;
        case 'panAll':
        case 'f2':
          repeatVoice();
          break;
        case 'f1':
          readStatus();
          break;
        case 'f4':
          describePattern();
          break;
        default:
          break;
      }
    };
    return () => {
      dot.onStatusChange = null;
      dot.onKey = null;
    };
  }, [engine, ensureAudio, repeatVoice, readStatus, describePattern, t]);

  if (!snap) return null;

  const dotStatusLabel =
    dotStatus === 'connected'
      ? `${t('dpConnected')}${deviceName ? ` · ${deviceName}` : ''}`
      : dotStatus === 'connecting'
        ? t('dpConnecting')
        : `${t('dpMock')} · ${t('dpReady')}`;

  const phase = snap.phase;
  const onStartScreen = phase === 'intro' || phase === 'select-location';
  const inCollection = phase === 'collection';

  return (
    <div className={`echo-fishing app-root ${params.embed ? 'is-embed' : ''}`}>
      {/* 배경 분위기 레이어 (장식) */}
      <div className="ef-bg" aria-hidden="true">
        <div className="ef-bg__img" style={{ backgroundImage: `url(${fishingBg})` }} />
        <div className="ef-bg__caustics" />
        <div className="ef-bg__rays" />
        <div className="ef-bg__vignette" />
      </div>
      <div className="ef-bubbles" aria-hidden="true">
        {bubbles.map((b) => (
          <span
            key={b.key}
            className="ef-bubble"
            style={{
              left: `${b.left}%`,
              ['--sz' as string]: `${b.size}px`,
              ['--dur' as string]: `${b.dur}s`,
              ['--delay' as string]: `${b.delay}s`,
            }}
          />
        ))}
      </div>

      <header className="ef-hud" role="toolbar" aria-label="utility">
        <span className="ef-hud__brand">
          <b>🎣 Echo Fishing</b>
          <span>{t('subtitle')}</span>
        </span>
        <div className="ef-hud__spacer" />
        <button
          type="button"
          className="ef-btn ef-iconbtn"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'unmute' : 'mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          className="ef-btn ef-iconbtn"
          onClick={() => setShowSettings(true)}
          aria-label={t('settings')}
        >
          ⚙
        </button>
        <button
          type="button"
          className="ef-btn ef-iconbtn ef-hud__exit"
          onClick={exit}
          aria-label={t('back')}
        >
          ⤺
        </button>
      </header>

      <main className="ef-stage">
        {onStartScreen && (
          <StartScreen
            t={t}
            lang={lang}
            selected={snap.location}
            onSelect={doSelect}
            onStart={doStart}
            onOpenCollection={() => engine.openCollection()}
            onA11yGuide={() => setShowA11y(true)}
          />
        )}

        {!onStartScreen && !inCollection && (
          <>
            <FishingScene
              t={t}
              lang={lang}
              state={snap}
              statusText={statusText(snap)}
              patternDesc={t(patternDescKey(snap))}
              dotStatusLabel={dotStatusLabel}
              dotConnected={dotConnected}
              onConnectDotPad={connectDotPad}
              previewOn={params.preview}
              onPrimary={doPrimary}
              onMoveLeft={() => engine.moveCast(-6)}
              onMoveRight={() => engine.moveCast(6)}
              onRepeat={repeatVoice}
              onDescribe={describePattern}
              onPause={() => engine.togglePause()}
            />
            {phase === 'paused' && (
              <div className="ef-overlay" role="dialog" aria-label={t('sayPaused')}>
                <div className="ef-overlay__box">
                  <p>⏸ {t('sayPaused')}</p>
                  <button type="button" className="ef-btn ef-btn--primary" onClick={() => engine.resume()} autoFocus>
                    {t('resume')}
                  </button>
                  <button type="button" className="ef-btn" onClick={exit}>
                    {t('back')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {inCollection && (
          <CollectionBook
            t={t}
            lang={lang}
            collection={coll}
            speak={(text) => speechRef.current?.speak(text)}
            onClose={() => engine.closeCollection()}
          />
        )}
      </main>

      {showSettings && (
        <SettingsPanel
          t={t}
          lang={lang}
          muted={muted}
          motionOff={motionOff}
          dotStatusLabel={dotStatusLabel}
          dotConnected={dotConnected}
          dotStatus={dotStatus}
          onToggleMute={toggleMute}
          onToggleLang={toggleLang}
          onToggleMotion={() => setMotionOff((m) => !m)}
          onConnectDotPad={connectDotPad}
          onOpenA11y={() => {
            setShowSettings(false);
            setShowA11y(true);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showA11y && (
        <div className="ef-overlay" role="dialog" aria-modal="true" aria-labelledby="ef-a11y-title">
          <div className="ef-overlay__box ef-a11y">
            <h2 id="ef-a11y-title">♿ {t('a11yGuide')}</h2>
            <ul>
              <li>{t('ctlCast')}</li>
              <li>{t('ctlMove')}</li>
              <li>{t('ctlMenu')}</li>
              <li>{t('ctlEsc')}</li>
              <li>{t('ctlF1')}</li>
              <li>{t('ctlF2')}</li>
              <li>{t('ctlF3')}</li>
              <li>{t('ctlF4')}</li>
              <li>{t('ctlPan')}</li>
            </ul>
            <button type="button" className="ef-btn ef-btn--primary" onClick={() => setShowA11y(false)} autoFocus>
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
