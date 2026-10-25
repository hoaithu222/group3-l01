import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { ConversationListService } from "../services/conversation-list.service";
import type { GroupConversationService } from "../services/group-conversation.service";
import type {
  CreateGroupDto,
  DissolveDto,
  ListConversationsQueryDto,
  PatchConversationDto,
  PeopleQueryDto,
} from "../dtos";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** be.md §1 — `conversation.controller.ts`: list/get/create group/patch/dissolve/people. */
export function createConversationController(listService: ConversationListService, groupService: GroupConversationService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as ListConversationsQueryDto;
    const { data, nextCursor } = await listService.list(user, query);
    ResponseUtils.cursor(res, { data, meta: { nextCursor, hasMore: nextCursor !== null, limit: query.limit } });
  });

  const people = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as PeopleQueryDto;
    const data = await listService.people(user, query);
    ResponseUtils.success(res, data);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const detail = await groupService.getDetail(user.id, req.params.id);
    ResponseUtils.success(res, detail);
  });

  const createGroup = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const detail = await groupService.create(user, req.body as CreateGroupDto);
    ResponseUtils.success(res, detail, "Tạo nhóm thành công", 201);
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const detail = await groupService.patch(user, req.params.id, req.body as PatchConversationDto);
    ResponseUtils.success(res, detail, "Cập nhật thành công");
  });

  const dissolve = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await groupService.dissolve(user, req.params.id, req.body as DissolveDto);
    ResponseUtils.success(res, result, "Đã giải tán nhóm");
  });

  return { list, people, get, createGroup, patch, dissolve };
}
