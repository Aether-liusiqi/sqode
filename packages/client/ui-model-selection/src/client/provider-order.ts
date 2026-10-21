/** Shared provider display order for the composer and command model pickers. */

/**
 * Preserve the catalog order of provider groups.
 *
 * No provider is pulled forward: the order the catalog declares is the order
 * the pickers show, so the list cannot silently prefer one vendor and the
 * default selection follows the catalog rather than a hardcoded route.
 * @param groups - Provider groups in catalog order.
 * @returns a copy in the same order; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  return [...groups]
}
