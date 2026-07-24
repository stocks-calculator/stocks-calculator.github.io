// ====================================================================
// [공통 유틸리티 함수]
// ====================================================================

/**
 * 입력 필드의 숫자를 실시간으로 쉼표 포맷팅하고 커서 위치를 유지합니다.
 * @param {HTMLInputElement} el - 대상 입력 요소
 */
function onSimNumInput(el){
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
  el.setSelectionRange(cursorPosition + (newLength - originalLength), cursorPosition + (newLength - originalLength));
}

/**
 * 쉼표가 포함된 문자열을 숫자로 변환합니다. 변환 실패 시 0을 반환합니다.
 * @param {string|number} v - 변환할 값
 * @returns {number}
 */
function parseNum(v){
  if ((v || '').toString() === '-') return 0;
  const n = parseFloat((v || '').toString().replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatNumber(num, fractionDigits) {
    const parsedNum = parseFloat(num);
    if (isNaN(parsedNum)) return num;
    return parsedNum.toLocaleString('ko-KR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}