/**
 * Логотип Molfi.
 *
 * Вариантов два. Фирменный тёмно-зелёный на фоне #0a0f0a даёт контраст
 * 2,5:1 — надпись «Mol» на тёмном почти пропадает. Для тёмных фонов
 * зелёный осветлён в HSV: тон сохранён, поднята яркость. Золото и белая
 * шерсть работают на обоих фонах и не тронуты.
 *
 * Отдаём WebP с запасным PNG: WebP втрое легче при том же качестве,
 * а <picture> сам выберет, что браузер понимает. Для страницы, которую
 * открывают по мобильному интернету, 36 КБ вместо 114 — это заметно.
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
 * @param on фон, на котором стоит логотип: 'dark' или 'light'
 */
export function SheepIcon({ size = 40, on = 'dark' }) {
  return (
    <Picture
      base={FILES[on].mark} alt="Molfi" width={size} height={size}
      style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
    />
  )
}

/** Знак с надписью. Логотип вертикальный, поэтому размер задаётся высотой. */
export default function MolfiLogo({ size = 44, on = 'dark', variant = 'full' }) {
  if (variant === 'mark') return <SheepIcon size={size} on={on} />
  return (
    <Picture
      base={FILES[on].full} alt="Molfi"
      style={{ display: 'block', height: size, width: 'auto' }}
    />
  )
}
