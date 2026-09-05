# 로드맵

**원칙: 부킹 엔진은 완성도 100%, 나머지는 60%.**
순서를 뒤집지 않는다. 화면부터 만들면 M2에서 힘이 빠진다.

세션 시작 시 이 파일을 먼저 확인한다. 작업 완료 시 체크박스를 갱신하고 산출물 경로를 한 줄 남긴다.

---

## M0 — 기반

- [x] pnpm 워크스페이스 + 패키지 11종 생성 (`docs/modules.md` 참조 규칙 표대로)
- [x] `tsconfig.base.json` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
      `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields: false`
      + 패키지별 project references
- [x] ESLint(플랫 설정) + Prettier — `no-floating-promises`, `no-explicit-any`를 에러로
- [x] `shared-kernel` — `Result`/`DomainError`, `ErrorCode → HTTP` 매핑, Problem Details 변환,
      시간 타입(js-joda), `Money`(decimal.js), `IntegrationEventHandler` 계약
- [x] `persistence-kernel` — pg 타입 파서, 컬럼 transformer, snake_case 네이밍 전략,
      DataSource 팩토리(`synchronize`/`migrationsRun`을 켤 방법 자체를 주지 않는다), 트랜잭션 헬퍼
- [x] `apps/api` — NestJS 호스트. 모듈 조립, 전역 예외 필터, ValidationPipe, pino 로깅, OpenAPI
- [x] `docker-compose.yml` (postgres) — `pnpm db:up`으로 기동
- [x] `tests/architecture` — 참조 규칙 표 대조 + 진입점/순환 검증 + dependency-cruiser
- [x] GitHub Actions: build + lint + depcruise + test

M1로 넘긴 것 (엔티티가 생겨야 의미가 있다):

- [ ] 모듈별 `TypeOrmModule.forRoot` 등록과 마이그레이션 히스토리 테이블 — Catalog 완료, 나머지 4개 모듈 잔여
- [ ] Testcontainers 공용 테스트 베이스 — 지금은 각 테스트 파일이 직접 띄운다.
      공용화는 두 번째 사용처가 생길 때 한다.
- [ ] 테스트 디렉터리를 타입 체크 그래프에 넣기 — 각 패키지 `tsconfig.json`의 `include`가
      `src/**/*`뿐이라 `pnpm typecheck`가 `test/`를 보지 않는다. M1 Catalog에서 테스트 파일의
      `exactOptionalPropertyTypes` 위반 2건이 초록 뒤에 숨어 있었다 (`tsconfig.lint.json`으로만 잡힌다).

### M0 완료 기준

- [x] `pnpm build`가 워크스페이스 전체에서 통과
- [x] `booking`에서 `@teetime/catalog`를 import하면 **타입 체크가 실패**하는 것을 확인
      (계약 패키지의 deep import도 함께 막히는 것을 확인)
- [x] Testcontainers로 띄운 PostgreSQL에 붙는 테스트가 통과
- [x] `date` 컬럼을 왕복시켜 **날짜가 밀리지 않는 것**을 확인 (`docs/schema.md` 시간 절)
- [x] 툴체인 검증 — ESM 로드 · `design:type` 방출 · 부분 유니크 인덱스 메타데이터 수집

## M1 — 도메인 + 슬롯 재고

### Catalog
- [x] `Club` / `Course` 엔티티 + 어드민 CRUD
- [ ] `OperatingRule` CRUD
- [ ] `GreenFeeRule` CRUD
- [ ] 요금 계산 순수 함수 (`DayType` × `TimeBand`) + 단위 테스트
- [ ] `CatalogApi` 구현 (`getCourse`, `quoteGreenFee`, `getOperatingDays`)

### Booking — 슬롯
- [ ] `TeeSlot` 엔티티 + 매핑 (상태 컬럼 없음, 인덱스 2종)
- [ ] 슬롯 생성 기능 — 운영 규칙 전개, 로컬→절대 시각 변환, 재실행 안전(idempotent)
- [ ] 슬롯 조회 (`GET /api/courses/:courseId/slots`)

## M2 — 부킹 엔진 ★ 핵심

여기가 프로젝트의 전부다. 시간을 아끼지 않는다.

- [ ] `Booking` 애그리거트 + 상태 머신 (`Held`/`Confirmed`/`Expired`/`Cancelled`/`Completed`)
      - 상태 전이는 도메인 메서드로만. 직접 대입 금지
- [ ] `BookingNumber` 생성기
- [ ] **슬롯 홀드** — 슬롯 `FOR UPDATE` + 락 안에서 `Expired` 전이 + INSERT (raw SQL)
- [ ] `ux_bookings_active_slot` 부분 유니크 인덱스
- [ ] **Idempotency-Key** 처리 (`ux_bookings_idem`)
- [ ] 리드타임/차단/과거시각 검증
- [ ] **결제 확정** — `PaymentApi` 호출 → 성공 시 `Confirmed`, 실패/타임아웃 시 홀드 해제(보상)
- [ ] Fake PG 어댑터 (승인/실패/타임아웃 시뮬레이션) + `payment.transactions`
- [ ] **가격 스냅샷** 저장
- [ ] **취소 + 환불액 계산** (순수 함수 + 단위 테스트, `docs/domain.md` 정책표)
- [ ] **아웃박스** — 확정/취소 이벤트를 동일 트랜잭션에 기록
- [ ] `OutboxDispatcher` — `FOR UPDATE SKIP LOCKED`
- [ ] `SlotExpirySweeper` (위생 작업)
- [ ] Notification 모듈 — 이벤트 소비 + `notification_logs` 기록

### M2 완료 기준 — 아래 통과 못 하면 M2 미완

- [ ] Testcontainers 실제 PostgreSQL에서 **동시 50 요청 → 정확히 1건 성공**
- [ ] 홀드 만료 후 동일 슬롯 재예약 성공
- [ ] 결제 실패 시 슬롯이 즉시 반환됨
- [ ] 동일 Idempotency-Key 3회 호출 → 예약 1건
- [ ] 확정 시 아웃박스 메시지가 정확히 1건 생성됨
- [ ] 디스패처 2개 동시 구동 시 중복 발송 0건

## M3 — API 표면

### Identity
- [ ] 회원가입 / 로그인 (이메일 + 비밀번호, JWT)
- [ ] `AdminGuard` 권한 정책
- [ ] 어드민 시드 계정 (웹 기동과 분리된 CLI 진입점)

### 고객 API
- [ ] `GET  /api/courses?region=&date=&timeBand=`
- [ ] `GET  /api/courses/:courseId/slots?date=`
- [ ] `POST /api/bookings/hold`
- [ ] `POST /api/bookings/:bookingId/confirm`
- [ ] `POST /api/bookings/:bookingId/cancel`
- [ ] `GET  /api/me/bookings`

### 어드민 API
- [ ] `CRUD /api/admin/clubs | /courses | /operating-rules | /green-fee-rules`
- [ ] `POST /api/admin/courses/:courseId/slots:generate`
- [ ] `GET  /api/admin/bookings?status=&date=`
- [ ] `POST /api/admin/bookings/:bookingId/force-cancel` (+ 감사 로그)
- [ ] `GET  /api/admin/dashboard` (당일 예약 수, 슬롯 점유율)

### 공통
- [ ] `AuditLog` — 어드민 변경 이력 (actor / action / target / 요청 본문)
- [ ] OpenAPI 문서 노출 (`@nestjs/swagger`)
- [ ] CORS 설정 (프론트 직접 호출)

## M4 — 프론트 (최소한으로)

BFF를 만들지 않는다. API를 직접 호출하고, 계약은 OpenAPI 문서에서 타입을 생성한다.

### 고객 (Next.js + shadcn/ui)
- [ ] 검색 (날짜/지역/시간대 필터 → 슬롯 리스트)
- [ ] 코스 상세 + 티타임 선택
- [ ] 예약 확인 → 결제 (10분 카운트다운)
- [ ] 예약 완료
- [ ] 내 예약 목록 / 취소

### 어드민 (DataTable + Dialog 폼만)
- [ ] 골프장·코스 관리
- [ ] 슬롯 생성
- [ ] 요금 규칙 관리
- [ ] 예약 목록 + 강제 취소

## M5 — 마감

- [ ] `README.md` — 아키텍처 다이어그램 + 동시성 문제 정의와 해결 과정
- [ ] `docker compose up` 한 방에 전체 기동 확인 (migrator → api → 프론트 2벌)
- [ ] CI에 통합 테스트(동시성 포함) 포함
- [ ] ADR 검증 절 채우기 (0003 / 0006)

---

## MVP 범위 밖 — 미리 만들지 않는다

조인 예약 · 대기자 명단 · 소셜 로그인 · 실 PG 연동 · 이메일/SMS 실발송 ·
리뷰·평점 · 지도/거리순 정렬 · 회원등급 · 시즌 요금 · 프로모션·쿠폰 ·
캐디/카트 옵션 · 다국어 · MSA 분리 · Redis 캐시 · 채널별 재고 할당량 ·
**코스별 `TimeBand` 경계 설정** · **k6 부하 테스트**

**Redis를 제외한 이유:** MVP 트래픽에서는 PostgreSQL 락으로 충분하며,
근거 없이 분산 락을 넣으면 "왜 필요한지" 설명할 수 없어 오히려 감점이다.
병목을 측정으로 확인한 뒤 도입하고, 그 과정을 문서로 남기는 편이 훨씬 강하다.

**부하 테스트를 제외한 이유:** 현재 범위 결정이며 기술적 판단이 아니다.
동시성 정합성은 통합 테스트(동시 50 요청)가 증명한다 — 부하 테스트가 답하는 질문은
"정합성이 지켜지는가"가 아니라 "얼마나 빠른가"이고, 후자는 지금 답하지 않기로 했다.
추가할 경우 `loadtest/` 하나만 늘어나며 애플리케이션 코드는 바뀌지 않는다.

---

## 진행 기록

작업을 마칠 때마다 여기에 한 줄 남긴다. 형식: `- YYYY-MM-DD [M?] 내용 — 산출물 경로`

- 2026-09-02 [M0] 문서 기반 수립 — `docs/` (domain·modules·schema·conventions·roadmap + ADR 6건)
- 2026-09-03 [M0] 워크스페이스 골격 + 커널 2종 + API 호스트 — `packages/`, `apps/api/`, `tests/architecture/`
      실측으로 확정한 것 3가지:
      (1) NestJS 12가 ESM 전용이라 프로젝트 전체를 ESM으로 두고 테스트 러너를 Vitest+SWC로 정했다
          (`docs/conventions.md` §9)
      (2) TypeORM이 `timestamptz`를 transformer보다 먼저 `Date`로 정규화한다 — 엔티티 경로는
          밀리초가 상한이며 raw 경로는 마이크로초를 보존한다 (`docs/schema.md` 시간 절)
      (3) typescript-eslint가 TS 7을 지원하지 않아 TypeScript를 6.x로 고정했다.
          타입 인식 린트(`no-floating-promises`)가 규약의 핵심이라 포기할 수 없었다.
- 2026-09-05 [M1] Club/Course 엔티티·마이그레이션·어드민 CRUD — `packages/catalog/`
      Testcontainers 공용화 트리거 성립 — 다음 사용처에서 착수
