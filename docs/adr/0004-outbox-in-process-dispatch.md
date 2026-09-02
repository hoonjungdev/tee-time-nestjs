# ADR 0004 — 아웃박스와 인프로세스 이벤트 전달

- 상태: 채택
- 일자: 2026-09-02
- 관련: ADR 0001, ADR 0003

## 배경

예약 확정·취소는 Notification에 알려야 한다. 그런데 두 제약이 맞물린다.

1. **모듈 경계를 넘는 트랜잭션이 금지**되어 있다. 확정과 알림 발송을 한 트랜잭션에 묶을 수 없다.
2. **참조 방향이 `Notification → Booking.Contracts`** 단방향이다. Booking은 Notification의 존재를 모른다.

②를 무시하고 Booking이 Notification을 직접 부르면 순환 의존이 생기고, 모듈 분리가 문서상의 약속으로 전락한다.
①을 무시하면 알림 발송 실패가 예약 확정을 롤백시킨다 — 알림 때문에 결제된 예약을 취소하는 셈이다.

## 결정

**아웃박스 + 인프로세스 디스패처**로 간다. 두 조각이다.

### 1. `booking.outbox_messages`에 상태 변경과 같은 트랜잭션으로 기록한다

```ts
booking.confirm(transactionId, now);
await runner.manager.save(booking);
await runner.manager.insert(OutboxMessageEntity, outboxMessageFor(bookingConfirmed, now));
await runner.commitTransaction();   // 한 트랜잭션
```

확정과 이벤트 기록은 원자적이다(도메인 불변식 8). 하나만 성립할 수 없다.

### 2. 구독 계약을 `shared-kernel`에 둔다

```ts
export interface IntegrationEventHandler<TEvent = unknown> {
  readonly eventType: string;                 // 'BookingConfirmed'
  handle(event: TEvent): Promise<void>;
}

export const INTEGRATION_EVENT_HANDLERS = Symbol('IntegrationEventHandlers');
```

TypeScript의 인터페이스는 런타임에 남지 않으므로 DI 토큰이 될 수 없다.
구독자는 `INTEGRATION_EVENT_HANDLERS` 멀티 프로바이더에 자신을 등록하고,
`OutboxDispatcher`는 주입된 배열에서 `eventType`이 맞는 핸들러를 고른다. **발행자는 구독자가 누구인지, 있는지조차 모른다.**
Notification이 자기 핸들러를 등록하고, Booking은 아무것도 참조하지 않는다.
구독자가 없으면 메시지는 그대로 처리 완료가 된다.

디스패처는 `FOR UPDATE SKIP LOCKED`로 집는다. 인스턴스가 여러 개여도 같은 메시지를 두 번 보내지 않는다 —
남이 잡은 행은 기다리지 않고 건너뛴다. 전달은 **최소 1회(at-least-once)** 이며, 그 보장을 위해
행 락을 전달이 끝날 때까지 쥔다.

배경 루프는 `@nestjs/schedule`의 `@Interval`이다. BullMQ 같은 외부 큐를 쓰지 않는다.

## 대안과 기각 사유

### Notification이 `booking.outbox_messages`를 직접 읽는다

기각. 남의 스키마를 읽는 순간 스키마 분리가 무의미해지고, Booking은 자기 테이블 구조를
바꿀 때마다 Notification이 깨지는지 확인해야 한다. 소유권이 흐려진다.

### 메시지 브로커 (RabbitMQ, Kafka 등)

기각. **현 단계에서 도입 근거가 없다.** 단일 프로세스에서 구독자가 하나뿐인데
브로커를 넣으면 운영 대상이 하나 늘고, 아웃박스는 어차피 그대로 필요하다
(브로커에 넣는 행위 자체가 DB 트랜잭션과 원자적이지 않기 때문이다).
프로세스를 나눠야 할 때 디스패처의 전달 지점만 바꾸면 되도록 계약을 인터페이스로 잘라 두었다.

### `IHostedService` 없이 확정 트랜잭션 직후에 바로 전달

기각. 커밋과 전달 사이에 프로세스가 죽으면 알림이 유실된다. 그것을 막으려고 아웃박스를 두는 것이므로
전달 시점을 별도 순회로 분리하지 않으면 아웃박스가 장식이 된다.

### `EventEmitter2`로 인프로세스 발행

기각. 프로세스 메모리 안의 발행은 커밋 이후 유실에 무방비다. 위와 같은 이유.

## 결과

**얻는 것**
- 확정·취소가 알림 실패에 영향받지 않는다.
- 모듈 참조 방향이 유지된다. Booking은 Notification을 모른 채로 남는다.
- 디스패처 다중 구동이 안전하다.

**비용**
- 전달이 최소 1회다. 구독자는 같은 이벤트를 두 번 받을 수 있다.
  MVP의 유일한 구독자는 콘솔 채널이라 중복이 발송 로그 행 하나로만 남고 해가 없다.
  **실제 채널(이메일·SMS)이 붙으면 중복 제거 키가 필요해진다** — `notification_logs`에는
  아직 그런 키가 없으므로, 채널 추가와 함께 설계해야 한다.
- 전달 지연이 순회 간격(1초)만큼 생긴다. 알림에는 문제되지 않는다.
- 타입 이름 → 이벤트 매핑을 디스패처에 손으로 적는다. 리플렉션으로 훑으면 Contracts에 record를
  추가하는 것만으로 전달 경로가 조용히 생기므로, 명시성을 택했다.
- 실패가 반복되는 메시지는 `attempt_count`가 5에 닿으면 더 집지 않는다.
  데드레터 테이블과 자동 재처리는 MVP 범위 밖이며, 운영이 손으로 처리한다.

## 검증

- 디스패처 2개 동시 구동 → 중복 발송 0건 (M2 완료 기준)
- 행이 잠겨 있으면 대기하지 않고 건너뛴다
- 구독자가 예외를 던지면 처리 완료로 표시하지 않는다
- 확정 시 아웃박스 메시지가 정확히 1건

## 재검토 조건

- Notification을 별도 프로세스로 분리할 때 → 디스패처의 전달 지점을 브로커 발행으로 교체
- 구독자가 여럿이 되어 재시도 정책이 구독자별로 달라져야 할 때 → 메시지당 구독자별 처리 상태 필요
