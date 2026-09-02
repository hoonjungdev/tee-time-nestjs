/**
 * 아웃박스 디스패처와 구독자 사이의 유일한 계약.
 *
 * 발행자는 구독자가 누구인지, 있는지조차 모른다.
 * 구독자가 없으면 메시지는 그대로 처리 완료가 된다 → docs/adr/0004.
 */
export interface IntegrationEventHandler<TEvent = unknown> {
  /** `booking.outbox_messages.type`과 대조할 값. 예: 'BookingConfirmed' */
  readonly eventType: string;

  handle(event: TEvent): Promise<void>;
}

/**
 * TypeScript 인터페이스는 런타임에 남지 않으므로 DI 토큰이 될 수 없다.
 * 구독자는 이 토큰의 멀티 프로바이더로 자신을 등록하고,
 * 디스패처는 주입된 배열에서 eventType이 맞는 핸들러를 고른다.
 */
export const INTEGRATION_EVENT_HANDLERS = Symbol('IntegrationEventHandlers');
