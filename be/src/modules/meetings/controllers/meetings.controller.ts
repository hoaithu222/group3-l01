import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type {
  AddAttendeesDto,
  AttendeesQueryDto,
  CancelMeetingDto,
  CreateMeetingDto,
  DeleteMeetingQueryDto,
  MeetingRangeQueryDto,
  RsvpDto,
  SetAttendeeRoleDto,
  TransferHostDto,
  UpdateMeetingDto,
} from "../dtos";
import type { MeetingsContainer } from "../meetings.container";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Controller mỏng: parse request → gọi service → `ResponseUtils` (be.md §4). Mọi DTO do server dựng, `myActions` tính ở service. */
export function createMeetingsController(c: MeetingsContainer) {
  const detail = (user: AuthUser, id: string) => c.query.getDetail(user, id);

  const create = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const meeting = await c.meetings.create(user, req.params.workspaceId, req.body as CreateMeetingDto);
    ResponseUtils.success(res, await detail(user, meeting.id), "Đã tạo cuộc họp", 201);
  });

  const listWorkspace = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.query.listWorkspace(userOf(req), req.params.workspaceId, req.query as unknown as MeetingRangeQueryDto), "Lịch họp của nhóm");
  });

  const listMine = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.query.listMine(userOf(req), req.query as unknown as MeetingRangeQueryDto), "Lịch họp của tôi");
  });

  const resolve = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.query.resolve(userOf(req), req.params.code));
  });

  const getById = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await detail(userOf(req), req.params.meetingId));
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const meeting = await c.meetings.update(user, req.params.meetingId, req.body as UpdateMeetingDto);
    ResponseUtils.success(res, await detail(user, meeting.id), "Đã cập nhật cuộc họp");
  });

  const cancel = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const meeting = await c.meetings.cancel(user, req.params.meetingId, req.body as CancelMeetingDto);
    ResponseUtils.success(res, await detail(user, meeting.id), "Đã huỷ cuộc họp");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await c.meetings.softDelete(userOf(req), req.params.meetingId, req.query as unknown as DeleteMeetingQueryDto);
    res.status(204).send();
  });

  const listAttendees = catchAsync(async (req: Request, res: Response) => {
    const page = await c.query.listAttendees(req.params.meetingId, req.query as unknown as AttendeesQueryDto);
    ResponseUtils.cursor(res, { data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: (req.query as unknown as AttendeesQueryDto).limit } }, "Người tham dự");
  });

  const addAttendees = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.attendees.add(userOf(req), req.params.meetingId, req.body as AddAttendeesDto), "Đã cập nhật danh sách tham dự");
  });

  const leaveSelf = catchAsync(async (req: Request, res: Response) => {
    await c.attendees.leaveSelf(userOf(req), req.params.meetingId);
    res.status(204).send();
  });

  const removeAttendee = catchAsync(async (req: Request, res: Response) => {
    await c.attendees.remove(userOf(req), req.params.meetingId, req.params.userId);
    res.status(204).send();
  });

  const setRole = catchAsync(async (req: Request, res: Response) => {
    const a = await c.attendees.setRole(userOf(req), req.params.meetingId, req.params.userId, (req.body as SetAttendeeRoleDto).role);
    const profile = (await c.deps.dir.getUsers([a.userId])).get(a.userId);
    ResponseUtils.success(res, c.mapper.toAttendee(a, profile), "Đã đổi vai trò");
  });

  const transferHost = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const body = req.body as TransferHostDto;
    const meeting = await c.meetings.transferHost(user, req.params.meetingId, body.toUserId, body.expectedVersion);
    ResponseUtils.success(res, await detail(user, meeting.id), "Đã chuyển quyền chủ trì");
  });

  const rsvp = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.attendees.rsvp(userOf(req), req.params.meetingId, (req.body as RsvpDto).rsvp), "Đã ghi nhận phản hồi");
  });

  /** `.ics` (METHOD:PUBLISH) cho nút "Thêm vào lịch" — trả tệp, không dùng envelope JSON. */
  const ics = catchAsync(async (req: Request, res: Response) => {
    const meeting = await c.deps.repo.findById(req.params.meetingId);
    if (!meeting) {
      const { meetNotFound } = await import("../services/meeting-errors");
      throw meetNotFound();
    }
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="meeting-${meeting.code}.ics"`);
    res.send(c.ics.buildPublish(meeting));
  });

  return { create, listWorkspace, listMine, resolve, getById, update, cancel, remove, listAttendees, addAttendees, leaveSelf, removeAttendee, setRole, transferHost, rsvp, ics };
}
