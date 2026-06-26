# DotPad Game Tactile Standard 키 매핑

DotPad 물리 키는 이동, 정보 확인, 상호작용, 촉각 보기 전환을 분리합니다.

## 현재 매핑

- `PanningLeft` → 왼쪽 이동
- `PanningRight` → 오른쪽 이동
- `LPF1` → 앞으로 이동
- `RPF4` → 뒤로 이동
- `F1` (`KeyFunction1`) → 현재 위치와 바라보는 방향 읽기
- `F2` (`KeyFunction2`) → 수집 / 상호작용 / 확인
- `F3` (`KeyFunction3`) → 현재 미션 읽기
- `F4` (`KeyFunction4`) → 주변·위험·목표 스캔 + 현재 촉각 프레임 재전송
- `PanningAll` → 현재 주변 / 전체 맵 / 목표 방향 보기 전환
- `F12`~`F34` 조합키 → 수집 / 상호작용 보조 입력

## 검증

콘솔에서 다음처럼 모의 입력을 보낼 수 있습니다.

```js
window.DotForest.dotPad.simulateKey('KeyFunction1'); // 현재 위치
window.DotForest.dotPad.simulateKey('KeyFunction2'); // 상호작용
window.DotForest.dotPad.simulateKey('PanningLeft');  // 왼쪽 이동
window.DotForest.dotPad.simulateKey('PanningAll');   // 촉각 보기 전환
```
