export const PREVIEW_ENDPOINT = 'https://raw.githubusercontent.com/ehartye/slate/updates/preview.json';
export const PLATFORMS = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64'];
const alpha = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.([1-9]\d*)$/;

/** @param {string} version */
export function parsePreviewVersion(version) {
  const match = typeof version === 'string' && alpha.exec(version);
  if (!match) throw new Error(`Invalid Preview version: ${version}`);
  return match.slice(1).map(BigInt);
}

/** @param {string} left @param {string} right */
export function comparePreviewVersions(left, right) {
  const a = parsePreviewVersion(left), b = parsePreviewVersion(right);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Check calendar fields before parsing: Date.parse normalizes impossible days.
 * @param {unknown} value
 */
function validPublicationDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, offsetHour = '0', offsetMinute = '0'] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1]
    && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59
    && Number(offsetHour) <= 23 && Number(offsetMinute) <= 59
    && Number.isFinite(Date.parse(value));
}

/** Validate the whole feed, including platforms other than the current host.
 * @param {unknown} value @param {string=} installed
 */
export function validatePreviewManifest(value, installed) {
  if (!object(value)) throw new Error('Invalid Preview manifest');
  parsePreviewVersion(value.version);
  if (installed !== undefined && comparePreviewVersions(value.version, installed) <= 0) throw new Error('Preview must be strictly newer');
  if (typeof value.notes !== 'string' || !object(value.platforms)) throw new Error('Missing Preview notes/platforms');
  if (value.pub_date !== undefined && !validPublicationDate(value.pub_date)) throw new Error('Invalid publication date');
  if (Object.keys(value.platforms).sort().join(',') !== [...PLATFORMS].sort().join(',')) throw new Error('Preview requires exactly three supported platforms');
  const prefix = `https://github.com/ehartye/slate/releases/download/v${value.version}/`;
  for (const platform of PLATFORMS) {
    const entry = value.platforms[platform];
    if (!object(entry) || typeof entry.signature !== 'string' || !entry.signature.trim() || typeof entry.url !== 'string' || !entry.url.startsWith(prefix)) throw new Error(`Invalid ${platform} payload`);
    const name = entry.url.slice(prefix.length);
    // Reject encoded paths, URL decorations and traversal before URL normalization.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..') || !name.endsWith(platform === 'windows-x86_64' ? '.exe' : '.app.tar.gz')) throw new Error(`Invalid ${platform} asset path`);
  }
  const arm = value.platforms['darwin-aarch64'], intel = value.platforms['darwin-x86_64'];
  if (arm.url !== intel.url || arm.signature !== intel.signature) throw new Error('Mac payload must be universal');
  return value;
}

/** @param {string} tag @param {Record<string, string>} records */
export function validateReleaseVersions(tag, records) {
  if (typeof tag !== 'string' || !tag.startsWith('v')) throw new Error('Release tag must start with v');
  const version = tag.slice(1);
  parsePreviewVersion(version);
  for (const key of ['package', 'lock', 'lockRoot', 'cargo', 'cargoLock', 'tauri']) {
    if (records[key] !== version) throw new Error(`${key} version must equal ${version}`);
  }
  return version;
}
