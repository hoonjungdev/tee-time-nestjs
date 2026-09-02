# 데이터 스키마

단일 PostgreSQL 인스턴스, 모듈당 스키마 1개. 스키마를 넘는 FK는 걸지 않는다(`docs/modules.md`).
이 문서는 DDL과 함께 **각 제약이 무엇을 방어하는지**를 기록한다. 제약을 제거하기 전에 그 항목을 읽을 것.

```
catalog.*        clubs, courses, operating_rules, green_fee_rules
booking.*        tee_slots, bookings, outbox_messages
payment.*        transactions
identity.*       users
notification.*   notification_logs
```

---

## booking 스키마 ★

### `booking.tee_slots`

```sql
CREATE TABLE booking.tee_slots (
    id              uuid        PRIMARY KEY,
    course_id       uuid        NOT NULL,        -- catalog.courses, FK 없음
    tee_date        date        NOT NULL,        -- 골프장 로컬 날짜
    tee_time        time        NOT NULL,        -- 골프장 로컬 시각
    tee_at          timestamptz NOT NULL,        -- 절대 시각 (파생값)
    capacity        smallint    NOT NULL DEFAULT 4,
    is_blocked      boolean     NOT NULL DEFAULT false,
    blocked_reason  text        NULL,
    created_at      timestamptz NOT NULL
);

CREATE UNIQUE INDEX ux_slots_course_tee_at
    ON booking.tee_slots (course_id, tee_at);

CREATE INDEX ix_slots_search
    ON booking.tee_slots (tee_date, course_id, tee_at)
    WHERE is_blocked = false;
```

**상태 컬럼이 없다.** 점유는 활성 예약의 존재로 파생된다.
슬롯에 `status`를 두고 예약에도 `status`를 두면 같은 사실이 두 곳에 저장되어 드리프트가 발생한다
(슬롯은 Held인데 예약이 없는 유령 재고, 또는 예약은 Held인데 슬롯이 Available인 오버부킹).
상태를 한 곳에만 두면 그 상태가 물리적으로 불가능해진다.

`is_blocked`는 휴장·정비 등 **예약과 무관한 차단** 전용이다. 점유 표현에 쓰지 않는다.

**로컬 시각과 절대 시각을 둘 다 저장하는 이유** — 사업적 진실은 로컬 시각("7월 15일 06:10 티오프")이고
`tee_at`은 파생값이다. 그러나 로컬을 파생시키면 조회마다 타임존 변환이 걸려 인덱스를 타지 못하고,
로컬만 저장하면 "지금 이후" 같은 비교가 불가능하다. 슬롯 생성 시 한 번 계산해 둘 다 저장한다.
요금 구간(`TimeBand`) 판정도 `tee_time` 기준이다.

**`ix_slots_search`의 컬럼 순서** — 지역 검색은 Catalog에서 `course_id` 목록을 받아
`WHERE tee_date = ? AND course_id IN (...) ORDER BY tee_at` 형태로 조회한다.
모듈 경계 때문에 catalog와 join할 수 없으며, 이는 스키마 분리의 의도된 비용이다.

**`TimeBand` 필터는 이 인덱스를 타지 못한다.** `TimeBand`는 저장되지 않는 파생값이므로
검색 시 시각 범위로 역변환되어 `AND tee_time BETWEEN ? AND ?` 형태의 필터 조건이 된다.
다만 `tee_date` + `course_id`로 이미 충분히 좁혀지므로(코스 하나당 하루 약 95개 슬롯) 문제되지 않는다.
병목이 확인되면 `time_band`를 생성 컬럼으로 승격한다
(`GENERATED ALWAYS AS`, `tee_time` 기반 CASE 식은 IMMUTABLE이므로 가능).
**그 전까지 추가하지 않는다.** 관련 한계는 `docs/domain.md`의 요금 정책 항목 참조.

### `booking.bookings`

```sql
CREATE TABLE booking.bookings (
    id                  uuid          PRIMARY KEY,
    booking_number      text          NOT NULL,          -- 고객 노출용 TT-20260830-A7K3
    tee_slot_id         uuid          NOT NULL REFERENCES booking.tee_slots(id),
    user_id             uuid          NOT NULL,          -- identity.users, FK 없음
    status              text          NOT NULL,          -- Held|Confirmed|Cancelled|Completed|Expired
    player_count        smallint      NOT NULL,

    -- 가격 스냅샷 (요금표 변경에 불변)
    green_fee_amount    numeric(12,2) NOT NULL,
    total_amount        numeric(12,2) NOT NULL,
    currency            char(3)       NOT NULL DEFAULT 'KRW',

    -- 홀드
    held_at             timestamptz   NOT NULL,
    hold_expires_at     timestamptz   NULL,

    -- 확정
    confirmed_at        timestamptz   NULL,
    payment_tx_id       uuid          NULL,              -- payment.transactions, FK 없음

    -- 취소
    cancelled_at        timestamptz   NULL,
    cancelled_by        text          NULL,              -- Customer|Admin|System
    cancellation_reason text          NULL,
    refund_amount       numeric(12,2) NULL,

    idempotency_key     text          NULL,
    created_at          timestamptz   NOT NULL,
    updated_at          timestamptz   NOT NULL,
    version             integer       NOT NULL DEFAULT 1   -- 낙관적 락 (확정/취소 경로)
);

CREATE UNIQUE INDEX ux_bookings_number ON booking.bookings (booking_number);

-- ★ 최후 방어선: 슬롯당 활성 예약 최대 1건
CREATE UNIQUE INDEX ux_bookings_active_slot
    ON booking.bookings (tee_slot_id)
    WHERE status IN ('Held', 'Confirmed');

-- 요청 재시도 안전
CREATE UNIQUE INDEX ux_bookings_idem
    ON booking.bookings (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX ix_bookings_user  ON booking.bookings (user_id, created_at DESC);
CREATE INDEX ix_bookings_sweep ON booking.bookings (hold_expires_at) WHERE status = 'Held';
```

`tee_slot_id`는 **같은 모듈이므로 FK를 건다.** FK 금지는 모듈 경계를 넘을 때만 적용된다.

`version`은 확정·취소 경로의 갱신 충돌을 잡는 **낙관적 락**이다. 홀드 경로의 동시성은
슬롯 `FOR UPDATE`(비관적)가 책임지므로 여기서 다루는 것은 다른 위험이다 —
"홀드된 예약을 확정하는 사이에 어드민이 같은 행을 강제 취소했다" 같은 경우다.

PostgreSQL의 시스템 컬럼 `xmin`을 그대로 토큰으로 쓸 수도 있지만(추가 컬럼이 필요 없다),
그러려면 UPDATE 문을 직접 써야 한다. 실제 컬럼을 두면 ORM이 `WHERE version = ?`와
증가를 대신 해주고, 스키마를 읽는 사람에게 잠금 전략이 보인다. **컬럼 하나가 그 대가다.**

### `Expired` 상태가 필요한 이유

`ux_bookings_active_slot`을 다음과 같이 쓰고 싶어지지만 **불가능하다.**

```sql
-- ❌ PostgreSQL은 부분 인덱스 술어에 IMMUTABLE 함수만 허용한다. now()는 STABLE이다.
WHERE status = 'Confirmed' OR (status = 'Held' AND hold_expires_at > now())
```

즉 "만료되지 않은 홀드"를 인덱스 조건으로 표현할 수 없다.
따라서 만료는 **읽기 판정이 아니라 쓰기**여야 한다. 홀드를 시도할 때 슬롯 락을 잡은 김에
만료된 홀드를 같은 트랜잭션에서 `Expired`로 전이시킨다.

### 홀드 트랜잭션

```sql
BEGIN;

-- ① 직렬화 지점. 슬롯 row가 락 대상
SELECT id, capacity, is_blocked, tee_at
  FROM booking.tee_slots
 WHERE id = @slotId
   FOR UPDATE;
-- is_blocked = true         → 409 SlotBlocked
-- tee_at <= now() + leadTime → 409 SlotTooLate

-- ② 만료 홀드 정리 (락 안에서)
UPDATE booking.bookings
   SET status = 'Expired', updated_at = now()
 WHERE tee_slot_id = @slotId
   AND status = 'Held'
   AND hold_expires_at <= now();

-- ③ 활성 예약 확인 → 존재하면 409 SlotUnavailable
SELECT 1 FROM booking.bookings
 WHERE tee_slot_id = @slotId AND status IN ('Held','Confirmed');

-- ④ INSERT. ①~③이 뚫려도 ux_bookings_active_slot이 막는다
INSERT INTO booking.bookings (...) VALUES (..., 'Held', now() + interval '10 minutes', ...);

COMMIT;
```

①의 `FOR UPDATE`가 동시 요청을 직렬화하고, ④의 부분 유니크 인덱스가 애플리케이션 로직이
실패해도 오버부킹을 막는다. **이중 방어**이며 어느 쪽도 제거하지 않는다.

배경 스윕(`SlotExpirySweeper`)의 역할은 **정합성 보장이 아니라** 오래된 `Held`가 목록 조회에
남지 않게 하는 위생 작업이다. 정합성은 ②가 책임진다.

홀드는 아웃박스 이벤트를 남기지 않는다. 이벤트는 `Confirmed`/`Cancelled`에서만 발생한다.

### `booking.outbox_messages`

```sql
CREATE TABLE booking.outbox_messages (
    id            uuid        PRIMARY KEY,
    occurred_at   timestamptz NOT NULL,
    type          text        NOT NULL,     -- BookingConfirmed | BookingCancelled
    payload       jsonb       NOT NULL,
    processed_at  timestamptz NULL,
    attempt_count int         NOT NULL DEFAULT 0,
    last_error    text        NULL
);

CREATE INDEX ix_outbox_pending
    ON booking.outbox_messages (occurred_at)
    WHERE processed_at IS NULL;
```

디스패처는 `FOR UPDATE SKIP LOCKED`로 집어간다. 인스턴스가 여러 개여도 중복 발송이 발생하지 않는다.

---

## catalog 스키마

```sql
CREATE TABLE catalog.clubs (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    region      text NOT NULL,             -- 검색 필터
    time_zone   text NOT NULL,             -- IANA (예: Asia/Seoul)
    address     text NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL
);
CREATE INDEX ix_clubs_region ON catalog.clubs (region) WHERE is_active;

CREATE TABLE catalog.courses (
    id          uuid PRIMARY KEY,
    club_id     uuid NOT NULL REFERENCES catalog.clubs(id),
    name        text NOT NULL,
    hole_count  smallint NOT NULL DEFAULT 18,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL
);

CREATE TABLE catalog.operating_rules (
    id                uuid PRIMARY KEY,
    course_id         uuid NOT NULL REFERENCES catalog.courses(id),
    day_type          text NOT NULL,          -- Weekday | Weekend
    open_time         time NOT NULL,
    close_time        time NOT NULL,
    interval_minutes  smallint NOT NULL,      -- 티오프 간격 (예: 7)
    is_active         boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ux_oprule ON catalog.operating_rules (course_id, day_type) WHERE is_active;

CREATE TABLE catalog.green_fee_rules (
    id          uuid PRIMARY KEY,
    course_id   uuid NOT NULL REFERENCES catalog.courses(id),
    day_type    text NOT NULL,                -- Weekday | Weekend
    time_band   text NOT NULL,                -- Early | Mid | Late
    amount      numeric(12,2) NOT NULL,
    currency    char(3) NOT NULL DEFAULT 'KRW',
    priority    smallint NOT NULL DEFAULT 0,  -- 높을수록 우선
    is_active   boolean NOT NULL DEFAULT true
);
CREATE INDEX ix_fee_lookup
    ON catalog.green_fee_rules (course_id, day_type, time_band, priority DESC)
    WHERE is_active;
```

- `clubs.time_zone`은 슬롯 생성 시 로컬→절대 시각 변환에 쓰인다.
- 예약이 존재하는 course/club은 **하드 삭제하지 않는다.** `is_active = false`만 허용한다.
  스키마를 넘는 FK가 없으므로 DB가 막아주지 않으며, 애플리케이션이 책임진다.

---

## payment / identity / notification 스키마

```sql
CREATE TABLE payment.transactions (
    id               uuid PRIMARY KEY,
    idempotency_key  text NOT NULL,
    payer_id         uuid NOT NULL,
    amount           numeric(12,2) NOT NULL,
    currency         char(3) NOT NULL,
    status           text NOT NULL,          -- Authorized | Failed | Refunded
    provider_ref     text NULL,              -- Fake PG 응답 식별자
    failure_reason   text NULL,
    created_at       timestamptz NOT NULL,
    refunded_at      timestamptz NULL,
    refunded_amount  numeric(12,2) NULL
);
CREATE UNIQUE INDEX ux_tx_idem ON payment.transactions (idempotency_key);

CREATE TABLE identity.users (
    id             uuid PRIMARY KEY,
    email          text NOT NULL,                      -- 입력 대소문자를 그대로 보관
    password_hash  text NOT NULL,                      -- pbkdf2-sha256$반복수$salt$hash
    display_name   text NOT NULL,
    role           text NOT NULL DEFAULT 'Customer',   -- Customer | Admin
    created_at     timestamptz NOT NULL
);
CREATE UNIQUE INDEX ux_users_email ON identity.users (lower(email));

CREATE TABLE identity.audit_logs (
    id           uuid PRIMARY KEY,
    actor_id     uuid NOT NULL,             -- identity.users, FK 없음 (아래 참조)
    actor_email  text NOT NULL,             -- 기록 시점의 값
    action       text NOT NULL,             -- HTTP 메서드
    target       text NOT NULL,             -- 요청 경로 (쿼리 문자열 제외)
    status_code  int  NOT NULL,
    payload      text NULL,                 -- 요청 본문. after의 근사이며 before는 없다
    at           timestamptz NOT NULL
);
CREATE INDEX ix_audit_at    ON identity.audit_logs (at DESC);
CREATE INDEX ix_audit_actor ON identity.audit_logs (actor_id, at DESC);

CREATE TABLE notification.notification_logs (
    id           uuid PRIMARY KEY,
    user_id      uuid NOT NULL,
    channel      text NOT NULL,             -- Console | Email(미구현)
    template     text NOT NULL,
    payload      jsonb NOT NULL,
    sent_at      timestamptz NOT NULL,
    is_success   boolean NOT NULL,
    error        text NULL
);
```

`identity.audit_logs`는 같은 스키마의 `users`에도 **FK를 걸지 않는다.** 감사 로그는 대상보다
오래 살아야 한다 — 계정이 지워지면 이력까지 사라지는 것은 감사의 목적에 반한다.
같은 이유로 `actor_email`을 기록 시점 값으로 복제한다.
`payload`는 텍스트다(형식이 JSON이 아닐 수 있는 요청도 그대로 담는다).
대상 모듈의 변경과 **다른 트랜잭션**에서 기록되며, 그 대가는 `docs/adr/0005`에 적었다.

`ux_users_email`은 **함수 인덱스**라 엔티티 데코레이터로 표현할 수 없다. 마이그레이션에서 raw SQL로 만들며,
조회도 `lower(email)`로 해야 인덱스를 탄다 — 핸들러가 이메일을 소문자로 낮춰 조회하는 이유다.
반복수를 `password_hash` 문자열 안에 넣는 이유는 값을 올린 뒤에도 기존 해시를 검증하기 위해서다.

`payment.transactions.idempotency_key`의 유니크 제약이 결제 중복 승인을 막는다.
Booking의 `ux_bookings_idem`과 별개의 층위이며 둘 다 필요하다.

---


## TypeORM 매핑 요점

```ts
// 스키마 고정 — 이 엔티티는 booking 스키마 밖으로 나가지 않는다
@Entity({ schema: 'booking', name: 'bookings' })
// 최후 방어선. 술어를 문자열로 그대로 쓴다
@Index('ux_bookings_active_slot', ['teeSlotId'], {
  unique: true,
  where: "status IN ('Held', 'Confirmed')",
})
export class BookingEntity {
  // enum은 문자열로. 정수 매핑은 DB 직접 조회 시 판독이 불가능하다
  @Column({ type: 'text' })
  status!: BookingStatus;

  // 낙관적 락 — 확정/취소 경로용 (홀드 경로는 비관적 락이 담당)
  @VersionColumn()
  version!: number;
}
```

### 시간 — 드라이버 파싱을 끄고 문자열로 받는다

시간 타입은 `@js-joda/core`의 `Instant` / `LocalDate` / `LocalTime`만 쓴다.
**도메인 코드에 JavaScript `Date`는 등장하지 않는다.**

드라이버 기본 동작을 그대로 두면 두 가지가 조용히 깨진다.

| 컬럼 | 드라이버 기본 동작 | 문제 |
|---|---|---|
| `date` | `Date`로 파싱 | **프로세스 로컬 타임존으로 해석되어 하루가 밀린다** |
| `timestamptz` | `Date`로 파싱 | 마이크로초 절삭 |
| `time` | 문자열 | — |

`date`를 `Date`로 받는 것이 특히 위험하다. `tee_date`는 **골프장 로컬 날짜**이고 절대 시각이 아닌데,
`Date`로 파싱되는 순간 순간 시각이 되어 서버 타임존에 따라 날짜가 바뀐다.
로컬 시각이 진실이라는 전제(불변식 10)를 드라이버가 조용히 어기는 지점이다.

그래서 타입 파서를 **커넥션 옵션(`extra.types`)으로** 교체해 원문 문자열을 받는다.
전역 `setTypeParser`를 쓰지 않는 이유는 두 가지다 — 프로세스의 모든 pg 사용처를 바꾸는
부작용이 있고, ORM이 자기 커넥션에 다른 파서를 물고 있으면 조용히 무시된다.

#### 알려진 한계 — 엔티티 경로의 `timestamptz`는 밀리초다

TypeORM은 `timestamptz` 컬럼을 hydration 단계에서 `Date`로 정규화한 **뒤에** transformer를 호출한다
(`PostgresDriver.prepareHydratedValue`). 순서가 고정되어 있어 transformer로 우회할 수 없고,
쓰기 경로도 대칭적으로 `Date`를 거친다. 즉 **엔티티로 읽고 쓰는 값은 밀리초가 상한이다.**

`queryRunner.query()`로 직접 읽고 쓰는 경로에는 이 정규화가 없어 마이크로초가 보존된다.
이 프로젝트의 핵심 경로(홀드 트랜잭션)가 마침 raw SQL이므로, 정밀도가 필요한 자리는 이미 그쪽에 있다.

**수용한 이유:** 도메인에 마이크로초를 요구하는 규칙이 없다. 홀드 만료 판정은 DB 안에서 `now()`로 하고,
앱은 그 결과만 읽는다. 컬럼 타입을 `text`로 선언해 정규화를 피하는 방법도 있지만,
그러면 파라미터가 문자열로 추론되어 `tee_at` 비교가 인덱스를 타지 못할 위험이 생긴다.
**정밀도보다 인덱스가 중요하다.**

두 경로의 동작은 `packages/persistence-kernel/test/time-columns.test.ts`가 실제 PostgreSQL로 검증한다.
"date가 밀리지 않는다"는 그 파일의 첫 번째 테스트다.

### 금액 — `number`로 받지 않는다

`numeric(12,2)`를 JavaScript `number`로 받으면 이진 부동소수점이라 정확하지 않다.
드라이버가 문자열로 주는 것을 그대로 살려 `Decimal`(decimal.js)로 변환한다.
**금액에 `number` 타입이 등장하면 리뷰에서 되돌린다.**

### 그 밖에

- **홀드 경로는 raw SQL을 유지한다.** QueryBuilder에 `FOR UPDATE`를 붙이면 조건에 따라
  서브쿼리로 감싸져 잠금이 의도한 행에 걸리지 않는다. `queryRunner.query()`로 직접 쓰며
  쿼리 빌더로 "정리"하지 않는다 → `docs/adr/0003-pessimistic-lock-for-hold.md`
- **트랜잭션은 `queryRunner`를 명시적으로 열어 잡는다.** 같은 커넥션이 보장돼야
  `FOR UPDATE`와 뒤따르는 문장이 한 트랜잭션에 든다.
- 목록 조회는 엔티티를 통째로 읽지 않는다. QueryBuilder의 `select`로 필요한 컬럼만 뽑는다.
- **`synchronize`는 모든 환경에서 `false`, `migrationsRun`도 `false`다.**
  기동 경로에서 스키마를 건드리지 않는다 → `docs/adr/0006-migrations-applied-outside-app-startup.md`
- 마이그레이션은 `typeorm migration:generate`로 뽑되 **손으로 검토한 뒤 커밋한다.**
  부분 인덱스·함수 인덱스는 생성기가 놓치므로 raw SQL로 직접 적는다.
- PK는 DB가 아니라 앱에서 만든다(`crypto.randomUUID()`). INSERT 전에 식별자가 필요하고,
  아웃박스 페이로드에도 같은 값이 들어가야 하기 때문이다.

## 방어 매트릭스

각 제약을 제거하려면 대응 위험을 어떻게 대신 막을지 먼저 답할 것.

| 위험 | 방어 수단 |
|---|---|
| 동시 요청 오버부킹 | 슬롯 `FOR UPDATE` + `ux_bookings_active_slot` (이중) |
| 만료 홀드가 슬롯을 영구 점유 | 락 안에서의 `Expired` 전이 |
| 네트워크 재시도로 중복 예약 | `ux_bookings_idem` |
| 네트워크 재시도로 중복 결제 | `ux_tx_idem` |
| 요금 변경이 과거 예약 금액을 훼손 | 가격 스냅샷 컬럼 |
| 예약 확정 후 알림 유실 | 아웃박스 (동일 트랜잭션) |
| 디스패처 다중 인스턴스 중복 발송 | `FOR UPDATE SKIP LOCKED` |
| 과거·임박 시각 예약 | `tee_at > now() + leadTime` 검증 |
| 확정/취소 경로의 갱신 충돌 | `version` 낙관적 락 |
| 참조되는 마스터 데이터 삭제 | 소프트 삭제 (`is_active`) |
