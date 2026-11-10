import { BingMark, BrandWordmark } from '@liusiqi-dev/sqh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@liusiqi-dev/sqh-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the Bing-form brand mark scaled from the 1024 master.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <BingMark size={size} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <BrandWordmark includeMark={false} />
}
