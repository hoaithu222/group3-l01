export type {
  IBiometricCredentialRepository,
  BiometricCredential,
  BiometricCredentialCreateInput,
  BiometricCredentialUpdateInput,
} from "./biometric-credential.repository.interface";
export { InMemoryBiometricCredentialRepository } from "./biometric-credential.repository.inmemory";
export { PrismaBiometricCredentialRepository } from "./biometric-credential.repository.prisma";
