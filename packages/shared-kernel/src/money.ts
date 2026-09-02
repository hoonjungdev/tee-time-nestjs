import { Decimal } from 'decimal.js';

export { Decimal };

/**
 * 금액에 number를 쓰지 않는다. numeric(12,2)를 이진 부동소수점으로 받으면
 * 합계와 환불액 계산에서 오차가 남는다. 근거는 docs/schema.md.
 *
 * 타입 이름을 도메인 어휘로 한 번 더 두는 이유는, 금액을 다루는 자리에서
 * "Decimal이라는 수치 타입"이 아니라 "돈"으로 읽히게 하기 위함이다.
 */
export type Money = Decimal;

export const DEFAULT_CURRENCY = 'KRW';

export function money(value: string | number | Money): Money {
  return new Decimal(value);
}

/** DB의 numeric 컬럼에 넣을 문자열. 소수 둘째 자리로 고정한다. */
export function toAmountString(value: Money): string {
  return value.toFixed(2);
}
