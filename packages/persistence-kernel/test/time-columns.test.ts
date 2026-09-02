import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Instant, LocalDate, LocalTime, money, type Money } from '@teetime/shared-kernel';
import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import 'reflect-metadata';

import { moduleDataSourceOptions } from '../src/data-source.js';
import {
  instantColumn,
  localDateColumn,
  localTimeColumn,
  moneyColumn,
} from '../src/transformers.js';

@Entity({ schema: 'probe', name: 'time_probes' })
class TimeProbe {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'date', transformer: localDateColumn })
  teeDate!: LocalDate;

  @Column({ type: 'time', transformer: localTimeColumn })
  teeTime!: LocalTime;

  @Column({ type: 'timestamptz', transformer: instantColumn })
  teeAt!: Instant;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: moneyColumn })
  amount!: Money;
}

let container: StartedPostgreSqlContainer;
let dataSource: DataSource;

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

  const options = moduleDataSourceOptions({
    name: 'probe',
    entities: [TimeProbe],
    migrations: [],
  });

  dataSource = new DataSource(options);
  await dataSource.initialize();

  // synchronize를 쓰지 않으므로 스키마는 명시적으로 만든다 (docs/adr/0006).
  await dataSource.query('CREATE SCHEMA IF NOT EXISTS probe');
  await dataSource.query(`
    CREATE TABLE probe.time_probes (
      id        uuid          PRIMARY KEY,
      tee_date  date          NOT NULL,
      tee_time  time          NOT NULL,
      tee_at    timestamptz   NOT NULL,
      amount    numeric(12,2) NOT NULL
    )
  `);
}, 180_000);

afterAll(async () => {
  await dataSource?.destroy();
  await container?.stop();
});

describe('시간·금액 컬럼 왕복', () => {
  it('date는 프로세스 타임존과 무관하게 같은 날짜로 돌아온다', async () => {
    const repository = dataSource.getRepository(TimeProbe);

    // 자정 직전 날짜. Date로 파싱되면 타임존에 따라 하루가 밀리는 지점이다.
    const teeDate = LocalDate.parse('2026-07-15');

    await repository.insert({
      id: crypto.randomUUID(),
      teeDate,
      teeTime: LocalTime.parse('06:10'),
      teeAt: Instant.parse('2026-07-14T21:10:00Z'),
      amount: money('180000.00'),
    });

    const loaded = await repository.find();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.teeDate.toString()).toBe('2026-07-15');
    expect(loaded[0]?.teeDate).toBeInstanceOf(LocalDate);
  });

  it('엔티티 경로의 timestamptz는 밀리초까지 보존된다 (마이크로초는 절삭)', async () => {
    const repository = dataSource.getRepository(TimeProbe);
    const teeAt = Instant.parse('2026-07-14T21:10:00.123456Z');
    const id = crypto.randomUUID();

    await repository.insert({
      id,
      teeDate: LocalDate.parse('2026-07-15'),
      teeTime: LocalTime.parse('06:10'),
      teeAt,
      amount: money('180000.00'),
    });

    const loaded = await repository.findOneByOrFail({ id });

    // ORM이 hydration에서 Date로 정규화한 뒤 transformer를 부르므로 밀리초가 상한이다.
    // 감수한 한계이며 근거는 docs/schema.md. 순간 자체는 어긋나지 않는다.
    expect(loaded.teeAt.toString()).toBe('2026-07-14T21:10:00.123Z');
  });

  it('raw 경로의 timestamptz는 마이크로초까지 보존된다', async () => {
    const id = crypto.randomUUID();

    // 홀드 트랜잭션처럼 raw SQL로 쓰고 읽는 경로. ORM의 Date 정규화를 거치지 않는다.
    await dataSource.query(
      'INSERT INTO probe.time_probes (id, tee_date, tee_time, tee_at, amount) VALUES ($1, $2, $3, $4, $5)',
      [id, '2026-07-15', '06:10', '2026-07-14T21:10:00.123456Z', '180000.00'],
    );

    const rows: Array<{ tee_at: string }> = await dataSource.query(
      'SELECT tee_at FROM probe.time_probes WHERE id = $1',
      [id],
    );

    const teeAtRaw = rows[0]?.tee_at;
    expect(typeof teeAtRaw).toBe('string');
    expect(instantColumn.from(teeAtRaw ?? null)?.toString()).toBe('2026-07-14T21:10:00.123456Z');
  });

  it('time은 로컬 시각 그대로 돌아온다', async () => {
    const repository = dataSource.getRepository(TimeProbe);
    const id = crypto.randomUUID();

    await repository.insert({
      id,
      teeDate: LocalDate.parse('2026-07-15'),
      teeTime: LocalTime.parse('06:10'),
      teeAt: Instant.parse('2026-07-14T21:10:00Z'),
      amount: money('180000.00'),
    });

    const loaded = await repository.findOneByOrFail({ id });
    expect(loaded.teeTime.toString()).toBe('06:10');
  });

  it('numeric은 number를 거치지 않고 정확히 복원된다', async () => {
    const repository = dataSource.getRepository(TimeProbe);
    const id = crypto.randomUUID();

    // number로 왕복하면 오차가 남는 값.
    const amount = money('12345678.99');

    await repository.insert({
      id,
      teeDate: LocalDate.parse('2026-07-15'),
      teeTime: LocalTime.parse('06:10'),
      teeAt: Instant.parse('2026-07-14T21:10:00Z'),
      amount,
    });

    const loaded = await repository.findOneByOrFail({ id });

    expect(loaded.amount.toFixed(2)).toBe('12345678.99');
    expect(loaded.amount.equals(amount)).toBe(true);
  });
});
