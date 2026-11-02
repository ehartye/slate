// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { comparePreviewVersions, validatePreviewManifest, validateReleaseVersions } from '../scripts/lib/release-contract.mjs';
import { releaseConfig } from '../scripts/prepare-release-config.mjs';
import { readReleaseVersions } from '../scripts/validate-release.mjs';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const version = '0.2.0-alpha.2';
const asset = (name: string) => `https://github.com/ehartye/slate/releases/download/v${version}/${name}`;
const manifest = () => ({ version, notes: 'Preview', platforms: {
  'windows-x86_64': { url: asset('Slate_0.2.0-alpha.2_x64-setup.exe'), signature: 'signed payload' },
  'darwin-aarch64': { url: asset('Slate.app.tar.gz'), signature: 'signed mac' },
  'darwin-x86_64': { url: asset('Slate.app.tar.gz'), signature: 'signed mac' },
} });
const records = (v = version) => ({ package: v, lock: v, lockRoot: v, cargo: v, cargoLock: v, tauri: v });

describe('Preview release contract', () => {
  it('orders numeric alpha components and core versions', () => {
    expect(comparePreviewVersions('0.2.0-alpha.10', '0.2.0-alpha.9')).toBe(1);
    expect(comparePreviewVersions('1.0.0-alpha.1', version)).toBe(1);
    expect(comparePreviewVersions(version, version)).toBe(0);
  });
  it.each(['0.2.0', '0.2.0-beta.1', '0.2.0-rc.1', '0.2.0-dev.1', '0.2.0-alpha.0', '0.2.0-alpha.01', '00.2.0-alpha.1', '0.2.0-alpha.1+build', 'v0.2.0-alpha.1'])('rejects ineligible version %s', value => {
    expect(() => comparePreviewVersions(value, version)).toThrow();
  });
  it('accepts a complete newer Preview and rejects equal/older', () => {
    expect(validatePreviewManifest(manifest(), '0.2.0-alpha.1')).toEqual(manifest());
    expect(() => validatePreviewManifest(manifest(), version)).toThrow(/newer/);
    expect(() => validatePreviewManifest(manifest(), '0.2.0-alpha.3')).toThrow(/newer/);
  });
  it.each(['2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:00:00+24:00'])('rejects invalid RFC3339 calendar/time %s', pub_date => {
    expect(() => validatePreviewManifest({ ...manifest(), pub_date })).toThrow(/date/);
  });
  it.each(['2024-02-29T23:59:59.123Z', '2026-01-01T00:00:00+05:30', '2026-12-31T23:59:59-12:00'])('accepts valid RFC3339 date %s', pub_date => {
    expect(validatePreviewManifest({ ...manifest(), pub_date }).pub_date).toBe(pub_date);
  });
  it('rejects incomplete or mismatched universal manifests', () => {
    const missing: any = manifest(); delete missing.platforms['darwin-x86_64'];
    expect(() => validatePreviewManifest(missing)).toThrow();
    const mismatch = manifest(); mismatch.platforms['darwin-x86_64'].signature = 'different';
    expect(() => validatePreviewManifest(mismatch)).toThrow();
    const empty = manifest(); empty.platforms['windows-x86_64'].signature = ' ';
    expect(() => validatePreviewManifest(empty)).toThrow();
  });
  it.each(['http://github.com/ehartye/slate/releases/download/v0.2.0-alpha.2/a.exe', asset('../a.exe'), asset('%2e%2e/a.exe'), asset('a.exe?download=1'), asset('a.exe#x'), asset('a.zip'), asset('a.exe').replace('ehartye/slate', 'elsewhere/slate'), asset('a.exe').replace('alpha.2/', 'alpha.1/')])('rejects unsafe or wrong assets %s', url => {
    const value = manifest(); value.platforms['windows-x86_64'].url = url;
    expect(() => validatePreviewManifest(value)).toThrow();
  });
  it('checks every version record against the exact eligible tag', () => {
    expect(validateReleaseVersions(`v${version}`, records())).toBe(version);
    for (const key of Object.keys(records())) {
      expect(() => validateReleaseVersions(`v${version}`, { ...records(), [key]: '0.2.0-alpha.1' })).toThrow();
    }
    expect(() => validateReleaseVersions(version, records())).toThrow();
  });
  it('requires a real-format public handoff for release overlay', () => {
    expect(() => releaseConfig('')).toThrow();
    expect(() => releaseConfig('not a key')).toThrow();
    // Synthetic public bytes only: no corresponding private key exists.
    const bytes = Buffer.alloc(42); bytes.write('Ed');
    const key = Buffer.from(`untrusted comment: minisign public key\n${bytes.toString('base64')}\n`).toString('base64');
    const overlay = releaseConfig(key);
    expect(overlay.bundle.createUpdaterArtifacts).toBe(true);
    expect(overlay.bundle.macOS.signingIdentity).toBe('-');
    expect(overlay.plugins.updater.pubkey).toBe(key);
    expect(overlay.plugins.updater.endpoints).toEqual(['https://raw.githubusercontent.com/ehartye/slate/updates/preview.json']);
  });
  it('reads only app records, including Windows line endings, and catches root lock drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'slate-release-contract-'));
    try {
      mkdirSync(join(root, 'src-tauri'));
      writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
      writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version }, other: { version: '9.9.9' } } }));
      writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version }));
      writeFileSync(join(root, 'src-tauri/Cargo.toml'), `[package]\r\nname = "slate"\r\nversion = "${version}"\r\n\r\n[dependencies]\r\nother = "9.9.9"\r\n`);
      writeFileSync(join(root, 'src-tauri/Cargo.lock'), `[[package]]\r\nname = "other"\r\nversion = "9.9.9"\r\n\r\n[[package]]\r\nname = "slate"\r\nversion = "${version}"\r\n`);
      expect(validateReleaseVersions(`v${version}`, readReleaseVersions(root))).toBe(version);
      writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version: '0.2.0-alpha.1' } } }));
      expect(() => validateReleaseVersions(`v${version}`, readReleaseVersions(root))).toThrow(/lockRoot/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
