// ====================================================================
// [단기매매 시뮬레이터 - 로직 파일]
// ====================================================================
let simRows = [];

function onSimNumInput(el){
  // 1. 현재 커서 위치 저장
  const cursorPosition = el.selectionStart;
  const originalLength = el.value.length;

  // 2. 숫자, 소수점, 부호 이외의 문자 및 기존 쉼표 제거
  const rawValue = el.value.replace(/[^0-9.-]/g, '');
  const parts = rawValue.split('.');
  const integerPart = parts[0];
  const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('') : '';

  // '-' 또는 '.'만 단독으로 있거나, '-.' 인 경우 포맷팅하지 않고 그대로 둠
  if (rawValue === '-' || rawValue === '.' || rawValue === '-.') {
    el.value = rawValue;
    return;
  }

  if (integerPart) {
    // 3. 정수 부분에만 쉼표 포맷팅 적용
    const formattedInteger = parseFloat(integerPart).toLocaleString('ko-KR');
    el.value = formattedInteger + decimalPart;
  } else {
    el.value = rawValue;
  }

  // 4. 커서 위치 조정
  const newLength = el.value.length;
  el.setSelectionRange(cursorPosition + (newLength - originalLength), cursorPosition + (newLength - originalLength));
}

function parseNum(v){
  if ((v || '').toString() === '-') return 0; // '-'만 입력된 경우 0으로 처리하여 NaN 방지
  const n = parseFloat((v || '').toString().replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function getSimLeverage(){
  const sel = document.getElementById('simLeverageSel').value;
  if(sel === 'custom'){
    return parseNum(document.getElementById('simLeverageCustom').value) || 1;
  }
  return parseFloat(sel);
}

function getSimDailyFee(){
  const el = document.getElementById('simFeeRate');
  const annualFee = el ? parseNum(el.value) : 0;
  return (annualFee / 100) / 365;
}

function getSimTradeFee(){
  const el = document.getElementById('simTradeFeeRate');
  const tradeFee = el ? parseNum(el.value) : 0;
  return tradeFee / 100;
}

function onLeverageSelChange(){
  const sel = document.getElementById('simLeverageSel').value;
  document.getElementById('simCustomLeverageWrap').style.display = (sel === 'custom') ? 'block' : 'none';
  recalcSim();
}

function addSimRow(){
  simRows.push({
    type: 'buy', // 'buy', 'sell', 'hold'
    price: 0,
    shares: 0,
    overnightRate: 0,
    underlyingRate: 0,
    targetPrice: 0,
  });
  recalcSim(); // 행 추가 후 테이블을 다시 렌더링합니다.
}

function removeSimRow(idx){
  if(simRows.length <= 1) return;
  simRows.splice(idx, 1);
  renderSimTable();
}

function onSimTypeChange(idx, el) {
  simRows[idx].type = el.value;
  // 타입 변경 시에는 전체 행의 구조가 바뀌므로, 전체를 다시 렌더링합니다.
  recalcSim();
}

function resetSim(){
  simRows = [];
  document.getElementById('simLeverageSel').value = '2';
  document.getElementById('simLeverageCustom').value = '';
  document.getElementById('simCustomLeverageWrap').style.display = 'none';
  const feeEl = document.getElementById('simFeeRate');
  if (feeEl) feeEl.value = '';
  const tradeFeeEl = document.getElementById('simTradeFeeRate');
  if (tradeFeeEl) tradeFeeEl.value = '';
  addSimRow();
  addSimRow();
  addSimRow();
  addSimRow();
  addSimRow();
  addSimRow();
  recalcSim();
}

function onSimFieldChange(idx, field, el) {
  onSimNumInput(el);
  const parsedValue = parseNum(el.value);
  const row = simRows[idx];
  row[field] = parsedValue;

  if (field === 'targetPrice' && parsedValue > 0) {
    row.underlyingRate = 0; // 목표가 입력 시 등락률은 초기화 후 역산
  } else if (field === 'underlyingRate') {
    row.targetPrice = 0; // 등락률 직접 입력 시 목표가는 초기화
  }
  // 입력 중에는 전체를 다시 그리지 않고, 다른 셀들만 업데이트하여 포커스 유실을 방지합니다.
  updateOtherCells(idx, field);
}

function onSimFieldBlur(idx, field, el) {
    formatInputOnBlur(el, (field === 'underlyingRate' ? 2 : 0));
    recalcSim(); // 입력이 끝나면 전체를 다시 계산하고 렌더링합니다.
}

function renderSimTable(){
  const tbody = document.getElementById('simTableBody');
  tbody.innerHTML = '';

  const leverage = getSimLeverage();
  const dailyFee = getSimDailyFee();
  const tradeFee = getSimTradeFee();

  // 누적 계산을 위한 변수
  let avgCost = 0, totalShares = 0, currentEtfPrice = 0, totalInvested = 0;
  let realizedPnl = 0;

  simRows.forEach((row, idx) => {
    const step = idx + 1;
    let nextEtfPrice = currentEtfPrice;

    if (row.type === 'hold') {
      if (row.targetPrice > 0 && currentEtfPrice > 0) {
        const etfRate = (row.targetPrice / currentEtfPrice) - 1;
        row.underlyingRate = leverage !== 0 ? (etfRate / leverage) * 100 : 0;
        nextEtfPrice = row.targetPrice;
      } else {
        nextEtfPrice = Math.trunc(currentEtfPrice * (1 + (row.underlyingRate / 100 * leverage) - dailyFee));
      }
    } else if (row.type === 'buy') {
      const buyShares = row.shares;
      const buyPrice = row.price;
      if (buyShares > 0 && buyPrice > 0) {
        const newInvestment = buyPrice * buyShares;
        totalInvested = (avgCost * totalShares) + newInvestment;
        totalShares += buyShares;
        realizedPnl -= newInvestment * tradeFee; // 매수 수수료를 실현 손익에서 차감
        avgCost = totalShares > 0 ? totalInvested / totalShares : 0;
      }
      nextEtfPrice = buyPrice > 0 ? buyPrice : (currentEtfPrice || 0); // 매수 시 현재가는 매수가
    } else if (row.type === 'sell') {
      const sellShares = Math.min(row.shares, totalShares); // 보유 수량 초과 매도 방지
      const sellPrice = row.price;
      if (sellShares > 0 && sellPrice > 0) {
        const pnlFromSale = (sellPrice - avgCost) * sellShares;
        const feeFromSale = sellPrice * sellShares * tradeFee;
        realizedPnl += pnlFromSale - feeFromSale; // 매도 손익에서 매도 수수료를 차감
        totalInvested -= avgCost * sellShares;
        totalShares -= sellShares;
        if (totalShares <= 0) {
          totalInvested = 0;
          avgCost = 0;
        }
      }
      nextEtfPrice = sellPrice > 0 ? sellPrice : (currentEtfPrice || 0); // 매도 시 현재가는 매도가
    }

    currentEtfPrice = nextEtfPrice;

    const tr = document.createElement('tr');
    const isHold = row.type === 'hold';

    const pricePlaceholder = (idx === 0 && row.type === 'buy') ? '첫 매수가격 입력' : (row.type === 'buy' ? '매수가' : '매도가');
    const sharesPlaceholder = (idx === 0 && row.type === 'buy') ? '첫 매수수량 입력' : (row.type === 'buy' ? '매수수량' : '매도수량');

    const tradeCells = `
      <td><input type="text" class="dayReturnInput" placeholder="${pricePlaceholder}" data-field="price" value="${formatNumber(row.price, 0)}" oninput="onSimFieldChange(${idx}, 'price', this)" onblur="onSimFieldBlur(${idx}, 'price', this)"></td>
      <td><input type="text" class="dayReturnInput" placeholder="${sharesPlaceholder}" data-field="shares" value="${formatNumber(row.shares, 0)}" oninput="onSimFieldChange(${idx}, 'shares', this)" onblur="onSimFieldBlur(${idx}, 'shares', this)"></td>
    `;
    const holdCells = `
      <td><input type="text" class="dayReturnInput" placeholder="기초자산 등락률(%)" data-field="underlyingRate" value="${formatNumber(row.underlyingRate, 2)}" oninput="onSimFieldChange(${idx}, 'underlyingRate', this)" onblur="onSimFieldBlur(${idx}, 'underlyingRate', this)"></td>
      <td><input type="text" class="dayReturnInput" placeholder="ETF 목표가" data-field="targetPrice" value="${formatNumber(row.targetPrice, 0)}" oninput="onSimFieldChange(${idx}, 'targetPrice', this)" onblur="onSimFieldBlur(${idx}, 'targetPrice', this)"></td>
      <td class="etf-price-cell">${formatNumber(currentEtfPrice, 0)}</td>
    `;

    tr.innerHTML = `
      <td class="row-idx">${step}</td>
      <td>
        <select onchange="onSimTypeChange(${idx}, this)">
          <option value="buy" ${row.type === 'buy' ? 'selected' : ''}>매수</option>
          <option value="sell" ${row.type === 'sell' ? 'selected' : ''}>매도</option>
          <option value="hold" ${row.type === 'hold' ? 'selected' : ''}>보유(오버나잇)</option>
        </select>
      </td>
      ${isHold ? `<td colspan="2" class="placeholder-cell"></td> ${holdCells}` : `${tradeCells} <td colspan="3" class="placeholder-cell"></td>`}
      <td><button class="del-btn" onclick="removeSimRow(${idx})">삭제</button></td>
    `;
    tbody.appendChild(tr);
  });

  // 최종 상태 계산 및 요약 정보 업데이트
  const evalAmount = currentEtfPrice * totalShares;
  const unrealizedPnl = totalShares > 0 ? (currentEtfPrice - avgCost) * totalShares : 0;
  const unrealizedPnlRate = (avgCost * totalShares) > 0 ? (unrealizedPnl / (avgCost * totalShares)) * 100 : 0;
  const totalPnl = realizedPnl + unrealizedPnl;

  const summaryBox = document.getElementById('simSummaryBox');
  summaryBox.innerHTML = `
    <table>
      <tr>
        <td>보유 수량</td><td class="summary-value">${formatNumber(totalShares, 0)} 주</td>
        <td>평균 단가</td><td class="summary-value">${formatNumber(avgCost, 0)} 원</td>
      </tr>
      <tr>
        <td>평가 금액</td><td class="summary-value">${formatNumber(evalAmount, 0)} 원</td>
        <td>현재가</td><td class="summary-value">${formatNumber(currentEtfPrice, 0)} 원</td>
      </tr>
      <tr>
        <td>미실현 손익</td>
        <td class="summary-value ${unrealizedPnl >= 0 ? 'val-pos' : 'val-neg'}">
          ${formatNumber(unrealizedPnl, 0)} 원 (${unrealizedPnlRate.toFixed(2)}%)
        </td>
        <td>실현 손익</td>
        <td class="summary-value ${realizedPnl >= 0 ? 'val-pos' : 'val-neg'}">
          ${formatNumber(realizedPnl, 0)} 원
        </td>
      </tr>
       <tr>
        <td>총 손익</td>
        <td colspan="3" class="summary-value total-pnl ${totalPnl >= 0 ? 'val-pos' : 'val-neg'}">
          ${formatNumber(totalPnl, 0)} 원
        </td>
      </tr>
    </table>
  `;
}

function updateOtherCells(changedRowIndex, changedField) {
    // 이 함수는 입력 중 포커스를 잃지 않도록,
    // 현재 수정 중인 칸을 제외한 나머지 모든 값들을 다시 계산하고 화면에 업데이트합니다.
    const leverage = getSimLeverage();
    const dailyFee = getSimDailyFee();
    const tradeFee = getSimTradeFee();

    let avgCost = 0, totalShares = 0, currentEtfPrice = 0, totalInvested = 0;
    let realizedPnl = 0;

    simRows.forEach((row, idx) => {
        let nextEtfPrice = currentEtfPrice;

        if (row.type === 'hold') {
            if (idx === changedRowIndex && changedField === 'targetPrice' && row.targetPrice > 0 && currentEtfPrice > 0) {
                const etfRate = (row.targetPrice / currentEtfPrice) - 1;
                row.underlyingRate = leverage !== 0 ? (etfRate / leverage) * 100 : 0;
                nextEtfPrice = row.targetPrice;
            } else {
                nextEtfPrice = Math.trunc(currentEtfPrice * (1 + (row.underlyingRate / 100 * leverage) - dailyFee));
            }
        } else if (row.type === 'buy') {
            const buyShares = row.shares;
            const buyPrice = row.price;
            if (buyShares > 0 && buyPrice > 0) {
                const newInvestment = buyPrice * buyShares;
                totalInvested = (avgCost * totalShares) + newInvestment;
                totalShares += buyShares;
                realizedPnl -= newInvestment * tradeFee;
                avgCost = totalShares > 0 ? totalInvested / totalShares : 0;
            }
            nextEtfPrice = buyPrice > 0 ? buyPrice : (currentEtfPrice || 0);
        } else if (row.type === 'sell') {
            // ... (sell logic is complex for real-time update, full recalc on blur is better)
        }
        currentEtfPrice = nextEtfPrice;

        // Update UI for other cells if needed
        const tr = document.getElementById('simTableBody').children[idx];
        if (tr) {
            if (row.type === 'hold') {
                if (changedField !== 'underlyingRate') tr.querySelector('[data-field="underlyingRate"]').value = formatNumber(row.underlyingRate, 2);
                tr.querySelector('.etf-price-cell').textContent = formatNumber(nextEtfPrice, 0);
            }
        }
    });
}

function recalcSim(){
  ['simLeverageCustom', 'simFeeRate', 'simTradeFeeRate'].forEach(id => {
    const el = document.getElementById(id);
    if(el) onSimNumInput(el);
  });
  renderSimTable(); // This will re-render everything based on current inputs
}

function formatNumber(num, fractionDigits) {
    const parsedNum = parseFloat(num);
    if (isNaN(parsedNum)) {
        return num; // Return original value if it's not a valid number (e.g. user's raw input)
    }
    return parsedNum.toLocaleString('ko-KR', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}

function formatInputOnBlur(el, fractionDigits) {
    const value = parseNum(el.value);
    el.value = formatNumber(value, fractionDigits);
}

function exportSimExcel(){
  const { series, summary } = buildSimSeries();
  if (series.length === 0) {
    alert('저장할 데이터가 없습니다. 먼저 시뮬레이션을 실행해주세요.');
    return;
  }

  // 1. 거래 내역 시트 데이터
  const tradeLogHeader = ['단계', '거래유형', '거래가격', '거래수량', '기초자산등락률(%)', 'ETF 현재가', '보유수량', '평균단가', '평가금액', '실현손익(누적)', '미실현손익'];
  const tradeLogRows = series.map(s => [
    s.step,
    s.type === 'buy' ? '매수' : s.type === 'sell' ? '매도' : '보유',
    s.raw.price,
    s.raw.shares,
    s.raw.underlyingRate,
    s.etfPrice,
    s.totalShares,
    s.avgCost,
    s.evalAmount,
    s.realizedPnl,
    s.unrealizedPnl
  ]);

  // 2. 최종 요약 시트 데이터
  const summaryHeader = ['항목', '값'];
  const summaryRows = [
    ['최초 투자 원금', summary.initialInvestment],
    ['총 매수 금액 (최초 포함)', summary.totalBuyAmount],
    ['총 매도 금액', summary.totalSellAmount],
    [],
    ['최종 보유 수량', summary.finalShares],
    ['최종 평균 단가', summary.finalAvgCost],
    ['최종 평가 금액', summary.finalEvalAmount],
    [],
    ['총 실현 손익', summary.realizedPnl],
    ['최종 미실현 손익', summary.unrealizedPnl],
    ['총 손익 (실현+미실현)', summary.totalPnl],
  ];

  const wb = XLSX.utils.book_new();
  const wsLog = XLSX.utils.aoa_to_sheet([tradeLogHeader, ...tradeLogRows]);
  const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows]);

  wsLog['!cols'] = Array(tradeLogHeader.length).fill({ wch: 15 });
  wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }];

  XLSX.utils.book_append_sheet(wb, wsLog, '거래내역');
  XLSX.utils.book_append_sheet(wb, wsSummary, '최종요약');

  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `단기매매_시뮬레이션_${timestamp}.xlsx`);
}

// ====================================================================
// [3. 리포트 생성 기능]
// ====================================================================
function buildSimSeries(){
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
      const etfRate = row.underlyingRate / 100 * leverage;
      nextEtfPrice = Math.trunc(currentEtfPrice * (1 + etfRate - dailyFee));
    } else if (row.type === 'buy') {
      const buyShares = row.shares;
      const buyPrice = row.price;
      if (buyShares > 0 && buyPrice > 0) {
        const newInvestment = buyPrice * buyShares;
        totalBuyAmount += newInvestment;
        totalInvested = (avgCost * totalShares) + newInvestment;
        realizedPnl -= newInvestment * tradeFee;
        totalShares += buyShares;
        avgCost = totalShares > 0 ? totalInvested / totalShares : 0;
        if (!firstInvested) {
          firstInvestment = newInvestment;
          firstInvested = true;
        }
      }
      nextEtfPrice = buyPrice > 0 ? buyPrice : currentEtfPrice;
    } else if (row.type === 'sell') {
      const sellShares = Math.min(row.shares, totalShares);
      const sellPrice = row.price;
      if (sellShares > 0 && sellPrice > 0) {
        totalSellAmount += sellPrice * sellShares;
        const feeFromSale = sellPrice * sellShares * tradeFee;
        const pnlFromSale = (sellPrice - avgCost) * sellShares;
        realizedPnl += pnlFromSale - feeFromSale;
        totalInvested -= avgCost * sellShares;
        totalShares -= sellShares;
        if (totalShares <= 0) {
          totalInvested = 0;
          avgCost = 0;
        }
      }
      nextEtfPrice = sellPrice > 0 ? sellPrice : currentEtfPrice;
    }

    currentEtfPrice = nextEtfPrice;
    const evalAmount = currentEtfPrice * totalShares;
    const unrealizedPnl = totalShares > 0 ? (currentEtfPrice - avgCost) * totalShares : 0;

    series.push({
      step: idx + 1,
      type: row.type,
      etfPrice: currentEtfPrice,
      totalShares,
      avgCost,
      evalAmount,
      realizedPnl,
      unrealizedPnl,
      raw: row
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

function generateSimReport(){
  const { series, summary } = buildSimSeries();
  const reportBox = document.getElementById('simReportBox');
  if(!reportBox) return;

  if(series.length === 0 || summary.totalBuyAmount === 0){
    reportBox.innerHTML = '<p class="report-empty">리포트를 생성하려면 먼저 기본 설정과 거래 내역을 입력해주세요.</p>';
    return;
  }

  // MDD 계산
  let peakEval = 0;
  let mdd = 0;
  let mddStep = 0;
  series.forEach(s => {
    if (s.evalAmount > peakEval) peakEval = s.evalAmount;
    // 전량 매도하여 평가금액이 0인 경우는 MDD 계산에서 제외
    if (s.evalAmount === 0) return;
    const drawdown = peakEval > 0 ? ((s.evalAmount - peakEval) / peakEval) * 100 : 0;
    if (drawdown < mdd) {
      mdd = drawdown;
      mddStep = s.step;
    }
  });

  // 승률, 손익비 계산
  const sellTrades = series.filter(s => s.type === 'sell' && s.raw.shares > 0);
  let winningTrades = 0, losingTrades = 0, totalProfit = 0, totalLoss = 0;

  series.forEach((s, i) => {
    if (s.type === 'sell' && s.raw.shares > 0) {
      const prevAvgCost = i > 0 ? series[i-1].avgCost : 0;
      const pnl = s.raw.price - prevAvgCost;
      if (pnl > 0) {
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
      <h4>매매 성과 리포트 (${series.length} 단계 기준)</h4>
      <table class="report-table">
        <tr><td>총 손익 (실현+미실현)</td><td class="${isProfit ? 'val-pos':'val-neg'}">${formatNumber(summary.totalPnl, 0)} 원</td></tr>
        <tr><td>실현 손익</td><td class="${summary.realizedPnl >= 0 ? 'val-pos':'val-neg'}">${formatNumber(summary.realizedPnl, 0)} 원</td></tr>
        <tr><td>최대 낙폭 (MDD)</td><td class="val-neg">${mdd.toFixed(2)}% (at ${mddStep}단계)</td></tr>
        <tr><td>총 거래 횟수 (매도 기준)</td><td>${totalTrades} 회</td></tr>
        <tr><td>승률</td><td>${winRate.toFixed(1)}% (${winningTrades}승 ${losingTrades}패)</td></tr>
        <tr><td>손익비 (Profit/Loss Ratio)</td><td>${profitLossRatio.toFixed(2)}</td></tr>
        <tr><td>평균 익절 금액</td><td class="val-pos">${formatNumber(avgProfit, 0)} 원</td></tr>
        <tr><td>평균 손절 금액</td><td class="val-neg">${formatNumber(avgLoss, 0)} 원</td></tr>
      </table>
      <div class="report-narrative">
        <p>총 ${series.length}단계의 시뮬레이션 결과, <strong>총 ${formatNumber(summary.totalPnl, 0)}원</strong>의 ${isProfit ? '이익' : '손실'}을 기록했습니다. 이 중 확정된 실현 손익은 ${formatNumber(summary.realizedPnl, 0)}원입니다.</p>
        <p>총 ${totalTrades}번의 매도 거래 중 ${winningTrades}번 이익을 보아 <strong>승률은 ${winRate.toFixed(1)}%</strong>입니다. 평균 익절 금액은 ${formatNumber(avgProfit,0)}원, 평균 손절 금액은 ${formatNumber(avgLoss,0)}원으로 <strong>손익비는 ${profitLossRatio.toFixed(2)}</strong>를 기록했습니다. ${profitLossRatio > 1 ? '손절보다 익절 금액이 커서 안정적인 전략입니다.' : '익절보다 손절 금액이 커서 손실 관리에 유의해야 하는 전략입니다.'}</p>
        <p>전략의 안정성을 나타내는 <strong>최대 낙폭(MDD)은 -${Math.abs(mdd).toFixed(2)}%</strong>로, 투자 기간 중 자산 가치가 고점 대비 최대 이만큼 하락한 시점이 있었습니다. MDD가 낮을수록 안정적인 전략으로 평가할 수 있습니다.</p>
      </div>
    </div>
  `;

  reportBox.innerHTML = html;
}

function downloadSimReport(){
  const reportBox = document.getElementById('simReportBox');
  if(!reportBox || !reportBox.innerText.trim()){
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
  a.download = `레버리지손실복구_리포트_${timestamp}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// 페이지가 처음 로드될 때 시뮬레이터를 초기화합니다.
resetSim();
