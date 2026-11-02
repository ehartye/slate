import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { provision } from './setup-updater-signing.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-signing-script-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const calls = [], output = [], secrets = new Map()
  let generations = 0, failPassword = false
  const options = {
    directory: path.join(root, 'private'), publicKeyPath: path.join(root, 'public.txt'),
    protect: directory => assert.equal(fs.readdirSync(directory).length, 0),
    log: message => output.push(message),
    generate: (key, password) => {
      generations++
      assert.ok(password.length >= 40)
      fs.writeFileSync(key, 'FAKE-PRIVATE-KEY')
      fs.writeFileSync(`${key}.pub`, 'FAKE-PUBLIC-KEY')
    },
    run: (command, args, input) => {
      calls.push({ command, args, input })
      if (args[0] === 'api') return JSON.stringify({ full_name: 'ehartye/slate', permissions: { admin: true } })
      if (args[1] === 'list') return JSON.stringify([...secrets.keys()].map(name => ({ name })))
      if (args[1] === 'set') {
        if (failPassword && args[2].endsWith('PASSWORD')) throw new Error('FAKE-PRIVATE-KEY must not be echoed')
        secrets.set(args[2], input)
      }
      return ''
    },
  }
  return { root, options, calls, output, secrets, generations: () => generations, failPassword: value => { failPassword = value } }
}

test('uploads only via stdin and exposes only the public key', t => {
  const f = fixture(t)
  provision(f.options)
  const password = fs.readFileSync(path.join(f.options.directory, 'password.txt'), 'utf8')
  assert.equal(f.secrets.get('TAURI_SIGNING_PRIVATE_KEY'), 'FAKE-PRIVATE-KEY')
  assert.equal(f.secrets.get('TAURI_SIGNING_PRIVATE_KEY_PASSWORD'), password)
  assert.equal(fs.readFileSync(f.options.publicKeyPath, 'utf8'), 'FAKE-PUBLIC-KEY\n')
  assert.ok(!JSON.stringify(f.calls.map(call => call.args)).includes(password))
  assert.ok(!f.output.join('\n').includes(password))
  assert.ok(!f.output.join('\n').includes('FAKE-PRIVATE-KEY'))
})

test('refuses existing remote secrets before generating or modifying files', t => {
  const f = fixture(t)
  f.secrets.set('TAURI_SIGNING_PRIVATE_KEY', 'existing')
  assert.throws(() => provision(f.options), /already exist/)
  assert.equal(f.generations(), 0)
  assert.equal(fs.existsSync(f.options.directory), false)
  assert.equal(f.secrets.get('TAURI_SIGNING_PRIVATE_KEY'), 'existing')
})

test('partial upload retains the pair and resume does not generate a replacement', t => {
  const f = fixture(t)
  f.failPassword(true)
  assert.throws(() => provision(f.options), error => /--resume/.test(error.message) && !error.message.includes('FAKE-PRIVATE-KEY'))
  assert.equal(fs.existsSync(f.options.publicKeyPath), false)
  const password = fs.readFileSync(path.join(f.options.directory, 'password.txt'), 'utf8')
  f.failPassword(false)
  provision({ ...f.options, resume: true, protect: () => {} })
  assert.equal(f.generations(), 1)
  assert.equal(f.secrets.get('TAURI_SIGNING_PRIVATE_KEY_PASSWORD'), password)
})

test('resume rejects a conflicting public-key handoff before upload', t => {
  const f = fixture(t)
  provision(f.options)
  fs.writeFileSync(f.options.publicKeyPath, 'DIFFERENT-PUBLIC-KEY')
  const uploadCount = f.calls.filter(call => call.args[1] === 'set').length
  assert.throws(() => provision({ ...f.options, resume: true, protect: () => {} }), /differs/)
  assert.equal(f.calls.filter(call => call.args[1] === 'set').length, uploadCount)
})

test('Tauri accepts a leading-hyphen password (help-only; generates no key)', t => {
  const f = fixture(t)
  const keyPath = path.join(f.root, 'never-generated.key')
  const probe = `import { generationArgs } from './scripts/setup-updater-signing.mjs';
    import { run } from '@tauri-apps/cli';
    await run([...generationArgs(${JSON.stringify(keyPath)}, '-fake-password'), '--help']);`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.existsSync(keyPath), false)
})

test('generation failure before keys permits normal retry without exposing errors', t => {
  const f = fixture(t)
  assert.throws(() => provision({ ...f.options, generate: () => { throw new Error('FAKE-PRIVATE-KEY') } }),
    error => /rerun normally/.test(error.message) && !error.message.includes('FAKE-PRIVATE-KEY'))
  assert.equal(fs.existsSync(f.options.directory), false)
  assert.equal(f.secrets.size, 0)
  provision(f.options)
  assert.equal(f.secrets.size, 2)
})

test('partial key generation preserves files and never uploads', t => {
  const f = fixture(t)
  assert.throws(() => provision({ ...f.options, generate: key => {
    fs.writeFileSync(key, 'FAKE-PARTIAL-KEY')
    throw new Error('FAKE-PRIVATE-KEY')
  } }), /move it aside/)
  assert.equal(fs.readFileSync(path.join(f.options.directory, 'slate.key'), 'utf8'), 'FAKE-PARTIAL-KEY')
  assert.equal(f.secrets.size, 0)
})
