import { VersionConflictError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { MentorEndReason, MentorEngagement, MentorEngagementStatus } from "../entities/mentor.interface";
import type { EndDto, ExtendDto } from "../dtos";
import { mentorErrors } from "../mentor.errors";
import type { MentorDeps } from "./mentor.deps";
import { assertWorkspaceAdmin } from "./mentor-access";
import { endedEvent } from "./mentor-events";
import { loadLookups, toEngagementDto, type MentorEngagementDto } from "./mentor-presenter";

const DAY_MS = 86_400_000;

/** Đợt cố vấn: danh sách, gia hạn (≤ 90 ngày tổng), kết thúc (nhóm/cố vấn/hệ thống) — be.md §5 "end / expire", "extend". */
export class MentorEngagementsService {
  constructor(private readonly d: MentorDeps) {}

  async listForWorkspace(user: AuthUser, workspaceId: string, status?: MentorEngagementStatus): Promise<MentorEngagementDto[]> {
    await assertWorkspaceAdmin(this.d.access, user, workspaceId);
    return this.present(await this.d.engagements.listByWorkspace(workspaceId, status, 100));
  }

  /** `GET /me/mentor/engagements` — các nhóm tôi đang (mặc định) / đã cố vấn. */
  async listMine(user: AuthUser, status: MentorEngagementStatus = "ACTIVE"): Promise<MentorEngagementDto[]> {
    return this.present(await this.d.engagements.listByMentor(user.id, status, 100));
  }

  async extend(user: AuthUser, engagementId: string, dto: ExtendDto): Promise<MentorEngagementDto> {
    const e = await this.require(engagementId);
    await assertWorkspaceAdmin(this.d.access, user, e.workspaceId);
    if (e.status !== "ACTIVE") throw mentorErrors.engagementEnded();
    if (e.version !== dto.expectedVersion) throw new VersionConflictError(e.version);
    const max = LIMITS.mentor.totalDaysMax;
    // IR-24 — tổng thời gian cố vấn (gồm lần đầu + mọi lần gia hạn) ≤ 90 ngày.
    if (e.totalDays + dto.addDays > max) throw mentorErrors.totalDaysExceeded(max, Math.max(0, max - e.totalDays));

    const endsAt = new Date(e.endsAt.getTime() + dto.addDays * DAY_MS);
    await this.d.tx.run(async (tx) => {
      if (!(await this.d.engagements.extend(tx, e.id, dto.expectedVersion, { endsAt, totalDays: e.totalDays + dto.addDays }))) {
        throw new VersionConflictError(e.version);
      }
      // Hạn khách đi theo hạn đợt (quyền mất đúng lúc hết hạn nhờ `ResolvedAccess.expiresAt`).
      if (!(await this.d.membership.updateGuestExpiryInTx(tx, { workspaceId: e.workspaceId, userId: e.mentorId, expiresAt: endsAt }))) {
        throw mentorErrors.engagementEnded();
      }
    });
    await this.d.membership.afterGuestChange({ workspaceId: e.workspaceId, userId: e.mentorId, internal: null });
    await this.d.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: "mentor.engagement-extend",
      targetType: "MentorEngagement",
      targetId: e.id,
      workspaceId: e.workspaceId,
      metadata: { addDays: dto.addDays, endsAt: endsAt.toISOString() },
    });
    return this.presentOne(e.id);
  }

  /** `POST /mentor/engagements/:id/end` — OWNER/ADMIN nhóm (`ENDED_BY_OWNER`) hoặc chính cố vấn (`LEFT_BY_MENTOR`). */
  async endByUser(user: AuthUser, engagementId: string, dto: EndDto): Promise<MentorEngagementDto> {
    const e = await this.require(engagementId);
    const isMentor = e.mentorId === user.id;
    if (!isMentor) await assertWorkspaceAdmin(this.d.access, user, e.workspaceId);
    if (e.status !== "ACTIVE") throw mentorErrors.engagementEnded();
    const reason: MentorEndReason = isMentor ? "LEFT_BY_MENTOR" : "ENDED_BY_OWNER";
    if (!(await this.endInternal(e.id, reason, user.id))) throw mentorErrors.engagementEnded();
    if (!isMentor) {
      await this.d.audit.record({
        actorId: user.id,
        actorRole: user.role,
        action: "mentor.engagement-end",
        targetType: "MentorEngagement",
        targetId: e.id,
        workspaceId: e.workspaceId,
        ...(dto.reason && { reason: dto.reason }),
      });
    }
    return this.presentOne(e.id);
  }

  /**
   * Lõi kết thúc DÙNG CHUNG (người dùng, cron `mentor.expire`, listener thu hồi quyền, quản trị nền tảng): CAS ACTIVE → ENDED, trả một
   * chỗ trên bài (FULFILLED → OPEN nếu chưa hết hạn), outbox `mentor.ended` (thu hồi khách + rời nhóm chat + thông báo). Idempotent:
   * đợt đã kết thúc → `false`, không ghi gì.
   */
  async endInternal(engagementId: string, reason: MentorEndReason, by: string | null): Promise<boolean> {
    const now = this.d.now();
    return this.d.tx.run(async (tx) => {
      const e = await this.d.engagements.findById(engagementId, tx);
      if (!e || e.status !== "ACTIVE") return false;
      if (!(await this.d.engagements.end(tx, e.id, null, { reason, by, at: now }))) return false;
      await this.d.posts.releaseSlot(tx, e.postId, now);
      await this.d.outbox.add(tx, endedEvent(e.id));
      return true;
    });
  }

  private async require(id: string): Promise<MentorEngagement> {
    const e = await this.d.engagements.findById(id);
    if (!e) throw mentorErrors.notFound();
    return e;
  }

  private async presentOne(id: string): Promise<MentorEngagementDto> {
    const [dto] = await this.present([await this.require(id)]);
    return dto;
  }

  private async present(rows: MentorEngagement[]): Promise<MentorEngagementDto[]> {
    const [posts, lookups] = await Promise.all([
      this.d.posts.findByIds([...new Set(rows.map((r) => r.postId))]),
      loadLookups(this.d.directory, rows.map((r) => r.workspaceId), rows.map((r) => r.mentorId)),
    ]);
    const byId = new Map(posts.map((p) => [p.id, p]));
    return rows.map((r) => toEngagementDto(r, byId.get(r.postId), lookups));
  }
}
