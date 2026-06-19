// ============================================================
// Echo Fishing — 설정 패널 (소리 / 언어 / 모션 / Dot Pad / 접근성)
// ============================================================

import type { TFn, Lang } from '../game/strings';

interface Props {
  t: TFn;
  lang: Lang;
  muted: boolean;
  motionOff: boolean;
  dotStatusLabel: string;
  dotConnected: boolean;
  dotStatus?: string;
  onToggleMute: () => void;
  onToggleLang: () => void;
  onToggleMotion: () => void;
  onConnectDotPad: () => void;
  onOpenA11y: () => void;
  onClose: () => void;
}

export default function SettingsPanel({
  t,
  lang,
  muted,
  motionOff,
  dotStatusLabel,
  dotConnected,
  dotStatus,
  onToggleMute,
  onToggleLang,
  onToggleMotion,
  onConnectDotPad,
  onOpenA11y,
  onClose,
}: Props) {
  const ko = lang === 'ko';
  const isConnecting = dotStatus === 'connecting';

  const keyGuide = ko ? [
    { key: '◀ Panning Left',  action: '낚싯줄 왼쪽으로 이동' },
    { key: '▶ Panning Right', action: '낚싯줄 오른쪽으로 이동' },
    { key: 'Panning All / F2', action: '현재 상태 다시 읽기' },
    { key: 'F1',              action: '상태 안내 (수심·어종)' },
    { key: 'F3 / Primary',    action: '캐스트 / 릴-인 / 확인' },
    { key: 'F4',              action: '현재 패턴 설명' },
  ] : [
    { key: '◀ Panning Left',  action: 'Move cast line left' },
    { key: '▶ Panning Right', action: 'Move cast line right' },
    { key: 'Panning All / F2', action: 'Repeat last announcement' },
    { key: 'F1',              action: 'Read status (depth · fish)' },
    { key: 'F3 / Primary',    action: 'Cast / reel-in / confirm' },
    { key: 'F4',              action: 'Describe current pattern' },
  ];

  return (
    <div className="ef-overlay" role="dialog" aria-modal="true" aria-labelledby="ef-set-title">
      <div className="ef-overlay__box ef-settings-box">
        <h2 id="ef-set-title">⚙ {t('settings')}</h2>

        <div className="ef-settings">
          {/* Sound */}
          <div className="ef-settings__row">
            <span>🔊 {t('sound')}</span>
            <button
              type="button"
              className={`ef-btn ${muted ? '' : 'ef-btn--primary'}`}
              onClick={onToggleMute}
              aria-pressed={!muted}
            >
              {muted ? t('off') : t('on')}
            </button>
          </div>

          {/* Language */}
          <div className="ef-settings__row">
            <span>🌐 {t('language')}</span>
            <button type="button" className="ef-btn" onClick={onToggleLang}>
              {lang === 'ko' ? '한국어 → English' : 'English → 한국어'}
            </button>
          </div>

          {/* Motion */}
          <div className="ef-settings__row">
            <span>✨ {t('motion')}</span>
            <button
              type="button"
              className={`ef-btn ${motionOff ? '' : 'ef-btn--primary'}`}
              onClick={onToggleMotion}
              aria-pressed={!motionOff}
            >
              {motionOff ? t('off') : t('on')}
            </button>
          </div>

          {/* Dot Pad — status + connect/disconnect */}
          <div className="ef-settings__dotpad">
            <div className="ef-dp-header">
              <span>⠿ Dot Pad</span>
              <div className={'ef-dp-status' + (dotConnected ? ' ef-dp-status--on' : '')}>
                <span className="ef-dp-dot" aria-hidden="true" />
                <span>{dotConnected ? dotStatusLabel : (ko ? '미연결' : 'Not connected')}</span>
              </div>
            </div>
            <div className="ef-dp-actions">
              {dotConnected ? (
                <button
                  type="button"
                  className="ef-btn ef-btn--danger ef-btn--full"
                  onClick={onConnectDotPad}
                >
                  ⏏ {ko ? '연결 해제' : 'Disconnect'}
                </button>
              ) : (
                <button
                  type="button"
                  className={`ef-btn ef-btn--primary ef-btn--full${isConnecting ? ' ef-btn--loading' : ''}`}
                  onClick={onConnectDotPad}
                  disabled={isConnecting}
                  aria-busy={isConnecting}
                >
                  {isConnecting
                    ? `⠿ ${ko ? '검색 중…' : 'Searching…'}`
                    : `🔗 ${t('dpConnect')}`}
                </button>
              )}
            </div>

            {/* Key mapping guide */}
            <details className="ef-dp-keyguide" open={dotConnected}>
              <summary>
                {ko ? '⌨ Dot Pad 키 사용법' : '⌨ Dot Pad Key Guide'}
              </summary>
              <table aria-label={ko ? 'Dot Pad 키맵' : 'Dot Pad keymap'}>
                <thead>
                  <tr>
                    <th>{ko ? '버튼' : 'Key'}</th>
                    <th>{ko ? '동작' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody>
                  {keyGuide.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key}</td>
                      <td>{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>

          {/* Accessibility */}
          <div className="ef-settings__row">
            <span>♿ {t('a11yGuide')}</span>
            <button type="button" className="ef-btn" onClick={onOpenA11y}>
              {t('a11yGuide')}
            </button>
          </div>
        </div>

        <button type="button" className="ef-btn ef-btn--primary" onClick={onClose} autoFocus>
          {t('close')}
        </button>
      </div>
    </div>
  );
}
