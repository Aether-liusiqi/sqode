import type { IconProps } from './icons/props.ts'

/** Native viewBox of {@link FISH_LOGO_PATH} (width and height in user units). */
export const FISH_LOGO_VIEWBOX = { width: 24, height: 24 }

/**
 * The Sqode mark frame, exported for consumers that compose their own svg
 * (entrance effects, masks) around the same geometry.
 *
 * The exported name is kept for compatibility with those consumers; the
 * geometry is the product mark, not the former vendor silhouette.
 */
export const FISH_LOGO_PATH = 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z'

/** Initial drawn inside {@link FISH_LOGO_PATH}, sized to the 24 unit frame. */
const MARK_INITIAL_PATH = 'M16 9.4c-.7-1.1-1.9-1.8-3.3-1.8-2 0-3.6 1.3-3.6 3.1 0 1.7 1.3 2.5 3.4 2.9 1.7.3 2.3.8 2.3 1.6 0 .9-1 1.5-2.2 1.5-1.4 0-2.4-.7-3-1.8'

/**
 * Render the product mark.
 * @param props.size - edge length in px (default 24; the mark is square).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={(size * FISH_LOGO_VIEWBOX.height) / FISH_LOGO_VIEWBOX.width}
      className={className}
      viewBox={`0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <path d={FISH_LOGO_PATH} stroke="currentColor" strokeWidth="1.8" />
      <path
        d={MARK_INITIAL_PATH}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
