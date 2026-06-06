---
id: concept-map-mvp-plugin-boundaries
type: design
module: concept-map-mvp
tags: [plugins, modularity, non-main-flow]
---

# 非主流程插件边界

## 原则

非主流程能力不直接删除。它们应被视为可复用插件，在需要时挂到主流程上。

插件化的目标是隔离产品能力，不是新建复杂插件平台。MVP 阶段采用软插件化：

- 先定义边界和依赖方向。
- 再登记插件清单。
- 最后按风险逐步移动代码。

主流程只负责：

```txt
URL -> Platform Adapter -> Transcript -> Analysis -> Storage -> Render
```

插件负责：

```txt
在已有 transcript、metadata、analysis result 之上提供增强能力。
```

## 建议插件清单

| 插件 | 当前能力 | MVP 状态 |
|---|---|---|
| HighlightReelsPlugin | 旧的 topics/highlights 生成 | 保留，但不作为主分析 |
| SummaryPlugin | 视频摘要 | 可选 |
| ChatPlugin | transcript-grounded chat | 可选 |
| NotesPlugin | 用户笔记 | 暂缓 |
| TranslationPlugin | transcript/topic 翻译 | 暂缓 |
| BillingPlugin | Stripe、额度、Top-up | 暂缓 |
| LibraryPlugin | my-videos、favorites | 暂缓 |
| ExportPlugin | transcript 导出 | 暂缓 |
| ImagePlugin | Gemini 图片生成 | 暂缓 |

## 不是插件的能力

以下能力属于 Core Pipeline 或 Core Infrastructure，不应先插件化：

| 能力 | 分类 | 原因 |
|---|---|---|
| `VideoPlatformAdapter` | Core Pipeline | 平台输入层，是主流程的一部分 |
| `AI Provider Adapter` | Core Infrastructure | 所有 AI 能力共享的调用基础 |
| `PlayerBridge` | Core Pipeline | Concept Map 回跳视频的关键闭环 |
| Storage | Core Pipeline | 主分析结果必须稳定保存和读取 |
| Auth / Security / Rate Limit | Core Infrastructure | 横切基础设施，不是可选分析插件 |

## 插件接口草案

```ts
type AnalysisPluginContext = {
  videoRef: VideoRef;
  metadata: VideoMetadata;
  transcript: TranscriptSegment[];
  analysis?: ConceptMapAnalysis;
};

type AnalysisPlugin<TOutput> = {
  id: string;
  label: string;
  requires: Array<"metadata" | "transcript" | "conceptMap">;
  run(context: AnalysisPluginContext): Promise<TOutput>;
};
```

更完整的隔离计划见 [11-plugin-isolation-plan.md](./11-plugin-isolation-plan.md)。

## 插件化后的好处

- 不删除已有代码，降低回滚成本。
- 主流程更轻，适合 MVP。
- 后续可以让用户选择分析模式。
- 平台适配只影响输入层，不影响插件层。

## MVP 必须避免的耦合

- Concept Map 分析不应该依赖用户登录。
- Platform Adapter 不应该知道 Chat、Notes、Billing。
- Player Bridge 不应该知道 AI 输出来自高光片段还是概念图。
- 存储表字段不应该继续使用 `youtube_id` 作为唯一平台标识。
- 插件不应该在主流程完成前阻塞 metadata、transcript、Concept Map 或播放器初始化。

## 当前 MVP 开关

MVP 采用静态 feature flag 隔离非主流程插件。默认都应为 `false`，主流程只保留视频、Transcript、Concept Map 和 evidence 回跳。

| Flag | 对应插件能力 |
| --- | --- |
| `NEXT_PUBLIC_ENABLE_HIGHLIGHT_REELS` | 旧高光片段、主题选择器 |
| `NEXT_PUBLIC_ENABLE_CHAT_PLUGIN` | Chat 面板、Explain selection |
| `NEXT_PUBLIC_ENABLE_NOTES_PLUGIN` | Notes 面板、Take Notes selection |
| `NEXT_PUBLIC_ENABLE_TRANSCRIPT_EXPORT` | Transcript export |
| `NEXT_PUBLIC_ENABLE_QUICK_PREVIEW` | Quick preview 自动生成 |
| `NEXT_PUBLIC_ENABLE_TAKEAWAYS_PLUGIN` | Takeaways 自动生成 |
