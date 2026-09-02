import type { DataSourceOptions } from 'typeorm';

/**
 * TypeORM 1.0에서 `DataSourceOptions.name`이 제거되고 NestJS 레벨 식별자로 옮겨졌다.
 * 모듈마다 DataSource를 구분해야 하므로 이름을 다시 얹어 하나로 다룬다.
 */
type PostgresOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

export type ModuleDataSourceOptions = PostgresOptions & { readonly name: string };

import { SnakeNamingStrategy } from './naming-strategy.js';
import { rawTextTypeParsers } from './pg-type-parsers.js';

export type ModuleDataSourceInput = {
  /** 모듈 이름 겸 DataSource 이름. 스키마 이름과 같다. 예: 'booking' */
  readonly name: string;
  // NonNullable인 이유는 `exactOptionalPropertyTypes` 때문만이 아니다.
  // 모듈은 자기 엔티티와 마이그레이션을 반드시 명시해야 한다 — 자동 탐색은 다른 모듈의
  // 엔티티를 자기 DataSource에 끌어들여 스키마 경계를 조용히 무너뜨린다.
  readonly entities: NonNullable<DataSourceOptions['entities']>;
  readonly migrations: NonNullable<DataSourceOptions['migrations']>;
};

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;

  if (value === undefined) {
    throw new Error(`환경 변수가 필요하다: ${key}`);
  }

  return value;
}

/**
 * 모듈 DataSource의 공통 설정.
 *
 * `synchronize`와 `migrationsRun`은 인자로 받지 않는다. 켤 방법 자체를 주지 않는 것이
 * 이 함수의 목적이다 → docs/adr/0006
 */
export function moduleDataSourceOptions(input: ModuleDataSourceInput): ModuleDataSourceOptions {
  return {
    type: 'postgres',
    name: input.name,
    schema: input.name,

    host: requireEnv('POSTGRES_HOST', 'localhost'),
    port: Number(requireEnv('POSTGRES_PORT', '30772')),
    username: requireEnv('POSTGRES_USER', 'teetime'),
    password: requireEnv('POSTGRES_PASSWORD', 'teetime'),
    database: requireEnv('POSTGRES_DB', 'teetime'),

    entities: input.entities,
    migrations: input.migrations,

    namingStrategy: new SnakeNamingStrategy(),

    // 앱은 스키마를 바꿀 경로를 갖지 않는다.
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,

    // 마이그레이션 히스토리도 모듈 스키마 안에 둔다.
    migrationsTableName: 'migrations',

    extra: {
      // 커넥션의 타임존을 고정한다. timestamptz 출력 오프셋이 결정적이어야
      // 파싱이 환경에 좌우되지 않는다.
      options: '-c timezone=UTC',

      // 날짜·시각·금액을 원문 문자열로 받는다. 이유는 pg-type-parsers.ts.
      types: rawTextTypeParsers,
    },
  };
}
