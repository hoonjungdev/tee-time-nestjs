import type { LocalDate, LocalTime, Result } from '@teetime/shared-kernel';

import type { CourseSnapshot } from './course-snapshot.js';
import type { GreenFeeQuote } from './green-fee-quote.js';
import type { OperatingDaySnapshot } from './operating-day-snapshot.js';

/** 모듈 경계를 넘는 읽기 계약이자 DI 토큰. */
export abstract class CatalogApi {
  abstract getCourse(courseId: string): Promise<Result<CourseSnapshot>>;
  abstract quoteGreenFee(
    courseId: string,
    teeDate: LocalDate,
    teeTime: LocalTime,
  ): Promise<Result<GreenFeeQuote>>;
  abstract getOperatingDays(
    courseId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<Result<readonly OperatingDaySnapshot[]>>;
}
