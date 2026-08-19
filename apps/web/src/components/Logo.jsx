/**
 * The Molfi logo.
 *
 * There are two variants. The brand dark green on a #0a0f0a background gives a
 * 2.5:1 contrast ratio — the word "Mol" almost disappears on dark. For dark
 * backgrounds the green is lightened in HSV: hue kept, value raised. The gold
 * and the white fleece work on both and are untouched.
 *
 * Served as WebP with a PNG fallback: WebP is three times lighter at the same
 * quality, and <picture> picks whatever the browser understands. For a page
 * opened over mobile data, 36 KB instead of 114 is noticeable.
 */

const FILES = {
  dark:  { full: '/logo-light', mark: '/logo-mark-light' },
  light: { full: '/logo',       mark: '/logo-mark' },
}

function Picture({ base, alt, style, width, height }) {
  return (
    <picture>
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img src={`${base}.png`} alt={alt} width={width} height={height} style={style} />
    </picture>
  )
}

/**
 * @param on the background the logo sits on: 'dark' or 'light'
 */
export function SheepIcon({ size = 40, on = 'dark' }) {
  return (
    <Picture
      base={FILES[on].mark} alt="Molfi" width={size} height={size}
      style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
    />
  )
}

/** Mark with wordmark. The logo is vertical, so the size is given as a height. */
export default function MolfiLogo({ size = 44, on = 'dark', variant = 'full' }) {
  if (variant === 'mark') return <SheepIcon size={size} on={on} />
  return (
    <Picture
      base={FILES[on].full} alt="Molfi"
      style={{ display: 'block', height: size, width: 'auto' }}
    />
  )
}
