# DotPad 키 매핑 노트 (Dot Games 규격 §6)

DotPad 물리 키로 Lumi를 **단순 키만으로 완전 4방향 이동 + 수집**할 수 있어야 하며,
Debug Key Log에 매핑된 동작이 보여야 합니다.

## 현재 매핑 (규격 §6 — 이동 우선)

- `PanningLeft` / LP+0 → 왼쪽 이동
- `PanningRight` / RP+0 → 오른쪽 이동
- `F1` (KeyFunction1) → 앞으로(위) 이동
- `F2` (KeyFunction2) → 뒤로(아래) 이동
- `F3` (KeyFunction3) → 수집 / 선택(먹기)
- `F4` (KeyFunction4) → 촉각 지도 안내 + 현재 프레임 재전송
- `PanningAll` / AP+0 → 주변 음성 안내

## 보조 (backward-compat)

- `LPF1` / LP+8 → 위 이동, `RPF4` / RP+1 → 아래 이동 (조합키)
- `F12`~`F34` 조합키 → 수집

> 이전 매핑(F1~F4 = 위치/주변/미션/지도)에서 변경됨. 위치·주변·미션 정보는
> 키보드 `1~4`와 화면 정보 버튼으로 계속 제공됩니다(접근성 유지).

## 검증 (기기 없이)

콘솔: `window.DotForest.dotPad.simulateKey('KeyFunction1')`(앞으로),
`simulateKey('KeyFunction3')`(수집), `simulateKey('PanningLeft')`(왼쪽) 등으로 시뮬레이션.
SDK가 canonical KeyCodes 대신 raw 라벨을 반환하면 게임 핸들러 전달 전에 정규화할 것.

Status: §6 이동 우선 매핑 적용 완료 (시뮬레이션 검증: F1→앞, F2→뒤, F3→수집, PanL/R→좌우).
