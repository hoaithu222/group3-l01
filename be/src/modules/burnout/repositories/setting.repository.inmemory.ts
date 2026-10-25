import { newObjectId } from "../../../core/utils/object-id";
import { isTrackingEnabled, type SettingPatch, type WellbeingSettingEntity } from "../entities/burnout.interface";
import type { IWellbeingSettingRepository } from "./setting.repository.interface";
import type { TxHandle } from "./tx";

/** Bản test của `IWellbeingSettingRepository` — cùng ngữ nghĩa điều kiện (`claimAlert` nguyên tử: hai lời gọi tuần tự thì đúng một bên thắng). */
export class InMemoryWellbeingSettingRepository implements IWellbeingSettingRepository {
  readonly rows = new Map<string, WellbeingSettingEntity>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  findByUserId(userId: string): Promise<WellbeingSettingEntity | null> {
    const row = this.rows.get(userId);
    return Promise.resolve(row ? { ...row } : null);
  }

  enable(userId: string, now: Date, patch: SettingPatch): Promise<WellbeingSettingEntity> {
    const prev = this.rows.get(userId);
    const next: WellbeingSettingEntity = {
      id: prev?.id ?? newObjectId(),
      userId,
      optedInAt: now,
      optedOutAt: null,
      alertsEnabled: patch.alertsEnabled ?? true,
      preferredBreak: patch.preferredBreak ?? null,
      lastAlertAt: null,
      snoozedUntil: null,
      updatedAt: this.clock(),
    };
    this.rows.set(userId, next);
    return Promise.resolve({ ...next });
  }

  patch(userId: string, patch: SettingPatch): Promise<WellbeingSettingEntity | null> {
    const prev = this.rows.get(userId);
    if (!prev) return Promise.resolve(null);
    const next: WellbeingSettingEntity = {
      ...prev,
      ...(patch.alertsEnabled !== undefined && { alertsEnabled: patch.alertsEnabled }),
      ...(patch.preferredBreak !== undefined && { preferredBreak: patch.preferredBreak }),
      updatedAt: this.clock(),
    };
    this.rows.set(userId, next);
    return Promise.resolve({ ...next });
  }

  disable(userId: string, now: Date, _tx?: TxHandle): Promise<boolean> {
    const prev = this.rows.get(userId);
    if (!prev) return Promise.resolve(false);
    this.rows.set(userId, { ...prev, optedInAt: null, optedOutAt: now, lastAlertAt: null, snoozedUntil: null, alertsEnabled: true, preferredBreak: null, updatedAt: this.clock() });
    return Promise.resolve(true);
  }

  claimAlert(userId: string, notAfter: Date, now: Date, _tx?: TxHandle): Promise<boolean> {
    const prev = this.rows.get(userId);
    if (!prev || !isTrackingEnabled(prev)) return Promise.resolve(false);
    if (prev.lastAlertAt !== null && prev.lastAlertAt.getTime() > notAfter.getTime()) return Promise.resolve(false);
    this.rows.set(userId, { ...prev, lastAlertAt: now, updatedAt: this.clock() });
    return Promise.resolve(true);
  }

  setSnooze(userId: string, until: Date, _tx?: TxHandle): Promise<void> {
    const prev = this.rows.get(userId);
    if (prev) this.rows.set(userId, { ...prev, snoozedUntil: until, updatedAt: this.clock() });
    return Promise.resolve();
  }

  resetAlertState(userId: string): Promise<void> {
    const prev = this.rows.get(userId);
    if (prev) this.rows.set(userId, { ...prev, lastAlertAt: null, snoozedUntil: null, updatedAt: this.clock() });
    return Promise.resolve();
  }

  deleteByUser(userId: string): Promise<number> {
    return Promise.resolve(this.rows.delete(userId) ? 1 : 0);
  }

  listEnabledPage(afterId: string | null, limit: number): Promise<WellbeingSettingEntity[]> {
    const rows = [...this.rows.values()]
      .filter((r) => isTrackingEnabled(r) && (afterId === null || r.id > afterId))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, limit);
    return Promise.resolve(rows.map((r) => ({ ...r })));
  }
}
