---
id: concept-map-mvp-index
type: overview
module: concept-map-mvp
tags: [mvp, concept-map, video-analysis]
---

# Concept Map MVP 文档索引

本文档集定义 LongCut 从「高光片段生成」改造为「基于 transcript 的概念图分析」的 MVP 范围。

MVP 的核心目标不是完整复刻当前系统，而是保留可复用的视频分析主流程框架：

```txt
Video URL
  -> Platform Adapter
  -> Metadata + Transcript
  -> Normalized Transcript
  -> Concept Map Analysis
  -> Analysis Storage
  -> Player + Concept Map UI
```

## 文档清单

| 文档 | 作用 |
|---|---|
| [01-mvp-scope.md](./01-mvp-scope.md) | 定义 MVP 做什么、不做什么 |
| [02-core-flow.md](./02-core-flow.md) | 定义视频数据获取、解析、处理、存储和展示主链路 |
| [03-plugin-boundaries.md](./03-plugin-boundaries.md) | 定义哪些现有能力先插件化，而不是删除 |
| [04-concept-map-analysis-contract.md](./04-concept-map-analysis-contract.md) | 定义 AI 概念图分析的数据结构和处理约束 |
| [05-platform-adapter-contract.md](./05-platform-adapter-contract.md) | 定义 YouTube/Bilibili 等平台适配器接口 |
| [06-bilibili-script-research.md](./06-bilibili-script-research.md) | 调研 B 站脚本/字幕获取方式和不匹配风险 |
| [07-implementation-plan.md](./07-implementation-plan.md) | 给出 MVP 分阶段落地计划 |
| [08-api-reference.md](./08-api-reference.md) | 汇总 MVP 主流程接口边界 |
| [09-longcut-system-mapping.md](./09-longcut-system-mapping.md) | 将 MVP 需求映射到现有 LongCut 系统 |
| [10-ai-model-configuration.md](./10-ai-model-configuration.md) | 定义用户自配置 AI 模型，DeepSeek 作为首个目标 |
| [11-plugin-isolation-plan.md](./11-plugin-isolation-plan.md) | 定义非主流程功能的软插件化隔离方案 |

## 当前结论

MVP 应该把旧的 `generateTopicsFromTranscript` 降级为可选插件，把新的主分析能力定义为 `generateConceptMapFromTranscript`。

前端主视图应是 Concept Map。Concept Map 节点和边本身承担推理链展示；Evidence Timeline 只作为可选统计或辅助定位能力，不进入 MVP 第一优先级。

本 MVP 是在现有 LongCut 项目中演进，不是新建项目。所有实现任务必须能映射回当前路由、API、provider adapter、Supabase 存储和播放器组件；如果需要替换旧能力，应先声明它的现有位置和迁移去向。

非主流程功能先做软插件化隔离：保留能力，但不让它们反向控制 Core Pipeline。MVP 不做动态插件市场、插件权限系统或运行时插件加载。
