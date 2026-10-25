/**
 * Barrel của module `burnout` (p7-03 — sức khoẻ học tập / burnout radar; bộ luật, OPT-IN, riêng tư).
 *
 * `registerBurnoutModule()` — side-effect boot, gọi ở CẢ API (`router.ts`) lẫn worker (`worker-registries.ts` + đầu `jobs/burnout.jobs.ts`): đăng ký loại thông báo `wellbeing.alert` (worker cần để giao thông báo/push).
 * `registerBurnoutPresenceCollector()` — CHỈ API (nơi nhận nhịp `presence:heartbeat`): đăng ký listener nhịp `active = true` để ghi khe hoạt động cho người đã bật. Job/cron/sink của worker nạp ở `register-jobs.ts`.
 * `createBurnoutSignalPort()` — cổng cho module khác báo hoạt động của tác giả: sink `task.events` (chính burnout, `services/burnout-task-sink.ts`), `messages` (`events/message.outbox-handlers.ts`, tác giả `message.created`), `study` (`services/sr-review.service.ts`, `sr.reviewed`), `pomodoro` (`services/pomodoro-transition.service.ts`, phiên ENDED).
 */
import type { BurnoutSignalPort } from "../../shared/ports/burnout-signal.port";
import { registerPresenceActiveListener } from "../presence/presence.service";
import { getBurnoutContainer } from "./burnout.container";
import { registerBurnoutNotificationTypes } from "./services/burnout-notification-types";

export function registerBurnoutModule(): void {
  registerBurnoutNotificationTypes();
}

export function registerBurnoutPresenceCollector(): void {
  registerPresenceActiveListener("p7-03.burnout", (userId, at) => getBurnoutContainer().collector.recordActive(userId, at));
}

export function createBurnoutSignalPort(): BurnoutSignalPort {
  return getBurnoutContainer().collector;
}
