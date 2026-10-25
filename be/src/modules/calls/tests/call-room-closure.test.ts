import { evaluateRoomClosure, roomLastActivityAt } from "../services/call-state.machine";

const at = (minutesAgo: number, now: Date): Date => new Date(now.getTime() - minutesAgo * 60_000);
const NOW = new Date("2026-09-25T10:00:00.000Z");
const room = { status: "ACTIVE" as const, mode: "ROOM" as const, startedAt: at(30, NOW), answeredAt: at(30, NOW) };
const open = { scopeOpen: true, emptyRoomEndMs: 300_000 };

describe("roomLastActivityAt — mốc người cuối rời phòng", () => {
  it("chưa ai rời → lúc bắt đầu (answeredAt, rơi về startedAt)", () => {
    expect(roomLastActivityAt(room, [{ lastLeftAt: null }])).toEqual(room.answeredAt);
    expect(roomLastActivityAt({ startedAt: at(9, NOW), answeredAt: null }, [])).toEqual(at(9, NOW));
  });

  it("có người rời → mốc rời MUỘN NHẤT", () => {
    expect(roomLastActivityAt(room, [{ lastLeftAt: at(20, NOW) }, { lastLeftAt: at(6, NOW) }, { lastLeftAt: null }])).toEqual(at(6, NOW));
  });
});

describe("evaluateRoomClosure — lưới an toàn khi mất webhook room_finished (be.md §5.9)", () => {
  it("chỉ áp cho phòng ROOM đang chạy", () => {
    expect(evaluateRoomClosure({ ...room, mode: "RING" }, [], NOW, { ...open, scopeOpen: false })).toEqual({ action: "NONE" });
    expect(evaluateRoomClosure({ ...room, status: "ENDED" }, [], NOW, { ...open, scopeOpen: false })).toEqual({ action: "NONE" });
  });

  it("kênh/nhóm đã lưu trữ → ARCHIVED (kể cả khi còn người trong phòng)", () => {
    const inRoom = [{ state: "CONNECTED" as const, lastLeftAt: null }];
    expect(evaluateRoomClosure(room, inRoom, NOW, { ...open, scopeOpen: false })).toEqual({ action: "END", reason: "ARCHIVED" });
  });

  it.each(["JOINING", "CONNECTED", "RECONNECTING"] as const)("còn người %s → giữ phòng dù người khác đã rời từ lâu", (state) => {
    const list = [
      { state, lastLeftAt: null },
      { state: "LEFT" as const, lastLeftAt: at(60, NOW) },
    ];
    expect(evaluateRoomClosure(room, list, NOW, open)).toEqual({ action: "NONE" });
  });

  it("trống chưa đủ 5 phút → giữ; đủ 5 phút (tính từ người CUỐI rời) → EMPTY", () => {
    const lastLeft = (minutesAgo: number) => [
      { state: "LEFT" as const, lastLeftAt: at(minutesAgo + 10, NOW) },
      { state: "LEFT" as const, lastLeftAt: at(minutesAgo, NOW) },
    ];
    expect(evaluateRoomClosure(room, lastLeft(4.9), NOW, open)).toEqual({ action: "NONE" });
    expect(evaluateRoomClosure(room, lastLeft(5), NOW, open)).toEqual({ action: "END", reason: "EMPTY" });
    expect(evaluateRoomClosure(room, lastLeft(40), NOW, open)).toEqual({ action: "END", reason: "EMPTY" });
  });

  it("mới mở, người tạo chưa vào được nhưng còn JOINING/không ai rời → giữ; phòng bỏ hoang từ lâu không ai từng rời → EMPTY tính từ lúc mở", () => {
    const fresh = { ...room, startedAt: at(1, NOW), answeredAt: at(1, NOW) };
    expect(evaluateRoomClosure(fresh, [{ state: "LEFT", lastLeftAt: null }], NOW, open)).toEqual({ action: "NONE" });
    expect(evaluateRoomClosure(room, [{ state: "LEFT", lastLeftAt: null }], NOW, open)).toEqual({ action: "END", reason: "EMPTY" });
  });
});
