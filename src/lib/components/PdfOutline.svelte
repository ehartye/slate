<script lang="ts">
  import PdfOutline from './PdfOutline.svelte'
  import type { PDFDocumentProxy } from 'pdfjs-dist'

  // pdf.js's getOutline() return type is an anonymous inline object type in
  // its own .d.ts (no exported name to import) — this extracts that same
  // shape via TypeScript utility types so it stays in sync automatically
  // rather than hand-duplicating it.
  export type OutlineNode = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

  let {
    items,
    onSelect,
    depth = 0,
  }: {
    items: OutlineNode[]
    onSelect: (node: OutlineNode) => void
    depth?: number
  } = $props()
</script>

<ul class="pdf-outline-list" class:nested={depth > 0}>
  {#each items as node, i (i)}
    <li>
      <button class="pdf-outline-item" onclick={() => onSelect(node)} title={node.title}>{node.title}</button>
      {#if node.items?.length}
        <PdfOutline items={node.items} {onSelect} depth={depth + 1} />
      {/if}
    </li>
  {/each}
</ul>
