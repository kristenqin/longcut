---
id: bilibili-script-research
type: note
module: concept-map-mvp
tags: [bilibili, transcript, subtitles, platform-adapter]
---

# B 站脚本 / 字幕调研

## 结论摘要

B 站 MVP 不建议直接抓视频流做音频转写。更稳妥的路径是：

```txt
Bilibili URL
  -> 解析 bvid / aid / page
  -> 通过 view / pagelist 选定 cid
  -> 调 player info 获取 subtitle list
  -> 选择 subtitle_url
  -> 下载字幕 JSON
  -> 转成 TranscriptSegment[]
```

如果没有字幕，MVP 应明确提示「该视频没有可用 transcript」，不做无依据概念图。

核心判断：

- `bvid` / `aid` 是稿件级标识。
- `cid` 是分 P / 实际视频内容级标识。
- 字幕跟随 `cid`，不是只跟随 `bvid`。
- 缓存 transcript 时不能只用视频 URL 或 `bvid`，必须至少绑定 `platform + bvid/aid + cid + page + subtitle_id + language + source_kind`。

## 播放能力

B 站提供站外播放器：

```txt
https://player.bilibili.com/player.html
```

站外播放器支持 `bvid`，也支持 `t` 参数用于初始跳转秒数。官方说明中 `t` 是「跳转到媒体的初始时间点，单位：秒」。

来源：

- https://player.bilibili.com/

MVP 可先用 iframe 嵌入播放。如果后续需要运行时反复 seek，需要验证 iframe 是否有可用 postMessage/API；如果不可控，最低可用方案是切换 iframe `src` 并带 `t=seconds`，但体验不如 YouTube Player API。

## bvid、aid、cid、page

B 站视频至少有三类 ID：

| 字段 | 含义 |
|---|---|
| bvid | BV 号，投稿级标识 |
| aid | av 号，旧投稿级标识 |
| cid | 分 P / 视频内容标识 |

一个 bvid 可能有多个分 P，每个分 P 对应不同 cid。获取字幕和播放目标时必须选定 cid。

推荐元数据链路：

```txt
GET https://api.bilibili.com/x/web-interface/view?bvid=BV...
GET https://api.bilibili.com/x/player/pagelist?bvid=BV...
```

`view` 可作为主元数据入口，返回 `bvid`、`aid`、`cid`、`pages[]`、`duration`、`title`、`owner`、`subtitle` 等信息。`pagelist` 可作为分 P 校验和补充入口，返回每一 P 的 `cid`、`page`、`part`、`duration`、`dimension`、`first_frame` 等。

选择规则：

- URL 有 `?p=N`：必须选择 `pages[N - 1].cid`。
- URL 无 `p`：MVP 默认选择第 1P。
- 如果 `view.data.cid` 和目标 `page` 不一致，应以目标 page 对应的 `cid` 为准。
- 多 P 全量分析不是 MVP 默认行为，应由后续 `partPolicy = current | all | selectedPages` 控制。

来源：

- https://socialsisteryi.github.io/bilibili-API-collect/docs/video/info.html
- https://blog.u2sb.com/2020/03230.bilibili-bvid.html

## 字幕接口

播放器信息接口：

```txt
https://api.bilibili.com/x/player/wbi/v2
https://api.bilibili.com/x/player/v2
```

该接口需要：

```txt
aid 或 bvid
cid
```

返回数据包含 `subtitle` 字段。文档说明该字段是字幕信息，未登录时可能为空，并有 `need_login_subtitle` 标记。

来源：

- https://sessionhu.github.io/bilibili-API-collect/docs/video/player.html

字幕列表常见字段：

```ts
type BilibiliSubtitleItem = {
  id: number;
  lan: string;
  lan_doc: string;
  subtitle_url: string;
  subtitle_url_v2?: string;
  type?: number;
  ai_type?: number;
  ai_status?: number;
};
```

yt-dlp 的 Bilibili extractor 也会从 `data.subtitle.subtitles[].subtitle_url` 下载 JSON，再把 `body[].from/to/content` 转成字幕格式；当 `need_login_subtitle` 为真时，会提示需要登录。

来源：

- https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py

字幕 JSON 的核心结构通常是：

```ts
type BilibiliSubtitleJson = {
  body: Array<{
    from: number;
    to: number;
    content: string;
  }>;
};
```

第三方 Rust crate 文档也将 B 站 JSON 字幕建模为 `body: Vec<JsonSubtitleBody>`，其中每项包含 `from`、`to`、`content`。

来源：

- https://docs.rs/bilibili-extractor/latest/bilibili_extractor_lib/subtitle/struct.JsonSubtitle.html

注意点：

- `subtitle_url` 常是协议相对 URL，例如 `//aisubtitle.hdslb.com/...`，请求前需要补 `https:`。
- `subtitle_url` 可能带有 `auth_key`，不应长期缓存 URL 本身，只缓存字幕内容和来源元数据。
- `x/player/wbi/v2` 属于 WBI 风控体系，必要时要实现 `w_rid`、`wts` 签名。
- 未登录时字幕列表可能为空，或者 `need_login_subtitle = true`。
- 字幕来源可能是人工字幕、AI 字幕、翻译字幕，字段中可能出现 `ai_type`、`ai_status`、`type`、`is_lock`。

WBI 签名来源：

- https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/wbi.html

## 不匹配风险

用户提到的「部分视频和 Script 不匹配」是 B 站适配的关键风险。MVP 需要显式处理。

常见原因：

1. **分 P 错配**
   - bvid 是投稿级，cid 是分 P 级。
   - 如果拿 1P 的 cid，却播放 2P，字幕会整体不匹配。
   - 典型错误是解析了 `p=2`，但仍用 `view.data.cid` 作为字幕 cid。

2. **字幕语言或版本错选**
   - 同一视频可能有多个字幕语言。
   - 可能存在人工字幕、AI 字幕、翻译字幕。
   - 默认选错语言会导致概念分析偏离用户观看内容。

3. **AI 字幕质量问题**
   - AI 字幕可能漏句、错字、分段异常。
   - 概念定位会被错误文本带偏。

4. **字幕与视频发布时间不同步**
   - 字幕可能被后续编辑。
   - CDN 或缓存可能返回旧字幕。

5. **硬字幕不可提取**
   - 视频画面内烧录字幕不等于平台 subtitle track。
   - 这种情况下接口可能没有 transcript。

6. **权限和登录状态差异**
   - 文档显示 subtitle 可能未登录为空，视频流和部分能力也有 Cookie / WBI / 风控要求。
   - 服务端抓取和浏览器播放看到的数据可能不一致。

7. **合集 / 番剧 / 影视跳转**
   - `view` 可能返回 `redirect_url`。
   - 普通 UGC、PGC / Bangumi、影视内容的元数据和字幕链路不完全一样。

8. **互动视频或分支内容**
   - 互动视频可能存在多个剧情节点和 cid。
   - MVP 不应按普通单 cid 视频处理。

## MVP 检测策略

### 1. 分 P 校验

存储和播放都必须绑定 cid。

```txt
analysis.platform_part_id = cid
player.src includes cid/page
transcript.raw.cid = cid
```

如果 cid 不一致，禁止复用缓存。

请求后应交叉验证：

```txt
player.data.bvid == view.data.bvid
player.data.aid == view.data.aid
player.data.cid == selectedPage.cid
selectedPage.page == requestedPage
```

### 2. 时长覆盖校验

字幕最后一段时间应接近视频时长。

```ts
coverageRatio = transcriptEnd / metadata.duration
```

建议：

- `coverageRatio >= 0.8`：可分析。
- `0.5 <= coverageRatio < 0.8`：可分析，但显示 warning。
- `< 0.5`：不建议生成 Concept Map。

### 3. 片段密度校验

如果字幕段过少、持续时间异常长、文本过短，需要 warning。

```txt
segmentCount
averageDuration
textLength
emptySegmentRatio
```

### 4. 语言选择校验

优先级：

1. 用户指定语言。
2. 人工字幕。
3. 中文 AI 字幕。
4. 其他可用字幕。

必须把实际使用语言写入分析结果。

### 5. 证据定位置信度

Concept Map 的每个 evidence span 需要 `confidence`。如果字幕质量差，前端应展示不确定提示。

### 6. 缓存键

B 站 transcript 缓存键建议：

```txt
platform:bilibili
bvid
aid
cid
page
subtitle_id 或 id_str
language
source_kind
```

不要缓存长期使用的 `subtitle_url`。如果需要调试，可记录 `subtitle_url_host`，例如 `aisubtitle.hdslb.com`。

## BilibiliAdapter MVP 草案

```ts
const BilibiliAdapter: VideoPlatformAdapter = {
  platform: "bilibili",
  canHandle(url) {
    return /bilibili\.com\/video\/(BV|av)/.test(url);
  },
  async parseUrl(url) {
    // extract bvid, aid, page
  },
  async fetchMetadata(ref) {
    // fetch view info and pagelist, select cid
  },
  async fetchTranscript(ref, options) {
    // fetch player v2 / wbi v2, select subtitle_url, parse JSON body
  },
  getEmbedConfig(ref) {
    // player.bilibili.com/player.html?bvid=...&cid=...&p=...
  }
};
```

当前代码已实现 `lib/platform/bilibili-adapter.ts`，覆盖：

- `bilibili.com/video/BV...` 和 `av...` URL 解析。
- `?p=N` 分 P 选择，并以目标 page 的 `cid` 作为 `platform_part_id`。
- `x/web-interface/view` 元数据获取。
- `x/player/v2` 字幕列表获取。
- `subtitle_url` / `subtitle_url_v2` JSON 字幕下载。
- `body[].from/to/content` 到 normalized transcript 的转换。
- B 站 iframe embed config。

当前未实现 WBI 签名、登录 Cookie、PGC/Bangumi、互动视频和多 P 批量分析。遇到需要登录或没有字幕的情况，adapter 返回空 transcript 和 warning，不生成无依据 Concept Map。

更完整的适配动作拆分：

```txt
parseUrl(url) -> PlatformVideoRef
fetchMetadata(ref) -> VideoMetadata
selectParts(metadata, policy) -> VideoPart[]
fetchSubtitleTracks(part) -> SubtitleTrack[]
fetchTranscript(track) -> Transcript
```

MVP 默认策略：

- 只分析 URL 指定分 P。
- URL 未指定 `p` 时默认分析第 1P。
- 优先使用 B 站原生字幕。
- 没有字幕时返回 `transcript_status = no_native_subtitle`，由上层决定是否提示用户或后续接 ASR。
- 登录态作为可选能力，不作为 MVP 强依赖。
- PGC / Bangumi、互动视频、会员 / 充电限制内容暂不承诺覆盖。

建议保留的 transcript 质量字段：

```ts
type TranscriptQuality = {
  segmentCount: number;
  durationCoverage: number;
  isMonotonic: boolean;
  warnings: string[];
};
```

## 需要后续验证的问题

- B 站 iframe 是否支持运行时 postMessage seek。
- 未登录服务端能否稳定获取目标视频的 subtitle list。
- `x/player/wbi/v2` 是否必须实现 WBI 签名。
- `subtitle_url_v2` 与 `subtitle_url` 的差异。
- AI 字幕 `ai_status` 各状态值含义。
