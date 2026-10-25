import { LIMITS } from "../limits";

/**
 * p0-07 §1 — nhóm LIMITS mới (`conversation`, `call`, `meeting` mở rộng,
 * `recording`) + `message.voiceNoteMaxSeconds` đã có từ p0-05. Test khoá lại
 * hình dạng/canonical range để registry (`system-config.registry.ts`) và
 * service không lệch nhau khi 1 trong 2 nơi bị sửa mà quên sửa nơi kia.
 */
describe("LIMITS — nhóm mới p0-07", () => {
  it("message.voiceNoteMaxSeconds tồn tại (dùng chung với upload.kinds.VOICE.maxSeconds)", () => {
    expect(LIMITS.message.voiceNoteMaxSeconds).toBe(LIMITS.upload.kinds.VOICE.maxSeconds);
  });

  it("call: đủ field, nằm trong canonical range be.md §3", () => {
    expect(LIMITS.call.ringTimeoutSeconds).toBeGreaterThanOrEqual(20);
    expect(LIMITS.call.ringTimeoutSeconds).toBeLessThanOrEqual(60);
    expect(LIMITS.call.maxParticipants).toBeGreaterThanOrEqual(2);
    expect(LIMITS.call.maxParticipants).toBeLessThanOrEqual(16);
    expect(LIMITS.call.tokenTtlSeconds).toBeGreaterThanOrEqual(300);
    expect(LIMITS.call.tokenTtlSeconds).toBeLessThanOrEqual(3600);
  });

  it("conversation: membersMax ≤ 200, pinMax ≤ 20, forwardTargetsMax ≤ 10", () => {
    expect(LIMITS.conversation.membersMax).toBeLessThanOrEqual(200);
    expect(LIMITS.conversation.pinMax).toBeLessThanOrEqual(20);
    expect(LIMITS.conversation.forwardTargetsMax).toBeLessThanOrEqual(10);
  });

  it("meeting: remindersMax ≤3, attendeesMax ≤200, maxParticipants ≤50, maxMinutes ≤480", () => {
    expect(LIMITS.meeting.remindersMax).toBeLessThanOrEqual(3);
    expect(LIMITS.meeting.attendeesMax).toBeLessThanOrEqual(200);
    expect(LIMITS.meeting.maxParticipants).toBeLessThanOrEqual(50);
    expect(LIMITS.meeting.maxMinutes).toBeLessThanOrEqual(480);
  });

  it("recording.retentionDays trong khoảng 7–365", () => {
    expect(LIMITS.recording.retentionDays).toBeGreaterThanOrEqual(7);
    expect(LIMITS.recording.retentionDays).toBeLessThanOrEqual(365);
  });
});
