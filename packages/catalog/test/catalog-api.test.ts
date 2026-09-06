import { CatalogApi } from '@teetime/catalog-contracts';
import { Decimal, LocalDate, LocalTime } from '@teetime/shared-kernel';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CreateClubRequest } from '../src/features/create-club/create-club.contracts.js';
import { CreateClubHandler } from '../src/features/create-club/create-club.handler.js';
import { CreateCourseRequest } from '../src/features/create-course/create-course.contracts.js';
import { CreateCourseHandler } from '../src/features/create-course/create-course.handler.js';
import { CreateGreenFeeRuleRequest } from '../src/features/create-green-fee-rule/create-green-fee-rule.contracts.js';
import { CreateGreenFeeRuleHandler } from '../src/features/create-green-fee-rule/create-green-fee-rule.handler.js';
import { CreateOperatingRuleRequest } from '../src/features/create-operating-rule/create-operating-rule.contracts.js';
import { CreateOperatingRuleHandler } from '../src/features/create-operating-rule/create-operating-rule.handler.js';
import { UpdateClubHandler } from '../src/features/update-club/update-club.handler.js';
import { UpdateGreenFeeRuleHandler } from '../src/features/update-green-fee-rule/update-green-fee-rule.handler.js';
import { UpdateOperatingRuleHandler } from '../src/features/update-operating-rule/update-operating-rule.handler.js';
import type { DayType, TimeBand } from '../src/pricing/green-fee-policy.js';
import {
  startCatalogTestContext,
  stopCatalogTestContext,
  truncateCatalogTables,
  type CatalogTestContext,
} from './support/postgres-catalog.js';

const MISSING_COURSE_ID = 'c7cc3024-c3fe-42d5-b3d7-bc726b29d922';

// 요일이 고정된 날짜를 쓴다. "오늘"에 의존하면 주말 경계 테스트가 달력에 따라 흔들린다.
const MONDAY = LocalDate.parse('2026-09-07');
const WEDNESDAY = LocalDate.parse('2026-09-09');
const FRIDAY = LocalDate.parse('2026-09-11');
const SATURDAY = LocalDate.parse('2026-09-12');
const SUNDAY = LocalDate.parse('2026-09-13');

// TimeBand 경계는 green-fee-policy.ts에 있다: Early < 09:00 <= Mid < 14:00 <= Late
const EARLY_TIME = LocalTime.of(7, 30);
const MID_TIME = LocalTime.of(10, 0);

let context: CatalogTestContext;
let dataSource: CatalogTestContext['dataSource'];
let app: CatalogTestContext['app'];

type SeededCourse = {
  readonly clubId: string;
  readonly courseId: string;
};

async function seedCourse(input?: {
  readonly clubName?: string;
  readonly timeZone?: string;
}): Promise<SeededCourse> {
  const clubRequest = new CreateClubRequest();
  clubRequest.name = input?.clubName ?? '테스트 클럽';
  clubRequest.region = '서울';
  clubRequest.timeZone = input?.timeZone ?? 'Asia/Seoul';
  clubRequest.address = null;
  const club = await app.get(CreateClubHandler).handle(clubRequest);
  if (!club.ok) throw new Error('Club 생성이 실패했다.');

  const courseRequest = new CreateCourseRequest();
  courseRequest.clubId = club.value.clubId;
  courseRequest.name = '테스트 코스';
  const course = await app.get(CreateCourseHandler).handle(courseRequest);
  if (!course.ok) throw new Error('Course 생성이 실패했다.');

  return { clubId: club.value.clubId, courseId: course.value.courseId };
}

async function createOperatingRule(input: {
  readonly courseId: string;
  readonly dayType: DayType;
  readonly openTime?: string;
  readonly closeTime?: string;
  readonly intervalMinutes?: number;
}): Promise<string> {
  const request = new CreateOperatingRuleRequest();
  request.courseId = input.courseId;
  request.dayType = input.dayType;
  request.openTime = input.openTime ?? '06:00';
  request.closeTime = input.closeTime ?? '18:00';
  request.intervalMinutes = input.intervalMinutes ?? 7;

  const created = await app.get(CreateOperatingRuleHandler).handle(request);
  if (!created.ok) throw new Error(`OperatingRule 생성이 실패했다: ${created.error.code}`);

  return created.value.operatingRuleId;
}

async function createGreenFeeRule(input: {
  readonly courseId: string;
  readonly dayType: DayType;
  readonly timeBand: TimeBand;
  readonly amount: string;
  readonly priority?: number;
}): Promise<string> {
  const request = new CreateGreenFeeRuleRequest();
  request.courseId = input.courseId;
  request.dayType = input.dayType;
  request.timeBand = input.timeBand;
  request.amount = input.amount;
  if (input.priority !== undefined) request.priority = input.priority;

  const created = await app.get(CreateGreenFeeRuleHandler).handle(request);
  if (!created.ok) throw new Error(`GreenFeeRule 생성이 실패했다: ${created.error.code}`);

  return created.value.greenFeeRuleId;
}

// 전역 testTimeout이 30초라 컨테이너 기동 타임아웃을 반드시 명시한다.
beforeAll(async () => {
  context = await startCatalogTestContext();
  dataSource = context.dataSource;
  app = context.app;
}, 180_000);

afterEach(async () => {
  await truncateCatalogTables(dataSource);
});

afterAll(async () => {
  await stopCatalogTestContext(context);
});

describe('CatalogApi.getCourse', () => {
  it('getCourse_존재하지_않는_코스_CourseNotFound', async () => {
    const result = await app.get(CatalogApi).getCourse(MISSING_COURSE_ID);
    expect(result).toMatchObject({ ok: false, error: { code: 'CourseNotFound' } });
  });

  it('getCourse_성공_timeZone이_클럽에서_온다', async () => {
    const seeded = await seedCourse({ timeZone: 'Asia/Seoul' });

    const result = await app.get(CatalogApi).getCourse(seeded.courseId);
    expect(result).toMatchObject({
      ok: true,
      value: {
        courseId: seeded.courseId,
        clubId: seeded.clubId,
        name: '테스트 코스',
        holeCount: 18,
        isActive: true,
        timeZone: 'Asia/Seoul',
      },
    });
  });

  it('getCourse_클럽이_비활성_isActive가_false', async () => {
    // isActive는 course.isActive && club.isActive를 접은 값이다. 소비자는 이 하나만 본다.
    const seeded = await seedCourse();
    await app.get(UpdateClubHandler).handle(seeded.clubId, { isActive: false });

    const result = await app.get(CatalogApi).getCourse(seeded.courseId);
    expect(result).toMatchObject({ ok: true, value: { isActive: false } });
  });
});

describe('CatalogApi.quoteGreenFee', () => {
  it('quoteGreenFee_존재하지_않는_코스_CourseNotFound', async () => {
    const result = await app.get(CatalogApi).quoteGreenFee(MISSING_COURSE_ID, MONDAY, EARLY_TIME);
    expect(result).toMatchObject({ ok: false, error: { code: 'CourseNotFound' } });
  });

  it('quoteGreenFee_주중_Early_해당_규칙의_금액', async () => {
    const seeded = await seedCourse();
    await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '120000.00',
    });

    const result = await app.get(CatalogApi).quoteGreenFee(seeded.courseId, MONDAY, EARLY_TIME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.courseId).toBe(seeded.courseId);
    expect(result.value.currency).toBe('KRW');
    expect(result.value.amount).toBeInstanceOf(Decimal);
    expect(result.value.amount.toFixed(2)).toBe('120000.00');
  });

  it('quoteGreenFee_주말_Mid_주말규칙이_선택된다', async () => {
    // DayType × TimeBand 두 축이 실제로 동작하는지 본다.
    const seeded = await seedCourse();
    await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      timeBand: 'Mid',
      amount: '130000.00',
    });
    await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekend',
      timeBand: 'Mid',
      amount: '210000.00',
    });

    const result = await app.get(CatalogApi).quoteGreenFee(seeded.courseId, SATURDAY, MID_TIME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount.toFixed(2)).toBe('210000.00');
  });

  it('quoteGreenFee_매칭_규칙_없음_GreenFeeNotConfigured', async () => {
    const seeded = await seedCourse();
    await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '120000.00',
    });

    const result = await app.get(CatalogApi).quoteGreenFee(seeded.courseId, SUNDAY, MID_TIME);
    expect(result).toMatchObject({ ok: false, error: { code: 'GreenFeeNotConfigured' } });
  });

  it('quoteGreenFee_최고priority_동점_GreenFeeRuleConflict', async () => {
    const seeded = await seedCourse();
    for (const amount of ['120000.00', '125000.00']) {
      await createGreenFeeRule({
        courseId: seeded.courseId,
        dayType: 'Weekday',
        timeBand: 'Early',
        amount,
        priority: 5,
      });
    }

    const result = await app.get(CatalogApi).quoteGreenFee(seeded.courseId, MONDAY, EARLY_TIME);
    expect(result).toMatchObject({ ok: false, error: { code: 'GreenFeeRuleConflict' } });
  });

  it('quoteGreenFee_priority가_높은_규칙이_이긴다', async () => {
    const seeded = await seedCourse();
    await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '120000.00',
      priority: 0,
    });
    await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '99000.00',
      priority: 10,
    });

    const result = await app.get(CatalogApi).quoteGreenFee(seeded.courseId, MONDAY, EARLY_TIME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount.toFixed(2)).toBe('99000.00');
  });

  it('quoteGreenFee_비활성_규칙은_무시된다', async () => {
    const seeded = await seedCourse();
    const winningId = await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '99000.00',
      priority: 10,
    });
    await createGreenFeeRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '120000.00',
      priority: 0,
    });
    await app.get(UpdateGreenFeeRuleHandler).handle(winningId, { isActive: false });

    const result = await app.get(CatalogApi).quoteGreenFee(seeded.courseId, MONDAY, EARLY_TIME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount.toFixed(2)).toBe('120000.00');
  });
});

describe('CatalogApi.getOperatingDays', () => {
  it('getOperatingDays_존재하지_않는_코스_CourseNotFound', async () => {
    const result = await app.get(CatalogApi).getOperatingDays(MISSING_COURSE_ID, MONDAY, FRIDAY);
    expect(result).toMatchObject({ ok: false, error: { code: 'CourseNotFound' } });
  });

  it('getOperatingDays_from이_to보다_뒤_InvalidRequest', async () => {
    const seeded = await seedCourse();
    const result = await app.get(CatalogApi).getOperatingDays(seeded.courseId, FRIDAY, MONDAY);
    expect(result).toMatchObject({ ok: false, error: { code: 'InvalidRequest' } });
  });

  it('getOperatingDays_범위가_366일_초과_InvalidRequest', async () => {
    const seeded = await seedCourse();
    const from = LocalDate.parse('2026-01-01');
    const result = await app
      .get(CatalogApi)
      .getOperatingDays(seeded.courseId, from, from.plusDays(367));
    expect(result).toMatchObject({ ok: false, error: { code: 'InvalidRequest' } });
  });

  it('getOperatingDays_주중규칙만_있으면_주말은_결과에서_빠진다', async () => {
    // 활성 OperatingRule이 없는 dayType의 날짜는 애초에 생성되지 않는다(= 휴장).
    const seeded = await seedCourse();
    await createOperatingRule({
      courseId: seeded.courseId,
      dayType: 'Weekday',
      openTime: '06:00',
      closeTime: '18:00',
      intervalMinutes: 7,
    });

    const result = await app.get(CatalogApi).getOperatingDays(seeded.courseId, MONDAY, SUNDAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((day) => day.date.toString())).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ]);
    expect(result.value[0]).toMatchObject({
      courseId: seeded.courseId,
      intervalMinutes: 7,
    });
    expect(result.value[0]?.openTime.equals(LocalTime.of(6, 0))).toBe(true);
    expect(result.value[0]?.closeTime.equals(LocalTime.of(18, 0))).toBe(true);
  });

  it('getOperatingDays_from과_to_경계일이_포함된다', async () => {
    const seeded = await seedCourse();
    await createOperatingRule({ courseId: seeded.courseId, dayType: 'Weekday' });

    const result = await app.get(CatalogApi).getOperatingDays(seeded.courseId, MONDAY, WEDNESDAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((day) => day.date.toString())).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  it('getOperatingDays_비활성_규칙은_휴장으로_취급된다', async () => {
    const seeded = await seedCourse();
    await createOperatingRule({ courseId: seeded.courseId, dayType: 'Weekday' });
    const weekendId = await createOperatingRule({
      courseId: seeded.courseId,
      dayType: 'Weekend',
    });
    await app.get(UpdateOperatingRuleHandler).handle(weekendId, { isActive: false });

    const result = await app.get(CatalogApi).getOperatingDays(seeded.courseId, SATURDAY, SUNDAY);
    expect(result).toMatchObject({ ok: true, value: [] });
  });
});
