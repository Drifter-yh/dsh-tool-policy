/**
 * Declarative, fail-closed policy for model-requested tool calls.
 *
 * The plugin is intentionally a policy-only consumer: it participates in the
 * public `tools/pre-execute` waterfall, delegates `allow`, returns `deny`, and
 * returns `ask` for the Harness approval seam to resolve. It never rewrites
 * arguments or runs a tool body.
 *
 * @module dsh-tool-policy
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import { compilePolicy, evaluatePolicy, type JsonScalar, type ToolPolicyConfig } from './policy.ts'

export {
  compilePolicy,
  evaluatePolicy,
  type ArgumentCondition,
  type CompiledPolicy,
  type CompiledPolicyRule,
  type CompiledCondition,
  type GatedEvaluation,
  type JsonScalar,
  type PolicyEvaluation,
  type PolicyRule,
  type RuleDecision,
  type ToolPolicyConfig,
} from './policy.ts'

/** Cordis display name. */
export const name = 'dsh-tool-policy'

/** The plugin uses the public ToolRuntime event service. */
export const inject = ['tools']

/** Runtime configuration accepted by the loader. */
export interface Config extends ToolPolicyConfig {}

const scalarSchema: z<JsonScalar> = z.union([z.string(), z.number(), z.boolean(), z.const(null)])
type ArgumentSchemaOutput = { path: string; equals: JsonScalar; contains: string }

/** Schemastery config validator; semantic checks run once more in `compilePolicy`. */
export const Config: z<Config> = z.object({
  defaultDecision: z.union(['allow', 'ask', 'deny'] as const).default('deny'),
  rules: z
    .array(
      z.object({
        tool: z.string(),
        decision: z.union(['allow', 'ask', 'deny'] as const),
        reason: z.string().default(undefined as unknown as string),
        argument: z
          .object({
            path: z.string(),
            equals: scalarSchema,
            contains: z.string(),
          })
          .default(undefined as unknown as ArgumentSchemaOutput),
      }),
    )
    .default([]),
}) as unknown as z<Config>

/** Install the policy listener on the caller's Cordis fiber. */
export function apply(ctx: Context, config: Config = {}): void {
  const policy = compilePolicy(config)
  ctx.on('tools/pre-execute', (exec, next): Promise<PreToolDecision> => {
    const evaluation = evaluatePolicy(policy, exec.name, exec.arguments)
    switch (evaluation.decision) {
      case 'allow':
        return next()
      case 'ask':
        return Promise.resolve({ kind: 'ask', reason: evaluation.reason })
      case 'deny':
        return Promise.resolve({ kind: 'deny', reason: evaluation.reason })
    }
  })
}
