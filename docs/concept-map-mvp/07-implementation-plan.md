---
id: concept-map-mvp-implementation-plan
type: task
module: concept-map-mvp
tags: [implementation, plan, mvp]
---

# MVP 实施计划

## Phase 0：文档和边界冻结

目标：

- 明确 Concept Map 是主分析结果。
- 明确 Evidence Timeline 不是 MVP 主视图。
- 明确旧高光片段能力插件化。
- 明确平台适配器契约。

产物：

- `docs/concept-map-mvp/*`
- `.agents/SPECS/concept-map-mvp.md`
- `.agents/TODOS/concept-map-mvp.md`
- `.agents/DECISIONS/concept-map-mvp.md`

## Phase 1：平台中立数据模型

改造：

- 新增 `VideoRef`、`VideoMetadata`、`TranscriptResult`。
- 将存储键从 `youtube_id` 迁移到 `(platform, platform_video_id, platform_part_id)`。
- 将当前 YouTube 逻辑包成 `YouTubeAdapter`。
- 建立软插件边界，先隔离非主流程功能的依赖方向。

暂缓：

- B 站完整实现。
- 订阅和用户库迁移。
- 动态插件加载系统。

## Phase 2：用户自配置 AI Provider

新增：

- `UserAIModelSettings` 数据结构。
- DeepSeek provider adapter。
- 用户 AI key 的服务端安全存储。
- provider/model 连接测试接口。
- workspace 默认 provider fallback。

要求：

- Concept Map 分析调用统一 provider adapter。
- 分析器不能直接读取具体厂商环境变量。
- DeepSeek 默认模型使用 `deepseek-v4-flash`，可切换 `deepseek-v4-pro`。

## Phase 3：Concept Map Analysis Engine

新增：

- `generateConceptMapFromTranscript`
- `ConceptMapAnalysis` schema
- evidence span validator
- transcript-to-evidence mapper

替换：

- 主流程默认不再调用 `generateTopicsFromTranscript`。
- `generateTopicsFromTranscript` 移入 `HighlightReelsPlugin`。

## Phase 4：Concept Map UI

新增：

- Concept Map 主视图。
- 节点详情面板。
- 关系详情面板。
- 点击节点/关系跳转视频。

暂缓：

- Evidence Timeline。
- Chat。
- Notes。
- Translation。

## Phase 5：Bilibili Adapter MVP

新增：

- B 站 URL 解析。
- bvid/aid/cid/page 解析。
- B 站 metadata 获取。
- B 站 subtitle JSON 获取和标准化。
- B 站 iframe 播放。

必须验证：

- 分 P cid 一致性。
- transcript coverage。
- 字幕语言选择。
- iframe seek 能力。

## Phase 6：缓存和回归

新增：

- Concept Map analysis cache。
- 平台复合键查询。
- YouTube 旧缓存兼容策略。

回归：

- YouTube 输入仍可分析。
- Concept Map 点击可 seek。
- 无 transcript 时清晰失败。
