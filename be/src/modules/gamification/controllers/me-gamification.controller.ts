import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { LeaderboardQueryDto, SeenDto, ShowcaseDto, XpEventsQueryDto } from "../dtos";
import type { GamificationQueryService } from "../services/gamification-query.service";
import type { LeaderboardService } from "../services/leaderboard.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** `/me/gamification*`, `/me/xp-events`, `/badges`, `/me/badges/showcase`, `/workspaces/:id/leaderboard`, `/users/:id/gamification/public` — chỉ ĐỌC/tự chọn hiển thị; KHÔNG có endpoint cấp XP/huy hiệu. */
export function createMeGamificationController(query: GamificationQueryService, leaderboard: LeaderboardService) {
  const me = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.me(requireUser(req).id));
  });

  const seen = catchAsync(async (req: Request, res: Response) => {
    await query.seen(requireUser(req).id, req.body as SeenDto);
    res.status(204).send();
  });

  const xpEvents = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await query.xpEvents(requireUser(req).id, req.query as unknown as XpEventsQueryDto), "Lịch sử điểm kinh nghiệm");
  });

  const catalog = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.catalog(requireUser(req).id), "Danh mục huy hiệu");
  });

  const showcase = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.setShowcase(requireUser(req).id, (req.body as ShowcaseDto).badgeIds), "Đã cập nhật huy hiệu trưng bày");
  });

  const leaderboardOf = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await leaderboard.top(requireUser(req).id, req.params.id, (req.query as unknown as LeaderboardQueryDto).period), "Bảng xếp hạng");
  });

  const publicProfile = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.publicProfile(requireUser(req), req.params.id));
  });

  return { me, seen, xpEvents, catalog, showcase, leaderboard: leaderboardOf, publicProfile };
}
