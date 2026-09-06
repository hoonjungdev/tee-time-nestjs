# ADR 0008 — 모듈 경계 계약은 `null`이 아니라 `Result`를 돌려준다

- 상태: 채택
- 일자: 2026-09-06
- 관련: ADR 0001, `docs/conventions.md` §1, `docs/modules.md`

## 배경

`docs/modules.md`가 M0 시점에 `CatalogApi`를 이렇게 스케치해 두었다.

```ts
abstract getCourse(courseId: string): Promise<CourseSnapshot | null>;
abstract quoteGreenFee(courseId: string, teeDate: LocalDate, teeTime: LocalTime): Promise<GreenFeeQuote | null>;
abstract getOperatingDays(courseId: string, from: LocalDate, to: LocalDate): Promise<OperatingDaySnapshot[]>;
```

M1에서 실제로 구현하려 하자 `quoteGreenFee`에서 어긋났다.
요금 판정 순수 함수(`pricing/green-fee-policy.ts`)는 이미 실패를 **두 가지로 구분**한다.

- `GreenFeeNotConfigured` — 매칭되는 활성 규칙이 없다 (어드민이 요금을 안 넣었다)
- `GreenFeeRuleConflict` — 최고 `priority` 규칙이 여러 개다 (어드민이 설정을 잘못 넣었다)

둘 다 409지만 원인이 다르고, `conventions.md` §1의 `ErrorCode → HTTP` 표가 둘을 따로 적고 있다.
`| null`로 좁히는 순간 이 구분이 경계에서 사라진다. Booking은 "요금을 못 구했다"만 알고
어느 쪽인지 모른 채 사용자에게 메시지를 만들어야 한다. 표가 무의미해진다.

## 결정

**`CatalogApi`의 세 메서드 전부 `Result`를 돌려준다.**

```ts
abstract getCourse(courseId: string): Promise<Result<CourseSnapshot>>;
abstract quoteGreenFee(courseId: string, teeDate: LocalDate, teeTime: LocalTime): Promise<Result<GreenFeeQuote>>;
abstract getOperatingDays(courseId: string, from: LocalDate, to: LocalDate): Promise<Result<readonly OperatingDaySnapshot[]>>;
```

- 실패 이유를 구분해야 하는 것은 `quoteGreenFee` 하나지만, 셋을 통일한다.
  경계 계약에서 메서드마다 실패 표현이 다르면 호출부가 매번 형태를 확인해야 한다.
- `Result`는 `shared-kernel`에 있다. 계약 패키지가 `shared-kernel`에만 의존한다는
  규칙(ADR 0001)을 깨지 않는다.
- 반환 배열과 스냅샷 필드는 `readonly`다. 경계를 넘어간 값을 소비자가 바꿀 이유가 없다.
- `getOperatingDays`는 범위 검증(`from > to`, 366일 초과)이 있어 어차피 실패를 표현해야 한다.

`docs/modules.md`를 같은 커밋에서 이 시그니처로 갱신했다. **문서가 스케치였고 코드가 정답이다.**

## 검토했다 접은 것

**`| null`을 유지하고 요금 실패 구분은 M2에서 재검토.**
Booking이 아직 없으니 미룰 수 있다. 그러나 계약이 한 번 굳으면 M2 전체가 그 위에 얹힌다.
소비자가 생긴 뒤에 경계 시그니처를 바꾸는 것이 지금 바꾸는 것보다 비싸다.

**`quoteGreenFee`만 `Result`, 나머지는 `| null`.**
실패 이유가 하나뿐인 메서드에 `Result`가 정보를 더하지 않는 것은 맞다.
그러나 한 계약 안에서 실패 표현이 두 가지가 되면 호출부가 메서드마다 다르게 써야 한다.
일관성의 값이 `unwrap` 한 번의 비용보다 크다고 봤다.

**예외를 던지고 Booking이 잡는다.**
`conventions.md` §1이 "예상된 실패를 `throw`하지 말 것"으로 이미 막았다.
요금 미설정은 예상된 실패다.

## 결과

- Booking(M2)은 `quoteGreenFee` 실패를 `GreenFeeNotConfigured` / `GreenFeeRuleConflict`로
  구분해 받는다. 두 코드는 `ERROR_CODES`에 이미 있었다.
- `getCourse`의 "없음"은 `CourseNotFound`(404)로 표현된다. `null` 반환이 사라졌다.
- 다른 모듈 계약(`PaymentApi`)은 아직 `Promise<PaymentResult>` 스케치 상태다.
  **이 결정이 그쪽까지 자동으로 적용되지는 않는다** — `PaymentResult`는 승인/거절을
  값으로 표현하는 타입이고, 그것이 적절한지는 M2에서 실제로 구현할 때 판단한다.
