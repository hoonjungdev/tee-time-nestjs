import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url).pathname;

/**
 * `docs/modules.md`의 참조 규칙 표. **이 배열이 규칙의 단일 출처다.**
 * 표와 코드가 어긋나면 여기가 실패한다.
 */
const ALLOWED_DEPENDENCIES: Record<string, readonly string[]> = {
  'shared-kernel': [],
  'persistence-kernel': ['shared-kernel'],

  'catalog-contracts': ['shared-kernel'],
  'booking-contracts': ['shared-kernel'],
  'payment-contracts': ['shared-kernel'],
  'identity-contracts': ['shared-kernel'],

  catalog: ['catalog-contracts', 'shared-kernel', 'persistence-kernel'],
  booking: [
    'booking-contracts',
    'catalog-contracts',
    'payment-contracts',
    'shared-kernel',
    'persistence-kernel',
  ],
  payment: ['payment-contracts', 'shared-kernel', 'persistence-kernel'],
  identity: ['identity-contracts', 'shared-kernel', 'persistence-kernel'],
  notification: ['booking-contracts', 'shared-kernel', 'persistence-kernel'],
};

type PackageJson = {
  name?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf-8')) as PackageJson;
}

function packageNames(): string[] {
  return readdirSync(join(ROOT, 'packages')).filter((name) =>
    statSync(join(ROOT, 'packages', name)).isDirectory(),
  );
}

function teetimeDependencies(pkg: PackageJson): string[] {
  return Object.keys(pkg.dependencies ?? {})
    .filter((name) => name.startsWith('@teetime/'))
    .map((name) => name.replace('@teetime/', ''))
    .sort();
}

describe('패키지 참조 규칙', () => {
  it('규칙 표가 실제 패키지 목록을 모두 덮는다', () => {
    expect(packageNames().sort()).toEqual(Object.keys(ALLOWED_DEPENDENCIES).sort());
  });

  it.each(Object.entries(ALLOWED_DEPENDENCIES))(
    '%s의 의존성이 참조 규칙 표와 정확히 일치한다',
    (name, allowed) => {
      const pkg = readPackageJson(join(ROOT, 'packages', name, 'package.json'));
      expect(teetimeDependencies(pkg)).toEqual([...allowed].sort());
    },
  );

  it('계약 패키지는 ORM과 프레임워크를 모르는 순수 TypeScript다', () => {
    const contracts = packageNames().filter((name) => name.endsWith('-contracts'));
    expect(contracts.length).toBeGreaterThan(0);

    for (const name of contracts) {
      const pkg = readPackageJson(join(ROOT, 'packages', name, 'package.json'));
      const deps = Object.keys(pkg.dependencies ?? {});

      expect(deps.filter((dep) => dep === 'typeorm' || dep === 'pg')).toEqual([]);
      expect(deps.filter((dep) => dep.startsWith('@nestjs/'))).toEqual([]);
      // shared-kernel을 거쳐 간접 의존하는 것도 막는다.
      expect(teetimeDependencies(pkg)).toEqual(['shared-kernel']);
    }
  });

  it('모든 패키지가 진입점 하나만 공개한다 (deep import 차단)', () => {
    for (const name of packageNames()) {
      const pkg = readPackageJson(join(ROOT, 'packages', name, 'package.json'));
      expect(Object.keys(pkg.exports ?? {})).toEqual(['.']);
    }
  });

  it('모듈 간 순환 참조가 없다', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();

    const walk = (name: string, trail: string[]): void => {
      if (visiting.has(name)) {
        throw new Error(`순환 참조: ${[...trail, name].join(' → ')}`);
      }
      if (done.has(name)) {
        return;
      }

      visiting.add(name);
      for (const dep of ALLOWED_DEPENDENCIES[name] ?? []) {
        walk(dep, [...trail, name]);
      }
      visiting.delete(name);
      done.add(name);
    };

    expect(() => {
      for (const name of Object.keys(ALLOWED_DEPENDENCIES)) {
        walk(name, []);
      }
    }).not.toThrow();
  });
});

describe('호스트는 조립만 한다', () => {
  it('apps/api에 엔티티·마이그레이션·리포지토리가 없다', () => {
    const collect = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? collect(join(dir, entry.name))
          : [join(dir, entry.name).slice(ROOT.length)],
      );

    const files = collect(join(ROOT, 'apps/api/src'));

    expect(files.filter((file) => /\.entity\.ts$/.test(file))).toEqual([]);
    expect(files.filter((file) => /migrations?\//.test(file))).toEqual([]);
    expect(files.filter((file) => /\.repository\.ts$/.test(file))).toEqual([]);
  });
});
