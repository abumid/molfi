// Вклеивает готовую разметку лендинга в dist/index.html.
//
// Запускается после `vite build` и `vite build --ssr`. Без этого краулер
// поисковика и превью в мессенджерах видят пустой <div id="root"> —
// приложение рисуется на клиенте.
//
// Разметка вклеивается внутрь корневого узла. React при монтировании
// её заменит: createRoot не гидратирует, а перерисовывает, и это здесь
// намеренно — гидратация потребовала бы совпадения языка и темы,
// а они берутся из localStorage, которого при сборке нет.

import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = resolve(root, 'dist/index.html')
const ssrPath = resolve(root, '.ssr/prerender.js')

if (!existsSync(ssrPath)) {
  console.error('[prerender] нет .ssr/prerender.js — сначала vite build --ssr')
  process.exit(1)
}

const { render } = await import(pathToFileURL(ssrPath).href)
const html = render('/')

const source = await readFile(indexPath, 'utf8')
const marker = '<div id="root"></div>'

if (!source.includes(marker)) {
  console.error('[prerender] в dist/index.html нет пустого <div id="root"></div>')
  process.exit(1)
}

await writeFile(indexPath, source.replace(marker, `<div id="root">${html}</div>`))
await rm(resolve(root, '.ssr'), { recursive: true, force: true })

console.log(`[prerender] лендинг вклеен в index.html: ${html.length} символов разметки`)
