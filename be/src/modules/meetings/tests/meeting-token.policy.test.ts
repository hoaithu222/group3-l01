import { publishSourcesOf } from "../../../infrastructure/media";
import { MeetingTokenPolicy } from "../services/meeting-token.policy";

describe("MeetingTokenPolicy (be.md §5.6) — quyền phát theo vai trò và trạng thái ghi hình", () => {
  it.each([
    ["HOST", undefined, false, { audio: true, video: true, screen: true }],
    ["CO_HOST", undefined, false, { audio: true, video: true, screen: true }],
    ["MEMBER", undefined, false, { audio: true, video: true, screen: true }],
    // đang ghi hình mà người này chưa đồng ý → chỉ nghe/xem (kể cả chủ trì)
    ["MEMBER", { active: true, consented: false }, false, { audio: false, video: false, screen: false }],
    ["HOST", { active: true, consented: false }, false, { audio: false, video: false, screen: false }],
    ["MEMBER", { active: true, consented: true }, false, { audio: true, video: true, screen: true }],
    ["MEMBER", { active: false, consented: false }, false, { audio: true, video: true, screen: true }],
    // P1 chế độ khán giả: chỉ thành viên thường bị chặn phát
    ["MEMBER", undefined, true, { audio: false, video: false, screen: false }],
    ["CO_HOST", undefined, true, { audio: true, video: true, screen: true }],
    ["HOST", undefined, true, { audio: true, video: true, screen: true }],
  ] as const)("role=%s recording=%j audienceMode=%s → %j", (role, recording, audienceMode, expected) => {
    expect(MeetingTokenPolicy.publishFor({ role, recording, audienceMode })).toEqual(expected);
  });

  it("nguồn phát trong token: bình thường có mic/camera/chia sẻ (+ âm thanh chia sẻ); bị chặn thì không có nguồn nào", () => {
    expect(publishSourcesOf(MeetingTokenPolicy.publishFor({ role: "MEMBER" }))).toEqual(["MICROPHONE", "CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"]);
    expect(publishSourcesOf(MeetingTokenPolicy.publishFor({ role: "MEMBER", recording: { active: true, consented: false } }))).toEqual([]);
  });

  it("trả bản sao mới mỗi lần (caller sửa không làm hỏng hằng dùng chung)", () => {
    const a = MeetingTokenPolicy.publishFor({ role: "MEMBER" });
    a.audio = false;
    expect(MeetingTokenPolicy.publishFor({ role: "MEMBER" }).audio).toBe(true);
  });
});
