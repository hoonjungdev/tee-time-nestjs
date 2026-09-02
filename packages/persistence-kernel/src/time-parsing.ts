import { Instant } from '@teetime/shared-kernel';

/**
 * PostgreSQL의 timestamptz 출력. ISO-8601이 아니다 — 날짜와 시각이 공백으로 나뉘고
 * 오프셋이 `+00` / `+09` 처럼 분이 생략된 형태로 온다.
 *
 * 예: `2026-09-02 14:30:00.123456+00`
 */
const PG_TIMESTAMPTZ =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** `+09` → `+09:00`, `+0900` → `+09:00`. 이미 정규형이면 그대로 둔다. */
function normalizeOffset(offset: string): string {
  if (offset === 'Z' || offset.includes(':')) {
    return offset;
  }
  if (offset.length === 3) {
    return `${offset}:00`;
  }
  return `${offset.slice(0, 3)}:${offset.slice(3)}`;
}

export function parseTimestampTz(raw: string): Instant {
  const matched = PG_TIMESTAMPTZ.exec(raw);

  if (matched === null) {
    throw new Error(`timestamptz 형식을 해석할 수 없다: ${raw}`);
  }

  const [, date, time, offset] = matched;

  if (date === undefined || time === undefined) {
    throw new Error(`timestamptz 형식을 해석할 수 없다: ${raw}`);
  }

  // 오프셋이 없으면 UTC로 본다. 커넥션의 timezone을 UTC로 고정하기 때문이다.
  return Instant.parse(`${date}T${time}${normalizeOffset(offset ?? 'Z')}`);
}
