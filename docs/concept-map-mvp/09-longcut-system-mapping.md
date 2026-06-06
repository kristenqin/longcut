---
id: longcut-system-mapping
type: design
module: concept-map-mvp
tags: [longcut, mapping, architecture, drift-control]
---

# LongCut System Mapping

## 目标

本 MVP 是在现有 LongCut 项目里演进，不是新开项目。所有后续实现都必须能回答：

```txt
这个新能力映射到当前系统的哪个文件、API、数据结构或 UI 区域？
```

如果不能回答，就说明需求理解可能已经漂移，需要先更新文档再继续写代码。

## 当前 LongCut 基线

当前系统是一个 YouTube-first 的学习工作台：

```txt
URL input
  -> /analyze/[videoId]
  -> video metadata
  -> transcript
  -> highlight topics / summary / chat / notes
  -> YouTube player + right-column tabs
  -> Supabase cache
```

关键基线：

| 当前能力 | 当前位置 | 当前职责 |
|---|---|---|
| URL 输入 | `components/url-input.tsx`、`app/page.tsx` | 接收 YouTube URL 并进入分析页 |
| 分析页 | `app/analyze/[videoId]/page.tsx` | 编排 metadata、transcript、AI 分析、缓存和播放 |
| YouTube ID 解析 | `lib/utils.ts` | 从 URL 提取 YouTube videoId |
| 视频元数据 | `app/api/video-info/route.ts`、`lib/video-info-provider.ts` | 基于 YouTube oEmbed 获取标题、作者、封面等 |
| transcript 获取 | `app/api/transcript/route.ts`、`lib/youtube-transcript-provider.ts` | 优先 YouTube direct，必要时 fallback |
| AI provider | `lib/ai-client.ts`、`lib/ai-providers/*` | 通过 MiniMax、Grok、Gemini adapter 调用模型 |
| 高光主题生成 | `lib/ai-processing.ts`、`app/api/video-analysis/route.ts` | 生成 topics、themes、candidate pool |
| 时间戳匹配 | `lib/topic-utils.ts`、`lib/quote-matcher.ts` | 将文本结果映射回 transcript segment |
| 播放器 | `components/youtube-player.tsx` | YouTube IFrame API、seek、segment playback |
| transcript UI | `components/transcript-viewer.tsx` | 展示 transcript，点击 timestamp 跳转 |
| 存储 | `lib/video-save-utils.ts`、`video_analyses` | 以 `youtube_id` 为核心键保存 transcript/topics/summary |
| 公开页 | `app/v/[slug]/page.tsx` | 基于 `youtube_id` 和 slug 展示已保存分析 |

## MVP 目标映射

| MVP 能力 | 当前系统锚点 | 改造方式 |
|---|---|---|
| 平台识别 | `lib/utils.ts` | 从 `extractVideoId` 扩展为 platform detector，保留 YouTube 解析 |
| 平台元数据 | `/api/video-info`、`lib/video-info-provider.ts` | 包成 `YouTubeAdapter.fetchMetadata`，新增 `BilibiliAdapter.fetchMetadata` |
| transcript 获取 | `/api/transcript`、`lib/youtube-transcript-provider.ts` | 包成 `fetchTranscript`，统一输出 `TranscriptResult` |
| transcript 标准化 | `TranscriptSegment`、`topic-utils` | 增加 `id/end/source/language/quality`，兼容旧字段 |
| AI 模型选择 | `lib/ai-providers/*`、`lib/user-ai-settings.ts`、`app/api/ai-settings/route.ts` | 增加用户自配置 provider/model，DeepSeek 首适配 |
| Concept Map 分析 | `lib/concept-map/*`、`app/api/concept-map/route.ts` | 新增 `generateConceptMapFromTranscript`，旧 topics 逻辑插件化 |
| 证据锚定 | `quote-matcher`、`topic-utils` | 复用文本匹配和 segment 映射，输出 `EvidenceSpan` |
| 存储键 | `video_analyses.youtube_id` | 迁移为 `(platform, platform_video_id, platform_part_id)` |
| 播放控制 | `components/youtube-player.tsx` | 抽 `PlayerBridge`，YouTube 实现为首个 bridge |
| 主视图 | `app/analyze/[videoId]/page.tsx`、`components/concept-map-panel.tsx` | 主视图增加 Concept Map，旧 highlight cards 保留为插件入口 |
| 非主流程 | Chat、Notes、Translation、Image | 保留为插件或延后模块，不默认删除 |

## 不允许隐式改变的东西

除非新文档或任务明确说明，否则默认不改变：

- Supabase Auth。
- 现有限流和匿名用户限制。
- notes/favorites/link-video 这类用户数据能力。
- Gemini 图片生成的独立路径。
- 现有 YouTube 视频可分析能力。
- 公开分享页和 slug 的基本可访问性。

## 迁移策略

MVP 实现优先采用包裹和兼容，而不是一次性推倒：

1. 先把当前 YouTube 能力包成 `YouTubeAdapter`。
2. 再把数据结构升级为平台中立。
3. 再把 `generateTopicsFromTranscript` 移到插件边界。
4. 再接入 `generateConceptMapFromTranscript`。
5. 最后添加 `BilibiliAdapter` 和 B 站播放器 bridge。

任何阶段都要保持 YouTube 旧路径可回归。

## 漂移检查

每个实现任务开始前，先回答：

- 这一步对应哪个文档章节？
- 这一步改动现有系统哪个文件或接口？
- 是否影响 YouTube 现有主流程？
- 是否把本应插件化的功能误删了？
- 是否绕开了统一 AI provider adapter？
- 是否把平台差异泄漏进 Concept Map 分析器？
- 是否仍能从 Concept Map evidence 回跳视频？

如果答案不清楚，应暂停实现并补文档。
