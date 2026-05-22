# 外部资料摄取标准

## 目的

定义目标项目里的 Agent 如何接收、过滤、整理外部项目或微服务团队提供的大量资料。核心原则是：外部资料先进资料包，经过摘要和验证后，再投影到稳定执行文档。

## 核心模型

```text
外部原始资料 -> source pack 索引 -> digest 摘要 -> 03/04/06 执行投影
```

`03-ARCHITECTURE`、`04-DEVELOPMENT`、`06-INTEGRATIONS` 不承载外部资料堆。它们只保存已经提炼、可验证、能指导当前仓库开发的事实。

## Diagnose / Decide 必问条件

只要目标项目满足任一条件，Agent 必须询问用户是否有外部资料：

- 当前仓属于多仓系统、微服务系统、前后端分仓或平台子系统。
- 代码中出现外部服务、SDK、API gateway、message queue、webhook、contract、schema 或 mock。
- 用户提到其他仓库、上下游、接口文档、业务知识、系统整体设计。
- Agent 无法只靠当前仓判断服务职责、接口契约或联调方式。

推荐问题：

1. 这个项目是否依赖外部服务或其他仓库？
2. 你是否有外部团队提供的架构文档、接口文档、流程图、会议纪要、代码路径、链接或导出包？
3. 这些资料能否复制进本仓？如果不能，是否只能保存本地路径或 URL？
4. 哪些资料是可信来源，哪些只是历史参考？

## 存储规则

| 场景 | 存储方式 |
| --- | --- |
| 只有 1-4 个稳定外部文档 | 不必建独立 source pack；在对应 `03/04/06` 的 `Source Evidence` 中链接 |
| 外部资料超过 5 份、跨多个主题、或会持续增长 | 创建 `docs/04-DEVELOPMENT/external-source-packs/<source-key>/` |
| 资料含敏感信息、密钥、客户数据或不能进仓 | 不复制原文；只记录外部路径、owner、访问条件和摘要 |
| 资料可入仓 | 可放 `raw/`，但必须经过 digest 后才能投影到执行文档 |

推荐结构：

```text
docs/04-DEVELOPMENT/external-source-packs/<source-key>/
├── README.md
├── digests/
├── raw/
└── raw-index.md
```

## 摄取流程

1. Inventory：列出所有资料，记录来源、owner、时间、可信度和是否可入仓。
2. Classify：按 architecture、development、integration、security、operations、product、unknown 分类。
3. Sanitize：检查密钥、token、客户数据、隐私、内部账号和不可公开链接。
4. Digest：提炼事实、疑问、不安全假设和证据。
5. Project：把稳定事实投影到 `03/04/06`。
6. Verify：尽可能用代码、接口测试、owner 确认或运行证据验证。
7. Residual：不能确认的内容留在 source pack 或 `Do Not Assume`，不进入执行事实。

## 投影规则

| 资料内容 | 投影位置 |
| --- | --- |
| 服务职责、上下游、owner、数据归属、系统拓扑 | `03-ARCHITECTURE/service-catalog.md` 或 `services/<service-key>.md` |
| 本仓开发时如何 mock、stub、启动、联调、排查 | `04-DEVELOPMENT/external-context/<service-key>.md` |
| endpoint、payload、auth、error、event、webhook、SDK、contract test | `06-INTEGRATIONS/<contract>.md` |
| 未确认、来源冲突、过期或背景参考 | 留在 source pack README / digest |

## 禁止事项

- 不把几十份外部文档直接复制到 `03-ARCHITECTURE`、`04-DEVELOPMENT` 或 `06-INTEGRATIONS` 根目录。
- 不把 digest 当成已验证事实。
- 不在执行文档里保留大段原文、聊天流水或历史会议记录。
- 不把密钥、token、客户数据、个人隐私或不可公开资料提交进仓。
- 不为每个微服务复制一套完整目录树。
