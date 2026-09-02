import type { DataSource, QueryRunner } from 'typeorm';

/**
 * 트랜잭션을 명시적으로 열고 닫는다.
 *
 * `queryRunner`를 직접 잡는 이유는 **같은 커넥션 보장**이다. `FOR UPDATE`로 잡은 락과
 * 뒤따르는 문장이 다른 커넥션에 흩어지면 잠금이 아무것도 지키지 못한다.
 *
 * 이 헬퍼는 커밋 시점이 함수의 끝과 일치하는 경우에만 쓴다.
 * 중간에 커밋하고 나가는 경로(홀드의 멱등 재생)는 핸들러가 직접 관리한다
 * → docs/conventions.md §2, docs/adr/0003
 */
export async function withTransaction<T>(
  dataSource: DataSource,
  work: (runner: QueryRunner) => Promise<T>,
): Promise<T> {
  const runner = dataSource.createQueryRunner();

  await runner.connect();
  await runner.startTransaction();

  try {
    const result = await work(runner);
    await runner.commitTransaction();

    return result;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

/** PostgreSQL 유니크 위반이면 제약 이름을, 그 외에는 `null`을 준다. */
export function violatedConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const candidate = error as { code?: unknown; constraint?: unknown; driverError?: unknown };

  if (candidate.code === '23505' && typeof candidate.constraint === 'string') {
    return candidate.constraint;
  }

  // TypeORM은 드라이버 예외를 QueryFailedError로 감싼다. 한 겹만 벗긴다.
  if (candidate.driverError !== undefined) {
    return violatedConstraint(candidate.driverError);
  }

  return null;
}
