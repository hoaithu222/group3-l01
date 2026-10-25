/**
 * Barrel side-effect của module `threads` (p1-06) — mirror
 * `modules/channels/index.ts`/`modules/conversations/index.ts`. `router.ts`
 * gọi `registerThreadsModule()` NGAY SAU khi import `threads.routes.ts` (side
 * -effect boot, phải chạy trước request đầu tiên chạm `getThreadHook()`).
 */
import { registerThreadHook } from "../../core/permission";
import { threadService } from "./threads.routes";
import { createThreadHookAdapter } from "./services/thread-hook.adapter";

export function registerThreadsModule(): void {
  registerThreadHook(createThreadHookAdapter(threadService));
}
