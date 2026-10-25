import { createHash } from "node:crypto";
import { mediaErrors, type NormalizedLiveKitEvent } from "../../../infrastructure/media";
import { livekitWebhookTotal } from "../../../infrastructure/metrics";
import { LiveKitWebhookService, metricType } from "../livekit-webhook.service";
import { FakeLiveKitEventQueue, InMemoryWebhookEventRepository } from "./support/webhooks-test-support";

const event = (over: Partial<NormalizedLiveKitEvent> = {}): NormalizedLiveKitEvent => ({
  id: "EV_1",
  type: "participant_joined",
  roomName: "call_abc",
  createdAt: "2026-09-21T00:00:00.000Z",
  room: { sid: "RM_1", numParticipants: 1 },
  participant: { identity: "u1", sid: "PA_1", state: "ACTIVE", joinedAt: null },
  track: null,
  egress: null,
  ...over,
});

const RAW = Buffer.from('{"event":"participant_joined","id":"EV_1"}');

async function metric(type: string, result: string): Promise<number> {
  const { values } = await livekitWebhookTotal.get();
  return values.find((v) => v.labels.type === type && v.labels.result === result)?.value ?? 0;
}

function setup(verify = jest.fn().mockResolvedValue(event())) {
  const repo = new InMemoryWebhookEventRepository();
  const queue = new FakeLiveKitEventQueue();
  return { repo, queue, verify, service: new LiveKitWebhookService({ repo, queue, verify }) };
}

describe("LiveKitWebhookService.receive", () => {
  it("ghi WebhookEvent RECEIVED (hash sha256 của raw body, payload rút gọn) rồi xếp đúng 1 job", async () => {
    const { repo, queue, service } = setup();
    const before = await metric("participant_joined", "accepted");

    await expect(service.receive(RAW, "jwt")).resolves.toEqual({ duplicate: false });

    expect(repo.rows.size).toBe(1);
    const [row] = [...repo.rows.values()];
    expect(row).toMatchObject({
      provider: "LIVEKIT",
      eventId: "EV_1",
      type: "participant_joined",
      roomName: "call_abc",
      status: "RECEIVED",
      error: null,
      attempts: 0,
      processedAt: null,
      payloadHash: createHash("sha256").update(RAW).digest("hex"),
    });
    // payload rút gọn: không chứa body thô, không tên/metadata
    expect(row?.payload).toMatchObject({ v: 1, room: { sid: "RM_1" }, participant: { identity: "u1" } });
    expect(JSON.stringify(row?.payload)).not.toContain("participant_joined\",\"id");
    expect(queue.enqueued).toEqual([{ webhookEventId: row?.id, eventId: "EV_1" }]);
    expect(await metric("participant_joined", "accepted")).toBe(before + 1);
  });

  it("MED-05: cùng event.id gửi 2 lần → 1 bản ghi, 1 job, cả hai lần đều thành công", async () => {
    const { repo, queue, service } = setup();
    const dupBefore = await metric("participant_joined", "duplicate");
    await expect(service.receive(RAW, "jwt")).resolves.toEqual({ duplicate: false });
    await expect(service.receive(RAW, "jwt")).resolves.toEqual({ duplicate: true });
    await expect(service.receive(RAW, "jwt")).resolves.toEqual({ duplicate: true });
    expect(repo.rows.size).toBe(1);
    expect(queue.enqueued).toHaveLength(1);
    expect(await metric("participant_joined", "duplicate")).toBe(dupBefore + 2);
  });

  it("MED-04: chữ ký sai → ném MEDIA_002, KHÔNG tạo WebhookEvent, KHÔNG xếp job, đếm invalid", async () => {
    const { repo, queue, service } = setup(jest.fn().mockRejectedValue(mediaErrors.invalidSignature()));
    const before = await metric("unknown", "invalid");
    await expect(service.receive(RAW, "bad")).rejects.toMatchObject({ errorCode: "MEDIA_002", statusCode: 401 });
    expect(repo.rows.size).toBe(0);
    expect(queue.enqueued).toHaveLength(0);
    expect(await metric("unknown", "invalid")).toBe(before + 1);
  });

  it("chưa cấu hình LiveKit (MEDIA_001) → ném nguyên lỗi, đếm error (không phải invalid)", async () => {
    const { repo, service } = setup(jest.fn().mockRejectedValue(mediaErrors.notConfigured()));
    const before = await metric("unknown", "error");
    await expect(service.receive(RAW, "x")).rejects.toMatchObject({ errorCode: "MEDIA_001" });
    expect(repo.rows.size).toBe(0);
    expect(await metric("unknown", "error")).toBe(before + 1);
  });

  it("MED-06: DB lỗi khi ghi → ném lỗi (500 để LiveKit retry), không 200 giả, không xếp job", async () => {
    const { repo, queue, service } = setup();
    repo.failCreateWith = new Error("mongo down");
    const before = await metric("participant_joined", "error");
    await expect(service.receive(RAW, "jwt")).rejects.toThrow("mongo down");
    expect(queue.enqueued).toHaveLength(0);
    expect(await metric("participant_joined", "error")).toBe(before + 1);
  });

  it("xếp job lỗi/hết hạn (queue trả false) → VẪN thành công; bản ghi ở lại RECEIVED cho webhook.sweep", async () => {
    const { repo, queue, service } = setup();
    queue.ok = false;
    await expect(service.receive(RAW, "jwt")).resolves.toEqual({ duplicate: false });
    expect([...repo.rows.values()][0]?.status).toBe("RECEIVED");
  });

  it("nhận lại sau khi xếp job lỗi (LiveKit retry) → coi như trùng, không tạo bản ghi thứ hai", async () => {
    const { repo, queue, service } = setup();
    queue.ok = false;
    await service.receive(RAW, "jwt");
    queue.ok = true;
    await expect(service.receive(RAW, "jwt")).resolves.toEqual({ duplicate: true });
    expect(repo.rows.size).toBe(1);
  });

  it("loại sự kiện lạ → nhãn metric 'other' (chống bùng nổ cardinality)", async () => {
    const { service } = setup(jest.fn().mockResolvedValue(event({ id: "EV_9", type: "some_new_event" })));
    const before = await metric("other", "accepted");
    await service.receive(RAW, "jwt");
    expect(await metric("other", "accepted")).toBe(before + 1);
    expect(metricType("egress_ended")).toBe("egress_ended");
    expect(metricType("x".repeat(500))).toBe("other");
    expect(metricType(undefined)).toBe("unknown");
  });
});
