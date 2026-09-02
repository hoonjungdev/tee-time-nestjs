# 모듈 구조

## 경계를 자르는 기준

모듈은 "기능 묶음"이 아니라 **데이터를 소유하는 단위**다. 세 가지로 판단한다.

1. **트랜잭션 경계** — 하나의 원자적 연산 안에서 함께 바뀌어야 하는 데이터는 같은 모듈
2. **변경 축** — 바뀌는 이유가 다르면 분리 (마스터 데이터 vs 거래 데이터)
3. **외부 시스템 경계** — 외부와 통신하는 지점은 격리

"누가 쓰느냐"는 분리 근거가 아니다. **"누가 소유하느냐"가 근거다.**
어드민이 슬롯을 생성한다는 사실은 Booking 모듈 안의 또 다른 feature일 뿐이며,
사용자가 다르다고 모듈을 나누면 결국 "고객 모듈 / 어드민 모듈"로 수렴한다. 그것은 계층을 잘못 자른 것이다.

---

## 모듈 목록

| 모듈 | 소유 데이터 | 성격 |
|---|---|---|
| **Booking** ★ | `TeeSlot`, `Booking`, `OutboxMessage` | 리치 도메인. 동시성·상태머신 |
| **Catalog** | `Club`, `Course`, `OperatingRule`, `GreenFeeRule` | 얇은 CRUD. 마스터 데이터 |
| **Payment** | `PaymentTransaction` | 외부 경계. 어댑터 |
| **Identity** | `User`, `AuditLog` | 얇음 |
| **Notification** | `NotificationLog` | 이벤트 소비자 |

### 확정된 소유권 결정

- **`TeeSlot`은 Catalog가 아니라 Booking이 소유한다.** 슬롯은 골프장 마스터 데이터가 아니라 **재고**이며,
  예약 확정과 슬롯 점유는 하나의 트랜잭션 안에서 원자적이어야 한다 → `docs/adr/0002-slot-owned-by-booking.md`
- **Pricing은 별도 모듈로 분리하지 않는다.** 요금 규칙은 마스터 데이터이므로 Catalog에 둔다.
  다만 요금 계산 로직 자체는 Catalog 안의 독립된 순수 함수로 격리한다.
- **Payment는 독립 모듈이되 Booking을 전혀 모른다.** 금액·멱등키·결과만 다루며,
  "누가 왜 결제하는지"를 알지 못한다. 실 PG 교체 시 Payment 내부만 바뀐다.

---

## 의존 방향

```
                    ┌──────────┐
                    │ Identity │   (userId 값만 전달, 도메인 의존 없음)
                    └──────────┘

  ┌─────────┐  읽기    ┌─────────┐   호출    ┌─────────┐
  │ Catalog │◄─────────│ Booking │──────────►│ Payment │
  └─────────┘ contracts└────┬────┘ contracts └─────────┘
                            │
                            │ 도메인 이벤트 (Outbox)
                            ▼
                    ┌──────────────┐
                    │ Notification │
                    └──────────────┘

  모든 모듈 ──► shared-kernel
```

**규칙**

- 순환 의존 없음. Notification은 아무도 참조하지 않으며 이벤트만 구독한다.
- Catalog와 Payment는 Booking의 존재를 모른다.
- 동기 호출은 **결과가 즉시 필요할 때만** (요금 조회, 결제 승인). 나머지는 전부 이벤트.
- **모듈 경계를 넘는 트랜잭션 금지.** 같은 DB라서 여러 DataSource를 한 트랜잭션에 묶는 것이
  기술적으로 가능하지만, 하는 순간 모듈 경계가 거짓말이 된다. 경계 밖 일관성은 아웃박스 + 보상으로만.

---

## 패키지 구조

각 모듈은 **2개 패키지**로 나눈다. 공개 계약만 별도 패키지에 두면 다른 모듈이 내부를
참조하려 할 때 **타입 체크가 깨진다.** 문서로 지키는 규칙이 아니라 도구가 지키는 규칙이 된다.

```
packages/
  shared-kernel/            @teetime/shared-kernel      Result, ErrorCode, 시간 타입, Decimal — 순수 TypeScript
  persistence-kernel/       @teetime/persistence-kernel TypeORM/pg 전용. 타입 파서, 컬럼 transformer, 트랜잭션 헬퍼
  catalog-contracts/        @teetime/catalog-contracts  public: CatalogApi, CourseSnapshot, GreenFeeQuote
  catalog/                  @teetime/catalog
  booking-contracts/        @teetime/booking-contracts  public: 통합 이벤트만
  booking/                  @teetime/booking
  payment-contracts/        @teetime/payment-contracts  public: PaymentApi, PaymentResult
  payment/                  @teetime/payment
  identity-contracts/       @teetime/identity-contracts
  identity/                 @teetime/identity
  notification/             @teetime/notification       (contracts 불필요 — 아무도 호출하지 않는다)

apps/
  api/                      @teetime/api   NestJS 호스트. 모듈 조립만. 비즈니스 로직 금지
  customer/                 Next.js
  admin/                    Next.js

tests/
  architecture/             경계 위반 검출
```

### 참조 규칙

`package.json`의 `dependencies`에 없는 패키지는 **import 자체가 타입 에러**다.

| 패키지 | 참조 가능 |
|---|---|
| `shared-kernel` | 없음 (외부 라이브러리만) |
| `persistence-kernel` | `shared-kernel` |
| `*-contracts` | `shared-kernel`만 |
| `booking` | `booking-contracts`, `catalog-contracts`, `payment-contracts`, `shared-kernel`, `persistence-kernel` |
| `catalog` | `catalog-contracts`, `shared-kernel`, `persistence-kernel` |
| `payment` | `payment-contracts`, `shared-kernel`, `persistence-kernel` |
| `identity` | `identity-contracts`, `shared-kernel`, `persistence-kernel` |
| `notification` | `booking-contracts`, `shared-kernel`, `persistence-kernel` |
| `api` | 전부 (조립 전용) |

**`persistence-kernel`을 나눈 이유** — 시간·금액 컬럼의 transformer와 pg 타입 파서 설정은
공유돼야 하지만 `typeorm`과 `pg`에 의존한다. 이것을 `shared-kernel`에 두면
`*-contracts`가 `shared-kernel`을 거쳐 ORM에 간접 의존하게 되어,
"계약은 영속성을 모른다"는 규칙이 표만 지키고 실제로는 깨진다.
패키지 하나가 그 대가다.

### 진입점을 하나로 막는다

TypeScript에는 패키지 밖 접근을 막는 언어 수준 한정자가 없다.
대신 **패키지의 `exports` 필드**가 그 역할을 한다.

```jsonc
// packages/booking/package.json
{
  "name": "@teetime/booking",
  "exports": { ".": "./src/index.ts" }   // 이 한 줄만. 서브패스를 열지 않는다
}
```

`import { HoldSlotHandler } from '@teetime/booking/src/features/hold-slot/hold-slot.handler'`
같은 deep import는 Node와 TypeScript가 **모듈 해석 단계에서 거부한다.**
각 모듈의 `index.ts`가 내보내는 것은 **NestJS 모듈 클래스 하나뿐**이다.

```ts
// packages/booking/src/index.ts  ← 이 패키지에서 유일한 공개 심볼
export { BookingModule } from './booking.module';
```

`apps/api`는 모듈을 나열하며 조립만 한다.

```ts
@Module({
  imports: [CatalogModule, BookingModule, PaymentModule, IdentityModule, NotificationModule],
})
export class AppModule {}
```

---

## DB 스키마 분리

단일 PostgreSQL 인스턴스, **모듈당 스키마 1개**, **모듈당 DataSource 1개**.

```
catalog.*        clubs, courses, operating_rules, green_fee_rules
booking.*        tee_slots, bookings, outbox_messages
payment.*        transactions
identity.*       users, audit_logs
notification.*   notification_logs
```

- 각 DataSource는 이름을 갖고(`'booking'`) 자기 스키마의 엔티티만 등록한다.
  다른 모듈의 엔티티를 등록하면 아키텍처 테스트가 실패한다.
- **`synchronize`는 어떤 환경에서도 `false`다.** 마이그레이션은 앱 기동 경로 밖에서 적용한다
  → `docs/adr/0006-migrations-applied-outside-app-startup.md`
- **스키마를 넘는 FK 금지.** `booking.tee_slots.course_id`는 `catalog.courses`를 가리키지만 FK를 걸지 않는다.
- **모듈 내부 FK는 정상이고 권장된다.** `booking.bookings.tee_slot_id → booking.tee_slots.id`는 FK를 건다.
- FK를 포기하는 대가로 참조 무결성이 약해지므로 **삭제 정책**을 명시한다:
  예약이 존재하는 코스는 하드 삭제 금지, `isActive = false` 소프트 삭제만 허용.

---

## 모듈 간 통신

### 동기 — Booking → Catalog (요금 조회)

NestJS의 DI 토큰은 값이어야 하므로 인터페이스를 쓸 수 없다. **추상 클래스를 토큰 겸 타입으로** 쓴다.
계약 패키지는 `@nestjs/*`와 `typeorm`에 의존하지 않는다 — 순수 TypeScript다.

```ts
// @teetime/catalog-contracts
export abstract class CatalogApi {
  abstract getCourse(courseId: string): Promise<CourseSnapshot | null>;
  abstract quoteGreenFee(courseId: string, teeDate: LocalDate, teeTime: LocalTime): Promise<GreenFeeQuote | null>;
  abstract getOperatingDays(courseId: string, from: LocalDate, to: LocalDate): Promise<OperatingDaySnapshot[]>;
}
```

`CourseSnapshot`은 Catalog의 엔티티가 아니라 **DTO**다. 엔티티를 경계 밖으로 내보내면 모듈 분리가 무의미해진다.
Catalog 모듈이 `{ provide: CatalogApi, useClass: CatalogApiService }`로 구현을 등록하고,
Booking은 `CatalogApi`만 주입받는다.

### 동기 — Booking → Payment (결제 승인)

```ts
// @teetime/payment-contracts
export abstract class PaymentApi {
  abstract authorize(request: PaymentRequest): Promise<PaymentResult>;
  abstract refund(transactionId: string, amount: Decimal): Promise<RefundResult>;
}

export type PaymentRequest = {
  idempotencyKey: string;
  amount: Decimal;
  currency: string;
  payerId: string;
};
```

### 비동기 — Booking → Notification (아웃박스 경유)

```ts
// @teetime/booking-contracts — 이벤트 타입만 public
export type BookingConfirmed = {
  bookingId: string; userId: string; courseId: string; teeAt: Instant; amount: Decimal;
};
export type BookingCancelled = { bookingId: string; userId: string; refundAmount: Decimal };
```

예약 확정과 아웃박스 INSERT는 **같은 트랜잭션**이다(동일 모듈이므로 가능).
디스패처가 별도로 읽어 Notification에 전달한다 → `docs/adr/0004-outbox-in-process-dispatch.md`

---

## 모듈 내부 구조 — 균일하게 만들지 말 것

모든 모듈에 DDD를 바르는 것은 과설계다. **복잡도에 비례해서** 다르게 간다.

### Booking — 리치 도메인

```
src/
  domain/
    slots/            tee-slot.entity.ts, slot-generation-spec.ts, slot-bookability.ts
    bookings/         booking.entity.ts, booking-status.ts, booking-number.ts, refund-policy.ts
  features/
    hold-slot/        controller + handler + contracts
    confirm-booking/
    cancel-booking/
    generate-slots/   (어드민)
    query-slots/
  persistence/        데이터소스 설정, 엔티티 스키마, 마이그레이션
  infrastructure/     slot-expiry-sweeper.ts, outbox-dispatcher.ts
  booking.module.ts
  index.ts
```

`domain/slots/`와 `domain/bookings/`는 폴더 수준으로 분리하고 참조는 `bookings → slots` 단방향만 허용한다.
장래에 재고를 독립 모듈로 승격시킬 때 `slots/`를 통째로 옮길 수 있게 하기 위함이다 → `docs/adr/0002-slot-owned-by-booking.md`

### Catalog / Identity / Notification — 얇게

```
src/
  features/           create-club/, update-course/ ...   (Repository 직접 사용)
  persistence/
  catalog.module.ts
  index.ts
```

**리포지토리 추상화, 애그리거트 루트, 도메인 이벤트를 만들지 않는다.** CRUD다.
모듈마다 내부 구조가 다른 것 자체가 판단의 결과이며, 그 이유를 README에 쓴다.

---

## 경계 강제

문서로 부탁하지 않고 **실패하게 만든다.**

| 층 | 수단 |
|---|---|
| 타입 체크 | `package.json` `dependencies` + TS project references — 선언하지 않은 패키지는 해석 실패 |
| 진입점 | `exports` 필드로 `.` 하나만 노출 (deep import 차단) |
| 정적 분석 | `dependency-cruiser` 규칙 — 순환·금지 참조 검출 |
| 테스트 | `tests/architecture` — `package.json` 선언을 참조 규칙 표와 대조 |
| DB | 모듈별 스키마 + DataSource별 엔티티 등록 범위 제한 |
| 빌드 | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESLint 에러 0 |

### 아키텍처 테스트가 검증할 항목

- `booking` 패키지가 `@teetime/catalog`(구현체)를 import하지 않는다
- `*-contracts` 패키지가 `typeorm` / `@nestjs/*`에 의존하지 않는다
- `apps/api`에 엔티티·리포지토리·마이그레이션이 등장하지 않는다
- 각 DataSource의 엔티티가 자기 스키마에만 매핑된다
- 모듈 간 순환 참조가 없다
- 각 패키지의 `package.json` `dependencies`가 참조 규칙 표와 정확히 일치한다
