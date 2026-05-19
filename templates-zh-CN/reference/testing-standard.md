# 测试标准

## 职责

本标准定义完成任务前最低验证要求。测试不是为了证明“改过了”，而是为了证明本轮目标、关键路径、回归面和 residual 判断有证据支撑。

## 测试体系画像

| 项 | 项目约定 |
| --- | --- |
| 单元测试 | 框架、命令、目录 |
| 集成测试 | 框架、命令、外部依赖处理 |
| 端到端测试 | Playwright / Cypress / 其他 |
| 浏览器检查 | 本地 URL、截图、console、network、交互路径 |
| live smoke | 环境、账号、权限、日志和回滚边界 |
| 测试数据 | fixture、factory、seed、脱敏数据 |
| 覆盖率目标 | 核心模块、工具函数、adapter、UI 关键路径 |

## 目录和命名

- 测试目录遵循项目现有结构，不为单次任务新建割裂风格。
- 测试文件使用项目约定，例如 `*.test.ts`、`*.spec.ts`、`test_*.py`。
- 测试用例名描述行为和条件，例如“当用户未登录时拒绝访问私有接口”。
- fixture、mock、snapshot 要有清晰边界；不要把内部实现细节固定成脆弱快照。

## 分层验证

| 层级 | 用途 | 适用场景 |
| --- | --- | --- |
| unit | 验证纯逻辑、边界条件、错误处理 | 工具函数、核心算法、纯业务规则 |
| integration | 验证模块协作、数据库、外部 client 封装 | 服务层、adapter、schema 变更 |
| e2e | 验证用户路径或跨层流程 | UI、API、关键业务流 |
| 本地冒烟 | 验证本地运行入口 | CLI、服务启动、页面打开 |
| 浏览器检查 | 验证真实浏览器渲染、交互、console、network | 前端、可视化、登录流程 |
| 线上冒烟 | 验证真实环境和部署链路 | 发布、反向代理、第三方集成 |

## 回归触发

以下情况必须查看 Regression SSoT 和 Cadence Ledger：

- merge 到主干前。
- 修改关键 surface、共享组件、schema、路由、权限、数据迁移。
- 修复线上或用户可见缺陷。
- release、hotfix、CI/CD、部署配置变更。
- reviewer finding 要求重跑证据。

## 证据要求

验证结果必须写明：

- 命令或检查名称。
- 运行位置和时间。
- 通过 / 失败 / skipped。
- 失败时的错误摘要。
- 证据路径：日志、截图、trace、CI run、Regression SSoT、walkthrough 或 PR。
- skipped 时的 residual、owner 和不阻塞理由。

## 测试编写原则

1. 每个测试验证一个清晰行为。
2. 测试之间互相独立，不依赖执行顺序。
3. 外部依赖通过 fixture、mock server、test container 或明确的 live smoke 处理。
4. mock 外部边界，不 mock 被测内部实现。
5. 错误信息要能帮助定位问题。
6. 复杂回归优先沉淀成可重复命令，而不是一次性手工步骤。

## 收口要求

- 非平凡代码改动至少提供一种自动化测试或明确说明为什么只能 smoke。
- 前端可视化或交互改动需要 browser inspection，除非有明确不适用原因。
- 发布和部署改动需要 CI/CD 证据、live smoke 或受控 residual。
- 测试失败不能直接收口；必须修复、写为 `accepted-risk` 并路由，或暂停并交给 owner。
