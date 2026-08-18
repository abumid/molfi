import { renderToStaticMarkup } from 'react-dom/server'
// В react-router 7 StaticRouter лежит в самом пакете, а не в
// react-router-dom/server — того подпути в семёрке больше нет
import { StaticRouter } from 'react-router'
import Landing from './pages/Landing.jsx'

/**
 * Точка входа для предрендера. Собирается отдельной сборкой Vite в режиме
 * SSR и запускается из scripts/prerender.mjs после обычной сборки.
 *
 * Смысл: приложение рисуется на клиенте, и краулер поисковика получает
 * пустой <div id="root">. Для витрины это терпимо — её всё равно смотрят
 * после входа. Для лендинга нет: это единственная страница, ради которой
 * в поиск вообще приходят.
 *
 * Рендерим только английскую тёмную версию — язык и тема живут
 * в localStorage, которого при сборке нет. React на клиенте заменит
 * разметку своей, как только смонтируется.
 */
export function render(url = '/') {
  return renderToStaticMarkup(
    <StaticRouter location={url}>
      <Landing />
    </StaticRouter>
  )
}
