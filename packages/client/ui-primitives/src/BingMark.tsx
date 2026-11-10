import type { ReactNode } from 'react'

/**
 * The three strokes of the Bing-form brand mark on its 1024×1024 master canvas.
 * Copied verbatim from design package `M1_丙形Logo几何与欢迎页动画分镜.md` §2.3;
 * `bing-mark.client.spec.ts` pins them so a local edit cannot drift.
 * The waist gap is the distance between `upper`'s end (416,500) and `lower`'s
 * start (608,500) minus the 96 stroke width — do not close it.
 */
export const BING_MARK_PATHS = {
  upper: 'M836 284 C836 192 692 164 520 188 C348 212 224 288 224 392 C224 456 300 500 416 500',
  lower: 'M608 500 C712 500 784 540 784 656 C784 760 664 812 500 812 C438 812 388 804 344 792',
  caret: 'M200 752 L200 860',
} as const

/** Presentation of the master mark at any requested pixel size. */
export interface BingMarkProps {
  /** Rendered width and height in CSS pixels; the viewBox scales the master. */
  readonly size: number
  /** Optional host-authored class (hero surfaces style it for hover). */
  readonly className?: string
  /** Optional SMIL/CSS children appended inside the stroke group. */
  readonly children?: ReactNode
}

/**
 * Render the brand mark at `size`. Uses `currentColor`, so it follows the host's
 * label colour and therefore every palette preset.
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
      <g stroke="currentColor" strokeWidth="96" strokeLinecap="round" strokeLinejoin="round">
        <path d={BING_MARK_PATHS.upper} />
        <path d={BING_MARK_PATHS.lower} />
        <path d={BING_MARK_PATHS.caret} />
        {children}
      </g>
    </svg>
  )
}
