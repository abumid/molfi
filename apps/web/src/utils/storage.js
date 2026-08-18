/**
 * Безопасная обёртка над localStorage.
 *
 * Прямое обращение падает в двух случаях, и оба реальны. При предрендере
 * страницы в Node глобального localStorage просто нет. В Safari в приватном
 * режиме он есть, но запись бросает исключение при переполнении квоты.
 * И там, и там падение случается в инициализации компонента, то есть
 * страница не отрисуется вообще.
 */
const has = () => {
  try {
    return typeof globalThis !== 'undefined' && Boolean(globalThis.localStorage)
  } catch {
    return false
  }
}

export const store = {
  get(key) {
    if (!has()) return null
    try { return globalThis.localStorage.getItem(key) } catch { return null }
  },
  set(key, value) {
    if (!has()) return
    try { globalThis.localStorage.setItem(key, String(value)) } catch { /* квота */ }
  },
  remove(key) {
    if (!has()) return
    try { globalThis.localStorage.removeItem(key) } catch { /* ignore */ }
  },
}

/** Системная тема. В Node и в старых браузерах matchMedia может не быть. */
export const prefersLight = () => {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: light)')?.matches)
  } catch {
    return false
  }
}
