/**
 * Development-only entry point.
 *
 * It builds the same startup shape the Go assembly layer emits — an inert JSON
 * script element read through textContent — so the dev server exercises the
 * real contract instead of a convenience path. It is never part of the report
 * bundle, whose entry point is main.ts.
 */

const fixtures = import.meta.glob('../fixtures/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>

const names = Object.keys(fixtures)
  .map((path) => path.replace('../fixtures/', '').replace('.json', ''))
  .sort()

const requested = new URLSearchParams(window.location.search).get('fixture')
const chosen = requested !== null && names.includes(requested) ? requested : (names[0] ?? '')
const report = fixtures[`../fixtures/${chosen}.json`]

const data = document.createElement('script')
data.id = 'gitlog-html-data'
data.type = 'application/json'
data.textContent = JSON.stringify(report)
document.body.append(data)

const picker = document.createElement('nav')
picker.setAttribute('aria-label', 'Development fixtures')
picker.style.cssText =
  'position:fixed;inset:auto 0 0 0;z-index:9;display:flex;gap:.4rem;flex-wrap:wrap;padding:.4rem;background:Canvas;border-top:1px solid GrayText;font:12px system-ui'
for (const name of names) {
  const link = document.createElement('a')
  link.href = `?fixture=${name}`
  link.textContent = name
  link.style.cssText = name === chosen ? 'font-weight:700' : ''
  picker.append(link)
}
document.body.append(picker)

await import('./main')
