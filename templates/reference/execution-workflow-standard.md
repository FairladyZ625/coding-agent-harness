# Execution Workflow Standard

## 开发执行流程

### 开始任务前
1. 读 Feature SSoT，确认任务状态
2. 读对应的 task_plan.md，对齐目标
3. 确认是否需要开 worktree（参考 worktree-standard.md）
4. 如需开 worktree，按规范创建并记录

### 执行过程中
1. 每完成一个阶段，更新 progress.md
2. 研究发现写入 findings.md
3. 定期 commit，commit message 有意义
4. 遇到阻塞，立即记录到 progress.md 并报告

### 完成任务后
1. 确保所有改动已 commit，工作区 clean
2. 跑对应的回归测试（按 Cadence Ledger）
3. 更新 Feature SSoT
4. 写 walkthrough（参考 walkthrough-standard.md）
5. 如有 worktree，按规范清理

## Commit 规范

格式：`<type>(<scope>): <description>`

Type：
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构
- `test`: 测试
- `docs`: 文档
- `chore`: 构建/工具/配置

Scope：模块或包名

示例：
- `feat(auth): add OAuth2 login flow`
- `fix(dashboard): resolve timeline render delay`
- `test(plugin): add live smoke for slash commands`

## PR / Merge 规范

1. PR 标题遵循 commit 规范格式
2. PR 描述包含：改了什么、为什么改、怎么验证的
3. 引用对应的 task plan 和 feature SSoT 条目
4. 回归测试结果附在 PR 中
5. [如有 code review 流程，在此定义]

## 禁止事项

- 禁止在项目根目录放过程文件（task_plan、progress 等只能在任务目录内）
- 禁止跳过 task plan 直接开始非平凡任务
- 禁止 merge 后不跑回归
- 禁止 merge 后不写 walkthrough
