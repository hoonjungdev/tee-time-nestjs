import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * 스키마의 식별자는 snake_case다(`docs/schema.md`). TypeORM 기본 전략은 프로퍼티 이름을
 * 그대로 컬럼 이름으로 쓰므로 `teeDate`가 `"teeDate"` 컬럼을 찾는다.
 *
 * 컬럼마다 `name`을 손으로 적는 대신 전략으로 한 번에 정한다. 손으로 적으면
 * 언젠가 하나를 빠뜨리고, 그 하나는 마이그레이션을 적용해 봐야 드러난다.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ?? toSnakeCase(targetName);
  }

  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const base = customName ?? toSnakeCase(propertyName);

    return embeddedPrefixes.length > 0
      ? `${embeddedPrefixes.map(toSnakeCase).join('_')}_${base}`
      : base;
  }

  override relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return toSnakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
