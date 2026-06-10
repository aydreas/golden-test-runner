import type { Config } from '../config/schema.js';
import type { SpecStep, GoldenStep } from '../spec/types.js';
import { Context } from '../engine/context.js';
import { buildRestRequest, type SentRestRequest } from './rest.js';
import { buildGraphqlRequest, type SentGraphqlRequest } from './graphql.js';

export type SentRequest = SentRestRequest | SentGraphqlRequest;

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export class TransportError extends Error {}

type AnyStep = SpecStep | GoldenStep;

/** Build the concrete request to send for a step (interpolated against ctx). */
export function buildRequest(step: AnyStep, config: Config, ctx: Context): SentRequest {
  if (step.rest) return buildRestRequest(step.rest, config, ctx);
  if (step.graphql) return buildGraphqlRequest(step.graphql, config, ctx);
  throw new TransportError(`step "${step.name}" has neither rest nor graphql`);
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function parseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (text === '') return undefined;
  if (contentType.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/** Perform a prepared request and return the normalized response. */
export async function send(req: SentRequest, timeoutMs: number): Promise<TransportResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.bodyText,
      signal: controller.signal,
    });
    return { status: res.status, headers: headersToObject(res.headers), body: await parseBody(res) };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new TransportError(`request to ${req.url} timed out after ${timeoutMs}ms`);
    }
    throw new TransportError(`request to ${req.url} failed: ${String((err as Error).message)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Build + send a step's request in one call. */
export async function executeStep(
  step: AnyStep,
  config: Config,
  ctx: Context,
): Promise<{ request: SentRequest; response: TransportResponse }> {
  const request = buildRequest(step, config, ctx);
  const response = await send(request, config.defaults.timeoutMs);
  return { request, response };
}
