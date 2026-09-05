/**
 * ErrorCode → HTTP 상태의 매핑을 한 곳에 모은다.
 * 컨트롤러마다 상태 코드를 하드코딩하면 같은 실패가 경로마다 다른 코드로 나간다.
 *
 * 규약은 docs/conventions.md §1에 있다. 422는 쓰지 않는다.
 */
export const ERROR_CODES = {
  InvalidRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,

  ClubNotFound: 404,
  CourseNotFound: 404,
  SlotNotFound: 404,
  BookingNotFound: 404,
  OperatingRuleNotFound: 404,
  GreenFeeRuleNotFound: 404,

  /** 슬롯에 이미 활성 예약이 있다. 오픈 시각에는 대부분의 요청이 여기로 끝난다. */
  SlotUnavailable: 409,
  SlotTooLate: 409,
  SlotBlocked: 409,
  InvalidStateTransition: 409,
  GreenFeeNotConfigured: 409,
  /** 최고 Priority 요금 규칙이 여러 개라 설정이 충돌했다. */
  GreenFeeRuleConflict: 409,
  DuplicateEmail: 409,
  /** 낙관적 락 충돌 — 확정/취소 사이에 남이 같은 행을 바꿨다. */
  ConcurrencyConflict: 409,

  PaymentDeclined: 402,
  /** 결제 응답이 유실되어 승인 여부를 알 수 없다. 홀드 TTL이 회수한다. */
  PaymentTimeout: 504,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}
