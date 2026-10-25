/**
 * Barrel của module `live-quiz` (p5-01) — mirror `modules/calls/index.ts`. `router.ts` gọi `registerLiveQuizModule()` ở tiến trình API:
 * đăng ký guard room `quiz:{id}`, bộ thực thi lệnh hẹn giờ (timer trong tiến trình + kênh pub/sub cho job ở worker riêng). Worker chỉ
 * import các file `jobs/*.ts` (qua `register-jobs.ts`) và `dispatch` lệnh — KHÔNG import `router.ts`.
 */
import { getLiveQuizContainer } from "./live-quiz.container";
import { registerLiveQuizRoomGuard } from "./realtime/live-quiz.room-guard";

export interface RegisterLiveQuizOptions {
  /** `false` = không mở subscriber Redis (test tích hợp). Mặc định `true`. */
  subscribe?: boolean;
}

export function registerLiveQuizModule(opts: RegisterLiveQuizOptions = {}): void {
  const { service, bus } = getLiveQuizContainer();
  registerLiveQuizRoomGuard(service);
  bus.setExecutor((cmd) => service.runCommand(cmd));
  if (opts.subscribe !== false) bus.startSubscriber();
}

export { getLiveQuizContainer, setLiveQuizContainerForTests } from "./live-quiz.container";
export type { LiveQuizContainer } from "./live-quiz.container";
