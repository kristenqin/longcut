---
id: plugin-isolation-plan
type: design
module: concept-map-mvp
tags: [plugins, isolation, migration, soft-plugin]
---

# Plugin Isolation Plan

## 目标

在实现 Concept Map MVP 前，先把 LongCut 的非主流程功能隔开，降低后续开发时的牵连面。

本计划不是要删除旧能力，也不是要做完整插件平台。它的目标是建立软插件边界：

```txt
Core Pipeline owns the flow.
Plugins consume the flow outputs.
Plugins do not control the flow.
```

## 分层定义

### Core Pipeline

Core Pipeline 是 Concept Map MVP 必须完成的主链路：

```txt
URL
  -> PlatformAdapter
  -> Metadata
  -> Transcript
  -> TranscriptNormalizer
  -> AIProviderResolver
  -> ConceptMapAnalyzer
  -> Storage
  -> PlayerBridge
  -> ConceptMap UI
```

这些模块不能作为插件：

- platform detection
- metadata fetching
- transcript fetching
- transcript normalization
- AI provider resolution
- Concept Map analysis
- evidence anchoring
- analysis storage
- player seek bridge

### Core Infrastructure

Core Infrastructure 是主流程和插件都可以使用的基础设施：

- Supabase client
- Auth
- CSRF
- security middleware
- rate limit
- audit logging
- provider registry
- shared validation schemas

它们也不是插件。插件只能调用这些能力，不能拥有这些能力。

### Feature Plugins

Feature Plugins 是主流程完成后挂载的功能：

| Plugin | Current LongCut Area | Dependency |
|---|---|---|
| `HighlightReelsPlugin` | topics、themes、candidate pool | metadata + transcript |
| `SummaryPlugin` | summary tab / summary API | metadata + transcript |
| `ChatPlugin` | transcript-grounded chat | transcript + optional conceptMap |
| `NotesPlugin` | notes panel / selection notes | transcript + currentUser |
| `TranslationPlugin` | transcript/topic translation | transcript |
| `TopQuotesPlugin` | quote extraction | transcript |
| `ImagePlugin` | Gemini image generation | transcript + metadata |
| `ExportPlugin` | transcript export | transcript |
| `LibraryPlugin` | my videos / favorites | storage + currentUser |

## 依赖方向

允许：

```txt
Plugin -> Core Pipeline outputs
Plugin -> Core Infrastructure
UI Shell -> Plugin registry
```

禁止：

```txt
Core Pipeline -> Feature Plugin
PlatformAdapter -> Plugin
ConceptMapAnalyzer -> Plugin
PlayerBridge -> Plugin
Storage schema -> Plugin-specific required fields
```

如果主流程需要等待某个插件结果，说明边界错了。

## 插件上下文

MVP 可以先用静态 TypeScript 注册，不需要运行时动态加载。

```ts
type PluginContext = {
  videoRef: VideoRef;
  metadata: VideoMetadata;
  transcript?: TranscriptSegment[];
  conceptMap?: ConceptMapAnalysis;
  playerBridge?: PlayerBridge;
  currentUser?: CurrentUser;
};
```

插件声明自己需要什么：

```ts
type PluginRequirement =
  | "metadata"
  | "transcript"
  | "conceptMap"
  | "player"
  | "currentUser";

type AnalysisPlugin = {
  id: string;
  label: string;
  requires: PluginRequirement[];
  enabledByDefault: boolean;
};
```

主流程只负责产出 context，不负责理解每个插件的业务。

## 迁移顺序

### Step 1：登记插件清单

先创建静态清单，不移动业务代码：

```txt
plugins/registry.ts
```

登记：

- id
- label
- requires
- existing files
- MVP status

### Step 2：隔离 Highlight Reels

优先隔离旧主流程：

- `generateTopicsFromTranscript`
- `generateThemesFromTranscript`
- topic candidate pool
- theme selector
- highlight cards

目标：

```txt
Concept Map becomes default analysis.
Highlight Reels becomes optional plugin.
```

### Step 3：隔离右侧辅助功能

将 Summary、Chat、Transcript、Notes 看作分析页 shell 中的 panels。

注意：Transcript viewer 比较特殊。它既是主流程调试和证据定位工具，也是可展示 panel。MVP 不删除它，但它不能决定分析流程。

### Step 4：隔离工具类能力

Translation、Top Quotes、Image、Export 进入插件清单。它们只消费 transcript 或 conceptMap，不影响主分析完成。

### Step 5：再考虑代码移动

只有当静态边界稳定后，才移动目录：

```txt
plugins/highlight-reels/
plugins/summary/
plugins/chat/
plugins/notes/
plugins/translation/
plugins/image/
plugins/export/
```

MVP 不需要插件市场、插件权限系统、远程插件加载或动态 import。

## 页面组合方式

分析页应逐步变成 shell：

```txt
AnalyzePage
  -> CorePipelineState
  -> PlayerRegion
  -> ConceptMapRegion
  -> PluginPanels
```

`PluginPanels` 只读取 `PluginContext`。

## 验收标准

完成软插件化隔离后：

- 主流程可以在不运行 Highlight Reels 的情况下生成 Concept Map。
- Summary/Chat/Notes/Image 等失败时，不影响 metadata、transcript、Concept Map 和播放器初始化。
- 平台适配器不知道任何插件存在。
- Concept Map analyzer 不导入任何插件模块。
- 插件只通过 `PluginContext` 读取主流程产物。
- YouTube 旧分析路径可以通过 `HighlightReelsPlugin` 回归。

## 风险

- 过早移动文件会造成大量 import churn。
- 过早抽象 runtime plugin system 会拖慢 MVP。
- 如果把 Auth/Billing 当插件，会误伤现有权限和限流逻辑。
- 如果 Transcript Viewer 被完全插件化，会削弱 evidence 定位调试能力。

因此本计划只做软隔离，等 Concept Map 主链路稳定后再做目录级整理。
