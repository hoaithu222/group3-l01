import { registerScopeResolver } from "../../../core/permission";
import type { Action, ResolvedAccess } from "../../../core/permission";
import { companyActionsFor } from "../domain/state-machines";
import type { RecruiterDeps } from "./recruiter.deps";

const INVISIBLE: ResolvedAccess = { visible: false, role: null, actions: new Set() };

/**
 * Resolver scope `COMPANY` (be.md §4 "companyScope"/§5 — kế hoạch đặt ở `core/permission/scopes/company.resolver.ts`; `core` KHÔNG được import dữ liệu module nên đăng ký từ module
 * `recruiter`, mẫu `documents`/`projects`). Chỉ nhân sự ACTIVE của công ty thấy scope này; người khác (kể cả `admin`/`manager` vận hành) → không thấy → 404 trung tính (CR-44).
 * `role` = `OWNER | RECRUITER`; action theo trạng thái công ty (`companyActionsFor`). Mọi đổi trạng thái/thành viên → `permissionService.bumpVersion({ COMPANY, id })` để cache mọi thành viên
 * vô hiệu ngay (CR-41). Đăng ký ở CẢ API lẫn worker (job `job-offer.*` dùng `permissionService`).
 */
export function registerCompanyScopeResolver(d: Pick<RecruiterDeps, "companies" | "members">): void {
  registerScopeResolver({
    type: "COMPANY",
    async resolve(user, companyId): Promise<ResolvedAccess> {
      const member = await d.members.findByCompanyUser(companyId, user.id);
      if (!member || member.status !== "ACTIVE") return INVISIBLE;
      const company = await d.companies.findById(companyId);
      if (!company) return INVISIBLE;
      return { visible: true, role: member.role, actions: new Set<Action>(companyActionsFor(company.status, member.role)) };
    },
  });
}
