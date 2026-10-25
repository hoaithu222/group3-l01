/**
 * Barrel CÔNG KHAI của module `users` (p1-08) — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật "modules KHÔNG
 * import chéo module" (`.claude/rules/architecture.md` "Shared module services"), giống
 * `@modules/assets/public`. `modules/moderation` khoá tài khoản tác giả vi phạm qua đây
 * (`UsersAdminPort.lock`) — KHÔNG import `UserService`/repository của `users` trực tiếp.
 */
import type { UsersAdminPort } from "../../shared/ports/moderation-actions.port";
import type { UserContactLookupPort } from "../../shared/ports/user-contact-lookup.port";
import { AuditService } from "../audit-log/audit-log.service";
import { SessionService } from "../auth/services/session.service";
import { PrismaUserRepository } from "./repositories";
import { UserContactLookupService } from "./services/contact-lookup.service";
import { UserService } from "./services/user.service";

export type { UsersAdminPort } from "../../shared/ports/moderation-actions.port";
export type { ContactMatch, UserContactLookupPort } from "../../shared/ports/user-contact-lookup.port";

/**
 * Cùng DI với `user.routes.ts` (repo Prisma + `SessionService` + `AuditService`): thu hồi session/sinh trắc học, đá socket, ghi audit `user.lock`.
 *
 * `UserService` được dựng LƯỜI ở lần gọi đầu, KHÔNG phải lúc `createUsersAdminPort()` chạy: `moderation.container.ts`
 * gọi hàm này lúc nạp module, và `user.service.ts` → `infrastructure/socket` → … → `moderation.container.ts` là một vòng phụ thuộc;
 * dựng sớm thì `UserService`/`UserAnonymizer` còn "chưa là constructor" (nhiều suite test vỡ khi nạp module).
 */
export function createUsersAdminPort(): UsersAdminPort {
  let service: UserService | null = null;
  const getService = (): UserService =>
    (service ??= new UserService(new PrismaUserRepository(), new SessionService(), new AuditService()));
  return {
    async lock(userId, actorId, reason) {
      await getService().lock(userId, actorId, reason);
    },
  };
}

/**
 * Cổng tra người theo email/số điện thoại (khớp CHÍNH XÁC, tôn trọng riêng tư) cho `members` (thêm thành viên vào nhóm) và
 * `conversations` (chọn người vào nhóm chat) — luật đầy đủ ở `shared/ports/user-contact-lookup.port.ts`.
 */
export function createUserContactLookup(): UserContactLookupPort {
  return new UserContactLookupService();
}
