<<<<<<< HEAD
# dot-forest

Dot Pad 패닝키로 웹 게임 캐릭터와 60×40 촉각 그래픽을 동시에 조작하는 접근성 게임 프로토타입입니다.

## 현재 화면 모드

상단 게임 화면은 **이미지 배경 + 캐릭터 애니메이션만 보이는 Visual-only 모드**로 정리했습니다.

- 게임 화면 위 설명 텍스트 제거
- HUD, 미니맵, 말풍선, 미션 패널, 안내 패널 숨김
- Dot Pad Preview와 하단 설명 패널은 DOM에는 유지하되 화면에서는 숨김
- 닷패드 패닝키 / 키보드 입력에 따라 상단 캐릭터가 계속 움직임
- 실제 Dot Pad 출력 로직은 `script.js`에서 계속 유지

## 이번 적용 내용

- 웹 게임 화면의 플레이어 캐릭터와 Dot Pad 60×40 캐릭터 좌표 동기화
- 패닝키/키보드 입력 시 동일한 `playerStep` 상태를 기준으로 웹 화면과 촉각 출력 동시 갱신
- 220ms 걷기 애니메이션
- 도트링/동료 캐릭터 지연 추종 애니메이션
- 이동 발자국 이펙트
- 충돌 시 blocked 애니메이션
- 루미 인사 성공 시 success 애니메이션과 하트 이펙트
- Dot Pad 출력에 이동 전 위치 잔상과 도트링 촉각 패턴 추가
- 60×40 → 2,400bit → 300byte → 600 hex preview 생성
- `visual-only.css` 추가로 게임 화면을 이미지/애니메이션 중심으로 단순화

## 조작

화면에 버튼이 보이지 않아도 아래 입력은 계속 동작합니다.

- 왼쪽 패닝키 / `←`: 이전 이동
- 오른쪽 패닝키 / `→`: 다음 이동
- 기능키 2 / `Enter` / `Space`: 선택 또는 루미와 인사
- `1`: 현재 위치
- `3`: 미션 확인
- `4`: 주변 설명
- `5`: 도움말

## 실제 Dot Pad 연동 위치

`script.js`의 `sendToDotPad(matrix, scene)`에서 `window.DotPadBridge.sendGraphic()`으로 전달합니다.
=======
# Dot Forest: Lumi & Dotlings

Meshy AI에서 생성한 GLB 캐릭터를 활용한 웹/모바일 반응형 촉각 그래픽 게임 MVP입니다.

## 포함 파일

- `index.html` — 앱 화면 구조
- `style.css` — 반응형 UI, 접근성 스타일
- `script.js` — Three.js 게임 로직, 60×40 matrix 변환, DotPad SDK 연결 placeholder
- `assets/lumi_walk.glb` — Meshy AI walking 캐릭터
- `assets/lumi_run.glb` — Meshy AI running/collect 대체 애니메이션
- `assets/dotring.glb` — 도트링 아이템 모델

## 실행 방법

로컬 파일을 바로 열면 브라우저 CORS 정책 때문에 GLB 로드가 막힐 수 있습니다. 아래처럼 로컬 서버로 실행하세요.

```bash
cd dot-forest-prototype
python3 -m http.server 8080
```

브라우저에서 아래 주소를 엽니다.

```txt
http://localhost:8080
```

## 조작 방법

- 키보드: 방향키 또는 WASD
- 모바일: 화면 D-pad
- 음성: “앞으로”, “뒤로”, “왼쪽”, “오른쪽”, “먹기”
- 상호작용: Enter, Space, 또는 먹기 버튼

## DotPad SDK 연결 지점

`script.js`의 아래 함수가 실제 SDK 연결 지점입니다.

```js
function sendDotPadFrame(matrix) {
  const bytes = matrixToPackedBytes(matrix);
  // window.DotPadSDK.sendGraphic(bytes) 등 실제 SDK 호출로 교체
}
```

현재는 SDK 실기기 연결 전 단계이므로 60×40 tactile preview와 콘솔 출력으로 동작을 확인합니다.

## Matrix 구조

- 60×40 = 2,400 bits
- 8 bits = 1 byte로 pack
- 총 300 bytes
- `bytesToHex(bytes)`로 600자 hex 데이터 확인 가능
>>>>>>> b920dd7 (Add Dot Forest 3D GLB prototype)
