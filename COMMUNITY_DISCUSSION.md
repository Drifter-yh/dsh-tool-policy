# Discussion draft

## Title

Proposal: `dsh-tool-policy`, a declarative pre-dispatch policy plugin for DeepSeek Harness

## Body

DeepSeek Harness already provides the execution primitives that a production agent needs: sandboxing, one-shot approval, cooperative timeouts, provider retry, repeat-call reminders, and session telemetry. The remaining deployment gap is a small, generic policy seam that can apply the same decision vocabulary to every registered tool, including third-party and MCP tools.

`dsh-tool-policy` is an independent Cordis plugin that attaches to the public `tools/pre-execute` waterfall. It compiles ordered tool-name and JSON-Pointer argument rules, then returns `deny`, routes `ask` into the existing Harness approval seam, or delegates `allow` with `next()`. It defaults to deny, never rewrites arguments, never runs tool bodies, and does not create a second audit, timeout, retry, or approval implementation.

After publication, install it with `pnpm add dsh-tool-policy` and add it to a Cordis composition:

```yaml
- name: 'dsh-tool-policy'
  config:
    defaultDecision: deny
    rules:
      - tool: 'read_*'
        decision: allow
      - tool: 'mcp__*'
        decision: ask
        reason: 'External tool calls require approval.'
```

Repository: https://github.com/Drifter-yh/dsh-tool-policy

The repository includes pure matcher tests, ToolRuntime plugin tests, a real Cordis Loader composition, and an opt-in argument-free policy decision trace. It is validated against the public Harness `0.1.0-rc.6` packages and upstream commit `47f943859bef60e4160492346772ded9b24f765a`.

Feedback requested:

- Is `tools/pre-execute` the right public extension point for deployment policy?
- Should the first stable version remain intentionally limited to ordered rules and JSON Pointer scalar predicates?
- Which policy presets would be useful without turning this into a second enterprise policy engine?

Topics suggested for the repository: `dsh-plugin`, `deepseek-harness`, `cordis`, `agent-security`, `tool-governance`.

## Follow-up update draft

Publish this once the corresponding release is actually available; replace the placeholder with the release URL:

> `dsh-tool-policy` now has an opt-in policy decision trace. When `trace: true` is enabled, the Cordis logger records the tool name, this plugin's allow/ask/deny decision, and the matched rule number without copying tool arguments. The trace is best-effort and does not replace Harness audit or sandbox enforcement.
>
> Release: `<release URL>`
> Repository: https://github.com/Drifter-yh/dsh-tool-policy
>
> Feedback on real-world MCP and unattended-agent policies is welcome.
