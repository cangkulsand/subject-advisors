/** One-time passwords for dummy users (S3-P004-029). Never logged, stored or cached by the application. */
export const DUMMY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
const LENGTH = 20;
const CLASSES = [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%*\-_]/];
const defaultRandom = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function generateDummyPassword(random: (n: number) => Uint8Array = defaultRandom): string {
  const size = DUMMY_PASSWORD_ALPHABET.length;
  // Rejection sampling: bytes at or above the largest multiple of the alphabet size are skipped, so no character is favoured.
  const limit = 256 - (256 % size);
  for (;;) {
    let password = '';
    while (password.length < LENGTH) {
      for (const byte of random(64)) {
        if (byte < limit) password += DUMMY_PASSWORD_ALPHABET[byte % size];
        if (password.length === LENGTH) break;
      }
    }
    if (CLASSES.every(pattern => pattern.test(password))) return password;
  }
}
