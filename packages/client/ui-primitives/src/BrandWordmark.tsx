import type { IconProps } from './icons/props.ts'

/** Display options for the product wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading square mark; defaults to true. */
  includeMark?: boolean | undefined
}

/** Frame geometry shared with the standalone mark, in the 24 unit box. */
const MARK_FRAME = 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z'

/** Initial drawn inside the frame. */
const MARK_INITIAL = 'M16 9.4c-.7-1.1-1.9-1.8-3.3-1.8-2 0-3.6 1.3-3.6 3.1 0 1.7 1.3 2.5 3.4 2.9 1.7.3 2.3.8 2.3 1.6 0 .9-1 1.5-2.2 1.5-1.4 0-2.4-.7-3-1.8'

/**
 * Render the product wordmark.
 *
 * The name is drawn as text rather than hand-fitted outline paths so the mark
 * and the name stay in step with the product name instead of freezing one
 * particular drawing of it.
 * @param props.size - height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading mark.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className, includeMark = true }: BrandWordmarkProps) {
  const width = includeMark ? 96 : 72
  const textX = includeMark ? 32 : 0
  return (
    <svg
      width={(size * width) / 24}
      height={size}
      className={className}
      viewBox={`${includeMark ? 0 : textX} 0 ${width} 24`}
      fill="none"
      aria-hidden="true"
    >
      {includeMark && (
        <g>
          <path d={MARK_FRAME} stroke="currentColor" strokeWidth="1.8" />
          <path
            d={MARK_INITIAL}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      <text
        x={textX}
        y="18.5"
        fill="currentColor"
        fontSize="19"
        fontWeight="600"
        letterSpacing="-0.4"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      >
        Sqode
      </text>
    </svg>
  )
}
