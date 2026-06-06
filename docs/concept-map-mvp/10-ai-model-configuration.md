---
id: ai-model-configuration
type: design
module: concept-map-mvp
tags: [ai-provider, deepseek, model-config, user-settings]
---

# AI Model Configuration

## 目标

用户应能配置自己常用的 AI provider 和模型，用自己的 key 运行 Concept Map 分析。

DeepSeek 是 MVP 第一适配目标，但设计不能只服务 DeepSeek。原因是 DeepSeek 使用 OpenAI-compatible API，后续可以复用同一抽象支持其他兼容服务。

## 当前 LongCut 状态

当前系统已有 provider adapter：

| 当前 provider | 当前 key | 当前位置 |
|---|---|---|
| MiniMax | `MINIMAX_API_KEY` | `lib/ai-providers/minimax-adapter.ts` |
| Grok | `XAI_API_KEY` | `lib/ai-providers/grok-adapter.ts` |
| Gemini | `GEMINI_API_KEY` | `lib/ai-providers/gemini-adapter.ts` |

当前选择逻辑主要来自环境变量：

```txt
AI_PROVIDER
NEXT_PUBLIC_AI_PROVIDER
AI_DEFAULT_MODEL
AI_FAST_MODEL
AI_PRO_MODEL
```

MVP 需要新增用户级配置。环境变量仍可作为 workspace 默认值和 fallback，但不应是唯一方式。

## DeepSeek 基线

官方 DeepSeek API 文档显示：

| 项 | 值 |
|---|---|
| OpenAI-compatible base URL | `https://api.deepseek.com` |
| Anthropic-compatible base URL | `https://api.deepseek.com/anthropic` |
| 当前模型 | `deepseek-v4-flash`、`deepseek-v4-pro` |
| 旧模型兼容名 | `deepseek-chat`、`deepseek-reasoner` |

注意：`deepseek-chat` 和 `deepseek-reasoner` 官方标注会在 2026-07-24 15:59 UTC 后退役。MVP 不应把它们作为新默认值。

来源：

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/quick_start/pricing

## 用户配置模型

```ts
type UserAIModelSettings = {
  userId: string;
  provider: "deepseek";
  baseUrl?: string;
  model: string;
  encryptedApiKey: string;
  apiKeyLast4: string;
  testedAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

MVP DeepSeek 默认建议：

```txt
provider = deepseek
baseUrl = https://api.deepseek.com
model = deepseek-v4-flash
```

用户可手动切到 `deepseek-v4-pro`。

## 配置解析顺序

Concept Map 分析调用模型时，按以下顺序解析：

1. 当前登录用户启用的 `UserAIModelSettings`。
2. workspace 环境变量配置，例如 `AI_PROVIDER=deepseek`、`DEEPSEEK_API_KEY`。
3. 当前已有 provider fallback。

返回的分析结果必须记录实际使用的 provider/model：

```ts
type ModelRunMetadata = {
  provider: string;
  model: string;
  configSource: "user" | "workspace_default" | "system_fallback";
  usedAt: string;
};
```

## 安全约束

- 用户 API key 只能在服务端保存和使用。
- 客户端不能拿到原始 API key。
- 日志不能打印 API key、Authorization header 或完整 provider config。
- 数据库不能明文保存 API key；至少需要加密或使用 secret reference。
- 删除用户配置时，应删除或失效对应 secret。
- 连接测试接口只返回成功、失败、provider、model 和错误摘要。

## 当前实现锚点

MVP 的 DeepSeek 用户配置已经落到以下位置：

| 能力 | 文件 |
|---|---|
| 数据库表 | `supabase/migrations/20260607120000_user_ai_provider_settings.sql` |
| 加密、脱敏、解析、连接测试 | `lib/user-ai-settings.ts` |
| DeepSeek 显式凭证 adapter | `lib/ai-providers/deepseek-adapter.ts` |
| 保存/读取/删除 API | `app/api/ai-settings/route.ts` |
| 连接测试 API | `app/api/ai-settings/test/route.ts` |
| 设置页入口 | `app/settings/page.tsx`、`app/settings/settings-form.tsx` |

客户端响应只能包含：

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

`encrypted_api_key` 只能由服务端读取、解密和使用。推荐配置 `AI_SETTINGS_ENCRYPTION_KEY` 作为稳定的服务端加密 secret。

## UI 要求

MVP 可以先做一个简单设置入口：

```txt
Settings
  -> AI Model
  -> Provider: DeepSeek
  -> API Key
  -> Base URL
  -> Model
  -> Test Connection
  -> Save
```

分析页不需要让用户每次选择模型。默认使用用户保存的配置；如果没有配置，则使用 workspace 默认 provider。

## Adapter 改造

新增：

```txt
lib/ai-providers/deepseek-adapter.ts
```

接入点：

- `ProviderKey` 增加 `deepseek`。
- `providerFactories` 增加 `createDeepSeekAdapter`。
- `providerEnvGuards` 增加 `DEEPSEEK_API_KEY`。
- `PROVIDER_DEFAULT_MODELS.deepseek = deepseek-v4-flash`。
- `normalizeProviderKey` 支持 `deepseek`。

DeepSeek adapter 可以复用 MiniMax adapter 的 OpenAI-compatible 调用方式：

```txt
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json
```

## 和 Concept Map 的关系

Concept Map 分析器不直接关心 DeepSeek。它只接收：

```txt
ProviderAdapter.generate(prompt, schema, model options)
```

这样后续换成其他模型时，不需要改 Concept Map schema、evidence anchoring 或 UI。

## Bilibili ASR 与 Concept Map AI 的边界

DeepSeek 是 Concept Map 文本分析的首要 provider。B 站无字幕视频的 ASR fallback 不是 Concept Map 分析，它只负责把音频转成 timestamped transcript。

当前 ASR MVP 使用 Gemini，因为项目已经有 `@google/generative-ai` 依赖：

```txt
GEMINI_API_KEY=...
BILIBILI_ENABLE_ASR_FALLBACK=true
BILIBILI_ASR_PROVIDER=gemini
BILIBILI_ASR_MODEL=gemini-2.5-flash-lite
```

流程边界：

```txt
Bilibili audio -> Gemini ASR -> TranscriptSegment[]
TranscriptSegment[] -> user configured provider, e.g. DeepSeek -> ConceptMapAnalysis
```

如果用户只配置 DeepSeek 而没有配置 Gemini，YouTube 和有原生字幕的 B 站视频仍可进行 Concept Map 分析；无原生字幕的 B 站视频会停在 transcript 获取阶段，并返回 no-credits 错误。
