import { describe, it, expect } from 'vitest'
import { languageCorrectionFor, languageFallbackFor } from '../src/lib/language'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

// Editor.svelte resolves a file's language in three steps: a *correction*
// (language-data has a wrong answer), then language-data's own matchFilename,
// then a *fallback* (language-data had no answer). The split exists because
// applying both at the same point silently breaks the middle step — see the
// nginx.conf case below.

describe('languageCorrectionFor', () => {
  it('overrides only where language-data is actively wrong', () => {
    // Measured: matchFilename('a.cfg') resolves to TTCN_CFG, a telecom test
    // notation, where a .cfg file is INI-shaped in practice.
    expect(languageCorrectionFor('app.cfg')).toBe('Properties files')
  })

  it('has no opinion about anything else', () => {
    expect(languageCorrectionFor('main.rs')).toBeNull()
    expect(languageCorrectionFor('.bashrc')).toBeNull()
    expect(languageCorrectionFor('nginx.conf')).toBeNull()
  })
})

describe('languageFallbackFor', () => {
  it('maps shell dotfiles, which have no extension to match on', () => {
    expect(languageFallbackFor('.bashrc')).toBe('Shell')
    expect(languageFallbackFor('.zshrc')).toBe('Shell')
    expect(languageFallbackFor('.profile')).toBe('Shell')
  })

  it('maps JSON-bodied rc files to JSON', () => {
    expect(languageFallbackFor('.prettierrc')).toBe('JSON')
    expect(languageFallbackFor('.eslintrc')).toBe('JSON')
  })

  it('maps key=value config and ignore files to Properties', () => {
    expect(languageFallbackFor('.env')).toBe('Properties files')
    expect(languageFallbackFor('.editorconfig')).toBe('Properties files')
    expect(languageFallbackFor('.gitignore')).toBe('Properties files')
    expect(languageFallbackFor('.dockerignore')).toBe('Properties files')
  })

  it('maps .svelte to HTML, the closest grammar language-data ships', () => {
    expect(languageFallbackFor('App.svelte')).toBe('HTML')
  })

  it('maps Salesforce Apex (.cls, .trigger, .apex) to Java', () => {
    expect(languageFallbackFor('AccountService.cls')).toBe('Java')
    expect(languageFallbackFor('AccountTrigger.trigger')).toBe('Java')
    expect(languageFallbackFor('Anonymous.apex')).toBe('Java')
  })

  it('is case-insensitive and accepts a full path on either separator', () => {
    expect(languageFallbackFor('.BASHRC')).toBe('Shell')
    expect(languageFallbackFor('C:\\Users\\me\\project\\.bashrc')).toBe('Shell')
    expect(languageFallbackFor('/home/me/project/App.svelte')).toBe('HTML')
  })

  it('declines to guess where a wrong grammar would be worse than none', () => {
    // language-data ships no Makefile or batch grammar. Mapping Makefile to
    // Shell would colour recipe bodies but mis-colour targets and macros.
    expect(languageFallbackFor('Makefile')).toBeNull()
    expect(languageFallbackFor('build.bat')).toBeNull()
    expect(languageFallbackFor('main.rs')).toBeNull()
  })
})

describe('resolution order (the bug the split prevents)', () => {
  // Mirrors Editor.svelte's matchLanguage.
  const resolve = (path: string): string | null => {
    const correction = languageCorrectionFor(path)
    if (correction) return LanguageDescription.matchLanguageName(languages, correction)?.name ?? null
    const byFile = LanguageDescription.matchFilename(languages, path.split(/[\\/]/).pop()!)
    if (byFile) return byFile.name
    const fallback = languageFallbackFor(path)
    return fallback ? (LanguageDescription.matchLanguageName(languages, fallback)?.name ?? null) : null
  }

  it('keeps a specific filename match that language-data gets right', () => {
    // The regression this guards: `.conf` as a blanket override ahead of
    // matchFilename took nginx.conf away from Nginx and gave it to Properties.
    expect(resolve('nginx.conf')).toBe('Nginx')
  })

  it('still fills in the conf files language-data does not know', () => {
    expect(resolve('httpd.conf')).toBe('Properties files')
    expect(resolve('/etc/app.conf')).toBe('Properties files')
  })

  it('still beats a wrong answer', () => {
    expect(resolve('app.cfg')).toBe('Properties files')
  })

  it('leaves ordinary files to language-data', () => {
    expect(resolve('main.rs')).toBe('Rust')
    expect(resolve('Dockerfile')).toBe('Dockerfile')
  })

  it('fills gaps language-data leaves', () => {
    expect(resolve('App.svelte')).toBe('HTML')
    expect(resolve('.gitignore')).toBe('Properties files')
    expect(resolve('AccountService.cls')).toBe('Java')
    expect(resolve('AccountTrigger.trigger')).toBe('Java')
    expect(resolve('Anonymous.apex')).toBe('Java')
  })
})
