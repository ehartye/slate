<script lang="ts" module>
  /** Every icon is drawn on the same 16×16 grid with the same 1.5 stroke, so a
   *  row of them reads as one set. Inline SVG rather than font glyphs: the
   *  Nerd Font icons these replace rendered as empty boxes on any machine
   *  without a Nerd Font installed, and emoji (📁, 🗎, ⟳) render differently
   *  on every OS and ignore the theme's colors. */
  const PATHS = {
    up: 'M8 13V3.25M3.75 7.5 8 3.25l4.25 4.25',
    folder: 'M1.75 4.25a1.5 1.5 0 0 1 1.5-1.5h2.6l1.5 1.5h5.4a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H3.25a1.5 1.5 0 0 1-1.5-1.5z',
    'file-plus': 'M9.25 1.75h-5a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5v-7zM9.25 1.75v4h4M8 8.25v4M6 10.25h4',
    'file-open': 'M9.25 1.75h-5a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5v-7zM9.25 1.75v4h4M5.75 11.75l4-4M6.75 7.75h3v3',
    eye: 'M1.5 8S3.9 3.25 8 3.25 14.5 8 14.5 8 12.1 12.75 8 12.75 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'eye-off': 'M6.6 3.4A6.3 6.3 0 0 1 8 3.25C12.1 3.25 14.5 8 14.5 8a11 11 0 0 1-1.6 2.2M4.2 4.7A11.6 11.6 0 0 0 1.5 8S3.9 12.75 8 12.75a6.6 6.6 0 0 0 3.6-1.1M6.6 6.6a2 2 0 0 0 2.8 2.8M2.25 2.25l11.5 11.5',
    refresh: 'M13.25 8a5.25 5.25 0 1 1-1.54-3.71M13.25 2.5v2.75H10.5',
    info: 'M8 14.25A6.25 6.25 0 1 0 8 1.75a6.25 6.25 0 0 0 0 12.5zM8 7.25v4M8 4.75v.01',
    markdown: 'M2.75 3.5h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H2.75a1.5 1.5 0 0 1-1.5-1.5V5a1.5 1.5 0 0 1 1.5-1.5zM3.75 10.25v-4.5l2 2.5 2-2.5v4.5M11.25 5.75v4.5M9.75 8.75l1.5 1.5 1.5-1.5',
    'window-plus': 'M3.25 2.75h9.5a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5zM1.75 5.75h12.5M8 7.75v3.5M6.25 9.5h3.5',
    external: 'M9.5 2.25h4.25V6.5M13.75 2.25 7.5 8.5M12 9.5v3a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 12.5v-7A1.5 1.5 0 0 1 3.5 4h3',
    close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
    chevron: 'M4.75 6.25 8 9.5l3.25-3.25',
    toc: 'M2.75 4h.01M6 4h7.25M2.75 8h.01M6 8h7.25M2.75 12h.01M6 12h7.25',
    'fit-width': 'M3.25 2.75h9.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1zM4.75 8h6.5M6.25 6.5 4.75 8l1.5 1.5M9.75 6.5l1.5 1.5-1.5 1.5',
    'fit-page': 'M5 1.75h6a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1zM6.5 5.25 8 3.75l1.5 1.5M6.5 10.75 8 12.25l1.5-1.5',
  } as const

  export type IconName = keyof typeof PATHS
</script>

<script lang="ts">
  let { name, size = 16 }: { name: IconName; size?: number } = $props()
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
><path d={PATHS[name]} /></svg>
