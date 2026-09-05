# TeeTime — 골프 티타임 예약 플랫폼

포트폴리오 프로젝트. 핵심 가치는 **부킹 엔진의 동시성 제어**다.
CRUD 완성도보다 동시성·트랜잭션 정합성이 우선한다.
화면이 부족한 것은 감점이 아니지만, 오버부킹이 발생하는 것은 프로젝트 실패다.

## 현재 위치

작업 시작 전 `docs/roadmap.md`의 체크박스를 먼저 확인할 것.
git log로 진행 상황을 추측하지 말 것.

## 문서 지도

| 문서 | 언제 읽나 |
|---|---|
| `docs/domain.md` | 용어·불변식·상태 전이를 다룰 때 (**식별자 이름을 정할 때 필수**) |
| `docs/modules.md` | 파일 위치·패키지 참조·프로젝트 구조를 다룰 때 |
| `docs/conventions.md` | **코드를 쓰기 전** — 에러 처리·트랜잭션 경계·검증·네이밍·테스트 |
| `docs/schema.md` | 테이블·인덱스·제약·TypeORM 매핑을 다룰 때 |
| `docs/adr/` | 설계를 바꾸자고 제안하기 **전에** |
| `docs/roadmap.md` | 세션 시작 시 |

## 명령어

```bash
pnpm install
pnpm typecheck                                     # 워크스페이스 전체
pnpm lint
pnpm test                                          # 전체
pnpm --filter @teetime/booking test                # 모듈 하나
pnpm test:arch                                     # 모듈 경계 검증
docker compose up -d postgres                      # PostgreSQL
pnpm --filter @teetime/api start:dev
pnpm --filter @teetime/booking migration:generate <Name>
pnpm --filter @teetime/booking migration:run
pnpm --filter @teetime/api seed-admin              # 어드민 계정 시드 (웹 기동 안 함)
```

## 절대 규칙

위반하는 코드는 되돌린다.

1. **모듈 경계를 넘는 트랜잭션 금지.** 경계 밖 일관성은 아웃박스 + 보상으로만 달성한다.
   같은 DB라서 여러 DataSource를 한 트랜잭션에 묶는 것이 기술적으로 가능하지만,
   하는 순간 모듈 경계가 거짓말이 된다.
2. **모듈 간 참조는 `*-contracts` 패키지만.** 구현 패키지 직접 참조 금지.
3. **엔티티를 contracts로 내보내지 말 것.** 경계를 넘는 것은 DTO/타입만.
4. **DB 스키마를 넘는 FK 금지** (ID 값만 저장). 모듈 내부 FK는 정상이고 권장된다.
5. **`Date` 사용 금지.** `@js-joda/core`의 `Instant` / `LocalDate` / `LocalTime`만 쓴다.
   `date` 컬럼을 `Date`로 받으면 서버 타임존에 따라 날짜가 밀린다 → `docs/schema.md`
6. **금액에 `number` 사용 금지.** `Decimal`만 쓴다. 이진 부동소수점은 돈을 표현하지 못한다.
7. **슬롯 홀드 경로는 raw SQL(`FOR UPDATE`)을 유지한다.** 쿼리 빌더로 "정리"하지 말 것
   → `docs/adr/0003-pessimistic-lock-for-hold.md`
8. **가격은 예약 시점 스냅샷.** 조회 시 재계산 금지.
9. **`TeeSlot`에 상태 컬럼을 추가하지 말 것.** 점유는 활성 예약의 존재로 파생된다
   → `docs/schema.md`, `docs/adr/0002-slot-owned-by-booking.md`
10. **`synchronize` / `migrationsRun`을 켜지 말 것.** 어떤 환경에서도 `false`다
    → `docs/adr/0006-migrations-applied-outside-app-startup.md`

## 하지 말 것

기본 습관을 막기 위한 목록. 요청받았더라도 아래에 해당하면 먼저 이견을 말할 것.

- **Catalog / Identity / Notification에 리포지토리 추상화·애그리거트·도메인이벤트를 만들지 말 것.**
  얇은 CRUD다. TypeORM `Repository` 직접 사용이 정답. 리치 도메인은 Booking에만
  → `docs/adr/0001-modular-monolith.md`
- **`@nestjs/cqrs` 도입 금지.** 핸들러 클래스를 provider로 직접 등록한다.
- **`typeorm-transactional` 도입 금지.** 트랜잭션은 `queryRunner`로 명시적으로 연다
  → `docs/conventions.md` §2
- **예상된 실패를 `throw`하지 말 것.** `ConflictException`이 NestJS 관용이지만 이 프로젝트는
  `Result`를 쓴다. 이유는 `docs/conventions.md` §1.
- **테스트에서 Repository를 mock 하지 말 것.** Testcontainers로 실제 PostgreSQL을 띄운다.
- **sqlite / 인메모리 드라이버 금지.** 트랜잭션·제약·부분 인덱스를 검증하지 못한다.
- **Redis / 캐시 / 메시지 브로커 / MSA 분리를 제안하지 말 것.**
  병목이 측정으로 증명되기 전까지 금지 → `docs/adr/0001-modular-monolith.md`
- **`any`와 non-null 단언(`!`)을 쓰지 말 것.** 예외는 TypeORM 엔티티 필드 선언뿐이다.
- **요청받지 않은 리팩터링·파일 생성 금지.** 특히 "김에 정리했습니다" 금지.
- **MVP 범위 밖 기능을 미리 만들지 말 것.** 범위는 `docs/roadmap.md` 하단 참조.

## 작업 방식

- 구현 전 변경 계획을 먼저 제시하고 승인을 받는다. 파일 여러 개를 한 번에 만들기 전에는 반드시.
- 코드를 쓰기 전 `docs/conventions.md`를 따른다. 특히 트랜잭션 경계와 에러 처리는 임의로 정하지 않는다.
- 도메인 규칙에 대한 판단이 필요하면 임의로 정하지 말고 물어본다.
  (예: 홀드 TTL, 리드타임, 환불율 — 값은 `docs/domain.md`에 있고 없으면 질문한다.)
- 설계 결정을 내렸으면 `docs/adr/`에 기록한다. 코드만 남기지 않는다.
- 작업을 마치면 `docs/roadmap.md` 체크박스와 진행 기록을 갱신한다.
- 커밋은 논리 단위로. 한 커밋에 여러 관심사를 섞지 않는다.
  형식은 Conventional Commits (`feat(booking): 한국어 제목`) — `docs/conventions.md` §12.
- 규칙에 어긋난 코드를 내가 작성했다면, 지적받은 뒤 이 파일의 "하지 말 것"에 한 줄 추가한다.

## 용어

`docs/domain.md`의 용어표를 따른다. 식별자 이름을 임의로 바꾸거나 동의어를 섞지 말 것.
특히: `TeeSlot`(≠TeeTime, ≠Slot), `Booking`(≠Reservation), `Hold`(≠Lock, ≠Pending).

## 기술 스택

- Node 24 / TypeScript / NestJS
- TypeORM + PostgreSQL (모듈별 스키마·DataSource 분리, 단일 인스턴스)
- 시간은 `@js-joda/core`, 금액은 `decimal.js`
- pnpm 워크스페이스 (모듈당 패키지 2개: 구현 + contracts)
- 테스트: Vitest + `unplugin-swc` + Testcontainers
- 프론트: Next.js + shadcn/ui + Tailwind (BFF 없이 API 직접 호출)
