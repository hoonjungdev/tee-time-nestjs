import { types } from 'pg';

/**
 * PostgreSQL OID. pg가 값을 어떤 JS 타입으로 만들지 결정하는 키다.
 */
const OID = {
  DATE: 1082,
  TIME: 1083,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700,
} as const;

const RAW_TEXT_OIDS: ReadonlySet<number> = new Set(Object.values(OID));

const asIs = (value: string): string => value;

/**
 * 드라이버의 기본 파싱을 끄고 원문 문자열을 받는다.
 *
 * 끄지 않으면 두 가지가 조용히 깨진다 (docs/schema.md):
 *
 * - `timestamptz` → `Date`: 마이크로초가 절삭된다. 읽어서 다시 쓰면 원본과 달라진다.
 * - `date` → `Date`: **프로세스 로컬 타임존으로 해석되어 날짜가 하루 밀린다.**
 *   `tee_date`는 골프장의 로컬 날짜이지 순간 시각이 아니다. 서버 타임존에 따라
 *   값이 달라지는 순간 "로컬 시각이 진실"이라는 전제(불변식 10)가 무너진다.
 *
 * **전역 `setTypeParser`를 쓰지 않는다.** 그것은 프로세스의 모든 pg 사용처를 바꾸는
 * 부작용이고, 무엇보다 ORM이 자기 커넥션에 다른 파서를 물고 있으면 조용히 무시된다.
 * 커넥션 옵션으로 넘기면 이 DataSource에만, 확실하게 적용된다.
 */
export const rawTextTypeParsers = {
  getTypeParser(oid: number, format?: unknown): unknown {
    if (RAW_TEXT_OIDS.has(oid)) {
      return asIs;
    }

    return (types.getTypeParser as (oid: number, format?: unknown) => unknown)(oid, format);
  },
};
