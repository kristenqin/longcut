---
id: concept-map-visual-rendering-generation-ux
type: design
module: concept-map-mvp
tags: [concept-map, visualization, react-flow, generation-ux]
---

# Concept Map Visual Rendering and Generation UX

## 背景

当前 Concept Map 的数据质量已经可用，但前端只是把概念和关系以卡片列表渲染出来，用户很难一眼看出概念之间的结构。生成过程也是一次性等待完整 JSON，用户只能看到 spinner 和秒数，体感像卡住。

## 本轮目标

- 把 Concept Map 渲染成真正的节点和边。
- 保留从概念 / evidence 回跳视频的核心闭环。
- 在生成期间展示阶段式 loading，降低黑盒等待感。
- 不改动 Concept Map API schema、不改动 transcript 和平台 adapter。

## 渲染方案

采用：

```txt
@xyflow/react + @dagrejs/dagre
```

映射关系：

| Concept Map 数据 | 图谱渲染 |
|---|---|
| `concepts[]` | node |
| `relations[]` | directed edge |
| `concept.role` | node visual variant |
| `concept.importance` | node emphasis |
| `relation.relationType` | edge label / style |
| `relation.confidence` | edge opacity |
| `evidence.start` | click-to-video seek |

## 交互结构

```txt
ConceptMapPanel
  -> header + model metadata
  -> staged loading
  -> central question / thesis
  -> ConceptGraphCanvas
  -> selected concept inspector
```

点击节点：

1. 选中概念。
2. 如果有 evidence timestamp，调用 `onSeek(evidence.start)`。
3. Inspector 展示定义、证据和相关关系。

点击 evidence：

1. 直接跳转到对应视频时间。

## 生成体验

本轮不做真实 streaming。先做阶段式 loading：

```txt
Reading transcript
Extracting concepts
Linking relations
Anchoring evidence
Preparing graph
```

这些阶段是前端体验提示，不代表服务端真实事件。后续如果做 streaming 或 two-phase generation，可以替换为真实进度。

## 暂缓项

- 模型 partial JSON streaming。
- 两阶段生成：先 concepts 后 relations/evidence。
- Concept Map 持久化缓存。
- 大图聚类、搜索、mini-map。

## 验收

- Concept Map 有节点边图谱，不再只是卡片列表。
- 选中概念可以回跳视频。
- Inspector 能解释选中概念和关系。
- Loading 不再只有 spinner。
- YouTube / Bilibili 主流程不受影响。
