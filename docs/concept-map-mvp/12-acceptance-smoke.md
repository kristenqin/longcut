---
id: concept-map-mvp-acceptance-smoke
type: task
module: concept-map-mvp
tags: [mvp, acceptance, smoke, bilibili, youtube]
---

# MVP Acceptance Smoke

## 目标

用一个命令验证 Concept Map MVP 主流程：

```txt
video URL
  -> metadata
  -> transcript
  -> Concept Map
  -> evidence timestamps
```

验收脚本：

```txt
scripts/mvp-smoke.mjs
```

## 本地闭环验收

没有真实 B 站 ASR key 时，可以跑：

```bash
npm run mvp:smoke:mock-bilibili
```

该命令会：

- 临时启动 Next dev server。
- 对 YouTube 测试 URL跑 metadata、transcript、Concept Map。
- 对 B 站测试 URL 跑 metadata、`playurl` audio、mock ASR transcript、Concept Map。
- 验证 Concept Map 返回 concepts，并且 transcript source 被保留。

mock ASR 只用于本地 smoke。它证明平台数据源、API、Concept Map 和 UI 数据形状能跑通，不代表真实视频内容。

## 真实 B 站验收

真实 B 站无字幕视频需要至少满足一个条件：

```txt
GEMINI_API_KEY=...
```

或：

```txt
BILIBILI_COOKIE=...
```

然后启动服务并执行：

```bash
npm run mvp:smoke -- --base=http://localhost:3000
```

如果 `BV1DQ7k6JE4P` 仍没有公开字幕且没有可用 ASR，脚本应失败，并在 `/api/transcript` 的响应中显示：

```txt
errorCode = ASR_PROVIDER_NOT_CONFIGURED
fallbackStatus = not_configured
```

这不是 Concept Map 失败，而是 transcript 获取阶段缺少真实来源。

## 可选参数

```bash
npm run mvp:smoke -- --skip-youtube
npm run mvp:smoke -- --skip-bilibili
npm run mvp:smoke -- --skip-concept-map
npm run mvp:smoke -- --bilibili-url=https://www.bilibili.com/video/BV...
npm run mvp:smoke -- --youtube-url=https://www.youtube.com/watch?v=...
```

## 验收通过标准

脚本输出：

```txt
MVP smoke result: PASSED
```

并包含：

- YouTube `transcript.segmentCount > 0`
- Bilibili `videoInfo.partId` 为目标 `cid`
- Bilibili `transcript.source` 为 `manual`、`auto` 或 `ai`
- Concept Map `analysisType = concept_map`
- Concept Map `conceptCount > 0`
- Concept Map evidence 能回到 transcript timestamp
