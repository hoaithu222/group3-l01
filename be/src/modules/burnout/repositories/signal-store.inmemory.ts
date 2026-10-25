import { dayKey, type IBurnoutSignalStore } from "./signal-store";

/** Bản test của kho tín hiệu (không TTL — test kiểm nội dung, không kiểm hạn). `available = false` mô phỏng Redis mất kết nối. */
export class InMemoryBurnoutSignalStore implements IBurnoutSignalStore {
  readonly optIn = new Set<string>();
  readonly hashes = new Map<string, Record<string, string>>();
  readonly claimed = new Set<string>();
  available = true;

  isOptedIn(userId: string): Promise<boolean> {
    return Promise.resolve(this.available && this.optIn.has(userId));
  }

  addOptIn(userId: string): Promise<void> {
    if (this.available) this.optIn.add(userId);
    return Promise.resolve();
  }

  removeOptIn(userId: string): Promise<void> {
    if (this.available) this.optIn.delete(userId);
    return Promise.resolve();
  }

  optInMembers(): Promise<string[]> {
    return Promise.resolve(this.available ? [...this.optIn] : []);
  }

  markActive(userId: string, date: string, slot: string): Promise<void> {
    if (!this.available) return Promise.resolve();
    const key = dayKey(userId, date);
    this.hashes.set(key, { ...this.hashes.get(key), [`b:${slot}`]: "1" });
    return Promise.resolve();
  }

  incrEvent(userId: string, date: string, slot: string): Promise<void> {
    if (!this.available) return Promise.resolve();
    const key = dayKey(userId, date);
    const hash = { ...this.hashes.get(key) };
    hash[`e:${slot}`] = String(Number(hash[`e:${slot}`] ?? 0) + 1);
    this.hashes.set(key, hash);
    return Promise.resolve();
  }

  claimEvent(key: string): Promise<boolean> {
    if (!this.available || this.claimed.has(key)) return Promise.resolve(false);
    this.claimed.add(key);
    return Promise.resolve(true);
  }

  readDay(userId: string, date: string): Promise<Record<string, string>> {
    return Promise.resolve({ ...this.hashes.get(dayKey(userId, date)) });
  }

  deleteUserBuckets(userId: string): Promise<number> {
    let removed = 0;
    for (const key of [...this.hashes.keys()]) {
      if (key.startsWith(`wb:${userId}:`)) {
        this.hashes.delete(key);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
}
