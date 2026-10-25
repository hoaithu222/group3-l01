import { getWebhooksContainer } from "../webhooks.container";
import { toStoredPayload } from "../../../infrastructure/media";
import { InMemoryWebhookEventRepository, FakeLiveKitEventQueue } from "./support/webhooks-test-support";

type Processor = () => Promise<unknown>;
const registered = new Map<string, Processor>();
// Mảng thường (không jest.fn): `resetMocks` xoá lịch sử gọi trước mỗi test, còn `defineCron` chỉ chạy 1 lần lúc import.
const crons: Array<Record<string, unknown>> = [];

jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (_queue: string, name: string, fn: Processor) => registered.set(name, fn),
  defineCron: (def: Record<string, unknown>) => crons.push(def),
}));
jest.mock("../webhooks.container", () => ({ getWebhooksContainer: jest.fn() }));

let repo: InMemoryWebhookEventRepository;
let queue: FakeLiveKitEventQueue;

beforeAll(async () => {
  await import("../jobs/webhook-maintenance.jobs");
});
beforeEach(() => {
  repo = new InMemoryWebhookEventRepository();
  queue = new FakeLiveKitEventQueue();
  (getWebhooksContainer as jest.Mock).mockReturnValue({ repo, queue });
});

const payload = JSON.parse(JSON.stringify(toStoredPayload({ id: "x", type: "room_started", roomName: "call_x", createdAt: null, room: null, participant: null, track: null, egress: null }))) as unknown;
async function seed(eventId: string, ageMs: number, status?: "PROCESSED" | "IGNORED" | "FAILED") {
  const row = await repo.create({ provider: "LIVEKIT", eventId, type: "room_started", roomName: "call_x", payloadHash: "h", payload });
  const stored = repo.rows.get(row!.id)!;
  stored.receivedAt = new Date(Date.now() - ageMs);
  if (status) stored.status = status;
  return row!.id;
}

describe("webhook.sweep", () => {
  it("đăng ký cron mỗi phút (queue cron) + prune 03:00", () => {
    expect(crons).toContainEqual(expect.objectContaining({ schedulerId: "webhook.sweep", queue: "cron", pattern: "* * * * *" }));
    expect(crons).toContainEqual(expect.objectContaining({ schedulerId: "webhook.prune", queue: "cron", pattern: "0 3 * * *" }));
  });

  it("đẩy lại RECEIVED quá 60 s bằng requeue; bỏ qua RECEIVED mới, PROCESSED, FAILED", async () => {
    const stale = await seed("EV_stale", 120_000);
    await seed("EV_fresh", 5_000);
    await seed("EV_done", 300_000, "PROCESSED");
    await seed("EV_failed", 300_000, "FAILED");
    await registered.get("webhook.sweep")!();
    expect(queue.requeued).toEqual([{ webhookEventId: stale, eventId: "EV_stale" }]);
  });
});

describe("webhook.prune", () => {
  it("xoá PROCESSED/IGNORED quá 30 ngày; giữ RECEIVED/FAILED cũ (còn cần điều tra) và bản ghi mới", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const oldDone = await seed("EV_old_done", 31 * DAY, "PROCESSED");
    const oldIgnored = await seed("EV_old_ign", 40 * DAY, "IGNORED");
    const oldFailed = await seed("EV_old_fail", 40 * DAY, "FAILED");
    const oldReceived = await seed("EV_old_recv", 40 * DAY);
    const recent = await seed("EV_recent", 5 * DAY, "PROCESSED");
    await registered.get("webhook.prune")!();
    expect([...repo.rows.keys()].sort()).toEqual([oldFailed, oldReceived, recent].sort());
    expect(repo.rows.has(oldDone) || repo.rows.has(oldIgnored)).toBe(false);
  });
});
