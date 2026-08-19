/**
 * A safe wrapper around localStorage.
 *
 * Touching it directly fails in two cases, and both are real. When the page is
 * prerendered in Node there is no global localStorage at all. In Safari private
 * mode it exists, but a write throws once the quota is exceeded. In both cases
 * the failure happens during component initialisation, which means the page
 * does not render at all.
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
    try { globalThis.localStorage.setItem(key, String(value)) } catch { /* quota */ }
  },
  remove(key) {
    if (!has()) return
    try { globalThis.localStorage.removeItem(key) } catch { /* ignore */ }
  },
}

/** System theme. matchMedia may be missing in Node and in old browsers. */
export const prefersLight = () => {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: light)')?.matches)
  } catch {
    return false
  }
}
