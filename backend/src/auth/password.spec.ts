import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('salts: same password hashes differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('never stores the plain password', async () => {
    expect(await hashPassword('plaintext-secret')).not.toContain('plaintext-secret');
  });

  it.each(['', 'garbage', 'bcrypt$a$b', 'scrypt$only-salt'])('rejects malformed hash %j', async (stored) => {
    expect(await verifyPassword('x', stored)).toBe(false);
  });

  it('burnPasswordCheck resolves without throwing', async () => {
    await expect(burnPasswordCheck('anything')).resolves.toBeUndefined();
  });
});
