/**
 * 주요 경제 지표 조회 페이지를 위한 스크립트
 * 각 기관의 API를 사용하여 금리 및 환율 정보를 가져옵니다.
 */

window.stockInfo = (function() {
  // [주의] 아래 3개의 키를 실제 발급받은 인증키로 변경해야 합니다.
  const BOK_API_KEY = 'PS5YEPUI6Y73XIKINVH6'; // 한국은행 ECOS API 키
  const FRED_API_KEY = 'ed787be6c0c8ab0e53a959d408393835'; // 미국 FRED API 키

  let indicatorsResultDiv;
  let refreshBtn;

  /**
   * 페이지 초기화 함수
   */
  function init() {
    indicatorsResultDiv = document.getElementById('indicators-result');
    refreshBtn = document.getElementById('refreshIndicatorsBtn');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', fetchAllIndicators);
    }

    fetchAllIndicators();
  }

  /**
   * 모든 경제 지표를 병렬로 가져옵니다.
   */
  async function fetchAllIndicators() {
    renderLoading();

    const results = await Promise.allSettled([
      fetchBokRate(),
      fetchFredRate(),
      fetchExchangeRate()
    ]);

    renderIndicators(results);
  }

  /** 한국은행 기준금리 조회 */
  async function fetchBokRate() {
    if (!BOK_API_KEY || BOK_API_KEY === 'YOUR_BOK_API_KEY') {
      throw new Error('한국은행 API 키 필요');
    }

    const formatDate = (date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      return `${yyyy}${mm}${dd}`;
    };

    const today = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(today.getMonth() - 3);

    // 722Y001/0101000: CD 91일물 금리
    const url = `https://ecos.bok.or.kr/api/StatisticSearch/${BOK_API_KEY}/json/kr/1/100/722Y001/D/${formatDate(threeMonthsAgo)}/${formatDate(today)}/0101000`;

    // CORS 우회를 위해 프록시 사용
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(url);
    const data = await response.json();
    const latestItem = data?.StatisticSearch?.row?.pop();
    if (!latestItem) throw new Error('BOK 데이터 없음');
    return {
      title: '한국 기준금리',
      value: `${parseFloat(latestItem.DATA_VALUE).toFixed(2)} %`,
      source: `BOK (${latestItem.TIME.slice(0,4)}-${latestItem.TIME.slice(4,6)}-${latestItem.TIME.slice(6,8)})`
    };
  }

  /** 미국 기준금리 조회 */
  async function fetchFredRate() {
    if (!FRED_API_KEY || FRED_API_KEY === 'YOUR_FRED_API_KEY') throw new Error('FRED API 키 필요');
    // DFEDTARU: Federal Funds Target Range - Upper Limit
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;

    // CORS 우회를 위해 프록시 사용
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(url);
    const data = await response.json();
    const item = data?.observations?.[0];
    if (!item) throw new Error('데이터 없음');
    return {
      title: '미국 기준금리',
      value: `${parseFloat(item.value).toFixed(2)} %`,
      source: `FRED (${item.date})`
    };
  }

  /** 원/달러 환율 조회 */
  async function fetchExchangeRate() {
    if (!BOK_API_KEY || BOK_API_KEY === 'YOUR_BOK_API_KEY') throw new Error('한국은행 API 키 필요');
    const url = `https://ecos.bok.or.kr/api/KeyStatisticList/${BOK_API_KEY}/json/kr/1/100`;

    // CORS 우회를 위해 프록시 사용
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(url);
    const data = await response.json();
    const item = data?.KeyStatisticList?.row?.find(
      (row) => row.KEYSTAT_NAME === "원/달러 환율(종가)"
    );
    if (!item) throw new Error('BOK 환율 데이터 없음');
    return {
      title: '원/달러 환율',
      value: `${parseFloat(item.DATA_VALUE).toLocaleString('ko-KR', {minimumFractionDigits: 2})} ${item.UNIT_NAME}`,
      source: `BOK (${item.CYCLE} 종가)`
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
        let errorMessage = '호출 실패'; // 기본 오류 메시지
        let errorDetail = result.reason.message; // API가 반환한 원본 오류

        if (errorDetail.includes('API 키 필요')) {
          errorMessage = 'API 키를 확인하세요.';
          errorDetail = 'API 키가 올바르게 설정되었는지 확인해주세요.';
        } else if (errorDetail.includes('데이터 없음')) {
          errorMessage = '데이터 없음';
          errorDetail = 'API에서 데이터를 제공하지 않았습니다. 잠시 후 다시 시도해주세요.';
        } else if (result.reason instanceof TypeError && errorDetail.includes('fetch')) {
          errorMessage = '네트워크 오류';
          errorDetail = '인터넷 연결 또는 API 서버 상태를 확인해주세요.';
        }
        html += `
          <div class="indicator-item">
            <h4>오류</h4>
            <p class="indicator-value neg">${errorMessage}</p>
            <p class="indicator-source" title="${result.reason.message}">${errorDetail}</p>
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