import type { ReactNode } from 'react'
import { BRAND_MASTER_PATH } from './brandMarkPath.ts'

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
 * Render the brand mark at `size`. Uses the orange master fill by default;
 * the CSS variable `--sq-brand-mark-fill` overrides it for dark themes so
 * the mark switches to white without re-rendering (per brand spec §2).
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
      <g fill="var(--sq-brand-mark-fill, #ED6A39)" fillRule="evenodd">
        <path d={BRAND_MASTER_PATH} />
        {children}
      </g>
    </svg>
  )
}
