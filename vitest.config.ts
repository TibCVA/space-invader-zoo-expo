import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      /* Les clefs profondes passent AVANT la clef de base : l'alias de Vite
         remplace par préfixe, et `@auvergne/engine/x` deviendrait sinon
         `…/src/index.ts/x`. Le testkit du combat est le seul module qu'on
         importe en profondeur — il n'a pas sa place dans le baril public. */
      '@auvergne/engine/combat/testkit': r('./packages/engine/src/combat/testkit.ts'),
      '@auvergne/engine': r('./packages/engine/src/index.ts'),
      '@auvergne/game': r('./packages/game/src/index.ts'),
      '@auvergne/content': r('./packages/content/src/index.ts'),
      '@auvergne/map': r('./packages/map/src/index.ts'),
      '@auvergne/bots': r('./packages/bots/src/index.ts'),
      '@auvergne/protocol': r('./packages/protocol/src/index.ts'),
      '@auvergne/ui': r('./packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
});
