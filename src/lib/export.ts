import katexCss from 'katex/dist/katex.min.css?inline'

const BASE_PROSE = `
body{margin:0;background:var(--prose-bg,#fff);}
.preview{color:var(--prose-fg,#111);font-family:var(--prose-font,system-ui,sans-serif);
  max-width:var(--prose-max-width,720px);margin:0 auto;padding:40px 20px;
  line-height:var(--prose-line-height,1.7);}
.preview h1,.preview h2,.preview h3{color:var(--prose-heading,#000);}
.preview a{color:var(--prose-link,#06c);}
.preview code{background:var(--prose-code-bg,#eee);padding:.1em .3em;border-radius:4px;}
.preview pre{background:var(--prose-code-bg,#eee);padding:12px;border-radius:6px;overflow:auto;}
.preview .hljs-keyword,.preview .hljs-built_in,.preview .hljs-type{color:var(--code-keyword,#c678dd);}
.preview .hljs-string,.preview .hljs-attr{color:var(--code-string,#98c379);}
.preview .hljs-comment,.preview .hljs-quote{color:var(--code-comment,#7f848e);font-style:italic;}
.preview .hljs-number,.preview .hljs-literal{color:var(--code-number,#d19a66);}
.preview .hljs-title,.preview .hljs-section{color:var(--code-fn,#61afef);}
.preview .hljs-name,.preview .hljs-tag{color:var(--code-tag,#e06c75);}
`

export function buildStandaloneHtml(bodyHtml: string, themeCss: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${themeCss}</style>
<style>${katexCss}</style>
<style>${BASE_PROSE}</style>
</head><body><div class="preview">${bodyHtml}</div></body></html>`
}
