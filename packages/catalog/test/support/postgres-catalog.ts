import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

import 'reflect-metadata';

import { CatalogModule } from '../../src/catalog.module.js';
import { catalogDataSourceOptions } from '../../src/persistence/catalog.data-source.js';

/**
 * Catalog 통합 테스트의 공용 부트스트랩.
 *
 * 실제 PostgreSQL을 Testcontainers로 띄운다. Repository mock·sqlite·인메모리 드라이버는
 * 부분 유니크 인덱스와 행 락을 검증하지 못하므로 이 프로젝트에서 무의미하다
 * → docs/conventions.md §9
 *
 * 공용화되는 것은 **컨테이너가 아니라 부트스트랩 코드**다. 파일마다 `beforeAll`이
 * 자기 컨테이너를 띄우므로 테스트 파일 수만큼 컨테이너가 뜬다. 비용은 감수한다.
 *
 * `test/support/`는 vitest `include` 글로밍이 요구하는 `.test.ts` 접미사가 아니므로
 * 테스트 파일로 수집되지 않는다. `tsconfig.lint.json`에는 걸려 타입 검사는 받는다.
 */
export type CatalogTestContext = {
  readonly container: StartedPostgreSqlContainer;
  /** 마이그레이션·raw 검증용. Nest 컨텍스트가 잡는 DataSource와는 별개의 인스턴스다. */
  readonly dataSource: DataSource;
  readonly app: INestApplicationContext;
};

/** 컨테이너 기동 → 환경변수 주입 → DataSource 초기화 → CREATE SCHEMA → runMigrations → Nest 컨텍스트 */
export async function startCatalogTestContext(): Promise<CatalogTestContext> {
  const container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('teetime')
    .withUsername('teetime')
    .withPassword('teetime')
    .start();

  process.env['POSTGRES_HOST'] = container.getHost();
  process.env['POSTGRES_PORT'] = String(container.getPort());
  process.env['POSTGRES_USER'] = container.getUsername();
  process.env['POSTGRES_PASSWORD'] = container.getPassword();
  process.env['POSTGRES_DB'] = container.getDatabase();

  const dataSource = new DataSource(catalogDataSourceOptions());
  await dataSource.initialize();
  // 스키마 생성은 마이그레이션이 아니라 앞단에서 한다 → docs/adr/0007
  await dataSource.query('CREATE SCHEMA IF NOT EXISTS catalog');
  await dataSource.runMigrations();

  const app = await NestFactory.createApplicationContext(CatalogModule, { logger: false });

  return { container, dataSource, app };
}

export async function stopCatalogTestContext(context: CatalogTestContext): Promise<void> {
  await context.app.close();
  if (context.dataSource.isInitialized) await context.dataSource.destroy();
  await context.container.stop();
}

/**
 * `afterEach`용. catalog 스키마의 테이블을 전부 비운다(`migrations`는 제외).
 *
 * 테이블 이름을 하드코딩하지 않고 카탈로그에서 읽는 이유는, 마이그레이션이 늘어날 때마다
 * 이 파일을 고치지 않기 위함이다. 아직 적용되지 않은 테이블을 TRUNCATE하면 42P01로 죽는다.
 */
export async function truncateCatalogTables(dataSource: DataSource): Promise<void> {
  const rows: Array<{ readonly relation: string }> = await dataSource.query(
    `SELECT format('%I.%I', schemaname, tablename) AS relation
       FROM pg_tables
      WHERE schemaname = 'catalog' AND tablename <> 'migrations'`,
  );
  if (rows.length === 0) return;

  await dataSource.query(`TRUNCATE TABLE ${rows.map((row) => row.relation).join(', ')} CASCADE`);
}
