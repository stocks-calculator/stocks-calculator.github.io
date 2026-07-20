// ====================================================================
// [레버리지 ETF 손실/복구 시뮬레이터 - 로직 파일]
// ====================================================================
let simRows = [];

function onSimNumInput(el){
  el.value = el.value.replace(/[^0-9.+-]/g, '');
}

function parseNum(v){
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

function onLeverageSelChange(){
  const sel = document.getElementById('simLeverageSel').value;
  document.getElementById('simCustomLeverageWrap').style.display = (sel === 'custom') ? 'block' : 'none';
  recalcSim();
}

function addSimRow(){
  simRows.push({ field: null, value: null });
  renderSimTable();
}

function removeSimRow(idx){
  if(simRows.length <= 1) return;
  simRows.splice(idx, 1);
  renderSimTable();
}

function resetSim(){
  simRows = [];
  document.getElementById('simBuyPrice').value = '';
  document.getElementById('simShares').value = '';
  document.getElementById('simLeverageSel').value = '2';
  document.getElementById('simLeverageCustom').value = '';
  document.getElementById('simCustomLeverageWrap').style.display = 'none';
  const feeEl = document.getElementById('simFeeRate');
  if(feeEl) feeEl.value = '';
  addSimRow();
  addSimRow();
  addSimRow();
}

// 사용자가 표의 7개 입력 필드 중 하나를 수정했을 때 호출됨
function onSimFieldInput(idx, field, el){
  onSimNumInput(el);
  simRows[idx] = { field: field, value: parseNum(el.value) };
  renderSimTable();
}

function computeRowValues(field, value, prevClose, prevEtfPrice, leverage, dailyFee, shares, principal){
  let underlyingRate, etfRate, etfPrice, delta;

  if(field === 'delta'){
    delta = value;
    underlyingRate = prevClose ? (delta / prevClose) * 100 : 0;
    etfRate = underlyingRate * leverage;
    etfPrice = prevEtfPrice * (1 + etfRate/100 - dailyFee);
  } else if(field === 'underlyingRate'){
    underlyingRate = value;
    delta = prevClose * underlyingRate / 100;
    etfRate = underlyingRate * leverage;
    etfPrice = prevEtfPrice * (1 + etfRate/100 - dailyFee);
  } else if(field === 'etfRate'){
    etfRate = value;
    underlyingRate = leverage !== 0 ? etfRate / leverage : 0;
    delta = prevClose * underlyingRate / 100;
    etfPrice = prevEtfPrice * (1 + etfRate/100 - dailyFee);
  } else if(field === 'etfPrice'){
    etfPrice = value;
    etfRate = prevEtfPrice !== 0 ? ((etfPrice / prevEtfPrice) - 1 + dailyFee) * 100 : 0;
    underlyingRate = leverage !== 0 ? etfRate / leverage : 0;
    delta = prevClose * underlyingRate / 100;
  } else if(field === 'evalAmount'){
    const evalAmount = value;
    etfPrice = shares !== 0 ? evalAmount / shares : 0;
    etfRate = prevEtfPrice !== 0 ? ((etfPrice / prevEtfPrice) - 1 + dailyFee) * 100 : 0;
    underlyingRate = leverage !== 0 ? etfRate / leverage : 0;
    delta = prevClose * underlyingRate / 100;
  } else if(field === 'pnl'){
    const pnl = value;
    const evalAmount = pnl + principal;
    etfPrice = shares !== 0 ? evalAmount / shares : 0;
    etfRate = prevEtfPrice !== 0 ? ((etfPrice / prevEtfPrice) - 1 + dailyFee) * 100 : 0;
    underlyingRate = leverage !== 0 ? etfRate / leverage : 0;
    delta = prevClose * underlyingRate / 100;
  } else if(field === 'pnlRate'){
    const pnlRate = value;
    const pnl = principal !== 0 ? (pnlRate / 100) * principal : 0;
    const evalAmount = pnl + principal;
    etfPrice = shares !== 0 ? evalAmount / shares : 0;
    etfRate = prevEtfPrice !== 0 ? ((etfPrice / prevEtfPrice) - 1 + dailyFee) * 100 : 0;
    underlyingRate = leverage !== 0 ? etfRate / leverage : 0;
    delta = prevClose * underlyingRate / 100;
  } else {
    delta = 0;
    underlyingRate = 0;
    etfRate = 0;
    etfPrice = prevEtfPrice;
  }

  const closePrice = prevClose + delta;
  const evalAmount = etfPrice * shares;
  const pnl = evalAmount - principal;
  const pnlRate = principal !== 0 ? (pnl / principal) * 100 : 0;

  return { delta, underlyingRate, etfRate, etfPrice, closePrice, evalAmount, pnl, pnlRate };
}

function renderSimTable(){
  const tbody = document.getElementById('simTableBody');
  tbody.innerHTML = '';

  const buyPrice = parseNum(document.getElementById('simBuyPrice').value);
  const shares = parseNum(document.getElementById('simShares').value);
  const leverage = getSimLeverage();
  const dailyFee = getSimDailyFee();
  const principal = buyPrice * shares;

  document.getElementById('simEtfRateHeader').textContent = `ETF 등락률(${leverage}배)(%)`;
  document.getElementById('simPrincipalBox').value = `${principal.toLocaleString('ko-KR')} 원`;

  let prevClose = buyPrice;
  let prevEtfPrice = buyPrice;

  simRows.forEach((row, idx) => {
    let vals;
    if(idx === 0){
      vals = { delta: 0, underlyingRate: 0, etfRate: 0, etfPrice: buyPrice, closePrice: buyPrice, evalAmount: buyPrice*shares, pnl: 0, pnlRate: 0 };
    } else {
      vals = computeRowValues(row.field, row.value, prevClose, prevEtfPrice, leverage, dailyFee, shares, principal);
    }

    row._closePrice = vals.closePrice;
    row._etfPrice = vals.etfPrice;
    prevClose = vals.closePrice;
    prevEtfPrice = vals.etfPrice;

    const rateCls = vals.underlyingRate >= 0 ? 'val-pos' : 'val-neg';
    const etfCls = vals.etfRate >= 0 ? 'val-pos' : 'val-neg';
    const pnlCls = vals.pnl >= 0 ? 'val-pos' : 'val-neg';

    const disabledAttr = idx === 0 ? 'disabled' : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx}</td>
      <td><input type="text" class="dayReturnInput" value="${vals.delta.toFixed(0)}" ${disabledAttr} oninput="onSimFieldInput(${idx}, 'delta', this)"></td>
      <td class="${rateCls}"><input type="text" class="dayReturnInput" value="${vals.underlyingRate.toFixed(2)}" ${disabledAttr} oninput="onSimFieldInput(${idx}, 'underlyingRate', this)"></td>
      <td class="${etfCls}"><input type="text" class="dayReturnInput" value="${vals.etfRate.toFixed(2)}" ${disabledAttr} oninput="onSimFieldInput(${idx}, 'etfRate', this)"></td>
      <td><input type="text" class="dayReturnInput" value="${vals.etfPrice.toFixed(2)}" ${disabledAttr} oninput="onSimFieldInput(${idx}, 'etfPrice', this)"></td>
      <td><input type="text" class="dayReturnInput" value="${vals.evalAmount.toFixed(0)}" ${disabledAttr} oninput="onSimFieldInput(${idx}, 'evalAmount', this)"></td>
      <td class="${pnlCls}"><input type="text" class="dayReturnInput" value="${vals.pnl.toFixed(0)}" ${disabledAttr} oninput="onSimFieldInput(${idx}, 'pnl', this)"></td>
      <td class="${pnlCls}"><input type="text" class="dayReturnInput" value="${vals.pnlRate.toFixed(2)}" ${disabledAttr} oninput="onSimFieldInput(${idx}, 'pnlRate', this)"></td>
      <td>${idx>0 ? `<button class="del-btn" onclick="removeSimRow(${idx})">삭제</button>` : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function recalcSim(){
  renderSimTable();
}

function exportSimExcel(){
  const shares = parseNum(document.getElementById('simShares').value);
  const buyPrice = parseNum(document.getElementById('simBuyPrice').value);
  const principal = buyPrice * shares;
  const leverage = getSimLeverage();
  const dailyFee = getSimDailyFee();

  const rows = [['일차', '기초자산 증가(원)', '기초자산 등락률(%)', `ETF 등락률(${leverage}배)(%)`, 'ETF 주당 가격(원)', '평가금액(원)', '손익(원)', '손익률(%)']];

  let prevClose = buyPrice;
  let prevEtfPrice = buyPrice;
  simRows.forEach((row, idx) => {
    let vals;
    if(idx === 0){
      vals = { delta: 0, underlyingRate: 0, etfRate: 0, etfPrice: buyPrice, closePrice: buyPrice, evalAmount: buyPrice*shares, pnl: 0, pnlRate: 0 };
    } else {
      vals = computeRowValues(row.field, row.value, prevClose, prevEtfPrice, leverage, dailyFee, shares, principal);
    }
    prevClose = vals.closePrice;
    prevEtfPrice = vals.etfPrice;
    rows.push([idx, vals.delta.toFixed(0), vals.underlyingRate.toFixed(2), vals.etfRate.toFixed(2), vals.etfPrice.toFixed(2), vals.evalAmount.toFixed(0), vals.pnl.toFixed(0), vals.pnlRate.toFixed(2)]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ETF시뮬레이션');
  XLSX.writeFile(wb, 'ETF손실복구시뮬레이션.xlsx');
}

// ====================================================================
// [3. 리포트 생성 기능]
// ====================================================================
function buildSimSeries(){
  const buyPrice = parseNum(document.getElementById('simBuyPrice').value);
  const shares = parseNum(document.getElementById('simShares').value);
  const leverage = getSimLeverage();
  const dailyFee = getSimDailyFee();
  const principal = buyPrice * shares;

  let prevClose = buyPrice;
  let prevEtfPrice = buyPrice;
  const series = [];

  simRows.forEach((row, idx) => {
    let vals;
    if(idx === 0){
      vals = { delta: 0, underlyingRate: 0, etfRate: 0, etfPrice: buyPrice, closePrice: buyPrice, evalAmount: buyPrice*shares, pnl: 0, pnlRate: 0 };
    } else {
      vals = computeRowValues(row.field, row.value, prevClose, prevEtfPrice, leverage, dailyFee, shares, principal);
    }
    prevClose = vals.closePrice;
    prevEtfPrice = vals.etfPrice;
    series.push({ idx, ...vals });
  });

  return { series, buyPrice, shares, leverage, dailyFee, principal };
}

function generateSimReport(){
  const { series, buyPrice, shares, leverage, dailyFee, principal } = buildSimSeries();
  const reportBox = document.getElementById('simReportBox');
  if(!reportBox) return;

  if(series.length < 2 || principal === 0){
    reportBox.innerHTML = '<p class="report-empty">리포트를 생성하려면 먼저 기본 설정(매수 가격, 매수 수량)과 일자별 시뮬레이션 데이터를 입력해주세요.</p>';
    return;
  }

  const last = series[series.length - 1];

  const underlyingCumRate = buyPrice !== 0 ? ((last.closePrice - buyPrice) / buyPrice) * 100 : 0;
  const etfCumRate = buyPrice !== 0 ? ((last.etfPrice - buyPrice) / buyPrice) * 100 : 0;
  const decayGap = (underlyingCumRate * leverage) - etfCumRate;

  let underlyingPeak = buyPrice, underlyingMDD = 0;
  let etfPeak = buyPrice, etfMDD = 0;
  let mddDay = 0;
  series.forEach(s => {
    if(s.closePrice > underlyingPeak) underlyingPeak = s.closePrice;
    const uDD = underlyingPeak !== 0 ? ((s.closePrice - underlyingPeak) / underlyingPeak) * 100 : 0;
    if(uDD < underlyingMDD) underlyingMDD = uDD;

    if(s.etfPrice > etfPeak) etfPeak = s.etfPrice;
    const eDD = etfPeak !== 0 ? ((s.etfPrice - etfPeak) / etfPeak) * 100 : 0;
    if(eDD < etfMDD){ etfMDD = eDD; mddDay = s.idx; }
  });

  const requiredReboundRate = last.etfPrice !== 0 ? ((buyPrice / last.etfPrice) - 1) * 100 : 0;
  const requiredUnderlyingRebound = leverage !== 0 ? requiredReboundRate / leverage : 0;

  const finalPnl = last.pnl;
  const finalPnlRate = last.pnlRate;
  const isProfit = finalPnl >= 0;

  const annualFeeImpact = dailyFee * series.length * 100;

  let riskLevel = '낮음';
  if(Math.abs(etfMDD) >= 30) riskLevel = '매우 높음';
  else if(Math.abs(etfMDD) >= 15) riskLevel = '높음';
  else if(Math.abs(etfMDD) >= 5) riskLevel = '보통';

  const html = `
    <div class="report-summary">
      <h4>시뮬레이션 리포트 (${series.length - 1}일차 기준)</h4>
      <table class="report-table">
        <tr><td>현재 손익</td><td class="${isProfit ? 'val-pos':'val-neg'}">${finalPnl.toLocaleString('ko-KR', {maximumFractionDigits:0})} 원 (${finalPnlRate.toFixed(2)}%)</td></tr>
        <tr><td>기초자산 누적 등락률</td><td class="${underlyingCumRate>=0?'val-pos':'val-neg'}">${underlyingCumRate.toFixed(2)}%</td></tr>
        <tr><td>ETF(${leverage}배) 누적 등락률</td><td class="${etfCumRate>=0?'val-pos':'val-neg'}">${etfCumRate.toFixed(2)}%</td></tr>
        <tr><td>레버리지 감쇠 효과(경로 의존성 손실)</td><td class="val-neg">-${Math.abs(decayGap).toFixed(2)}%p</td></tr>
        <tr><td>ETF 최대낙폭(MDD)</td><td class="val-neg">${etfMDD.toFixed(2)}% (${mddDay}일차)</td></tr>
        <tr><td>기초자산 최대낙폭(MDD)</td><td class="val-neg">${underlyingMDD.toFixed(2)}%</td></tr>
        <tr><td>원금 회복에 필요한 ETF 상승률</td><td>${requiredReboundRate > 0 ? requiredReboundRate.toFixed(2) + '%' : '이미 회복(또는 초과 수익)'}</td></tr>
        <tr><td>원금 회복에 필요한 기초자산 상승률</td><td>${requiredUnderlyingRebound > 0 ? requiredUnderlyingRebound.toFixed(2) + '%' : '-'}</td></tr>
        <tr><td>수수료로 인한 대략적 손실 영향</td><td class="val-neg">-${annualFeeImpact.toFixed(2)}%</td></tr>
        <tr><td>리스크 수준(MDD 기준)</td><td>${riskLevel}</td></tr>
      </table>
      <div class="report-narrative">
        <p>${series.length - 1}일 동안 기초자산은 ${underlyingCumRate.toFixed(2)}% ${underlyingCumRate>=0?'상승':'하락'}했으나, ${leverage}배 레버리지 ETF는 ${etfCumRate.toFixed(2)}% ${etfCumRate>=0?'상승':'하락'}했습니다. 이론적으로는 기초자산 등락률의 ${leverage}배(${(underlyingCumRate*leverage).toFixed(2)}%)가 되어야 하지만, 일일 재조정에 따른 경로 의존성(변동성 감쇠) 효과로 약 ${Math.abs(decayGap).toFixed(2)}%p의 차이가 발생했습니다.</p>
        <p>현재 평가 결과는 ${isProfit ? '이익' : '손실'} 상태이며, 손익률은 ${finalPnlRate.toFixed(2)}%입니다. ${requiredReboundRate > 0 ? `원금을 회복하려면 ETF가 추가로 ${requiredReboundRate.toFixed(2)}% 상승해야 하며, 이는 기초자산 기준으로 약 ${requiredUnderlyingRebound.toFixed(2)}% 상승에 해당합니다.` : '현재 이미 매수 원금 이상을 회복한 상태입니다.'}</p>
        <p>시뮬레이션 기간 중 ETF는 최대 ${Math.abs(etfMDD).toFixed(2)}%까지 낙폭을 기록했으며(${mddDay}일차), 이는 기초자산 최대낙폭 ${Math.abs(underlyingMDD).toFixed(2)}%보다 ${Math.abs(etfMDD) > Math.abs(underlyingMDD) ? '더 큰' : '유사하거나 작은'} 수준입니다. 레버리지 ETF는 변동성이 큰 구간에서는 상승과 하락을 반복할수록 원금 회복이 더 어려워지는 구조적 특성이 있으므로, 장기 보유 시 이 감쇠 효과를 반드시 고려해야 합니다.</p>
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
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ETF손실복구_리포트.txt';
  a.click();
  URL.revokeObjectURL(url);
}

resetSim();
