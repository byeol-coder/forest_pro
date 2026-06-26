# Game Tactile Standard 적용 구조

`src/game-tactile/`은 시각 화면을 축소하지 않고 게임 판단에 필요한 상태만 60×40 촉각 grid로 재구성합니다.

- `standard.js`: 우선순위, 제한값, 보기 모드, 전송 정책
- `symbols.js`: 플레이어·벽·목표·위험·상호작용·출구 기호
- `renderer.js`: Dot Forest 상태를 로컬·전체 맵·목표 방향 grid로 합성
- `input-map.js`: DotPad·키보드 입력 의미
- `feedback.js`: 이동·실패·위험·목표 피드백 규칙
- `scoring.js`: Game Tactile Playability Score
- `dotpad-stream.js`: 100ms 전송 간격, 우선순위 큐, 동일 HEX 중복 제거

기본 로컬 보기에서는 이동 가능한 길을 빈 공간으로 두고 플레이어, 목표, 위험, 벽, 상호작용 대상만 표시합니다. 위험이 많으면 상호작용 대상을 먼저 줄여 핵심 객체와 패턴 수를 제한합니다.
