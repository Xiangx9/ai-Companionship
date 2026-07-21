# Week2 回归清单（ISSUE-14）

> 目标：两周结束能自信说「主循环可演示」。  
> 自动部分：`npm run test:regression`  
> 手工部分：本文件勾选；冒烟可用 `npm run test:smoke`（需 Playwright + 可启 dev server）

---

## A. 自动回归（一键）

| 项 | 命令 | 覆盖 |
|----|------|------|
| 进度状态机 | `test:progress` | open/teach/practice/quiz 状态迁移 |
| AI 错误映射 | `test:ai-error` | timeout/aborted/http/empty/config/network |
| 流式解析 | `test:stream` | SSE delta / abort / empty |
| 存储压缩 | `test:storage-slim` | session/消息/项目剪裁 |
| 今日卡片 | `test:today-card` | in_progress / 计划 / review 优先级 |
| 错题队列 | `test:wrong-answers` | 记录 / 消除 / 历史保留 / slim |
| Markdown 兜底 | `test:markdown` | `\python` fence / Step 标题 / 空行折叠 |

一键：

```bash
npm run test:regression
```

等价于 `npm run test:unit`（当前单元套件全集）。

构建校验（可选，较慢）：

```bash
npm run build
```

---

## B. 手工主循环（演示前勾选）

### B1 新建目标
- [ ] 首页能创建学习项目（或导入已有项目）
- [ ] 生成/加载后出现知识路径与模块

### B2 打开知识树
- [ ] 进入项目页看到模块与知识点列表
- [ ] 进度色/状态标签可读
- [ ] 弱项/错题列表（若有错题）可见

### B3 今日卡片
- [ ] Home 或项目页有「今日学习」卡片
- [ ] 点击进入对应知识点
- [ ] 若有错题，出现复习条并可跳转

### B4 讲解流式
- [ ] 打开知识点默认在「AI 讲解」
- [ ] 开始教学有流式输出（或 mock 下可中断/续讲）
- [ ] 取消/中断后 UI 不卡死，可重试
- [ ] 错误时中文提示稳定（非裸英文堆栈）

### B5 练习
- [ ] 可生成/打开练习
- [ ] 提交未通过 → 进入弱项/错题队列
- [ ] 通过后进度可推进（或至少不倒退）

### B6 测试
- [ ] 可完成测验
- [ ] 分数 < 70 → 出现在弱项/错题
- [ ] 分数达标 → 对应错题可 resolve（降权/消除活跃项）
- [ ] 历史记录仍保留（非硬删）

### B7 进度可信
- [ ] 标记完成/掌握后树与统计更新
- [ ] 刷新页面进度仍在（localStorage）
- [ ] 「继续学习」指向合理知识点

### B8 导出 / 存储
- [ ] 可导出备份
- [ ] 大项目下存储剪裁不丢关键进度（会话/错题上限）
- [ ] 无严重 quota 崩溃；满时有中文提示

### B9 文档 / 图表 / 视频（增强，可降级）
- [ ] 学习文档 tab 可打开
- [ ] 图表 tab 可打开（无图时友好空态）
- [ ] 推荐视频 tab 不阻塞主循环

---

## C. Week2 出口标准

- [x] 流式讲解可用（ISSUE-08）
- [x] 存储不易爆（ISSUE-09）
- [x] 今日卡片 + 最小复习（ISSUE-11/12）
- [x] store 可维护拆分（ISSUE-10）
- [x] AI 错误统一层（ISSUE-13）
- [ ] 本清单手工项演示前勾完
- [ ] `npm run test:regression` 全绿
- [ ] `npm run build` 通过

---

## D. 已知非目标（本两周不做）

- 账号 / 云同步
- 完整 SRS
- 重做视觉系统
- 原生 App

---

## E. 故障速查

| 现象 | 优先检查 |
|------|----------|
| 讲解无输出 | `.env.local` API Key；网络；控制台 AiRequestError |
| 进度丢失 | 是否清过 localStorage；导入备份 |
| 错题不出现 | 测验分是否 < 70；练习是否 fail |
| 构建失败 | `vue-tsc` 报错；先 `npm run test:unit` |
| 冒烟失败 | Playwright 安装；端口占用；`BASE_URL` |

最后更新：2026-07-20 · ISSUE-14
