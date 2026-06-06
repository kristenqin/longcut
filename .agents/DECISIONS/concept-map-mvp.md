---
id: agents-decisions-concept-map-mvp
type: decision
module: concept-map-mvp
tags: [agent-decision, mvp]
---

# Concept Map MVP Decisions

## D1：Concept Map 是主视图

Decision:

- Concept Map 承担概念结构和推理过程展示。
- 不额外做专门的推理链视图。

Reason:

- 概念与概念之间的关系已经表达推理过程。
- 单独推理链会重复信息架构，增加 MVP 复杂度。

## D2：Evidence Timeline 降级

Decision:

- Evidence Timeline 可以作为统计器或辅助视图保留。
- 它不是 MVP 主流程。

Reason:

- 核心交互是从 Concept Map 回到视频对应位置。
- 时间线本身不产生主要理解价值。

## D3：旧高光片段能力插件化

Decision:

- `generateTopicsFromTranscript` 不再作为默认主分析。
- 旧能力保留为 `HighlightReelsPlugin`。

Reason:

- 不删除已有成果。
- 避免新 MVP 被旧产品模型牵制。

## D4：平台适配与 AI 分析解耦

Decision:

- YouTube/Bilibili 差异只存在于 `VideoPlatformAdapter`。
- AI 分析只消费标准 transcript。

Reason:

- 后续扩展平台时不应重写分析逻辑。
- B 站主要风险在 subtitle 获取和播放控制，不在概念分析本身。

## D5：无 transcript 不生成概念图

Decision:

- 如果平台无法提供可验证 transcript，MVP 不生成 Concept Map。

Reason:

- 概念图必须能回到证据片段。
- 没有 transcript 时，AI 结果无法定位，也不具备可审核性。

## D6：在 LongCut 内演进，不新建项目

Decision:

- Concept Map MVP 必须基于现有 LongCut 路由、API、provider adapter、Supabase 存储和播放器组件演进。
- 任何新能力都必须能映射到现有系统位置或明确声明新增边界。

Reason:

- 用户要的是当前项目的可复用主流程框架，不是一个脱离现有上下文的样板项目。
- 显式映射可以降低后续实现时的需求理解漂移。

## D7：用户自配置 AI 模型，DeepSeek 首适配

Decision:

- MVP 需要支持用户配置自己的 AI provider/model。
- DeepSeek 是第一目标 provider。
- Concept Map 分析器只通过统一 provider adapter 调用模型，不硬编码厂商。

Reason:

- 用户希望使用自己常用的模型。
- DeepSeek 的 OpenAI-compatible API 适合作为第一步，也能为后续 custom OpenAI-compatible provider 留接口。

## D8：非主流程功能采用软插件化隔离

Decision:

- MVP 先定义静态插件边界和依赖方向，不做动态插件平台。
- Highlight Reels、Summary、Chat、Notes、Translation、Top Quotes、Image、Export、Library 等作为 Feature Plugins。
- Platform Adapter、AI Provider Adapter、PlayerBridge、Storage、Auth、Security、Rate Limit 不作为插件。

Reason:

- 先隔离旧能力，避免影响 Concept Map 主流程开发。
- 保留旧功能和回归路径。
- 避免过早构建复杂插件系统，拖慢 MVP。
