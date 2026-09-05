import '@js-joda/timezone';

export {
  ChronoUnit,
  DateTimeFormatter,
  DayOfWeek,
  Duration,
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  ZoneId,
  ZonedDateTime,
} from '@js-joda/core';

import { Instant, ZoneId } from '@js-joda/core';

/**
 * 시간을 주입 가능한 의존성으로 만든다.
 *
 * 추상 클래스인 이유는 NestJS DI 토큰이 런타임 값이어야 하기 때문이다.
 * 인터페이스는 컴파일 후 사라져 토큰이 될 수 없다.
 * 테스트는 이것을 고정 시각 구현으로 교체해 만료·리드타임 경로를 결정적으로 검증한다.
 */
export abstract class Clock {
  abstract now(): Instant;
}

export class SystemClock extends Clock {
  override now(): Instant {
    return Instant.now();
  }
}

/** IANA 시간대 식별자인지 판정한다. */
export function isValidZoneId(value: string): boolean {
  try {
    ZoneId.of(value);
    return true;
  } catch {
    return false;
  }
}
