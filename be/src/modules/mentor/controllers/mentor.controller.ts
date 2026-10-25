import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import type { MentorContainer } from "../mentor.container";
import type {
  AcceptDto,
  ApplyDto,
  CreatePostDto,
  EndDto,
  ExtendDto,
  ListApplicationsQueryDto,
  ListEngagementsQueryDto,
  ListPostsQueryDto,
  RejectDto,
  ReportPostDto,
  UpdatePostDto,
} from "../dtos";

const me = (req: Request): AuthUser => req.user as AuthUser;

function cursorPage<T>(res: Response, page: { data: T[]; nextCursor: string | null }, limit: number): void {
  ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.nextCursor !== null, limit } });
}

/** Controller Mentor Connect (người dùng) — chỉ parse request → service → `ResponseUtils` (api-patterns.md). */
export function createMentorController(c: MentorContainer) {
  return {
    // ── bài đăng ──
    feed: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as ListPostsQueryDto;
      cursorPage(res, await c.posts.feed(me(req), q), q.limit);
    }),
    detail: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.posts.detail(me(req), req.params.id));
    }),
    create: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.posts.create(me(req), req.params.workspaceId, req.body as CreatePostDto), "Đã đăng bài tìm cố vấn", 201);
    }),
    update: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.posts.update(me(req), req.params.id, req.body as UpdatePostDto), "Đã cập nhật bài");
    }),
    close: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.posts.close(me(req), req.params.id), "Đã đóng bài");
    }),
    workspacePosts: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.posts.listForWorkspace(me(req), req.params.workspaceId));
    }),
    report: catchAsync(async (req: Request, res: Response) => {
      const result = await c.report.report(me(req), req.params.id, req.body as ReportPostDto);
      ResponseUtils.success(res, result, result.alreadyReported ? "Bạn đã báo cáo bài này" : "Đã gửi báo cáo", result.alreadyReported ? 200 : 201);
    }),
    // ── đơn ứng tuyển ──
    apply: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.applications.apply(me(req), req.params.id, req.body as ApplyDto), "Đã gửi đơn ứng tuyển", 201);
    }),
    postApplications: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as ListApplicationsQueryDto;
      cursorPage(res, await c.applications.listForPost(me(req), req.params.id, q), q.limit);
    }),
    myApplications: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as ListApplicationsQueryDto;
      cursorPage(res, await c.applications.listMine(me(req), q.cursor, q.limit), q.limit);
    }),
    accept: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.accept.accept(me(req), req.params.id, req.body as AcceptDto), "Đã chấp nhận cố vấn");
    }),
    reject: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.applications.reject(me(req), req.params.id, req.body as RejectDto), "Đã từ chối đơn");
    }),
    withdraw: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.applications.withdraw(me(req), req.params.id), "Đã rút đơn");
    }),
    // ── đợt cố vấn ──
    workspaceEngagements: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as ListEngagementsQueryDto;
      ResponseUtils.success(res, await c.engagements.listForWorkspace(me(req), req.params.workspaceId, q.status));
    }),
    myEngagements: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as ListEngagementsQueryDto;
      ResponseUtils.success(res, await c.engagements.listMine(me(req), q.status));
    }),
    extend: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.engagements.extend(me(req), req.params.id, req.body as ExtendDto), "Đã gia hạn");
    }),
    end: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.engagements.endByUser(me(req), req.params.id, req.body as EndDto), "Đã kết thúc đợt cố vấn");
    }),
  };
}

/** Controller quản trị nền tảng (`/admin/mentor/*`, `/admin/workspaces/:id/mentor`). */
export function createMentorAdminController(c: MentorContainer) {
  return {
    getPost: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.admin.getPost(req.params.id));
    }),
    hide: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.admin.hide(me(req), req.params.id, (req.body as { reason: string }).reason), "Đã ẩn bài");
    }),
    unhide: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.admin.unhide(me(req), req.params.id, (req.body as { reason: string }).reason), "Đã khôi phục bài");
    }),
    workspace: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.admin.workspaceOverview(req.params.workspaceId));
    }),
    endEngagement: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await c.admin.endEngagement(me(req), req.params.id, (req.body as { reason: string }).reason), "Đã kết thúc đợt cố vấn");
    }),
  };
}
