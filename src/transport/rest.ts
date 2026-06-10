import type { Config } from '../config/schema.js';
import type { RestRequest } from '../spec/types.js';
import { Context } from '../engine/context.js';
import { interpolateDeep } from '../engine/interpolate.js';

export interface SentRestRequest {
  kind: 'rest';
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Structured body (interpolated) — for reporting. */
  body?: unknown;
  /** Serialized body actually sent. */
  bodyText?: string;
}

/** Interpolate and assemble a REST request to send. */
export function buildRestRequest(rest: RestRequest, config: Config, ctx: Context): SentRestRequest {
  const interpolated = interpolateDeep(rest, ctx);

  const url = new URL(interpolated.path, config.baseUrl);
  for (const [k, v] of Object.entries(interpolated.query ?? {})) {
    url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {
    ...interpolateDeep(config.defaults.headers, ctx),
    ...(interpolated.headers ?? {}),
  };

  let bodyText: string | undefined;
  if (interpolated.body !== undefined) {
    if (typeof interpolated.body === 'string') {
      bodyText = interpolated.body;
    } else {
      bodyText = JSON.stringify(interpolated.body);
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json';
    }
  }

  return {
    kind: 'rest',
    method: interpolated.method,
    url: url.toString(),
    headers,
    body: interpolated.body,
    bodyText,
  };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());
}
