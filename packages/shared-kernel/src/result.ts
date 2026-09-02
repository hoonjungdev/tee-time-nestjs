import type { ErrorCode } from './error-codes.js';

/**
 * 예상된 실패를 값으로 표현한다.
 *
 * "이미 점유된 슬롯"은 예외가 아니라 정상 흐름의 결과다. throw로 처리하면
 * V8이 매 요청마다 스택을 캡처하고, 정상 트래픽이 에러 로그를 오염시킨다.
 * 근거는 docs/conventions.md §1.
 */
export type DomainError = {
  readonly code: ErrorCode;
  readonly message: string;
};

export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DomainError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

/** 실패를 다른 성공 타입으로 옮긴다. 핸들러가 하위 결과를 그대로 전파할 때 쓴다. */
export function propagate<T>(error: DomainError): Result<T> {
  return { ok: false, error };
}

export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}
