# AI Learning OS

AI 驱动的学习操作系统。输入任何想学的内容，AI 自动成为你的私人老师，生成完整学习路径、知识树、学习计划，并提供 AI 教学、文档、视频、练习、测试等功能。

> 一句话介绍：输入任何想学习的内容，AI 自动成为你的私人老师。

## 功能特性

- **AI 智能规划** - 输入学习目标，自动生成结构化学习路径和知识树
- **知识图谱可视化** - 可缩放、拖动、点击的知识树，已学习节点高亮显示
- **AI 私人老师** - 固定人格 Learning Mentor，主动教学（解释到举例到提问到评分到继续）
- **多维学习资源** - 每个知识点配备文档、视频、练习、测试等丰富资源
- **每日学习计划** - AI 根据你的时间自动生成按日排列的学习日程
- **学习仪表盘** - 连续学习天数、累计学时、掌握进度一目了然
- **每日学习总结** - 自动生成本日学习内容、薄弱点分析和改进建议
- **本地持久化** - 学习进度、笔记、计划自动保存到浏览器

## 支持领域

编程、AI、数学、英语、摄影、股票、投资、心理学、历史、法律、医学（仅学习）、考研、公考、阳明心学

## 用户流程

首页输入学习目标 -> AI 分析并生成学习路线图（知识树） -> 点击知识节点查看详情 -> Tab 切换：AI 讲解/文档/视频/练习/测试/笔记 -> AI 教学互动 -> 完成练习与测试 -> 记录学习进度，生成每日学习报告

## 快速开始

`ash
npm install
npm run dev
`

## 项目结构

`
src/
  api/                  API 配置
    config.ts           统一 API 地址和密钥
  assets/               静态资源
  components/           可复用组件
    AiChat.vue          AI 教学对话框
    KnowledgeCard.vue   知识点卡片
    KnowledgeDetailView.vue  知识点详情面板（Tab 切换）
    ProgressBar.vue     线性进度条
    RingProgress.vue    环形进度
    StudyCard.vue       学习卡片
  data/                 预置数据
    domains.ts          学习领域 + 路径模板
  router/               路由配置
    index.ts
  services/             AI 服务层（统一调用入口）
    aiEngine.ts         8 个 AI 能力：路径/计划/教学/出题/评分/总结/文档/流程图
    learningPath.ts     学习路径生成（兼容旧接口）
  store/                Pinia 状态管理
    index.ts
    learning.ts         学习项目 CRUD、进度、AI 交互
  types/                TypeScript 类型定义
    index.ts
    learning.ts         13 个接口：资源/知识点/模块/路径/计划/会话/练习/测试/日报等
  views/                页面组件
    LearningHome.vue      首页：输入学习目标
    KnowledgeTreeView.vue 主视图：知识树 + 模块列表 + 计划 + 报告
    LearningPathView.vue  知识点详情视图
    ProjectsView.vue      项目列表页
`

## 技术栈

- 框架：Vue 3 + TypeScript + Vite
- 状态管理：Pinia
- 路由：Vue Router
- AI 引擎：Agnes AI API（统一服务层调用）
- 存储：localStorage（本地持久化）

## AI 服务层

所有 AI 能力通过 services/aiEngine.ts 统一调用，业务代码不直接调用大模型：

| 能力 | 方法 | 说明 |
|------|------|------|
| 学习路径 | generateLearningPath() | 输入目标，输出知识树 |
| 学习计划 | generateStudyPlan() | 输入路径和时间，输出每日日程 |
| AI 教学 | teachKnowledgePoint() | 主动教学流程（解释到举例到提问到评分） |
| 出题 | generateExercises() | 自动生成多选/填空/代码/案例题 |
| 评分 | gradeSubmission() | AI 自动评分加评语 |
| 每日总结 | generateDailySummary() | 自动生成学习报告和明日建议 |
| 文档生成 | generateKnowledgeDoc() | 生成 Markdown 结构化文档 |
| 流程图 | generateMermaidDiagram() | 生成 Mermaid 流程图 |

## 插件机制

预留了插件注册机制，未来可扩展不同学科、AI 模型或资源来源。

## AI 连接设置

应用内导航 **设置** 页可配置：

- API Base URL（OpenAI 兼容）
- API Key
- 获取模型列表 / 手动选择默认模型

优先级：本机设置（localStorage） > .env.local > 内置默认值。

## 环境变量

在项目根目录创建 .env.local 文件：

VITE_API_BASE_URL=https://apihub.agnes-ai.com/v1
VITE_API_KEY=your-api-key