import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('real Cordis Loader composition', () => {
  it('loads Harness services, the policy plugin, and a real ToolRuntime fixture', async () => {
    const projectRoot = resolve(import.meta.dirname, '..')
    const harnessBin = resolve(projectRoot, '../../work/deepseek-harness/vendor/cordis/bin.js')
    const child = spawn(process.execPath, ['--import', 'tsx', harnessBin], {
      cwd: resolve(projectRoot, 'demo'),
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    const [result] = (await once(child, 'close')) as [number | null]
    const output = Buffer.concat(stdout).toString('utf8')
    const errorOutput = Buffer.concat(stderr).toString('utf8')

    expect(result, errorOutput).toBe(0)
    expect(output).toContain('"blocked":{"isError":true,"message":"deleting records is disabled in the demo"}')
    expect(output).toContain('"allowed":{"isError":false,"value":"record:42"}')
    expect(output).toContain('"executed":1')
  }, 30_000)
})
