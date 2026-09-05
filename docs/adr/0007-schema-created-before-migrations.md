# ADR 0007 — 스키마 생성을 마이그레이션 실행보다 앞에 둔다

- 상태: 채택
- 일자: 2026-09-05
- 관련: ADR 0001, ADR 0006

## 배경

ADR 0006이 "마이그레이션은 리포에 커밋된 파일이고 앱 기동 경로 밖에서 적용한다"를 정했다.
모듈이 5개라 DataSource도 5개이고, 각자 자기 PostgreSQL 스키마와 마이그레이션 히스토리
테이블을 갖는다(`catalog.migrations`, `booking.migrations`, ...).

M1에서 Catalog 마이그레이션을 처음 실행하면서 함정이 드러났다.

**TypeORM은 스키마를 만들지 않는다.** `MigrationExecutor.createMigrationsTableIfNotExist`가
`queryRunner.createTable`을 호출하는데, `PostgresQueryRunner.createTable`은 `CREATE TABLE`만
낸다. `CREATE SCHEMA`는 어디에서도 나오지 않는다. 히스토리 테이블이 `catalog` 스키마 안에
있으므로, 빈 데이터베이스에서 `migration:run`을 처음 돌리면 히스토리 테이블 생성 자체가
`schema "catalog" does not exist`로 실패한다.

**마이그레이션 파일의 `up()` 안에 `CREATE SCHEMA`를 넣어도 늦다.** 히스토리 테이블은
`up()`이 실행되기 전에 만들어진다. 순서가 뒤집혀 있어 마이그레이션 내부로는 해결할 수 없다.

`synchronize: true`는 애초에 금지다(ADR 0006). 사람이 손으로 스키마를 만드는 것은
"재실행 안전한 명령 하나"라는 전제를 깬다.

## 결정

**모듈의 `migration:run` 스크립트를 2단계로 구성한다. 스키마 생성이 앞, 마이그레이션이 뒤다.**

```json
"migration:run": "typeorm query -d dist/persistence/<module>.data-source.js 'CREATE SCHEMA IF NOT EXISTS <module>' && typeorm migration:run -d dist/persistence/<module>.data-source.js"
```

- `IF NOT EXISTS`이므로 재실행 안전하다. 빈 DB에서 첫 적용 후 2·3회차는 적용 0건으로 끝난다.
- `typeorm query`는 마이그레이션 히스토리를 건드리지 않는다. 스키마 생성은 히스토리에
  기록되지 않으며, 기록될 필요도 없다 — 스키마는 마이그레이션의 대상이 아니라 전제다.
- `-d`가 가리키는 것은 **빌드 산출물(`dist/`)** 이다. Node 24는 데코레이터와
  `emitDecoratorMetadata`를 네이티브로 처리하지 못하고 `ts-node`를 두지 않았다.

Catalog가 이 패턴의 원본이다. **나머지 4개 모듈은 각자 엔티티가 생길 때 같은 형태를 복제한다.**

## 검토했다 접은 것

**마이그레이션 `up()` 안에서 `CREATE SCHEMA`.**
히스토리 테이블이 `up()`보다 먼저 만들어지므로 순서상 불가능하다. 동작하지 않는다.

**히스토리 테이블만 `public` 스키마에 둔다.**
`migrationsTableName`을 스키마 없는 이름으로 바꾸면 첫 실행은 통과한다.
그러나 모듈 5개의 히스토리가 한 테이블에 섞이거나 이름으로만 구분되어,
"모듈별 스키마 분리"라는 ADR 0001의 경계가 DB 수준에서 흐려진다.
경계를 지키려고 스키마를 나눴는데 그 경계를 히스토리에서 되돌리는 것은 앞뒤가 안 맞는다.

**운영자가 사전에 스키마를 만든다.**
`docker compose up` 한 번으로 전체가 뜨는 것을 목표로 한 ADR 0006과 충돌한다.
사람이 기억해야 하는 선행 단계는 재실행 안전성을 사람의 기억에 의존시킨다.

## 결과

- 빈 데이터베이스에서 `migration:run` 한 번으로 스키마·히스토리·테이블이 모두 선다.
- 같은 명령을 연속 3회 실행해도 2회차부터 적용 0건, 종료 코드 0이다.
- 통합 테스트가 이 경로를 그대로 탄다(`packages/catalog/test/catalog-crud.test.ts`).
  부분 인덱스와 FK의 실재는 `pg_indexes` / `pg_constraint` 조회로 직접 확인한다.
- 새 모듈을 추가할 때 이 스크립트를 복제하는 것을 잊으면 첫 `migration:run`이 실패한다.
  실패가 명확하고 즉시 드러나므로 조용히 잘못되는 종류의 위험은 아니다.
