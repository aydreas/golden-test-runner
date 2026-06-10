import type { Config } from '../config/schema.js';
import type { GraphqlRequest } from '../spec/types.js';
import { Context } from '../engine/context.js';
import { interpolateDeep } from '../engine/interpolate.js';

export interface SentGraphqlRequest {
  kind: 'graphql';
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  operationName?: string;
  query: string;
  variables?: Record<string, unknown>;
  /** Structured body (interpolated) — for reporting. */
  body: { query: string; variables?: Record<string, unknown>; operationName?: string };
  bodyText: string;
}

/** Interpolate and assemble a GraphQL POST request to send. */
export function buildGraphqlRequest(
  gql: GraphqlRequest,
  config: Config,
  ctx: Context,
): SentGraphqlRequest {
  const interpolated = interpolateDeep(gql, ctx);

  const url = new URL(config.graphql.path, config.baseUrl).toString();
  const headers: Record<string, string> = {
    ...interpolateDeep(config.defaults.headers, ctx),
    'Content-Type': 'application/json',
  };

  const body = {
    query: interpolated.query,
    ...(interpolated.variables !== undefined ? { variables: interpolated.variables } : {}),
    ...(interpolated.operationName !== undefined ? { operationName: interpolated.operationName } : {}),
  };

  return {
    kind: 'graphql',
    method: 'POST',
    url,
    headers,
    operationName: interpolated.operationName,
    query: interpolated.query,
    variables: interpolated.variables,
    body,
    bodyText: JSON.stringify(body),
  };
}
