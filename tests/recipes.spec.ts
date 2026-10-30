import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compilePolicy, evaluatePolicy, type ToolPolicyConfig } from '../src/policy.ts'

const yaml = createRequire(import.meta.url)('js-yaml') as { load: (source: string) => unknown }
const root = resolve(import.meta.dirname, '..')
const names = ['mcp', 'filesystem', 'shell', 'unattended'] as const

function recipe(file: string, name: string): ToolPolicyConfig {
  const content = readFileSync(resolve(root, file), 'utf8')
  const match = content.match(new RegExp(`<!-- recipe:${name} -->\\s*\\x60{3}yaml\\s*([\\s\\S]*?)\\x60{3}`))
  if (!match?.[1]) throw new Error(`missing recipe ${name} in ${file}`)
  return yaml.load(match[1]) as ToolPolicyConfig
}

describe('documented recipes', () => {
  it.each(names)('keeps the %s configurations identical in both languages', (name) => {
    expect(recipe('recipes.zh-CN.md', name)).toEqual(recipe('recipes.md', name))
  })

  it.each([
    ['mcp', 'mcp__catalog__delete', {}, 'deny', 0],
    ['mcp', 'mcp__catalog__search', {}, 'allow', 1],
    ['mcp', 'mcp__other__search', {}, 'ask', 2],
    ['mcp', 'bash', {}, 'deny', undefined],
    ['filesystem', 'read_file', {}, 'allow', 0],
    ['filesystem', 'list_files', {}, 'allow', 1],
    ['filesystem', 'write_file', {}, 'ask', 2],
    ['filesystem', 'bash', {}, 'deny', undefined],
    ['shell', 'bash', { command: 'rm -rf ./cache' }, 'deny', 0],
    ['shell', 'bash', { command: 'pwd' }, 'ask', 1],
    ['shell', 'bash', {}, 'ask', 1],
    ['shell', 'read_file', {}, 'allow', 2],
    ['shell', 'other', {}, 'deny', undefined],
    ['unattended', 'read_file', {}, 'allow', 0],
    ['unattended', 'mcp__catalog__search', {}, 'allow', 1],
    ['unattended', 'mcp__catalog__delete', {}, 'deny', undefined],
    ['unattended', 'mcp__other__search', {}, 'deny', undefined],
  ] as const)('%s: %s with %j yields %s', (name, tool, args, decision, ruleIndex) => {
    const result = evaluatePolicy(compilePolicy(recipe('recipes.md', name)), tool, args)
    expect(result.decision).toBe(decision)
    expect(result.ruleIndex).toBe(ruleIndex)
  })
})
