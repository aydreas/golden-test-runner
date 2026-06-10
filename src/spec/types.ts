import { z } from 'zod';
import { MatcherSchema } from '../config/schema.js';

/**
 * Sentinels embedded in golden files.
 *  - PLACEHOLDER  `{{name}}`   — consistency wildcard (first occurrence binds, later must equal).
 *  - IGNORE       `<<ignore>>` — field skipped entirely during compare.
 */
export const IGNORE_SENTINEL = '<<ignore>>';
export const PLACEHOLDER_RE = /^\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}$/;
/** Matches a `{{name}}` anywhere inside a larger string (for interpolation). */
export const PLACEHOLDER_GLOBAL_RE = /\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/g;

export const AUTO_PREFIX = '__auto_';

/** A capture maps a placeholder name → JSONPath into that step's response body. */
export const CaptureSchema = z.record(z.string(), z.string());
export type Capture = z.infer<typeof CaptureSchema>;

export const RestRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  path: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});
export type RestRequest = z.infer<typeof RestRequestSchema>;

export const GraphqlRequestSchema = z.object({
  query: z.string(),
  operationName: z.string().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});
export type GraphqlRequest = z.infer<typeof GraphqlRequestSchema>;

/** A recorded response, present only in golden files. */
export const RecordedResponseSchema = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});
export type RecordedResponse = z.infer<typeof RecordedResponseSchema>;

/** A step is EITHER graphql XOR rest (validated below). */
const StepBase = {
  name: z.string(),
  capture: CaptureSchema.optional(),
};

export const SpecStepSchema = z
  .object({
    ...StepBase,
    rest: RestRequestSchema.optional(),
    graphql: GraphqlRequestSchema.optional(),
  })
  .refine((s) => (s.rest ? !s.graphql : !!s.graphql), {
    message: "a step must have exactly one of 'rest' or 'graphql'",
  });
export type SpecStep = z.infer<typeof SpecStepSchema>;

export const GoldenStepSchema = z
  .object({
    ...StepBase,
    rest: RestRequestSchema.optional(),
    graphql: GraphqlRequestSchema.optional(),
    response: RecordedResponseSchema,
  })
  .refine((s) => (s.rest ? !s.graphql : !!s.graphql), {
    message: "a step must have exactly one of 'rest' or 'graphql'",
  });
export type GoldenStep = z.infer<typeof GoldenStepSchema>;

export const ScenarioConfigSchema = z.object({
  reset: z.boolean().optional(),
});
export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;

export const SpecSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  config: ScenarioConfigSchema.optional(),
  ignores: z.array(z.string()).optional(),
  matchers: z.array(MatcherSchema).optional(),
  steps: z.array(SpecStepSchema).min(1),
});
export type Spec = z.infer<typeof SpecSchema>;

export const GoldenSchema = z.object({
  name: z.string(),
  specHash: z.string().optional(),
  generatedAt: z.string().optional(),
  config: ScenarioConfigSchema.optional(),
  ignores: z.array(z.string()).optional(),
  matchers: z.array(MatcherSchema).optional(),
  steps: z.array(GoldenStepSchema).min(1),
});
export type Golden = z.infer<typeof GoldenSchema>;
