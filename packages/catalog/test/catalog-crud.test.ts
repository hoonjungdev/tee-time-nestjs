import { Instant } from '@teetime/shared-kernel';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CreateClubRequest } from '../src/features/create-club/create-club.contracts.js';
import { CreateClubHandler } from '../src/features/create-club/create-club.handler.js';
import { CreateCourseRequest } from '../src/features/create-course/create-course.contracts.js';
import { CreateCourseHandler } from '../src/features/create-course/create-course.handler.js';
import { ListClubsHandler } from '../src/features/list-clubs/list-clubs.handler.js';
import { ListCoursesHandler } from '../src/features/list-courses/list-courses.handler.js';
import { UpdateClubHandler } from '../src/features/update-club/update-club.handler.js';
import { UpdateCourseHandler } from '../src/features/update-course/update-course.handler.js';
import { ClubEntity } from '../src/persistence/club.entity.js';
import {
  startCatalogTestContext,
  stopCatalogTestContext,
  truncateCatalogTables,
  type CatalogTestContext,
} from './support/postgres-catalog.js';

let context: CatalogTestContext;
let dataSource: CatalogTestContext['dataSource'];
let app: CatalogTestContext['app'];

function createClubRequest(input: {
  readonly name?: string;
  readonly region?: string;
  readonly timeZone?: string;
  readonly address?: string | null;
}): CreateClubRequest {
  const request = new CreateClubRequest();
  request.name = input.name ?? '테스트 클럽';
  request.region = input.region ?? '서울';
  request.timeZone = input.timeZone ?? 'Asia/Seoul';
  request.address = input.address ?? null;
  return request;
}

function createCourseRequest(clubId: string, holeCount?: number): CreateCourseRequest {
  const request = new CreateCourseRequest();
  request.clubId = clubId;
  request.name = '테스트 코스';
  if (holeCount !== undefined) request.holeCount = holeCount;
  return request;
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

describe('Catalog 마이그레이션과 CRUD', () => {
  it('migration_빈DB에_적용_clubs와_courses가_생성된다', async () => {
    const rows: Array<{ readonly relation: string | null }> = await dataSource.query(`
      SELECT to_regclass('catalog.clubs') AS relation
      UNION ALL SELECT to_regclass('catalog.courses')
      UNION ALL SELECT to_regclass('catalog.migrations')
    `);
    expect(rows.map((row) => row.relation)).toEqual([
      'catalog.clubs',
      'catalog.courses',
      'catalog.migrations',
    ]);
  });

  it('migration_ix_clubs_region이_부분인덱스로_존재한다', async () => {
    const rows: Array<{ readonly indexdef: string }> = await dataSource.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'catalog' AND indexname = 'ix_clubs_region'
    `);
    expect(rows[0]?.indexdef).toContain('WHERE is_active');
  });

  it('migration_courses_club_id_외래키가_존재한다', async () => {
    const rows: Array<{ readonly definition: string }> = await dataSource.query(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'catalog.courses'::regclass AND contype = 'f'
    `);
    expect(rows[0]?.definition).toContain('FOREIGN KEY (club_id) REFERENCES catalog.clubs(id)');
  });

  it('migration_재실행시_적용건수_0', async () => {
    expect(await dataSource.runMigrations()).toEqual([]);
  });

  it('createClub_생성후_조회_createdAt이_Instant로_복원된다', async () => {
    const result = await app.get(CreateClubHandler).handle(createClubRequest({ address: null }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const club = await dataSource
      .getRepository(ClubEntity)
      .findOneByOrFail({ id: result.value.clubId });
    expect(club.createdAt).toBeInstanceOf(Instant);
    expect(club.address).toBeNull();
  });

  it('createClub_유효하지_않은_timeZone_InvalidRequest', async () => {
    const result = await app
      .get(CreateClubHandler)
      .handle(createClubRequest({ timeZone: 'Mars/Olympus' }));
    expect(result).toMatchObject({ ok: false, error: { code: 'InvalidRequest' } });
  });

  it('createClub_AsiaSeoul_성공', async () => {
    const result = await app
      .get(CreateClubHandler)
      .handle(createClubRequest({ timeZone: 'Asia/Seoul' }));
    expect(result.ok).toBe(true);
  });

  it('createCourse_존재하지_않는_클럽_ClubNotFound', async () => {
    const result = await app
      .get(CreateCourseHandler)
      .handle(createCourseRequest('c7cc3024-c3fe-42d5-b3d7-bc726b29d922'));
    expect(result).toMatchObject({ ok: false, error: { code: 'ClubNotFound' } });
  });

  it('updateClub_존재하지_않는_클럽_ClubNotFound', async () => {
    const result = await app
      .get(UpdateClubHandler)
      .handle('c7cc3024-c3fe-42d5-b3d7-bc726b29d922', { isActive: false });
    expect(result).toMatchObject({ ok: false, error: { code: 'ClubNotFound' } });
  });

  it('updateCourse_존재하지_않는_코스_CourseNotFound', async () => {
    const result = await app
      .get(UpdateCourseHandler)
      .handle('c7cc3024-c3fe-42d5-b3d7-bc726b29d922', { isActive: false });
    expect(result).toMatchObject({ ok: false, error: { code: 'CourseNotFound' } });
  });

  it('updateClub_isActive_false후_true_원복된다', async () => {
    const created = await app.get(CreateClubHandler).handle(createClubRequest({}));
    if (!created.ok) throw new Error('Club 생성이 실패했다.');
    await app.get(UpdateClubHandler).handle(created.value.clubId, { isActive: false });
    const restored = await app
      .get(UpdateClubHandler)
      .handle(created.value.clubId, { isActive: true });
    expect(restored).toMatchObject({ ok: true, value: { isActive: true } });
  });

  it('updateClub_isActive_false_하위_Course는_영향받지_않는다', async () => {
    const club = await app.get(CreateClubHandler).handle(createClubRequest({}));
    if (!club.ok) throw new Error('Club 생성이 실패했다.');
    const course = await app
      .get(CreateCourseHandler)
      .handle(createCourseRequest(club.value.clubId));
    if (!course.ok) throw new Error('Course 생성이 실패했다.');
    await app.get(UpdateClubHandler).handle(club.value.clubId, { isActive: false });
    const updated = await app
      .get(UpdateCourseHandler)
      .handle(course.value.courseId, { isActive: true });
    expect(updated).toMatchObject({ ok: true, value: { isActive: true } });
  });

  it('listClubs_비활성_클럽은_기본_조회에서_제외된다', async () => {
    const club = await app.get(CreateClubHandler).handle(createClubRequest({}));
    if (!club.ok) throw new Error('Club 생성이 실패했다.');
    await app.get(UpdateClubHandler).handle(club.value.clubId, { isActive: false });
    expect(await app.get(ListClubsHandler).handle({})).toMatchObject({ ok: true, value: [] });
  });

  it('listCourses_비활성_클럽의_코스는_제외된다', async () => {
    const club = await app.get(CreateClubHandler).handle(createClubRequest({}));
    if (!club.ok) throw new Error('Club 생성이 실패했다.');
    const course = await app
      .get(CreateCourseHandler)
      .handle(createCourseRequest(club.value.clubId));
    if (!course.ok) throw new Error('Course 생성이 실패했다.');
    await app.get(UpdateClubHandler).handle(club.value.clubId, { isActive: false });
    expect(await app.get(ListCoursesHandler).handle({})).toMatchObject({ ok: true, value: [] });
  });

  it('listCourses_비활성_Course는_기본_조회에서_제외된다', async () => {
    const club = await app.get(CreateClubHandler).handle(createClubRequest({}));
    if (!club.ok) throw new Error('Club 생성이 실패했다.');
    const course = await app
      .get(CreateCourseHandler)
      .handle(createCourseRequest(club.value.clubId));
    if (!course.ok) throw new Error('Course 생성이 실패했다.');
    await app.get(UpdateCourseHandler).handle(course.value.courseId, { isActive: false });
    expect(await app.get(ListCoursesHandler).handle({})).toMatchObject({ ok: true, value: [] });
  });

  it('listCourses_clubId로_필터된다', async () => {
    const first = await app.get(CreateClubHandler).handle(createClubRequest({ name: '첫 클럽' }));
    const second = await app
      .get(CreateClubHandler)
      .handle(createClubRequest({ name: '둘째 클럽' }));
    if (!first.ok || !second.ok) throw new Error('Club 생성이 실패했다.');
    await app.get(CreateCourseHandler).handle(createCourseRequest(first.value.clubId));
    await app.get(CreateCourseHandler).handle(createCourseRequest(second.value.clubId));
    expect(await app.get(ListCoursesHandler).handle({ clubId: first.value.clubId })).toMatchObject({
      ok: true,
      value: [{ clubId: first.value.clubId }],
    });
  });
});
