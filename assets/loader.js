// ====================================================================
// [로더 스크립트 - 전체 조각 조립 및 탭 관리]
// ====================================================================

const TABS = [
  { id: 'calculator', name: '레버리지 계산기', html: './assets/calculator.html', js: './assets/calculator.js', enabled: true },
  { id: 'loss_recovery_sim', name: '장기투자 시뮬레이터', html: './pages/short_term_sim.html', js: './pages/short_term_sim.js', enabled: true },
  { id: 'short_term_sim', name: '단기매매 시뮬레이터', html: './pages/loss_recovery_sim.html', js: './pages/loss_recovery_sim.js', enabled: true },
  { id: 'disclaimer', name: '이용약관/면책조항', html: './pages/disclaimer.html', js: './pages/disclaimer.js', enabled: false },
  { id: 'privacy', name: '개인정보처리방침', html: './pages/privacy.html', js: './pages/privacy.js', enabled: false }
];

function loadScriptOnce(src){
  return new Promise((resolve, reject) => {
    if(document.querySelector(`script[src="${src}"]`)){ resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

function loadCSS(href){
  return new Promise((resolve) => {
    if(document.querySelector(`link[href="${href}"]`)){ resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    document.head.appendChild(link);
  });
}

async function fetchText(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('불러오기 실패: ' + url);
  return await res.text();
}

function buildTabBar(container){
  const bar = document.createElement('div');
  bar.className = 'tab-bar';
  TABS.filter(t => t.enabled).forEach((t, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (idx === 0 ? ' active' : '');
    btn.textContent = t.name;
    btn.dataset.tabId = t.id;
    btn.onclick = () => activateTab(t.id);
    bar.appendChild(btn);
  });
  container.appendChild(bar);
}

const loadedTabs = new Set();

async function activateTab(tabId){
  const tabInfo = TABS.find(t => t.id === tabId);
  if(!tabInfo) return;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tabId === tabId);
  });

  // 1. History API를 사용하여 URL을 변경하고, 페이지 제목을 동적으로 업데이트합니다.
  document.title = `${tabInfo.name} | 레버리지 손익 시뮬레이션 계산기`;
  history.pushState({tabId: tabId}, tabInfo.name, `#${tabId}`);

  const contentEl = document.getElementById('tab-content');

  TABS.filter(t => t.enabled).forEach(t => {
    const pane = document.getElementById('tab-pane-' + t.id);
    if(pane) pane.style.display = (t.id === tabId) ? 'block' : 'none';
  });

  let pane = document.getElementById('tab-pane-' + tabId);
  if(!pane){
    pane = document.createElement('div');
    pane.id = 'tab-pane-' + tabId;
    contentEl.appendChild(pane);
  }

  if(!loadedTabs.has(tabId)){
    pane.innerHTML = await fetchText(tabInfo.html);
    await loadScriptOnce(tabInfo.js);
    loadedTabs.add(tabId);

    // 탭 로드 후 초기화 함수 호출
    if (tabId === 'loss_recovery_sim' && window.shortTermSim) {
      window.shortTermSim.init();
    }
    if (tabId === 'short_term_sim' && window.lossRecoverySim) {
      window.lossRecoverySim.init();
    }

  }

  pane.style.display = 'block';
}

// 2. 브라우저의 뒤로가기/앞으로가기 버튼에 대응하기 위한 이벤트 리스너를 추가합니다.
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.tabId) {
    activateTab(event.state.tabId);
  }
});

async function injectAdsense(){
  try {
    const adHtml = await fetchText('./assets/adsense.html');
    const wrap = document.createElement('div');
    wrap.innerHTML = adHtml;
    document.getElementById('app-root').appendChild(wrap);
  } catch(e) {}
}

async function bootstrap(){
  await loadCSS('./assets/styles.css');
  await loadScriptOnce('./common_utils.js'); // 공통 유틸리티 스크립트 우선 로드

  const root = document.getElementById('app-root');
  buildTabBar(root);

  const contentEl = document.createElement('div');
  contentEl.id = 'tab-content';
  root.appendChild(contentEl);

  // 3. 페이지 첫 로드 시 URL의 해시값을 확인하여 해당 탭을 활성화합니다.
  const initialTabId = window.location.hash.substring(1);
  const tabToLoad = TABS.find(t => t.id === initialTabId && t.enabled) || TABS.find(t => t.enabled);

  if(tabToLoad) await activateTab(tabToLoad.id);

  await loadScriptOnce('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
  await injectAdsense();

  const policyLinks = document.createElement('div');
  policyLinks.style.textAlign = 'center';
  policyLinks.style.fontSize = '11px';
  policyLinks.style.color = 'var(--subtext)';
  policyLinks.style.marginTop = '20px';
  policyLinks.style.padding = '0 10px';

  const disclaimerLink = document.createElement('a');
  disclaimerLink.href = './pages/disclaimer.html';
  disclaimerLink.target = '_blank';
  disclaimerLink.textContent = '이용약관/면책조항';

  const privacyLink = document.createElement('a');
  privacyLink.href = './pages/privacy.html';
  privacyLink.target = '_blank';
  privacyLink.textContent = '개인정보처리방침';

  policyLinks.appendChild(disclaimerLink);
  policyLinks.append(' | ');
  policyLinks.appendChild(privacyLink);
  root.appendChild(policyLinks);

  const footer = document.createElement('div');
  footer.style.textAlign = 'center';
  footer.style.fontSize = '11px';
  footer.style.color = 'var(--subtext)';
  footer.style.marginTop = '20px';
  footer.style.padding = '10px';
  footer.textContent = `© 2026 Seungyun Yu. All rights reserved.
본 사이트의 자체 제작 콘텐츠·소스코드·디자인의 무단 복제, 재배포 및 상업적 이용을 금지합니다.`;
  root.appendChild(footer);
}

document.addEventListener('DOMContentLoaded', bootstrap);
