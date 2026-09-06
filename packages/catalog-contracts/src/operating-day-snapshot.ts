import type { LocalDate, LocalTime } from '@teetime/shared-kernel';

/** 활성 OperatingRule이 있는 날짜의 영업 정보. 규칙이 없으면 휴장이다. */
export type OperatingDaySnapshot = {
  readonly courseId: string;
  readonly date: LocalDate;
  readonly openTime: LocalTime;
  readonly closeTime: LocalTime;
  readonly intervalMinutes: number;
};
