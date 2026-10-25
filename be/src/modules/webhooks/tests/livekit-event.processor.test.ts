import { clearLiveKitHandlers, registerLiveKitHandler, toStoredPayload, type NormalizedLiveKitEvent } from "../../../infrastructure/media";
import { LiveKitEventProcessor } from "../livekit-event.processor";
import { InMemoryWebhookEventRepository } from "./support/webhooks-test-support";

const normalized = (over: Partial<NormalizedLiveKitEvent> = {}): NormalizedLiveKitEvent => ({
  id: "EV_1",
  type: "participant_joined",
  roomName: "call_x",
  createdAt: null,
  room: null,
  participant: { identity: "u1", sid: "PA_1", state: "ACTIVE", joinedAt: null },
  track: null,
  egress: null,
  ...over,
});

async function seed(repo: InMemoryWebhookEventRepository, over: Partial<NormalizedLiveKitEvent> = {}) {
  const e = normalized(over);
  const row = await repo.create({
    provider: "LIVEKIT",
    eventId: e.id,
    type: e.type,
    roomName: e.roomName,
    payloadHash: "h",
    payload: JSON.parse(JSON.stringify(toStoredPayload(e))) as unknown,
  });
  return row!.id;
}

let repo: InMemoryWebhookEventRepository;
let processor: LiveKitEventProcessor;
beforeEach(() => {
  clearLiveKitHandlers();
  repo = new InMemoryWebhookEventRepository();
  processor = new LiveKitEventProcessor(repo);
});

describe("LiveKitEventProcessor.process", () => {
  it("MED-07: room call_x → handler `call` chạy với sự kiện dựng lại từ DB → PROCESSED", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle });
    const id = await seed(repo);

    await expect(processor.process(id)).resolves.toBe("PROCESSED");

    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ id: "EV_1", type: "participant_joined", roomName: "call_x", participant: expect.objectContaining({ identity: "u1" }) }));
    expect(repo.rows.get(id)).toMatchObject({ status: "PROCESSED", attempts: 1, error: null });
    expect(repo.rows.get(id)?.processedAt).toBeInstanceOf(Date);
  });

  it("MED-07: tiền tố lạ (`abc`) → IGNORED, không handler nào chạy", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle });
    const id = await seed(repo, { roomName: "abc" });
    await expect(processor.process(id)).resolves.toBe("IGNORED");
    expect(handle).not.toHaveBeenCalled();
    expect(repo.rows.get(id)?.status).toBe("IGNORED");
  });

  it("idempotent: xử lý lần 2 một sự kiện đã PROCESSED/IGNORED → SKIPPED, handler KHÔNG chạy lại (MED-05)", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle });
    const id = await seed(repo);
    await processor.process(id);
    await expect(processor.process(id)).resolves.toBe("SKIPPED");
    expect(handle).toHaveBeenCalledTimes(1);
    expect(repo.rows.get(id)?.attempts).toBe(1);
  });

  it("handler lỗi → FAILED + error (cắt 300 ký tự) + ném lại để BullMQ retry; retry thành công → PROCESSED, xoá error", async () => {
    const handle = jest.fn().mockRejectedValueOnce(new Error("x".repeat(500))).mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle });
    const id = await seed(repo);

    await expect(processor.process(id)).rejects.toThrow();
    expect(repo.rows.get(id)).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(repo.rows.get(id)?.error).toHaveLength(300);

    // Lần retry của job: trạng thái FAILED vẫn được chạy (be.md ghi "≠ RECEIVED thì bỏ qua" sẽ làm mọi retry vô dụng).
    await expect(processor.process(id)).resolves.toBe("PROCESSED");
    expect(repo.rows.get(id)).toMatchObject({ status: "PROCESSED", attempts: 2, error: null });
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("không ghi được trạng thái FAILED (DB lỗi) → vẫn ném lỗi GỐC của handler", async () => {
    registerLiveKitHandler({ roomKind: "call", types: ["participant_joined"], handle: () => Promise.reject(new Error("lỗi nghiệp vụ")) });
    const id = await seed(repo);
    repo.failMarkFailedWith = new Error("mongo down");
    await expect(processor.process(id)).rejects.toThrow("lỗi nghiệp vụ");
  });

  it("bản ghi đã bị dọn / thuộc provider khác → SKIPPED (không ném)", async () => {
    await expect(processor.process("khong-ton-tai")).resolves.toBe("SKIPPED");
    const id = await seed(repo);
    repo.rows.get(id)!.provider = "GITHUB";
    await expect(processor.process(id)).resolves.toBe("SKIPPED");
  });

  it("handler `*` cho egress_ended nhận payload egress đầy đủ", async () => {
    const handle = jest.fn().mockResolvedValue("PROCESSED");
    registerLiveKitHandler({ roomKind: "*", types: ["egress_ended"], handle });
    const egress = { egressId: "EG_1", roomName: "meet_x", status: "COMPLETE" as const, startedAt: null, endedAt: null, error: null, files: [{ filename: "a.mp4", location: "s3://a", sizeBytes: 5, durationSeconds: 1 }] };
    const id = await seed(repo, { id: "EV_eg", type: "egress_ended", roomName: "meet_x", participant: null, egress });
    await processor.process(id);
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ egress }));
  });
});
