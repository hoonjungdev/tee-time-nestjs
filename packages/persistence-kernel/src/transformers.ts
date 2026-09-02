import {
  Instant,
  LocalDate,
  LocalTime,
  money,
  toAmountString,
  type Money,
} from '@teetime/shared-kernel';

import { parseTimestampTz } from './time-parsing.js';

/**
 * TypeORM의 `ValueTransformer`를 **구조적으로** 만족시킨다.
 *
 * `typeorm`에서 타입을 import하지 않는 이유는 의도적이다. 이 모양은 `{ to, from }`
 * 두 메서드일 뿐이고, 명목적 의존을 만들지 않으면 이 파일이 ORM 교체에 영향받지 않는다.
 */
export type ColumnTransformer<TDomain, TDb> = {
  to(value: TDomain | null): TDb | null;
  from(value: TDb | null): TDomain | null;
};

/**
 * `timestamptz` ↔ `Instant`. 절대 시각 전용이다.
 *
 * **두 형태를 모두 받는다.** TypeORM은 `timestamptz` 컬럼을 hydration 단계에서
 * `Date`로 정규화한 뒤 transformer를 호출한다 — 순서가 고정되어 있어 우회할 수 없다.
 * 반면 `queryRunner.query()`로 직접 읽는 경로(홀드 트랜잭션)에서는 원문 문자열이 온다.
 *
 * 엔티티 경로는 `Date`를 거치므로 **밀리초 정밀도**다. 마이크로초가 필요하면 raw 경로를 쓴다.
 * 이 한계와 감수한 이유는 docs/schema.md에 적었다.
 */
export const instantColumn: ColumnTransformer<Instant, string | Date> = {
  to(value) {
    return value === null ? null : value.toString();
  },
  from(value) {
    if (value === null) {
      return null;
    }

    return value instanceof Date ? Instant.ofEpochMilli(value.getTime()) : parseTimestampTz(value);
  },
};

/** `date` ↔ `LocalDate`. 골프장 로컬 날짜. 절대 시각으로 변환하지 않는다. */
export const localDateColumn: ColumnTransformer<LocalDate, string> = {
  to(value) {
    return value === null ? null : value.toString();
  },
  from(value) {
    return value === null ? null : LocalDate.parse(value);
  },
};

/** `time` ↔ `LocalTime`. 골프장 로컬 시각. */
export const localTimeColumn: ColumnTransformer<LocalTime, string> = {
  to(value) {
    return value === null ? null : value.toString();
  },
  from(value) {
    return value === null ? null : LocalTime.parse(value);
  },
};

/** `numeric(12,2)` ↔ `Money`. number를 거치지 않는다. */
export const moneyColumn: ColumnTransformer<Money, string> = {
  to(value) {
    return value === null ? null : toAmountString(value);
  },
  from(value) {
    return value === null ? null : money(value);
  },
};
