<script lang="ts">
  import { themes, activeThemeName, activeMode } from '$lib/stores'
  import { applyThemeVariant, cssVar, type Theme } from '$lib/theme'

  let { onclose }: { onclose: () => void } = $props()

  const META: Record<string, { emoji: string; blurb: string }> = {
    Aurora: { emoji: '🌌', blurb: 'Cool borealis glow — geometric and calm.' },
    Ember: { emoji: '🔥', blurb: 'Candle-warm and literary. Serif comfort.' },
    Verdant: { emoji: '🌿', blurb: 'Mossy and organic. Easy on the eyes.' },
    Noir: { emoji: '🎞️', blurb: 'Editorial black & white, one red cut.' },
    Arcade: { emoji: '👾', blurb: 'Neon cabinet by night, Game Boy by day.' },
    Terminal: { emoji: '🖥️', blurb: 'Amber phosphor. Hack the mainframe.' },
    Overlord: { emoji: '💼', blurb: 'Tasteful thickness. Bone stock, blood-red power tie.' },
    BucketHub: { emoji: '🪣', blurb: 'Vanilla repository. Monospace, no nonsense. The no-theme theme.' },
    Manuscript: { emoji: '📜', blurb: 'Ink on vellum. A quiet room for long-form writing.' },
    Velvet: { emoji: '🍷', blurb: 'Aubergine and gold. Luxe, literary, after-hours.' },
    Glacier: { emoji: '🧊', blurb: 'Cool slate calm — and the clearest code of the set.' },
    Blueprint: { emoji: '📐', blurb: 'Cyan graph-paper. Drafting-table technical.' },
    Groovy: { emoji: '☮️', blurb: 'Tie-dye rainbow, dyslexia-friendly type. Far out.' },
    Kapow: { emoji: '💥', blurb: 'Newsprint halftone, speech-bubble quotes. Ka-pow!' },
    Starship: { emoji: '🚀', blurb: 'Holo-console cyan on deep space. Engage.' },
    Mainframe: { emoji: '💾', blurb: 'Green phosphor by night, tractor-feed printout by day.' },
  }
  const MODES: Array<'light' | 'dark'> = ['light', 'dark']

  function uniqueFamilies(list: Theme[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of list) if (!seen.has(t.name)) { seen.add(t.name); out.push(t.name) }
    return out
  }
  let fams = $derived(uniqueFamilies($themes))

  const variant = (fam: string, mode: 'light' | 'dark') =>
    $themes.find((t) => t.name === fam && t.mode === mode)

  function pick(t: Theme) {
    applyThemeVariant(t) // live preview — restyles the app behind the panel
  }

  function vars(css: string) {
    return {
      bg: cssVar(css, '--bg'), el: cssVar(css, '--bg-elevated'), fg: cssVar(css, '--fg'),
      accent: cssVar(css, '--accent'), border: cssVar(css, '--border'),
      heading: cssVar(css, '--prose-heading'), headingFont: cssVar(css, '--prose-heading-font'),
      code: cssVar(css, '--prose-code-bg'),
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onKey} />

<button class="theme-backdrop" onclick={onclose} aria-label="Close theme panel"></button>

<div class="theme-panel" role="dialog" aria-label="Themes">
  <div class="tp-head">
    <span>Pick a theme</span>
    <button class="collapse-btn" onclick={onclose} aria-label="Close">✕</button>
  </div>
  <div class="tp-list">
    {#each fams as fam (fam)}
      {@const meta = META[fam] ?? { emoji: '🎨', blurb: '' }}
      <div class="theme-card" class:active={$activeThemeName === fam}>
        <div class="tc-info">
          <span class="tc-emoji">{meta.emoji}</span>
          <div>
            <div class="tc-title">{fam}</div>
            <div class="tc-desc">{meta.blurb}</div>
          </div>
        </div>
        <div class="tc-variants">
          {#each MODES as mode}
            {@const t = variant(fam, mode)}
            {#if t}
              {@const v = vars(t.css)}
              <button
                class="thumb"
                class:active={$activeThemeName === fam && $activeMode === mode}
                onclick={() => pick(t)}
                title={`${fam} — ${mode}`}
              >
                <span class="thumb-mock" style="background:{v.bg}; border-color:{v.border}">
                  <span class="tm-bar" style="background:{v.el}; border-color:{v.border}">
                    <span class="tm-dot" style="background:{v.accent}"></span>
                  </span>
                  <span class="tm-body">
                    <span class="tm-h" style="color:{v.heading}; font-family:{v.headingFont}">Aa</span>
                    <span class="tm-l" style="background:{v.fg}"></span>
                    <span class="tm-l short" style="background:{v.fg}"></span>
                    <span class="tm-code" style="background:{v.code}"></span>
                    <span class="tm-acc" style="background:{v.accent}"></span>
                  </span>
                </span>
                <span class="thumb-cap">{mode}</span>
              </button>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
