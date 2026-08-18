/**
 * Логотип Molfi.
 *
 * Присланный файл был JPEG на белом фоне — на тёмной странице он дал бы
 * белый прямоугольник вокруг знака. Фон снят заливкой от краёв, а не
 * заменой белого по всему кадру: белые столбики диаграммы внутри золотого
 * круга такие же белые, и глобальная замена пробила бы в них дыры.
 * Кромка сделана полупрозрачной по светлоте, иначе от артефактов JPEG
 * оставался серый ореол.
 *
 * Вариантов два. Фирменный тёмно-зелёный #005424 на фоне #0a0f0a даёт
 * контраст 2,1:1 — надпись «Mol» на тёмном почти пропадает. Для тёмных
 * фонов зелёный осветлён в HSV: тон сохранён, поднята яркость, отсюда
 * 8,9:1. Золото и белая шерсть работают на обоих фонах и не тронуты.
 *
 *   logo.png / logo-mark.png             — для светлого фона
 *   logo-light.png / logo-mark-light.png — для тёмного
 */

const FILES = {
  dark:  { full: '/logo-light.png', mark: '/logo-mark-light.png' },
  light: { full: '/logo.png',       mark: '/logo-mark.png' },
}

/**
 * @param on  фон, на котором стоит логотип: 'dark' или 'light'
 */
export function SheepIcon({ size = 40, on = 'dark' }) {
  return (
    <img
      src={FILES[on].mark} alt="Molfi"
      width={size} height={size}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  )
}

/** Знак с надписью. Логотип вертикальный, поэтому размер задаётся высотой. */
export default function MolfiLogo({ size = 44, on = 'dark', variant = 'full' }) {
  if (variant === 'mark') return <SheepIcon size={size} on={on} />
  return (
    <img
      src={FILES[on].full} alt="Molfi"
      style={{ display: 'block', height: size, width: 'auto' }}
    />
  )
}
