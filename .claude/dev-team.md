# dev-team 카드

`/dev-team`이 이 저장소에서 어떻게 동작할지 정하는 파일이다.
사람이 직접 편집해도 된다. 비워둔 항목은 기본값으로 폴백한다.

## 규칙

문서: CLAUDE.md, docs/conventions.md, docs/domain.md, docs/modules.md, docs/schema.md, docs/adr/
범용 체크리스트 모드: false

필수 인라인 규칙:

  - 시각은 `@js-joda/core`(`Instant`/`LocalDate`/`LocalTime`). `Date` 금지.
    `date` 컬럼을 `Date`로 받으면 서버 타임존에 따라 날짜가 밀린다
  - 금액은 `Decimal`(decimal.js). `number` 금지. 이진 부동소수점은 돈을 표현하지 못한다
  - `any`와 non-null 단언(`!`) 금지. 예외는 TypeORM 엔티티 필드 선언뿐
  - 예상된 실패는 `throw`가 아니라 `Result`. `ConflictException` 같은 NestJS 관용을 쓰지 말 것
  - 모듈 경계를 넘는 트랜잭션 금지. 경계 밖 일관성은 아웃박스 + 보상으로만 달성한다
  - 모듈 간 참조는 `*-contracts` 패키지만. 구현 패키지 직접 참조 금지.
    엔티티를 contracts로 내보내지 말 것. DB 스키마를 넘는 FK 금지(ID 값만 저장)
  - 슬롯 홀드 경로의 raw SQL(`FOR UPDATE`)을 유지한다. 쿼리 빌더로 "정리"하지 말 것
  - `TeeSlot`에 상태 컬럼을 추가하지 말 것. 점유는 활성 예약의 존재로 파생된다.
    가격은 예약 시점 스냅샷 — 조회 시 재계산 금지
  - `synchronize` / `migrationsRun`을 켜지 말 것. 어떤 환경에서도 `false`다
  - 테스트는 Testcontainers로 띄운 실제 PostgreSQL. Repository mock·sqlite·인메모리 드라이버 금지
  - `@nestjs/cqrs`·`typeorm-transactional` 도입 금지. 트랜잭션은 `queryRunner`로 명시적으로 연다
  - 용어 고정: `TeeSlot`(≠TeeTime, ≠Slot), `Booking`(≠Reservation), `Hold`(≠Lock, ≠Pending)

## 검증

사전 명령: pnpm db:up

순서:
  1. pnpm typecheck
  2. pnpm lint
  3. pnpm depcruise
  4. pnpm test:arch
  5. pnpm test

부분 실행: pnpm --filter @teetime/<module> test
테스트 러너: 있음   # vitest + Testcontainers

## 작업 단위

소스: roadmap
파일: docs/roadmap.md
완료 시: 체크박스 갱신 + 산출물 경로 한 줄

## 진행 기록

ADR: docs/adr/

## 브랜치·커밋

base: main
브랜치명: feat/<slug>
커밋: Conventional Commits, 한국어 제목 (`feat(booking): ...`) — docs/conventions.md §12

## 에이전트

planner      = claude / opus / high
critic+impl  = codex  / gpt-5.6-terra / high
test-author  = claude / opus / high
reviewer     = claude / opus / high

## Codex 규칙 전달

AGENTS.md: 있음-포인터
