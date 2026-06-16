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
