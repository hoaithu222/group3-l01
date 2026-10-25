import { LIMITS } from "../../../core/constants/limits";
import { VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { normalizeSearch } from "../../../core/utils/normalize";
import { nanoid } from "../../../core/utils/nanoid";
import type { StudyContentReader } from "../../study/public";
import { AuditService } from "../../audit-log/audit-log.service";
import { BLOCKS_FORMAT_VERSION, type Block } from "../entities/block.interface";
import type { RoadmapResource } from "../entities/lesson.interface";
import type { RoadmapMediaKindValue } from "../entities/media.interface";
import { roadmapErrors } from "../roadmap.errors";
import { buildLessonContent } from "./content/build-lesson-content";
import { sanitizeSvg } from "./content/svg-sanitize";
import type { RoadmapDeps } from "./roadmap.deps";
import { toChecklistDto, toMediaDto, toPracticeSetSummary, toResourceDto, type MediaDto, type PracticeSetSummaryDto } from "./roadmap.presenter";

export interface CreateLessonInput {
  title: string;
  summary?: string | null;
  durationMinutes?: number | null;
  prerequisites?: string | null;
  bodyMd: string;
  optional: boolean;
}

export interface PatchLessonResourceInput {
  kind: RoadmapResource["kind"];
  group?: string | null;
  title: string;
  url?: string | null;
  assetId?: string | null;
  note?: string | null;
  bodyMd?: string | null;
}

export interface PatchLessonInput {
  title?: string;
  summary?: string | null;
  durationMinutes?: number | null;
  prerequisites?: string | null;
  bodyMd?: string;
  resources?: PatchLessonResourceInput[];
  practiceSetIds?: string[];
  optional?: boolean;
}

export interface AdminLessonDto {
  id: string;
  subjectId: string;
  phaseId: string;
  number: number;
  slug: string;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  objectives: string[];
  bodyMd: string;
  blocks: Block[];
  checklist: ReturnType<typeof toChecklistDto>[];
  resources: ReturnType<typeof toResourceDto>[];
  practiceSetIds: string[];
  practiceSets: PracticeSetSummaryDto[];
  media: MediaDto[];
  optional: boolean;
  published: boolean;
  order: number;
  version: number;
}

type LessonLike = { id: string; subjectId: string; phaseId: string; number: number; slug: string; title: string; summary: string | null; durationMinutes: number | null; prerequisites: string | null; objectives: string[]; bodyMd: string; blocks: Block[]; checklist: { id: string; text: string; group: string | null }[]; resources: RoadmapResource[]; practiceSetIds: string[]; optional: boolean; published: boolean; order: number; version: number };

/** Soạn/sửa/xuất bản buổi học + quản lý hình ảnh — chỉ admin (`roadmap:*`), be.md §5.5. Trả kèm `media[]`/`practiceSets[]`
 * đã resolve trên MỌI phản hồi (không riêng GET) để trình soạn admin luôn có đủ dữ liệu hiển thị mà không cần gọi thêm
 * endpoint media của người học (endpoint đó 404 khi buổi chưa xuất bản — không dùng được lúc đang soạn nháp). */
export class AdminLessonService {
  private readonly audit = new AuditService();

  /** Actor hệ thống chỉ để đọc StudySet PUBLIC (`getViewableSet` không phân biệt danh tính với nội dung công khai — xem `StudySetAccess.resolveWith`). */
  private readonly systemActor: AuthUser = { id: "000000000000000000000000", email: "system@internal" };

  constructor(
    private readonly d: Pick<RoadmapDeps, "subjects" | "phases" | "lessons" | "media" | "assets" | "tx">,
    private readonly studyContent: StudyContentReader
  ) {}

  async get(lessonId: string): Promise<AdminLessonDto> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson) throw roadmapErrors.notFound();
    return this.toDto(lesson);
  }

  /** Danh sách ảnh/tệp — KHÔNG kiểm `published` (khác endpoint người học) vì buổi đang soạn thường còn là bản nháp. */
  async listMedia(lessonId: string): Promise<MediaDto[]> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson) throw roadmapErrors.notFound();
    return (await this.d.media.listByLesson(lessonId)).map(toMediaDto);
  }

  private async toDto(l: LessonLike): Promise<AdminLessonDto> {
    const [mediaRows, practiceSets] = await Promise.all([this.d.media.listByLesson(l.id), this.loadPracticeSets(l.practiceSetIds)]);
    return {
      id: l.id,
      subjectId: l.subjectId,
      phaseId: l.phaseId,
      number: l.number,
      slug: l.slug,
      title: l.title,
      summary: l.summary,
      durationMinutes: l.durationMinutes,
      prerequisites: l.prerequisites,
      objectives: l.objectives,
      bodyMd: l.bodyMd,
      blocks: l.blocks,
      checklist: l.checklist.map(toChecklistDto),
      resources: l.resources.map((r) => toResourceDto(r, null)),
      practiceSetIds: l.practiceSetIds,
      practiceSets,
      media: mediaRows.map(toMediaDto),
      optional: l.optional,
      published: l.published,
      order: l.order,
      version: l.version,
    };
  }

  private async loadPracticeSets(ids: readonly string[]): Promise<PracticeSetSummaryDto[]> {
    if (ids.length === 0) return [];
    const sets = await Promise.all(
      ids.map(async (id) => {
        try {
          return toPracticeSetSummary(await this.studyContent.getViewableSet(this.systemActor, id));
        } catch {
          return null;
        }
      })
    );
    return sets.filter((s): s is PracticeSetSummaryDto => s !== null);
  }

  /**
   * Khử trùng lặp và chỉ nhận bộ MỚI gắn khi là StudySet `PUBLIC` · `ACTIVE` (người học nào cũng mở được) — id lạ/bộ
   * riêng tư/bộ đã ẩn → `RMAP_002` `{ practiceSetIds: [...] }`. Bộ đã gắn từ trước nay bị ẩn vẫn được giữ (không chặn
   * lưu bài vì một thay đổi ngoài tầm tay người soạn); phía người học tự bỏ qua bộ không đọc được.
   */
  private async checkPracticeSetIds(current: readonly string[], next: readonly string[]): Promise<string[]> {
    const ids = [...new Set(next)];
    const known = new Set(current);
    const checks = await Promise.all(ids.filter((id) => !known.has(id)).map(async (id) => ((await this.isLinkableSet(id)) ? null : id)));
    const invalid = checks.filter((id): id is string => id !== null);
    if (invalid.length > 0) throw roadmapErrors.invalidContent({ practiceSetIds: invalid });
    return ids;
  }

  private async isLinkableSet(id: string): Promise<boolean> {
    try {
      const set = await this.studyContent.getViewableSet(this.systemActor, id);
      return set.visibility === "PUBLIC" && set.status === "ACTIVE";
    } catch {
      return false;
    }
  }

  preview(bodyMd: string): { blocks: unknown; objectives: string[]; checklist: unknown[]; resources: unknown[]; warnings: string[] } {
    const built = buildLessonContent(bodyMd, []);
    return { blocks: built.blocks, objectives: built.objectives, checklist: built.checklist.map(toChecklistDto), resources: built.resources.map((r) => toResourceDto(r, null)), warnings: built.warnings };
  }

  async createLesson(actor: AuthUser, phaseId: string, dto: CreateLessonInput): Promise<AdminLessonDto> {
    const phase = await this.d.phases.findById(phaseId);
    if (!phase) throw roadmapErrors.notFound();
    if ((await this.d.lessons.countBySubject(phase.subjectId, false)) >= LIMITS.roadmap.lessonsPerSubjectMax) {
      throw roadmapErrors.limitExceeded("lessons", LIMITS.roadmap.lessonsPerSubjectMax);
    }

    const built = buildLessonContent(dto.bodyMd, []);
    const maxNumber = await this.d.lessons.maxNumber(phase.subjectId);
    const lesson = await this.d.tx.run(async (tx) => {
      const created = await this.d.lessons.create(
        {
          subjectId: phase.subjectId,
          phaseId,
          slug: `${phase.subjectId}-l${nanoid(8)}`,
          number: maxNumber + 1,
          title: dto.title,
          normalizedTitle: normalizeSearch(dto.title),
          summary: dto.summary ?? null,
          durationMinutes: dto.durationMinutes ?? null,
          prerequisites: dto.prerequisites ?? null,
          objectives: built.objectives,
          bodyMd: built.bodyMd,
          blocks: built.blocks,
          checklist: built.checklist,
          resources: built.resources,
          practiceSetIds: [],
          optional: dto.optional,
          order: (maxNumber + 1) * 1024,
          updatedBy: actor.id,
        },
        tx
      );
      const subject = await this.d.subjects.findById(phase.subjectId, tx);
      if (subject) await this.d.subjects.updateIf(phase.subjectId, subject.version, { lessonCount: subject.lessonCount + 1 }, tx);
      await this.d.phases.updateIf(phaseId, phase.version, { lessonCount: phase.lessonCount + 1 }, tx);
      return created;
    });
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-lesson.create", targetType: "RoadmapLesson", targetId: lesson.id });
    return this.toDto(lesson);
  }

  async patchLesson(actor: AuthUser, lessonId: string, expectedVersion: number, dto: PatchLessonInput): Promise<AdminLessonDto> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson) throw roadmapErrors.notFound();

    const patch: Record<string, unknown> = { updatedBy: actor.id };
    if (dto.title !== undefined) {
      patch.title = dto.title;
      patch.normalizedTitle = normalizeSearch(dto.title);
    }
    if (dto.summary !== undefined) patch.summary = dto.summary;
    if (dto.durationMinutes !== undefined) patch.durationMinutes = dto.durationMinutes;
    if (dto.prerequisites !== undefined) patch.prerequisites = dto.prerequisites;
    if (dto.optional !== undefined) patch.optional = dto.optional;
    if (dto.practiceSetIds !== undefined) patch.practiceSetIds = await this.checkPracticeSetIds(lesson.practiceSetIds, dto.practiceSetIds);

    if (dto.bodyMd !== undefined) {
      const media = await this.d.media.listByLesson(lessonId);
      const built = buildLessonContent(dto.bodyMd, media.map((m) => ({ id: m.id, sourcePath: m.sourcePath ?? m.id })));
      patch.bodyMd = built.bodyMd;
      patch.blocks = built.blocks;
      patch.blocksFormat = BLOCKS_FORMAT_VERSION;
      patch.objectives = built.objectives;
      patch.checklist = built.checklist;
      if (dto.resources === undefined) patch.resources = built.resources;
    }
    if (dto.resources !== undefined) {
      patch.resources = dto.resources.map(
        (r, i): RoadmapResource => ({
          id: `r_${nanoid(8)}`,
          kind: r.kind,
          group: r.group ?? null,
          title: r.title,
          url: r.url ?? null,
          assetId: r.assetId ?? null,
          note: r.note ?? null,
          bodyMd: r.bodyMd ?? null,
          order: (i + 1) * 1024,
        })
      );
    }

    const updated = await this.d.lessons.updateIf(lessonId, expectedVersion, patch);
    if (!updated) throw await this.conflict(lessonId);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-lesson.update", targetType: "RoadmapLesson", targetId: lessonId });
    return this.toDto(updated);
  }

  async setPublished(actor: AuthUser, lessonId: string, expectedVersion: number, published: boolean): Promise<AdminLessonDto> {
    const updated = await this.d.lessons.updateIf(lessonId, expectedVersion, { published, updatedBy: actor.id });
    if (!updated) throw await this.conflict(lessonId);
    await this.refreshRequiredCount(updated.subjectId);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: published ? "roadmap-lesson.publish" : "roadmap-lesson.unpublish", targetType: "RoadmapLesson", targetId: lessonId });
    return this.toDto(updated);
  }

  async remove(actor: AuthUser, lessonId: string, expectedVersion: number, reason: string): Promise<void> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson) throw roadmapErrors.notFound();
    await this.d.tx.run(async (tx) => {
      await this.d.lessons.updateIf(lessonId, expectedVersion, { deletedAt: new Date() }, tx);
      const subject = await this.d.subjects.findById(lesson.subjectId, tx);
      if (subject) await this.d.subjects.updateIf(lesson.subjectId, subject.version, { lessonCount: Math.max(0, subject.lessonCount - 1) }, tx);
      const phase = await this.d.phases.findById(lesson.phaseId, tx);
      if (phase) await this.d.phases.updateIf(lesson.phaseId, phase.version, { lessonCount: Math.max(0, phase.lessonCount - 1) }, tx);
    });
    await this.refreshRequiredCount(lesson.subjectId);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-lesson.delete", targetType: "RoadmapLesson", targetId: lessonId, reason });
  }

  async addMedia(actor: AuthUser, lessonId: string, input: { kind: RoadmapMediaKindValue; assetId?: string; svg?: string; group?: string | null; caption?: string | null }): Promise<MediaDto> {
    const lesson = await this.d.lessons.findById(lessonId);
    if (!lesson) throw roadmapErrors.notFound();
    if ((await this.d.media.count(lessonId)) >= LIMITS.roadmap.mediaPerLessonMax) throw roadmapErrors.limitExceeded("media", LIMITS.roadmap.mediaPerLessonMax);

    let svg: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    if (input.kind === "SVG") {
      const sanitized = sanitizeSvg(input.svg ?? "");
      if (!sanitized.svg) throw roadmapErrors.invalidContent(sanitized.warning);
      svg = sanitized.svg;
      width = sanitized.width;
      height = sanitized.height;
    }

    const maxOrder = await this.d.media.maxOrder(lessonId);
    const media = await this.d.tx.run(async (tx) => {
      if (input.kind === "ASSET" && input.assetId) {
        const found = await this.d.assets.get(input.assetId);
        if (!found) throw roadmapErrors.notFound();
        await this.d.assets.attach(tx, { assetIds: [input.assetId], targetType: "ROADMAP_LESSON", targetId: lessonId, actorId: actor.id });
      }
      const created = await this.d.media.create(
        { lessonId, subjectId: lesson.subjectId, kind: input.kind, group: input.group ?? null, caption: input.caption ?? null, svg, assetId: input.kind === "ASSET" ? (input.assetId ?? null) : null, width, height, sourcePath: null, order: (maxOrder ?? 0) + 1024 },
        tx
      );
      await this.d.lessons.overwrite(lessonId, { mediaCount: lesson.mediaCount + 1 }, tx);
      return created;
    });
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-media.create", targetType: "RoadmapMedia", targetId: media.id });
    return toMediaDto(media);
  }

  async patchMedia(actor: AuthUser, mediaId: string, patch: { group?: string | null; caption?: string | null; order?: number }): Promise<MediaDto> {
    const updated = await this.d.media.update(mediaId, patch);
    if (!updated) throw roadmapErrors.notFound();
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-media.update", targetType: "RoadmapMedia", targetId: mediaId });
    return toMediaDto(updated);
  }

  async removeMedia(actor: AuthUser, mediaId: string): Promise<void> {
    const media = await this.d.media.update(mediaId, {});
    if (!media) throw roadmapErrors.notFound();
    await this.d.tx.run(async (tx) => {
      await this.d.media.update(mediaId, { deletedAt: new Date() });
      if (media.assetId) await this.d.assets.detach(tx, { targetType: "ROADMAP_LESSON", targetId: media.lessonId, assetIds: [media.assetId] });
      const lesson = await this.d.lessons.findById(media.lessonId, tx);
      if (lesson) await this.d.lessons.overwrite(media.lessonId, { mediaCount: Math.max(0, lesson.mediaCount - 1) }, tx);
    });
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-media.delete", targetType: "RoadmapMedia", targetId: mediaId });
  }

  /** Đếm lại số buổi bắt buộc đã xuất bản — gọi sau khi publish/unpublish/xoá 1 buổi của môn ĐÃ xuất bản (không CAS: tần suất thấp, admin-only). */
  private async refreshRequiredCount(subjectId: string): Promise<void> {
    const subject = await this.d.subjects.findById(subjectId);
    if (!subject || subject.status !== "PUBLISHED") return;
    const required = (await this.d.lessons.list({ subjectId, publishedOnly: true })).filter((l) => !l.optional).length;
    await this.d.subjects.updateIf(subjectId, subject.version, { requiredLessonCount: required });
  }

  private async conflict(lessonId: string): Promise<Error> {
    const current = await this.d.lessons.findById(lessonId);
    return current ? new VersionConflictError(current.version) : roadmapErrors.notFound();
  }
}
