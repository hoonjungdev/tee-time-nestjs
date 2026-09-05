import { Decimal, LocalDate, LocalTime, money, toAmountString, type Result } from '@teetime/shared-kernel';
import { describe, expect, it } from 'vitest';

import {
  quoteGreenFee,
  resolveDayType,
  resolveTimeBand,
  type GreenFeeRuleCandidate,
} from '../src/pricing/green-fee-policy.js';

/**
 * 요금 계산 순수 함수의 단위 테스트.
 *
 * Testcontainers를 쓰지 않는다 — 대상이 DataSource·Repository·Clock을 받지 않는
 * 순수 함수이기 때문이다(docs/conventions.md §9 "단위 — 순수 함수 — 인프라 없음").
 * 규칙은 값으로 주입되므로 GreenFeeRule 엔티티가 없어도 성립한다.
 */

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_COURSE_ID = '99999999-9999-4999-8999-999999999999';

/** 2026-09-07(월) ~ 2026-09-13(일). 요일 판정을 고정하기 위한 실제 한 주다. */
const MONDAY = LocalDate.parse('2026-09-07');
const TUESDAY = LocalDate.parse('2026-09-08');
const WEDNESDAY = LocalDate.parse('2026-09-09');
const THURSDAY = LocalDate.parse('2026-09-10');
const FRIDAY = LocalDate.parse('2026-09-11');
const SATURDAY = LocalDate.parse('2026-09-12');
const SUNDAY = LocalDate.parse('2026-09-13');

/** 어린이날. 2026년에는 화요일에 걸린다. */
const CHILDRENS_DAY = LocalDate.parse('2026-05-05');

function createRule(overrides: Partial<GreenFeeRuleCandidate> = {}): GreenFeeRuleCandidate {
  return {
    id: 'rule-1',
    courseId: COURSE_ID,
    dayType: 'Weekday',
    timeBand: 'Early',
    amount: money('150000.00'),
    currency: 'KRW',
    priority: 0,
    isActive: true,
    ...overrides,
  };
}

/** Result를 좁힌다. 단언이 먼저 실패하므로 아래 throw는 도달 불가 분기다. */
function expectOk<T>(result: Result<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`성공을 기대했다: ${result.error.code} ${result.error.message}`);
  return result.value;
}

function expectFail<T>(result: Result<T>): { readonly code: string; readonly message: string } {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('실패를 기대했다');
  return result.error;
}

describe('resolveDayType', () => {
  it('resolveDayType_월요일_Weekday', () => {
    expect(resolveDayType(MONDAY)).toBe('Weekday');
  });

  it('resolveDayType_화요일_Weekday', () => {
    expect(resolveDayType(TUESDAY)).toBe('Weekday');
  });

  it('resolveDayType_수요일_Weekday', () => {
    expect(resolveDayType(WEDNESDAY)).toBe('Weekday');
  });

  it('resolveDayType_목요일_Weekday', () => {
    expect(resolveDayType(THURSDAY)).toBe('Weekday');
  });

  it('resolveDayType_금요일_Weekday', () => {
    expect(resolveDayType(FRIDAY)).toBe('Weekday');
  });

  it('resolveDayType_토요일_Weekend', () => {
    expect(resolveDayType(SATURDAY)).toBe('Weekend');
  });

  it('resolveDayType_일요일_Weekend', () => {
    expect(resolveDayType(SUNDAY)).toBe('Weekend');
  });

  /**
   * docs/domain.md "알려진 한계 — 공휴일을 반영하지 않는다"를 회귀 방지선으로 고정한다.
   * 공휴일 캘린더가 MVP 범위 밖이므로 평일 공휴일은 주중 요금이 맞다.
   */
  it('resolveDayType_평일에_걸린_공휴일도_Weekday', () => {
    expect(resolveDayType(CHILDRENS_DAY)).toBe('Weekday');
  });
});

describe('resolveTimeBand', () => {
  it('resolveTimeBand_00시00분_Early', () => {
    expect(resolveTimeBand(LocalTime.of(0, 0))).toBe('Early');
  });

  it('resolveTimeBand_08시59분_Early', () => {
    expect(resolveTimeBand(LocalTime.of(8, 59))).toBe('Early');
  });

  it('resolveTimeBand_08시59분59초_Early', () => {
    expect(resolveTimeBand(LocalTime.of(8, 59, 59))).toBe('Early');
  });

  it('resolveTimeBand_09시00분_Mid', () => {
    expect(resolveTimeBand(LocalTime.of(9, 0))).toBe('Mid');
  });

  it('resolveTimeBand_13시59분_Mid', () => {
    expect(resolveTimeBand(LocalTime.of(13, 59))).toBe('Mid');
  });

  it('resolveTimeBand_13시59분59초_Mid', () => {
    expect(resolveTimeBand(LocalTime.of(13, 59, 59))).toBe('Mid');
  });

  it('resolveTimeBand_14시00분_Late', () => {
    expect(resolveTimeBand(LocalTime.of(14, 0))).toBe('Late');
  });

  it('resolveTimeBand_23시59분_Late', () => {
    expect(resolveTimeBand(LocalTime.of(23, 59))).toBe('Late');
  });
});

describe('quoteGreenFee — 정상 조회', () => {
  it('quoteGreenFee_주중_Early_해당_규칙의_금액', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(7, 30),
        rules: [
          createRule({ id: 'weekday-early', amount: money('120000.00') }),
          createRule({ id: 'weekday-mid', timeBand: 'Mid', amount: money('180000.00') }),
          createRule({ id: 'weekend-early', dayType: 'Weekend', amount: money('250000.00') }),
        ],
      }),
    );

    expect(quote.courseId).toBe(COURSE_ID);
    expect(toAmountString(quote.amount)).toBe('120000.00');
  });

  it('quoteGreenFee_주말_Mid_해당_규칙의_금액', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: SATURDAY,
        teeTime: LocalTime.of(9, 0),
        rules: [
          createRule({ id: 'weekday-mid', timeBand: 'Mid', amount: money('180000.00') }),
          createRule({
            id: 'weekend-mid',
            dayType: 'Weekend',
            timeBand: 'Mid',
            amount: money('300000.00'),
          }),
        ],
      }),
    );

    expect(toAmountString(quote.amount)).toBe('300000.00');
  });

  it('quoteGreenFee_주말_Late_해당_규칙의_금액', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: SUNDAY,
        teeTime: LocalTime.of(14, 0),
        rules: [
          createRule({
            id: 'weekend-mid',
            dayType: 'Weekend',
            timeBand: 'Mid',
            amount: money('300000.00'),
          }),
          createRule({
            id: 'weekend-late',
            dayType: 'Weekend',
            timeBand: 'Late',
            amount: money('210000.00'),
          }),
        ],
      }),
    );

    expect(toAmountString(quote.amount)).toBe('210000.00');
  });

  it('quoteGreenFee_currency가_규칙_값으로_전달된다', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [createRule({ currency: 'KRW' })],
      }),
    );

    expect(quote.currency).toBe('KRW');
  });

  /** 금액은 Money(=Decimal)로만 흐른다. number로 비교하지 않는다(CLAUDE.md 절대 규칙 6). */
  it('quoteGreenFee_금액이_Decimal로_반환된다', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [createRule({ amount: money('150000.00') })],
      }),
    );

    expect(quote.amount).toBeInstanceOf(Decimal);
    expect(quote.amount.equals(money('150000.00'))).toBe(true);
  });

  it('quoteGreenFee_소수_둘째자리_금액이_오차없이_보존된다', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [createRule({ amount: money('154900.55') })],
      }),
    );

    expect(toAmountString(quote.amount)).toBe('154900.55');
  });
});

describe('quoteGreenFee — Priority', () => {
  it('quoteGreenFee_Priority_높은_규칙이_이긴다', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [
          createRule({ id: 'base', priority: 0, amount: money('150000.00') }),
          createRule({ id: 'special', priority: 10, amount: money('99000.00') }),
          createRule({ id: 'mid', priority: 5, amount: money('130000.00') }),
        ],
      }),
    );

    expect(toAmountString(quote.amount)).toBe('99000.00');
  });

  it('quoteGreenFee_비활성_규칙은_Priority가_높아도_무시된다', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [
          createRule({ id: 'base', priority: 0, amount: money('150000.00') }),
          createRule({ id: 'retired', priority: 99, amount: money('10.00'), isActive: false }),
        ],
      }),
    );

    expect(toAmountString(quote.amount)).toBe('150000.00');
  });
});

describe('quoteGreenFee — 매칭 규칙 없음', () => {
  it('quoteGreenFee_규칙_없음_GreenFeeNotConfigured', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [],
      }),
    );

    expect(error.code).toBe('GreenFeeNotConfigured');
  });

  it('quoteGreenFee_다른_TimeBand_규칙만_있음_GreenFeeNotConfigured', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [createRule({ timeBand: 'Late' })],
      }),
    );

    expect(error.code).toBe('GreenFeeNotConfigured');
  });

  it('quoteGreenFee_다른_DayType_규칙만_있음_GreenFeeNotConfigured', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [createRule({ dayType: 'Weekend' })],
      }),
    );

    expect(error.code).toBe('GreenFeeNotConfigured');
  });

  /**
   * courseId 필터는 호출자의 WHERE와 의도적으로 중복된다(docs/conventions.md §3).
   * 순수 함수 단독으로도 옳게 동작해야 하므로 여기서 고정한다.
   */
  it('quoteGreenFee_다른_코스의_규칙만_있음_GreenFeeNotConfigured', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [createRule({ courseId: OTHER_COURSE_ID })],
      }),
    );

    expect(error.code).toBe('GreenFeeNotConfigured');
  });

  it('quoteGreenFee_비활성_규칙만_있음_GreenFeeNotConfigured', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [createRule({ isActive: false })],
      }),
    );

    expect(error.code).toBe('GreenFeeNotConfigured');
  });
});

describe('quoteGreenFee — Priority 동점', () => {
  /**
   * 게이트 A 결정(2026-09-05): 동점은 설정 오류이며 GreenFeeRuleConflict(409)다.
   * GreenFeeNotConfigured를 재사용하지 않는다 — 프론트가 errorCode로 분기하므로
   * "규칙 없음"과 "설정 충돌"이 같은 코드로 나가면 안 된다.
   */
  it('quoteGreenFee_최고Priority_동점_2건_GreenFeeRuleConflict', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [
          createRule({ id: 'tie-a', priority: 10, amount: money('150000.00') }),
          createRule({ id: 'tie-b', priority: 10, amount: money('170000.00') }),
        ],
      }),
    );

    expect(error.code).toBe('GreenFeeRuleConflict');
  });

  it('quoteGreenFee_최고Priority_동점_3건_GreenFeeRuleConflict', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: SATURDAY,
        teeTime: LocalTime.of(15, 0),
        rules: [
          createRule({ id: 'tie-a', dayType: 'Weekend', timeBand: 'Late', priority: 7 }),
          createRule({ id: 'tie-b', dayType: 'Weekend', timeBand: 'Late', priority: 7 }),
          createRule({ id: 'tie-c', dayType: 'Weekend', timeBand: 'Late', priority: 7 }),
          createRule({ id: 'lower', dayType: 'Weekend', timeBand: 'Late', priority: 1 }),
        ],
      }),
    );

    expect(error.code).toBe('GreenFeeRuleConflict');
    expect(error.message).toMatch(/\b3\b/);
  });

  it('quoteGreenFee_하위_Priority_동점은_충돌이_아니다', () => {
    const quote = expectOk(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [
          createRule({ id: 'winner', priority: 10, amount: money('99000.00') }),
          createRule({ id: 'tie-a', priority: 1, amount: money('150000.00') }),
          createRule({ id: 'tie-b', priority: 1, amount: money('170000.00') }),
        ],
      }),
    );

    expect(toAmountString(quote.amount)).toBe('99000.00');
  });

  /** 실패 메시지에 courseId · dayType · timeBand · 충돌 건수가 담긴다(게이트 A 결정). */
  it('quoteGreenFee_동점_실패메시지에_courseId_dayType_timeBand_건수가_담긴다', () => {
    const error = expectFail(
      quoteGreenFee({
        courseId: COURSE_ID,
        teeDate: MONDAY,
        teeTime: LocalTime.of(8, 0),
        rules: [
          createRule({ id: 'tie-a', priority: 10 }),
          createRule({ id: 'tie-b', priority: 10 }),
        ],
      }),
    );

    expect(error.message).toContain(COURSE_ID);
    expect(error.message).toContain('Weekday');
    expect(error.message).toContain('Early');
    expect(error.message).toMatch(/\b2\b/);
  });
});
