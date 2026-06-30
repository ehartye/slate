import katexCss from 'katex/dist/katex.min.css?inline'
import proseCss from './styles/prose.css?inline'

// .preview prose styling is the shared prose.css (same rules the in-app preview
// uses, so the two never drift). Only the standalone-page container differs:
// the export owns the body background and the .preview page padding, which in the
// app are provided by .preview-pane / .preview-scroll instead.
const CONTAINER = `body{margin:0;background:var(--prose-bg,#fff);}
.preview{padding:56px 24px;}`

export function buildStandaloneHtml(bodyHtml: string, themeCss: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${themeCss}</style>
<style>${katexCss}</style>
<style>${proseCss}</style>
<style>${CONTAINER}</style>
</head><body><div class="preview">${bodyHtml}</div></body></html>`
}
