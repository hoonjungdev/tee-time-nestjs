# 코딩 규약

`docs/modules.md`가 **"무엇이 어디에 속하는가"** 라면, 이 문서는 **"코드를 어떻게 쓰는가"** 다.
포맷·네이밍 같은 기계적 규칙은 ESLint와 Prettier가 강제하므로 여기 쓰지 않는다.
여기에는 **결정하지 않으면 매번 달라지는 것**만 적는다.

---

## 1. 에러 처리

### 예상된 실패는 `Result`, 진짜 예외만 `throw`

```ts
// 예상된 실패 — 정상 흐름의 일부다
Result<HoldSlotResponse> → 409 SlotUnavailable, 409 SlotTooLate, 404 SlotNotFound

// 예외 — 프로그래밍 오류, 인프라 장애
throw → DB 연결 끊김, 직렬화 실패, 도달 불가능한 분기
```

"이미 점유된 슬롯"은 **예외가 아니라 예상된 결과**다. 오픈 시각에는 대부분의 요청이 이 경로로 끝난다.

NestJS의 관용은 `throw new ConflictException()`이지만 이 프로젝트는 따르지 않는다.
V8에서 `Error` 생성은 스택 캡처를 동반하고, 그 비용은 던지는 깊이에 비례한다.
초당 수백 건이 정상적으로 409가 되는 경로에서 이것은 측정 가능한 낭비이며,
무엇보다 **정상 트래픽이 에러 로그를 오염시킨다.**

`Result`는 `shared-kernel`에 둔다. 실패는 `ErrorCode`(문자열 리터럴 유니온) + 메시지를 갖는다.

```ts
export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };
```

`throw`는 **정말 예외일 때만** 쓴다. 전역 예외 필터가 500 + `traceId`로 받는다.

### 응답 변환은 컨트롤러에서

```ts
// features/hold-slot/hold-slot.controller.ts
const result = await this.handler.handle(request, userId, idempotencyKey);
return toHttp(result);   // shared-kernel. 실패면 ErrorCode → status 매핑표를 탄다
```

- `ErrorCode → HTTP status` 매핑표는 `shared-kernel`에 한 곳으로 모은다. 컨트롤러마다 하드코딩하지 않는다.
- 전역 예외 필터는 **처리되지 않은 예외만** 담당한다. 도메인 실패를 여기서 잡지 않는다.
- 응답 본문은 RFC 9457 Problem Details 형식이며 `errorCode`와 `traceId`를 반드시 포함한다.

### HTTP 상태 코드 규약

| 상황 | 코드 | `errorCode` 예 |
|---|---|---|
| 요청 형식 오류 | 400 | `InvalidRequest` |
| 미인증 / 권한 없음 | 401 / 403 | |
| 대상 없음 | 404 | `SlotNotFound`, `BookingNotFound` |
| 슬롯이 이미 점유됨 | 409 | `SlotUnavailable` |
| 리드타임 초과·차단·과거 시각 | 409 | `SlotTooLate`, `SlotBlocked` |
| 상태 전이 불가 (예: 이미 취소됨) | 409 | `InvalidStateTransition` |
| 매칭되는 요금 규칙 없음 | 409 | `GreenFeeNotConfigured` |
| 결제 승인 실패 | 402 | `PaymentDeclined` |
| 결제 응답 유실 (승인 여부 불명) | 504 | `PaymentTimeout` |

422는 쓰지 않는다. 400과 409로 충분하며 구분 기준이 모호해진다.

---

## 2. 트랜잭션 경계

### 핸들러가 명시적으로 연다

```ts
const runner = this.dataSource.createQueryRunner();
await runner.connect();
await runner.startTransaction();
try {
  // ... 모든 문장이 runner.manager / runner.query 를 탄다
  await runner.commitTransaction();
} catch (e) {
  await runner.rollbackTransaction();
  throw e;
} finally {
  await runner.release();
}
```

`queryRunner`를 직접 잡는 이유는 **같은 커넥션 보장**이다. `FOR UPDATE`로 잡은 락과
뒤따르는 문장이 다른 커넥션에 흩어지면 잠금이 아무것도 지키지 못한다.

**`typeorm-transactional` 같은 AsyncLocalStorage 기반 자동 커밋 데코레이터를 쓰지 않는다.**
홀드 경로는 트랜잭션 범위를 정밀하게 통제해야 하는데, 자동 커밋은 그 통제를 불가능하게 만든다.
명시성이 편의보다 우선한다.

### 외부 호출을 트랜잭션 안에 넣지 않는다

결제 승인은 네트워크 호출이고 수 초가 걸릴 수 있다. 트랜잭션 안에 넣으면
슬롯 락을 그 시간만큼 붙들어 커넥션 풀이 고갈된다.

```
① 홀드 트랜잭션      (짧게) → 커밋
② 결제 승인          (트랜잭션 밖, 외부 호출)
③ 확정 트랜잭션      (짧게) → 커밋 + 아웃박스
```

②가 실패하면 ③ 대신 보상(홀드 해제)을 수행한다. ②의 응답이 유실되면 홀드 TTL이 회수한다.

### 아웃박스는 항상 같은 트랜잭션에

`BookingConfirmed` / `BookingCancelled` 기록은 상태 변경과 **반드시 같은 트랜잭션**이다.
별도 커밋으로 분리하면 아웃박스의 존재 의미가 사라진다.

---

## 3. 검증 — 3층

| 층 | 무엇을 | 어디서 |
|---|---|---|
| 형식 | 필수값, 범위, 형변환 | 요청 DTO + 전역 `ValidationPipe` |
| 도메인 불변식 | `docs/domain.md`의 10개 항목 | 도메인 메서드 안 |
| 최후 방어선 | 유니크·체크 제약 | DB |

- 형식 검증은 `class-validator` 데코레이터로 한다. 손으로 쓰지 않는 이유는 하나뿐이다 —
  **프론트가 읽는 계약이 OpenAPI 문서 하나이기 때문이다.** `@nestjs/swagger`가 이 데코레이터를
  읽어 스키마를 만들고, 프론트는 그 문서에서 타입을 생성한다. 검증을 손으로 쓰면 계약이 문서에서 사라진다.
- `ValidationPipe`는 `whitelist: true`, `forbidNonWhitelisted: true`로 켠다. 모르는 필드는 거부한다.
- **도메인 불변식을 DTO 검증에 넣지 않는다.** "인원이 슬롯 정원 이하"는 슬롯을 읽어야 알 수 있고,
  DTO는 그것을 모른다. 도메인 메서드 안으로 넣는다 — 핸들러나 파이프에 있으면 다른 호출 경로가 생겼을 때 우회된다.
- 세 층은 중복되며, 중복은 의도된 것이다. 어느 하나를 "이미 위에서 검사했으니" 제거하지 않는다.

---

## 4. Feature 파일 구성

feature 하나 = 폴더 하나. 파일 3개가 기본이다.

```
features/hold-slot/
  hold-slot.controller.ts   // 라우팅·인가·Result→HTTP 변환만
  hold-slot.handler.ts      // 실제 로직. 트랜잭션 경계를 여기서 연다
  hold-slot.contracts.ts    // HoldSlotRequest / HoldSlotResponse
```

- 컨트롤러에 비즈니스 로직을 넣지 않는다. 핸들러 호출 + 응답 변환까지다.
- 파일이 3개를 넘으면(예: 별도 쿼리 객체) 폴더 안에서 나눈다. 폴더 밖으로 빼지 않는다.
- **핸들러는 인터페이스를 만들지 않는다.** 구현 클래스를 그대로 provider로 등록한다.
  (테스트는 Testcontainers 통합 테스트로 하며, 핸들러를 mock 하지 않는다.)
- 모듈 경계를 넘는 계약만 추상 클래스를 갖는다(`CatalogApi`, `PaymentApi`). 그것이 유일한 예외다.

---

## 5. 네이밍

### 파일

`kebab-case.역할.ts` — `hold-slot.handler.ts`, `tee-slot.entity.ts`, `refund-policy.ts`
디렉터리도 kebab-case다.

### 타입 접미사

| 접미사 | 용도 |
|---|---|
| `XxxRequest` / `XxxResponse` | HTTP 경계의 요청·응답 |
| `XxxSnapshot` | **모듈 경계를 넘는** 읽기 전용 DTO (예: `CourseSnapshot`) |
| `XxxQuote` | 계산 결과를 담아 경계를 넘는 값 (예: `GreenFeeQuote`) |
| 과거형 명사구 | 통합 이벤트 (예: `BookingConfirmed`) |

- **`XxxDto` 금지.** NestJS 예제가 쓰는 이름이지만 아무 의미도 전달하지 않는다.
  `Request`/`Response`/`Snapshot`이 그 자리에서 무엇인지 말한다.
- **`XxxService` 남용 금지.** 핸들러로 충분한 것을 서비스로 감싸지 않는다.
- 엔티티 이름은 `docs/domain.md`의 용어표를 따른다. 동의어를 섞지 않는다.

### 라우트

```
/api/...              고객용
/api/admin/...        어드민용 (AdminGuard)
```

- 리소스는 복수형 소문자: `/api/bookings`, `/api/courses`
- CRUD로 표현되지 않는 동작은 콜론 접미사: `POST /api/admin/courses/:courseId/slots:generate`
- 쿼리 파라미터는 camelCase: `?timeBand=Mid`

### 마이그레이션

`<동사><대상><타임스탬프>` — 클래스명은 `AddTeeSlots1735689600000` 형태를 따른다.
모듈별로 독립이므로 이름이 겹쳐도 무방하다.

---

## 6. 타입 스타일

- `tsconfig`는 `strict`에 더해 `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`를 켠다.
- **`any` 금지.** 외부 경계에서 타입을 모르면 `unknown`으로 받고 좁힌다.
- **non-null 단언(`!`) 금지.** 예외는 TypeORM 엔티티의 필드 선언뿐이다(`id!: string`).
  런타임 값에 `!`를 붙이면 `strictNullChecks`를 켠 의미가 사라진다.
- DTO·이벤트·값 객체는 `type` 또는 `readonly` 필드를 가진 클래스. 엔티티는 클래스.
- **도메인 엔티티의 상태 변경은 도메인 메서드로만 한다.** `booking.status = 'Confirmed'` 형태의
  직접 대입을 허용하지 않으며, 상태를 바꾸는 메서드는 전이 규칙을 스스로 검사한다.
- 시간 타입은 `@js-joda/core`만 쓴다. **`Date` 금지** — 이유는 `docs/schema.md`.
- 금액은 `Decimal`만 쓴다. **`number` 금지** — 이유는 `docs/schema.md`.

---

## 7. 비동기

- **떠 있는 프로미스 금지.** `@typescript-eslint/no-floating-promises`를 에러로 켠다.
  배경 작업조차 `void promise.catch(...)`로 처리를 명시한다.
- `Promise.all`로 병렬화할 때 **같은 트랜잭션의 쿼리를 섞지 않는다.**
  하나의 커넥션에 동시 문장을 보내는 것이며 결과는 정의되지 않는다.
- **이벤트 루프를 막지 않는다.** 동기 파일 IO, 큰 배열의 동기 순회, 정규식 폭주를 피한다.
  단일 스레드이므로 한 요청의 CPU 점유가 전체 지연이 된다.
- `async` 함수 이름에 `...Async` 접미사를 붙이지 않는다. TypeScript에서는 반환 타입이 말한다.

---

## 8. 로깅

- **구조적 로깅만.** 로거는 `pino`(`nestjs-pino`)를 쓰고, 메시지에 값을 문자열 보간하지 않는다.

```ts
// ✅
logger.debug({ bookingId, teeSlotId }, 'Slot held');
// ❌
logger.debug(`Slot held. ${bookingId}`);
```

- 필드 이름을 고정한다: `bookingId`, `teeSlotId`, `courseId`, `userId`, `idempotencyKey`, `errorCode`
- 레벨 기준

| 레벨 | 쓰는 경우 |
|---|---|
| `error` | 처리되지 않은 예외, 아웃박스 발송 실패 |
| `warn` | 결제 실패, 보상 트랜잭션 수행, 부분 유니크 인덱스가 오버부킹을 막은 경우 |
| `info` | 예약 확정·취소, 슬롯 생성 배치 결과 |
| `debug` | 홀드 시도/거절 (409는 정상 트래픽이므로 `warn`이 아니다) |

- **비밀번호·토큰·결제 정보를 로그에 남기지 않는다.** pino의 `redact`로 경로를 지정해 둔다.

---

## 9. 테스트

### 러너

**Vitest + `unplugin-swc`.**

NestJS 12는 ESM 전용 패키지(`"type": "module"`)이므로 프로젝트 전체가 ESM이다.
CommonJS로 변환해 테스트하면 프레임워크 자체를 로드할 수 없다 — Jest의 ESM 지원은
아직 실험적 플래그(`--experimental-vm-modules`)를 요구하므로 택하지 않았다.

Vite의 기본 변환기 esbuild는 `emitDecoratorMetadata`를 지원하지 않는데,
TypeORM 매핑과 NestJS DI가 그 메타데이터에 의존한다. 그래서 변환기만 SWC로 바꾼다.
이 조합이 실제로 동작하는지는 `packages/booking/test/toolchain.test.ts`가 검증한다 —
ESM 로드 · `design:type` 방출 · 부분 유니크 인덱스 메타데이터 수집 세 가지다.

### 구분 기준

| 종류 | 대상 | 인프라 |
|---|---|---|
| 단위 | 순수 함수 — 요금 계산, 환불액 계산, 상태 전이 규칙, `TimeBand` 판정 | 없음 |
| 통합 | 동시성, DB 제약, 트랜잭션, 아웃박스, 엔드포인트 | Testcontainers |

- **Repository를 mock 하지 않는다. sqlite/인메모리 드라이버로 대체하지 않는다.**
  부분 유니크 인덱스·행 락·트랜잭션을 검증하지 못하므로 이 프로젝트에서는 무의미하다.
- Testcontainers 컨테이너는 파일 단위 `beforeAll`에서 띄워 재사용하고, 테스트마다 스키마를 초기화한다.
- 동시성 테스트는 `Promise.all`로 N개 요청을 동시에 쏘되, **각 요청이 자기 커넥션을 잡아야 한다.**
  같은 `queryRunner`를 공유하면 직렬화되어 아무것도 검증하지 못한다.

### 네이밍

`대상_시나리오_기대결과`

```
holdSlot_슬롯이_이미_점유됨_409
holdSlot_이전_홀드가_만료됨_성공
holdSlot_동시_50요청_정확히_1건만_성공
calculateRefund_티오프_5일_전_80퍼센트
```

- `docs/domain.md`의 불변식 10개는 각각 대응 테스트를 갖는다.
- `docs/roadmap.md`의 M2 완료 기준은 반드시 통합 테스트로 존재한다.

---

## 10. TypeORM 사용

매핑 규칙은 `docs/schema.md`의 "TypeORM 매핑 요점"에 있다. 여기서는 사용 규칙만 적는다.

- 조회는 QueryBuilder의 `select`로 필요한 컬럼만 뽑는다. 엔티티 전체를 읽어 매핑하지 않는다.
- 목록 조회에서 `relations` 남용을 피한다. 조인이 필요하면 명시적으로 쓴다.
- **홀드 경로는 raw SQL을 유지한다.** QueryBuilder로 바꾸지 않는다
  → `docs/adr/0003-pessimistic-lock-for-hold.md`
- **`synchronize` / `migrationsRun`을 켜지 않는다.** 어떤 환경에서도 `false`다.
- 엔티티 정의는 모듈의 `persistence/` 아래에 둔다. feature 폴더에 흩지 않는다.
- 각 모듈은 자기 이름의 DataSource만 주입받는다. 다른 모듈의 DataSource 토큰을 쓰지 않는다.

---

## 11. 금지 의존성

근거 없이 늘리지 않는다. 추가하려면 먼저 이유를 제시하고 승인을 받는다.

| 금지 | 대신 |
|---|---|
| `@nestjs/cqrs` | 핸들러 클래스를 provider로 직접 등록한다 |
| `automapper` / `class-transformer` 매핑 남용 | 손으로 쓴 매핑 함수 |
| `typeorm-transactional` | `queryRunner`를 명시적으로 잡는다 (§2) |
| Redis / 캐시 | 부하 테스트로 병목이 증명되기 전까지 금지 |
| BullMQ / Agenda / 메시지 브로커 | 아웃박스 + `@nestjs/schedule` |
| sqlite / 인메모리 DB 드라이버 | Testcontainers |
| 리포지토리 추상화 라이브러리 | TypeORM `Repository`를 그대로 |

배경 작업은 `@nestjs/schedule`의 `@Interval` / `@Cron`으로 충분하다.
별도 워커 프로세스와 큐를 도입하지 않는다 → `docs/adr/0004-outbox-in-process-dispatch.md`

---

## 12. 커밋

포트폴리오 프로젝트이므로 **git log 자체가 산출물**이다. 리뷰어가 읽는다는 전제로 쓴다.

### 형식 — Conventional Commits

```
<type>(<scope>): <제목>

<본문 — 왜 이렇게 했는지. 선택>
```

- `type`과 `scope`는 영문 소문자, **제목과 본문은 한국어**로 쓴다.
- 제목은 명사형 종결 또는 "~ 추가/수정/제거" 형태. 마침표를 찍지 않는다.
- 제목 50자 내외, 본문은 72자에서 줄바꿈한다.

### type

| type | 용도 |
|---|---|
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가·수정 |
| `docs` | 문서 |
| `build` | 빌드·의존성·Docker |
| `ci` | GitHub Actions |
| `chore` | 그 외 (설정 파일 등) |

### scope — 모듈 이름

`booking` · `catalog` · `payment` · `identity` · `notification` · `api` · `shared` · `frontend`

모듈에 속하지 않으면 생략한다. 여러 모듈에 걸치면 그 커밋이 너무 큰 것이므로 쪼갠다.

### 예

```
feat(booking): 슬롯 홀드 동시성 제어 구현

슬롯 row에 FOR UPDATE를 걸어 동시 요청을 직렬화하고,
락 안에서 만료된 홀드를 Expired로 전이시킨 뒤 예약을 INSERT한다.
부분 유니크 인덱스를 2차 방어선으로 둔다.

상세: docs/adr/0003-pessimistic-lock-for-hold.md
```

### 규칙

- **한 커밋에 하나의 관심사만.** 리팩터링과 기능 추가를 섞지 않는다.
- **동작을 바꾸는 커밋에는 대응 테스트가 같은 커밋에 들어간다.** `feat` 다음에 오는 `test`로 분리하지 않는다.
- ADR이 있는 결정을 구현할 때는 본문에 문서 경로를 남긴다.
- `docs/roadmap.md` 체크박스 갱신은 해당 작업 커밋에 포함시킨다. 별도 커밋으로 만들지 않는다.
- WIP·임시 커밋을 남기지 않는다. 필요하면 정리한 뒤 커밋한다.
