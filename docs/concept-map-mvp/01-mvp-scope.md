---
id: concept-map-mvp-scope
type: design
module: concept-map-mvp
tags: [mvp, scope, product]
---

# Concept Map MVP 范围

## 目标

把当前 LongCut 的 AI 主流程从「找高光片段」改造成「理解 transcript 的概念结构」。

本 MVP 必须在现有 LongCut 项目中演进，而不是新建一套并行系统。文档和实现都要能映射到当前代码：

- 当前视频输入和分析页面仍以 `app/page.tsx`、`app/analyze/[videoId]/page.tsx` 为基础。
- 当前 YouTube transcript、metadata、player 能力先被抽象和包裹，不应被直接重写掉。
- 当前 Supabase、认证、限流、缓存和 notes/favorites 等能力默认保留，除非某个阶段明确迁移。
- 当前 AI provider adapter 体系继续作为 AI 调用基础，但需要支持用户自配置模型。

MVP 输出应帮助用户回答：

1. 这个视频在讨论什么核心问题？
2. 这个问题背后的第一性原理是什么？
3. 关键概念有哪些？
4. 概念之间如何依赖、解释、对比或推导？
5. 点击概念或关系时，能跳回视频中对应的原文片段。

## 非目标

MVP 不追求以下能力：

- 自动剪辑 highlight reels。
- 按固定时间 chunk 展示「高价值片段」。
- 完整 AI Chat。
- 用户笔记、收藏、订阅、Top-up。
- 多语言翻译。
- Evidence Timeline 作为主视图。
- 直接下载视频源文件。
- 重新搭一个脱离 LongCut 的新项目。

这些能力可以保留为插件或后续模块。

## 用户体验优先级

第一优先级：

- 用户输入视频 URL。
- 系统获取视频元数据和 transcript。
- 用户可使用自己配置的 AI provider/model 运行分析。
- 系统生成 Concept Map。
- 用户点击概念节点或关系边，播放器跳转到对应片段。

第二优先级：

- 显示每个概念的证据片段列表。
- 显示概念出现次数、首次出现时间、最佳解释片段。
- 提供基础缓存，避免重复分析同一视频。

第三优先级：

- Evidence Timeline。
- Chat。
- Notes。
- 高光片段插件。
- 平台更多高级能力。

## MVP 成功标准

一个视频分析完成后，页面必须能展示：

- 一个可读的 Concept Map。
- 每个概念至少有名称、定义、角色和证据片段。
- 关键关系至少有关系类型、解释和证据片段。
- 点击概念或关系时，播放器能够 seek 到一个相关时间点。

如果视频没有可用 transcript，MVP 应清晰失败，而不是退化成无依据的概念猜测。
