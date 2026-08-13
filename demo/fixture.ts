import type { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-tool-policy-runtime-fixture'
export const inject = ['tools']
export let completed: Promise<void> = Promise.resolve()

export function apply(ctx: Context): void {
  let executed = 0
  const output = {
    schema: { type: 'string' as const },
    render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
  }
  ctx.tools.register(
    defineTool({
      name: 'read_record',
      description: 'Read a record.',
      parameters: { id: { type: 'string', required: true } },
      output,
      async execute(args) {
        executed += 1
        return `record:${args.id}`
      },
    }),
  )
  ctx.tools.register(
    defineTool({
      name: 'delete_record',
      description: 'Delete a record.',
      parameters: { id: { type: 'string', required: true } },
      output,
      async execute(args) {
        executed += 1
        return `deleted:${args.id}`
      },
    }),
  )

  completed = (async () => {
    const blocked = await ctx.tools.execute({
      callId: CallId('demo-delete'),
      name: 'delete_record',
      arguments: { id: '42' },
      signal: new AbortController().signal,
    })
    const allowed = await ctx.tools.execute({
      callId: CallId('demo-read'),
      name: 'read_record',
      arguments: { id: '42' },
      signal: new AbortController().signal,
    })
    console.log(
      JSON.stringify({
        blocked: { isError: blocked.isError, message: blocked.error?.message },
        allowed: { isError: allowed.isError, value: allowed.value },
        executed,
      }),
    )
  })()
}
