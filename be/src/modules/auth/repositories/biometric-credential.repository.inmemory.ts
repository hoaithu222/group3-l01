import { randomBytes } from "crypto";
import type {
  BiometricCredential,
  BiometricCredentialCreateInput,
  BiometricCredentialUpdateInput,
  IBiometricCredentialRepository,
} from "./biometric-credential.repository.interface";

const store = new Map<string, BiometricCredential>();

function nextId(): string {
  return randomBytes(12).toString("hex");
}

/** In-memory store dùng cho unit test — tương tự `InMemoryUserRepository`. */
export class InMemoryBiometricCredentialRepository implements IBiometricCredentialRepository {
  static clearStore(): void {
    store.clear();
  }

  async findById(id: string): Promise<BiometricCredential | null> {
    return store.get(id) ?? null;
  }

  async findActiveByKey(activeKey: string): Promise<BiometricCredential | null> {
    for (const c of store.values()) {
      if (c.activeKey === activeKey) return c;
    }
    return null;
  }

  async findActiveByUser(userId: string): Promise<BiometricCredential[]> {
    return Array.from(store.values())
      .filter((c) => c.userId === userId && c.status === "ACTIVE")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findActiveByUserAndId(userId: string, id: string): Promise<BiometricCredential | null> {
    const c = store.get(id);
    return c && c.userId === userId && c.status === "ACTIVE" ? c : null;
  }

  async create(input: BiometricCredentialCreateInput): Promise<BiometricCredential> {
    const now = new Date();
    const record: BiometricCredential = {
      id: nextId(),
      userId: input.userId,
      deviceId: input.deviceId,
      platform: input.platform,
      deviceName: input.deviceName ?? null,
      biometryKind: input.biometryKind,
      secretHash: input.secretHash,
      activeKey: input.activeKey,
      status: "ACTIVE",
      failedAttempts: 0,
      expiresAt: input.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      revokeReason: null,
      revokedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    store.set(record.id, record);
    return record;
  }

  async update(
    id: string,
    input: BiometricCredentialUpdateInput
  ): Promise<BiometricCredential | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated: BiometricCredential = { ...existing, ...input, updatedAt: new Date() };
    store.set(id, updated);
    return updated;
  }

  async incrementFailedAttempts(id: string): Promise<number | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const failedAttempts = existing.failedAttempts + 1;
    store.set(id, { ...existing, failedAttempts, updatedAt: new Date() });
    return failedAttempts;
  }

  async updateIfStatus(
    id: string,
    expectedStatus: "ACTIVE" | "REVOKED",
    input: BiometricCredentialUpdateInput
  ): Promise<boolean> {
    const existing = store.get(id);
    if (!existing || existing.status !== expectedStatus) return false;
    store.set(id, { ...existing, ...input, updatedAt: new Date() });
    return true;
  }

  async findExpiredActive(now: Date, limit: number): Promise<BiometricCredential[]> {
    return Array.from(store.values())
      .filter((c) => c.status === "ACTIVE" && c.expiresAt.getTime() <= now.getTime())
      .slice(0, limit);
  }

  async deleteRevokedOlderThan(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const c of store.values()) {
      if (c.status === "REVOKED" && c.revokedAt && c.revokedAt.getTime() < cutoff.getTime()) {
        store.delete(c.id);
        deleted += 1;
      }
    }
    return deleted;
  }
}
