import { randomBytes, scrypt, timingSafeEqual, type BinaryLike } from 'node:crypto';

const KEYLEN = 64;
const N = 2 ** 15;
const R = 8;
const P = 1;

const derive = (password: string, salt: BinaryLike) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await derive(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Burn the same CPU for unknown users so response time does not reveal which emails exist.
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('dummy-password');
  await verifyPassword(password, await dummy);
}
