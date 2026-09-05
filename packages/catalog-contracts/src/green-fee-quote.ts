import type { Money } from '@teetime/shared-kernel';

/** 요금 조회 결과가 모듈 경계를 넘을 때의 모양이다. 엔티티가 아닌 DTO다. */
export type GreenFeeQuote = {
  readonly courseId: string;
  readonly amount: Money;
  readonly currency: string;
};
