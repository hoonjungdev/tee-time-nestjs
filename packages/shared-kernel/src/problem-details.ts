import { httpStatusFor, type ErrorCode } from './error-codes.js';
import type { DomainError } from './result.js';

/**
 * RFC 9457. 프론트가 `errorCode`로 분기하므로 확장 필드에 반드시 넣는다.
 * `traceId`는 서버 로그와 응답을 잇는 유일한 끈이다.
 */
export type ProblemDetails = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly errorCode: ErrorCode;
  readonly traceId: string;
};

export function toProblemDetails(error: DomainError, traceId: string): ProblemDetails {
  const status = httpStatusFor(error.code);

  return {
    type: `https://teetime.local/errors/${error.code}`,
    title: error.code,
    status,
    detail: error.message,
    errorCode: error.code,
    traceId,
  };
}
