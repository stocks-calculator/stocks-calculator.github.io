// ====================================================================
// [로더 스크립트 - 전체 조각 조립 및 탭 관리]
// ====================================================================

const TABS = [
  { id: 'calculator', name: '레버리지 계산기', html: './assets/calculator.html', js: './assets/calculator.js', enabled: true },
  { id: 'disclaimer', name: '이용약관/면책조항', html: './pages/disclaimer.html', js: './pages/disclaimer.js', enabled: true },
  { id: 'privacy', name: '개인정보처리방침', html: './pages/privacy.html', js: './pages/privacy.js', enabled: true }
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

async function activateTab(tabId){
  const tab = TABS.find(t => t.id === tabId && t.enabled);
  if(!tab) return;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tabId === tabId);
  });
  const contentEl = document.getElementById('tab-content');
  contentEl.innerHTML = await fetchText(tab.html);
  await loadScriptOnce(tab.js);
}

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
  await loadScriptOnce('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');

  const root = document.getElementById('app-root');
  buildTabBar(root);

  const contentEl = document.createElement('div');
  contentEl.id = 'tab-content';
  root.appendChild(contentEl);

  const firstEnabled = TABS.find(t => t.enabled);
  if(firstEnabled) await activateTab(firstEnabled.id);

  await injectAdsense();

  const footer = document.createElement('div');
  footer.style.textAlign = 'center';
  footer.style.fontSize = '11px';
  footer.style.color = 'var(--subtext)';
  footer.style.marginTop = '20px';
  footer.style.padding = '10px';
  footer.textContent = '© 2026 유승윤. All rights reserved. 본 페이지의 소스코드는 저작권법의 보호를 받으며, 무단 복제·배포·상업적 이용을 금합니다.';
  root.appendChild(footer);
}

document.addEventListener('DOMContentLoaded', bootstrap);
