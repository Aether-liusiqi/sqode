/**
 * How much of a request's window tool declarations may claim.
 *
 * Everything outside the core set is loaded on demand and costs nothing until it
 * is. Without a cap a session that keeps calling `tool_search` grows the declared
 * catalog without bound: one reached 116 declarations and 287,132 characters,
 * about 71.8K of a 100K window, leaving too little for the conversation and no
 * room for a summarization to finish.
 *
 * Five percent is the product rule. On a 100K route that is 5,000 tokens; the 13
 * core tools already spend about 3,025, leaving roughly two medium schemas. The
 * largest tool in the catalog (155,695 characters) can never be declared there,
 * which is a physical boundary rather than a defect.
 *
 * Lives here rather than in the loop or the tool package because both price the
 * same budget: the loop decides what to declare, and `tool_search` reports what it
 * just spent. Two copies of this number would drift.
 *
 * @module @liusiqi-dev/sqh-tools/declaration
 */

/** Share of a window the declared tool catalog may claim. */
export const DECLARATION_BUDGET_SHARE = 0.05

/** Characters one token carries when pricing a schema. */
export const SCHEMA_CHARS_PER_TOKEN = 4

/**
 * Characters of schema a route can declare.
 * @param contextWindow - the routed model's window, in tokens.
 * @returns the declaration budget in characters.
 */
export function declarationBudgetChars(contextWindow: number): number {
  return Math.floor(contextWindow * DECLARATION_BUDGET_SHARE * SCHEMA_CHARS_PER_TOKEN)
}
