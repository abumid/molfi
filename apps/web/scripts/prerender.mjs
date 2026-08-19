// Injects the pre-rendered landing markup into dist/index.html.
//
// Runs after `vite build` and `vite build --ssr`. Without it a search crawler
// and messenger previews see an empty <div id="root"> — the app is drawn on
// the client.
//
// The markup is injected inside the root node. React replaces it on mount:
// createRoot re-renders rather than hydrates, and that is deliberate here —
// hydration would require the language and theme to match, and both come from
// localStorage, which does not exist at build time.

import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = resolve(root, 'dist/index.html')
const ssrPath = resolve(root, '.ssr/prerender.js')

if (!existsSync(ssrPath)) {
  console.error('[prerender] no .ssr/prerender.js — run vite build --ssr first')
  process.exit(1)
}

const { render } = await import(pathToFileURL(ssrPath).href)
const html = render('/')

const source = await readFile(indexPath, 'utf8')
const marker = '<div id="root"></div>'

if (!source.includes(marker)) {
  console.error('[prerender] dist/index.html has no empty <div id="root"></div>')
  process.exit(1)
}

await writeFile(indexPath, source.replace(marker, `<div id="root">${html}</div>`))
await rm(resolve(root, '.ssr'), { recursive: true, force: true })

console.log(`[prerender] landing injected into index.html: ${html.length} characters of markup`)
