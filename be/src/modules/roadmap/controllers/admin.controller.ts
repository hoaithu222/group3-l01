import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { reasonSchema } from "../../../shared/dto/common-schemas";
import type { z } from "zod";
import type { AdminSubjectsQueryDto, CreatePhaseDto, CreateSubjectDto, PatchPhaseDto, PatchSubjectDto, ReorderDto } from "../dtos/subject.dto";
import type { AddMediaDto, PatchMediaDto } from "../dtos/media.dto";
import type { CreateLessonDto, PatchLessonDto, PreviewDto } from "../dtos/lesson.dto";
import type { AdminLessonService } from "../services/admin-lesson.service";
import type { AdminSubjectService } from "../services/admin-subject.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createAdminRoadmapController(deps: { subjects: AdminSubjectService; lessons: AdminLessonService }) {
  const listSubjects = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as AdminSubjectsQueryDto;
    ResponseUtils.success(res, await deps.subjects.list(q));
  });

  const getSubject = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.subjects.get(req.params.id));
  });

  const createSubject = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.subjects.create(requireUser(req), req.body as CreateSubjectDto), "Đã tạo môn học", 201);
  });

  const patchSubject = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as PatchSubjectDto;
    ResponseUtils.success(res, await deps.subjects.patch(requireUser(req), req.params.id, dto.expectedVersion, dto), "Đã cập nhật");
  });

  const publishSubject = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion } = req.body as { expectedVersion: number };
    ResponseUtils.success(res, await deps.subjects.publish(requireUser(req), req.params.id, expectedVersion), "Đã xuất bản môn học");
  });

  const unpublishSubject = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion, reason } = req.body as z.infer<typeof reasonSchema> & { expectedVersion: number };
    ResponseUtils.success(res, await deps.subjects.unpublish(requireUser(req), req.params.id, expectedVersion, reason), "Đã gỡ xuất bản");
  });

  const archiveSubject = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion, reason } = req.body as z.infer<typeof reasonSchema> & { expectedVersion: number };
    ResponseUtils.success(res, await deps.subjects.archive(requireUser(req), req.params.id, expectedVersion, reason), "Đã lưu trữ");
  });

  const removeSubject = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion, reason } = req.body as z.infer<typeof reasonSchema> & { expectedVersion: number };
    await deps.subjects.remove(requireUser(req), req.params.id, expectedVersion, reason);
    res.status(204).send();
  });

  const createPhase = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.subjects.createPhase(requireUser(req), req.params.id, req.body as CreatePhaseDto), "Đã tạo tháng học", 201);
  });

  const patchPhase = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as PatchPhaseDto;
    ResponseUtils.success(res, await deps.subjects.patchPhase(requireUser(req), req.params.id, dto.expectedVersion, dto), "Đã cập nhật");
  });

  const deletePhase = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    await deps.subjects.deletePhase(requireUser(req), req.params.id, reason);
    res.status(204).send();
  });

  const reorder = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as ReorderDto;
    await deps.subjects.reorder(requireUser(req), req.params.id, dto.expectedVersion, dto);
    ResponseUtils.success(res, await deps.subjects.get(req.params.id), "Đã sắp xếp lại");
  });

  const createLesson = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.lessons.createLesson(requireUser(req), req.params.id, req.body as CreateLessonDto), "Đã tạo buổi học", 201);
  });

  const getLesson = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.lessons.get(req.params.id));
  });

  const listLessonMedia = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.lessons.listMedia(req.params.id));
  });

  const patchLesson = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as PatchLessonDto;
    ResponseUtils.success(res, await deps.lessons.patchLesson(requireUser(req), req.params.id, dto.expectedVersion, dto), "Đã cập nhật");
  });

  const publishLesson = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion } = req.body as { expectedVersion: number };
    ResponseUtils.success(res, await deps.lessons.setPublished(requireUser(req), req.params.id, expectedVersion, true), "Đã xuất bản buổi học");
  });

  const unpublishLesson = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion } = req.body as { expectedVersion: number };
    ResponseUtils.success(res, await deps.lessons.setPublished(requireUser(req), req.params.id, expectedVersion, false), "Đã gỡ xuất bản");
  });

  const removeLesson = catchAsync(async (req: Request, res: Response) => {
    const { expectedVersion, reason } = req.body as z.infer<typeof reasonSchema> & { expectedVersion: number };
    await deps.lessons.remove(requireUser(req), req.params.id, expectedVersion, reason);
    res.status(204).send();
  });

  const preview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, deps.lessons.preview((req.body as PreviewDto).bodyMd));
  });

  const addMedia = catchAsync(async (req: Request, res: Response) => {
    const dto = req.body as AddMediaDto;
    ResponseUtils.success(res, await deps.lessons.addMedia(requireUser(req), req.params.id, dto), "Đã thêm ảnh", 201);
  });

  const patchMedia = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await deps.lessons.patchMedia(requireUser(req), req.params.id, req.body as PatchMediaDto), "Đã cập nhật");
  });

  const removeMedia = catchAsync(async (req: Request, res: Response) => {
    await deps.lessons.removeMedia(requireUser(req), req.params.id);
    res.status(204).send();
  });

  return {
    listSubjects,
    getSubject,
    createSubject,
    patchSubject,
    publishSubject,
    unpublishSubject,
    archiveSubject,
    removeSubject,
    createPhase,
    patchPhase,
    deletePhase,
    reorder,
    createLesson,
    getLesson,
    listLessonMedia,
    patchLesson,
    publishLesson,
    unpublishLesson,
    removeLesson,
    preview,
    addMedia,
    patchMedia,
    removeMedia,
  };
}
