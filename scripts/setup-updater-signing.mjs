#!/usr/bin/env node
// Run locally by the owner. Never run this from CI or capture its private files.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'

const script = fileURLToPath(import.meta.url)
const root = path.dirname(path.dirname(script))
const repository = 'ehartye/slate'
const secretNames = ['TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD']

export function generationArgs(keyPath, password) {
  // '=' keeps a password beginning with '-' from becoming a CLI option.
  return ['signer', 'generate', '--ci', '--write-keys', keyPath, `--password=${password}`]
}

// Capture child output: even a failing signer must not echo private material.
export function command(executable, args, input, label = 'Command') {
  const result = spawnSync(executable, args, {
    input, encoding: 'utf8', cwd: root, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw new Error(`${label} failed. Private command output was suppressed.`)
  return result.stdout
}

function protectDirectory(directory, run) {
  if (process.platform === 'win32') {
    const identity = run('whoami', ['/user', '/fo', 'csv', '/nh'], undefined, 'Windows identity lookup')
    const sid = identity.match(/S-1-5-\d+(?:-\d+)+/)?.[0]
    if (!sid) throw new Error('Could not determine the current Windows account SID.')
    run('icacls', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], undefined, 'Private-directory permissions')
  } else {
    fs.chmodSync(directory, 0o700)
  }
}

export function provision({
  directory = path.join(homedir(), '.tauri', 'slate-updater'),
  publicKeyPath = path.join(root, 'src-tauri', 'updater-public-key.txt'),
  resume = false,
  run = command,
  protect = protectDirectory,
  generate = (keyPath, password) => run(process.execPath, [script, '--generate'],
    JSON.stringify({ keyPath, password }), 'Tauri key generation'),
  log = console.log,
} = {}) {
  run('gh', ['auth', 'status'], undefined, 'GitHub authentication (run gh auth login first)')
  const repo = JSON.parse(run('gh', ['api', `repos/${repository}`, '--jq', '{full_name,permissions}'], undefined, 'Repository access check'))
  if (repo.full_name !== repository || !repo.permissions?.admin) {
    throw new Error(`An administrator of ${repository} must run this setup.`)
  }
  const existing = JSON.parse(run('gh', ['secret', 'list', '--repo', repository, '--json', 'name'], undefined, 'Existing-secret check'))
  const keyPath = path.join(directory, 'slate.key')
  const passwordPath = path.join(directory, 'password.txt')
  const receiptPath = path.join(directory, 'setup.json')

  if (!resume) {
    if (existing.some(item => secretNames.includes(item.name))) {
      throw new Error('Updater secrets already exist. Refusing to rotate or overwrite them. Use --resume only for this script’s saved key.')
    }
    if (fs.existsSync(directory) || fs.existsSync(publicKeyPath)) {
      throw new Error('A signing backup or public-key handoff already exists. Refusing to overwrite it; use --resume for a completed generation.')
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    try {
      protect(directory, run) // Apply permissions before writing anything private.
    } catch (error) {
      fs.rmdirSync(directory) // Empty directory created by this invocation only.
      throw error
    }
    const password = randomBytes(32).toString('base64url')
    fs.writeFileSync(passwordPath, password, { flag: 'wx', mode: 0o600 })
    try {
      generate(keyPath, password)
    } catch {
      if (!fs.existsSync(keyPath) && !fs.existsSync(`${keyPath}.pub`)) {
        fs.unlinkSync(passwordPath)
        fs.rmdirSync(directory)
        throw new Error('Tauri key generation failed before creating keys. No secrets were uploaded; temporary password removed. Fix the signer/dependencies and rerun normally.')
      }
      throw new Error(`Tauri key generation failed with partial key files in ${directory}. No secrets were uploaded. Preserve that directory for inspection, then move it aside before retrying; --resume is only for upload failures.`)
    }
    if (!fs.existsSync(keyPath) || !fs.existsSync(`${keyPath}.pub`)) {
      throw new Error('The signer did not create both key files. Backup was retained; no secrets were uploaded.')
    }
    fs.chmodSync(keyPath, 0o600)
    fs.writeFileSync(receiptPath, JSON.stringify({ repository, publicKeyPath, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 })
  } else {
    // Resume uses the same stored pair, never generates a replacement key.
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
    if (receipt.repository !== repository || receipt.publicKeyPath !== publicKeyPath) {
      throw new Error('Saved setup belongs to a different repository or public-key path.')
    }
    protect(directory, run)
  }

  const privateKey = fs.readFileSync(keyPath, 'utf8').trim()
  const password = fs.readFileSync(passwordPath, 'utf8').trim()
  const publicKey = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim()
  if (!privateKey || !password || !publicKey) throw new Error('A saved signing file is empty; no upload attempted.')
  if (fs.existsSync(publicKeyPath) && fs.readFileSync(publicKeyPath, 'utf8').trim() !== publicKey) {
    throw new Error('Public-key handoff differs from this backup. Refusing to replace it or upload secrets.')
  }
  log(`Uploading updater secrets to ${repository}; values will not be printed.`)
  try {
    run('gh', ['secret', 'set', secretNames[0], '--repo', repository], privateKey, 'Private-key upload')
    run('gh', ['secret', 'set', secretNames[1], '--repo', repository], password, 'Password upload')
    const names = JSON.parse(run('gh', ['secret', 'list', '--repo', repository, '--json', 'name'], undefined, 'Upload receipt check'))
    if (!secretNames.every(name => names.some(item => item.name === name))) throw new Error('Both secret names were not returned by GitHub.')
  } catch {
    throw new Error(`Upload incomplete. The original key and password are retained in ${directory}. Rerun with --resume to upload that same pair; do not generate a new key.`)
  }
  if (!fs.existsSync(publicKeyPath)) fs.writeFileSync(publicKeyPath, `${publicKey}\n`, { flag: 'wx', mode: 0o644 })
  log(`Done. Public key (safe to commit): ${publicKeyPath}`)
  log(`Private backup: ${directory}`)
  log('Keep slate.key and password.txt together in your secure backup/password manager. Do not paste them into chat or commit them.')
  log('GitHub confirmed both secret names exist; a future release signing check will verify the pair. No release was published.')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--generate') {
    // Password travels over an anonymous pipe, not shell history/process args.
    let input = ''
    for await (const chunk of process.stdin) input += chunk
    const { keyPath, password } = JSON.parse(input)
    const { run } = await import('@tauri-apps/cli')
    await run(generationArgs(keyPath, password))
    return
  }
  if (args.includes('--help')) {
    console.log('Usage: node scripts/setup-updater-signing.mjs [--resume]\nRequires npm dependencies and gh auth login with repository admin access.\nGenerates a new Slate updater key, saves a private backup under ~/.tauri/slate-updater,\nand uploads the key/password to ehartye/slate. --resume reuses that backup after an upload failure.\nDo not use --resume to replace secrets that were independently rotated.')
    return
  }
  if (args.some(arg => arg !== '--resume')) throw new Error('Unknown argument. Use --help.')
  provision({ resume: args.includes('--resume') })
}

if (isMain(import.meta.url)) {
  main().catch(error => {
    // Native signer output is captured by the parent. Never print its errors here.
    console.error(process.argv.includes('--generate') ? 'Key generation failed.' : error.message)
    process.exitCode = 1
  })
}
