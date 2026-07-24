
// ====================================================================
// [레버리지 ETF 손실/복구(매매) 시뮬레이터 - 로직 파일] (수정본)
// - IIFE로 전역 스코프 격리, window.lossRecoverySim 으로만 공개
// - DOM ID는 loss- 접두사 사용 (HTML도 함께 변경 필요)
// - 매수 수수료를 평균단가(원가)에 포함하도록 수정
// - 화면 계산과 buildSimSeries()의 hold(targetPrice) 로직을 공통 함수로 통일
// - 중간 계산의 불필요한 Math.trunc() 제거, 출력 시에만 반올림
// ====================================================================
(function () {
  'use strict';

  const ID = {
    leverageSel: 'lossLeverageSel',
    leverageCustom: 'lossLeverageCustom',
    customLeverageWrap: 'lossCustomLeverageWrap',
    feeRate: 'lossFeeRate',
    tradeFeeRate: 'lossTradeFeeRate',
    tableBody: 'lossTableBody',
    summaryBox: 'lossSummaryBox',
    reportBox: 'lossReportBox',
  };

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
    el.value = formatNumber(value, fractionDigits);
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

  function onSimFieldBlur(idx, field, el) {
    formatInputOnBlur(el, (field === 'underlyingRate' ? 2 : 0));
    recalcSim();
  }

  function onSimTypeChange(idx, el) {
    simRows[idx].type = el.value;
    recalcSim();
  }

  // hold 행 계산을 화면/시리즈에서 공통으로 사용하기 위한 함수.
  // targetPrice가 입력되어 있으면 이를 우선하고, 없으면 underlyingRate로 계산합니다.
  // 반환값의 etfPrice는 반올림하지 않은 실수입니다 (표시 시에만 반올림).
  function calculateHoldStep({ currentEtfPrice, targetPrice, underlyingRate, leverage, dailyFee }) {
    if (targetPrice > 0 && currentEtfPrice > 0) {
      const etfRate = (targetPrice / currentEtfPrice) - 1;
      const impliedUnderlyingRate = leverage !== 0 ? (etfRate / leverage) * 100 : 0;
      return {
        etfPrice: targetPrice,
        underlyingRate: impliedUnderlyingRate,
      };
    }

    const etfRate = (underlyingRate / 100 * leverage) - dailyFee;
    return {
      etfPrice: currentEtfPrice * (1 + etfRate),
      underlyingRate,
    };
  }

  // 매수 1행의 손익/원가 계산을 화면/시리즈에서 공통으로 사용.
  // 매수 수수료를 원가(총투입금, 평균단가)에 포함시킵니다.
  function applyBuyStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentEtfPrice }) {
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
      // 매수 수수료는 평균단가에 반영되므로 realizedPnl에서는 별도로 차감하지 않습니다.
    }

    const nextEtfPrice = buyPrice > 0 ? buyPrice : (currentEtfPrice || 0);

    return {
      avgCost: nextAvgCost,
      totalShares: nextTotalShares,
      totalInvested: nextTotalInvested,
      realizedPnlDelta,
      etfPrice: nextEtfPrice,
      grossBuyAmount: (buyShares > 0 && buyPrice > 0) ? buyPrice * buyShares : 0,
    };
  }

  // 매도 1행의 손익 계산을 화면/시리즈에서 공통으로 사용.
  function applySellStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentEtfPrice }) {
    const sellShares = Math.min(row.shares, totalShares);
    const sellPrice = row.price;
    let realizedPnlDelta = 0;
    let nextAvgCost = avgCost;
    let nextTotalShares = totalShares;
    let nextTotalInvested = totalInvested;
    let grossSellAmount = 0;

    if (sellShares > 0 && sellPrice > 0) {
      const pnlFromSale = (sellPrice - avgCost) * sellShares;
      const feeFromSale = sellPrice * sellShares * tradeFee;
      realizedPnlDelta = pnlFromSale - feeFromSale;
      grossSellAmount = sellPrice * sellShares;

      nextTotalInvested = totalInvested - (avgCost * sellShares);
      nextTotalShares = totalShares - sellShares;

      if (nextTotalShares <= 0) {
        nextTotalInvested = 0;
        nextAvgCost = 0;
        nextTotalShares = 0;
      }
    }

    const nextEtfPrice = sellPrice > 0 ? sellPrice : (currentEtfPrice || 0);

    return {
      avgCost: nextAvgCost,
      totalShares: nextTotalShares,
      totalInvested: nextTotalInvested,
      realizedPnlDelta,
      etfPrice: nextEtfPrice,
      grossSellAmount,
    };
  }

  function renderSimTable() {
    const tbody = document.getElementById(ID.tableBody);
    tbody.innerHTML = '';

    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();
    const tradeFee = getSimTradeFee();

    let avgCost = 0, totalShares = 0, currentEtfPrice = 0, totalInvested = 0;
    let realizedPnl = 0;

    simRows.forEach((row, idx) => {
      const step = idx + 1;
      let nextEtfPrice = currentEtfPrice;

      if (row.type === 'hold') {
        const result = calculateHoldStep({
          currentEtfPrice, targetPrice: row.targetPrice,
          underlyingRate: row.underlyingRate, leverage, dailyFee,
        });
        row.underlyingRate = result.underlyingRate;
        nextEtfPrice = result.etfPrice;
      } else if (row.type === 'buy') {
        const result = applyBuyStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentEtfPrice });
        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        realizedPnl += result.realizedPnlDelta;
        nextEtfPrice = result.etfPrice;
      } else if (row.type === 'sell') {
        const result = applySellStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentEtfPrice });
        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        realizedPnl += result.realizedPnlDelta;
        nextEtfPrice = result.etfPrice;
      }

      currentEtfPrice = nextEtfPrice;

      const tr = document.createElement('tr');
      const isHold = row.type === 'hold';
      const displayEtfPrice = Math.trunc(currentEtfPrice);

      const tradeCells = `
        <td><input type="text" class="dayReturnInput" data-field="price" value="${formatNumber(row.price, 0)}"
          oninput="lossRecoverySim.onFieldChange(${idx}, 'price', this)"
          onblur="lossRecoverySim.onFieldBlur(${idx}, 'price', this)"></td>
        <td><input type="text" class="dayReturnInput" data-field="shares" value="${formatNumber(row.shares, 0)}"
          oninput="lossRecoverySim.onFieldChange(${idx}, 'shares', this)"
          onblur="lossRecoverySim.onFieldBlur(${idx}, 'shares', this)"></td>
      `;

      const holdCells = `
        <td><input type="text" class="dayReturnInput" data-field="underlyingRate" value="${formatNumber(row.underlyingRate, 2)}"
          oninput="lossRecoverySim.onFieldChange(${idx}, 'underlyingRate', this)"
          onblur="lossRecoverySim.onFieldBlur(${idx}, 'underlyingRate', this)"></td>
        <td><input type="text" class="dayReturnInput" data-field="targetPrice" value="${formatNumber(row.targetPrice, 0)}"
          oninput="lossRecoverySim.onFieldChange(${idx}, 'targetPrice', this)"
          onblur="lossRecoverySim.onFieldBlur(${idx}, 'targetPrice', this)"></td>
        <td class="etf-price-cell">${formatNumber(displayEtfPrice, 0)}</td>
      `;

      tr.innerHTML = `
        <td class="row-idx">${step}</td>
        <td>
          <select onchange="lossRecoverySim.onTypeChange(${idx}, this)">
            <option value="buy" ${row.type === 'buy' ? 'selected' : ''}>매수</option>
            <option value="sell" ${row.type === 'sell' ? 'selected' : ''}>매도</option>
            <option value="hold" ${row.type === 'hold' ? 'selected' : ''}>보유</option>
          </select>
        </td>
        ${isHold ? `<td colspan="2" class="placeholder-cell">-</td>${holdCells}` : `${tradeCells}<td colspan="3" class="placeholder-cell">-</td>`}
        <td><button class="del-btn" onclick="lossRecoverySim.removeRow(${idx})">삭제</button></td>
      `;
      tbody.appendChild(tr);
    });

    const evalAmount = currentEtfPrice * totalShares;
    const unrealizedPnl = totalShares > 0 ? (currentEtfPrice - avgCost) * totalShares : 0;
    const unrealizedPnlRate = (avgCost * totalShares) > 0 ? (unrealizedPnl / (avgCost * totalShares)) * 100 : 0;
    const totalPnl = realizedPnl + unrealizedPnl;

    const summaryBox = document.getElementById(ID.summaryBox);
    summaryBox.innerHTML = `
      <table>
        <tr><td>보유 수량</td><td class="summary-value">${formatNumber(totalShares, 0)} 주</td>
            <td>평균 단가</td><td class="summary-value">${formatNumber(avgCost, 0)} 원</td></tr>
        <tr><td>평가 금액</td><td class="summary-value">${formatNumber(evalAmount, 0)} 원</td>
            <td>현재가</td><td class="summary-value">${formatNumber(Math.trunc(currentEtfPrice), 0)} 원</td></tr>
        <tr><td>미실현 손익</td><td class="summary-value ${unrealizedPnl >= 0 ? 'val-pos' : 'val-neg'}">${formatNumber(unrealizedPnl, 0)} 원 (${unrealizedPnlRate.toFixed(2)}%)</td>
            <td>실현 손익</td><td class="summary-value ${realizedPnl >= 0 ? 'val-pos' : 'val-neg'}">${formatNumber(realizedPnl, 0)} 원</td></tr>
        <tr><td>총 손익</td><td colspan="3" class="summary-value total-pnl ${totalPnl >= 0 ? 'val-pos' : 'val-neg'}">${formatNumber(totalPnl, 0)} 원</td></tr>
      </table>
    `;
  }

  function updateOtherCells(changedRowIndex, changedField) {
    // 입력 도중 포커스를 잃지 않도록, 변경된 셀 이외의 셀들만 갱신합니다.
    // 실제 값은 blur 시 recalcSim()에서 전체 재계산됩니다. 여기서는 간단한 미리보기만 갱신합니다.
    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();

    const tr = document.getElementById(ID.tableBody).children[changedRowIndex];
    if (!tr) return;

    const row = simRows[changedRowIndex];
    if (row.type === 'hold') {
      let currentEtfPrice = 0;
      for (let i = 0; i < changedRowIndex; i++) {
        const prevRow = simRows[i];
        if (prevRow.type === 'hold') {
          const result = calculateHoldStep({
            currentEtfPrice, targetPrice: prevRow.targetPrice,
            underlyingRate: prevRow.underlyingRate, leverage, dailyFee,
          });
          currentEtfPrice = result.etfPrice;
        } else {
          currentEtfPrice = prevRow.price > 0 ? prevRow.price : currentEtfPrice;
        }
      }

      const result = calculateHoldStep({
        currentEtfPrice, targetPrice: row.targetPrice,
        underlyingRate: row.underlyingRate, leverage, dailyFee,
      });

      if (changedField !== 'underlyingRate') {
        const rateInput = tr.querySelector('[data-field="underlyingRate"]');
        if (rateInput) rateInput.value = formatNumber(result.underlyingRate, 2);
      }
      const priceCell = tr.querySelector('.etf-price-cell');
      if (priceCell) priceCell.textContent = formatNumber(Math.trunc(result.etfPrice), 0);
    }
  }

  function recalcSim() {
    [ID.leverageCustom, ID.feeRate, ID.tradeFeeRate].forEach((id) => {
      const el = document.getElementById(id);
      if (el) onSimNumInput(el);
    });
    renderSimTable();
  }

  function buildSimSeries() {
    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();
    const tradeFee = getSimTradeFee();

    let avgCost = 0, totalShares = 0, currentEtfPrice = 0;
    let totalInvested = 0, totalBuyAmount = 0, totalSellAmount = 0, realizedPnl = 0;
    let firstInvestment = 0;
    let firstInvested = false;

    const series = [];

    simRows.forEach((row, idx) => {
      let nextEtfPrice = currentEtfPrice;

      if (row.type === 'hold') {
        const result = calculateHoldStep({
          currentEtfPrice, targetPrice: row.targetPrice,
          underlyingRate: row.underlyingRate, leverage, dailyFee,
        });
        nextEtfPrice = result.etfPrice;
      } else if (row.type === 'buy') {
        const result = applyBuyStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentEtfPrice });
        if (result.grossBuyAmount > 0) {
          totalBuyAmount += result.grossBuyAmount;
          if (!firstInvested) {
            firstInvestment = result.grossBuyAmount;
            firstInvested = true;
          }
        }
        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        realizedPnl += result.realizedPnlDelta;
        nextEtfPrice = result.etfPrice;
      } else if (row.type === 'sell') {
        const result = applySellStep({ row, avgCost, totalShares, totalInvested, tradeFee, currentEtfPrice });
        totalSellAmount += result.grossSellAmount;
        avgCost = result.avgCost;
        totalShares = result.totalShares;
        totalInvested = result.totalInvested;
        realizedPnl += result.realizedPnlDelta;
        nextEtfPrice = result.etfPrice;
      }

      currentEtfPrice = nextEtfPrice;

      const evalAmount = currentEtfPrice * totalShares;
      const unrealizedPnl = totalShares > 0 ? (currentEtfPrice - avgCost) * totalShares : 0;

      series.push({
        step: idx + 1,
        type: row.type,
        etfPrice: currentEtfPrice,
        totalShares, avgCost, evalAmount, realizedPnl, unrealizedPnl,
        raw: row,
      });
    });

    const last = series[series.length - 1] || {};
    const summary = {
      initialInvestment: firstInvestment,
      totalBuyAmount,
      totalSellAmount,
      finalShares: last.totalShares || 0,
      finalAvgCost: last.avgCost || 0,
      finalEvalAmount: last.evalAmount || 0,
      realizedPnl: last.realizedPnl || 0,
      unrealizedPnl: last.unrealizedPnl || 0,
      totalPnl: (last.realizedPnl || 0) + (last.unrealizedPnl || 0),
    };

    return { series, summary };
  }

  function exportSimExcel() {
    const { series, summary } = buildSimSeries();
    if (series.length === 0 || (typeof XLSX === 'undefined')) {
      alert('내보낼 데이터가 없거나 엑셀 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const tradeLogHeader = ['단계', '유형', '가격', '수량', '등락률(%)', 'ETF가격', '보유수량', '평균단가', '평가금액', '실현손익', '미실현손익'];
    const tradeLogRows = series.map((s) => [
      s.step,
      s.type === 'buy' ? '매수' : (s.type === 'sell' ? '매도' : '보유'),
      s.raw.price, s.raw.shares, s.raw.underlyingRate,
      Math.trunc(s.etfPrice), s.totalShares, Math.trunc(s.avgCost),
      Math.trunc(s.evalAmount), Math.trunc(s.realizedPnl), Math.trunc(s.unrealizedPnl),
    ]);

    const summaryHeader = ['항목', '값'];
    const summaryRows = [
      ['최초 투입금', summary.initialInvestment],
      ['총 매수금액', summary.totalBuyAmount],
      ['총 매도금액', summary.totalSellAmount],
      ['최종 보유수량', summary.finalShares],
      ['최종 평균단가', Math.trunc(summary.finalAvgCost)],
      ['최종 평가금액', Math.trunc(summary.finalEvalAmount)],
      ['실현손익', Math.trunc(summary.realizedPnl)],
      ['미실현손익', Math.trunc(summary.unrealizedPnl)],
      ['총손익', Math.trunc(summary.totalPnl)],
    ];

    const wb = XLSX.utils.book_new();
    const wsLog = XLSX.utils.aoa_to_sheet([tradeLogHeader, ...tradeLogRows]);
    const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows]);

    wsLog['!cols'] = new Array(tradeLogHeader.length).fill({ wch: 15 });
    wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, wsLog, '거래내역');
    XLSX.utils.book_append_sheet(wb, wsSummary, '요약');

    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `손실복구시뮬_${timestamp}.xlsx`);
  }

  function generateSimReport() {
    const { series, summary } = buildSimSeries();
    const reportBox = document.getElementById(ID.reportBox);
    if (!reportBox) return;

    if (series.length === 0 || summary.totalBuyAmount === 0) {
      reportBox.innerHTML = `<p class="report-empty">리포트를 생성하려면 먼저 기본 설정과 거래 내역을 입력해주세요.</p>`;
      return;
    }

    let peakEval = 0;
    let mdd = 0;
    let mddStep = 0;
    series.forEach((s) => {
      if (s.evalAmount > peakEval) peakEval = s.evalAmount;
      if (s.evalAmount === 0) return;
      const drawdown = peakEval > 0 ? ((s.evalAmount - peakEval) / peakEval) * 100 : 0;
      if (drawdown < mdd) {
        mdd = drawdown;
        mddStep = s.step;
      }
    });

    let winningTrades = 0, losingTrades = 0, totalProfit = 0, totalLoss = 0;
    series.forEach((s, i) => {
      if (s.type === 'sell' && s.raw.shares > 0) {
        const prevAvgCost = i > 0 ? series[i - 1].avgCost : 0;
        const pnl = s.raw.price - prevAvgCost;
        if (pnl >= 0) {
          winningTrades++;
          totalProfit += pnl * s.raw.shares;
        } else {
          losingTrades++;
          totalLoss += pnl * s.raw.shares;
        }
      }
    });

    const totalTrades = winningTrades + losingTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgProfit = winningTrades > 0 ? totalProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
    const profitLossRatio = Math.abs(avgLoss) > 0 ? avgProfit / Math.abs(avgLoss) : 0;
    const isProfit = summary.totalPnl >= 0;

    const html = `
      <div class="report-summary">
        <h4>총 ${series.length}단계 시뮬레이션 결과</h4>
        <table class="report-table">
          <tr><td>총 손익 (실현+미실현)</td><td class="${isProfit ? 'val-pos' : 'val-neg'}">${formatNumber(summary.totalPnl, 0)} 원</td></tr>
          <tr><td>실현 손익</td><td class="${summary.realizedPnl >= 0 ? 'val-pos' : 'val-neg'}">${formatNumber(summary.realizedPnl, 0)} 원</td></tr>
          <tr><td>최대 낙폭 (MDD)</td><td class="val-neg">${mdd.toFixed(2)}% (at ${mddStep}단계)</td></tr>
          <tr><td>총 거래 횟수 (매도 기준)</td><td>${totalTrades} 회</td></tr>
          <tr><td>승률</td><td>${winRate.toFixed(1)}% (${winningTrades}승 ${losingTrades}패)</td></tr>
          <tr><td>손익비 (Profit/Loss Ratio)</td><td>${profitLossRatio.toFixed(2)}</td></tr>
          <tr><td>평균 익절 금액</td><td class="val-pos">${formatNumber(avgProfit, 0)} 원</td></tr>
          <tr><td>평균 손절 금액</td><td class="val-neg">${formatNumber(avgLoss, 0)} 원</td></tr>
        </table>
        <div class="report-narrative">
          ${isProfit
            ? `<p>총 ${series.length}단계의 시뮬레이션 결과, 성공적인 거래를 통해 총 ${formatNumber(summary.totalPnl, 0)}원의 이익을 달성했습니다. 이 중 확정된 실현 손익은 ${formatNumber(summary.realizedPnl, 0)}원입니다.</p>`
            : `<p>총 ${series.length}단계의 시뮬레이션 결과, 아쉽게도 총 ${formatNumber(summary.totalPnl, 0)}원의 손실을 기록했습니다. 다음 거래에서는 손절 라인을 설정하거나 분할 매수/매도 전략을 수정하여 리스크를 관리하는 것을 고려해볼 수 있습니다.</p>`
          }
          <p>총 ${totalTrades}번의 매도 거래 중 ${winningTrades}번 이익을 보아 승률은 ${winRate.toFixed(1)}%입니다. 평균 익절 금액은 ${formatNumber(avgProfit, 0)}원, 평균 손절 금액은 ${formatNumber(avgLoss, 0)}원으로 손익비는 ${profitLossRatio.toFixed(2)}를 기록했습니다. ${profitLossRatio > 1 ? '손절보다 익절 금액이 커서 안정적인 전략입니다.' : '익절보다 손절 금액이 커서 손실 관리에 유의해야 하는 전략입니다.'}</p>
          <p>최대 낙폭(MDD)은 -${Math.abs(mdd).toFixed(2)}%로, 투자 기간 중 자산 가치가 고점 대비 최대 이만큼 하락한 시점이 있었습니다. MDD가 낮을수록 안정적인 전략으로 평가할 수 있습니다.</p>
        </div>
      </div>
    `;
    reportBox.innerHTML = html;
  }

  function downloadSimReport() {
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
    a.download = `손실복구리포트_${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  window.lossRecoverySim = {
    init: resetSim,
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
