
// ====================================================================
// [단기매매(거래) 시뮬레이터 - 로직 파일]
// - IIFE로 전역 스코프 격리, window.shortTermSim 으로만 공개
// - DOM ID는 short- 접두사 사용
// - 중간 계산의 불필요한 Math.trunc() 제거, 출력 시에만 반올림
// ====================================================================
(function () {
  'use strict';

  const ID = {
    leverageSel: 'shortLeverageSel',
    leverageCustom: 'shortLeverageCustom',
    customLeverageWrap: 'shortCustomLeverageWrap',
    feeRate: 'shortFeeRate',
    tradeFeeRate: 'shortTradeFeeRate',
    tableBody: 'shortTableBody',
    summaryBox: 'shortSummaryBox',
    reportBox: 'shortReportBox',
  };
  const STORAGE_KEY = 'shortTermSimState';

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

  function formatInputOnBlur(el, fractionDigits) {
    const value = parseNum(el.value);
    // 0을 입력하고 포커스를 잃었을 때 0으로 유지되도록 수정
    if (el.value.trim() === '0' || el.value.trim() === '0.') {
      el.value = '0';
    } else {
      el.value = formatNumber(value, fractionDigits);
    }
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
    simRows.push({
      type: 'buy', // 'buy', 'sell', 'hold'
      price: 0,
      shares: 0,
      underlyingRate: 0,
      targetPrice: 0,
    });
    renderSimTable();
  }

  function removeSimRow(idx) {
    if (simRows.length <= 1) return;
    simRows.splice(idx, 1);
    renderSimTable();
  }

  function resetSim() {
    simRows = [];
    document.getElementById(ID.leverageSel).value = '2';
    document.getElementById(ID.leverageCustom).value = '';
    document.getElementById(ID.customLeverageWrap).style.display = 'none';
    localStorage.removeItem(STORAGE_KEY);

    const feeEl = document.getElementById(ID.feeRate);
    if (feeEl) feeEl.value = '';

    const tradeFeeEl = document.getElementById(ID.tradeFeeRate);
    if (tradeFeeEl) tradeFeeEl.value = '';

    for (let i = 0; i < 3; i++) addSimRow();
    recalcSim();
  }

  function onSimFieldChange(idx, field, el) {
    onSimNumInput(el);
    const parsedValue = parseNum(el.value);
    const row = simRows[idx];
    row[field] = parsedValue;

    if (field === 'targetPrice' && parsedValue > 0) {
      row.underlyingRate = 0;
    } else if (field === 'underlyingRate') {
      row.targetPrice = 0;
    }

    updateOtherCells(idx, field);
  }

  function onSimTypeChange(idx, el) {
    simRows[idx].type = el.value;
    recalcSim();
  }

  // hold 행 계산을 화면/시리즈에서 공통으로 사용하기 위한 함수.
  // targetPrice가 입력되어 있으면 이를 우선하고, 없으면 underlyingRate로 계산합니다.
  // 반환값의 etfPrice는 반올림하지 않은 실수입니다 (표시 시에만 반올림).
  function calculateHoldStep({ currentLeveragePrice, targetPrice, underlyingRate, leverage, dailyFee }) {
    if (targetPrice > 0 && currentLeveragePrice > 0) {
      const leverageRate = (targetPrice / currentLeveragePrice) - 1;
      const impliedUnderlyingRate = leverage !== 0 ? (leverageRate / leverage) * 100 : 0;
      return {
        leveragePrice: targetPrice,
        underlyingRate: impliedUnderlyingRate,
      };
    }

    const leverageRate = (underlyingRate / 100 * leverage);
    const nextPrice = currentLeveragePrice * (1 + leverageRate - dailyFee);
    return {
      leveragePrice: nextPrice,
      underlyingRate,
    };
  }

  // 매수 1행의 손익/원가 계산을 화면/시리즈에서 공통으로 사용.
  // 매수 수수료를 원가(총투입금, 평균단가)에 포함시킵니다.
  function applyBuyStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentLeveragePrice }) {
    const buyShares = row.shares;
    const buyPrice = row.price;
    let realizedPnlDelta = 0;
    let nextAvgCost = avgCost;
    let nextTotalShares = totalShares;
    let nextTotalInvested = totalInvested;

    if (buyShares > 0 && buyPrice > 0) {
      const grossBuyAmount = buyPrice * buyShares;
      const buyFee = grossBuyAmount * tradeFee;
      const costBasisIncrease = grossBuyAmount + buyFee;

      nextTotalInvested = totalInvested + costBasisIncrease;
      nextTotalShares = totalShares + buyShares;
      nextAvgCost = nextTotalShares > 0 ? nextTotalInvested / nextTotalShares : 0;
    }

    const nextLeveragePrice = buyPrice > 0 ? buyPrice : (currentLeveragePrice || 0);

    return {
      avgCost: nextAvgCost,
      totalShares: nextTotalShares,
      totalInvested: nextTotalInvested,
      realizedPnlDelta,
      leveragePrice: nextLeveragePrice,
      grossBuyAmount: (buyShares > 0 && buyPrice > 0) ? buyPrice * buyShares : 0,
    };
  }

  function validateRow(row, el) {
    let isValid = true;
    const priceInput = el.querySelector('[data-field="price"]');
    const sharesInput = el.querySelector('[data-field="shares"]');

    if (row.type === 'buy' || row.type === 'sell') {
      if (priceInput) {
        priceInput.classList.toggle('input-error', row.price <= 0);
        if (row.price <= 0) isValid = false;
      }
      if (sharesInput) {
        sharesInput.classList.toggle('input-error', row.shares <= 0);
        if (row.shares <= 0) isValid = false;
      }
    } else { // hold
      if (priceInput) priceInput.classList.remove('input-error');
      if (sharesInput) sharesInput.classList.remove('input-error');
    }
    return isValid;
  }
  // 매도 1행의 손익 계산을 화면/시리즈에서 공통으로 사용.
  function applySellStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentLeveragePrice }) {
    const sellShares = Math.min(row.shares, totalShares);
    const sellPrice = row.price;
    let realizedPnlDelta = 0;
    let sellFee = 0;
    let nextAvgCost = avgCost;
    let nextTotalShares = totalShares;
    let nextTotalInvested = totalInvested;

    if (sellShares > 0 && sellPrice > 0) {
      const pnlFromSale = (sellPrice - avgCost) * sellShares;
      const feeFromSale = sellPrice * sellShares * tradeFee;
      realizedPnlDelta = pnlFromSale - feeFromSale; // 실현손익은 수수료 차감 후
      sellFee = feeFromSale;

      nextTotalInvested = totalInvested - (avgCost * sellShares);
      nextTotalShares = totalShares - sellShares;

      if (nextTotalShares <= 0) {
        nextTotalInvested = 0;
        nextAvgCost = 0;
      }
    }

    const nextLeveragePrice = sellPrice > 0 ? sellPrice : (currentLeveragePrice || 0);

    return {
      avgCost: nextAvgCost,
      totalShares: nextTotalShares,
      totalInvested: nextTotalInvested,
      realizedPnlDelta,
      leveragePrice: nextLeveragePrice,
      sellFee,
    };
  }

  function renderSimTable() {
    const tbody = document.getElementById(ID.tableBody);
    tbody.innerHTML = '';

    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();
    const tradeFee = getSimTradeFee();

    let avgCost = 0, totalShares = 0, currentLeveragePrice = 0, totalInvested = 0;
    let realizedPnl = 0;
    let isOverallValid = true;

    simRows.forEach((row, idx) => {
      const step = idx + 1;
      let nextLeveragePrice = currentLeveragePrice;
      let stepRealizedPnl = 0;

      if (row.type === 'hold') {
        const result = calculateHoldStep({
          currentLeveragePrice, targetPrice: row.targetPrice,
          underlyingRate: row.underlyingRate, leverage, dailyFee,
        });
        row.underlyingRate = result.underlyingRate;
        nextLeveragePrice = result.leveragePrice;
      } else if (row.type === 'buy') {
        const result = applyBuyStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentLeveragePrice });
        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        stepRealizedPnl = result.realizedPnlDelta;
        realizedPnl += stepRealizedPnl;
        nextLeveragePrice = result.leveragePrice;
      } else if (row.type === 'sell') {
        const result = applySellStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentLeveragePrice });
        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        stepRealizedPnl = result.realizedPnlDelta;
        realizedPnl += stepRealizedPnl;
        nextLeveragePrice = result.leveragePrice;
      }

      currentLeveragePrice = nextLeveragePrice;
      const evalAmount = currentLeveragePrice * totalShares;
      const pnlCls = stepRealizedPnl >= 0 ? 'val-pos' : 'val-neg';


      const tr = document.createElement('tr');
      const isHold = row.type === 'hold';
      const displayLeveragePrice = Math.trunc(currentLeveragePrice);

      const tradeCells = `
        <td><input type="text" class="dayReturnInput" data-field="price" value="${formatNumber(row.price, 0)}"
          oninput="shortTermSim.onFieldChange(${idx}, 'price', this)" onfocus="this.select()"
          onblur="shortTermSim.onFieldBlur(${idx}, 'price', this)" onkeydown="if(event.key==='Enter') this.blur()"></td>
        <td><input type="text" class="dayReturnInput" data-field="shares" value="${formatNumber(row.shares, 0)}"
          oninput="shortTermSim.onFieldChange(${idx}, 'shares', this)" onfocus="this.select()"
          onblur="shortTermSim.onFieldBlur(${idx}, 'shares', this)" onkeydown="if(event.key==='Enter') this.blur()"></td>
      `;

      const holdCells = `
        <td><input type="text" class="dayReturnInput" data-field="underlyingRate" value="${formatNumber(row.underlyingRate, 2)}"
          oninput="shortTermSim.onFieldChange(${idx}, 'underlyingRate', this)" onfocus="this.select()"
          onblur="shortTermSim.onFieldBlur(${idx}, 'underlyingRate', this)" onkeydown="if(event.key==='Enter') this.blur()"></td>
        <td><input type="text" class="dayReturnInput" data-field="targetPrice" value="${formatNumber(row.targetPrice, 0)}"
          oninput="shortTermSim.onFieldChange(${idx}, 'targetPrice', this)" onfocus="this.select()"
          onblur="shortTermSim.onFieldBlur(${idx}, 'targetPrice', this)" onkeydown="if(event.key==='Enter') this.blur()"></td>
        <td class="leverage-price-cell">${formatNumber(displayLeveragePrice, 0)}</td>
      `;

      const resultCells = `
        <td>${formatNumber(totalShares, 0)}</td>
        <td>${formatNumber(avgCost, 0)}</td>
        <td class="${pnlCls}">${stepRealizedPnl !== 0 ? formatNumber(stepRealizedPnl, 0) : '-'}</td>
        <td>${formatNumber(evalAmount, 0)}</td>
      `;

      tr.innerHTML = `
        <td class="row-idx">${step}</td>
        <td>
          <select onchange="shortTermSim.onTypeChange(${idx}, this)">
            <option value="buy" ${row.type === 'buy' ? 'selected' : ''}>매수</option>
            <option value="sell" ${row.type === 'sell' ? 'selected' : ''}>매도</option>
            <option value="hold" ${row.type === 'hold' ? 'selected' : ''}>보유(오버나잇)</option>
          </select>
        </td>
        ${isHold ? `<td colspan="2" class="placeholder-cell">-</td>${holdCells}` : `${tradeCells}<td colspan="3" class="placeholder-cell">-</td>`}
        ${resultCells}
        <td><button class="del-btn" onclick="shortTermSim.removeRow(${idx})">삭제</button></td>
      `;

      isOverallValid &= validateRow(row, tr);
      tbody.appendChild(tr);
    });

    const evalAmount = currentLeveragePrice * totalShares;
    const unrealizedPnl = totalShares > 0 ? (currentLeveragePrice - avgCost) * totalShares : 0;
    const unrealizedPnlRate = (avgCost * totalShares) > 0 ? (unrealizedPnl / (avgCost * totalShares)) * 100 : 0;
    const totalPnl = realizedPnl + unrealizedPnl;

    const summaryBox = document.getElementById(ID.summaryBox);
    summaryBox.innerHTML = `
      <table>
        <tr><td>레버리지</td><td class="summary-value">${leverage} 배</td>
            <td>연 운용수수료</td><td class="summary-value">${formatNumber(parseNum(document.getElementById(ID.feeRate).value), 2)} %</td></tr>
        <tr><td>거래 수수료</td><td class="summary-value">${formatNumber(tradeFee * 100, 4)} %</td>
            <td>현재가</td><td class="summary-value">${formatNumber(Math.trunc(currentLeveragePrice), 0)} 원</td></tr>
        <tr><td colspan="4"><hr style="border-color: var(--border); margin: 4px 0; border-style: dashed;"></td></tr>
        <tr><td>보유 수량</td><td class="summary-value">${formatNumber(totalShares, 0)} 주</td>
            <td>평균 단가</td><td class="summary-value">${formatNumber(avgCost, 0)} 원</td></tr>
        <tr><td>평가 금액</td><td class="summary-value">${formatNumber(evalAmount, 0)} 원</td>
            <td>실현 손익</td><td class="summary-value ${realizedPnl >= 0 ? 'val-pos' : 'val-neg'}">${formatNumber(realizedPnl, 0)} 원</td></tr>
        <tr><td>미실현 손익</td><td colspan="3" class="summary-value ${unrealizedPnl >= 0 ? 'val-pos' : 'val-neg'}">${formatNumber(unrealizedPnl, 0)} 원 (${unrealizedPnlRate.toFixed(2)}%)</td></tr>
        <tr><td>총 손익</td><td colspan="3" class="summary-value total-pnl ${totalPnl >= 0 ? 'val-pos' : 'val-neg'}">${formatNumber(totalPnl, 0)} 원</td></tr>
      </table>
    `;
    saveState();
  }

  function updateOtherCells(rowIndex, currentField) {
    // 입력 도중 포커스를 잃지 않도록, 변경된 셀 이외의 셀들만 갱신합니다.
    const tr = document.getElementById(ID.tableBody).children[rowIndex];
    if (!tr) return;

    const row = simRows[rowIndex];
    if (row.type === 'hold') {
      let currentLeveragePrice = 0;
      // This logic to get currentLeveragePrice is simplified and might not be fully accurate without a full recalc,
      // but it's for preview purposes. A full recalc happens on blur.
      if (rowIndex > 0) {
        const prevRowEl = document.getElementById(ID.tableBody).children[rowIndex - 1];
        const priceCell = prevRowEl.querySelector('.leverage-price-cell');
        if (priceCell) currentLeveragePrice = parseNum(priceCell.textContent);
      }

      const result = calculateHoldStep({ currentLeveragePrice, targetPrice: row.targetPrice, underlyingRate: row.underlyingRate, leverage: getSimLeverage(), dailyFee: getSimDailyFee() });

      if (currentField !== 'underlyingRate') {
        const rateInput = tr.querySelector('[data-field="underlyingRate"]');
        if (rateInput) rateInput.value = formatNumber(result.underlyingRate, 2);
      }
      const priceCell = tr.querySelector('.leverage-price-cell');
      if (priceCell) priceCell.textContent = formatNumber(Math.trunc(result.leveragePrice), 0);
    }
  }

  function onSimFieldBlur(idx, field, el) {
    formatInputOnBlur(el, (field === 'underlyingRate' ? 2 : 0));
    recalcSim();
  }

  function recalcSim() {
    [ID.leverageCustom, ID.feeRate, ID.tradeFeeRate].forEach((id) => {
      const el = document.getElementById(id);
      if (el) onSimNumInput(el);
    });
    renderSimTable();
  }

  function saveState() {
    const state = {
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
    document.getElementById(ID.leverageSel).value = state.leverageSel || '2';
    document.getElementById(ID.leverageCustom).value = state.leverageCustom || '';
    document.getElementById(ID.feeRate).value = state.feeRate || '';
    document.getElementById(ID.tradeFeeRate).value = state.tradeFeeRate || '';
    simRows = state.simRows || [];
    onLeverageSelChange(); // UI 갱신 및 재계산
    return true;
  }

  function buildSimSeries() {
    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();
    const tradeFee = getSimTradeFee();

    let avgCost = 0, totalShares = 0, currentLeveragePrice = 0;
    let totalInvested = 0, realizedPnl = 0;

    // 리포트용 상세 데이터
    let totalBuyAmount = 0, totalSellAmount = 0;
    let totalTradeFee = 0, totalMgmtFee = 0;
    let buyCount = 0, sellCount = 0, winCount = 0, lossCount = 0;
    let totalProfit = 0, totalLoss = 0;
    let maxWin = 0, maxLoss = 0;
    let maxInvested = 0;
    const series = [];

    simRows.forEach((row, idx) => {
      let nextLeveragePrice = currentLeveragePrice;
      let stepRealizedPnl = 0;

      if (row.type === 'hold') {
        const result = calculateHoldStep({
          currentLeveragePrice, targetPrice: row.targetPrice,
          underlyingRate: row.underlyingRate, leverage, dailyFee,
        });
        nextLeveragePrice = result.leveragePrice;
      } else if (row.type === 'buy') {
        const result = applyBuyStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentLeveragePrice });
        if (result.grossBuyAmount > 0) {
          totalBuyAmount += result.grossBuyAmount;
          const buyFee = result.grossBuyAmount * tradeFee;
          totalTradeFee += buyFee;
          buyCount++;
        }
        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        stepRealizedPnl = result.realizedPnlDelta;
        realizedPnl += stepRealizedPnl;
        nextLeveragePrice = result.leveragePrice;
        if (totalInvested > maxInvested) maxInvested = totalInvested;
      } else if (row.type === 'sell') {
        const result = applySellStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentLeveragePrice });
        const sellAmount = row.price * Math.min(row.shares, totalShares);
        if (sellAmount > 0) {
          totalSellAmount += sellAmount;
          totalTradeFee += result.sellFee;
          sellCount++;
          if (result.realizedPnlDelta > 0) { winCount++; totalProfit += result.realizedPnlDelta; if (result.realizedPnlDelta > maxWin) maxWin = result.realizedPnlDelta; }
          else { lossCount++; totalLoss += result.realizedPnlDelta; if (result.realizedPnlDelta < maxLoss) maxLoss = result.realizedPnlDelta; }
        }

        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        stepRealizedPnl = result.realizedPnlDelta;
        realizedPnl += stepRealizedPnl;
        nextLeveragePrice = result.leveragePrice;
      }

      currentLeveragePrice = nextLeveragePrice;

      const evalAmount = currentLeveragePrice * totalShares;
      const unrealizedPnl = totalShares > 0 ? (currentLeveragePrice - avgCost) * totalShares : 0;

      series.push({
        step: idx + 1,
        type: row.type,
        leveragePrice: currentLeveragePrice,
        totalShares, avgCost, evalAmount, realizedPnl, unrealizedPnl, stepRealizedPnl,
        raw: row,
      });
    });

  // 총 운용수수료는 모든 거래가 끝난 후, 각 단계의 보유일수(hold)와 평가금액을 기반으로 일괄 계산
  totalMgmtFee = series.reduce((acc, s) => acc + (s.type === 'hold' ? (s.evalAmount / (1 + (s.raw.underlyingRate/100 * leverage))) * dailyFee : 0), 0);

    const last = series[series.length - 1] || {};
    const summary = {
      // 기본 요약
      totalBuyAmount,
      totalSellAmount,
      finalShares: last.totalShares || 0,
      finalAvgCost: last.avgCost || 0,
      finalEvalAmount: last.evalAmount || 0,
      realizedPnl: last.realizedPnl || 0,
      unrealizedPnl: last.unrealizedPnl || 0,
      totalPnl: (last.realizedPnl || 0) + (last.unrealizedPnl || 0),
      // 리포트용 상세
      maxInvested,
      totalTradeFee,
      totalMgmtFee,
      buyCount, sellCount,
      winCount, lossCount,
      totalProfit, totalLoss,
      maxWin, maxLoss,
      winRate: (winCount + lossCount) > 0 ? (winCount / (winCount + lossCount)) * 100 : 0,
      plRatio: totalLoss !== 0 ? Math.abs(totalProfit / totalLoss) : 0,
    };

    return { series, summary };
  }

  function exportSimExcel() {
    if (document.querySelector('.input-error')) {
      alert('입력값을 확인해주세요. 빨간색으로 표시된 필드에 유효한 값을 입력해야 합니다.');
      return;
    }

    const { series, summary } = buildSimSeries();
    if (series.length === 0 || (typeof XLSX === 'undefined')) {
      alert('내보낼 데이터가 없거나 엑셀 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const tradeLogHeader = ['단계', '유형', '가격', '수량', '등락률(%)', '레버리지가격', '보유수량', '평균단가', '평가금액', '실현손익(단계별)', '누적 실현손익', '미실현손익'];
    const tradeLogRows = series.map((s) => [
      s.step,
      s.type === 'buy' ? '매수' : (s.type === 'sell' ? '매도' : '보유'),
      s.raw.price, s.raw.shares, s.raw.underlyingRate,
      Math.trunc(s.leveragePrice), s.totalShares, Math.trunc(s.avgCost),
      Math.trunc(s.evalAmount),
      Math.trunc(s.stepRealizedPnl), // 단계별 실현손익
      Math.trunc(s.realizedPnl), // 누적 실현손익
      Math.trunc(s.unrealizedPnl),
    ]);

    const summaryHeader = ['항목', '값'];
    const summaryRows = [
      // 설정 정보
      ['레버리지', `${getSimLeverage()} 배`],
      ['연 운용수수료(%)', parseNum(document.getElementById(ID.feeRate).value).toFixed(2)],
      ['거래 수수료(%)', (getSimTradeFee() * 100).toFixed(4)],
      [], // 구분선
      // 자산 정보
      ['현재가', Math.trunc(series.length > 0 ? series[series.length - 1].leveragePrice : 0)],
      ['보유 수량', summary.finalShares],
      ['평균 단가', Math.trunc(summary.finalAvgCost)],
      ['평가 금액', Math.trunc(summary.finalEvalAmount)],
      [], // 구분선
      // 손익 정보
      ['실현 손익', Math.trunc(summary.realizedPnl)],
      ['미실현 손익', Math.trunc(summary.unrealizedPnl)],
      ['총 손익', Math.trunc(summary.totalPnl)],
      [], // 구분선
      // 거래/비용 요약
      ['총 매수금액', summary.totalBuyAmount],
      ['총 매도금액', summary.totalSellAmount],
      ['총 거래수수료', Math.trunc(summary.totalTradeFee)],
      ['총 운용수수료(보유세)', Math.trunc(summary.totalMgmtFee)],
    ];

    // 요약과 거래내역을 하나의 시트에 통합
    const finalSheetData = [
      ...summaryRows,
      [], // 구분 공백 행
      [], // 구분 공백 행
      tradeLogHeader,
      ...tradeLogRows
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(finalSheetData);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }]; // 요약 부분에 맞춰 컬럼 너비 설정
    XLSX.utils.book_append_sheet(wb, ws, '시뮬레이션 결과');

    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `단기매매시뮬_${timestamp}.xlsx`);
  }

  function generateSimReport() {
    if (document.querySelector('.input-error')) {
      alert('리포트를 생성하려면 먼저 유효한 값을 모두 입력해주세요.');
      return;
    }

    const { series, summary } = buildSimSeries();
    const reportBox = document.getElementById(ID.reportBox);
    if (!reportBox) return;

    if (series.length === 0 || (summary.buyCount === 0 && summary.sellCount === 0)) {
      reportBox.innerHTML = `<p class="report-empty">리포트를 생성하려면 먼저 기본 설정과 거래 내역을 입력해주세요.</p>`;
      return;
    }

    const totalPnl = summary.totalPnl;
    const roi = summary.maxInvested > 0 ? (totalPnl / summary.maxInvested) * 100 : 0;
    const isProfit = totalPnl >= 0;

    const html = `
      <div class="report-summary">
        <h4>단기매매 시뮬레이션 리포트</h4>
        
        <h5 class="report-subtitle">종합 성과</h5>
        <table class="report-table">
          <tr><td>총 손익 (실현+미실현)</td><td class="${isProfit ? 'val-pos' : 'val-neg'}">${formatNumber(totalPnl, 0)} 원</td></tr>
          <tr><td>총 투자 수익률 (ROI)</td><td class="${isProfit ? 'val-pos' : 'val-neg'}">${roi.toFixed(2)}%</td></tr>
          <tr><td>최대 투입 원금</td><td>${formatNumber(summary.maxInvested, 0)} 원</td></tr>
        </table>

        <h5 class="report-subtitle">거래 분석</h5>
        <table class="report-table">
          <tr><td>총 매수 횟수 / 금액</td><td>${summary.buyCount} 회 / ${formatNumber(summary.totalBuyAmount, 0)} 원</td></tr>
          <tr><td>총 매도 횟수 / 금액</td><td>${summary.sellCount} 회 / ${formatNumber(summary.totalSellAmount, 0)} 원</td></tr>
          <tr><td>승률 (실현 손익 기준)</td><td>${summary.winRate.toFixed(1)}% (${summary.winCount}승 ${summary.lossCount}패)</td></tr>
          <tr><td>손익비 (실현 손익 기준)</td><td>${summary.plRatio.toFixed(2)} : 1</td></tr>
          <tr><td>최대 이익 실현 거래</td><td class="val-pos">+${formatNumber(summary.maxWin, 0)} 원</td></tr>
          <tr><td>최대 손실 실현 거래</td><td class="val-neg">${formatNumber(summary.maxLoss, 0)} 원</td></tr>
        </table>

        <h5 class="report-subtitle">비용 분석</h5>
        <table class="report-table">
          <tr><td>총 거래 수수료</td><td class="val-neg">-${formatNumber(summary.totalTradeFee, 0)} 원</td></tr>
          <tr><td>총 운용 수수료 (보유세)</td><td class="val-neg">-${formatNumber(summary.totalMgmtFee, 0)} 원</td></tr>
          <tr><td>총 발생 비용</td><td class="val-neg">-${formatNumber(summary.totalTradeFee + summary.totalMgmtFee, 0)} 원</td></tr>
        </table>

        <div class="report-narrative">
          <p><strong>종합 분석:</strong> 총 <strong>${summary.buyCount + summary.sellCount}회</strong>의 거래를 통해 <strong>${formatNumber(totalPnl, 0)}원</strong>의 총 손익을 기록했습니다. 최대 투입 원금 대비 <strong>${roi.toFixed(2)}%</strong>의 수익률입니다. 총 발생 비용은 ${formatNumber(summary.totalTradeFee + summary.totalMgmtFee, 0)}원으로, 최종 손익에 영향을 주었습니다.</p>
          <p><strong>거래 스타일:</strong> 실현 손익 기준 <strong>${summary.winRate.toFixed(1)}%</strong>의 승률을 보였으며, 평균 이익이 평균 손실보다 <strong>${summary.plRatio.toFixed(2)}배</strong> 큰 ${summary.plRatio >= 1 ? '손익비가 좋은' : '손익비가 좋지 않은'} 거래 패턴을 보였습니다. 이는 ${summary.plRatio >= 1 ? '수익을 길게 가져가고 손실을 짧게 끊는 전략이 유효했음을 시사합니다.' : '이익을 짧게 끊고 손실을 길게 가져가는 경향이 있어 개선이 필요해 보입니다.'}</p>
          ${summary.finalShares > 0 ? `<p><strong>최종 상태:</strong> 현재 <strong>${formatNumber(summary.finalShares, 0)}주</strong>를 보유 중이며, <strong>${formatNumber(summary.unrealizedPnl, 0)}원</strong>의 미실현 손익이 있습니다.</p>` : '<p><strong>최종 상태:</strong> 모든 포지션이 청산되었습니다.</p>'}
        </div>
      </div>
    `;
    reportBox.innerHTML = html;
  }

  function downloadSimReport() {
    if (document.querySelector('.input-error')) {
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
    a.download = `단기매매리포트_${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function initSim() {
    // 저장된 상태가 있으면 불러오고, 없으면 초기화합니다.
    if (!loadState()) {
      resetSim();
    }
  }

  window.shortTermSim = {
    init: initSim,
    reset: resetSim,
    addRow: addSimRow,
    removeRow: removeSimRow,
    recalc: recalcSim,
    onLeverageSelChange,
    onFieldChange: onSimFieldChange,
    onFieldBlur: onSimFieldBlur,
    onTypeChange: onSimTypeChange,
    exportExcel: exportSimExcel,
    generateReport: generateSimReport,
    downloadReport: downloadSimReport,
  };
})();
