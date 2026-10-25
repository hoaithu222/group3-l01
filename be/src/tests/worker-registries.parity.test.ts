/**
 * Parity API ↔ worker (p1-07 be.md §16.1). Worker riêng (`PROCESS_ROLE=worker`, `worker.ts`) KHÔNG import `router.ts`, nên mọi REGISTRY mà job
 * dùng — resolver quyền, `MessageScope`, hook thread/mention/đọc, loại thông báo, listener thu hồi quyền, audience presence… — phải do
 * `registerWorkerRegistries()` dựng. Thiếu một cái ⇒ ở production (api + worker tách) fan-out tin nhắn ra audience rỗng, push coi người nhận
 * mất quyền, `deliver.recipient` không thấy loại thông báo — im lặng, không lỗi. Test này dựng cả hai đường trong module registry TÁCH BIỆT
 * (`jest.isolateModulesAsync`) rồi so: cái gì API có mà worker không có phải nằm trong `API_ONLY` kèm lý do.
 *
 * Thêm registry mới ở API mà job cần → thêm vào `infrastructure/worker-registries.ts`. Thật sự chỉ của API → thêm vào `API_ONLY` bên dưới.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { AssetLinkTarget, AssetScope, ReportTargetType } from "@prisma/client";
import type { ScopeType } from "../core/permission";

jest.setTimeout(240_000);

/** `satisfies` khiến thêm `ScopeType` mới mà quên khai ở đây thành lỗi biên dịch. */
const SCOPE_TYPES = Object.keys({ WORKSPACE: 1, CHANNEL: 1, CONVERSATION: 1, MEETING: 1, CALL: 1, BOARD: 1, DOCUMENT: 1, WHITEBOARD: 1, COMPANY: 1 } satisfies Record<ScopeType, 1>) as ScopeType[];

/** Registry mà CHỈ tiến trình API được có — mỗi mục kèm lý do; mục thừa (worker cũng có, hoặc API không có) làm test đỏ. */
const API_ONLY: Record<string, string> = {
  "assetGate:RESOURCE": "hook của `POST /assets` (scope RESOURCE): chỉ API nhận yêu cầu upload",
  "assetTarget:CONTRIBUTION_EXPORT": "quyền TẢI PDF báo cáo đóng góp (`GET /assets/:id/download`): worker chỉ sinh + gắn tệp, không phục vụ tải",
  "assetGate:LOCATION": "(p6-05) hook của `POST /assets` scope LOCATION (ảnh địa điểm, chỉ `o2o:update`): chỉ API nhận yêu cầu upload",
  "assetTarget:PRINT_ORDER": "(p6-05) quyền ĐỌC tệp in (URL ký `/partner/orders/:id/file`, `GET /assets/:id/url`): worker chỉ đọc storage trực tiếp để đếm trang",
  "assetGate:BADGE": "(p4-03) hook của `POST /assets` scope BADGE (ảnh huy hiệu, chỉ `gamification:update`): chỉ API nhận yêu cầu upload",
  "assetTarget:BADGE_ICON": "(p4-03) quyền ĐỌC ảnh huy hiệu (`GET /assets/:id/url` do người dùng gọi): worker không phục vụ URL",
  "assetGate:DOC": "(p6-01) hook của `POST /assets` scope DOC (ảnh chèn tài liệu: chỉ định dạng ảnh + thành viên nhóm): chỉ API nhận yêu cầu upload",
  "assetTarget:DOCUMENT": "(p6-01) quyền ĐỌC ảnh chèn tài liệu (`GET /assets/:id/url` do người dùng gọi): worker không phục vụ URL",
  "assetGate:WHITEBOARD": "(p6-02) hook của `POST /assets` scope WHITEBOARD (ảnh thu nhỏ bảng trắng: chỉ PNG/WebP + thành viên nhóm): chỉ API nhận yêu cầu upload",
  "assetTarget:WHITEBOARD": "(p6-02) quyền ĐỌC ảnh thu nhỏ bảng trắng (`GET /assets/:id/url` do người dùng gọi): worker không phục vụ URL",
  "assetTarget:COMPANY_LOGO": "(p6-08) quyền ĐỌC logo công ty (URL ký trong danh sách lời mời/hồ sơ công ty do API phục vụ): worker không phục vụ URL",
  "assetTarget:JOB_OFFER": "(p6-08) quyền ĐỌC JD PDF của lời mời (`jdUrl` do API ký): worker không phục vụ URL",
};

async function takeSnapshot(): Promise<string[]> {
  const perm = await import("../core/permission");
  const { listRevokeListenerNames } = await import("../core/permission/revoke-scope");
  const { getMessageScope } = await import("../modules/messages/scope/message-scope.registry");
  const { listNotificationTypes } = await import("../modules/notifications/services/notification-types");
  const { getAssetScopeGate } = await import("../shared/ports/asset-scope-gate.port");
  const { getAssetTargetReadResolver } = await import("../shared/ports/asset-target-access.port");
  const { getReportTargetExtension } = await import("../shared/ports/report.port");
  const { getChannelVoiceActivityReader } = await import("../shared/ports/channel-voice-activity.port");
  const { getMessagePollReader } = await import("../shared/ports/message-poll-reader.port");
  const { presenceRegistrations } = await import("../modules/presence/presence.service");

  const tokens: string[] = [];
  for (const type of SCOPE_TYPES) if (perm.getResolver(type)) tokens.push(`resolver:${type}`);
  for (const scope of ["CHANNEL", "CONVERSATION"] as const) if (getMessageScope(scope)) tokens.push(`messageScope:${scope}`);
  for (const def of listNotificationTypes()) tokens.push(`notificationType:${def.type}`);
  if (perm.getThreadHook()) tokens.push("hook:thread");
  if (perm.getMentionValidator()) tokens.push("hook:mention");
  if (perm.getReadStateReader()) tokens.push("hook:readState");
  if (perm.getReadReceiptPublisher()) tokens.push("hook:readReceipt");
  if (perm.getConversationHooks()) tokens.push("hook:conversation");
  for (const scope of Object.values(AssetScope)) if (getAssetScopeGate(scope)) tokens.push(`assetGate:${scope}`);
  for (const target of Object.values(AssetLinkTarget)) if (getAssetTargetReadResolver(target)) tokens.push(`assetTarget:${target}`);
  for (const target of Object.values(ReportTargetType)) if (getReportTargetExtension(target)) tokens.push(`reportTarget:${target}`);
  if (getChannelVoiceActivityReader()) tokens.push("voiceReader");
  // p7-04: cổng đọc khảo sát cho `MessageView.poll` — worker phát `message:created` của tin khảo sát nên PHẢI có (thiếu ⇒ payload không có `poll`, im lặng).
  if (getMessagePollReader()) tokens.push("hook:pollReader");
  for (const [name, on] of Object.entries(presenceRegistrations())) if (on) tokens.push(`presence:${name}`);
  for (const name of listRevokeListenerNames()) tokens.push(`revokeListener:${name}`);
  return tokens.sort();
}

/** `api` = đúng những gì `server.ts` nạp (`router.ts`); `worker` = đúng thứ tự `worker.ts`: registry rồi job. */
async function bootAs(kind: "api" | "worker"): Promise<string[]> {
  let snapshot: string[] = [];
  await jest.isolateModulesAsync(async () => {
    if (kind === "api") {
      await import("../router");
    } else {
      await (await import("../infrastructure/worker-registries")).registerWorkerRegistries();
      await (await import("../infrastructure/queue/register-jobs")).registerAllJobs();
    }
    snapshot = await takeSnapshot();
  });
  return snapshot;
}

describe("worker riêng boot đủ registry mà job dùng (p1-07 §16.1)", () => {
  let api: string[];
  let worker: string[];

  beforeAll(async () => {
    api = await bootAs("api");
    worker = await bootAs("worker");
  });

  it("phép đo không rỗng (API thật sự dựng các registry cốt lõi)", () => {
    expect(api).toEqual(
      expect.arrayContaining(["resolver:WORKSPACE", "resolver:CHANNEL", "resolver:CONVERSATION", "messageScope:CHANNEL", "messageScope:CONVERSATION", "hook:thread"])
    );
    expect(api.length).toBeGreaterThan(40);
  });

  it("mọi registry API có mà không thuộc API_ONLY đều có ở worker", () => {
    const missing = api.filter((token) => !worker.includes(token) && !(token in API_ONLY));
    expect(missing).toEqual([]);
  });

  it("API_ONLY chỉ chứa mục THẬT SỰ chỉ có ở API (không để mục thừa/lỗi thời)", () => {
    for (const token of Object.keys(API_ONLY)) {
      expect({ token, inApi: api.includes(token), inWorker: worker.includes(token) }).toEqual({ token, inApi: true, inWorker: false });
    }
  });
});

describe("worker.ts nối registry đúng thứ tự", () => {
  const workerSrc = readFileSync(join(__dirname, "..", "worker.ts"), "utf8");
  const registriesSrc = readFileSync(join(__dirname, "..", "infrastructure", "worker-registries.ts"), "utf8");

  it("gọi registerWorkerRegistries() TRƯỚC registerAllJobs()", () => {
    const registries = workerSrc.indexOf("await registerWorkerRegistries()");
    const jobs = workerSrc.indexOf("await registerAllJobs()");
    expect(registries).toBeGreaterThan(-1);
    expect(jobs).toBeGreaterThan(registries);
  });

  it("KHÔNG đăng ký executor/subscriber chỉ dành cho API (live-quiz, pomodoro) — lệnh hẹn giờ phải chạy đúng một lần ở nơi có timer + CAS + fetchSockets", () => {
    expect(registriesSrc).not.toMatch(/register(LiveQuiz|Pomodoro)Module/);
  });
});
