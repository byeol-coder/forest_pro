# Dot Forest 임베드 레이어 — forest_pro 소스 반영 안내

**목적:** `forest_pro`를 TW(Tactile World) 닷게임스에 `<iframe>` 임베드하기 위한 **비침습 레이어**입니다.
아래를 소스에 반영하면 다음 빌드에도 유지됩니다. **게임 로직(`script.js`)은 건드리지 않습니다.**

> 현재 TW는 데모를 위해 이 레이어를 얹은 빌드를 배포한 상태입니다. 향후 빌드에서 사라지지 않도록 소스에 반영 부탁드립니다.

---

## 1. 추가 파일 (드롭인, 그대로 복사)
- **`embed.js`** — `?embed`/`?preview`/`?lang` 파싱 → `html` 클래스 토글, 부모↔자식 `postMessage` 브리지(오리진 검증·`'*'` 미사용), `ResizeObserver`로 컨테이너 리사이즈 트리거
- **`embed.css`** — `html.is-embed` / `html.no-preview` **한정** 레이아웃(타이틀·전체화면·모바일배너·나가기 버튼·프리뷰 dock 숨김 + 캔버스 100% 풀필). 단독 실행 화면은 불변.

## 2. `index.html` 수정 (2곳)
CSS 링크들 뒤에 추가:
```html
<link rel="stylesheet" href="./embed.css?v=1" />
```
`screens.js`·`script.js`보다 **먼저** 로드(권장: `<head>`, importmap 앞):
```html
<script src="./embed.js?v=1"></script>
```

## 3. `screens.js` 수정 (2곳)
**(a) 부트 마지막 줄**
```js
// 변경 전
show('title');
// 변경 후 — 임베드면 게임 직행(타이틀의 시작 핫스팟 data-nav="game" 과 동일 동작)
show(window.TW && window.TW.embed ? 'game' : 'title');
```
**(b) `[data-nav]` 클릭 핸들러**
```js
// 변경 후 — 임베드에서 'title' 이동은 숨긴 타이틀로 가지 않고 부모 종료 신호로 치환
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;
  if (window.TW && window.TW.embed && nav.dataset.nav === 'title') {
    e.preventDefault();
    if (window.TWBridge) window.TWBridge.exit('user');
    return;
  }
  show(nav.dataset.nav);
});
```

## 4. `embed.js`에서 확인/갱신할 값
- **`TW_ORIGINS`**: 실제 TW 오리진으로 갱신(운영 + 프리뷰). 현재 `'https://tib-preview.vercel.app'` 포함.
- 최종 **호스팅 경로**(dot-games-host 서브경로인지 GitHub Pages인지) 확정해서 TW에 공유 — 오리진 검증·`postMessage`가 맞물려야 합니다.

## 5. 빌드/배포
- `vite.config.js` `base: './'`(상대경로) 유지, 폴더 자기완결, `.nojekyll` 포함, Pages 소스 "GitHub Actions".
- (선택) 배포 산출물에서 개발용 파일 제거: `package.json`·`package-lock.json`·`serve.js`·`EMBED_SPEC.md`.

---

## 6. 검증 체크리스트 (런타임 — 코드만으론 확인 불가, 직접 점검 부탁)
- [ ] `?embed=1` 진입 시 타이틀/선택 화면 없이 게임 직행, **3D 씬·렌더 루프 정상 기동**
- [ ] `?embed=1`에서 전체화면·모바일배너·나가기 버튼 등 잉여 크롬 미표시
- [ ] `?preview=0` 시 `.tactile-dock`가 **공간까지** 사라짐 / **단, DotPad 하드웨어 출력(`sendDotPadFrame`)은 정상 동작**
- [ ] iframe을 가로·세로·정사각 임의 비율로 리사이즈해도 캔버스 **왜곡·여백·스크롤바 없음** (`script.js`의 `onResize` ~1614행 연동 확인)
- [ ] Chrome/Edge에서 `allow="bluetooth"` iframe 내 **DotPad 연결 성공**(HTTPS·버튼 제스처)
- [ ] (선택) 프리뷰 숨김 시 `#tactileCanvas` 미러 드로잉 가드(연산 절약, 정확성엔 영향 없음)
- [ ] 모든 `postMessage`가 오리진 검증 통과, `'*'` 미사용

## 7. (선택) 인게임 '나가기'로 모달까지 닫기
현재 TW는 자체 닫기(X)를 제공하므로 인게임 나가기 버튼은 임베드에서 숨김 처리됩니다(충분).
인게임 버튼으로 모달을 닫고 싶다면 TW가 `dotforest:exit` 수신을 추가하면 됩니다(필수 아님).

---

## 8. 호스팅·오리진 확정 (2026-06-17)

- **게임(자식 iframe) 호스팅 URL:** `https://byeol-coder.github.io/forest_pro/` — GitHub Pages, HTTPS ✓, `base:'./'` 상대경로라 `/forest_pro/` 서브경로에서 정상 동작.
- **자식 오리진(부모가 `event.origin` 검증에 쓸 값):** `https://byeol-coder.github.io`
- **TW 임베드 예시:**
  ```html
  <iframe src="https://byeol-coder.github.io/forest_pro/?embed=1&preview=0"
          allow="bluetooth; microphone; autoplay; clipboard-write"
          title="Dot Forest 촉각 게임"
          style="width:100%;height:100%;border:0"></iframe>
  ```
- **`embed.js` `TW_ORIGINS`(부모 = TW 허브 오리진):** 현재 `https://tib-preview.vercel.app` 포함.
  운영 TW 오리진을 받으면 이 목록만 교체하면 됨(자식 호스팅과 무관).
- 배포: GitHub Pages(main), `.nojekyll` 포함. (선택) 배포물에서 `package*.json`·`serve.js`·`vite.config.js`는 런타임 불필요.

---

## 9. 임베드 풀필 보강 — TW 정본 embed.css에 반영 요망 (2026-06-17)

정본 패치 `embed.css`를 **그대로만** 적용하면 임베드에서 하단 ~63px 여백 + 스크롤바가
생깁니다(원인: 단독 빌드의 `.app` 패딩 1.1rem, `#screen-game .stage--game{height:min(92vh,1100px)}`
제한이 임베드에서 해제되지 않음). 아래 **5줄을 `html.is-embed`에 추가**하면 풀필이 완성됩니다.
이 저장소의 `embed.css`에는 이미 반영돼 있으니, **TW 정본 embed.css도 동일하게 갱신**해 주세요
(다음 핸드오프에서 정본으로 덮어쓸 때 여백이 재발하지 않도록).

```css
/* responsive fill 블록에 추가 */
html.is-embed, html.is-embed body { ... overflow: hidden; }   /* overflow:hidden 추가 */
html.is-embed { scrollbar-width: none; }
html.is-embed::-webkit-scrollbar { display: none; }
html.is-embed .app { ... max-width: none; margin: 0; padding: 0; }   /* 패딩/마진/최대폭 해제 */
html.is-embed #screen-game .stage--game { width: 100%; height: 100%; min-height: 0; margin-left: 0; }
```

> 가장 간단한 반영법: TW 정본 `embed.css`를 이 저장소의 `embed.css`로 교체.
> `embed.js`·`screens.js`는 정본 패치와 100% 동일(verbatim)하므로 추가 조치 불필요.

검증(런타임): 1920×1080·정사각(760²) 모두 풀필, 종횡비 일치(왜곡 없음), 스크롤바 없음.
