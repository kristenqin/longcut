import { defineDocPipelineConfig } from "doc-pipeline"

export default defineDocPipelineConfig({
  include: [
    "README.md",
    "docs/**/*.md",
    ".agents/SPECS/**/*.md",
    ".agents/TODOS/**/*.md",
    ".agents/DECISIONS/**/*.md"
  ],
  exclude: [
    "node_modules/**",
    ".git/**",
    ".env",
    ".env.*",
    "dist/**",
    "build/**",
    "coverage/**",
    "docs/draft/**"
  ],
  output: "dist-docs",
  nav: {
    mode: "auto",
    strategy: "source-aware"
  }
})
