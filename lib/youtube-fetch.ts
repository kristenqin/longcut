import {
  fetch as undiciFetch,
  ProxyAgent,
  type Dispatcher,
} from 'undici';

type FetchInitWithDispatcher = RequestInit & {
  dispatcher?: Dispatcher;
};

let cachedProxyUrl: string | null = null;
let cachedProxyAgent: ProxyAgent | null = null;

function getProxyAgent(proxyUrl: string): ProxyAgent {
  if (cachedProxyUrl !== proxyUrl || !cachedProxyAgent) {
    cachedProxyUrl = proxyUrl;
    cachedProxyAgent = new ProxyAgent(proxyUrl);
  }

  return cachedProxyAgent;
}

export function getYouTubeProxyUrl(): string | undefined {
  const proxyUrl = process.env.YOUTUBE_PROXY_URL?.trim();
  return proxyUrl || undefined;
}

export function fetchYouTubeResource(
  input: string | URL | Request,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const proxyUrl = getYouTubeProxyUrl();

  if (!proxyUrl) {
    return fetchImpl(input, init);
  }

  const proxiedInit = {
    ...init,
    dispatcher: getProxyAgent(proxyUrl),
  } as FetchInitWithDispatcher;

  return undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    proxiedInit as Parameters<typeof undiciFetch>[1]
  ) as unknown as Promise<Response>;
}
