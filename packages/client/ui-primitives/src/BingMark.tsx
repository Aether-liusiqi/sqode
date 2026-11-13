import type { ReactNode } from 'react'
import { BRAND_BG_PATH, BRAND_CARETS_PATH } from './brandMarkPath.ts'

/** Presentation of the master mark at any requested pixel size. */
export interface BingMarkProps {
  /** Rendered width and height in CSS pixels; the viewBox scales the master. */
  readonly size: number
  /** Optional host-authored class (hero surfaces style it for hover). */
  readonly className?: string
  /** Optional SMIL/CSS children appended inside the fill group. */
  readonly children?: ReactNode
}

/**
 * Render the brand mark at `size`.
 *
 * The icon has two layers (from 07_交付给集成方/icon.svg):
 *   1. Orange rounded-square S-frame (evenodd cutouts)
 *   2. White carets `<` `>` on top
 *
 * Light mode: orange bg + white carets.
 * Dark mode: both layers turn white (via CSS variables), making one solid white mark.
 * Theme switching uses CSS custom properties, no re-render needed.
 * @param props - size, optional class and optional in-group children.
 * @returns the scalable SVG mark.
 */
export function BingMark({ size, className, children }: BingMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      aria-hidden="true"
    >
      <path d={BRAND_BG_PATH} fill="var(--sq-brand-mark-fill, #ED6A39)" fillRule="evenodd" />
      <path d={BRAND_CARETS_PATH} fill="var(--sq-brand-carets-fill, #FFFFFF)" />
      {children}
    </svg>
  )
}
