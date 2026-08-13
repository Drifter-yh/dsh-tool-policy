/**
 * Pure policy compiler and matcher for the DeepSeek Harness tool-policy
 * plugin. The module has no Cordis dependency, so applications can validate
 * policy behavior before mounting the plugin.
 *
 * @module dsh-tool-policy/policy
 */

/** JSON scalar accepted by an argument equality condition. */
export type JsonScalar = string | number | boolean | null

/** A policy action returned by the plugin's pre-execute listener. */
export type RuleDecision = 'allow' | 'ask' | 'deny'

/** One JSON Pointer condition evaluated against parsed tool arguments. */
export interface ArgumentCondition {
  /** RFC 6901 JSON Pointer; use an empty string to match the complete argument value. */
  readonly path: string
  /** Exact scalar comparison. Mutually exclusive with {@link contains}. */
  readonly equals?: JsonScalar
  /** Substring comparison for string values. Mutually exclusive with {@link equals}. */
  readonly contains?: string
}

/** One ordered tool policy rule. The first matching rule owns the decision. */
export interface PolicyRule {
  /** Tool name or `*`-wildcard pattern. Matching is anchored to the full name. */
  readonly tool: string
  /** `allow` delegates to later Harness policy listeners; it never overrides a prior denial. */
  readonly decision: RuleDecision
  /** Human-readable reason for `ask` or `deny`; arguments are intentionally not interpolated. */
  readonly reason?: string
  /** Optional condition over the parsed tool arguments. */
  readonly argument?: ArgumentCondition
}

/** Configuration accepted by the plugin and the pure policy compiler. */
export interface ToolPolicyConfig {
  /** Action for calls that match no rule. Defaults to `deny`. */
  readonly defaultDecision?: RuleDecision
  /** Ordered rules; the first matching rule wins. Defaults to an empty list. */
  readonly rules?: readonly PolicyRule[]
}

export type CompiledCondition =
  | { readonly kind: 'equals'; readonly path: readonly string[]; readonly value: JsonScalar }
  | { readonly kind: 'contains'; readonly path: readonly string[]; readonly value: string }

/** Compiled rule exposed as readonly data so callers cannot mutate matcher state. */
export interface CompiledPolicyRule {
  readonly pattern: RegExp
  readonly decision: RuleDecision
  readonly reason?: string
  readonly condition?: CompiledCondition
}

/** Readonly executable policy returned by {@link compilePolicy}. */
export interface CompiledPolicy {
  readonly defaultDecision: RuleDecision
  readonly rules: readonly CompiledPolicyRule[]
}

/** Evaluation that delegates without creating a new decision reason. */
export interface AllowEvaluation {
  readonly decision: 'allow'
  readonly ruleIndex?: number
}

/** Evaluation that must be surfaced to the Harness pre-execute pipeline. */
export interface GatedEvaluation {
  readonly decision: 'ask' | 'deny'
  readonly reason: string
  readonly ruleIndex?: number
}

/** Result of evaluating a call against a compiled policy. */
export type PolicyEvaluation = AllowEvaluation | GatedEvaluation

const RULE_DECISIONS: readonly RuleDecision[] = ['allow', 'ask', 'deny']
const MISSING = Symbol('dsh-tool-policy.missing')

function isRuleDecision(value: unknown): value is RuleDecision {
  return typeof value === 'string' && RULE_DECISIONS.includes(value as RuleDecision)
}

function escapeGlobCharacter(character: string): string {
  return /[\\^$+?.()|[\]{}]/u.test(character) ? `\\${character}` : character
}

/** Compile a literal `*` wildcard without exposing regular-expression syntax. */
function compileGlob(pattern: string): RegExp {
  let source = ''
  for (const character of pattern) {
    source += character === '*' ? '.*' : escapeGlobCharacter(character)
  }
  return new RegExp(`^${source}$`, 'u')
}

/** Decode one RFC 6901 JSON Pointer and reject malformed escape sequences. */
function decodePointer(pointer: string): readonly string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new TypeError(`argument.path must be an RFC 6901 JSON Pointer starting with "/": ${pointer}`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => {
      let decoded = ''
      for (let index = 0; index < segment.length; index += 1) {
        const character = segment[index]
        if (character !== '~') {
          decoded += character
          continue
        }
        const escape = segment[index + 1]
        if (escape !== '0' && escape !== '1') {
          throw new TypeError(`argument.path contains an invalid JSON Pointer escape in "${pointer}"`)
        }
        decoded += escape === '0' ? '~' : '/'
        index += 1
      }
      return decoded
    })
}

function validateScalar(value: unknown, field: string): asserts value is JsonScalar {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  throw new TypeError(`${field} must be a finite JSON scalar`)
}

function compileCondition(condition: ArgumentCondition, ruleIndex: number): CompiledCondition {
  if (typeof condition.path !== 'string') {
    throw new TypeError(`policy rule ${ruleIndex + 1}: argument.path must be a string`)
  }
  const hasEquals = Object.hasOwn(condition, 'equals')
  const hasContains = Object.hasOwn(condition, 'contains')
  if (hasEquals === hasContains) {
    throw new TypeError(`policy rule ${ruleIndex + 1}: argument must set exactly one of equals or contains`)
  }
  const path = decodePointer(condition.path)
  if (hasEquals) {
    validateScalar(condition.equals, `policy rule ${ruleIndex + 1}: argument.equals`)
    return { kind: 'equals', path, value: condition.equals }
  }
  if (typeof condition.contains !== 'string' || condition.contains.length === 0) {
    throw new TypeError(`policy rule ${ruleIndex + 1}: argument.contains must be a non-empty string`)
  }
  return { kind: 'contains', path, value: condition.contains }
}

/** Compile and validate an ordered policy. Invalid configuration fails at plugin load. */
export function compilePolicy(config: ToolPolicyConfig = {}): CompiledPolicy {
  const defaultDecision = config.defaultDecision ?? 'deny'
  if (!isRuleDecision(defaultDecision)) {
    throw new TypeError('defaultDecision must be one of "allow", "ask", or "deny"')
  }
  const rules = config.rules ?? []
  if (!Array.isArray(rules)) throw new TypeError('rules must be an array')

  const compiledRules = rules.map((rule, ruleIndex): CompiledPolicyRule => {
    if (typeof rule.tool !== 'string' || rule.tool.length === 0 || rule.tool.trim() !== rule.tool) {
      throw new TypeError(`policy rule ${ruleIndex + 1}: tool must be a non-empty, trimmed string`)
    }
    if (!isRuleDecision(rule.decision)) {
      throw new TypeError(`policy rule ${ruleIndex + 1}: decision must be "allow", "ask", or "deny"`)
    }
    if (rule.reason !== undefined && (rule.reason.length === 0 || rule.reason.trim() !== rule.reason)) {
      throw new TypeError(`policy rule ${ruleIndex + 1}: reason must be a non-empty, trimmed string`)
    }
    const condition = rule.argument === undefined ? undefined : compileCondition(rule.argument, ruleIndex)
    return {
      pattern: compileGlob(rule.tool),
      decision: rule.decision,
      ...(rule.reason !== undefined ? { reason: rule.reason } : {}),
      ...(condition !== undefined ? { condition } : {}),
    }
  })

  return {
    defaultDecision,
    rules: compiledRules,
  }
}

/** Read a JSON Pointer from a JSON-compatible argument value. */
function readPointer(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) return MISSING
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function matchesCondition(condition: CompiledCondition, argumentsValue: unknown): boolean {
  const value = readPointer(argumentsValue, condition.path)
  if (value === MISSING) return false
  if (condition.kind === 'equals') return Object.is(value, condition.value)
  return typeof value === 'string' && value.includes(condition.value)
}

function ruleMatches(rule: CompiledPolicyRule, toolName: string, argumentsValue: unknown): boolean {
  return (
    rule.pattern.test(toolName) && (rule.condition === undefined || matchesCondition(rule.condition, argumentsValue))
  )
}

function ruleReason(rule: CompiledPolicyRule, ruleIndex: number, toolName: string): string {
  if (rule.reason !== undefined) return rule.reason
  if (rule.decision === 'ask') return `tool "${toolName}" requires approval under policy rule ${ruleIndex + 1}`
  return `tool "${toolName}" denied by policy rule ${ruleIndex + 1}`
}

function defaultReason(decision: 'ask' | 'deny', toolName: string): string {
  return decision === 'ask'
    ? `tool "${toolName}" requires approval because no policy rule matched`
    : `tool "${toolName}" denied because no policy rule matched`
}

/** Evaluate one parsed tool call; no arguments are copied into policy reasons. */
export function evaluatePolicy(policy: CompiledPolicy, toolName: string, argumentsValue: unknown): PolicyEvaluation {
  for (let ruleIndex = 0; ruleIndex < policy.rules.length; ruleIndex += 1) {
    const rule = policy.rules[ruleIndex]
    if (rule === undefined || !ruleMatches(rule, toolName, argumentsValue)) continue
    if (rule.decision === 'allow') return { decision: 'allow', ruleIndex }
    return { decision: rule.decision, reason: ruleReason(rule, ruleIndex, toolName), ruleIndex }
  }
  if (policy.defaultDecision === 'allow') return { decision: 'allow' }
  return { decision: policy.defaultDecision, reason: defaultReason(policy.defaultDecision, toolName) }
}
