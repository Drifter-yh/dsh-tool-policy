import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml') as {
  load: (source: string, options: { schema: typeof entryListSchema }) => unknown
}

const projectRoot = resolve(import.meta.dirname, '..')
const packageManifest = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
  dsh?: { bundle?: { patch?: string } }
  exports?: Record<string, unknown>
  files?: readonly string[]
}
const patchPath = resolve(projectRoot, 'cordis.patch.yml')

describe('DeepSeek Harness bundle contract', () => {
  it('declares and ships the official dsh.bundle patch path', () => {
    expect(packageManifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(packageManifest.exports?.['./cordis.patch.yml']).toBe('./cordis.patch.yml')
    expect(packageManifest.files).toContain('cordis.patch.yml')
    expect(existsSync(patchPath)).toBe(true)
  })

  it('inserts this package as a deny-by-default Cordis row', () => {
    const parsed = yaml.load(readFileSync(patchPath, 'utf8'), { schema: entryListSchema })
    expect(parsed).toEqual([
      {
        insert: [
          {
            id: 'tool-policy',
            name: 'dsh-tool-policy',
            config: { defaultDecision: 'deny', rules: [] },
          },
        ],
      },
    ])
  })
})
