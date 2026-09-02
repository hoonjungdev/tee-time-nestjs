import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.mjs',
      '**/*.cjs',
      'apps/customer/**',
      'apps/admin/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.lint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 떠 있는 프로미스는 조용히 유실된다 → docs/conventions.md §7
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // 타입을 모르면 unknown으로 받고 좁힌다 → docs/conventions.md §6
      '@typescript-eslint/no-explicit-any': 'error',

      // strictNullChecks를 켠 의미를 지운다. 예외는 TypeORM 엔티티 필드 선언뿐이며,
      // 그것은 선언(`id!: string`)이라 이 규칙에 걸리지 않는다.
      '@typescript-eslint/no-non-null-assertion': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // 테스트는 픽스처 특성상 일부 규칙을 완화한다.
    files: ['**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
