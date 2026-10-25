import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { EnrollDto, PatchEnrollmentDto } from "../dtos/enrollment.dto";
import type { PutProgressDto } from "../dtos/lesson.dto";
import type { EnrollmentService } from "../services/enrollment.service";
import type { LessonService } from "../services/lesson.service";
import type { SubjectQueryService } from "../services/subject-query.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createLearnerController(deps: { subjects: SubjectQueryService; lessons: LessonService; enrollments: EnrollmentService }) {
  const listSubjects = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.subjects.list(requireUser(req)));
  });

  const getSubject = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.subjects.detail(requireUser(req), req.params.idOrSlug));
  });

  const enroll = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as EnrollDto;
    ResponseUtils.success(res, await deps.enrollments.enroll(requireUser(req), req.params.id, dto.startDate, dto.studyDays), "Đã đăng ký lộ trình", 201);
  });

  const patchEnrollment = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as PatchEnrollmentDto;
    ResponseUtils.success(res, await deps.enrollments.patch(requireUser(req), req.params.id, dto.expectedVersion, { studyDays: dto.studyDays, status: dto.status }), "Đã cập nhật");
  });

  const rescheduleEnrollment = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.enrollments.reschedule(requireUser(req), req.params.id), "Đã dời lịch học");
  });

  const today = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.enrollments.today(requireUser(req)));
  });

  const getLesson = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.lessons.getLesson(requireUser(req), req.params.id));
  });

  const listMedia = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.lessons.listMedia(req.params.id));
  });

  const putProgress = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as PutProgressDto;
    ResponseUtils.success(res, await deps.lessons.putProgress(requireUser(req), req.params.id, dto), "Đã lưu tiến độ");
  });

  return { listSubjects, getSubject, enroll, patchEnrollment, rescheduleEnrollment, today, getLesson, listMedia, putProgress };
}
