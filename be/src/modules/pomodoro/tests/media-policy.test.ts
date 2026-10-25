import type { MediaTrackSource } from "../../../infrastructure/media";
import { defaultPomodoroConfig, normalizePomodoroConfig } from "../services/pomodoro-config";
import { isHostExempt, isMicLockedPhase, permissionFor, publishFor, rulesFor } from "../services/pomodoro-media-policy";

const ALL: MediaTrackSource[] = ["MICROPHONE", "CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"];

describe("pomodoro media policy — luật mic theo phase (PM-02, thực thi ở máy chủ media)", () => {
  it("FOCUS: bỏ MICROPHONE và âm thanh chia sẻ màn hình, vẫn CAMERA + SCREEN_SHARE", () => {
    expect(permissionFor(ALL, true, false)).toEqual({
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: ["CAMERA", "SCREEN_SHARE"],
      canUpdateMetadata: true,
    });
  });

  it("BREAK/WAITING: trả lại MICROPHONE (nhưng KHÔNG bật mic hộ — chỉ là quyền)", () => {
    expect(permissionFor(ALL, false, false).canPublishSources).toEqual(ALL);
  });

  it("⛔ danh sách nguồn RỖNG ⇒ canPublish = false (LiveKit coi rỗng + canPublish true là MỌI nguồn)", () => {
    // Người bị chặn mic (mutedByHost) trong FOCUS mà phòng cũng không cho camera/màn hình.
    expect(permissionFor([], true, false)).toMatchObject({ canPublish: false, canPublishSources: [] });
    expect(permissionFor([], false, false)).toMatchObject({ canPublish: false, canPublishSources: [] });
    // Chỉ còn mic mà FOCUS khoá mic → rỗng → canPublish false.
    expect(permissionFor(["MICROPHONE"], true, false)).toMatchObject({ canPublish: false, canPublishSources: [] });
    expect(permissionFor(["MICROPHONE", "SCREEN_SHARE_AUDIO"], true, false)).toMatchObject({ canPublish: false, canPublishSources: [] });
  });

  it("nguồn cơ sở đã trừ mic (mutedByHost) thì BREAK không tự thêm lại", () => {
    expect(permissionFor(["CAMERA", "SCREEN_SHARE"], false, false).canPublishSources).toEqual(["CAMERA", "SCREEN_SHARE"]);
  });

  it("chủ phòng được miễn (hostCanSpeakInFocus, P1) giữ nguyên nguồn cơ sở trong FOCUS", () => {
    expect(permissionFor(ALL, true, true).canPublishSources).toEqual(ALL);
    expect(isHostExempt({ hostCanSpeakInFocus: true }, true)).toBe(true);
    expect(isHostExempt({ hostCanSpeakInFocus: true }, false)).toBe(false);
    expect(isHostExempt({ hostCanSpeakInFocus: false }, true)).toBe(false);
  });

  it("publishFor: quyền LƯU ở participant (token cấp lại đọc đúng giá trị này)", () => {
    expect(publishFor(true, false)).toEqual({ audio: false, video: true, screen: true });
    expect(publishFor(false, false)).toEqual({ audio: true, video: true, screen: true });
    expect(publishFor(true, true)).toEqual({ audio: true, video: true, screen: true });
  });

  it("isMicLockedPhase: FOCUS và PAUSED giữa vòng tập trung khoá; nghỉ/chờ/đã tạm dừng khi nghỉ thì không", () => {
    expect(isMicLockedPhase("FOCUS", null)).toBe(true);
    expect(isMicLockedPhase("PAUSED", "FOCUS")).toBe(true);
    expect(isMicLockedPhase("PAUSED", "LONG_BREAK")).toBe(false);
    expect(isMicLockedPhase("SHORT_BREAK", null)).toBe(false);
    expect(isMicLockedPhase("WAITING", null)).toBe(false);
  });

  it("rulesFor: server tính luật hiển thị cho client", () => {
    expect(rulesFor("FOCUS", null)).toEqual({ micAllowed: false, cameraAllowed: true, screenShareAllowed: true });
    expect(rulesFor("SHORT_BREAK", null).micAllowed).toBe(true);
    expect(rulesFor("PAUSED", "FOCUS").micAllowed).toBe(false);
  });
});

describe("pomodoro config", () => {
  it("mặc định 25/5/15/4, tự chuyển phase, chủ phòng cũng im lặng khi tập trung", () => {
    expect(defaultPomodoroConfig()).toEqual({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4, autoAdvance: true, hostCanSpeakInFocus: false });
  });

  it("normalize: trường thiếu/ngoài khoảng/sai kiểu → mặc định, không ném lỗi", () => {
    expect(normalizePomodoroConfig(null)).toEqual(defaultPomodoroConfig());
    expect(normalizePomodoroConfig({ focusMinutes: 50, shortBreakMinutes: 999, longBreakMinutes: "20", cyclesBeforeLongBreak: 2.5, autoAdvance: false })).toEqual({
      focusMinutes: 50,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
      autoAdvance: false,
      hostCanSpeakInFocus: false,
    });
    expect(normalizePomodoroConfig({ focusMinutes: 4 }).focusMinutes).toBe(25); // dưới min 5
    expect(normalizePomodoroConfig({ focusMinutes: 91 }).focusMinutes).toBe(25); // trên max 90
  });
});
