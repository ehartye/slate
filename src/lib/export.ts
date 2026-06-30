import katexCss from 'katex/dist/katex.min.css?inline'

const BASE_PROSE = `
body{margin:0;background:var(--prose-bg,#fff);}
.preview{color:var(--prose-fg,#111);font-family:var(--prose-font,system-ui,sans-serif);
  max-width:var(--prose-max-width,720px);margin:0 auto;padding:56px 24px;font-size:16px;
  line-height:var(--prose-line-height,1.7);}
.preview h1,.preview h2,.preview h3,.preview h4{color:var(--prose-heading,#000);
  font-family:var(--prose-heading-font,var(--prose-font,sans-serif));line-height:1.25;margin:1.6em 0 .6em;}
.preview h1,.preview h2{padding-bottom:.25em;border-bottom:1px solid var(--border,#ddd);}
.preview a{color:var(--prose-link,#06c);text-decoration:none;border-bottom:1px solid transparent;}
.preview a:hover{border-bottom-color:var(--prose-link,#06c);}
.preview code{background:var(--prose-code-bg,#eee);padding:.12em .4em;border-radius:5px;font-size:.88em;}
.preview pre{background:var(--prose-code-bg,#eee);padding:14px 16px;border-radius:10px;overflow:auto;
  border:1px solid var(--border,#ddd);}
.preview pre code{background:none;padding:0;}
.preview blockquote{margin:1em 0;padding:.4em 1em;border-left:3px solid var(--accent,#888);
  color:var(--fg-muted,#666);background:var(--accent-soft,rgba(0,0,0,.05));border-radius:0 8px 8px 0;}
.preview table{border-collapse:collapse;width:100%;margin:1em 0;}
.preview th,.preview td{border:1px solid var(--border,#ddd);padding:7px 11px;text-align:left;}
.preview th{background:var(--accent-soft,rgba(0,0,0,.05));}
.preview img{max-width:100%;border-radius:8px;}
.preview .hljs-keyword,.preview .hljs-built_in,.preview .hljs-type{color:var(--code-keyword,#c678dd);}
.preview .hljs-string,.preview .hljs-attr{color:var(--code-string,#98c379);}
.preview .hljs-comment,.preview .hljs-quote{color:var(--code-comment,#7f848e);font-style:italic;}
.preview .hljs-number,.preview .hljs-literal{color:var(--code-number,#d19a66);}
.preview .hljs-title,.preview .hljs-section{color:var(--code-fn,#61afef);}
.preview .hljs-name,.preview .hljs-tag{color:var(--code-tag,#e06c75);}
.preview :is(h1,h2,h3,h4,h5,h6){position:relative;}
.preview .header-anchor{position:absolute;left:-0.9em;opacity:0;border:0;font-weight:400;
  color:var(--fg-muted,#666);text-decoration:none;transition:opacity .15s ease;}
.preview :is(h1,h2,h3,h4,h5,h6):hover .header-anchor{opacity:0.45;}
.preview .header-anchor:hover{opacity:1;color:var(--accent,#888);}
`

export function buildStandaloneHtml(bodyHtml: string, themeCss: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${themeCss}</style>
<style>${katexCss}</style>
<style>${BASE_PROSE}</style>
</head><body><div class="preview">${bodyHtml}</div></body></html>`
}
