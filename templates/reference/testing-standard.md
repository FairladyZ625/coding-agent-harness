# Testing Standard

## 测试框架
- 单元测试：[框架名，如 vitest / jest / pytest]
- 集成测试：[框架名]
- 端到端测试：[框架名，如 playwright / cypress]

## 测试目录结构
```
[根据项目实际情况填写]
```

## 命名规范
- 测试文件：`*.test.ts` / `*.spec.ts`（根据项目约定）
- 测试用例：描述性命名，`should [expected behavior] when [condition]`

## 覆盖率要求
- 核心模块：[目标覆盖率，如 80%]
- 工具函数：[目标覆盖率]
- 适配器层：[目标覆盖率]

## 冒烟测试
- 入口命令：[如 `npm run smoke`]
- 覆盖范围：[列出关键 surface]
- 执行时机：每次 merge 到主干前

## 回归测试
- 参考 `docs/05-TEST-QA/Regression-SSoT.md`
- 按 Cadence Ledger 规则触发

## 测试编写原则
1. 每个测试只验证一件事
2. 测试之间互相独立，不依赖执行顺序
3. 使用 fixture / factory 管理测试数据，不硬编码
4. mock 外部依赖，不 mock 内部实现
5. 测试失败时的错误信息要有诊断价值
