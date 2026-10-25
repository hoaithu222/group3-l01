import type { ISystemMessagePort, SystemMessagePostInput } from "../../messages/public";
import { WebhookDispatcherService } from "../services/webhook-dispatcher.service";
import { WebhookProcessService } from "../services/webhook-process.service";
import { ADMIN, GITHUB_SECRET, PRIVATE_CHANNEL, githubDelivery, makeHarness, pushPayload, seedGithub, type Harness } from "./support/integration-harness";

class RecordingSystemMessages implements ISystemMessagePort {
  posts: SystemMessagePostInput[] = [];
  private readonly byKey = new Map<string, string>();
  post(input: SystemMessagePostInput): ReturnType<ISystemMessagePort["post"]> {
    // Giống `SystemMessageService`: cùng `dedupeKey` → trả tin cũ, không tạo tin thứ hai.
    if (!this.byKey.has(input.dedupeKey)) {
      this.posts.push(input);
      this.byKey.set(input.dedupeKey, `65000000000000000000${String(this.posts.length).padStart(4, "0")}`);
    }
    return Promise.resolve({ id: this.byKey.get(input.dedupeKey) } as Awaited<ReturnType<ISystemMessagePort["post"]>>);
  }
}

let h: Harness;
let dispatcher: WebhookDispatcherService;
let messages: RecordingSystemMessages;
let processor: WebhookProcessService;

beforeEach(() => {
  h = makeHarness();
  dispatcher = new WebhookDispatcherService(h.deps, "GITHUB");
  messages = new RecordingSystemMessages();
  processor = new WebhookProcessService(h.deps, messages);
});

describe("CW-01 — chữ ký webhook", () => {
  it("chữ ký sai → 401 INT_007, KHÔNG tạo WebhookEvent", async () => {
    await seedGithub(h);
    const req = githubDelivery("push", pushPayload(), "d-1", "sai-secret");
    await expect(dispatcher.receive(req)).rejects.toMatchObject({ statusCode: 401, errorCode: "INT_007" });
    expect(h.events.rows.size).toBe(0);
  });

  it("thiếu header chữ ký / body bị sửa sau khi ký → 401", async () => {
    await seedGithub(h);
    const req = githubDelivery("push", pushPayload(), "d-2");
    const noSig: Record<string, string> = { ...req.headers };
    delete noSig["x-hub-signature-256"];
    await expect(dispatcher.receive({ rawBody: req.rawBody, headers: noSig })).rejects.toMatchObject({ errorCode: "INT_007" });
    const tampered = Buffer.from(req.rawBody.toString("utf8").replace("main", "evil"));
    await expect(dispatcher.receive({ rawBody: tampered, headers: req.headers })).rejects.toMatchObject({ errorCode: "INT_007" });
    expect(h.events.rows.size).toBe(0);
  });
});

describe("CW-02 — giao hàng lặp", () => {
  it("cùng X-GitHub-Delivery gửi 2 lần → 1 WebhookEvent, 1 job, 1 tin hệ thống", async () => {
    await seedGithub(h);
    const req = githubDelivery("push", pushPayload(3), "delivery-42");
    const first = await dispatcher.receive(req);
    const second = await dispatcher.receive(req);
    expect(first).toEqual({ duplicate: false, status: "ACCEPTED" });
    expect(second).toEqual({ duplicate: true, status: "ACCEPTED" });
    expect(h.events.rows.size).toBe(1);
    expect(h.events.outboxRows).toHaveLength(1);
    expect(h.events.outboxRows[0]?.dedupeKey).toBe("wh:github:delivery-42");

    const [row] = [...h.events.rows.values()];
    // Job chạy lại (retry) cũng không đăng tin thứ hai.
    expect(await processor.process(row.id)).toBe("PROCESSED");
    expect(await processor.process(row.id)).toBe("SKIPPED");
    expect(messages.posts).toHaveLength(1);
    const post = messages.posts[0];
    expect(post).toMatchObject({ scopeType: "CHANNEL", systemType: "INTEGRATION", dedupeKey: `int:${row.id}` });
    const payload = post.payload as { title: string; commits: unknown[]; commitCount: number };
    expect(payload.commitCount).toBe(3);
    expect(payload.commits).toHaveLength(3);
    expect(JSON.stringify(post.payload)).not.toContain("@example.com");
    expect(h.events.rows.get(row.id)).toMatchObject({ status: "PROCESSED", messageId: expect.any(String) });
  });
});

describe("INT-09 — admin tắt nhà cung cấp", () => {
  it("webhook mới vẫn được xác thực nhưng ghi IGNORED, không xếp job, không đăng tin", async () => {
    await seedGithub(h);
    h.flags.providers.github = false;
    const res = await dispatcher.receive(githubDelivery("push", pushPayload(), "d-off"));
    expect(res.status).toBe("IGNORED");
    const [row] = [...h.events.rows.values()];
    expect(row).toMatchObject({ status: "IGNORED" });
    expect(h.events.outboxRows).toHaveLength(0);
  });

  it("tắt sau khi đã ghi nhận (job chạy muộn) → job ghi IGNORED, không đăng tin", async () => {
    await seedGithub(h);
    await dispatcher.receive(githubDelivery("push", pushPayload(), "d-late"));
    h.flags.providers.github = false;
    const [row] = [...h.events.rows.values()];
    expect(await processor.process(row.id)).toBe("IGNORED");
    expect(messages.posts).toHaveLength(0);
  });

  it("chữ ký sai vẫn bị từ chối kể cả khi provider tắt", async () => {
    await seedGithub(h);
    h.flags.providers.github = false;
    await expect(dispatcher.receive(githubDelivery("push", pushPayload(), "d-x", `${GITHUB_SECRET}x`))).rejects.toMatchObject({ errorCode: "INT_007" });
  });
});

describe("INT-06 — người cấu hình mất quyền ghi kênh riêng tư đích", () => {
  it("job: integration → ERROR + thông báo OWNER/người cấu hình, sự kiện FAILED, KHÔNG đăng tin", async () => {
    const integration = await seedGithub(h, { targetScopeId: PRIVATE_CHANNEL });
    await dispatcher.receive(githubDelivery("push", pushPayload(), "d-priv"));
    h.access.denyWrite.add(`${ADMIN}:${PRIVATE_CHANNEL}`);
    const [row] = [...h.events.rows.values()];
    expect(await processor.process(row.id)).toBe("FAILED");
    expect(messages.posts).toHaveLength(0);
    expect(await h.integrations.findById(integration.id)).toMatchObject({ status: "ERROR", statusReason: "TARGET_FORBIDDEN" });
    expect(h.notifier.notices).toHaveLength(1);
    expect(h.notifier.notices[0].recipientIds.sort()).toEqual([ADMIN, "650000000000000000000011"].sort());
    // Sự kiện kế tiếp: kết nối không ACTIVE → ghi IGNORED ngay ở dispatcher, không thông báo lặp.
    const next = await dispatcher.receive(githubDelivery("push", pushPayload(), "d-priv-2"));
    expect(next.status).toBe("IGNORED");
    expect(h.notifier.notices).toHaveLength(1);
  });

  it("recheck sau thu hồi quyền (listener) cũng chuyển ERROR", async () => {
    const integration = await seedGithub(h, { targetScopeId: PRIVATE_CHANNEL });
    h.access.denyWrite.add(`${ADMIN}:${PRIVATE_CHANNEL}`);
    const { IntegrationMaintenanceService } = await import("../services/integration-maintenance.service");
    const changed = await new IntegrationMaintenanceService(h.deps).recheckTargets({ scopeType: "CHANNEL", scopeId: PRIVATE_CHANNEL, userIds: [ADMIN] });
    expect(changed).toBe(1);
    expect((await h.integrations.findById(integration.id))?.status).toBe("ERROR");
  });
});

describe("lọc sự kiện", () => {
  it("repo không theo dõi → không ghi log; loại sự kiện tắt → IGNORED", async () => {
    await seedGithub(h, { events: ["pull_request"] });
    const other = pushPayload();
    other.repository = { id: 9999, full_name: "khac/repo" };
    expect((await dispatcher.receive(githubDelivery("push", other, "d-other"))).status).toBe("IGNORED");
    expect(h.events.rows.size).toBe(0);
    expect((await dispatcher.receive(githubDelivery("push", pushPayload(), "d-push"))).status).toBe("IGNORED");
    expect([...h.events.rows.values()][0]).toMatchObject({ status: "IGNORED", summary: expect.stringContaining("push") });
  });
});
