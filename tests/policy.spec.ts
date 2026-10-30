import { describe, expect, it } from 'vitest'
import { compilePolicy, evaluatePolicy, expandPolicy, type ToolPolicyConfig } from '../src/policy.ts'

describe('routing presets', () => {
  it('expands into independent JSON-serializable ordinary rules with default deny', () => {
    const expanded = expandPolicy({ preset: 'read-only' })
    expect(JSON.parse(JSON.stringify(expanded))).toEqual({
      defaultDecision: 'deny',
      rules: [{ tool: 'read_*', decision: 'allow' }],
    })
    expect(expandPolicy({ preset: 'mcp-approval' })).toEqual({
      defaultDecision: 'deny',
      rules: [{ tool: 'mcp__*', decision: 'ask' }],
    })
    expect(evaluatePolicy(compilePolicy(expanded), 'read_record', {})).toEqual({ decision: 'allow', ruleIndex: 0 })
    expect(evaluatePolicy(compilePolicy({ preset: 'read-only' }), 'write_record', {})).toMatchObject({
      decision: 'deny',
    })
    expect(evaluatePolicy(compilePolicy({ preset: 'mcp-approval' }), 'mcp__server__tool', {})).toMatchObject({
      decision: 'ask',
      ruleIndex: 0,
    })
    expect(evaluatePolicy(compilePolicy({ preset: 'mcp-approval' }), 'other', {})).toMatchObject({ decision: 'deny' })
  })

  it('uses overrides, preset rules, then appended rules in order', () => {
    const config: ToolPolicyConfig = {
      preset: 'mcp-approval',
      rules: [{ tool: 'mcp__trusted__read', decision: 'allow' }],
      appendRules: [
        { tool: 'mcp__*', decision: 'deny' },
        { tool: 'local', decision: 'allow' },
      ],
    }
    const expanded = expandPolicy(config)
    expect(expanded.rules.map((rule) => rule.decision)).toEqual(['allow', 'ask', 'deny', 'allow'])
    const policy = compilePolicy(config)
    expect(evaluatePolicy(policy, 'mcp__trusted__read', {})).toEqual({ decision: 'allow', ruleIndex: 0 })
    expect(evaluatePolicy(policy, 'mcp__other__write', {})).toMatchObject({ decision: 'ask', ruleIndex: 1 })
    expect(evaluatePolicy(policy, 'local', {})).toEqual({ decision: 'allow', ruleIndex: 3 })
    expect(evaluatePolicy(policy, 'unknown', {})).toMatchObject({ decision: 'deny' })
    expect(expandPolicy({ preset: 'read-only', defaultDecision: 'ask' }).defaultDecision).toBe('ask')
  })

  it('copies argument conditions and preserves their meaning across JSON serialization', () => {
    const argument = { path: '/enabled', equals: false }
    const expanded = expandPolicy({ preset: 'read-only', rules: [{ tool: 'read_*', decision: 'deny', argument }] })
    argument.equals = true
    const restored = JSON.parse(JSON.stringify(expanded)) as ToolPolicyConfig
    expect(evaluatePolicy(compilePolicy(restored), 'read_record', { enabled: false })).toMatchObject({
      decision: 'deny',
      ruleIndex: 0,
    })
    expect(evaluatePolicy(compilePolicy(restored), 'read_record', { enabled: true })).toEqual({
      decision: 'allow',
      ruleIndex: 1,
    })
  })

  it.each([
    { preset: 'unknown' },
    { preset: null },
    { appendRules: null },
    { appendRules: {} },
    { preset: 'read-only', appendRules: [{ tool: '', decision: 'allow' }] },
  ])('rejects malformed preset configuration: %j', (config) => {
    expect(() => expandPolicy(config as unknown as ToolPolicyConfig)).toThrow()
    expect(() => compilePolicy(config as unknown as ToolPolicyConfig)).toThrow()
  })
})

describe('compilePolicy', () => {
  it('anchors literal tool names and supports only the star wildcard', () => {
    const policy = compilePolicy({
      defaultDecision: 'allow',
      rules: [
        { tool: 'file.read', decision: 'deny', reason: 'read is disabled' },
        { tool: 'mcp__*', decision: 'ask', reason: 'MCP calls need approval' },
      ],
    })

    expect(evaluatePolicy(policy, 'file.read', {})).toMatchObject({ decision: 'deny', reason: 'read is disabled' })
    expect(evaluatePolicy(policy, 'fileXread', {})).toEqual({ decision: 'allow' })
    expect(evaluatePolicy(policy, 'mcp__write', {})).toMatchObject({ decision: 'ask' })
  })

  it('matches JSON Pointer equality and string containment without exposing arguments in the reason', () => {
    const policy = compilePolicy({
      defaultDecision: 'allow',
      rules: [
        {
          tool: 'bash',
          decision: 'deny',
          reason: 'destructive shell command',
          argument: { path: '/command', contains: 'rm -rf' },
        },
        {
          tool: 'record.update',
          decision: 'deny',
          reason: 'protected record',
          argument: { path: '/scope', equals: 'system' },
        },
      ],
    })

    expect(evaluatePolicy(policy, 'bash', { command: 'rm -rf ./cache' })).toEqual({
      decision: 'deny',
      reason: 'destructive shell command',
      ruleIndex: 0,
    })
    expect(evaluatePolicy(policy, 'bash', { command: 'rm ./cache' })).toEqual({ decision: 'allow' })
    expect(evaluatePolicy(policy, 'record.update', { scope: 'system', token: 'secret-value' })).toMatchObject({
      decision: 'deny',
      reason: 'protected record',
    })
    expect(evaluatePolicy(policy, 'record.update', { scope: 'user' })).toEqual({ decision: 'allow' })
  })

  it('uses the first matching rule and supports an explicit deny-by-default policy', () => {
    const policy = compilePolicy({
      defaultDecision: 'deny',
      rules: [
        { tool: 'safe_*', decision: 'allow' },
        { tool: 'admin_*', decision: 'ask', reason: 'admin tools need approval' },
      ],
    })

    expect(evaluatePolicy(policy, 'safe_read', {})).toEqual({ decision: 'allow', ruleIndex: 0 })
    expect(evaluatePolicy(policy, 'admin_read', {})).toEqual({
      decision: 'ask',
      reason: 'admin tools need approval',
      ruleIndex: 1,
    })
    expect(evaluatePolicy(policy, 'not-matched-by-any-rule', {})).toEqual({
      decision: 'deny',
      reason: 'tool "not-matched-by-any-rule" denied because no policy rule matched',
    })
    expect(evaluatePolicy(compilePolicy(), 'unlisted', {})).toEqual({
      decision: 'deny',
      reason: 'tool "unlisted" denied because no policy rule matched',
    })
  })

  it.each([
    ['empty tool pattern', { rules: [{ tool: '', decision: 'deny' }] }],
    ['malformed pointer', { rules: [{ tool: 'x', decision: 'deny', argument: { path: 'command', contains: 'x' } }] }],
    [
      'ambiguous argument condition',
      { rules: [{ tool: 'x', decision: 'deny', argument: { path: '/x', equals: 'a', contains: 'a' } }] },
    ],
    ['missing argument comparator', { rules: [{ tool: 'x', decision: 'deny', argument: { path: '/x' } }] }],
  ] as const)('rejects %s', (_label, config) => {
    expect(() => compilePolicy(config)).toThrow()
  })

  it('rejects non-finite scalar values even when a caller bypasses the loader schema', () => {
    const config: ToolPolicyConfig = {
      rules: [{ tool: 'x', decision: 'deny', argument: { path: '/value', equals: Number.NaN } }],
    }
    expect(() => compilePolicy(config)).toThrow(/finite JSON scalar/)
  })
})
