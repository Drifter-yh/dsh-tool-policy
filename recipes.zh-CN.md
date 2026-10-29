# 工具策略使用示例

以下示例相互独立，均是 profile patch 中 `tool-policy` 行的完整 `config` 值（patch 会替换整个 config）。直接使用 Cordis composition 时，将相同内容放在该 entry 的 `config` 下。请将示例工具名替换为部署中实际注册的名称；MCP 名称格式为 `mcp__<serverName>__<rawName>`。使用前检查实际工具和参数。

每个策略从上到下匹配规则：工具名和可选参数条件都匹配时，第一条规则生效。没有规则匹配才使用 `defaultDecision`；省略时为 `deny`。`*` 匹配工具名中的任意字符序列，整个名称必须匹配。示例均显式设置默认值。

`allow` 将调用交给后续流程，其他监听器和 guard 仍可阻止它；`ask` 交给 Harness approval 作一次性裁决，没有审批通道时关闭失败；`deny` 在工具 body 执行前阻止匹配的调用。希望 `ask` 继续执行时，需要配置审批服务、可用的人工审批者、具有开放 session turn 的 agent，以及允许审批请求的策略。审批者尚未答复时调用可能等待。插件不实施能力隔离：应使用限制性的 Harness sandbox 和 runtime isolation 约束文件系统、网络和进程访问，并验证隔离覆盖每个相关工具。外部 MCP 服务需要单独约束：本地 Harness sandbox 不会自动限制独立运行的服务。拒绝某次调用或 shell 子串，并不能阻止其他工具或命令实现相同操作。

## MCP：路由读取调用，审批其他调用

假设名为 `catalog` 的 MCP 服务提供 `search` 和 `delete`。allow 只路由 search；ask 升级其他 MCP 调用；deny 阻止 delete，并默认拒绝未匹配的非 MCP 调用。具体的 deny 必须放在 MCP 通配规则之前。限制服务自身的凭据、网络和存储访问；其他 MCP 调用需要审批通道和人工审批者。

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

## 只读文件系统工作流

假设部署注册了 `read_file`、`list_files` 和 `write_file`。allow 路由两个读取工具；ask 升级写入请求；deny 阻止其他未匹配的工具。配置并验证 Harness sandbox 和 runtime isolation，只暴露预期的只读路径，并阻止通过任何相关工具写入。ask 需要满足上述审批前提；独立实施的只读边界仍须阻止已批准的写入。

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

## Shell 调用审批

假设 `bash` 在 `/command` 接收字符串，`read_file` 是可信读取工具。allow 路由读取；ask 将其他 shell 调用送审；deny 在更宽泛的 shell 规则之前阻止指定的字面子串，并默认阻止未匹配的工具。子串匹配区分大小写，不解析 shell；它既可能漏掉等价命令，也可能匹配无害文本。使用 Harness sandbox 限制进程、文件系统和网络能力；为 shell 调用提供审批通道和人工审批者。

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

## 无人值守任务：显式允许列表

假设任务只需要 `read_file` 和 `mcp__catalog__search`。allow 路由这两个精确名称；deny 默认拒绝所有其他调用。这里有意不设置 ask 规则：没有审批者时 ask 会关闭失败，因此任务不能依赖交互审批。如果添加 ask，需满足上述审批前提，否则应预期调用被拒绝或等待。通过 sandbox/runtime 限制文件系统、网络和进程访问，单独约束 MCP 服务的凭据和访问权限；确保允许的工具本身适合该任务。

<!-- recipe:unattended -->

```yaml
defaultDecision: deny
rules:
  - tool: 'read_file'
    decision: allow
  - tool: 'mcp__catalog__search'
    decision: allow
```

仓库中的 `tests/recipes.spec.ts` 会加载两种语言的 YAML 片段，检查匹配结果，包括顺序和默认值。它不测试真实 MCP 服务、sandbox 或审批界面。
