import { fileURLToPath } from 'node:url'

process.chdir(fileURLToPath(new URL('.', import.meta.url)))
// @ts-expect-error The repository-local Cordis bin is a JavaScript fixture without declarations.
await import('../../../work/deepseek-harness/vendor/cordis/bin.js')
