# AI Learning OS — 两周迭代 Issue 清单

> 目标：打磨主循环「打开知识点 → 短讲解 → 检查题 → 进度可信更新」  
> 原则：AI 讲解优先；文档/视频为增强；少堆功能，多做闭环  
> 周期：10 个工作日（Week1 体验+可信度，Week2 稳定+骨架）

---

## 使用方式

- 优先级：`P0` 必做 / `P1` 应做 / `P2` 有余力  
- 估时：人日（1 人日 ≈ 6 有效工时）  
- 验收：每条 Issue 有可勾选 Acceptance Criteria  
- 建议节奏：每天合 1 个可演示增量，避免大爆炸 PR

---

## Week 1 — 主循环可读、可信、可完成

### ISSUE-01 · 教学回复强制短结构（Prompt + 参数） ✅ DONE
- **Priority**: P0
- **Estimate**: 0.5d
- **Area**: `prompts/teacher.md`, `src/services/aiEngine.ts`
- **Why**: 降低墙式文字，服务「好扫读」
- **Scope**
  - 固化：一步一教、180–320 字、标准 fence、结尾 1 问
  - `teachKnowledgePoint` 保持/校验 `maxTokens`/`temperature`/硬规则注入
- **Acceptance**
  - [ ] 连续 5 次教学调用，单次正文大体 < 400 字（代码除外）
  - [ ] 不再出现 `\python` 伪围栏（模型侧 + 渲染侧双保险）
  - [ ] 默认只推进一个 Step
- **Done when**: 新开知识点教学，首条回复即可扫读

---

### ISSUE-02 · Markdown 渲染兜底单测 ✅ DONE
- **Priority**: P0
- **Estimate**: 0.5d
- **Area**: `src/utils/markdown.ts`, `tests/`
- **Why**: 防回归；历史脏消息也能读
- **Scope**
  - 为 `normalizeMarkdown` 补单元测试
  - 覆盖：`\python` → fence、未闭合 fence、Step 标题升级、多空行折叠
- **Acceptance**
  - [x] 测试可本地一键跑（`npm test` 或独立 node 脚本）
  - [x] 至少 6 个 case，含中文 Step 标题
- **Done when**: CI/本地脚本全绿

---

### ISSUE-03 · 讲解气泡「轻操作」 ✅ DONE
- **Priority**: P0
- **Estimate**: 1d
- **Area**: `src/components/AiChat.vue`, store 教学发送逻辑
- **Why**: 用户累了时不必重打字
- **Scope**
  - 快捷按钮：`再说短一点` / `再举一例` / `我还不懂`
  - 按钮注入隐式 user 指令（不污染展示文案或可折叠显示）
- **Acceptance**
  - [ ] 三按钮在 teacher 消息后可见
  - [ ] 点击后触发新一轮 teach，且指令生效倾向明显
  - [ ] 教学 busy 时按钮禁用
- **Done when**: 无需键盘也能把讲解调到合适粒度

---

### ISSUE-04 · 进度状态机（可信进度） ✅ DONE
- **Priority**: P0
- **Estimate**: 1.5d
- **Area**: `src/store/learning.ts`, `src/types/learning.ts`, 详情页
- **Why**: 点开 ≠ 学会；仪表盘要可信
- **Scope**
  - 定义规则（可配置常量）：
    - `not_started` → 打开详情：`in_progress`
    - `in_progress` → 完成 ≥1 次讲解互动 + 练习达标：`learning`/`consolidating`（沿用现有枚举则映射清楚）
    - 测试过线：`completed` / `mastered`
  - UI 展示「如何升级到下一状态」的一行提示
- **Acceptance**
  - [ ] 仅打开 Tab 不会直接 mastered
  - [ ] 练习/测试结果会驱动状态迁移
  - [ ] 知识树节点颜色/标签与规则一致
  - [ ] 有纯函数可单测（输入事件 → 新状态）
- **Done when**: 用户能解释「为什么这个点算完成了」

---

### ISSUE-05 · 知识点页「下一步」引导条 ✅ DONE
- **Priority**: P1
- **Estimate**: 1d
- **Area**: `KnowledgeDetailView.vue`
- **Why**: Tab 多时不知道先干嘛
- **Scope**
  - 顶部 sticky 引导：当前建议动作（去讲解 / 去做题 / 去测试 / 已掌握）
  - 一键跳对应 Tab
- **Acceptance**
  - [ ] 新知识点默认引导「开始 AI 讲解」
  - [ ] 讲解后有互动则引导「做练习」
  - [ ] 练习达标引导「自测」
  - [ ] 已掌握显示复盘入口（可选）
- **Done when**: 新用户不靠猜也能走完闭环

---

### ISSUE-06 · 生成失败/慢请求体验 ✅ DONE
- **Priority**: P1
- **Estimate**: 1d
- **Area**: `aiEngine.ts`, 路径生成页/组件, toast
- **Why**: 冷启动失败最伤留存
- **Scope**
  - 路径/计划/教学统一：超时文案、重试按钮、可取消
  - 路径生成中展示骨架模块（假结构或上一次缓存）
- **Acceptance**
  - [x] 断网/超时出现明确 CTA「重试」
  - [x] 取消请求后 UI 不卡死
  - [x] 不再只转圈无说明
- **Done when**: 失败可自救，不必刷新整站
- **Implemented**
  - `src/utils/aiError.ts`: 统一错误码 → 中文文案 + retryable
  - Store: `clearGenerateError` / `mapGenerationError`；`endGeneration` 成功后清空进度，不再误标「已取消」
  - 首页路径生成：进度说明 + 路径骨架 + 错误面板（重试/关闭）+ 取消
  - 计划/报告：生成中骨架/说明、错误面板重试、取消恢复
  - 教学详情：文档/练习/测试/图表错误态带「重试」；聊天思考状态条


---

### ISSUE-07 · Week1 冒烟 E2E ✅ DONE
- **Priority**: P1
- **Estimate**: 0.5d
- **Area**: `scripts/smoke-e2e.cjs`, Playwright
- **Why**: 防主循环回退
- **Scope**
  - 冒烟：进入已有项目 → 打开知识点 → 讲解 Tab 可见 → 发送一条/点快捷按钮（可 mock AI）
- **Acceptance**
  - [x] 一条命令可跑（`npm run test:smoke`）
  - [x] 失败日志可读（console + `screenshots/smoke-report.json`）
- **Done when**: 合并前能快速验主路径
- **Implemented**
  - Mock AI：拦截 `**/chat/completions`，无需真实 API Key
  - Fixture 注入 localStorage（`aios_projects` / `aios_active_project`）
  - 自动探测 dev server；详情已由 `resumeFromRoute` 打开时跳过 KP 点击
  - 覆盖：进项目 → 讲解 Tab → 开始教学 → 快捷按钮「再说短一点」
  - 真 AI 全流程仍用 `npm run test:flow`

**Week1 出口标准**
- 讲解短且可读
- 进度不再「点开即完成」
- 用户有明确下一步
- 主路径有自动化冒烟

---

## Week 2 — 稳定、骨架、差异化雏形

### ISSUE-08 · 教学流式输出（SSE/分片） ✅ DONE
- **Priority**: P0
- **Estimate**: 1.5d
- **Area**: `aiEngine.ts`, `AiChat.vue`, store
- **Why**: 体感 > 等一整段
- **Scope**
  - `teachKnowledgePoint` 支持 stream（API 若无 SSE 则 chunk mock 降级）
  - 气泡边生成边渲染（仍走 markdown normalize）
- **Acceptance**
  - [x] 首字/首句出现时间明显短于全量等待（SSE 增量 / 全量降级分片）
  - [x] 中断/失败可恢复或提示重试（停止生成 + 保留部分内容）
  - [x] 最终消息落库内容完整（流结束后 normalizeMarkdown 再 persist）
- **Done when**: 教学不再「黑盒转圈 20 秒」
- **Implemented**
  - `chatCompletionStream` + SSE 解析（`parseSseDataLine` / `extractStreamDelta`）
  - 非 SSE 网关回落：全量响应 + `simulateTextStream` 分片渲染
  - `startTeaching` / 快捷指令路径：placeholder 气泡 + `onDelta` 渐进更新
  - UI：流式光标、思考条「停止」、详情页「停止生成」
  - 单测：`npm run test:stream`

---

### ISSUE-09 · 聊天与项目存储瘦身 ✅ DONE
- **Priority**: P0
- **Estimate**: 1d
- **Area**: `src/utils/storage.ts`, `src/utils/storageSlim.ts`, store
- **Why**: localStorage 易爆
- **Scope**
  - 每知识点仅保留最近 N 轮教学（如 20）
  - 大字段压缩/裁剪策略
  - 配额满时 toast + 引导导出备份
- **Acceptance**
  - [x] 刻意灌数据后仍可保存关键进度
  - [x] 超限有可读提示，不静默丢全量
  - [x] 导出/导入备份仍可用
- **Done when**: 重度使用 1 周不轻易 quota 崩
- **Implemented**
  - `src/utils/storageSlim.ts`: normal/aggressive/critical slim
  - Store persist: soft prune + quota toast + emergency backup + escalate
  - init/importBackup slim; export/import kept
  - tests: `npm run test:storage-slim` (in `test:unit`)

---

### ISSUE-10 · 拆分 learning store（第一刀） ✅ DONE
- **Priority**: P1
- **Estimate**: 1.5d
- **Area**: `src/store/learning.ts` → `src/store/learning/`
- **Why**: 46KB 单文件难维护
- **Scope**
  - 拆为：`projectStore` / `progress` helpers / `teachSession` / `importExport`
  - 或 `store/learning/` 目录 + 组合导出，对外 API 尽量不变
- **Acceptance**
  - [x] 行为无回归（unit + build 通过）
  - [x] 单文件不超过 ~400 行（目标，允许过渡；progress 436 / index 223）
  - [x] 类型不环依赖
- **Done when**: 改教学不必翻完整「上帝 store」
- **Implemented**
  - 入口 facade: `src/store/learning.ts` → re-export `useLearningStore`
  - `src/store/learning/index.ts` 组合入口（~223 行）
  - factories: `generation` / `persistence` / `progress` / `projectActions` / `teachSession` / `contentActions` + pure `helpers`
  - 对外 API 保持不变

---

### ISSUE-11 · 今日学习卡片（Home/项目页） ✅ DONE
- **Priority**: P1
- **Estimate**: 1d
- **Area**: `KnowledgeTreeView.vue` / `LearningHome.vue` / store
- **Why**: OS 感来自「今天做什么」
- **Scope**
  - 展示：今日建议知识点、预计时长、完成状态、一键继续
  - 规则：优先 in_progress → 计划中今日项 → 下一个 not_started
- **Acceptance**
  - [x] 有进行中项目时，进入即可看到「今日卡片」
  - [x] 点击直达对应知识点讲解 Tab（默认 explain）
  - [x] 完成后卡片状态随 progress 更新
- **Done when**: 回访用户 3 秒内知道学什么
- **Implemented**
  - pure picker: `pickTodayLearningTarget` in `src/store/learning/helpers.ts`
  - store API: `getTodayLearningCard`
  - UI: `src/components/TodayLearningCard.vue` on Home + KnowledgeTreeView
  - unit: `npm run test:today-card`


---

### ISSUE-12 · 错题/弱项回流（最小复习） ✅ DONE
- **Priority**: P1
- **Estimate**: 1.5d
- **Area**: store + 测试/练习结果 + 今日卡片
- **Why**: 对齐「直到学会」
- **Scope**
  - 记录错题知识点 id + 时间
  - 今日卡片可插入 1 个复习项
  - 详情引导「复习错题」入口（轻量列表即可）
- **Acceptance**
  - [x] 测试答错会进入弱项列表
  - [x] 复习完成可消除或降权
  - [x] 不新增复杂 SRS 算法（简单队列即可）
- **Done when**: 错题不会消失在历史记录里

---

### ISSUE-13 · AI 错误与超时统一层 ✅ DONE
- **Priority**: P2
- **Estimate**: 0.5d
- **Area**: `aiEngine.ts`
- **Why**: 各调用点文案/行为不一致
- **Scope**
  - 统一 `AiRequestError` 映射：timeout / http / empty / aborted
  - 业务侧只处理枚举，不拼裸字符串
- **Acceptance**
  - [x] 教学/出题/路径至少 3 处共用映射
  - [x] 用户可见中文提示稳定
- **Done when**: 新接一个 AI 能力不用重写错误处理

---

### ISSUE-14 · Week2 回归清单（手工 + 自动） ✅ DONE
- **Artifacts**: `docs/WEEK2_REGRESSION.md`, `npm run test:regression`
- **Priority**: P1
- **Estimate**: 0.5d
- **Area**: `docs/` 或 `scripts/`
- **Why**: 两周结束可发布
- **Scope**
  - 清单：新建目标、打开树、讲解流式、练习、测试、进度、导出
  - 自动：markdown 单测 + 主路径冒烟
- **Acceptance**
  - [x] 清单可勾选
  - [x] 自动部分一键跑
- **Done when**: 能自信说「主循环可演示」

**Week2 出口标准**
- 流式讲解可用
- 存储不易爆
- 今日卡片 + 最小复习让回访有理由
- store 可维护性提升

---

## 建议排期（1 人全职参考）

| Day | Issues |
|-----|--------|
| D1 | ISSUE-01, ISSUE-02 |
| D2 | ISSUE-03 |
| D3–D4 | ISSUE-04 |
| D5 | ISSUE-05, ISSUE-07 |
| D6 | ISSUE-06（可与 D5 交叉） |
| D7–D8 | ISSUE-08 |
| D9 | ISSUE-09, ISSUE-13 |
| D10 | ISSUE-11 |
| Buffer / 加班位 | ISSUE-10, ISSUE-12, ISSUE-14 |

> 若只有业余时间：先做 **01 → 03 → 04 → 05 → 08 → 11**，其余顺延。

---

## 明确不做（本两周）

- 账号体系 / 云同步
- 社区/社交
- 重做视觉设计系统
- 完整间隔重复算法
- 多模型路由市场
- 原生 App

---

## Issue 模板（复制用）

```md
### ISSUE-XX · 标题
- Priority:
- Estimate:
- Area:
- Why:
- Scope:
  -
- Acceptance:
  - [ ]
- Depends on:
- Done when:
```

---

## 追踪建议

- 每个 Issue 对应 1 个 PR（或 1 个明确 commit 序列）
- PR 标题：`feat(teach): ...` / `fix(progress): ...` / `refactor(store): ...`
- 演示日：Week1 周五、Week2 周五 各录 2 分钟主循环视频
