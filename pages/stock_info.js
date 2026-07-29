/**
 * 주요 경제 지표 조회 페이지를 위한 스크립트
 * GitHub Actions가 매일 미리 받아둔 data/rates.json을 읽어옵니다.
 */

window.stockInfo = (function() {
  let indicatorsResultDiv;
  let refreshBtn;

  function init() {
    indicatorsResultDiv = document.getElementById('indicators-result');
    refreshBtn = document.getElementById('refreshIndicatorsBtn');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', fetchAllIndicators);
    }

    fetchAllIndicators();
  }

  async function fetchAllIndicators() {
    renderLoading();

    let data;
    try {
      // 캐시로 옛날 값이 보이는 걸 막기 위해 쿼리스트링을 붙임
      const res = await fetch(`./data/rates.json?_=${Date.now()}`);
      if (!res.ok) throw new Error('rates.json 로드 실패');
      data = await res.json();
    } catch (err) {
      renderIndicators([
        { status: 'rejected', reason: err },
        { status: 'rejected', reason: err },
        { status: 'rejected', reason: err }
      ]);
      return;
    }

    const results = [
      toResult(() => buildBokRate(data)),
      toResult(() => buildFredRate(data)),
      toResult(() => buildExchangeRate(data))
    ];

    renderIndicators(results);
  }

  function toResult(fn) {
    try {
      return { status: 'fulfilled', value: fn() };
    } catch (err) {
      return { status: 'rejected', reason: err };
    }
  }

  function buildBokRate(data) {
    const item = data.krBaseRate;
    if (!item) throw new Error('데이터 없음');
    return {
      title: '한국 기준금리',
      value: `${parseFloat(item.value).toFixed(2)} %`,
      source: `BOK (${item.date})`
    };
  }

  function buildFredRate(data) {
    const item = data.usTargetRateUpper;
    if (!item) throw new Error('데이터 없음');
    return {
      title: '미국 기준금리',
      value: `${parseFloat(item.value).toFixed(2)} %`,
      source: `FRED (${item.date})`
    };
  }

  function buildExchangeRate(data) {
    const item = data.usdKrw;
    if (!item) throw new Error('BOK 환율 데이터 없음');
    return {
      title: '원/달러 환율',
      value: `${parseFloat(item.value).toLocaleString('ko-KR', {minimumFractionDigits: 2})} ${item.unit}`,
      source: `BOK (${item.date} 종가)`
    };
  }

  function renderLoading() {
    let html = '';
    for (let i = 0; i < 3; i++) {
      html += `
        <div class="indicator-item">
          <h4>-</h4>
          <p class="indicator-value">불러오는 중...</p>
          <p class="indicator-source">-</p>
        </div>
      `;
    }
    indicatorsResultDiv.innerHTML = html;
  }

  function renderIndicators(results) {
    let html = '';
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        html += `
          <div class="indicator-item">
            <h4>${data.title}</h4>
            <p class="indicator-value">${data.value}</p>
            <p class="indicator-source">${data.source}</p>
          </div>
        `;
      } else {
        const errorDetail = result.reason.message;
        html += `
          <div class="indicator-item">
            <h4>오류</h4>
            <p class="indicator-value neg">불러오기 실패</p>
            <p class="indicator-source" title="${errorDetail}">${errorDetail}</p>
          </div>
        `;
      }
    });
    indicatorsResultDiv.innerHTML = html;
  }

  return {
    init: init
  };
})();