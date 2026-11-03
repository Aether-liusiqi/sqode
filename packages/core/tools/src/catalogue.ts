/**
 * The contract a tool catalogue publishes, so a request can offer a subset.
 *
 * A session declares only part of the catalog (see `@liusiqi-dev/dsh-llm`'s
 * selector). That only works if something can answer three questions on demand:
 * what exists, what each one is for in a sentence, and what the full schema of a
 * named tool is. This is that seam, declared here so the tooling layer owns the
 * shape while the extension owns the data.
 *
 * @module @liusiqi-dev/dsh-tools/catalogue
 */

import type { ToolSchema } from '@liusiqi-dev/dsh-llm'

/** One catalog row: a name and the sentence that introduces it. */
export interface ToolCatalogueEntry {
  /** Tool name, as declared on the wire. */
  readonly name: string
  /** One-line purpose, bounded by the caller's display budget. */
  readonly purpose: string
}

/** Read-only view a request uses to decide what to declare. */
export interface ToolCatalogue {
  /**
   * Every tool the route could offer.
   * @returns the full catalog, in declaration order.
   */
  list(): readonly ToolSchema[]

  /**
   * The catalog as names and one-line purposes, for a listing that must stay small.
   * @returns one entry per tool.
   */
  describe(): readonly ToolCatalogueEntry[]

  /**
   * Resolve one tool's full schema by name.
   * @param name - the tool name the model asked for.
   * @returns the schema, or `undefined` when no such tool exists.
   */
  resolve(name: string): ToolSchema | undefined
}
