import type { Request, Response } from "express";
import type { z } from "zod";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { newObjectId } from "../../../core/utils/object-id";
import { ResponseUtils } from "../../../core/utils/response";
import type { reasonSchema } from "../../../shared/dto/common-schemas";
import type {
  AdminBadgesQueryDto,
  AdminLeaderboardQueryDto,
  AdminUserQueryDto,
  CreateBadgeDto,
  LevelConfigDto,
  PatchBadgeDto,
  UpdateXpRuleDto,
  XpAdjustDto,
} from "../dtos";
import type { XpSourceTypeValue } from "../entities/gamification.interface";
import type { BadgeAdminService } from "../services/badge-admin.service";
import type { GamificationAdminService } from "../services/gamification-admin.service";
import type { LeaderboardService } from "../services/leaderboard.service";
import type { LevelConfigService } from "../services/level-config.service";
import type { XpAdjustService } from "../services/xp-adjust.service";
import type { XpRuleService } from "../services/xp-rule.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export interface GamificationAdminDeps {
  rules: XpRuleService;
  badges: BadgeAdminService;
  levels: LevelConfigService;
  leaderboard: LeaderboardService;
  adjust: XpAdjustService;
  admin: GamificationAdminService;
}

/** Quản trị gamification (`gamification:view|update`) — mọi thao tác ghi: `reason` 10–500 + audit (ghi ở service). */
export function createGamificationAdminController(s: GamificationAdminDeps) {
  const listRules = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await s.rules.list(), "Luật điểm kinh nghiệm");
  });

  const updateRule = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion, reason, ...patch } = req.body as UpdateXpRuleDto;
    ResponseUtils.success(res, await s.rules.update(requireUser(req), req.params.sourceType as XpSourceTypeValue, { ...patch, expectedVersion, reason }), "Đã cập nhật luật");
  });

  const listBadges = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.paginated(res, await s.badges.list(req.query as unknown as AdminBadgesQueryDto), "Danh sách huy hiệu");
  });

  const getBadge = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.badges.get(req.params.id), "Huy hiệu");
  });

  const createBadge = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.badges.create(requireUser(req), req.body as CreateBadgeDto), "Đã tạo huy hiệu", 201);
  });

  const patchBadge = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.badges.patch(requireUser(req), req.params.id, req.body as PatchBadgeDto), "Đã cập nhật huy hiệu");
  });

  const previewBadge = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.badges.preview((req.body as { criteria: unknown }).criteria));
  });

  const backfillBadge = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    ResponseUtils.success(res, await s.badges.backfill(requireUser(req), req.params.id, reason), "Đã xếp lịch cấp huy hiệu", 202);
  });

  const revokeBadge = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    await s.badges.revoke(requireUser(req), req.params.id, req.params.badgeId, reason);
    res.status(204).send();
  });

  const getLevels = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await s.levels.view(), "Cấu hình cấp độ");
  });

  const putLevels = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    ResponseUtils.success(res, await s.levels.update(req.body as LevelConfigDto, { id: user.id, role: user.role }), "Đã cập nhật cấu hình cấp độ");
  });

  const leaderboard = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as AdminLeaderboardQueryDto;
    ResponseUtils.success(res, await s.leaderboard.top(requireUser(req).id, q.workspaceId, q.period), "Bảng xếp hạng");
  });

  const userOverview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.admin.userOverview(req.params.id, req.query as unknown as AdminUserQueryDto));
  });

  const adjustXp = catchAsync(async (req: Request, res: Response) => {
    const key = req.header("Idempotency-Key") ?? newObjectId();
    ResponseUtils.success(res, await s.adjust.adjust(requireUser(req), req.params.id, req.body as XpAdjustDto, key), "Đã điều chỉnh điểm kinh nghiệm");
  });

  return { listRules, updateRule, listBadges, getBadge, createBadge, patchBadge, previewBadge, backfillBadge, revokeBadge, getLevels, putLevels, leaderboard, userOverview, adjustXp };
}
