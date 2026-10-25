import { z } from "zod";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { registerLiveKitHandler } from "../../../infrastructure/media";
import { logger } from "../../../infrastructure/logger";
import { POMODORO_JOB, POMODORO_QUEUE } from "../entities/pomodoro.interface";
import { getPomodoroContainer } from "../pomodoro.container";

/**
 * Side-effect (import từ `register-jobs.ts`, chạy ở worker): đăng ký processor queue `calls` (`pomodoro.deadline|empty-room|media-sync|host-sync`), cron
 * `pomodoro.reconcile` (mỗi phút, queue `cron`) và handler webhook LiveKit phòng `call_*` cho phiên Pomodoro. Toàn bộ nghiệp vụ nằm ở `PomodoroRunner`
 * (`getPomodoroContainer()`); file này chỉ giải payload rồi gọi. ⛔ KHÔNG tự phát socket ở processor — `PomodoroRunner` → `apply()` → `broadcaster` phát bằng
 * `emitToRoom` (worker có cầu nối socket chung, mọi instance API nhận đúng một lần). Job cũ (version lệch) no-op nhờ CAS nên không cần huỷ job khi đổi phase.
 */
const sessionPayload = z.object({ sessionId: z.string().regex(/^[0-9a-fA-F]{24}$/), version: z.number().int().optional() });
const deadlinePayload = sessionPayload.extend({ version: z.number().int(), phase: z.string() });

function parse<T>(schema: z.ZodType<T>, data: unknown, job: string): T | null {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  logger.warn("[pomodoro] payload job không hợp lệ, bỏ qua", { job });
  return null;
}

registerJob(POMODORO_QUEUE, POMODORO_JOB.deadline, async (job) => {
  const p = parse(deadlinePayload, job.data, POMODORO_JOB.deadline);
  if (p) await getPomodoroContainer().runner.onDeadline(p);
});

registerJob(POMODORO_QUEUE, POMODORO_JOB.emptyRoom, async (job) => {
  const p = parse(deadlinePayload.omit({ phase: true }), job.data, POMODORO_JOB.emptyRoom);
  if (p) await getPomodoroContainer().runner.onEmptyRoomExpired(p);
});

registerJob(POMODORO_QUEUE, POMODORO_JOB.mediaSync, async (job) => {
  const p = parse(sessionPayload, job.data, POMODORO_JOB.mediaSync);
  if (p) await getPomodoroContainer().runner.onMediaSync(p.sessionId);
});

registerJob(POMODORO_QUEUE, POMODORO_JOB.hostSync, async (job) => {
  const p = parse(sessionPayload, job.data, POMODORO_JOB.hostSync);
  if (p) await getPomodoroContainer().runner.onHostSync(p.sessionId);
});

registerJob("cron", POMODORO_JOB.reconcile, async () => {
  await getPomodoroContainer().runner.reconcile();
});

// Quét mỗi phút (tick TĨNH — ⛔ không tạo scheduler theo-thực-thể: `syncCronSchedulers()` xoá scheduler không có trong registry tĩnh).
defineCron({ schedulerId: "pomodoro.reconcile", queue: "cron", jobName: POMODORO_JOB.reconcile, pattern: "* * * * *", opts: { attempts: 1 } });

registerLiveKitHandler({
  name: "p5-02.pomodoro",
  roomKind: "call",
  types: ["participant_joined", "participant_left", "room_finished"],
  handle: (event) => getPomodoroContainer().livekit.handle(event),
});
