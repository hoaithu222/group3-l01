export { getBiometricCapability } from './biometric-capability';
export type { BiometricCapability, BiometricKind } from './biometric-capability';

export { BiometricError, isBiometricError } from './biometric-error';
export type { BiometricErrorCode } from './biometric-error';

export { deleteSecret, readSecret, saveSecret } from './biometric-vault';

export { computeBiometricHmac } from './biometric-signing';
