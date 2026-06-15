/*
  Visual Enhancement Layer
  ------------------------
  Makes the visual game screen feel like a richer 8-bit forest adventure while keeping
  Dot Pad output safe, sparse, and tactile-readable.
*/
(function () {
  const placeMeta = {
    title: { label: '타이틀 화면', action: '기능키 2로 시작', items: '열매 0 · 꽃 0', position: 'Center' },
    dot: { label: '첫 번째 점', action: '기능키 2로 계속', items: '열매 0 · 꽃 0', position: 'Center' },
    path: { label: '돌길', action: '좌/우 이동키로 탐색', items: '열매 0 · 꽃 0', position: 'Path' },
    home: { label: '작은 오두막', action: '기능키 2로 확인', items: '열매 0 · 꽃 0', position: 'Home' },
    tree: { label: '열매나무', action: '기능키 2로 열매 확인', items: '열매 후보 3', position: 'Tree' },
    plaza: { label: '숲속 광장', action: '오른쪽 이동키로 루미 찾기', items: '열매 후보 3', position: 'Plaza' },
    lumi: { label: '루미', action: '기능키 2로 인사', items: '열매 후보 3', position: 'Lumi' },
    flower: { label: '꽃밭', action: '주변 설명 듣기', items: '꽃 4', position: 'Flower Field' },
    bridge: { label: '나무다리', action: '다리 방향 확인', items: '꽃 4', position: 'Bridge' },
    river: { label: '물가', action: '다리로 이동', items: '물가 발견', position: 'River' },
    clear: { label: 'MISSION CLEAR', action: '기능키 2로 자유 탐색', items: '인사 완료', position: 'Lumi' },
    hardware: { label: '하드웨어 안내', action: '기능키 2로 다음', items: '조작 학습', position: 'Controls' }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function updateHud(visualId, label) {
    const meta = placeMeta[visualId] || { label: label || 'Forest Village', action: '좌/우 이동키로 탐색', items: '열매 0 · 꽃 0', position: 'Center' };
    const tactileScene = $('tactileSceneLabel');
    const tactilePos = $('tactilePositionLabel');
    const tactileStatus = $('tactileStatusLabel');
    const hudMission = $('hudMission');
    const hudItems = $('hudItems');
    const hudAction = $('hudAction');

    if (tactileScene) tactileScene.textContent = meta.label;
    if (tactilePos) tactilePos.textContent = meta.position;
    if (tactileStatus) tactileStatus.textContent = visualId === 'lumi' || visualId === 'clear' ? 'Mission Object Detected' : 'Safe Single Object Output';
    if (hudMission) hudMission.textContent = visualId === 'clear' ? 'MISSION CLEAR · 루미와 첫 인사 완료' : 'MISSION 01 · 루미와 첫 인사';
    if (hudItems) hudItems.textContent = meta.items;
    if (hudAction) hudAction.textContent = meta.action;

    document.querySelectorAll('.mini-node').forEach((node) => {
      node.classList.toggle('active', node.dataset.node === visualId);
    });
  }

  const originalRenderVisualScene = window.renderVisualScene;

  window.renderVisualScene = function enhancedRenderVisualScene(visualId, label = '') {
    const places = window.PLACES || [];
    const place = places.find((item) => item.id === visualId) || places[window.placeIndex] || { visualX: '52%', visualY: '28%' };
    const caption = visualId === 'clear' ? 'MISSION CLEAR!' : visualId === 'title' ? 'PRESS 기능키 2 TO START' : label;
    const focusX = place.visualX || '52%';
    const focusY = place.visualY || '28%';
    const screen = $('visualGameScreen');
    if (!screen) return;

    screen.style.setProperty('--focus-x', focusX);
    screen.style.setProperty('--focus-y', focusY);
    screen.style.setProperty('--player-x', `calc(${focusX} - 24px)`);
    screen.style.setProperty('--player-y', `calc(${focusY} - 10px)`);

    screen.innerHTML = `
      <div class="visual-caption">${caption}</div>
      <div class="v-layer-hill"></div>
      <div class="v-tile-grass"></div>
      <div class="visual-sprite v-sky-cloud"></div>
      <div class="visual-sprite v-fence"></div>
      <div class="visual-sprite v-path"></div>
      <div class="visual-sprite v-river"></div>
      <div class="visual-sprite v-pond"></div>
      <div class="visual-sprite v-stepping-stones"></div>
      <div class="visual-sprite v-bridge"></div>
      <div class="visual-sprite v-orchard-tree v-tree-a"></div>
      <div class="visual-sprite v-orchard-tree v-tree-b"></div>
      <div class="visual-sprite v-orchard-tree v-tree-c"></div>
      <div class="visual-sprite v-apple a1"></div>
      <div class="visual-sprite v-apple a2"></div>
      <div class="visual-sprite v-apple a3"></div>
      <div class="visual-sprite v-house"></div>
      <div class="visual-sprite v-flower"></div>
      <div class="visual-sprite v-rock r1"></div>
      <div class="visual-sprite v-rock r2"></div>
      <div class="visual-sprite v-rock r3"></div>
      <div class="visual-sprite v-berry b1"></div>
      <div class="visual-sprite v-berry b2"></div>
      <div class="visual-sprite v-berry b3"></div>
      <div class="visual-sprite v-mushroom m1"></div>
      <div class="visual-sprite v-mushroom m2"></div>
      <div class="visual-sprite v-crate"></div>
      <div class="visual-sprite v-signpost"></div>
      <div class="visual-sprite v-mission-item coin"></div>
      <div class="visual-sprite v-mission-item leaf"></div>
      <div class="visual-sprite v-lumi"></div>
      <div class="v-speech-bubble">루미: 안녕!<br>기능키 2로 인사해줘.</div>
      <div class="visual-sprite v-buddy buddy-1"></div>
      <div class="visual-sprite v-buddy buddy-2"></div>
      <div class="visual-sprite v-buddy buddy-3"></div>
      <div class="visual-sprite v-player"></div>
      <div class="visual-sprite v-focus-ring"></div>
      <div class="v-mini-map-overlay" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="v-progress-badge">STAGE 01 · FOREST VILLAGE</div>
      <div class="v-action-buttons"><span>기능키 2 선택</span><span>기능키 4 주변</span></div>
    `;

    updateHud(visualId, label);
  };

  // Re-render the first screen after the enhancement script loads.
  window.addEventListener('load', function () {
    const sceneName = $('visualSceneName')?.textContent || 'title';
    const id = sceneName.includes('타이틀') || sceneName === 'TITLE' ? 'title' : 'title';
    window.renderVisualScene(id, 'PRESS 기능키 2 TO START');
    updateHud(id, '타이틀 화면');
  });
})();
