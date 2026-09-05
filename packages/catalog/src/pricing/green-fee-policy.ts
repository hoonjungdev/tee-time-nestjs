import {
  DayOfWeek,
  LocalTime,
  fail,
  ok,
  type LocalDate,
  type Money,
  type Result,
} from '@teetime/shared-kernel';
import type { GreenFeeQuote } from '@teetime/catalog-contracts';

export type DayType = 'Weekday' | 'Weekend';

export type TimeBand = 'Early' | 'Mid' | 'Late';

const MID_BAND_START = LocalTime.of(9, 0);
const LATE_BAND_START = LocalTime.of(14, 0);

export type GreenFeeRuleCandidate = {
  readonly id: string;
  readonly courseId: string;
  readonly dayType: DayType;
  readonly timeBand: TimeBand;
  readonly amount: Money;
  readonly currency: string;
  readonly priority: number;
  readonly isActive: boolean;
};

export function resolveDayType(teeDate: LocalDate): DayType {
  const dayOfWeek = teeDate.dayOfWeek();
  return dayOfWeek === DayOfWeek.SATURDAY || dayOfWeek === DayOfWeek.SUNDAY ? 'Weekend' : 'Weekday';
}

export function resolveTimeBand(teeTime: LocalTime): TimeBand {
  if (teeTime.isBefore(MID_BAND_START)) return 'Early';
  if (teeTime.isBefore(LATE_BAND_START)) return 'Mid';
  return 'Late';
}

export function quoteGreenFee(input: {
  readonly courseId: string;
  readonly teeDate: LocalDate;
  readonly teeTime: LocalTime;
  readonly rules: readonly GreenFeeRuleCandidate[];
}): Result<GreenFeeQuote> {
  const dayType = resolveDayType(input.teeDate);
  const timeBand = resolveTimeBand(input.teeTime);
  const matchingRules = input.rules.filter(
    (rule) =>
      rule.isActive &&
      rule.courseId === input.courseId &&
      rule.dayType === dayType &&
      rule.timeBand === timeBand,
  );

  const [firstRule, ...remainingRules] = matchingRules;
  if (firstRule === undefined) {
    return fail('GreenFeeNotConfigured', '매칭되는 GreenFeeRule이 없다.');
  }

  const highestPriority = remainingRules.reduce(
    (highest, rule) => Math.max(highest, rule.priority),
    firstRule.priority,
  );
  const winningRules = matchingRules.filter((rule) => rule.priority === highestPriority);
  const [winner, ...conflictingRules] = winningRules;

  if (winner === undefined) {
    throw new Error('도달 불가: 최고 Priority 요금 규칙이 없다.');
  }
  if (conflictingRules.length > 0) {
    return fail(
      'GreenFeeRuleConflict',
      `GreenFeeRule Priority 충돌: courseId=${input.courseId}, dayType=${dayType}, timeBand=${timeBand}, count=${winningRules.length}`,
    );
  }

  return ok({
    courseId: input.courseId,
    amount: winner.amount,
    currency: winner.currency,
  });
}
