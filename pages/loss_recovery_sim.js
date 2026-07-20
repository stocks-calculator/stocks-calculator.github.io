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

resetSim();
