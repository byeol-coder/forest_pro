# Dot Forest: Lumi & Dotlings

웹 3D 게임과 **60×40 DotPad 촉각 그래픽**을 동시에 구동하는 접근성 게임 프로토타입입니다.
플레이어(루미)가 숲을 탐험하며 도트링(빛)을 모으는 동안, 같은 좌표가 촉각 디스플레이로
출력되고 TTS 내레이션·공간 음향·시각 자막으로 함께 전달됩니다. 저시력·전맹·혼합 사용자를
모두 염두에 둔 다중 감각 설계입니다.

## 아키텍처

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 구조 (타이틀 · 게임 · 설정), 정적 i18n(한/영) |
| `script.js` | Three.js 게임 로직, 60×40 매트릭스 변환, DotPad 출력, 입력 처리 |
| `dotforest-mechanics.js` | 순수 게임 메커니즘 (위험 추적·충돌·돌다리 퍼즐·빛 복원) — DOM/Three 비의존, 테스트 가능 |
| `areas.js` | 구역 데이터 (숲의 입구 · 베리 숲 · 강가): 아이템·위험물·장애물·출구 |
| `narrative-engine.js` | 내러티브·미션·동료·대화 + 접근성(`aria-live`, TTS, 온디맨드 안내) |
| `narrative.json` | 스토리/미션/대사/위치 묘사 데이터 |
| `a11y.js` / `a11y.css` | **저시력·화면 접근성 레이어** (아래 참조) |
| `dotpad-adapter.js` | `window.DotPadBridge` 시뮬레이션 어댑터 (실기기 없을 때 콘솔 출력) |
| `DotPadSDK-3_0_0.js` | DotPad 하드웨어 SDK |
| `screens.js` | 화면 전환 로직 |
| `serve.js` | 로컬 프리뷰용 정적 파일 서버 |

게임 로직과 그 위에 얹힌 내러티브/접근성 레이어는 `window.DotForest` 브리지
(`bridge` · `narrative` · `a11y`)로만 통신합니다 — 레이어는 게임 코어를 수정하지 않습니다.

## 실행 방법

로컬 파일을 직접 열면 CORS 때문에 `narrative.json` 로드가 막히므로 로컬 서버로 실행하세요.

```bash
npm install
npm run dev          # vite 개발 서버
```

또는 의존성 없이 정적 서버로:

```bash
node serve.js        # http://localhost:8092
# 또는
python3 -m http.server 8080
```

## 조작

| 입력 | 동작 |
|---|---|
| 방향키 / WASD / D-pad / DotPad 패닝키 | 루미 이동 |
| `Enter` · `Space` · "먹기" 버튼 | 도트링 수집 / 상호작용 |
| 음성: "앞으로 · 뒤로 · 왼쪽 · 오른쪽 · 먹기" | 이동 / 수집 |
| `1` / `2` / `3` / `4` (DotPad `F1`~`F4`) | 위치 · 주변 · 미션 · 촉각 지도 안내 듣기 |

## 접근성 기능

설정 화면에서 켜고 끌 수 있으며 `localStorage`에 저장됩니다.

**내레이션** — 음성 내레이션(TTS), 분위기 내레이션, 배경 음악

**저시력 · 화면 접근성** (`a11y.js`)
- 글자·UI 크기 (보통 / 크게 / 더 크게)
- 고대비 모드 — HUD·자막·촉각 패널 대비 강화
- 고시인성 색상 — 색각 이상 대응 고채도 팔레트
- 음향 큐 시각 표시 — 위험·물소리 등 공간 음향을 화면 가장자리 글로우 + 방향 칩으로 시각화
- 내레이션 자막 — `aria-live` 음성 안내를 큰 고대비 자막 바로 미러링
- 촉각 프리뷰 확대 — 60×40 미리보기 확대 + 대비 강화

`prefers-reduced-motion`을 존중합니다.

## DotPad 연동 지점

`script.js`의 아래 함수가 실제 하드웨어 출력 지점입니다.

```js
function sendDotPadFrame(matrix) {
  dotSdk.displayGraphicData(matrixToDotPadHex(matrix), dotDevice, DisplayMode.GraphicMode);
}
```

`connectDotPad()`가 `DotPadSDK-3_0_0.js`를 통해 기기를 연결하며, 미연결 시
`dotpad-adapter.js`의 시뮬레이션 브리지가 콘솔/프리뷰로 동작을 확인시켜 줍니다.

## Matrix 구조

- 60 × 40 = 2,400 bits
- 8 bits → 1 byte로 pack → 총 300 bytes
- `matrixToDotPadHex(matrix)`로 600자 hex 데이터 생성

---

# 외부 플랫폼 임베드 (TW / Dot Games)

Dot Forest는 단독 실행과 **iframe 임베드(accessible game module)** 를 모두 지원합니다.
임베드 레이어는 `embed.js` + `embed.css`(드롭인)와 `screens.js` 2곳 수정으로 구현되며,
**게임 로직(`script.js`)·접근성·DotPad 촉각 매트릭스는 그대로 유지**됩니다.

## URL 파라미터

| 파라미터 | 동작 |
|---|---|
| `?embed=1` | 임베드 모드(타이틀 생략·게임 직행, 잉여 크롬 숨김, 풀필). **iframe 안이면 자동 활성**, `?embed=0`으로 해제 |
| `?preview=0` | DotPad **시각 프리뷰 패널만** 숨김 — tactile matrix 생성·하드웨어 출력은 유지 |
| `?controls=compact` | HUD·정보키·D-pad·미션을 compact로 축소(작은 iframe/모바일) |
| `?autostart=1` | 타이틀 없이 바로 게임 진입(오디오/TTS는 브라우저 정책상 첫 사용자 입력 후 활성) |
| `?theme=dark` \| `?theme=light` | 부모 톤에 맞춘 최소 레터박스 톤 변경(숲 고유 톤은 캔버스가 유지) |
| `?lang=ko` \| `?lang=en` | 초기 언어 |

권장 임베드 URL: `…/index.html?embed=1&preview=0&controls=compact`

```html
<iframe src="https://byeol-coder.github.io/forest_pro/?embed=1&preview=0&controls=compact"
        allow="bluetooth; microphone; autoplay; clipboard-write"
        title="Dot Forest 촉각 게임" style="width:100%;height:100%;border:0"></iframe>
```

## postMessage 프로토콜

**게임 → 부모** (`window.parent.postMessage({type, …}, parentOrigin)`)

| type | 시점 / payload |
|---|---|
| `DOT_FOREST_LOADED` | 임베드 레이어 로드 |
| `DOT_FOREST_READY` | 게임 bridge 준비 완료 `{game, version}` (+ 호환용 `{source:'dotforest', type:'dotforest:ready'}` 동시 발신) |
| `DOT_FOREST_STARTED` | 게임 화면 진입 |
| `DOT_FOREST_PAUSED` / `DOT_FOREST_RESUMED` | 일시정지/재개 |
| `DOT_FOREST_PROGRESS` | 변화 시 `{missionId, collected, total, areaId}` |
| `DOT_FOREST_TACTILE_UPDATE` | 변화 시 `{width:60, height:40, matrixSummary}` — **전체 매트릭스 아님(요약·throttled 500ms)** |
| `DOT_FOREST_COMPLETE` | 완료 `{missionId, score, time}` |
| `DOT_FOREST_RESIZE` | 리사이즈 `{width, height}` |
| `DOT_FOREST_EXIT` | 나가기 `{reason}` (+ 호환용 `dotforest:exit`) |
| `DOT_FOREST_ERROR` | 오류 `{message, code}` |

**부모 → 게임**

`DOT_FOREST_START` · `DOT_FOREST_PAUSE` · `DOT_FOREST_RESUME` · `DOT_FOREST_RESET` ·
`DOT_FOREST_SET_PREVIEW{visible}` · `DOT_FOREST_SET_COMPACT{enabled}` · `DOT_FOREST_FOCUS` · `DOT_FOREST_MUTE{muted}`
(기존 `{source:'tw', type:'tw:pause|tw:resume|tw:setLang'}` 도 호환 수신)

> **오리진:** `embed.js`의 `ALLOWED_ORIGINS`에 운영 TW 오리진을 고정하세요. 실제 부모(referrer) 오리진은 항상 신뢰합니다.
> 비우면 개발 개방 모드. `'*'` 무분별 사용은 피하도록 구조화돼 있습니다.

## window.DotForestEmbed API

```js
window.DotForestEmbed = {
  isEmbed,                       // boolean
  start(), pause(), resume(), reset(), focus(),
  setPreviewVisible(visible),    // 시각 프리뷰만 토글(촉각 로직 유지)
  setCompactMode(enabled),
  setMuted(muted),               // AudioContext suspend + TTS 정지
  getState(),                    // { isEmbed, preview, compact, theme, lang, screen, paused, muted, progress }
  destroy()                      // message/resize 리스너·ResizeObserver·MutationObserver·폴링 정리
}
```
중복 초기화 가드(`__ready`) 포함. `destroy()`는 모든 리스너/옵저버/인터벌을 해제합니다.

## 테스트

- 로컬: `node serve.js` → `http://localhost:8092/embed-test.html`
  (Start/Pause/Resume/Reset/Preview/Compact/Mute/Focus 버튼 + postMessage 로그 + iframe 비율 토글)
- 직접 URL: `?embed=1` / `?embed=1&preview=0` / `?embed=1&controls=compact` / `?embed=1&autostart=1` /
  `?embed=1&preview=0&controls=compact&autostart=1`(TW 최종형)

## 접근성 유지 체크리스트 (임베드에서도 불변)

- [x] `aria-label`·`role`·live region 유지
- [x] 키보드 조작(방향키/WASD), 정보키 `1~4`(DotPad `F1~F4`) 유지
- [x] 스크린리더 안내·TTS 음성 안내 유지(뮤트 시 일시 정지, 해제 시 복귀)
- [x] **DotPad 60×40 tactile matrix 생성·출력 유지**(`?preview=0`은 시각 패널만 숨김)
- [x] 임베드 진입 시 게임 컨테이너/시작에 포커스, `<iframe title>` 제공
- [x] 색만이 아니라 형태·위치·음성·촉각으로 정보 전달
