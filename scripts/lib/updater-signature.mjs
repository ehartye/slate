import { createHash, createPublicKey, verify } from 'node:crypto';

function decode(value) {
  const text = value.trim();
  const bytes = Buffer.from(text, 'base64');
  if (!text || bytes.toString('base64') !== text) throw new Error('Invalid updater signature encoding');
  return bytes;
}

/** Verify Tauri's base64-wrapped minisign payload and authenticated comment.
 * Uses Node's Ed25519 and BLAKE2b primitives; never handles a private key.
 */
export function verifyUpdaterSignature(data, signature, publicKey) {
  const pubLines = decode(publicKey).toString('utf8').trim().split(/\r?\n/);
  const sigLines = decode(signature).toString('utf8').trim().split(/\r?\n/);
  if (pubLines.length !== 2 || sigLines.length !== 4 || !pubLines[0].startsWith('untrusted comment: ') || !sigLines[0].startsWith('untrusted comment: ') || !sigLines[2].startsWith('trusted comment: ')) throw new Error('Invalid updater signature format');
  const pub = decode(pubLines[1]), sig = decode(sigLines[1]), global = decode(sigLines[3]);
  if (pub.length !== 42 || pub.subarray(0, 2).toString() !== 'Ed' || sig.length !== 74 || sig.subarray(0, 2).toString() !== 'ED' || global.length !== 64 || !pub.subarray(2, 10).equals(sig.subarray(2, 10))) throw new Error('Updater signature key or algorithm mismatch');
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]), format: 'der', type: 'spki' });
  const digest = createHash('blake2b512').update(data).digest();
  const comment = Buffer.from(sigLines[2].slice('trusted comment: '.length));
  if (!verify(null, digest, key, sig.subarray(10)) || !verify(null, Buffer.concat([sig.subarray(10), comment]), key, global)) throw new Error('Updater signature verification failed');
}
