import { z } from 'zod';

/** Matcher kinds applied at compare time (§6.1 — authoritative list). */
export const MatcherType = z.enum(['uuid', 'any', 'regex', 'number', 'iso-date']);
export type MatcherType = z.infer<typeof MatcherType>;

export const MatcherSchema = z
  .object({
    path: z.string(),
    type: MatcherType,
    /** Required when type === 'regex'. */
    pattern: z.string().optional(),
  })
  .refine((m) => m.type !== 'regex' || typeof m.pattern === 'string', {
    message: "matcher of type 'regex' requires a 'pattern'",
  });
export type Matcher = z.infer<typeof MatcherSchema>;

export const NormalizeSchema = z
  .object({
    ignorePaths: z.array(z.string()).default([]),
    matchers: z.array(MatcherSchema).default([]),
  })
  .default({ ignorePaths: [], matchers: [] });
export type NormalizeConfig = z.infer<typeof NormalizeSchema>;

export const ResetSchema = z
  .object({
    enabled: z.boolean().default(false),
    command: z.string().optional(),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().default(30000),
  })
  .default({ enabled: false, timeoutMs: 30000 });
export type ResetConfig = z.infer<typeof ResetSchema>;

export const DefaultsSchema = z
  .object({
    headers: z.record(z.string(), z.string()).default({}),
    timeoutMs: z.number().int().positive().default(10000),
  })
  .default({ headers: {}, timeoutMs: 10000 });
export type RequestDefaults = z.infer<typeof DefaultsSchema>;

export const GraphqlConfigSchema = z
  .object({
    path: z.string().default('/graphql'),
  })
  .default({ path: '/graphql' });
export type GraphqlConfig = z.infer<typeof GraphqlConfigSchema>;

export const PathsSchema = z
  .object({
    specs: z.string().default('tests/**/*.spec.yaml'),
    goldenDir: z.string().default('tests/__golden__'),
  })
  .default({ specs: 'tests/**/*.spec.yaml', goldenDir: 'tests/__golden__' });
export type PathsConfig = z.infer<typeof PathsSchema>;

export const ImportSchema = z
  .object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  })
  .default({ include: [], exclude: [] });
export type ImportConfig = z.infer<typeof ImportSchema>;

export const ConfigSchema = z.object({
  baseUrl: z.string().url(),
  graphql: GraphqlConfigSchema,
  reset: ResetSchema,
  defaults: DefaultsSchema,
  normalize: NormalizeSchema,
  paths: PathsSchema,
  import: ImportSchema,
});

/** Fully-resolved config (all defaults applied). */
export type Config = z.infer<typeof ConfigSchema>;

/** Raw config as authored — everything optional except baseUrl. */
export const ConfigInputSchema = ConfigSchema.partial().extend({
  baseUrl: z.string().url(),
});
export type ConfigInput = z.input<typeof ConfigSchema>;
