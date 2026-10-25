/**
 * Barrel CÔNG KHAI của `contribution` cho module khác (ngoại lệ có chủ đích của luật "không import chéo module", `architecture.md`). Module Phase 6
 * (p6-07 portfolio, p6-08 recruiter board) nhận `ContributionReadPort` — KIỂU nằm ở `shared/ports/contribution-read.port.ts`, nên chúng chỉ cần import
 * kiểu đó và được truyền bản cài đặt này lúc nối dây; KHÔNG import `contribution/services/*`.
 */
import type { ContributionReadPort } from "../../shared/ports/contribution-read.port";
import { getContributionContainer } from "./contribution.container";

export type { ContributionReadPort, ContributionMemberScore, ContributionCareerScore } from "../../shared/ports/contribution-read.port";

/** `memberScore(workspaceId, userId)` / `careerScore(userId)` trên snapshot `ALL` — chỉ đọc. */
export function createContributionReadPort(): ContributionReadPort {
  return getContributionContainer().read;
}
