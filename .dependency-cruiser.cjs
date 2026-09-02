/**
 * 소스 import 그래프 검사. `package.json` 선언 검사는 tests/architecture가 담당하고,
 * 여기서는 실제 코드가 무엇을 끌어오는지를 본다. 두 층은 겹치며 겹침은 의도된 것이다.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '모듈 간 순환 참조 금지 → docs/modules.md',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contracts-must-be-pure',
      severity: 'error',
      comment: '계약 패키지는 ORM과 프레임워크를 모른다 → docs/modules.md',
      from: { path: '^packages/[^/]+-contracts/src' },
      to: { path: 'node_modules/(typeorm|pg|@nestjs)' },
    },
    {
      name: 'no-cross-module-implementation',
      severity: 'error',
      comment: '모듈 간 참조는 *-contracts만. 구현 패키지 직접 참조 금지 → docs/modules.md',
      from: { path: '^packages/(booking|catalog|payment|identity|notification)/src' },
      to: { path: '^packages/(booking|catalog|payment|identity|notification)/src', pathNot: '$1' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)tsconfig\\.json$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.lint.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '(^|/)dist/' },
  },
};
