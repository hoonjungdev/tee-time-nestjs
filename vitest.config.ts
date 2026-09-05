import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * esbuild(Vite 기본 변환기)는 `emitDecoratorMetadata`를 지원하지 않는다.
 * NestJS DI와 TypeORM 매핑이 그 메타데이터에 의존하므로 SWC로 변환한다.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2023',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['apps/*/test/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'tests/*/src/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
