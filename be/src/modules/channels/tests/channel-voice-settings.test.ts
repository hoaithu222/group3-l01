/**
 * Unit — cấu hình phòng thoại kênh VOICE (p2-03 be.md §2/§4/§5.9): giá trị hiệu lực, hợp nhất PATCH từng phần, phát hiện "tắt video",
 * dòng outbox RIÊNG cho `calls`, và DTO (trần cứng `LIMITS.voice.maxParticipants`, sàn 2, `.strict()`).
 */
import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import { updateChannelSchema } from "../dtos";
import {
  CALL_CHANNEL_VIDEO_DISABLED_JOB,
  effectiveVoiceSettings,
  planVoiceSettingsChange,
  videoDisabledOutbox,
} from "../services/channel-voice-settings";

const CH = "c1".repeat(12);
const WS = "a1".repeat(12);
const cap = LIMITS.voice.maxParticipants;

describe("effectiveVoiceSettings", () => {
  it("thiếu cấu hình → mặc định { allowVideo: true, maxParticipants: trần nền tảng }", () => {
    expect(effectiveVoiceSettings({ voiceSettings: null })).toEqual({ allowVideo: true, maxParticipants: cap });
    expect(effectiveVoiceSettings({})).toEqual({ allowVideo: true, maxParticipants: cap });
  });

  it("kẹp maxParticipants đã lưu (từng cao hơn trần hiện hành) về ≤ trần", () => {
    expect(effectiveVoiceSettings({ voiceSettings: { allowVideo: false, maxParticipants: cap + 20 } })).toEqual({ allowVideo: false, maxParticipants: cap });
    expect(effectiveVoiceSettings({ voiceSettings: { allowVideo: true, maxParticipants: 3 } }).maxParticipants).toBe(3);
  });
});

describe("planVoiceSettingsChange", () => {
  const voice = (voiceSettings: { allowVideo: boolean; maxParticipants: number } | null = null) => ({ type: "VOICE" as const, voiceSettings });

  it("không gửi voiceSettings → null (không đổi)", () => {
    expect(planVoiceSettingsChange(voice(), undefined)).toBeNull();
  });

  it("hợp nhất từng phần với giá trị hiện có", () => {
    expect(planVoiceSettingsChange(voice({ allowVideo: false, maxParticipants: 6 }), { maxParticipants: 4 })?.next).toEqual({ allowVideo: false, maxParticipants: 4 });
    expect(planVoiceSettingsChange(voice({ allowVideo: true, maxParticipants: 6 }), { allowVideo: false })?.next).toEqual({ allowVideo: false, maxParticipants: 6 });
  });

  it("videoDisabled CHỈ khi allowVideo đổi true → false (kể cả kênh chưa từng đặt = mặc định true)", () => {
    expect(planVoiceSettingsChange(voice(), { allowVideo: false })?.videoDisabled).toBe(true);
    expect(planVoiceSettingsChange(voice({ allowVideo: true, maxParticipants: 8 }), { allowVideo: false })?.videoDisabled).toBe(true);
    // đã tắt từ trước / bật lại / chỉ đổi số chỗ → không thu quyền lần nữa
    expect(planVoiceSettingsChange(voice({ allowVideo: false, maxParticipants: 8 }), { allowVideo: false })?.videoDisabled).toBe(false);
    expect(planVoiceSettingsChange(voice({ allowVideo: false, maxParticipants: 8 }), { allowVideo: true })?.videoDisabled).toBe(false);
    expect(planVoiceSettingsChange(voice(), { maxParticipants: 5 })?.videoDisabled).toBe(false);
  });

  it("kênh không phải VOICE → 400 VAL_001 (không lặng lẽ bỏ qua)", () => {
    for (const type of ["TEXT", "POMODORO"] as const) {
      try {
        planVoiceSettingsChange({ type, voiceSettings: null }, { allowVideo: false });
        throw new Error("phải ném lỗi");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).errorCode).toBe("VAL_001");
      }
    }
  });
});

describe("videoDisabledOutbox", () => {
  it("dòng outbox RIÊNG cho calls: queue calls, jobName cố định, dedupeKey theo (kênh, version) để retry không nhân đôi", () => {
    const row = videoDisabledOutbox(CH, WS, 4);
    expect(row).toMatchObject({
      queue: "calls",
      jobName: CALL_CHANNEL_VIDEO_DISABLED_JOB,
      aggregateType: "Channel",
      aggregateId: CH,
      dedupeKey: `call.channel-video-disabled:channel:${CH}:v4`,
      payload: { channelId: CH, workspaceId: WS },
    });
    expect(videoDisabledOutbox(CH, WS, 5).dedupeKey).not.toBe(row.dedupeKey);
  });
});

describe("updateChannelSchema.voiceSettings", () => {
  const parse = (voiceSettings: unknown) => updateChannelSchema.safeParse({ voiceSettings, expectedVersion: 1 });

  it("nhận allowVideo và/hoặc maxParticipants trong [2, trần]", () => {
    expect(parse({ allowVideo: false }).success).toBe(true);
    expect(parse({ maxParticipants: 2 }).success).toBe(true);
    expect(parse({ maxParticipants: cap, allowVideo: true }).success).toBe(true);
  });

  it("từ chối vượt trần, dưới 2, không nguyên, khoá lạ, rỗng", () => {
    for (const bad of [{ maxParticipants: cap + 1 }, { maxParticipants: 1 }, { maxParticipants: 3.5 }, { allowVideo: "no" }, { foo: 1 }, {}]) {
      expect(parse(bad).success).toBe(false);
    }
  });

  it("vắng voiceSettings vẫn hợp lệ (PATCH tên/mô tả như cũ)", () => {
    expect(updateChannelSchema.safeParse({ name: "Kênh mới", expectedVersion: 3 }).success).toBe(true);
  });
});
