---
id: concept-map-mvp-core-flow
type: design
module: concept-map-mvp
tags: [core-flow, architecture, transcript]
---

# 核心实现链路

## 主流程

```txt
1. 输入 URL
2. 识别平台
3. 解析平台视频引用
4. 获取视频元数据
5. 获取 transcript/script
6. 标准化 transcript
7. 解析当前用户的 AI provider/model 配置
8. 运行 Concept Map AI 分析
9. 将概念和关系映射回 transcript 时间片段
10. 存储分析结果
11. 渲染播放器、Concept Map、证据片段
12. 用户点击概念或关系，播放器跳转到对应时间
```

## 当前项目中的对应位置

| 当前能力 | 当前文件 | MVP 去向 |
|---|---|---|
| YouTube URL 解析 | `lib/utils.ts` | 改造成 platform detector |
| 视频信息获取 | `app/api/video-info/route.ts`、`lib/video-info-provider.ts` | 移入 platform adapter |
| transcript 获取 | `app/api/transcript/route.ts`、`lib/youtube-transcript-provider.ts` | 移入 platform adapter |
| transcript 标准化 | `lib/topic-utils.ts` | 保留并泛化 |
| AI provider 路由 | `lib/ai-client.ts`、`lib/ai-providers/*` | 增加用户自配置 provider/model，首个目标是 DeepSeek |
| AI 高光分析 | `lib/ai-processing.ts` | 插件化，新增 concept map analyzer |
| 结果保存 | `lib/video-save-utils.ts`、Supabase RPC | 改成平台无关 storage |
| 播放控制 | `components/youtube-player.tsx` | 抽象为 player bridge |
| 字幕点击跳转 | `components/transcript-viewer.tsx` | 保留为通用时间戳交互 |

## 标准数据流

MVP 的核心数据结构应平台无关。

```ts
type VideoRef = {
  platform: "youtube" | "bilibili";
  platformVideoId: string;
  canonicalUrl: string;
  partId?: string;
  raw?: Record<string, unknown>;
};

type VideoMetadata = {
  title: string;
  author?: string;
  thumbnail?: string;
  duration?: number;
  description?: string;
  platform: string;
  platformVideoId: string;
};

type TranscriptSegment = {
  text: string;
  start: number;
  duration: number;
  source?: "manual" | "auto" | "ai" | "unknown";
  language?: string;
  confidence?: number;
};
```

## 为什么不按时间 chunk 作为产品模型

按时间 chunk 可以作为成本控制手段，但不应该成为产品的最终组织方式。

原因：

- 用户真正需要的是概念结构，不是时间片段列表。
- 概念可能在视频多个位置反复出现。
- 一个概念的定义、例子、反例、结论可能分散在不同时间。
- 固定时间 chunk 容易切断论证结构。

因此，MVP 可以在内部做语义压缩或分段处理，但最终输出必须回到 Concept Map。

## 核心交互闭环

```txt
Concept Node / Relation
  -> evidenceSpans[0].start
  -> PlayerBridge.seekTo(start)
  -> transcript viewer highlight corresponding segments
```

该闭环比 Evidence Timeline 更核心。
