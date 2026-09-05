import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CatalogModule } from '@teetime/catalog';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import 'reflect-metadata';

import { UnhandledExceptionFilter } from '../src/unhandled-exception.filter.js';

type CreatedClub = {
  readonly clubId: string;
};

let container: StartedPostgreSqlContainer;
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let dataSource: DataSource;
let apiUrl: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('teetime')
    .withUsername('teetime')
    .withPassword('teetime')
    .start();

  process.env['POSTGRES_HOST'] = container.getHost();
  process.env['POSTGRES_PORT'] = String(container.getPort());
  process.env['POSTGRES_USER'] = container.getUsername();
  process.env['POSTGRES_PASSWORD'] = container.getPassword();
  process.env['POSTGRES_DB'] = container.getDatabase();

  app = await NestFactory.create(CatalogModule, { logger: false });
  app.useGlobalFilters(new UnhandledExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  dataSource = app.get<DataSource>(getDataSourceToken('catalog'));
  await dataSource.query('CREATE SCHEMA IF NOT EXISTS catalog');
  await dataSource.runMigrations();
  await app.listen(0, '127.0.0.1');
  apiUrl = await app.getUrl();
}, 180_000);

afterEach(async () => {
  await dataSource.query('TRUNCATE TABLE catalog.courses, catalog.clubs CASCADE');
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

describe('Catalog HTTP 경계', () => {
  it('createCourse_holeCount가_9또는18이_아님_400ProblemDetails', async () => {
    const response = await fetch(`${apiUrl}/api/admin/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubId: 'c7cc3024-c3fe-42d5-b3d7-bc726b29d922',
        name: '테스트 코스',
        holeCount: 12,
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      status: 400,
      errorCode: 'InvalidRequest',
      traceId: expect.any(String),
    });
  });

  it('createCourse_존재하지_않는_클럽_404ProblemDetails', async () => {
    const response = await fetch(`${apiUrl}/api/admin/courses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubId: 'c7cc3024-c3fe-42d5-b3d7-bc726b29d922',
        name: '테스트 코스',
        holeCount: 18,
      }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ errorCode: 'ClubNotFound' });
  });

  it('listClubs_includeInactive_false가_비활성을_제외한다', async () => {
    const created = await fetch(`${apiUrl}/api/admin/clubs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '테스트 클럽', region: '서울', timeZone: 'Asia/Seoul' }),
    });
    expect(created.status).toBe(201);
    const club = (await created.json()) as CreatedClub;
    const updated = await fetch(`${apiUrl}/api/admin/clubs/${club.clubId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(updated.status).toBe(200);

    const response = await fetch(`${apiUrl}/api/admin/clubs?includeInactive=false`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('listClubs_includeInactive가_유효하지_않음_400ProblemDetails', async () => {
    const response = await fetch(`${apiUrl}/api/admin/clubs?includeInactive=not-a-boolean`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ errorCode: 'InvalidRequest' });
  });

  it('routeNotFound_404는_범용HttpProblemDetails로_응답한다', async () => {
    const response = await fetch(`${apiUrl}/api/admin/unknown`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      type: 'https://teetime.local/errors/http-404',
      title: 'NotFoundException',
      status: 404,
      traceId: expect.any(String),
    });
  });
});
