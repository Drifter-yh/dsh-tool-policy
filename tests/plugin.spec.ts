import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import ApprovalService, { type ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import * as ToolPolicy from '../src/index.ts'

const signal = new AbortController().signal

async function setup(config: ToolPolicy.Config) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const policyFiber = await ctx.plugin(ToolPolicy, config)
  return { ctx, policyFiber }
}

function registerProbe(ctx: Context, calls: string[]) {
  ctx.tools.register(
    defineContentToolFixture({
      name: 'probe',
      description: 'records one probe call',
      parameters: { command: { type: 'string', required: true } },
      async execute(args) {
        calls.push(args.command)
        return [{ type: 'text' as const, text: `executed:${args.command}` }]
      },
    }),
  )
}

function createApprovalAgent(): Agent {
  const session = Session.create(SessionId('dsh-tool-policy-approval-test'))
  session.append('turn/start', { turn: 1 })
  return { session } as Agent
}

describe('dsh-tool-policy plugin', () => {
  it('denies before the tool body and preserves the configured reason', async () => {
    const calls: string[] = []
    const { ctx } = await setup({
      rules: [{ tool: 'probe', decision: 'deny', reason: 'probe is disabled in this environment' }],
    })
    registerProbe(ctx, calls)

    const result = await ctx.tools.execute({
      callId: CallId('deny-1'),
      name: 'probe',
      arguments: { command: 'never-run' },
      signal,
    })

    expect(result).toMatchObject({
      isError: true,
      error: { message: 'probe is disabled in this environment' },
      content: [{ type: 'text', text: 'Error: probe is disabled in this environment' }],
    })
    expect(calls).toEqual([])
  })

  it('returns ask to the core approval path without taking ownership of approval', async () => {
    const calls: string[] = []
    const { ctx } = await setup({
      rules: [{ tool: 'probe', decision: 'ask', reason: 'probe requires a human decision' }],
    })
    registerProbe(ctx, calls)

    const result = await ctx.tools.execute({
      callId: CallId('ask-1'),
      name: 'probe',
      arguments: { command: 'needs-approval' },
      signal,
    })

    expect(result).toMatchObject({
      isError: true,
      error: { message: 'probe requires a human decision' },
    })
    expect(calls).toEqual([])
  })

  it('continues an ask only after the official approval seam grants once', async () => {
    const calls: string[] = []
    const { ctx } = await setup({
      rules: [{ tool: 'probe', decision: 'ask', reason: 'probe requires a human decision' }],
    })
    await ctx.plugin(ApprovalService)
    registerProbe(ctx, calls)
    const agent = createApprovalAgent()
    const requests: ApprovalRequest[] = []
    ctx.on('approval/request', async (request) => {
      requests.push(request)
      return 'allowed-once'
    })

    const result = await ctx.tools.execute({
      callId: CallId('ask-granted-1'),
      name: 'probe',
      arguments: { command: 'approved' },
      agent,
      signal,
    })

    expect(result.isError).toBe(false)
    expect(calls).toEqual(['approved'])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      agent,
      toolName: 'probe',
      callId: CallId('ask-granted-1'),
      reason: 'probe requires a human decision',
    })
    expect(agent.session.events.map((event) => event.type)).toEqual([
      'turn/start',
      'approval/asked',
      'approval/decided',
    ])
  })

  it('delegates allow decisions to later listeners and the tool body', async () => {
    const calls: string[] = []
    const { ctx } = await setup({
      rules: [{ tool: 'probe', decision: 'allow' }],
    })
    registerProbe(ctx, calls)
    let downstreamSeen = false
    ctx.on('tools/pre-execute', (_exec, next) => {
      downstreamSeen = true
      return next()
    })

    const result = await ctx.tools.execute({
      callId: CallId('allow-1'),
      name: 'probe',
      arguments: { command: 'run' },
      signal,
    })

    expect(result.isError).toBe(false)
    expect(downstreamSeen).toBe(true)
    expect(calls).toEqual(['run'])
  })

  it('removes the listener when its Cordis fiber is disposed', async () => {
    const calls: string[] = []
    const { ctx, policyFiber } = await setup({
      rules: [{ tool: 'probe', decision: 'deny', reason: 'temporary block' }],
    })
    registerProbe(ctx, calls)

    await policyFiber.dispose()
    const result = await ctx.tools.execute({
      callId: CallId('dispose-1'),
      name: 'probe',
      arguments: { command: 'after-dispose' },
      signal,
    })

    expect(result.isError).toBe(false)
    expect(calls).toEqual(['after-dispose'])
  })
})
