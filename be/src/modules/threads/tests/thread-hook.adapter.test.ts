/**
 * Unit — `ThreadHookAdapter` (cài đặt port `IThreadHook` của `core/permission`):
 * thin adapter, phải UỶ QUYỀN đúng tham số/kết quả cho `ThreadService` và đăng
 * ký được qua registry (`registerThreadHook`/`getThreadHook`) như
 * `modules/threads/index.ts#registerThreadsModule()` làm lúc boot.
 */
import type { Prisma } from "@prisma/client";
import {
  registerThreadHook,
  getThreadHook,
  resetThreadHook,
  type AssertThreadableInput,
  type IThreadHook,
  type ThreadHookReplyRef,
  type ThreadHookRootRef,
  type ThreadSummaryRef,
} from "../../../core/permission";
import { ThreadHookAdapter, createThreadHookAdapter } from "../services/thread-hook.adapter";
import type { ThreadService } from "../services/thread.service";

const TX = {} as Prisma.TransactionClient;
const ROOT: ThreadHookRootRef = {
  id: "1".repeat(24),
  scopeType: "CHANNEL",
  scopeId: "c".repeat(24),
  authorId: "a".repeat(24),
  threadId: null,
  deletedAt: null,
  kind: "USER",
};
const REPLY: ThreadHookReplyRef = {
  id: "2".repeat(24),
  seq: 3,
  createdAt: new Date(2026, 8, 19),
  authorId: "b".repeat(24),
  workspaceId: "w".repeat(24),
};

function fakeService() {
  const service = {
    summaries: jest.fn(),
    assertThreadable: jest.fn(),
    onReplyCreated: jest.fn(),
    emitThreadUpdated: jest.fn(),
  };
  return { service, adapter: new ThreadHookAdapter(service as unknown as ThreadService) };
}

describe("ThreadHookAdapter", () => {
  afterEach(() => resetThreadHook());

  it("summaries() uỷ quyền nguyên vẹn cho ThreadService (giữ Map kết quả, đúng 1 lần gọi)", async () => {
    const { service, adapter } = fakeService();
    const map = new Map<string, ThreadSummaryRef>([
      [ROOT.id, { threadId: "t".repeat(24), replyCount: 2, lastReplyAt: null, lastReplierIds: [], lastReplySeq: 2 }],
    ]);
    service.summaries.mockResolvedValue(map);

    await expect(adapter.summaries([ROOT.id])).resolves.toBe(map);
    expect(service.summaries).toHaveBeenCalledTimes(1);
    expect(service.summaries).toHaveBeenCalledWith([ROOT.id]);
  });

  it("assertThreadable() uỷ quyền; lỗi từ service (vd MSG_018/019) propagate nguyên vẹn", async () => {
    const { service, adapter } = fakeService();
    const input: AssertThreadableInput = { root: ROOT, replyScopeType: "CHANNEL", replyScopeId: ROOT.scopeId };

    service.assertThreadable.mockResolvedValue(undefined);
    await expect(adapter.assertThreadable(input)).resolves.toBeUndefined();
    expect(service.assertThreadable).toHaveBeenCalledWith(input);

    const boom = new Error("MSG_019");
    service.assertThreadable.mockRejectedValue(boom);
    await expect(adapter.assertThreadable(input)).rejects.toBe(boom);
  });

  it("onReplyCreated() truyền ĐÚNG tx + reply + root cho service và trả nguyên kết quả", async () => {
    const { service, adapter } = fakeService();
    const result = { threadId: "t".repeat(24), isFirstReply: true, parentAuthorId: ROOT.authorId };
    service.onReplyCreated.mockResolvedValue(result);

    await expect(adapter.onReplyCreated(TX, REPLY, ROOT)).resolves.toBe(result);
    expect(service.onReplyCreated).toHaveBeenCalledWith(TX, REPLY, ROOT);
  });

  it("emitThreadUpdated() truyền id TIN GỐC cho service", async () => {
    const { service, adapter } = fakeService();
    service.emitThreadUpdated.mockResolvedValue(undefined);
    await adapter.emitThreadUpdated(ROOT.id);
    expect(service.emitThreadUpdated).toHaveBeenCalledWith(ROOT.id);
  });

  it("createThreadHookAdapter() + registry: chưa đăng ký → getThreadHook()=null; đăng ký rồi → trả đúng adapter", () => {
    expect(getThreadHook()).toBeNull();
    const { service } = fakeService();
    const adapter: IThreadHook = createThreadHookAdapter(service as unknown as ThreadService);
    registerThreadHook(adapter);
    expect(getThreadHook()).toBe(adapter);
    resetThreadHook();
    expect(getThreadHook()).toBeNull();
  });
});
