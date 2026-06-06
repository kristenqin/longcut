---
id: doc-pipeline-usage
type: guide
tags: [doc-pipeline, docs, workflow]
---

# Doc Pipeline Usage

## 目标

Doc Pipeline 用来扫描项目 Markdown 文档、校验链接和资源、生成 `dist-docs` 审核包，并输出 `.doc-pipeline/agent-report.json` 供 agent 判断文档缺口。

本项目的配置入口是 `doc-pipeline.config.ts`。

## 推荐命令

```bash
npx doc-pipeline scan
npx doc-pipeline check
npx doc-pipeline build
```

在当前本地工作区，也可以直接使用本地插件 CLI：

```bash
node /Users/qyx/Desktop/project/doc-pipeline/packages/cli/dist/index.js scan
node /Users/qyx/Desktop/project/doc-pipeline/packages/cli/dist/index.js check
node /Users/qyx/Desktop/project/doc-pipeline/packages/cli/dist/index.js build
```

## Git 约定

### 工作流

每次文档或代码改动前，先确认工作树状态：

```bash
git status --short --untracked-files=all
```

改动后至少执行：

```bash
git status --short --untracked-files=all
git diff --stat
git diff -- <changed-files>
```

注意：

- 未跟踪文件不会出现在普通 `git diff` 中，需要用 `git status --short --untracked-files=all` 核对。
- 如果某个新增文档没有出现在 status 中，优先检查 `.gitignore`：

```bash
git check-ignore -v <path>
```

- 不要使用 `git reset --hard`、`git checkout -- <file>` 等会丢失用户改动的命令，除非用户明确要求。
- 如果工作树里有与当前任务无关的改动，只记录它们的存在，不要回滚。
- 如果需要提交，先确认本次要纳入的文件范围，再 stage。文档源文件和生成物要分清。

### 提交范围

应提交：

- `doc-pipeline.config.ts`
- `.doc-pipeline/overrides.json`
- 源文档，例如 `docs/concept-map-mvp/**`
- agent 工作文档，例如 `.agents/SPECS/**`、`.agents/TODOS/**`、`.agents/DECISIONS/**`

不应提交：

- `dist-docs/**`
- `.doc-pipeline/report.json`
- `.doc-pipeline/agent-report.json`
- `.doc-pipeline/tmp/**`

这些输出都可以通过 `doc-pipeline build` 重新生成。

## Frontmatter 约束

frontmatter 不是每篇文档都强制需要，但只要写了字段，就必须满足 Doc Pipeline schema。

支持字段：

```yaml
---
id: doc-pipeline-usage
type: guide
module: documentation
tags: [doc-pipeline, docs]
summary: Optional short summary.
order: 10
---
```

只有需要参与模块级文档完整性检查的业务模块才建议写 `module`。普通使用说明、临时调研或跨模块说明可以省略 `module`，避免触发无意义的 missing API 提示。

硬约束：

- `id` 只能使用小写字母、数字和短横线，且不能以短横线开头或结尾。
- `type` 只能是 `overview`、`guide`、`api`、`design`、`decision`、`schema`、`changelog`、`task`、`note`。
- `title` 如果写在 frontmatter 中，必须是非空字符串；否则需要有一级标题或可从文件名推断。
- `route` 如果写在 frontmatter 中，必须以 `/` 开头。
- `module` 和 `summary` 如果写入，必须是非空字符串。
- `tags` 应是字符串数组；单个字符串会被强制转换并产生 warning。
- `order` 如果写入，必须是有限数字。

常见映射：

| 语义 | 推荐 type |
|---|---|
| 目录 / 总览 | `overview` |
| 使用说明 / 操作流程 | `guide` |
| 接口参考 | `api` |
| 架构 / 方案设计 | `design` |
| 决策记录 | `decision` |
| 数据结构 / 契约 | `schema` |
| 待办 / 实施计划 | `task` |
| 调研 / 备忘 | `note` |

## 文档身份约束

Doc Pipeline 把 `id` 和 `route` 当成文档身份的一部分：

- 重复 `id` 会报错。
- 重复 `route` 会报错。
- README 默认会推断为 `id = overview` 和 `route = /`。
- 普通文档默认根据路径生成 `id`，根据 `id` 生成 `route`。

重要文档应显式写稳定 `id`，避免移动文件后身份漂移。

## 链接约束

内部 Markdown 链接应使用相对文件路径：

```md
[Platform Adapter](./concept-map-mvp/05-platform-adapter-contract.md)
```

行为：

- `http://`、`https://`、`mailto:` 会被视为外链。
- `#heading` 会被视为页内锚点。
- 只有 `.md` 文件链接会被解析和重写。
- 默认模式下，断开的内部链接是 warning。
- `--strict` 模式下，断开的内部链接会升级为 error。

## 资源约束

默认允许复制的本地资源类型：

```txt
.png .jpg .jpeg .svg .webp .gif .pdf
```

行为：

- 外部资源不会复制。
- 资源路径不能逃出项目根目录。
- symlink 资源默认不会复制，除非配置 `security.followSymlinks = true`。
- 超过 10MB 的资源会产生 warning。
- 超过 50MB 的资源不会复制；在 `--strict` 模式下会变成 error。

## Agent Report 约束

`.doc-pipeline/agent-report.json` 会额外给 agent 使用：

- `suggestedTasks`：可自动修复或需要确认的文档问题。
- `missingDocs`：按 `module` 检查是否缺 API 文档。
- `manualReview`：需要人类确认的项目。

如果某个 `module` 有文档但没有 `type: api` 的页面，报告会建议补 API 文档。本项目的 `concept-map-mvp` 已补充 `docs/concept-map-mvp/08-api-reference.md`。

## Overrides 约束

`.doc-pipeline/overrides.json` 用来在不改源文档时修正文档元数据。当前项目保持空对象：

```json
{}
```

如果 frontmatter 和 overrides 写了同一个字段但值不同，Doc Pipeline 会产生 conflict warning。默认优先把 frontmatter 当成源头。
