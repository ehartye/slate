import { describe, it, expect } from 'vitest'
import { languageNameFor } from '../src/lib/language'

// languageNameFor fills the gaps in @codemirror/language-data's
// matchFilename, which Editor.svelte consults first. Each expectation below
// corresponds to a filename matchFilename was measured to miss or resolve
// wrongly — see the module's own comments for the measurements.
describe('languageNameFor', () => {
  it('maps shell dotfiles that have no extension to match on', () => {
    expect(languageNameFor('.bashrc')).toBe('Shell')
    expect(languageNameFor('.zshrc')).toBe('Shell')
    expect(languageNameFor('.profile')).toBe('Shell')
  })

  it('maps JSON-bodied rc files to JSON', () => {
    expect(languageNameFor('.prettierrc')).toBe('JSON')
    expect(languageNameFor('.eslintrc')).toBe('JSON')
    expect(languageNameFor('.babelrc')).toBe('JSON')
  })

  it('maps key=value config files to Properties', () => {
    expect(languageNameFor('.env')).toBe('Properties files')
    expect(languageNameFor('.editorconfig')).toBe('Properties files')
    expect(languageNameFor('.npmrc')).toBe('Properties files')
  })

  it('maps ignore files to Properties, whose grammar covers their # comments', () => {
    expect(languageNameFor('.gitignore')).toBe('Properties files')
    expect(languageNameFor('.dockerignore')).toBe('Properties files')
  })

  it('maps .svelte to HTML, the closest grammar language-data ships', () => {
    expect(languageNameFor('App.svelte')).toBe('HTML')
  })

  it('overrides .cfg, which language-data resolves to TTCN_CFG rather than INI', () => {
    expect(languageNameFor('app.cfg')).toBe('Properties files')
    expect(languageNameFor('nginx.conf')).toBe('Properties files')
  })

  it('is case-insensitive, since Windows filenames are', () => {
    expect(languageNameFor('.BASHRC')).toBe('Shell')
    expect(languageNameFor('App.SVELTE')).toBe('HTML')
  })

  it('accepts a full path, not just a bare name', () => {
    expect(languageNameFor('C:\\Users\\me\\project\\.bashrc')).toBe('Shell')
    expect(languageNameFor('/home/me/project/App.svelte')).toBe('HTML')
  })

  it('defers to matchFilename for anything it has no opinion about', () => {
    // Returning null is the signal to fall through, not a failure.
    expect(languageNameFor('main.rs')).toBeNull()
    expect(languageNameFor('notes.txt')).toBeNull()
    expect(languageNameFor('README')).toBeNull()
  })

  it('declines to guess where a wrong grammar would be worse than none', () => {
    // language-data ships no Makefile or batch grammar. Mapping Makefile to
    // Shell would highlight recipe bodies but mis-colour targets and macros,
    // so it stays plain on purpose.
    expect(languageNameFor('Makefile')).toBeNull()
    expect(languageNameFor('build.bat')).toBeNull()
  })
})
