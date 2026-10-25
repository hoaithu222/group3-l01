import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import { reasonSchema } from "../../../shared/dto/common-schemas";
import type { z } from "zod";
import type {
  CreateSetDto,
  DuplicateSetDto,
  ListSetsQueryDto,
  PatchSetDto,
  PopularTagsQueryDto,
  ReportSetDto,
} from "../dtos";
import type { StudySetDuplicateService } from "../services/study-set-duplicate.service";
import type { StudySetListService } from "../services/study-set-list.service";
import type { StudySetModerationService } from "../services/study-set-moderation.service";
import type { StudySetReportService } from "../services/study-report.service";
import type { StudySetService } from "../services/study-set.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export interface StudySetControllerDeps {
  sets: StudySetService;
  lists: StudySetListService;
  duplicates: StudySetDuplicateService;
  reports: StudySetReportService;
  moderation: StudySetModerationService;
}

export function createStudySetController(s: StudySetControllerDeps) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await s.lists.list(requireUser(req), req.query as unknown as ListSetsQueryDto), "Danh sách bộ học");
  });

  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.sets.create(requireUser(req), req.body as CreateSetDto), "Đã tạo bộ học", 201);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.sets.get(requireUser(req), req.params.id));
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.sets.patch(requireUser(req), req.params.id, req.body as PatchSetDto), "Đã cập nhật bộ học");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await s.sets.remove(requireUser(req), req.params.id);
    res.status(204).send();
  });

  const duplicate = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.duplicates.duplicate(requireUser(req), req.params.id, req.body as DuplicateSetDto), "Đã nhân bản bộ học", 201);
  });

  /** Báo cáo lần đầu → 201; báo cáo lặp (idempotent theo người × bộ) → 200 `alreadyReported: true`. */
  const report = catchAsync(async (req: Request, res: Response) => {
    const result = await s.reports.report(requireUser(req), req.params.id, req.body as ReportSetDto);
    ResponseUtils.success(res, result, result.alreadyReported ? "Bạn đã báo cáo bộ học này" : "Đã gửi báo cáo", result.alreadyReported ? 200 : 201);
  });

  const hide = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    ResponseUtils.success(res, await s.moderation.hide(requireUser(req), req.params.id, reason), "Đã ẩn bộ học");
  });

  const unhide = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    ResponseUtils.success(res, await s.moderation.unhide(requireUser(req), req.params.id, reason), "Đã khôi phục bộ học");
  });

  const popularTags = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.lists.popularTags(requireUser(req), req.query as unknown as PopularTagsQueryDto));
  });

  return { list, create, get, patch, remove, duplicate, report, hide, unhide, popularTags };
}
