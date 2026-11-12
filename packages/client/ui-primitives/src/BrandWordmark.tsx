import type { IconProps } from './icons/props.ts'
import { BRAND_MASTER_PATH } from './brandMarkPath.ts'

/** Display options for the product wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading square mark; defaults to true. */
  includeMark?: boolean | undefined
}

/**
 * The brand mark is the rounded-square master, shared with {@link BingMark}. The master
 * lives in a 1024 unit box; the wordmark's mark slot is 24 units wide, so the group
 * is scaled rather than re-drawn, keeping one geometry for the whole product.
 */
const MARK_SCALE = 24 / 1024

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
        <g transform={`scale(${MARK_SCALE})`} fill="var(--sq-brand-mark-fill, #ED6A39)" fillRule="evenodd">
          <path d={BRAND_MASTER_PATH} />
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
