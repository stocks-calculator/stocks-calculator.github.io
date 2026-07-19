// ====================================================================
// [레버리지 시뮬레이션 계산기 - 로직 파일]
// ====================================================================

let dayCount = 0;

function syncLeverage(source){
  const select = document.getElementById('leverageSelect');
  const custom = document.getElementById('leverageCustom');
  const customWrap = document.getElementById('customLeverageWrap');
  if(source === 'select'){
    if(select.value === 'custom'){
      customWrap.style.display = 'block';
    } else {
      customWrap.style.display = 'none';
      custom.value = select.value;
    }
  }
  recalcAllRows();
}

function formatPrincipal(){
  const input = document.getElementById('principal');
  const cursorFromEnd = input.value.length - input.selectionStart;
  const raw = input.value.replace(/[^0-9]/g, '');
  if(raw === ''){ input.value = ''; recalcAllRows(); return; }
  const formatted = Number(raw).toLocaleString('en-US');
  input.value = formatted;
  const newPos = Math.max(formatted.length - cursorFromEnd, 0);
  input.setSelectionRange(newPos, newPos);
  recalcAllRows();
}

function getPrincipalValue(){
  const raw = document.getElementById('principal').value.replace(/[^0-9.-]/g, '');
  return parseFloat(raw);
}
function getLeverage(){
  const select = document.getElementById('leverageSelect');
  const custom = document.getElementById('leverageCustom');
  return select.value === 'custom' ? parseFloat(custom.value) : parseFloat(select.value);
}

function addDayRow(defaultVal){
  dayCount++;
  const tbody = document.getElementById('dayTableBody');
  const tr = document.createElement('tr');
  tr.id = 'row-' + dayCount;
  tr.innerHTML = `
    <td>${dayCount}일차</td>
    <td><input type="number" class="dayReturnInput" step="0.01" value="${defaultVal!==undefined?defaultVal:''}" oninput="recalcAllRows()" placeholder="예: 1.5"></td>
    <td class="underlyingCell">-</td>
    <td class="leveragedCell">-</td>
    <td><button class="del-btn" onclick="removeRow(${dayCount})">삭제</button></td>
  `;
  tbody.appendChild(tr);
  recalcAllRows();
}

function removeRow(id){
  const row = document.getElementById('row-' + id);
  if(row) row.remove();
  renumberRows();
  recalcAllRows();
}

function renumberRows(){
  const tbody = document.getElementById('dayTableBody');
  Array.from(tbody.children).forEach((tr, i) => {
    tr.children[0].textContent = (i+1) + '일차';
  });
}

function recalcAllRows(){
  const leverage = getLeverage();
  const principal = getPrincipalValue() || 0;
  const feeAnnual = (parseFloat(document.getElementById('fee').value) || 0)/100;
  const dailyFee = feeAnnual/252;

  const tbody = document.getElementById('dayTableBody');
  let underlyingValue = principal;
  let leveragedValue = principal;

  Array.from(tbody.children).forEach(tr => {
    const input = tr.querySelector('.dayReturnInput');
    const r = parseFloat(input.value)/100;
    const underlyingCell = tr.querySelector('.underlyingCell');
    const leveragedCell = tr.querySelector('.leveragedCell');
    if(isNaN(r)){
      underlyingCell.textContent = '-';
      leveragedCell.textContent = '-';
      return;
    }
    underlyingValue *= (1+r);
    leveragedValue *= (1 + r*leverage - dailyFee);
    underlyingCell.textContent = Math.round(underlyingValue).toLocaleString() + '원';
    leveragedCell.textContent = Math.round(leveragedValue).toLocaleString() + '원';
    leveragedCell.className = 'leveragedCell ' + (leveragedValue>=principal ? 'val-pos':'val-neg');
  });
}

function calcSimulation(){
  const leverage = getLeverage();
  const principal = getPrincipalValue();
  const feeAnnual = (parseFloat(document.getElementById('fee').value) || 0)/100;
  const dailyFee = feeAnnual/252;

  const tbody = document.getElementById('dayTableBody');
  const returns = Array.from(tbody.children)
    .map(tr => parseFloat(tr.querySelector('.dayReturnInput').value)/100)
    .filter(v => !isNaN(v));

  if(returns.length===0 || isNaN(principal) || isNaN(leverage)){
    document.getElementById('simResult').innerHTML = '<p class="neg">투자 원금, 레버리지 배수, 최소 1개 이상의 일별 수익률을 입력하세요.</p>';
    return;
  }

  let underlyingValue = principal;
  let leveragedValue = principal;
  returns.forEach(r => {
    underlyingValue *= (1+r);
    leveragedValue *= (1 + r*leverage - dailyFee);
  });

  const underlyingTotalReturn = (underlyingValue/principal - 1)*100;
  const leveragedTotalReturn = (leveragedValue/principal - 1)*100;
  const naiveExpected = underlyingTotalReturn * leverage;
  const decay = naiveExpected - leveragedTotalReturn;
  const profit = leveragedValue - principal;
  const cls = profit>=0 ? 'pos':'neg';

  document.getElementById('simResult').innerHTML = `
    <table class="summary-table">
      <tr><th>구분</th><th>값</th></tr>
      <tr><td>기초자산 총 수익률</td><td>${underlyingTotalReturn.toFixed(2)}%</td></tr>
      <tr><td>단순 계산상 예상 수익률 (기초 x ${leverage})</td><td>${naiveExpected.toFixed(2)}%</td></tr>
      <tr><td>실제 시뮬레이션 레버리지 수익률</td><td class="${cls}">${leveragedTotalReturn.toFixed(2)}%</td></tr>
      <tr><td>최종 평가금액</td><td>${Math.round(leveragedValue).toLocaleString()}원</td></tr>
      <tr><td>손익 금액</td><td class="${cls}">${profit>=0?'+':''}${Math.round(profit).toLocaleString()}원</td></tr>
    </table>
    <div class="decay-box">
      <p class="result">⚡ 변동성 끌림(Decay): <b class="neg">${decay.toFixed(2)}%p</b></p>
      <p class="result" style="font-size:12.5px;">단순 계산(기초자산 수익률 × ${leverage})과 실제 복리 시뮬레이션 결과의 차이입니다. 이 값이 클수록 일일 리셋 구조로 인한 장기 누적 왜곡이 크다는 뜻입니다.</p>
    </div>
  `;
}

function resetAll(){
  document.getElementById('leverageSelect').value = '2';
  document.getElementById('leverageCustom').value = '2';
  document.getElementById('customLeverageWrap').style.display = 'none';
  document.getElementById('principal').value = '';
  document.getElementById('fee').value = '0';
  document.getElementById('dayTableBody').innerHTML = '';
  document.getElementById('simResult').innerHTML = '';
  dayCount = 0;
}

function exportExcel(){
  const leverage = getLeverage();
  const principal = getPrincipalValue();
  const feeAnnual = (parseFloat(document.getElementById('fee').value) || 0)/100;
  const dailyFee = feeAnnual/252;

  const tbody = document.getElementById('dayTableBody');
  const rows = Array.from(tbody.children);
  if(rows.length===0 || isNaN(principal)){
    alert('저장할 데이터가 없습니다. 투자 원금과 일별 수익률을 먼저 입력하세요.');
    return;
  }

  let underlyingValue = principal;
  let leveragedValue = principal;

  const dailyRows = [];
  rows.forEach((tr, i) => {
    const input = tr.querySelector('.dayReturnInput');
    const r = parseFloat(input.value)/100;
    if(isNaN(r)) return;
    underlyingValue *= (1+r);
    leveragedValue *= (1 + r*leverage - dailyFee);
    dailyRows.push([
      (i+1) + '일차',
      (r*100).toFixed(2),
      Math.round(underlyingValue),
      Math.round(leveragedValue)
    ]);
  });

  const underlyingTotalReturn = (underlyingValue/principal - 1)*100;
  const leveragedTotalReturn = (leveragedValue/principal - 1)*100;
  const naiveExpected = underlyingTotalReturn * leverage;
  const decay = naiveExpected - leveragedTotalReturn;
  const profit = leveragedValue - principal;

  const wb = XLSX.utils.book_new();

  const summarySheetData = [
    ['레버리지 배수', '투자 원금(원)', '연 운용 보수(%, 선택)'],
    [leverage + 'x', principal, (feeAnnual*100).toFixed(2)],
    [],
    ['구분', '일 수익률(%)', '기초자산 가치', '레버리지 가치'],
    ...dailyRows,
    [],
    ['기초자산 총 수익률(%)', underlyingTotalReturn.toFixed(2)],
    ['단순 예상 수익률(%)', naiveExpected.toFixed(2)],
    ['실제 시뮬레이션 수익률(%)', leveragedTotalReturn.toFixed(2)],
    ['최종 평가금액(원)', Math.round(leveragedValue)],
    ['손익금액(원)', Math.round(profit)],
    ['변동성 끌림 Decay(%p)', decay.toFixed(2)]
  ];

  const ws = XLSX.utils.aoa_to_sheet(summarySheetData);
  ws['!cols'] = [{wch:22},{wch:18},{wch:18},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws, '시뮬레이션결과');

  const now = new Date();
  const ts = now.getFullYear() + '' + String(now.getMonth()+1).padStart(2,'0') + '' + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
  XLSX.writeFile(wb, `레버리지_시뮬레이션_${ts}.xlsx`);
}

addDayRow(2);
addDayRow(-1);
addDayRow(3);
