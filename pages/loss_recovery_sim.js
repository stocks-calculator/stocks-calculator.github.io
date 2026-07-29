
// ====================================================================
// [장기투자(가격경로) 시뮬레이터 - 로직 파일]
// - IIFE로 전역 스코프 격리, window.lossRecoverySim 으로만 공개
// - DOM ID는 loss- 접두사 사용
// - 매수 수수료를 평균단가(원가)에 포함하도록 수정
// - 화면 계산과 buildSimSeries()의 hold(targetPrice) 로직을 공통 함수로 통일
// - 중간 계산의 불필요한 Math.trunc() 제거, 출력 시에만 반올림
// ====================================================================

(function () {
  'use strict';
  const DAYS_PER_YEAR = 365;
  const ID = {
    buyPrice: 'lossBuyPrice',
    shares: 'lossShares',
    leverageSel: 'lossLeverageSel',
    leverageCustom: 'lossLeverageCustom',
    customLeverageWrap: 'lossCustomLeverageWrap',
    tradeFeeRate: 'lossTradeFeeRate',
    feeRate: 'lossFeeRate',
    tableBody: 'lossTableBody',
    leverageRateHeader: 'lossLeverageRateHeader',
    principalBox: 'lossPrincipalBox',
    summaryBox: 'lossSummaryBox',
    reportBox: 'lossReportBox',
    reportChart: 'lossReportChart',
  };
  const STORAGE_KEY = 'lossRecoverySimState';

  let reportChartInstance = null;
  let simRows = [];

  function onSimNumInput(el) {
    const cursorPosition = el.selectionStart;
    const originalLength = el.value.length;
    const rawValue = el.value.replace(/[^0-9.-]/g, '');
    const parts = rawValue.split('.');
    const integerPart = parts[0];
    const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('') : '';

    if (rawValue === '-' || rawValue === '.' || rawValue === '-.') {
      el.value = rawValue;
      return;
    }

    if (integerPart) {
      const formattedInteger = parseFloat(integerPart).toLocaleString('ko-KR');
      el.value = formattedInteger + decimalPart;
    } else {
      el.value = rawValue;
    }

    const newLength = el.value.length;
    el.setSelectionRange(
      cursorPosition + (newLength - originalLength),
      cursorPosition + (newLength - originalLength)
    );
  }

  function parseNum(v) {
    if ((v || '').toString() === '-') return 0;
    const n = parseFloat((v || '').toString().replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function formatNumber(num, fractionDigits) {
    const parsedNum = parseFloat(num);
    if (isNaN(parsedNum)) return num;
    return parsedNum.toLocaleString('ko-KR', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }

  function getSimLeverage() {
    const sel = document.getElementById(ID.leverageSel).value;
    if (sel === 'custom') {
      return parseNum(document.getElementById(ID.leverageCustom).value) || 1;
    }
    return parseFloat(sel);
  }

  function getSimDailyFee() {
    const el = document.getElementById(ID.feeRate);
    const annualFee = el ? parseNum(el.value) : 0;
    return (annualFee / 100) / 365;
  }

  function getSimTradeFee() {
    const el = document.getElementById(ID.tradeFeeRate);
    const tradeFee = el ? parseNum(el.value) : 0;
    return tradeFee / 100;
  }

  function onLeverageSelChange() {
    const sel = document.getElementById(ID.leverageSel).value;
    document.getElementById(ID.customLeverageWrap).style.display =
      (sel === 'custom') ? 'block' : 'none';
    recalcSim();
  }

  function addSimRow() {
    simRows.push({ field: null, value: null });
    renderSimTable();
  }

  function removeSimRow(idx) {
    if (simRows.length <= 1) return;
    simRows.splice(idx, 1);
    renderSimTable();
  }

  function resetSim() {
    simRows = [];
    document.getElementById(ID.buyPrice).value = '';
    document.getElementById(ID.shares).value = '';
    document.getElementById(ID.leverageSel).value = '2';
    document.getElementById(ID.leverageCustom).value = '';
    document.getElementById(ID.customLeverageWrap).style.display = 'none';
    document.getElementById(ID.reportBox).innerHTML = `<p class="report-empty">리포트를 생성하려면 먼저 기본 설정(매수 가격, 매수 수량)과 일자별 시뮬레이션 데이터를 입력해주세요.</p>`;
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) chartContainer.style.display = 'none';
    if (reportChartInstance) {
      reportChartInstance.destroy();
    }

    const feeEl = document.getElementById(ID.feeRate);
    localStorage.removeItem(STORAGE_KEY);
    if (feeEl) feeEl.value = '';

    const tradeFeeEl = document.getElementById(ID.tradeFeeRate);
    if (tradeFeeEl) tradeFeeEl.value = '';

    addSimRow();
    addSimRow();
    addSimRow();
    renderSimTable();
  }

  function onSimFieldInput(idx, field, el) {
    onSimNumInput(el);
    simRows[idx] = { field, value: el.value };
    // onblur 이벤트에서 renderSimTable()이 호출되므로 여기서는 update하지 않습니다.
  }

  function formatInputOnBlur(el, fractionDigits) {
    const value = parseNum(el.value);
    // 0을 입력하고 포커스를 잃었을 때 0으로 유지되도록 수정
    if (el.value.trim() === '0' || el.value.trim() === '0.') {
      el.value = '0';
    } else {
      el.value = formatNumber(value, fractionDigits);
    }
    renderSimTable();
  }

  // 계산 내부는 반올림하지 않고 실수로 유지, 화면/엑셀 출력 시에만 Math.trunc/formatNumber 적용.
  function computeRowValues(field, value, prevClose, prevLeveragePrice, leverage, dailyFee, shares, principal) {
    let underlyingRate, leverageRate, leveragePrice, delta;

    if (field === 'delta') {
      delta = value;
      underlyingRate = prevClose ? (delta / prevClose) * 100 : 0;
      leverageRate = underlyingRate * leverage;
      leveragePrice = prevLeveragePrice * (1 + leverageRate / 100 - dailyFee);
    } else if (field === 'underlyingRate') {
      underlyingRate = value;
      delta = prevClose * underlyingRate / 100;
      leverageRate = underlyingRate * leverage;
      leveragePrice = prevLeveragePrice * (1 + leverageRate / 100 - dailyFee);
    } else if (field === 'leverageRate') {
      leverageRate = value;
      underlyingRate = leverage !== 0 ? leverageRate / leverage : 0;
      delta = prevClose * underlyingRate / 100;
      leveragePrice = prevLeveragePrice * (1 + leverageRate / 100 - dailyFee);
    } else if (field === 'leveragePrice') {
      leveragePrice = value;
      leverageRate = prevLeveragePrice !== 0 ? ((leveragePrice / prevLeveragePrice) - 1 + dailyFee) * 100 : 0;
      underlyingRate = leverage !== 0 ? leverageRate / leverage : 0;
      delta = prevClose * underlyingRate / 100;
    } else if (field === 'evalAmount') {
      const evalAmount = value;
      leveragePrice = shares !== 0 ? evalAmount / shares : 0;
      leverageRate = prevLeveragePrice !== 0 ? ((leveragePrice / prevLeveragePrice) - 1 + dailyFee) * 100 : 0;
      underlyingRate = leverage !== 0 ? leverageRate / leverage : 0;
      delta = prevClose * underlyingRate / 100;
    } else if (field === 'pnl') {
      const pnl = value;
      const evalAmount = pnl + principal;
      leveragePrice = shares !== 0 ? evalAmount / shares : 0;
      leverageRate = prevLeveragePrice !== 0 ? ((leveragePrice / prevLeveragePrice) - 1 + dailyFee) * 100 : 0;
      underlyingRate = leverage !== 0 ? leverageRate / leverage : 0;
      delta = prevClose * underlyingRate / 100;
    } else if (field === 'pnlRate') {
      const pnlRate = value;
      const pnl = principal !== 0 ? (pnlRate / 100) * principal : 0;
      const evalAmount = pnl + principal;
      leveragePrice = shares !== 0 ? evalAmount / shares : 0;
      leverageRate = prevLeveragePrice !== 0 ? ((leveragePrice / prevLeveragePrice) - 1 + dailyFee) * 100 : 0;
      underlyingRate = leverage !== 0 ? leverageRate / leverage : 0;
      delta = prevClose * underlyingRate / 100;
    } else {
      delta = 0;
      underlyingRate = 0;
      leverageRate = 0;
      leveragePrice = prevLeveragePrice;
    }

    const closePrice = prevClose + delta;
    const evalAmount = leveragePrice * shares;
    const pnl = evalAmount - principal;
    const pnlRate = principal !== 0 ? (pnl / principal) * 100 : 0;

    return { delta, underlyingRate, leverageRate, leveragePrice, closePrice, evalAmount, pnl, pnlRate };
  }

  function validateInputs() {
    let isValid = true;
    isValid &= validateField(ID.buyPrice, (val) => val > 0, '매수 가격은 0보다 커야 합니다.');
    isValid &= validateField(ID.shares, (val) => val > 0, '매수 수량은 0보다 커야 합니다.');
    return !!isValid;
  }
  function renderSimTable() {
    const tbody = document.getElementById(ID.tableBody);
    tbody.innerHTML = '';

    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();
    const buyPrice = parseNum(document.getElementById(ID.buyPrice).value);
    const shares = parseNum(document.getElementById(ID.shares).value);
    const tradeFee = getSimTradeFee();
    const grossAmount = buyPrice * shares;
    const principal = grossAmount * (1 + tradeFee);

    validateInputs(); // 입력값 유효성 검사 및 UI 피드백

    document.getElementById(ID.leverageRateHeader).textContent = `레버리지 등락률(${leverage}배)(%)`;
    document.getElementById(ID.principalBox).value =
      principal > 0 ? `${Math.trunc(principal).toLocaleString('ko-KR')} 원` : '';

    const summaryBox = document.getElementById(ID.summaryBox);
    const annualFee = parseNum(document.getElementById(ID.feeRate).value);
    summaryBox.innerHTML = `
      <table class="summary-table-grid">
        <tr><td>매수 가격</td><td>${formatNumber(buyPrice, 0)} 원</td>
            <td>레버리지 시작가</td><td>${formatNumber(buyPrice, 0)} 원</td></tr>
        <tr><td>매수 수량</td><td>${formatNumber(shares, 0)} 주</td>
            <td>초기 평가금액</td><td>${formatNumber(buyPrice * shares, 0)} 원</td></tr>
        <tr><td>매수 원금(수수료포함)</td><td>${formatNumber(principal, 0)} 원</td>
            <td>레버리지</td><td>${leverage} 배</td></tr>
        <tr><td>연 운용수수료</td><td>${annualFee.toFixed(2)} %</td>
            <td>거래 수수료</td><td>${(tradeFee * 100).toFixed(4)} %</td></tr>
      </table>
    `;

    let prevClose = buyPrice;
    let prevLeveragePrice = buyPrice;

    simRows.forEach((row, idx) => {
      // render 시점에 value가 문자열일 수 있으므로 숫자로 변환
      if (row.value) {
        row.value = parseNum(row.value);
      }
      let vals;
      if (idx === 0) {
        vals = { delta: 0, underlyingRate: 0, leverageRate: 0, leveragePrice: buyPrice, closePrice: buyPrice, evalAmount: buyPrice * shares, pnl: 0, pnlRate: 0 };
      } else {
        vals = computeRowValues(row.field, row.value, prevClose, prevLeveragePrice, leverage, dailyFee, shares, principal);
      }
      prevClose = vals.closePrice;
      prevLeveragePrice = vals.leveragePrice;

      const rateCls = vals.underlyingRate >= 0 ? 'val-pos' : 'val-neg';
      const leverageCls = vals.leverageRate >= 0 ? 'val-pos' : 'val-neg';
      const pnlCls = vals.pnl >= 0 ? 'val-pos' : 'val-neg';

      const tr = document.createElement('tr');
      if (idx === 0) {
        tr.innerHTML = `
          <td class="row-idx buy-marker">매수</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>${formatNumber(vals.leveragePrice, 0)}</td>
          <td>${formatNumber(vals.evalAmount, 0)}</td>
          <td class="val-pos">${formatNumber(vals.pnl, 0)}</td>
          <td class="val-pos">${formatNumber(vals.pnlRate, 2)}</td>
          <td><button class="del-btn" onclick="lossRecoverySim.removeRow(${idx})" disabled>삭제</button></td>
        `;
      } else {
        tr.innerHTML = `
          <td class="row-idx">${idx}</td>
          <td><input type="text" class="dayReturnInput" data-field="delta" value="${formatNumber(row.field === 'delta' ? row.value : vals.delta, 0)}" oninput="lossRecoverySim.onFieldInput(${idx}, 'delta', this)" onfocus="this.select()" onblur="lossRecoverySim.formatBlur(this, 0)" onkeydown="if(event.key==='Enter') this.blur()"></td>
          <td class="${rateCls}"><input type="text" class="dayReturnInput" data-field="underlyingRate" value="${formatNumber(row.field === 'underlyingRate' ? row.value : vals.underlyingRate, 2)}" oninput="lossRecoverySim.onFieldInput(${idx}, 'underlyingRate', this)" onfocus="this.select()" onblur="lossRecoverySim.formatBlur(this, 2)" onkeydown="if(event.key==='Enter') this.blur()"></td>
          <td class="${leverageCls}"><input type="text" class="dayReturnInput" data-field="leverageRate" value="${formatNumber(row.field === 'leverageRate' ? row.value : vals.leverageRate, 2)}" oninput="lossRecoverySim.onFieldInput(${idx}, 'leverageRate', this)" onfocus="this.select()" onblur="lossRecoverySim.formatBlur(this, 2)" onkeydown="if(event.key==='Enter') this.blur()"></td>
          <td><input type="text" class="dayReturnInput" data-field="leveragePrice" value="${formatNumber(row.field === 'leveragePrice' ? row.value : Math.trunc(vals.leveragePrice), 0)}" oninput="lossRecoverySim.onFieldInput(${idx}, 'leveragePrice', this)" onfocus="this.select()" onblur="lossRecoverySim.formatBlur(this, 0)" onkeydown="if(event.key==='Enter') this.blur()"></td>
          <td><input type="text" class="dayReturnInput" data-field="evalAmount" value="${formatNumber(row.field === 'evalAmount' ? row.value : Math.trunc(vals.evalAmount), 0)}" oninput="lossRecoverySim.onFieldInput(${idx}, 'evalAmount', this)" onfocus="this.select()" onblur="lossRecoverySim.formatBlur(this, 0)" onkeydown="if(event.key==='Enter') this.blur()"></td>
          <td class="${pnlCls}"><input type="text" class="dayReturnInput" data-field="pnl" value="${formatNumber(row.field === 'pnl' ? row.value : Math.trunc(vals.pnl), 0)}" oninput="lossRecoverySim.onFieldInput(${idx}, 'pnl', this)" onfocus="this.select()" onblur="lossRecoverySim.formatBlur(this, 0)" onkeydown="if(event.key==='Enter') this.blur()"></td>
          <td class="${pnlCls}"><input type="text" class="dayReturnInput" data-field="pnlRate" value="${formatNumber(row.field === 'pnlRate' ? row.value : vals.pnlRate, 2)}" oninput="lossRecoverySim.onFieldInput(${idx}, 'pnlRate', this)" onfocus="this.select()" onblur="lossRecoverySim.formatBlur(this, 2)" onkeydown="if(event.key==='Enter') this.blur()"></td>
          <td><button class="del-btn" onclick="lossRecoverySim.removeRow(${idx})">삭제</button></td>
        `;
      }
      tbody.appendChild(tr);
    });
    saveState();
  }

  function recalcSim() {
    [ID.buyPrice, ID.shares, ID.leverageCustom, ID.feeRate].forEach((id) => {
      const el = document.getElementById(id);
      if (el) onSimNumInput(el);
    });
    renderSimTable();
  }

  function saveState() {
    const state = {
      buyPrice: document.getElementById(ID.buyPrice).value,
      shares: document.getElementById(ID.shares).value,
      leverageSel: document.getElementById(ID.leverageSel).value,
      leverageCustom: document.getElementById(ID.leverageCustom).value,
      feeRate: document.getElementById(ID.feeRate).value,
      tradeFeeRate: document.getElementById(ID.tradeFeeRate).value,
      simRows: simRows,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (!savedState) return false;

    const state = JSON.parse(savedState);
    document.getElementById(ID.buyPrice).value = state.buyPrice || '';
    document.getElementById(ID.shares).value = state.shares || '';
    document.getElementById(ID.leverageSel).value = state.leverageSel || '2';
    document.getElementById(ID.leverageCustom).value = state.leverageCustom || '';
    document.getElementById(ID.feeRate).value = state.feeRate || '';
    document.getElementById(ID.tradeFeeRate).value = state.tradeFeeRate || '';
    simRows = state.simRows || [];
    onLeverageSelChange(); // UI 갱신 및 재계산
    return true;
  }

  function validateField(elementId, condition, message) {
    const el = document.getElementById(elementId);
    if (!el) return true;
    const value = parseNum(el.value);
    if (condition(value)) {
      el.classList.remove('input-error');
      el.title = '';
      return true;
    } else {
      el.classList.add('input-error');
      el.title = message;
      return false;
    }
  }
  function buildSimSeries() {
    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();
    const buyPrice = parseNum(document.getElementById(ID.buyPrice).value);
    const shares = parseNum(document.getElementById(ID.shares).value);
    const tradeFee = getSimTradeFee();
    const grossAmount = buyPrice * shares;
    const principal = grossAmount * (1 + tradeFee);

    let prevClose = buyPrice;
    let prevLeveragePrice = buyPrice;

    const series = [];

    simRows.forEach((row, idx) => {
      let vals;
      if (idx === 0) {
        vals = { delta: 0, underlyingRate: 0, leverageRate: 0, leveragePrice: buyPrice, closePrice: buyPrice, evalAmount: buyPrice * shares, pnl: 0, pnlRate: 0 };
      } else {
        vals = computeRowValues(row.field, row.value, prevClose, prevLeveragePrice, leverage, dailyFee, shares, principal);
      }
      prevClose = vals.closePrice;
      prevLeveragePrice = vals.leveragePrice;
      series.push({ idx, ...vals });
    });

    return { series, buyPrice, shares, leverage, dailyFee, principal };
  }

  function exportSimExcel() {
    if (!validateInputs()) {
      alert('입력값을 확인해주세요. 빨간색으로 표시된 필드에 유효한 값을 입력해야 합니다.');
      return;
    }

    const { series, buyPrice, shares, leverage, principal } = buildSimSeries();
    if (series.length === 0 || (typeof XLSX === 'undefined')) {
      alert('내보낼 데이터가 없거나 엑셀 라이브러리가 로드되지 않았습니다.');
      return;
    }
    const annualFee = parseNum(document.getElementById(ID.feeRate).value);
    const summaryData = [
      ['매수 가격', buyPrice.toLocaleString('ko-KR')],
      ['매수 수량', shares.toLocaleString('ko-KR')],
      ['매수 원금', principal.toLocaleString('ko-KR')],
      ['레버리지', leverage],
      ['연 운용수수료(%)', annualFee.toFixed(2)],
      ['거래 수수료(%)', (getSimTradeFee() * 100).toFixed(4)],
    ];

    const tableHeader = ['일차', '변동가', '기초자산등락률(%)', `레버리지등락률(${leverage}배)(%)`, '레버리지가격', '평가금액', '손익', '손익률(%)'];
    const tableRows = [tableHeader];

    series.forEach((s, idx) => {
      if (idx === 0) {
        tableRows.push([
          '매수', '-', '-', '-',
          s.leveragePrice.toFixed(0), s.evalAmount.toFixed(0), s.pnl.toFixed(0), s.pnlRate.toFixed(2),
        ]);
      } else {
        tableRows.push([
          idx, s.delta.toFixed(0), s.underlyingRate.toFixed(2), s.leverageRate.toFixed(2),
          s.leveragePrice.toFixed(0), s.evalAmount.toFixed(0), s.pnl.toFixed(0), s.pnlRate.toFixed(2),
        ]);
      }
    });

    const finalSheetData = summaryData.concat(tableRows);
    const ws = XLSX.utils.aoa_to_sheet(finalSheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '레버리지시뮬레이션');

    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `장기시뮬_${timestamp}.xlsx`);
  }

  function renderReportChart(series, buyPrice, leverage) {
    const chartContainer = document.querySelector('.chart-container');
    if (!chartContainer) return;

    const ctx = document.getElementById(ID.reportChart).getContext('2d');
    if (!ctx) return;

    chartContainer.style.display = 'block';

    if (reportChartInstance) {
      reportChartInstance.destroy();
    }

    const labels = series.map(s => `${s.idx}일차`);
    const underlyingData = series.map(s => buyPrice !== 0 ? ((s.closePrice - buyPrice) / buyPrice) * 100 : 0);
    const leverageData = series.map(s => buyPrice !== 0 ? ((s.leveragePrice - buyPrice) / buyPrice) * 100 : 0);
    const simpleData = underlyingData.map(rate => rate * leverage);

    reportChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '레버리지 누적 수익률 (%)',
          data: leverageData,
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderWidth: 2,
          fill: false,
          tension: 0.1
        }, {
          label: `단순 기대 수익률 (기초 × ${leverage}) (%)`,
          data: simpleData,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderWidth: 1.5,
          borderDash: [5, 5],
          fill: false,
          tension: 0.1
        }, {
          label: '기초자산 누적 수익률 (%)',
          data: underlyingData,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderWidth: 1,
          fill: false,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { ticks: { callback: value => `${value.toFixed(1)}%` } } }
      }
    });
  }
  function generateSimReport() {
    if (!validateInputs()) {
      alert('리포트를 생성하려면 먼저 유효한 값을 모두 입력해주세요.');
      return;
    }

    const { series, buyPrice, leverage, dailyFee, principal } = buildSimSeries();
    const reportBox = document.getElementById(ID.reportBox);
    if (!reportBox) return;

    if (series.length < 2 || principal === 0) {
      reportBox.innerHTML = `<p class="report-empty">리포트를 생성하려면 매수 정보와 일자별 데이터를 입력해주세요.</p>`;
      return;
    }

    renderReportChart(series, buyPrice, leverage);

    const periodDays = series.length - 1;
    const last = series[series.length - 1];
    const underlyingCumRate = buyPrice !== 0 ? ((last.closePrice - buyPrice) / buyPrice) * 100 : 0;
    const leverageCumRate = buyPrice !== 0 ? ((last.leveragePrice - buyPrice) / buyPrice) * 100 : 0;
    const decayGap = (underlyingCumRate * leverage) - leverageCumRate;

    // --- 추가 지표 계산 ---
    const leverageDailyReturns = series.slice(1).map(s => s.leverageRate / 100);
    const avgDailyReturn = leverageDailyReturns.reduce((a, b) => a + b, 0) / periodDays;
    const stdDev = periodDays > 1 ? Math.sqrt(leverageDailyReturns.map(r => Math.pow(r - avgDailyReturn, 2)).reduce((a, b) => a + b, 0) / (periodDays - 1)) : 0;
    const annualizedReturn = Math.pow(1 + (leverageCumRate / 100), 252 / periodDays) - 1;
    const annualizedVolatility = stdDev * Math.sqrt(252); // 일반적으로 연간 거래일수인 252를 사용
    const sharpeRatio = annualizedVolatility !== 0 ? (annualizedReturn / annualizedVolatility) : 0; // 연환산 수익률을 샤프지수 계산에만 사용

    const bestDay = Math.max(...leverageDailyReturns) * 100;
    const worstDay = Math.min(...leverageDailyReturns) * 100;

    let underlyingPeak = buyPrice, underlyingMDD = 0, underlyingMddDay = 0;
    let leveragePeak = buyPrice, leverageMDD = 0;
    let mddDay = 0;

    series.slice(1).forEach((s) => {
      if (s.closePrice > underlyingPeak) underlyingPeak = s.closePrice;
      const uDD = underlyingPeak !== 0 ? ((s.closePrice - underlyingPeak) / underlyingPeak) * 100 : 0;
      if (uDD < underlyingMDD) { underlyingMDD = uDD; underlyingMddDay = s.idx; }

      if (s.leveragePrice > leveragePeak) leveragePeak = s.leveragePrice;
      const lDD = leveragePeak !== 0 ? ((s.leveragePrice - leveragePeak) / leveragePeak) * 100 : 0;
      if (lDD < leverageMDD) {
        leverageMDD = lDD;
        mddDay = s.idx;
      }
    });

    let requiredReboundRate = 0;
    let requiredUnderlyingRebound = 0;
    if (last.leveragePrice > 0 && last.leveragePrice < buyPrice) {
      requiredReboundRate = ((buyPrice / last.leveragePrice) - 1) * 100;

      // 원금 회복에 필요한 기초자산 수익률을 복리로 역산 (더 정확한 추정)
      // (1 + r_u * L - f)^n = P_buy / P_last  ==>  1 + r_u * L - f = (P_buy / P_last)^(1/n)
      // 이 방정식을 풀기 위해, n=1 (하루만에 회복)이라고 가정하고 계산합니다.
      // (1 + r_u * L - f) = P_buy / P_last
      // r_u * L = (P_buy / P_last) - 1 + f
      // r_u = ((P_buy / P_last) - 1 + f) / L
      if (leverage !== 0) {
        const targetRatio = buyPrice / last.leveragePrice;
        requiredUnderlyingRebound = ((targetRatio - 1 + dailyFee) / leverage) * 100;
      }
    }

    const finalPnl = last.pnl;
    const finalPnlRate = last.pnlRate;
    const isProfit = finalPnl >= 0;

    const html = `
      <div class="report-summary">
        <h4>${periodDays}일 투자 시뮬레이션 리포트</h4>
        
        <h5 class="report-subtitle">종합 성과 요약</h5>
        <table class="report-table">
          <tr><td>최종 손익 (총 수익률)</td><td class="${isProfit ? 'val-pos' : 'val-neg'}">${finalPnl.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} 원 (${finalPnlRate.toFixed(2)}%)</td></tr>
          <tr><td>기초자산 원금 회복 필요 수익률</td><td>${requiredUnderlyingRebound > 0 ? `약 ${requiredUnderlyingRebound.toFixed(2)}% 상승 필요` : '이미 회복(또는 초과 수익)'}</td></tr>
          <tr><td>원금 회복에 필요한 레버리지 상승률</td><td>${requiredReboundRate > 0 ? requiredReboundRate.toFixed(2) + '%' : '이미 회복(또는 초과 수익)'}</td></tr>
        </table>

        <h5 class="report-subtitle">위험 분석</h5>
        <table class="report-table">
          <tr><td>레버리지 최대낙폭(MDD)</td><td class="val-neg">${leverageMDD.toFixed(2)}% (at ${mddDay}일차)</td></tr>
          <tr><td>변동성 (연환산)</td><td>${(annualizedVolatility * 100).toFixed(2)}%</td></tr>
          <tr><td>샤프 지수 (위험 대비 성과)</td><td>${sharpeRatio.toFixed(2)}</td></tr>
          <tr><td>최고의 날 (일일 최고 수익률)</td><td class="val-pos">+${bestDay.toFixed(2)}%</td></tr>
          <tr><td>최악의 날 (일일 최저 수익률)</td><td class="val-neg">${worstDay.toFixed(2)}%</td></tr>
        </table>

        <h5 class="report-subtitle">경로 의존성 분석</h5>
        <table class="report-table">
          <tr><td>기초자산 누적 수익률</td><td class="${underlyingCumRate >= 0 ? 'val-pos' : 'val-neg'}">${underlyingCumRate.toFixed(2)}%</td></tr>
          <tr><td>레버리지 누적 수익률</td><td class="${leverageCumRate >= 0 ? 'val-pos' : 'val-neg'}">${leverageCumRate.toFixed(2)}%</td></tr>
          <tr><td>단순 기대 수익률 (기초 × ${leverage})</td><td>${(underlyingCumRate * leverage).toFixed(2)}%</td></tr>
          <tr><td>변동성 끌림 (Decay)</td><td class="val-neg">-${Math.abs(decayGap).toFixed(2)}%p</td></tr>
        </table>

        <div class="report-narrative">
          <p><strong>종합 분석:</strong> ${periodDays}일의 투자 기간 동안, 최종 수익률은 <strong>${finalPnlRate.toFixed(2)}%</strong>를 기록했습니다. 위험 대비 성과를 나타내는 샤프 지수는 <strong>${sharpeRatio.toFixed(2)}</strong>로, 감수한 변동성 대비 ${sharpeRatio > 0.5 ? '준수한' : (sharpeRatio > 0 ? '다소 아쉬운' : '부진한')} 성과를 보였습니다. (연간 거래일 252일 기준)</p>
          <p><strong>위험 및 변동성:</strong> 투자는 ${mddDay}일차에 <strong>${leverageMDD.toFixed(2)}%</strong>의 최대 낙폭(MDD)을 경험했으며, 이는 투자 기간 중 가장 큰 손실 구간을 의미합니다. 연환산 변동성은 <strong>${(annualizedVolatility * 100).toFixed(2)}%</strong>로, 가격 변동의 폭이 ${annualizedVolatility > 0.4 ? '매우 큰' : (annualizedVolatility > 0.2 ? '상당한' : '비교적 안정적인')} 수준이었음을 보여줍니다.</p>
          <p><strong>레버리지 효과:</strong> 기초자산은 총 <strong>${underlyingCumRate.toFixed(2)}%</strong> ${underlyingCumRate >= 0 ? '상승' : '하락'}했지만, ${leverage}배 레버리지 상품은 <strong>${leverageCumRate.toFixed(2)}%</strong> ${leverageCumRate >= 0 ? '상승' : '하락'}했습니다. 단순 계산 기대치(${ (underlyingCumRate * leverage).toFixed(2)}%)와 실제 수익률의 차이인 '변동성 끌림(Decay)'은 <strong>-${Math.abs(decayGap).toFixed(2)}%p</strong>로 나타났습니다. 이는 일일 복리 계산 방식이 장기 수익률에 미치는 영향을 보여주며, 변동성이 큰 장세일수록 이 효과가 커지는 경향이 있습니다. 손실이 발생한 경우, 원금 회복을 위해 기초자산은 약 <strong>${requiredUnderlyingRebound.toFixed(2)}%</strong> 상승해야 합니다.</p>
        </div>
      </div>
    `;
    reportBox.innerHTML = html;
  }

  function downloadSimReport() {
    if (!validateInputs()) {
      alert('리포트를 다운로드하려면 먼저 유효한 값을 모두 입력해주세요.');
      return;
    }

    const reportBox = document.getElementById(ID.reportBox);
    if (!reportBox || !reportBox.innerText.trim()) {
      alert('먼저 리포트를 생성해주세요.');
      return;
    }
    const text = reportBox.innerText;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `장기시뮬레이션리포트_${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function initSim() {
    // 저장된 상태가 있으면 불러오고, 없으면 초기화합니다.
    if (!loadState()) {
      resetSim();
    }
  }

  window.lossRecoverySim = {
    init: initSim,
    reset: resetSim,
    addRow: addSimRow,
    removeRow: removeSimRow,
    recalc: recalcSim,
    onLeverageSelChange,
    onFieldInput: onSimFieldInput,
    formatBlur: formatInputOnBlur,
    exportExcel: exportSimExcel,
    generateReport: generateSimReport,
    downloadReport: downloadSimReport,
  };
})();
