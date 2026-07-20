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

function onLeverageSelChange(){
  const sel = document.getElementById('simLeverageSel').value;
  document.getElementById('simCustomLeverageWrap').style.display = (sel === 'custom') ? 'block' : 'none';
  recalcSim();
}

function addSimRow(){
  simRows.push({ closePrice: null, underlyingRate: 0, etfRate: null, lastEdited: 'none' });
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
  addSimRow();
  addSimRow();
  addSimRow();
}

function onSimCloseInput(idx, el){
  onSimNumInput(el);
  simRows[idx].closePrice = parseNum(el.value);
  simRows[idx].lastEdited = 'close';
  renderSimTable();
}

function onSimEtfInput(idx, el){
  onSimNumInput(el);
  simRows[idx].etfRate = parseNum(el.value);
  simRows[idx].lastEdited = 'etf';
  renderSimTable();
}

function renderSimTable(){
  const tbody = document.getElementById('simTableBody');
  tbody.innerHTML = '';

  const buyPrice = parseNum(document.getElementById('simBuyPrice').value);
  const shares = parseNum(document.getElementById('simShares').value);
  const leverage = getSimLeverage();
  const principal = buyPrice * shares;

  document.getElementById('simEtfRateHeader').textContent = `ETF 등락률(${leverage}배)(%)`;
  document.getElementById('simPrincipalBox').innerHTML = `
    <table class="summary-table">
      <tr><td>원금 (자동 계산)</td><td class="pos">${principal.toLocaleString('ko-KR')} 원</td></tr>
    </table>
  `;

  let prevClose = buyPrice;
  let etfPrice = buyPrice;

  simRows.forEach((row, idx) => {
    if(idx === 0){
      row.closePrice = buyPrice;
      row.underlyingRate = 0;
      row.etfRate = 0;
      etfPrice = buyPrice;
    } else {
      if(row.lastEdited === 'close' && row.closePrice !== null){
        row.underlyingRate = prevClose ? ((row.closePrice - prevClose) / prevClose) * 100 : 0;
        row.etfRate = row.underlyingRate * leverage;
      } else if(row.lastEdited === 'etf' && row.etfRate !== null){
        row.underlyingRate = leverage !== 0 ? row.etfRate / leverage : 0;
        row.closePrice = prevClose ? prevClose * (1 + row.underlyingRate/100) : buyPrice;
      } else {
        row.closePrice = prevClose;
        row.underlyingRate = 0;
        row.etfRate = 0;
      }
      etfPrice = etfPrice * (1 + (row.etfRate || 0)/100);
    }
    row._etfPrice = etfPrice;
    prevClose = row.closePrice;

    const evalAmount = etfPrice * shares;
    const pnl = evalAmount - principal;
    const pnlRate = principal !== 0 ? (pnl / principal) * 100 : 0;
    const rateCls = row.underlyingRate >= 0 ? 'val-pos' : 'val-neg';
    const etfCls = (row.etfRate || 0) >= 0 ? 'val-pos' : 'val-neg';
    const pnlCls = pnl >= 0 ? 'val-pos' : 'val-neg';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx}일차</td>
      <td><input type="text" class="dayReturnInput" value="${row.closePrice != null ? row.closePrice.toFixed(0) : ''}" ${idx===0?'disabled':''} oninput="onSimCloseInput(${idx}, this)"></td>
      <td class="${rateCls}">${row.underlyingRate.toFixed(2)}%</td>
      <td><input type="text" class="dayReturnInput" value="${row.etfRate != null ? row.etfRate.toFixed(2) : ''}" ${idx===0?'disabled':''} oninput="onSimEtfInput(${idx}, this)"></td>
      <td class="${etfCls}">${etfPrice.toLocaleString('ko-KR', {maximumFractionDigits:2})}</td>
      <td>${evalAmount.toLocaleString('ko-KR', {maximumFractionDigits:0})}</td>
      <td class="${pnlCls}">${pnl.toLocaleString('ko-KR', {maximumFractionDigits:0})}</td>
      <td class="${pnlCls}">${pnlRate.toFixed(2)}%</td>
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

  const rows = [['시점', '기초자산 종가(원)', '기초자산 등락률(%)', 'ETF 등락률(%)', 'ETF 주당 가격(원)', '평가금액(원)', '손익(원)', '손익률(%)']];

  simRows.forEach((row, idx) => {
    const etfPrice = row._etfPrice || 0;
    const evalAmount = etfPrice * shares;
    const pnl = evalAmount - principal;
    const pnlRate = principal !== 0 ? (pnl / principal) * 100 : 0;
    rows.push([
      `${idx}일차`,
      row.closePrice != null ? row.closePrice.toFixed(0) : '',
      row.underlyingRate != null ? row.underlyingRate.toFixed(2) : '',
      row.etfRate != null ? row.etfRate.toFixed(2) : '',
      etfPrice.toFixed(2),
      evalAmount.toFixed(0),
      pnl.toFixed(0),
      pnlRate.toFixed(2)
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '손익시뮬레이션');
  XLSX.writeFile(wb, '레버리지ETF_손실복구_시뮬레이션.xlsx');
}

resetSim();