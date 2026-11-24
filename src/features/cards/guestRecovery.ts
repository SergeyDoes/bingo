const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createGuestRecoveryCode(): string {
  const random = new Uint8Array(12);
  window.crypto.getRandomValues(random);
  const value = Array.from(random, (byte) => RECOVERY_ALPHABET[byte & 31]).join('');
  return value.match(/.{1,4}/g)!.join('-');
}

export function createGuestNickname(): string {
  const random = new Uint32Array(1);
  window.crypto.getRandomValues(random);
  return `Guest-${1000 + (random[0] % 9000)}`;
}
