# Research and design note

This plugin was designed against DeepSeek Harness commit `47f943859bef60e4160492346772ded9b24f765a`, targets the `>=0.1.0-rc.5 <0.2.0` API range, and is validated against the public `0.1.0-rc.6` package line after reading the repository's `AGENTS.md`, `CONTRIBUTING.md`, architecture and Cordis documents, the tool execution pipeline, session and approval subsystem contracts, and the official guard, timeout, telemetry, permission, and tool packages.

## Findings

1. **Plugin lifecycle.** A Cordis plugin is loaded into a context as a function, object, or `Service` subclass. Its `inject` declaration keeps it pending until required services exist. `ctx.on()`, registry registrations, and `ctx.effect()` are reversible effects; unloading, hot reload, or dependency loss removes them.
2. **Plugin communication.** Plugins share stable services through `ctx` and communicate across ownership boundaries through typed events. Waterfalls are ordered middleware: an observer must call `next()`, while a policy may short-circuit. Tool events are scope-filtered by the calling agent.
3. **Tool execution chain.** The loop records `tool/call`, then `ToolRuntime` runs `tools/pre-execute` → monotonic `ctx.tools.guard()` checks → `tools/execute` wrappers → the tool body → `tools/post-execute` → definition finalization → `tools/result`; the loop then records one durable `tool/result`.
4. **Existing safety and reliability.** `dsh-user-approval` owns one-shot approval and durable approval audit pairs. Sandbox policy and filesystem/shell providers enforce execution confinement. `dsh-tool-call-timeout-policy` owns cooperative deadlines. Provider-owned LLM retry policy handles model request retries. `dsh-repeat-tool-reminder` detects repeated calls without blocking them. Session telemetry exports redacted session records through a backend seam, and session stats folds tool wall time.
5. **Do not duplicate.** A new approval service, timeout wrapper, retry wrapper, audit exporter, session logger, or repeat-call detector would overlap official packages. The core already exposes the intended interception points, so changing the agent loop or monkey-patching a tool registry would violate the plugin architecture.

## Selected gap

Harness has no generic, declarative policy layer that can inspect every tool call before dispatch and turn a deployment rule into `deny` or `ask`. Existing tools can opt into approval, but a deployment cannot centrally require approval for an MCP namespace, block a dangerous argument pattern, or run an explicit deny-by-default tool allowlist without writing a custom listener.

`dsh-tool-policy` fills only that gap. It compiles ordered name and argument rules, evaluates the first match, returns `deny` directly, returns `ask` to the existing approval seam, and delegates `allow` so another policy cannot be force-allowed by this plugin. It does not execute tools, rewrite arguments, record a second audit stream, or implement approval itself.

## Extension point

The plugin injects `tools` and registers one `tools/pre-execute` listener. The listener sees the immutable, already-recorded call identity and parsed arguments. This keeps the plugin independent from `agent-loop`, `Session`, tool providers, and UI implementations.

## Decision trace

When `trace: true`, the listener sends an argument-free record through the Cordis logger after evaluating the policy. The record identifies the tool, this plugin's decision, the one-based matched rule number (or the default-policy marker), and the configured gated reason. It does not add a durable session event or duplicate Harness audit data. Logger exporter failures are contained so observability cannot change the allow, ask, or deny result.

## API stability isolation

All Harness-specific imports are confined to `src/index.ts`; the compiler and matcher live in `src/policy.ts` with no Cordis dependency. The integration tests exercise the real Loader and ToolRuntime path. The package declares Harness services as peer dependencies, so an application controls the exact compatible Harness version.
