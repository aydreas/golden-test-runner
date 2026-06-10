/**
 * The per-scenario variable context. Captured values are bound here and read
 * back during interpolation of later steps. A fresh context is created for each
 * scenario so scenarios stay isolated.
 */
export class Context {
  private readonly vars = new Map<string, unknown>();

  bind(name: string, value: unknown): void {
    this.vars.set(name, value);
  }

  has(name: string): boolean {
    return this.vars.has(name);
  }

  get(name: string): unknown {
    return this.vars.get(name);
  }

  /** A plain-object copy of all bindings (for reporting/debugging). */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.vars);
  }
}
