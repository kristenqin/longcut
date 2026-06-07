#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const DEFAULT_YOUTUBE_URL = 'https://www.youtube.com/watch?v=pjJqOgFyCxI';
const DEFAULT_BILIBILI_URL =
  'https://www.bilibili.com/video/BV1DQ7k6JE4P/?spm_id_from=333.1007.tianma.2-3-6.click';

const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

function getArg(name) {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const shouldStartServer = hasFlag('--start-server');
const shouldUseMockBilibiliAsr = hasFlag('--mock-bilibili-asr');
const skipYoutube = hasFlag('--skip-youtube');
const skipBilibili = hasFlag('--skip-bilibili');
const skipConceptMap = hasFlag('--skip-concept-map');
const port = getArg('--port') ?? '3011';
const baseUrl =
  getArg('--base') ??
  (shouldStartServer ? `http://localhost:${port}` : 'http://localhost:3000');
const youtubeUrl = getArg('--youtube-url') ?? DEFAULT_YOUTUBE_URL;
const bilibiliUrl = getArg('--bilibili-url') ?? DEFAULT_BILIBILI_URL;

let devServer = null;

function printUsage() {
  console.log(`MVP smoke test

Usage:
  npm run mvp:smoke -- --base=http://localhost:3000
  npm run mvp:smoke:mock-bilibili

Options:
  --start-server             Start a temporary Next dev server.
  --port=3011                Port for --start-server.
  --base=http://localhost    Existing server base URL.
  --mock-bilibili-asr        Start server with local Bilibili mock ASR.
  --skip-youtube             Skip YouTube smoke.
  --skip-bilibili            Skip Bilibili smoke.
  --skip-concept-map         Only verify metadata/transcript APIs.
  --youtube-url=URL          Override YouTube test URL.
  --bilibili-url=URL         Override Bilibili test URL.
`);
}

if (hasFlag('--help')) {
  printUsage();
  process.exit(0);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

function summarizeErrorBody(body) {
  if (!body || typeof body !== 'object') {
    return String(body);
  }

  return JSON.stringify(
    {
      error: body.error,
      errorCode: body.errorCode,
      fallbackStatus: body.fallbackStatus,
      details: body.details,
      warnings: body.warnings,
      noCreditsUsed: body.noCreditsUsed,
    },
    null,
    2
  );
}

async function request(path, body) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = safeJsonParse(text);

  return {
    status: response.status,
    ok: response.ok,
    body: parsed,
  };
}

function assertOk(step, response) {
  if (!response.ok) {
    throw new Error(`${step} failed (${response.status}): ${summarizeErrorBody(response.body)}`);
  }

  return response.body;
}

function assertNonEmptyArray(step, value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${step} did not return a non-empty array.`);
  }
}

function describeVideoInfo(videoInfo) {
  return {
    platform: videoInfo.platform,
    videoId: videoInfo.videoId,
    partId: videoInfo.videoRef?.platformPartId ?? videoInfo.platformPartId ?? null,
    title: videoInfo.title,
    duration: videoInfo.duration,
  };
}

function describeTranscript(transcriptResponse) {
  return {
    platform: transcriptResponse.platform,
    source: transcriptResponse.source,
    language: transcriptResponse.language,
    segmentCount: transcriptResponse.segmentCount,
    rawSegmentCount: transcriptResponse.rawSegmentCount,
    warnings: transcriptResponse.warnings ?? [],
    firstStart: transcriptResponse.transcript?.[0]?.start,
  };
}

function describeConceptMap(analysis) {
  return {
    analysisType: analysis.analysisType,
    transcriptSource: analysis.transcriptRef?.source,
    conceptCount: analysis.concepts?.length ?? 0,
    relationCount: analysis.relations?.length ?? 0,
    provider: analysis.modelRun?.provider,
    model: analysis.modelRun?.model,
    firstConcept: analysis.concepts?.[0]
      ? {
          label: analysis.concepts[0].label,
          evidenceStart: analysis.concepts[0].evidence?.[0]?.start,
        }
      : null,
  };
}

async function runPlatformSmoke(label, url) {
  console.log(`\n[${label}] video-info`);
  const videoInfo = assertOk(
    `${label} /api/video-info`,
    await request('/api/video-info', { url })
  );

  console.log(`[${label}] transcript`);
  const transcriptResponse = assertOk(
    `${label} /api/transcript`,
    await request('/api/transcript', { url })
  );
  assertNonEmptyArray(`${label} transcript`, transcriptResponse.transcript);

  let conceptMap = null;
  if (!skipConceptMap) {
    console.log(`[${label}] concept-map`);
    const conceptMapResponse = assertOk(
      `${label} /api/concept-map`,
      await request('/api/concept-map', {
        videoRef: transcriptResponse.videoRef,
        videoInfo: transcriptResponse.videoInfo ?? videoInfo,
        transcript: transcriptResponse.transcript,
        transcriptMeta: {
          source: transcriptResponse.source,
          language: transcriptResponse.language,
          availableLanguages: transcriptResponse.availableLanguages,
        },
        maxConcepts: 6,
      })
    );

    const analysis = conceptMapResponse.analysis;
    if (!analysis || analysis.analysisType !== 'concept_map') {
      throw new Error(`${label} did not return a Concept Map analysis.`);
    }
    assertNonEmptyArray(`${label} concepts`, analysis.concepts);
    conceptMap = describeConceptMap(analysis);
  }

  return {
    videoInfo: describeVideoInfo(videoInfo),
    transcript: describeTranscript(transcriptResponse),
    conceptMap,
  };
}

async function waitForServer(timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Server did not become ready at ${baseUrl}. ${
      lastError instanceof Error ? lastError.message : ''
    }`
  );
}

async function startDevServer() {
  const env = {
    ...process.env,
    PORT: port,
  };

  if (shouldUseMockBilibiliAsr) {
    env.BILIBILI_ASR_PROVIDER = 'mock';
    env.BILIBILI_ENABLE_MOCK_ASR = 'true';
  }

  devServer = spawn('npm', ['run', 'dev', '--', '--port', port], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  devServer.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (/Ready|Compiled|Local:/i.test(text)) {
      process.stdout.write(text.replace(/^/gm, '[dev] '));
    }
  });
  devServer.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (/error|failed|EADDRINUSE/i.test(text)) {
      process.stderr.write(text.replace(/^/gm, '[dev] '));
    }
  });

  devServer.on('exit', (code, signal) => {
    if (code !== null && code !== 0 && !signal) {
      console.error(`[dev] exited with code ${code}`);
    }
  });

  await waitForServer();
}

async function stopDevServer() {
  if (!devServer || devServer.killed) {
    return;
  }

  devServer.kill('SIGINT');
  const timeout = setTimeout(() => {
    if (devServer && !devServer.killed) {
      devServer.kill('SIGKILL');
    }
  }, 5_000);
  await once(devServer, 'exit').catch(() => {});
  clearTimeout(timeout);
}

async function main() {
  if (shouldUseMockBilibiliAsr && !shouldStartServer) {
    console.warn(
      '--mock-bilibili-asr only affects a server started by this script. Existing servers keep their own environment.'
    );
  }

  console.log(`MVP smoke test against ${baseUrl}`);
  if (shouldStartServer) {
    console.log(
      `Starting temporary dev server on port ${port}${
        shouldUseMockBilibiliAsr ? ' with mock Bilibili ASR' : ''
      }...`
    );
    await startDevServer();
  } else {
    await waitForServer(10_000);
  }

  const results = {};
  if (!skipYoutube) {
    results.youtube = await runPlatformSmoke('YouTube', youtubeUrl);
  }
  if (!skipBilibili) {
    results.bilibili = await runPlatformSmoke('Bilibili', bilibiliUrl);
  }

  console.log('\nMVP smoke result: PASSED');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((error) => {
    console.error('\nMVP smoke result: FAILED');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopDevServer();
  });
