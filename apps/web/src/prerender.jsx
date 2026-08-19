import { renderToStaticMarkup } from 'react-dom/server'
// In react-router 7 StaticRouter lives in the package itself, not in
// react-router-dom/server — that subpath is gone in v7
import { StaticRouter } from 'react-router'
import Landing from './pages/Landing.jsx'

/**
 * Entry point for the prerender. Built by a separate Vite pass in SSR mode and
 * run from scripts/prerender.mjs after the regular build.
 *
 * Why: the app renders on the client, so a search crawler gets an empty
 * <div id="root">. For the catalogue that is tolerable — it is only viewed
 * after sign-in. For the landing it is not: that is the one page people come
 * to from search at all.
 *
 * Only the English dark version is rendered — language and theme live in
 * localStorage, which does not exist at build time. React on the client
 * replaces the markup with its own as soon as it mounts.
 */
export function render(url = '/') {
  return renderToStaticMarkup(
    <StaticRouter location={url}>
      <Landing />
    </StaticRouter>
  )
}
