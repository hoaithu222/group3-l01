import { InMemoryMeetingRedisPort } from "../services/meeting-room.store";
import { RecordingConsentStore } from "../services/recording-consent.store";

describe("RecordingConsentStore — trạng thái tạm của đồng ý ghi hình (Redis in-memory, đồng hồ giả)", () => {
  let now = 1_000_000;
  const clock = () => new Date(now);
  const setup = () => new RecordingConsentStore(new InMemoryMeetingRedisPort(() => now));
  beforeEach(() => {
    now = 1_000_000;
  });

  it("open → current còn hạn tới TTL rồi biến mất (REC_008 ở service); answers đè theo người (đổi ý)", async () => {
    const store = setup();
    const req = await store.open("call1", { requestId: "r1", requestedBy: "host" }, 120, clock());
    expect(req.expiresAt).toBe(new Date(now + 120_000).toISOString());
    expect(await store.current("call1")).toMatchObject({ requestId: "r1", requestedBy: "host" });

    await store.answer("call1", req, "u1", false, clock());
    await store.answer("call1", req, "u1", true, clock()); // đổi ý: ghi đè
    await store.answer("call1", req, "u2", false, clock());
    const answers = await store.answers("call1", "r1");
    expect(answers.get("u1")).toMatchObject({ accept: true });
    expect(answers.get("u2")).toMatchObject({ accept: false });

    now += 119_000;
    expect(await store.current("call1")).not.toBeNull();
    now += 2_000;
    expect(await store.current("call1")).toBeNull(); // hết hạn
    expect((await store.answers("call1", "r1")).size).toBe(0);
  });

  it("yêu cầu mới thay yêu cầu cũ (dọn câu trả lời cũ); close dọn sạch", async () => {
    const store = setup();
    const first = await store.open("call1", { requestId: "r1", requestedBy: "host" }, 120, clock());
    await store.answer("call1", first, "u1", true, clock());
    const second = await store.open("call1", { requestId: "r2", requestedBy: "host" }, 120, clock());
    expect((await store.current("call1"))?.requestId).toBe("r2");
    expect((await store.answers("call1", "r1")).size).toBe(0);
    await store.answer("call1", second, "u1", true, clock());
    await store.close("call1", "r2");
    expect(await store.current("call1")).toBeNull();
    expect((await store.answers("call1", "r2")).size).toBe(0);
  });

  it("phòng khác nhau không lẫn khoá", async () => {
    const store = setup();
    await store.open("call1", { requestId: "r1", requestedBy: "a" }, 120, clock());
    expect(await store.current("call2")).toBeNull();
  });
});
