import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/policy.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  deps: {
    neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/schemastery'],
  },
})
