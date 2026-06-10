import type { Config } from '../config/schema.js';
import type { RestRequest, GraphqlRequest } from '../spec/types.js';

export class HarError extends Error {}

/** A parsed step, with its response body retained for chaining detection. */
export interface ImportStep {
  name: string;
  rest?: RestRequest;
  graphql?: GraphqlRequest;
  capture?: Record<string, string>;
  /** Recorded response body (dropped before serializing the spec). */
  responseBody: unknown;
}

interface HarHeader {
  name: string;
  value: string;
}
interface HarEntry {
  startedDateTime?: string;
  request: {
    method: string;
    url: string;
    headers?: HarHeader[];
    postData?: { text?: string; mimeType?: string };
  };
  response?: {
    content?: { text?: string; mimeType?: string; encoding?: string };
  };
}

const STATIC_RE = /\.(js|mjs|css|png|jpe?g|gif|svg|ico|woff2?|ttf|map|html?|webp|avif)(\?|$)/i;

const STRIP_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent',
  'referer',
  'origin',
  'cookie',
  'pragma',
  'cache-control',
  'dnt',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-dest',
  'sec-fetch-user',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'upgrade-insecure-requests',
]);

function parseJsonMaybe(text: string | undefined, mime: string | undefined): unknown {
  if (text === undefined || text === '') return undefined;
  if (mime && !mime.includes('json')) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function filterHeaders(headers: HarHeader[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    const lower = h.name.toLowerCase();
    if (lower.startsWith(':')) continue; // HTTP/2 pseudo-headers
    if (STRIP_HEADERS.has(lower)) continue;
    out[h.name] = h.value;
  }
  return out;
}

/** Derive an operation name from a GraphQL query string. */
function operationNameFromQuery(query: string): string | undefined {
  const m = query.match(/\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/);
  return m?.[1];
}

/**
 * Classify a GraphQL operation. The operation keyword always precedes the first
 * selection-set `{`, so we only inspect the head — field/type names containing
 * "mutation" (inside the braces) won't false-positive. Shorthand `{ … }` is a query.
 */
export function graphqlOperationType(query: string): 'query' | 'mutation' | 'subscription' {
  const brace = query.indexOf('{');
  const head = brace === -1 ? query : query.slice(0, brace);
  if (/\bmutation\b/.test(head)) return 'mutation';
  if (/\bsubscription\b/.test(head)) return 'subscription';
  return 'query';
}

/** Whether a step only reads (GET/HEAD, or a GraphQL query) — never writes. */
export function isReadOnlyStep(step: ImportStep): boolean {
  if (step.rest) return step.rest.method === 'GET' || step.rest.method === 'HEAD';
  if (step.graphql) return graphqlOperationType(step.graphql.query) === 'query';
  return false;
}

function lastSegment(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : 'root';
}

/** Parse a HAR document into ordered API steps (filtering out noise). */
export function parseHar(har: unknown, config: Config): ImportStep[] {
  const entries = (har as { log?: { entries?: HarEntry[] } })?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new HarError('not a valid HAR file (missing log.entries)');
  }

  const baseOrigin = new URL(config.baseUrl).origin;
  const include = config.import.include;
  const exclude = config.import.exclude;

  const steps: ImportStep[] = [];
  const seen = new Set<string>();
  let gqlCounter = 0;
  let restCounter = 0;

  for (const entry of entries) {
    const { method, url } = entry.request;
    if (method === 'OPTIONS') continue;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.origin !== baseOrigin) continue;
    if (STATIC_RE.test(parsed.pathname)) continue;
    if (include.length && !include.some((s) => parsed.pathname.includes(s))) continue;
    if (exclude.some((s) => parsed.pathname.includes(s))) continue;

    const bodyText = entry.request.postData?.text;
    const dedupKey = `${method} ${url} ${bodyText ?? ''}`;
    if (seen.has(dedupKey)) continue; // drop poll/duplicate noise
    seen.add(dedupKey);

    const responseBody = parseJsonMaybe(
      entry.response?.content?.text,
      entry.response?.content?.mimeType,
    );

    if (parsed.pathname === config.graphql.path && method === 'POST') {
      const payload = parseJsonMaybe(bodyText, 'application/json') as
        | { query?: string; variables?: Record<string, unknown>; operationName?: string }
        | undefined;
      if (!payload?.query) continue;
      const opName = payload.operationName ?? operationNameFromQuery(payload.query);
      steps.push({
        name: opName ?? `graphql-${++gqlCounter}`,
        graphql: {
          query: payload.query,
          ...(opName ? { operationName: opName } : {}),
          ...(payload.variables ? { variables: payload.variables } : {}),
        },
        responseBody,
      });
      continue;
    }

    const query: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    const headers = filterHeaders(entry.request.headers);
    const body = parseJsonMaybe(bodyText, entry.request.postData?.mimeType ?? 'application/json');

    steps.push({
      name: `${method.toLowerCase()}-${lastSegment(parsed.pathname)}-${++restCounter}`,
      rest: {
        method: method as RestRequest['method'],
        path: parsed.pathname,
        ...(Object.keys(query).length ? { query } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(body !== undefined ? { body } : {}),
      },
      responseBody,
    });
  }

  return steps;
}
