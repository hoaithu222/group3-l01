import fc from "fast-check";
import { cooldownCutoff, decideAlert, snoozeUntil, type AlertInput } from "../domain/alert-policy";

/**
 * Domain THUẦN: chính sách cảnh báo (p7-03 README §2, GM-09) — chỉ MEDIUM/HIGH, còn bật, không tạm hoãn, cách lần trước ≥ 24 giờ (có độ lệch cho phép của job hằng ngày).
 */
const HOUR = 3_600_000;
const NOW = new Date("2026-03-10T22:20:00Z");
const base: AlertInput = { level: "MEDIUM", alertsEnabled: true, lastAlertAt: null, snoozedUntil: null, now: NOW, cooldownHours: 24, graceMinutes: 30 };
const at = (msAgo: number): Date => new Date(NOW.getTime() - msAgo);

describe("decideAlert", () => {
  it("MEDIUM/HIGH, chưa từng cảnh báo → cảnh báo", () => {
    expect(decideAlert(base)).toEqual({ alert: true });
    expect(decideAlert({ ...base, level: "HIGH" })).toEqual({ alert: true });
  });

  it("LOW không bao giờ cảnh báo (kể cả khi mọi điều kiện khác cho phép)", () => {
    expect(decideAlert({ ...base, level: "LOW" })).toEqual({ alert: false, reason: "LEVEL_LOW" });
  });

  it("người dùng tắt cảnh báo → không", () => {
    expect(decideAlert({ ...base, alertsEnabled: false })).toEqual({ alert: false, reason: "ALERTS_DISABLED" });
  });

  it("đang 'Nhắc lại sau' → không; hết hạn tạm hoãn → có", () => {
    expect(decideAlert({ ...base, snoozedUntil: new Date(NOW.getTime() + HOUR) })).toEqual({ alert: false, reason: "SNOOZED" });
    expect(decideAlert({ ...base, snoozedUntil: new Date(NOW.getTime() - 1) })).toEqual({ alert: true });
    expect(decideAlert({ ...base, snoozedUntil: NOW })).toEqual({ alert: true });
  });

  it("GM-09: cảnh báo cách chưa tới 24 giờ → COOLDOWN (một cảnh báo mỗi 24 giờ)", () => {
    expect(decideAlert({ ...base, lastAlertAt: at(2 * HOUR) })).toEqual({ alert: false, reason: "COOLDOWN" });
    expect(decideAlert({ ...base, lastAlertAt: at(20 * HOUR) })).toEqual({ alert: false, reason: "COOLDOWN" });
  });

  it("job hằng ngày lệch vài giây/phút vẫn coi là cách đủ 24 giờ (grace 30 phút); lệch quá grace thì vẫn chặn", () => {
    expect(decideAlert({ ...base, lastAlertAt: at(24 * HOUR - 10_000) })).toEqual({ alert: true });
    expect(decideAlert({ ...base, lastAlertAt: at(24 * HOUR - 29 * 60_000) })).toEqual({ alert: true });
    expect(decideAlert({ ...base, lastAlertAt: at(24 * HOUR - 31 * 60_000) })).toEqual({ alert: false, reason: "COOLDOWN" });
    expect(decideAlert({ ...base, lastAlertAt: at(25 * HOUR) })).toEqual({ alert: true });
  });

  it("thứ tự ưu tiên lý do: LOW → tắt cảnh báo → tạm hoãn → cooldown", () => {
    const all = { ...base, level: "LOW" as const, alertsEnabled: false, snoozedUntil: new Date(NOW.getTime() + HOUR), lastAlertAt: at(HOUR) };
    expect(decideAlert(all)).toEqual({ alert: false, reason: "LEVEL_LOW" });
    expect(decideAlert({ ...all, level: "HIGH" })).toEqual({ alert: false, reason: "ALERTS_DISABLED" });
    expect(decideAlert({ ...all, level: "HIGH", alertsEnabled: true })).toEqual({ alert: false, reason: "SNOOZED" });
    expect(decideAlert({ ...all, level: "HIGH", alertsEnabled: true, snoozedUntil: null })).toEqual({ alert: false, reason: "COOLDOWN" });
  });
});

describe("cooldownCutoff / snoozeUntil", () => {
  it("cutoff = now − (24h − grace)", () => {
    expect(cooldownCutoff(NOW, 24, 30).getTime()).toBe(NOW.getTime() - (24 * 60 - 30) * 60_000);
    expect(cooldownCutoff(NOW, 24, 0).getTime()).toBe(NOW.getTime() - 24 * HOUR);
  });

  it("grace lớn hơn cooldown không cho cutoff ở tương lai", () => {
    expect(cooldownCutoff(NOW, 1, 500).getTime()).toBe(NOW.getTime());
  });

  it("snooze = ack + 24 giờ", () => {
    expect(snoozeUntil(NOW, 24).getTime()).toBe(NOW.getTime() + 24 * HOUR);
  });

  it("property: cảnh báo cách nhau < 24h − grace luôn bị chặn; ≥ 24h − grace luôn được phép (khi các điều kiện khác đủ)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 72 * 60 }), (minutesAgo) => {
        const decision = decideAlert({ ...base, lastAlertAt: at(minutesAgo * 60_000) });
        expect(decision.alert).toBe(minutesAgo >= 24 * 60 - 30);
      })
    );
  });
});
