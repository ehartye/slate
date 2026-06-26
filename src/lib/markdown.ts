import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})

md.use(taskLists)

export function renderMarkdown(src: string): string {
  return md.render(src)
}
