# Tool policy recipes

These independent examples are complete `config` values for the `tool-policy` row in a profile patch (which replaces the entire config). For direct Cordis composition, put the same value under that entry's `config`. Replace example tool names with the exact names registered in your deployment; MCP names use `mcp__<serverName>__<rawName>`. Review the actual tools and arguments before use.

Each policy evaluates rules top to bottom: the first matching name and optional argument condition wins. Only if no rule matches does `defaultDecision` apply; if omitted, it is `deny`. `*` matches any sequence in an anchored tool-name pattern. These examples set the default explicitly.

`allow` routes the call onward, where other listeners and guards can still block it; `ask` delegates a one-shot decision to Harness approval, which fails closed without an approval channel; `deny` stops that matched call before its body. For an `ask` to proceed, configure the approval service, an available human answerer, an agent with an open session turn, and an approval policy that permits requests. A pending answerer may leave a call waiting. The plugin does not enforce capabilities: apply a restrictive Harness sandbox and runtime isolation to filesystem, network and process access, and verify that isolation covers every relevant tool. Independently constrain external MCP servers: a local Harness sandbox does not automatically confine a separately running server. A denied call or shell substring does not prevent equivalent actions through other tools or commands.

## MCP: route reads, approve other calls

Assume an MCP server named `catalog` exposes `search` and `delete`. Allow routes only search; ask escalates other MCP calls; deny blocks delete and all unmatched non-MCP calls by default. Place the specific deny before the MCP wildcard. Restrict the server's own credentials, network and storage access; require an approval channel and human answerer for other MCP calls.

<!-- recipe:mcp -->

```yaml
defaultDecision: deny
rules:
  - tool: 'mcp__catalog__delete'
    decision: deny
  - tool: 'mcp__catalog__search'
    decision: allow
  - tool: 'mcp__*'
    decision: ask
    reason: 'Other MCP calls require approval.'
```

## Read-only filesystem workflow

Assume a deployment registers `read_file`, `list_files`, and `write_file`. Allow routes the two read tools; ask escalates write requests; deny blocks every other unmatched tool. Configure and verify the Harness sandbox and runtime isolation to expose only the intended read-only paths and block writes through every relevant tool. The approval prerequisites above apply to `ask`; an independently enforced read-only boundary must still block an approved write.

<!-- recipe:filesystem -->

```yaml
defaultDecision: deny
rules:
  - tool: 'read_file'
    decision: allow
  - tool: 'list_files'
    decision: allow
  - tool: 'write_file'
    decision: ask
    reason: 'Write requests require approval.'
```

## Shell approval

Assume `bash` receives a string at `/command`, and `read_file` is a trusted read tool. Allow routes reads; ask sends other shell calls for approval; deny blocks the specific literal substring before the broader shell rule and blocks unmatched tools by default. The substring is case-sensitive and is not shell parsing; it can both miss equivalent commands and match harmless text. Restrict process, filesystem and network capabilities in the Harness sandbox; provide an approval channel and human answerer for shell calls.

<!-- recipe:shell -->

```yaml
defaultDecision: deny
rules:
  - tool: 'bash'
    decision: deny
    reason: 'This shell command pattern is disabled.'
    argument:
      path: /command
      contains: 'rm -rf'
  - tool: 'bash'
    decision: ask
    reason: 'Shell calls require approval.'
  - tool: 'read_file'
    decision: allow
```

## Unattended task: explicit allowlist

Assume the job needs only `read_file` and `mcp__catalog__search`. Allow routes those exact names; deny rejects all other calls by default. There is deliberately no `ask` rule: without an answerer an ask fails closed, so a job must not depend on interactive approval. If an ask rule is added, meet the approval prerequisites above or expect rejection or a wait. Restrict filesystem, network and process access in the sandbox/runtime and constrain MCP server credentials and access separately; ensure the allowed tools themselves are suitable for the task.

<!-- recipe:unattended -->

```yaml
defaultDecision: deny
rules:
  - tool: 'read_file'
    decision: allow
  - tool: 'mcp__catalog__search'
    decision: allow
```

The repository test `tests/recipes.spec.ts` loads the YAML snippets from both translations and checks the matcher outcomes, including ordering and defaults. It does not exercise a live MCP server, a sandbox, or an approval UI.
