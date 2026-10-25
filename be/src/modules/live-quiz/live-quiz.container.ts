import { createStudyContentReader } from "../study/public";
import { AuditService } from "../audit-log/audit-log.service";
import { QuizCommandBus } from "./realtime/live-quiz.command-bus";
import { SocketQuizEmitter } from "./realtime/live-quiz.emitter";
import { SocketQuizHostPresence } from "./realtime/live-quiz.presence";
import { NodeRedisLiveQuizStore } from "./redis/live-quiz.redis-store";
import { PrismaLiveQuizRepository } from "./repositories/live-quiz.repository.prisma";
import { PermissionQuizWorkspaceAccess, PrismaQuizUserDirectory } from "./repositories/ports";
import { PrismaQuizOutbox, PrismaTxRunner } from "./repositories/tx";
import { LiveQuizService } from "./services/live-quiz.service";

export interface LiveQuizContainer {
  service: LiveQuizService;
  /** Lệnh hẹn giờ (đóng câu/tự chuyển câu/host-timeout): API đặt executor + subscriber ở `registerLiveQuizModule()`; worker chỉ `dispatch`. */
  bus: Pick<QuizCommandBus, "dispatch" | "setExecutor" | "startSubscriber" | "stop">;
}

let instance: LiveQuizContainer | null = null;

/** Wiring mặc định (Prisma + Redis + Socket.IO) — singleton lười, cùng mẫu `gamification.container.ts`; API và job (worker) dùng CHUNG. */
export function getLiveQuizContainer(): LiveQuizContainer {
  if (instance) return instance;
  const bus = new QuizCommandBus();
  const service = new LiveQuizService({
    repo: new PrismaLiveQuizRepository(),
    store: new NodeRedisLiveQuizStore(),
    content: createStudyContentReader(),
    users: new PrismaQuizUserDirectory(),
    workspaces: new PermissionQuizWorkspaceAccess(),
    emitter: new SocketQuizEmitter(),
    tx: new PrismaTxRunner(),
    outbox: new PrismaQuizOutbox(),
    audit: new AuditService(),
    scheduler: bus,
    presence: new SocketQuizHostPresence(),
  });
  instance = { service, bus };
  return instance;
}

/** Test: thay container (deps in-memory) TRƯỚC khi import routes/handler; `null` = quay về wiring mặc định. */
export function setLiveQuizContainerForTests(next: LiveQuizContainer | null): void {
  instance = next;
}
