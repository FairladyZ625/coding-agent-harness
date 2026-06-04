# Preset 开发指南

Harness Preset 是声明式的任务方法包。一个 Preset 可以添加任务元数据、渲染 Markdown 模板、要求 CLI 输入、生成证据文件，并在不写 JavaScript 的情况下预加载共享 Reference 包。

当多个任务需要从同一套方法、证据合同或共享上下文开始时，就应该使用 Preset。不要为了单次文字说明创建 Preset。好的 Preset 编码的是可重复任务行为：必需输入、任务类型、审查和证据要求、共享 Reference，以及少量任务计划指导，用来告诉下一个 Agent 应该先读什么。

`preset.yaml` 使用 Harness manifest 子集：嵌套 mapping、标量字符串 / 数字 / 布尔值，以及 `[standard, complex]` 这类 inline array。Preset manifest 不要使用 block string 或 dash-list YAML 形式。

## 怎么理解 Preset

Preset 不是更长的 prompt。它是一类工作的任务启动合同。最好的 Preset 素材来自团队已经在重复执行的真实工作：发布步骤、预发验证、API smoke test、浏览器回归、PR 模板、审查路由、回滚检查、外部 contract、截图，或者 Agent 在声称任务完成前必须运行的本地工具。

如果人经常需要反复提醒 Agent 同一份 checklist、Reference 包或验证路径，这个提醒大概率应该进入 Preset。目标是让每个新任务一创建就带着正确结构，让 Agent 不依赖聊天记忆或某个模型的指令遵循能力去发现流程。

好的 Preset 通常能回答这些问题：

- 这是什么任务类型，允许哪些预算？
- 创建任务时必须提供什么输入，比如 service name、target branch、release version、environment、API route 或 design surface？
- 每个 Agent 在实现前必须读哪些共享 Reference？
- 哪些 fixture、runbook、截图、API packet 或 review material 应该作为 Artifact 复制进任务？
- 哪些 evidence 文件能证明任务确实来自预期的方法包？
- 任务计划应该告诉 Agent 运行哪些命令、脚本、浏览器流程或外部检查？
- Agent 什么时候必须停下来问人，而不是自己猜？

## 从工作流提炼 Preset

按这个顺序把真实工作流转成 Preset：

1. 精确记录今天人是怎么跑这条重复链路的。包括手工步骤、本地 CLI 命令、浏览器或 Playwright 检查、预发发布要求、API smoke test、PR body 规则和清理动作。
2. 把稳定共享上下文和每次任务的输入分开。共享 contract 和 runbook 变成 reference resource；service name、version、environment 和 subject 变成 `inputs`。
3. 判断哪些内容应该写进 task plan，哪些应该放进 artifact bundle。Agent 必须遵守的指令应该在 `task_plan.md` 可见；支撑材料、fixture、截图和生成报告应该放到 artifacts。
4. 编码证明材料。添加 audit 和 evidence 文件，让 reviewer 能看出任务由哪个 Preset 创建、用了哪些输入、允许写哪些范围。
5. 用同一个 Preset 创建两个不同任务并对比。它们应该共享同一套方法，同时拥有独立任务目录、证据包和审查状态。

不要为了单次请求、模糊流程建议或尚未摸清楚的工作流创建 Preset。先跑一个普通任务，学清楚真实链路，再把可重复部分打包成 Preset。

## 安装位置

项目级 Preset 位于：

```text
<target>/.coding-agent-harness/presets/<preset-id>/
```

用户级 Preset 位于：

```text
~/.coding-agent-harness/presets/<preset-id>/
```

当提供 target 时，Harness 会先发现项目级 Preset，再发现用户级 Preset，最后发现 package 内置 `presets/` 目录下的 bundled Preset。仓库需要覆盖或固定任务方法时使用项目级 Preset；跨仓库复用个人方法时使用用户级 Preset。

Bundled Preset 不只是 fallback 文件。`npm install -g coding-agent-harness` 和 `harness install-user` 会把它们 seed 到用户级 Preset 根目录；`harness init` 会把它们 seed 到项目级 Preset 根目录。Preset 根目录缺失或不完整时，用 `harness preset seed` 修复用户级根目录，或用 `harness preset seed --project <target>` 修复项目级根目录。决定是否用 `--force` 重新 seed 前，可以先运行 `harness preset audit --json` 或 `harness preset audit --project --json <target>`，比较已安装 Preset 和 bundled Preset 的 manifest hash。

## 任务来源漂移

任务上的 Preset audit hash 是创建时来源证明。任务创建后，任务目录就是独立的文档记录；后续当前发现到的 Preset 改了，不应该默认让历史任务失效。Target check 会把 manifest、version 和 resource drift 报告为 `preset-drift-warning`，让维护者知道任务来自旧 Preset 形状，但不会把这类历史信息当作发布阻塞问题。

当前 Preset 执行仍然更严格。`harness preset check`、`harness preset install`、`harness new-task --preset` 和 `harness preset action` 会继续验证当前 Preset 包；当任务存储的 audit 与当前 Preset 不匹配时，敏感重跑需要显式 current-preset opt-in。

## Dashboard 管理

Dashboard 为目标项目提供 Presets 视图。静态 Dashboard 会显示只读 Preset catalog，包括 source、purpose、compatible budgets、task kind、manifest path 和 resource counts。

需要从网页 UI 管理 Preset 时，使用本地动态 Workbench：

```bash
harness dev /path/to/project
```

在 Workbench 模式下，Presets 视图可以检查 Preset，把本地 Preset 目录、`.zip` archive 或 bundled preset id 安装到项目级或用户级 scope，把 bundled Preset seed 到任一 scope，也可以卸载项目级 / 用户级 Preset。Bundled package Preset 在 Dashboard 中不可变：可以查看、检查、用作安装或 seed 来源，但不能编辑或删除。

CLI 和文件系统仍然是 canonical source。Dashboard 调用的也是同一套 `harness preset ...` registry 操作，不会存储独立的 Preset 状态。

## 包结构

```text
my-preset/
  preset.yaml
  templates/
    task_plan.append.md
    references/
      upstream-contract.md
  resources/
    service-runbook.md
```

## 最小 Manifest

```yaml
id: custom-review
version: 1
purpose: Create a review task with preset evidence.
compatibleBudgets: [standard, complex]
localeSupport: [en-US, zh-CN]
task:
  kind: review-task
  defaultTaskId: custom-review-task
entrypoints:
  newTask:
    type: template
    writes: [{{paths.tasksRoot}}/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
inputs:
  subject:
    type: text
    flag: --subject
    required: true
templateValues:
  subject:
    from: inputs.subject
metadata:
  ReviewSubject:
    label: Review Subject
    from: inputs.subject
evidence:
  bundleDir: artifacts/preset
  files:
    subject:
      path: subject.txt
      type: text
      value: inputs.subject
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: {{paths.tasksRoot}}/**
    access: write
```

## Task Actions

当 Preset 需要在任务创建后运行任务级命令时，使用 `actions`。例如关闭某个 workflow stage，或生成 Preset 拥有的 artifact。Action 通过命名空间 CLI 入口运行：

```bash
harness preset action custom-review close-stage --task custom-review-task --stage PLAN /path/to/project
```

Action script 是受信任的本地 Node.js 代码，不是 sandbox。非 bundled script action 安装时需要显式信任：

```bash
harness preset install ./custom-review --project --allow-scripts /path/to/project
```

```yaml
actions:
  close-stage:
    type: script
    command: scripts/close-stage.mjs
    taskRequired: true
    inputs:
      stage:
        type: text
        flag: --stage
        required: true
    reads: [{{task.paths.taskPlan}}, {{task.paths.artifacts}}/**]
    writes: [{{task.paths.artifacts}}/stages/**, {{task.paths.progress}}]
    audit: true
```

Action command 必须是 package-local `.mjs` 文件。输入只支持 schema 形式（`text`、`flag` 或 `json-file`），写入范围应该使用 `{{task.paths.*}}` token，让 action 始终限制在当前任务内。

## Reference Bundles

当一类任务共享同一份外部上下文时，使用 `resources.references`。这些上下文可以是另一个 microservice、API contract、migration packet、reviewer input 或本地验证 runbook。Harness 会把这些文件复制或渲染进每个新任务目录，追加 `references/INDEX.md` 行，并且可以在 `task_plan.md` 中添加 required-read 段落。

```yaml
resources:
  references:
    upstreamContract:
      path: references/upstream-contract.md
      template: templates/references/upstream-contract.md
      index:
        id: REF-001
        type: code
        summary: Shared upstream {{service}} contract for every task created by this preset.
        usedBy: coordinator,worker,reviewer
    serviceRunbook:
      path: references/service-runbook.md
      source: resources/service-runbook.md
      index:
        id: REF-002
        type: runbook
        summary: Local verification notes for the shared upstream service.
        usedBy: worker
context:
  requiredReads: [REF-001, REF-002]
```

文件需要 `{{valueName}}` 替换时使用 `template`；静态 Markdown 复制时使用 `source`。`path`、`source` 和 `template` 都必须留在 Preset package 和生成任务目录边界内。

## Artifact Bundles

Preset 提供的 fixture、生成输入包或 review material，若只是支撑任务而不是 Reference source of truth，应使用 `resources.artifacts`。Harness 会把这些文件写进任务的 `artifacts/` 区域，并追加 `artifacts/INDEX.md`。

```yaml
resources:
  artifacts:
    inputPacket:
      path: artifacts/input-packet.md
      source: resources/artifacts/input-packet.md
      index:
        id: ART-001
        type: fixture
        summary: Shared fixture packet copied by the preset.
        producedBy: preset
```

## 模板渲染

模板使用来自 `templateValues` 的 `{{valueName}}` placeholder。`templateValues` 和 `metadata` 支持 literal `value`、`default`，以及 `inputs.subject` 或 `task.title` 这样的 dot-path `from` 引用；它们不会执行任意表达式。

Runtime path 必须使用结构感知的 `{{paths.*}}` context，不要硬编码 `coding-agent-harness/...` 字符串。支持的 path 字段包括 `harnessRoot`、`planningRoot`、`tasksRoot`、`modulesRoot`、`externalRoot`、`governanceRoot`、`generatedRoot`、`regressionRoot`、`ledgerPath` 和 `closeoutIndexPath`。Harness 会从目标项目的 `harness.yaml` 解析这些路径。

`metadata` entry 会渲染成一等任务计划行，例如 `Review Subject: API contracts`。

```md
## Custom Review

Subject: {{subject}}
```

## Inputs

支持的输入类型：

| Type | Use |
| --- | --- |
| `text` | 读取 CLI flag 值，例如 `--subject "API"` |
| `flag` | 读取 boolean flag |
| `json-file` | 读取并验证 JSON 文件，例如 `--from-session session.json` |

`json-file` input 可以校验 `validateOperation`、拒绝 `planOnly`、要求 target path，并从 JSON session 路由任务目标。

## Evidence

Evidence 文件写入任务目录，并且必须匹配 `writeScopes`。

支持的 evidence 类型：

| Type | Output |
| --- | --- |
| `text` | 来自 value path 的纯文本 |
| `json` | 来自 value path 的 JSON |
| `input-json` | 解析后的原始 JSON input |
| `preset-audit` | Manifest audit payload |
| `preset-manifest` | Manifest snapshot |
| `write-scope` | 声明的 write scopes |
| `migration-verify` | 内置 migrate session verification |
| `migration-ledger` | 内置 migration phase ledger |
| `dashboard-hash` | migration dashboard snapshot hash |
| `target-git-status` | migration session 中的目标 Git 状态 |
| `target-commit` | 当前 target commit |
| `harness-version` | 当前 package version |
| `generated-at` | 生成时间戳 |

## 命令

```bash
harness preset check ./my-preset
harness preset install ./my-preset
harness preset install ./my-preset.zip
harness preset install ./my-preset --project /path/to/project
harness preset install legacy-migration --force
harness preset seed
harness preset seed --project /path/to/project
harness preset audit --json
harness templates audit --json /path/to/project
harness templates refresh --apply --json /path/to/project
harness preset list --json /path/to/project
harness preset inspect custom-review --json /path/to/project
harness new-task --title "Custom review task" --preset custom-review --subject "API contracts" /path/to/project
harness preset uninstall custom-review
```

## 验证方法

每个 Preset 都要同时证明 manifest 和下游任务行为：

1. 运行 `harness preset check ./my-preset`。
2. 安装目录；如果要分发 archive，也要在隔离 HOME 或一次性环境中安装 `.zip`。
3. 至少用 `harness new-task --preset` 创建一个任务。
4. 对于 reference bundle，用同一个 Preset 创建两个不同任务，确认它们都包含相同共享 `references/` 文件，同时有独立 audit / evidence bundle。
5. 运行 `harness status --json`、`harness task-index --json` 和 `harness check --profile target-project <target>`。
6. 检查 `task_plan.md`，确认 required reads 在实现开始前清晰可见。

## 边界

- Preset 不能写出声明的 `writeScopes`。
- Preset 在 `new-task` 阶段不会运行任意 JavaScript。
- Preset action 可以运行受信任的 `.mjs` script，但只能通过 `harness preset action <preset> <action>` 和任务本地 materialization 执行。
- Reference bundle 是任务本地快照。如果共享上游上下文后续变化，创建新 Preset 版本或后续任务，不要静默修改历史任务。
- Bundled package 中可以存在 script 和 check entrypoint，但任务创建路径是 YAML + templates + built-in processors。
- 只有当多个 Preset 都需要同一种能力，并且行为可以集中测试时，才新增 built-in processor。
