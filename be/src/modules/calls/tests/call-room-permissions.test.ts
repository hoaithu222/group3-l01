import { CallRoomPermissions } from "../services/call-room-permissions";

type Case = { name: string; publish: { audio: boolean; video: boolean; screen: boolean }; muted: boolean; sources: string[]; canPublish: boolean };

/** VR-08 (be.md §10): bảng nguồn được phát theo `mutedByHost`, `allowVideo` (publishPermissions.video), slot chia sẻ màn hình. */
describe("CallRoomPermissions — nguồn phát của người trong phòng thoại", () => {
  const cases: Case[] = [
    { name: "mặc định: mic + camera", publish: { audio: true, video: true, screen: false }, muted: false, sources: ["MICROPHONE", "CAMERA"], canPublish: true },
    { name: "bị chủ phòng chặn mic: chỉ còn camera", publish: { audio: true, video: true, screen: false }, muted: true, sources: ["CAMERA"], canPublish: true },
    { name: "kênh không cho video: chỉ mic", publish: { audio: true, video: false, screen: false }, muted: false, sources: ["MICROPHONE"], canPublish: true },
    { name: "đang giữ slot chia sẻ màn hình: thêm SCREEN_SHARE(+audio)", publish: { audio: true, video: true, screen: true }, muted: false, sources: ["MICROPHONE", "CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"], canPublish: true },
    { name: "chỉ chia sẻ màn hình (mic bị chặn, không video)", publish: { audio: true, video: false, screen: true }, muted: true, sources: ["SCREEN_SHARE", "SCREEN_SHARE_AUDIO"], canPublish: true },
    // ⛔ Danh sách RỖNG + canPublish=true = MỌI nguồn trên LiveKit → phải tắt hẳn quyền phát.
    { name: "bị chặn mic + kênh không video + không chia sẻ: KHÔNG được phát gì", publish: { audio: true, video: false, screen: false }, muted: true, sources: [], canPublish: false },
    { name: "audio=false trong DB cũng không phát mic", publish: { audio: false, video: false, screen: false }, muted: false, sources: [], canPublish: false },
  ];

  it.each(cases)("$name", ({ publish, muted, sources, canPublish }) => {
    const p = { publishPermissions: publish, mutedByHost: muted };
    expect(CallRoomPermissions.sources(p)).toEqual(sources);
    expect(CallRoomPermissions.permission(p)).toEqual({
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: sources,
      canUpdateMetadata: true,
    });
  });

  it("quyền `updateParticipant` không bao giờ có cờ quản trị phòng (host control đi qua REST của BE)", () => {
    const perm = CallRoomPermissions.permission({ publishPermissions: { audio: true, video: true, screen: true }, mutedByHost: false });
    expect(Object.keys(perm).sort()).toEqual(["canPublish", "canPublishData", "canPublishSources", "canSubscribe", "canUpdateMetadata"]);
  });
});
