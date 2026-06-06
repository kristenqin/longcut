---
id: concept-map-analysis-contract
type: schema
module: concept-map-mvp
tags: [concept-map, ai, contract]
---

# Concept Map AI 分析契约

## 目标

AI 分析器输入标准化 transcript，输出概念图和可跳转证据。

它不负责：

- 播放视频。
- 获取字幕。
- 保存数据库。
- 生成高光片段。

它只负责：

```txt
transcript + analysis model config -> concept map + evidence spans
```

AI 分析器必须通过项目统一 provider adapter 调用模型。它不能直接在分析函数里硬编码某个厂商、模型名或 API key。

## 输出结构

```ts
type ConceptMapAnalysis = {
  schemaVersion: "1.0";
  analysisType: "concept_map";
  videoRef: VideoRef;
  thesis: string;
  centralQuestion?: string;
  concepts: ConceptNode[];
  relations: ConceptRelation[];
  evidenceQuality: EvidenceQuality;
};

type ConceptNode = {
  id: string;
  name: string;
  definition: string;
  role:
    | "first_principle"
    | "core_concept"
    | "derived_concept"
    | "example"
    | "counterexample"
    | "method"
    | "conclusion";
  importance: number;
  evidenceSpans: EvidenceSpan[];
};

type ConceptRelation = {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  type:
    | "depends_on"
    | "causes"
    | "explains"
    | "supports"
    | "contrasts"
    | "leads_to"
    | "refines";
  explanation: string;
  evidenceSpans: EvidenceSpan[];
};

type EvidenceSpan = {
  start: number;
  end: number;
  transcriptSegmentIds: number[];
  quote?: string;
  reason: string;
  confidence: number;
};

type EvidenceQuality = {
  hasTranscript: boolean;
  coverageRatio?: number;
  warnings: string[];
};
```

## 处理策略

MVP 推荐两阶段处理。

### 第一阶段：概念抽象

从完整 transcript 或语义压缩后的 transcript 中识别：

- 中心问题。
- 第一性原理。
- 核心概念。
- 派生概念。
- 例子、反例、方法、结论。
- 概念之间的关系。

### 第二阶段：证据锚定

把概念和关系映射回原始 transcript。

锚定依据优先级：

1. AI 返回的原文 quote 能在 transcript 中匹配。
2. AI 返回的 timestamp 能映射到 transcript segment。
3. 语义相似匹配找到高置信片段。
4. 低置信结果保留 warning，不允许伪装成精确证据。

## 质量约束

- 每个 `core_concept` 至少应有一个 `evidenceSpan`。
- 每个 `relation` 至少应有一个 `evidenceSpan`，否则进入 `warnings`。
- `start` 和 `end` 必须是秒。
- `start < end`。
- `transcriptSegmentIds` 必须能在当前 transcript 中找到。
- 如果 transcript 覆盖率低，结果必须标注不确定。
- 分析结果应记录实际使用的 `provider`、`model` 和配置来源，方便后续审核输出差异。

## 前端渲染要求

Concept Map 是主视图。

节点点击：

```txt
node.evidenceSpans[0].start -> seekTo(start)
```

边点击：

```txt
relation.evidenceSpans[0].start -> seekTo(start)
```

Evidence Timeline 不是 MVP 主视图，只能作为统计器或辅助信息：

- 概念出现次数。
- 首次出现时间。
- 最佳解释片段。
