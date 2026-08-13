import { describe, expect, it } from 'vitest'
import { compilePolicy, evaluatePolicy, type ToolPolicyConfig } from '../src/policy.ts'

describe('compilePolicy', () => {
  it('anchors literal tool names and supports only the star wildcard', () => {
    const policy = compilePolicy({
      defaultDecision: 'allow',
      rules: [
        { tool: 'file.read', decision: 'deny', reason: 'read is disabled' },
        { tool: 'mcp_*', decision: 'ask', reason: 'MCP calls need approval' },
      ],
    })

    expect(evaluatePolicy(policy, 'file.read', {})).toMatchObject({ decision: 'deny', reason: 'read is disabled' })
    expect(evaluatePolicy(policy, 'fileXread', {})).toEqual({ decision: 'allow' })
    expect(evaluatePolicy(policy, 'mcp_write', {})).toMatchObject({ decision: 'ask' })
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
