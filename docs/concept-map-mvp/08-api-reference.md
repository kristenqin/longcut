---
id: concept-map-mvp-api-reference
type: api
module: concept-map-mvp
tags: [api, adapter, concept-map, player]
---

# MVP API Reference

## 目标

本页只定义 Concept Map MVP 主流程需要稳定下来的接口边界。具体实现可以在后续阶段调整，但调用方向应保持不变：

```txt
Platform Adapter -> Transcript Normalizer -> AI Provider Resolver -> Concept Map Analyzer -> Storage -> Player Bridge
```

## VideoPlatformAdapter

```ts
type VideoPlatformAdapter = {
  platform: PlatformKey;
  canHandle(url: string): boolean;
  parseUrl(url: string): Promise<VideoRef>;
  fetchMetadata(ref: VideoRef): Promise<VideoMetadata>;
  fetchTranscript(ref: VideoRef, options?: TranscriptOptions): Promise<TranscriptResult>;
  getEmbedConfig(ref: VideoRef): PlayerEmbedConfig;
};
```

平台适配器只负责平台差异，不负责 AI 分析。

## VideoRef

```ts
type VideoRef = {
  platform: "youtube" | "bilibili";
  canonicalUrl: string;
  platformVideoId: string;
  platformPartId?: string | null;
};
```

B 站实现应把 `platformPartId` 设为目标分 P 的 `cid`。YouTube 可以保持为空。

## TranscriptResult

```ts
type TranscriptResult = {
  segments: TranscriptSegment[];
  language?: string;
  availableLanguages?: string[];
  source: "manual" | "auto" | "ai" | "unknown";
  quality?: TranscriptQuality;
  warnings: string[];
  raw?: unknown;
};
```

## TranscriptSegment

```ts
type TranscriptSegment = {
  id: string;
  text: string;
  start: number;
  duration: number;
  end: number;
};
```

所有平台进入 AI 分析前都应归一化成这个结构。

## ConceptMapAnalysis

```ts
type ConceptMapAnalysis = {
  schemaVersion: "1.0";
  analysisType: "concept_map";
  videoRef: VideoRef;
  transcriptRef: TranscriptRef;
  thesis?: string;
  centralQuestion?: string;
  modelRun: ModelRunMetadata;
  concepts: ConceptNode[];
  relations: ConceptRelation[];
  evidenceQuality: EvidenceQuality;
};
```

## ModelRunMetadata

```ts
type ModelRunMetadata = {
  provider: "deepseek" | "minimax" | "grok" | "gemini" | "custom-openai-compatible";
  model: string;
  configSource: "user" | "workspace_default" | "system_fallback";
  usedAt: string;
};
```

## ConceptNode

```ts
type ConceptNode = {
  id: string;
  label: string;
  role:
    | "first_principle"
    | "core_concept"
    | "derived_concept"
    | "example"
    | "counterexample"
    | "method"
    | "conclusion";
  definition: string;
  evidence: EvidenceSpan[];
  importance: number;
};
```

## ConceptRelation

```ts
type ConceptRelation = {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  relationType:
    | "depends_on"
    | "causes"
    | "explains"
    | "supports"
    | "contrasts"
    | "leads_to"
    | "refines";
  description: string;
  evidence: EvidenceSpan[];
  confidence: number;
};
```

## EvidenceSpan

```ts
type EvidenceSpan = {
  start: number;
  end: number;
  transcriptSegmentIds: string[];
  quote?: string;
  reason: string;
  confidence: number;
};
```

Concept Map 回跳视频时，优先使用 `EvidenceSpan.start`。

## Concept Map API

```txt
POST /api/concept-map
```

请求体：

```ts
type ConceptMapRequest = {
  videoId?: string;
  videoRef?: VideoRef;
  videoInfo?: Partial<VideoMetadata>;
  transcript: TranscriptSegment[];
  maxConcepts?: number;
};
```

当前实现要求登录用户。服务端优先解析 `user_ai_provider_settings`，并通过 `createUserConfiguredGenerateAI` 注入用户 DeepSeek 配置；没有用户配置时使用 workspace provider。

## PlayerBridge

```ts
type PlayerBridge = {
  platform: PlatformKey;
  load(ref: VideoRef, embed: PlayerEmbedConfig): Promise<void>;
  seekTo(seconds: number): void;
  getCurrentTime?(): number;
  destroy?(): void;
};
```

YouTube 可以继续使用 IFrame Player API。B 站 MVP 如果无法运行时 seek，可以通过重设 iframe `src` 并携带 `t=seconds` 实现最低可用回跳。

## UserAIModelSettings

```ts
type UserAIModelSettings = {
  userId: string;
  provider: "deepseek";
  model: string;
  encryptedApiKey: string;
  apiKeyLast4: string | null;
  apiBaseUrl: string | null;
  testedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

用户 API key 不能进入客户端响应。`GET /api/ai-settings` 只能返回：

```ts
type PublicUserAIModelSettings = {
  provider: "deepseek";
  model: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  apiBaseUrl: string | null;
  testedAt: string | null;
  updatedAt: string | null;
};
```

`PUT /api/ai-settings` 保存配置，`DELETE /api/ai-settings` 清除配置，`POST /api/ai-settings/test` 只返回成功、失败、provider、model 和错误摘要。
