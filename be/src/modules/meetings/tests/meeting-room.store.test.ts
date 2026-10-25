import { LIMITS } from "../../../core/constants/limits";
import { InMemoryMeetingRedisPort, MeetingRoomStore } from "../services/meeting-room.store";

const entry = (userId: string, requestedAt = "2026-10-01T10:00:00.000Z") => ({ userId, displayName: `Khách ${userId}`, requestedAt, deviceId: `dev-${userId}` });

describe("MeetingRoomStore — trạng thái tạm của phòng họp trên Redis", () => {
  let now = 1_000_000;
  let store: MeetingRoomStore;
  beforeEach(() => {
    now = 1_000_000;
    store = new MeetingRoomStore(new InMemoryMeetingRedisPort(() => now));
  });

  it("phòng chờ: thêm lần đầu true, xin lại false (không phát trùng); danh sách theo thứ tự xin vào; đếm đúng", async () => {
    expect(await store.addLobby("m1", entry("u2", "2026-10-01T10:00:05.000Z"))).toBe(true);
    expect(await store.addLobby("m1", entry("u1", "2026-10-01T10:00:01.000Z"))).toBe(true);
    expect(await store.addLobby("m1", entry("u2"))).toBe(false);
    expect((await store.listLobby("m1")).map((e) => e.userId)).toEqual(["u1", "u2"]);
    expect(await store.lobbyCount("m1")).toBe(2);
    expect(await store.lobbyCount("m2")).toBe(0); // phòng khác không lẫn
  });

  it("removeLobby NGUYÊN TỬ: ba lời gọi song song cho cùng người → đúng MỘT true (MR-05)", async () => {
    await store.addLobby("m1", entry("u1"));
    const results = await Promise.all([store.removeLobby("m1", "u1"), store.removeLobby("m1", "u1"), store.removeLobby("m1", "u1")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.removeLobby("m1", "u1")).toBe(false);
  });

  it("hàng chờ hết hạn theo lobbyTtlHours; clearLobby xoá sạch", async () => {
    await store.addLobby("m1", entry("u1"));
    now += LIMITS.meeting.lobbyTtlHours * 3_600_000 - 1;
    expect(await store.lobbyCount("m1")).toBe(1);
    now += 2;
    expect(await store.lobbyCount("m1")).toBe(0);
    await store.addLobby("m1", entry("u1"));
    expect(await store.clearLobby("m1")).toBe(true);
    expect(await store.listLobby("m1")).toEqual([]);
  });

  it("cờ đã duyệt hết hạn sau admittedTtlSeconds và clearAdmitted xoá ngay; cờ từ chối hết hạn sau deniedTtlSeconds; khoá theo từng (phiên, người)", async () => {
    await store.setAdmitted("c1", "u1", "host");
    expect(await store.isAdmitted("c1", "u1")).toBe(true);
    expect(await store.isAdmitted("c1", "u2")).toBe(false);
    expect(await store.isAdmitted("c2", "u1")).toBe(false);
    now += LIMITS.meeting.admittedTtlSeconds * 1000 + 1;
    expect(await store.isAdmitted("c1", "u1")).toBe(false);
    await store.setAdmitted("c1", "u1", "host");
    expect(await store.clearAdmitted("c1", "u1")).toBe(true);
    expect(await store.isAdmitted("c1", "u1")).toBe(false);

    await store.setDenied("c1", "u1");
    expect(await store.isDenied("c1", "u1")).toBe(true);
    now += LIMITS.meeting.deniedTtlSeconds * 1000 + 1;
    expect(await store.isDenied("c1", "u1")).toBe(false);
  });

  it("mốc tự đóng: ghi ISO, đọc lại được, chưa ghi thì null", async () => {
    expect(await store.getClosingAt("c1")).toBeNull();
    await store.setClosingAt("c1", new Date("2026-10-01T11:00:00.000Z"));
    expect(await store.getClosingAt("c1")).toBe("2026-10-01T11:00:00.000Z");
  });

  it("mục hỏng trong hash bị bỏ qua khi liệt kê (không làm hỏng cả danh sách)", async () => {
    const port = new InMemoryMeetingRedisPort(() => now);
    const s = new MeetingRoomStore(port);
    await port.hsetNx("meet:lobby:m1", "bad", "{không phải json", 60);
    await s.addLobby("m1", entry("u1"));
    expect((await s.listLobby("m1")).map((e) => e.userId)).toEqual(["u1"]);
  });
});
