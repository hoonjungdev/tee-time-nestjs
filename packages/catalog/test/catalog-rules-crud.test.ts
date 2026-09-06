import { BadRequestException, ValidationPipe, type Type } from '@nestjs/common';
import { Decimal, LocalTime } from '@teetime/shared-kernel';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CreateClubRequest } from '../src/features/create-club/create-club.contracts.js';
import { CreateClubHandler } from '../src/features/create-club/create-club.handler.js';
import { CreateCourseRequest } from '../src/features/create-course/create-course.contracts.js';
import { CreateCourseHandler } from '../src/features/create-course/create-course.handler.js';
import { CreateGreenFeeRuleRequest } from '../src/features/create-green-fee-rule/create-green-fee-rule.contracts.js';
import { CreateGreenFeeRuleHandler } from '../src/features/create-green-fee-rule/create-green-fee-rule.handler.js';
import { CreateOperatingRuleRequest } from '../src/features/create-operating-rule/create-operating-rule.contracts.js';
import { CreateOperatingRuleHandler } from '../src/features/create-operating-rule/create-operating-rule.handler.js';
import { ListGreenFeeRulesHandler } from '../src/features/list-green-fee-rules/list-green-fee-rules.handler.js';
import { ListOperatingRulesHandler } from '../src/features/list-operating-rules/list-operating-rules.handler.js';
import { UpdateGreenFeeRuleRequest } from '../src/features/update-green-fee-rule/update-green-fee-rule.contracts.js';
import { UpdateGreenFeeRuleHandler } from '../src/features/update-green-fee-rule/update-green-fee-rule.handler.js';
import { UpdateOperatingRuleRequest } from '../src/features/update-operating-rule/update-operating-rule.contracts.js';
import { UpdateOperatingRuleHandler } from '../src/features/update-operating-rule/update-operating-rule.handler.js';
import { GreenFeeRuleEntity } from '../src/persistence/green-fee-rule.entity.js';
import { OperatingRuleEntity } from '../src/persistence/operating-rule.entity.js';
import {
  startCatalogTestContext,
  stopCatalogTestContext,
  truncateCatalogTables,
  type CatalogTestContext,
} from './support/postgres-catalog.js';

const MISSING_COURSE_ID = 'c7cc3024-c3fe-42d5-b3d7-bc726b29d922';
const MISSING_RULE_ID = '2f6cbbbf-2b6e-4a4c-8a0f-8f2c1d0f7a11';

let context: CatalogTestContext;
let dataSource: CatalogTestContext['dataSource'];
let app: CatalogTestContext['app'];

/**
 * 형식 검증(class-validator)은 **실제 `ValidationPipe`를 거쳐야** 증명된다.
 * 핸들러를 직접 부르면 파이프가 돌지 않아 `@IsIn`·`@Matches`가 아무것도 막지 않는다
 * → docs/conventions.md §3
 *
 * 옵션은 `apps/api/src/main.ts`의 전역 파이프와 같은 값이다.
 */
const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

async function transformBody<T extends object>(
  metatype: Type<T>,
  payload: Record<string, unknown>,
): Promise<T> {
  const transformed: unknown = await validationPipe.transform(payload, { type: 'body', metatype });
  return transformed as T;
}

/** 형식 검증 실패는 `BadRequestException`(400)이고, 400은 `InvalidRequest`로 나간다. */
async function expectInvalidRequest<T extends object>(
  metatype: Type<T>,
  payload: Record<string, unknown>,
): Promise<void> {
  await expect(transformBody(metatype, payload)).rejects.toBeInstanceOf(BadRequestException);
}

async function seedCourse(clubName = '테스트 클럽'): Promise<string> {
  const clubRequest = new CreateClubRequest();
  clubRequest.name = clubName;
  clubRequest.region = '서울';
  clubRequest.timeZone = 'Asia/Seoul';
  clubRequest.address = null;
  const club = await app.get(CreateClubHandler).handle(clubRequest);
  if (!club.ok) throw new Error('Club 생성이 실패했다.');

  const courseRequest = new CreateCourseRequest();
  courseRequest.clubId = club.value.clubId;
  courseRequest.name = '테스트 코스';
  const course = await app.get(CreateCourseHandler).handle(courseRequest);
  if (!course.ok) throw new Error('Course 생성이 실패했다.');

  return course.value.courseId;
}

async function createOperatingRule(input: {
  readonly courseId: string;
  readonly dayType?: string;
  readonly openTime?: string;
  readonly closeTime?: string;
  readonly intervalMinutes?: number;
}): Promise<string> {
  const request = await transformBody(CreateOperatingRuleRequest, {
    courseId: input.courseId,
    dayType: input.dayType ?? 'Weekday',
    openTime: input.openTime ?? '06:00',
    closeTime: input.closeTime ?? '18:00',
    intervalMinutes: input.intervalMinutes ?? 7,
  });
  const created = await app.get(CreateOperatingRuleHandler).handle(request);
  if (!created.ok) throw new Error(`OperatingRule 생성이 실패했다: ${created.error.code}`);

  return created.value.operatingRuleId;
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

describe('OperatingRule / GreenFeeRule 마이그레이션', () => {
  it('migration_빈DB에_적용_operating_rules와_green_fee_rules가_생성된다', async () => {
    const rows: Array<{ readonly relation: string | null }> = await dataSource.query(`
      SELECT to_regclass('catalog.operating_rules') AS relation
      UNION ALL SELECT to_regclass('catalog.green_fee_rules')
    `);
    expect(rows.map((row) => row.relation)).toEqual([
      'catalog.operating_rules',
      'catalog.green_fee_rules',
    ]);
  });

  it('migration_ux_oprule이_부분_유니크_인덱스로_존재한다', async () => {
    const rows: Array<{ readonly indexdef: string }> = await dataSource.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'catalog' AND indexname = 'ux_oprule'
    `);
    const indexdef = rows[0]?.indexdef ?? '';
    expect(indexdef).toContain('CREATE UNIQUE INDEX');
    expect(indexdef).toContain('course_id');
    expect(indexdef).toContain('day_type');
    expect(indexdef).toContain('WHERE is_active');
  });

  it('migration_ix_fee_lookup에_priority_DESC와_부분조건이_있다', async () => {
    const rows: Array<{ readonly indexdef: string }> = await dataSource.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'catalog' AND indexname = 'ix_fee_lookup'
    `);
    const indexdef = rows[0]?.indexdef ?? '';
    expect(indexdef).toContain('course_id');
    expect(indexdef).toContain('day_type');
    expect(indexdef).toContain('time_band');
    expect(indexdef).toContain('priority DESC');
    expect(indexdef).toContain('WHERE is_active');
  });

  it('migration_두_테이블의_course_id_외래키가_존재한다', async () => {
    const rows: Array<{ readonly relation: string; readonly definition: string }> =
      await dataSource.query(`
        SELECT conrelid::regclass::text AS relation, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid IN ('catalog.operating_rules'::regclass, 'catalog.green_fee_rules'::regclass)
          AND contype = 'f'
        ORDER BY relation
      `);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.definition).toContain('FOREIGN KEY (course_id) REFERENCES catalog.courses(id)');
    }
  });

  it('migration_재실행시_적용건수_0', async () => {
    expect(await dataSource.runMigrations()).toEqual([]);
  });
});

describe('OperatingRule 어드민 CRUD', () => {
  it('updateOperatingRule_openTime과_intervalMinutes_변경후_LocalTime으로_복원된다', async () => {
    const courseId = await seedCourse();
    const operatingRuleId = await createOperatingRule({ courseId });
    const request = await transformBody(UpdateOperatingRuleRequest, {
      openTime: '07:15',
      intervalMinutes: 10,
    });

    const updated = await app.get(UpdateOperatingRuleHandler).handle(operatingRuleId, request);
    expect(updated).toMatchObject({
      ok: true,
      value: { openTime: '07:15', intervalMinutes: 10 },
    });
    const rule = await dataSource
      .getRepository(OperatingRuleEntity)
      .findOneByOrFail({ id: operatingRuleId });
    expect(rule.openTime).toBeInstanceOf(LocalTime);
    expect(rule.openTime.equals(LocalTime.of(7, 15))).toBe(true);
    expect(rule.intervalMinutes).toBe(10);
  });

  it('createOperatingRule_존재하지_않는_코스_CourseNotFound', async () => {
    const request = await transformBody(CreateOperatingRuleRequest, {
      courseId: MISSING_COURSE_ID,
      dayType: 'Weekday',
      openTime: '06:00',
      closeTime: '18:00',
      intervalMinutes: 7,
    });
    const result = await app.get(CreateOperatingRuleHandler).handle(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'CourseNotFound' } });
  });

  it('createOperatingRule_같은_코스와_dayType_활성규칙_중복_OperatingRuleConflict', async () => {
    const courseId = await seedCourse();
    await createOperatingRule({ courseId, dayType: 'Weekday' });

    const request = await transformBody(CreateOperatingRuleRequest, {
      courseId,
      dayType: 'Weekday',
      openTime: '07:00',
      closeTime: '19:00',
      intervalMinutes: 8,
    });
    const result = await app.get(CreateOperatingRuleHandler).handle(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'OperatingRuleConflict' } });
  });

  it('createOperatingRule_기존규칙을_비활성화한_뒤_재생성_성공', async () => {
    const courseId = await seedCourse();
    const firstId = await createOperatingRule({ courseId, dayType: 'Weekday' });
    await app.get(UpdateOperatingRuleHandler).handle(firstId, { isActive: false });

    // ux_oprule은 is_active인 행만 본다. 부분 인덱스라는 사실을 이 테스트가 고정한다.
    const request = await transformBody(CreateOperatingRuleRequest, {
      courseId,
      dayType: 'Weekday',
      openTime: '07:00',
      closeTime: '19:00',
      intervalMinutes: 8,
    });
    expect(await app.get(CreateOperatingRuleHandler).handle(request)).toMatchObject({ ok: true });
  });

  it('createOperatingRule_openTime이_closeTime_이후_InvalidRequest', async () => {
    const courseId = await seedCourse();
    const request = await transformBody(CreateOperatingRuleRequest, {
      courseId,
      dayType: 'Weekday',
      openTime: '18:00',
      closeTime: '06:00',
      intervalMinutes: 7,
    });
    const result = await app.get(CreateOperatingRuleHandler).handle(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'InvalidRequest' } });
  });

  it('createOperatingRule_intervalMinutes_0또는_61_InvalidRequest', async () => {
    const base = {
      courseId: MISSING_COURSE_ID,
      dayType: 'Weekday',
      openTime: '06:00',
      closeTime: '18:00',
    };
    await expectInvalidRequest(CreateOperatingRuleRequest, { ...base, intervalMinutes: 0 });
    await expectInvalidRequest(CreateOperatingRuleRequest, { ...base, intervalMinutes: 61 });
  });

  it('createOperatingRule_dayType_누락_InvalidRequest', async () => {
    await expectInvalidRequest(CreateOperatingRuleRequest, {
      courseId: MISSING_COURSE_ID,
      openTime: '06:00',
      closeTime: '18:00',
      intervalMinutes: 7,
    });
  });

  it('createOperatingRule_시각_왕복_LocalTime으로_복원된다', async () => {
    const courseId = await seedCourse();
    const operatingRuleId = await createOperatingRule({
      courseId,
      openTime: '06:00',
      closeTime: '18:30',
    });

    const rule = await dataSource
      .getRepository(OperatingRuleEntity)
      .findOneByOrFail({ id: operatingRuleId });
    expect(rule.openTime).toBeInstanceOf(LocalTime);
    expect(rule.closeTime).toBeInstanceOf(LocalTime);
    expect(rule.openTime.equals(LocalTime.of(6, 0))).toBe(true);
    expect(rule.closeTime.equals(LocalTime.of(18, 30))).toBe(true);
  });

  it('updateOperatingRule_존재하지_않는_규칙_OperatingRuleNotFound', async () => {
    const result = await app
      .get(UpdateOperatingRuleHandler)
      .handle(MISSING_RULE_ID, { isActive: false });
    expect(result).toMatchObject({ ok: false, error: { code: 'OperatingRuleNotFound' } });
  });

  it('updateOperatingRule_dayType을_기존_활성규칙과_같게_변경_OperatingRuleConflict', async () => {
    const courseId = await seedCourse();
    await createOperatingRule({ courseId, dayType: 'Weekday' });
    const weekendId = await createOperatingRule({ courseId, dayType: 'Weekend' });

    const result = await app
      .get(UpdateOperatingRuleHandler)
      .handle(weekendId, { dayType: 'Weekday' });
    expect(result).toMatchObject({ ok: false, error: { code: 'OperatingRuleConflict' } });
  });

  it('updateOperatingRule_동시_재활성화_한쪽만_성공하고_나머지는_OperatingRuleConflict', async () => {
    const courseId = await seedCourse();
    const firstId = await createOperatingRule({ courseId, dayType: 'Weekday' });
    await app.get(UpdateOperatingRuleHandler).handle(firstId, { isActive: false });
    const secondId = await createOperatingRule({ courseId, dayType: 'Weekday' });
    await app.get(UpdateOperatingRuleHandler).handle(secondId, { isActive: false });

    // 둘 다 비활성이므로 선조회는 양쪽 다 통과한다. 최종 방어선은 ux_oprule이고,
    // 23505를 Result로 변환하지 않으면 한쪽이 500으로 샌다 → docs/conventions.md §1
    const results = await Promise.all([
      app.get(UpdateOperatingRuleHandler).handle(firstId, { isActive: true }),
      app.get(UpdateOperatingRuleHandler).handle(secondId, { isActive: true }),
    ]);

    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ ok: false, error: { code: 'OperatingRuleConflict' } });
  });

  it('listOperatingRules_비활성_규칙은_기본_조회에서_제외된다', async () => {
    const courseId = await seedCourse();
    const operatingRuleId = await createOperatingRule({ courseId });
    await app.get(UpdateOperatingRuleHandler).handle(operatingRuleId, { isActive: false });

    expect(await app.get(ListOperatingRulesHandler).handle({})).toMatchObject({
      ok: true,
      value: [],
    });
  });

  it('listOperatingRules_courseId로_필터된다', async () => {
    const firstCourseId = await seedCourse('첫 클럽');
    const secondCourseId = await seedCourse('둘째 클럽');
    await createOperatingRule({ courseId: firstCourseId });
    await createOperatingRule({ courseId: secondCourseId });

    expect(
      await app.get(ListOperatingRulesHandler).handle({ courseId: firstCourseId }),
    ).toMatchObject({ ok: true, value: [{ courseId: firstCourseId }] });
  });
});

describe('GreenFeeRule 어드민 CRUD', () => {
  it('updateGreenFeeRule_amount_변경후_Decimal로_복원되고_소수2자리가_보존된다', async () => {
    const courseId = await seedCourse();
    const created = await app.get(CreateGreenFeeRuleHandler).handle(
      await transformBody(CreateGreenFeeRuleRequest, {
        courseId,
        dayType: 'Weekday',
        timeBand: 'Early',
        amount: '150000.00',
      }),
    );
    if (!created.ok) throw new Error(`GreenFeeRule 생성이 실패했다: ${created.error.code}`);
    const request = await transformBody(UpdateGreenFeeRuleRequest, { amount: '98765.43' });

    const updated = await app
      .get(UpdateGreenFeeRuleHandler)
      .handle(created.value.greenFeeRuleId, request);
    expect(updated).toMatchObject({ ok: true, value: { amount: '98765.43' } });
    const rule = await dataSource
      .getRepository(GreenFeeRuleEntity)
      .findOneByOrFail({ id: created.value.greenFeeRuleId });
    expect(rule.amount).toBeInstanceOf(Decimal);
    expect(rule.amount.toFixed(2)).toBe('98765.43');
  });

  it('createGreenFeeRule_존재하지_않는_코스_CourseNotFound', async () => {
    const request = await transformBody(CreateGreenFeeRuleRequest, {
      courseId: MISSING_COURSE_ID,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '150000.00',
    });
    const result = await app.get(CreateGreenFeeRuleHandler).handle(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'CourseNotFound' } });
  });

  it('createGreenFeeRule_금액_왕복_Decimal로_복원되고_소수2자리가_보존된다', async () => {
    const courseId = await seedCourse();
    const request = await transformBody(CreateGreenFeeRuleRequest, {
      courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '150000.05',
    });
    const created = await app.get(CreateGreenFeeRuleHandler).handle(request);
    if (!created.ok) throw new Error(`GreenFeeRule 생성이 실패했다: ${created.error.code}`);
    expect(created.value.amount).toBe('150000.05');

    const rule = await dataSource
      .getRepository(GreenFeeRuleEntity)
      .findOneByOrFail({ id: created.value.greenFeeRuleId });
    expect(rule.amount).toBeInstanceOf(Decimal);
    expect(rule.amount.toFixed(2)).toBe('150000.05');
  });

  it('createGreenFeeRule_동일_조합_중복_생성이_허용된다', async () => {
    // docs/domain.md가 유니크 제약을 범위 밖으로 못 박았다. 동점은 조회 시
    // GreenFeeRuleConflict로 드러난다. 여기에 유니크 인덱스를 추가하지 말 것.
    const courseId = await seedCourse();
    const payload = {
      courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '150000.00',
    };
    const first = await app
      .get(CreateGreenFeeRuleHandler)
      .handle(await transformBody(CreateGreenFeeRuleRequest, payload));
    const second = await app
      .get(CreateGreenFeeRuleHandler)
      .handle(await transformBody(CreateGreenFeeRuleRequest, payload));

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
  });

  it('createGreenFeeRule_currency가_KRW로_저장된다', async () => {
    const courseId = await seedCourse();
    const request = await transformBody(CreateGreenFeeRuleRequest, {
      courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '150000.00',
    });
    const created = await app.get(CreateGreenFeeRuleHandler).handle(request);
    if (!created.ok) throw new Error(`GreenFeeRule 생성이 실패했다: ${created.error.code}`);
    expect(created.value.currency).toBe('KRW');

    // char(3) 왕복에서 공백 패딩이 붙지 않아야 한다.
    const rule = await dataSource
      .getRepository(GreenFeeRuleEntity)
      .findOneByOrFail({ id: created.value.greenFeeRuleId });
    expect(rule.currency).toBe('KRW');
  });

  it('createGreenFeeRule_금액_형식_오류_InvalidRequest', async () => {
    const base = { courseId: MISSING_COURSE_ID, dayType: 'Weekday', timeBand: 'Early' };
    await expectInvalidRequest(CreateGreenFeeRuleRequest, { ...base, amount: '150000.005' });
    await expectInvalidRequest(CreateGreenFeeRuleRequest, { ...base, amount: '십오만원' });
  });

  it('createGreenFeeRule_음수_금액_InvalidRequest', async () => {
    // 음수 그린피는 도메인상 의미가 없다. amount만 0 이상을 강제한다.
    await expectInvalidRequest(CreateGreenFeeRuleRequest, {
      courseId: MISSING_COURSE_ID,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '-150000.00',
    });
  });

  it('createGreenFeeRule_priority_음수가_허용된다', async () => {
    // priority의 계약은 smallint 범위(-32768~32767)다. "기본보다 낮은 우선순위"를
    // 막을 도메인 근거가 문서에 없으므로 DTO에 @Min(0)을 붙이지 않는다.
    const courseId = await seedCourse();
    const request = await transformBody(CreateGreenFeeRuleRequest, {
      courseId,
      dayType: 'Weekday',
      timeBand: 'Early',
      amount: '150000.00',
      priority: -1,
    });
    const result = await app.get(CreateGreenFeeRuleHandler).handle(request);
    expect(result).toMatchObject({ ok: true, value: { priority: -1 } });
  });

  it('updateGreenFeeRule_존재하지_않는_규칙_GreenFeeRuleNotFound', async () => {
    const result = await app
      .get(UpdateGreenFeeRuleHandler)
      .handle(MISSING_RULE_ID, { isActive: false });
    expect(result).toMatchObject({ ok: false, error: { code: 'GreenFeeRuleNotFound' } });
  });

  it('listGreenFeeRules_비활성_규칙은_기본_조회에서_제외된다', async () => {
    const courseId = await seedCourse();
    const created = await app.get(CreateGreenFeeRuleHandler).handle(
      await transformBody(CreateGreenFeeRuleRequest, {
        courseId,
        dayType: 'Weekday',
        timeBand: 'Early',
        amount: '150000.00',
      }),
    );
    if (!created.ok) throw new Error(`GreenFeeRule 생성이 실패했다: ${created.error.code}`);
    await app
      .get(UpdateGreenFeeRuleHandler)
      .handle(created.value.greenFeeRuleId, { isActive: false });

    expect(await app.get(ListGreenFeeRulesHandler).handle({})).toMatchObject({
      ok: true,
      value: [],
    });
  });
});
