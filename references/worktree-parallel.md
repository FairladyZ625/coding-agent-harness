# Worktree 并行开发

## 核心思路

所有非平凡代码任务，默认先开独立的 git worktree，再开始写代码。这样多个 agent 可以在各自的分支上独立工作，互不干扰。

## 什么时候必须开 worktree

- 跨多个子项目或多文件的实现/重构
- 会持续多轮迭代的任务
- regression / smoke / harness 语义改动
- 当前主工作区已经有未提交改动，且本轮任务不是在这些改动上继续

## 什么时候可以不开

- 纯只读分析
- 纯文档小修
- 用户明确要求直接在当前工作区修改
- 当前任务就是接着本工作区已存在的同一批改动继续收尾

## 为什么并行开发不会乱

1. **分支隔离** — 每个 worktree 有自己的分支，代码改动互不影响
2. **Planning 隔离** — 每个 worktree 对应的 agent 只看自己的 task_plan，不会被别的任务上下文污染
3. **Merge 时自动回归** — Cadence Ledger 定义了改什么就跑什么回归面
4. **Worktree 清理** — merge 完成后必须删除，不允许长期堆积

## Worktree 命名规范

格式：`<前缀>-<任务名称>`

前缀规则：
- `feat/` — 新功能
- `fix/` — Bug 修复
- `refactor/` — 重构
- `test/` — 测试相关
- `docs/` — 文档相关

示例：
- `feat/user-auth-oauth2`
- `fix/timeline-render-delay`
- `refactor/plugin-adapter-decouple`

## 分支命名规范

分支名与 worktree 名保持一致，使用同样的前缀和任务名。

## 操作流程

### 创建 Worktree

```bash
# 1. 确保主干是干净的
git status  # 应该是 clean

# 2. 创建 worktree
git worktree add .worktrees/<worktree-name> -b <branch-name>

# 3. 进入 worktree
cd .worktrees/<worktree-name>

# 4. 安装依赖（如需要）
npm install  # 或 pnpm install / yarn install
```

### Merge 回主干

```bash
# 1. 在 worktree 中确保所有改动已提交
git status  # 应该是 clean

# 2. 回到主工作区
cd /path/to/main/repo

# 3. Merge
git merge <branch-name>

# 4. 解决冲突（如有）
# ...

# 5. 跑回归测试（按 Cadence Ledger 规则）
```

### 清理 Worktree

```bash
# 1. 删除 worktree
git worktree remove .worktrees/<worktree-name>

# 2. 删除分支（如已 merge）
git branch -d <branch-name>

# 3. 确认清理完成
git worktree list  # 不应该再看到该 worktree
```

## 多 Agent 并行分工协议

当多个 agent 同时在不同 worktree 上工作时：

1. **任务分配必须明确** — 每个 agent 只负责自己的 worktree，不跨 worktree 操作
2. **共享文件的修改需要协调** — 如果两个 agent 都需要改同一个文件，必须串行执行
3. **Merge 顺序由人决定** — agent 不应自行决定 merge 顺序
4. **冲突解决需要人工确认** — agent 可以尝试自动解决简单冲突，但复杂冲突必须报告给人

## 保留旧 Worktree 的唯一合理理由

- 当前还有运行中的服务依赖该路径
- 仍在做未完成的验证或回滚比对
- 用户明确要求保留

若选择暂时保留，必须在 progress.md 里写明保留原因。
