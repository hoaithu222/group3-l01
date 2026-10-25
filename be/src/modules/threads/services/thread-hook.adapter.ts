import type { Prisma } from "@prisma/client";
import type {
  AssertThreadableInput,
  IThreadHook,
  OnReplyCreatedResult,
  ThreadHookReplyRef,
  ThreadHookRootRef,
  ThreadSummaryRef,
} from "../../../core/permission";
import type { ThreadService } from "./thread.service";

/**
 * Cài đặt port `IThreadHook` (`core/permission/message-hooks.port.ts`) cho
 * `message.service.ts` (p1-04) gọi vào — thin adapter, uỷ quyền toàn bộ
 * nghiệp vụ cho `ThreadService` (giữ `ThreadService` không phụ thuộc kiểu của
 * `core/permission`, dễ test độc lập). `modules/threads/index.ts` gọi
 * `registerThreadHook(createThreadHookAdapter(threadService))` lúc
 * `router.ts` import, giống `registerConversationHooks()`.
 */
export class ThreadHookAdapter implements IThreadHook {
  constructor(private readonly service: ThreadService) {}

  summaries(rootMessageIds: string[]): Promise<Map<string, ThreadSummaryRef>> {
    return this.service.summaries(rootMessageIds);
  }

  assertThreadable(input: AssertThreadableInput): Promise<void> {
    return this.service.assertThreadable(input);
  }

  onReplyCreated(
    tx: Prisma.TransactionClient,
    reply: ThreadHookReplyRef,
    root: ThreadHookRootRef
  ): Promise<OnReplyCreatedResult> {
    return this.service.onReplyCreated(tx, reply, root);
  }

  emitThreadUpdated(rootMessageId: string): Promise<void> {
    return this.service.emitThreadUpdated(rootMessageId);
  }
}

export function createThreadHookAdapter(service: ThreadService): ThreadHookAdapter {
  return new ThreadHookAdapter(service);
}
