import { LIMITS } from "../../../core/constants/limits";
import { VersionConflictError } from "../../../core/exceptions";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import { AuditService } from "../../audit-log/audit-log.service";
import type { RoadmapLesson } from "../entities/lesson.interface";
import type { RoadmapPhase, RoadmapSubject, RoadmapSubjectStatusValue, RoadmapUnlockModeValue } from "../entities/subject.interface";
import { roadmapErrors } from "../roadmap.errors";
import type { RoadmapDeps } from "./roadmap.deps";

export interface AdminSubjectRowDto {
  id: string;
  slug: string;
  title: string;
  category: string;
  color: string | null;
  icon: string | null;
  lessonLabel: string;
  status: string;
  phaseCount: number;
  lessonCount: number;
  requiredLessonCount: number;
  order: number;
  version: number;
  updatedAt: string;
}

function toAdminSubjectRow(s: RoadmapSubject): AdminSubjectRowDto {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    category: s.category,
    color: s.color,
    icon: s.icon,
    lessonLabel: s.lessonLabel,
    status: s.status,
    phaseCount: s.phaseCount,
    lessonCount: s.lessonCount,
    requiredLessonCount: s.requiredLessonCount,
    order: s.order,
    version: s.version,
    updatedAt: s.updatedAt.toISOString(),
  };
}

export interface AdminLessonSummaryDto {
  id: string;
  phaseId: string;
  slug: string;
  number: number;
  title: string;
  summary: string | null;
  durationMinutes: number | null;
  optional: boolean;
  published: boolean;
  mediaCount: number;
  order: number;
  version: number;
}

function toAdminLessonSummary(l: RoadmapLesson): AdminLessonSummaryDto {
  return { id: l.id, phaseId: l.phaseId, slug: l.slug, number: l.number, title: l.title, summary: l.summary, durationMinutes: l.durationMinutes, optional: l.optional, published: l.published, mediaCount: l.mediaCount, order: l.order, version: l.version };
}

export interface AdminPhaseDto {
  id: string;
  subjectId: string;
  index: number;
  title: string;
  summary: string | null;
  stageLabel: string | null;
  color: string | null;
  capstone: string | null;
  order: number;
  lessonCount: number;
  version: number;
  lessons: AdminLessonSummaryDto[];
}

function toAdminPhase(p: RoadmapPhase, lessons: readonly RoadmapLesson[]): AdminPhaseDto {
  return {
    id: p.id,
    subjectId: p.subjectId,
    index: p.index,
    title: p.title,
    summary: p.summary,
    stageLabel: p.stageLabel,
    color: p.color,
    capstone: p.capstone,
    order: p.order,
    lessonCount: p.lessonCount,
    version: p.version,
    lessons: lessons.filter((l) => l.phaseId === p.id).sort((a, b) => a.order - b.order).map(toAdminLessonSummary),
  };
}

export interface AdminSubjectDetailDto extends AdminSubjectRowDto {
  description: string | null;
  coverAssetId: string | null;
  defaultStudyDays: number[];
  unlockMode: string;
  sourceRef: string | null;
  phases: AdminPhaseDto[];
}

export interface CreateSubjectInput {
  slug: string;
  title: string;
  description?: string | null;
  category: string;
  color?: string | null;
  icon?: string | null;
  lessonLabel: string;
  defaultStudyDays: number[];
  unlockMode: RoadmapUnlockModeValue;
}

export interface PatchSubjectInput {
  title?: string;
  description?: string | null;
  category?: string;
  color?: string | null;
  icon?: string | null;
  coverAssetId?: string | null;
  lessonLabel?: string;
  defaultStudyDays?: number[];
  unlockMode?: RoadmapUnlockModeValue;
}

/** CRUD + xuất bản môn/tháng học — chỉ admin (`roadmap:*`), mọi ghi kèm audit (be.md §5.5). */
export class AdminSubjectService {
  private readonly audit = new AuditService();

  constructor(private readonly d: Pick<RoadmapDeps, "subjects" | "phases" | "lessons" | "tx">) {}

  async list(filter: { status?: RoadmapSubjectStatusValue; q?: string }): Promise<AdminSubjectRowDto[]> {
    const subjects = await this.d.subjects.list({ status: filter.status ? [filter.status] : undefined, q: filter.q ? normalizeSearch(filter.q) : undefined });
    return subjects.map(toAdminSubjectRow);
  }

  async get(id: string): Promise<AdminSubjectDetailDto> {
    const subject = await this.d.subjects.findById(id);
    if (!subject) throw roadmapErrors.notFound();
    const [phases, lessons] = await Promise.all([this.d.phases.listBySubject(id), this.d.lessons.list({ subjectId: id })]);
    return {
      ...toAdminSubjectRow(subject),
      description: subject.description,
      coverAssetId: subject.coverAssetId,
      defaultStudyDays: subject.defaultStudyDays,
      unlockMode: subject.unlockMode,
      sourceRef: subject.sourceRef,
      phases: phases.sort((a, b) => a.order - b.order).map((p) => toAdminPhase(p, lessons)),
    };
  }

  async create(actor: AuthUser, dto: CreateSubjectInput): Promise<AdminSubjectRowDto> {
    const existing = await this.d.subjects.findBySlugOrId(dto.slug);
    if (existing) throw roadmapErrors.slugTaken();
    if ((await this.d.subjects.count()) >= LIMITS.roadmap.subjectsMax) throw roadmapErrors.limitExceeded("subjects", LIMITS.roadmap.subjectsMax);

    const subject = await this.d.subjects.create({
      slug: dto.slug,
      title: dto.title,
      normalizedTitle: normalizeSearch(dto.title),
      description: dto.description ?? null,
      category: dto.category,
      color: dto.color ?? null,
      icon: dto.icon ?? null,
      lessonLabel: dto.lessonLabel,
      defaultStudyDays: dto.defaultStudyDays,
      unlockMode: dto.unlockMode,
      createdBy: actor.id,
      order: Date.now(),
    });
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-subject.create", targetType: "RoadmapSubject", targetId: subject.id });
    return toAdminSubjectRow(subject);
  }

  async patch(actor: AuthUser, id: string, expectedVersion: number, dto: PatchSubjectInput): Promise<AdminSubjectRowDto> {
    const patch: Record<string, unknown> = { ...dto, updatedBy: actor.id };
    if (dto.title !== undefined) patch.normalizedTitle = normalizeSearch(dto.title);
    const updated = await this.d.subjects.updateIf(id, expectedVersion, patch);
    if (!updated) throw await this.conflict(id);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-subject.update", targetType: "RoadmapSubject", targetId: id });
    return toAdminSubjectRow(updated);
  }

  async publish(actor: AuthUser, id: string, expectedVersion: number): Promise<AdminSubjectRowDto> {
    const publishedCount = await this.d.lessons.countBySubject(id, true);
    if (publishedCount === 0) throw roadmapErrors.noPublishedLessons();
    const updated = await this.d.subjects.updateIf(id, expectedVersion, { status: "PUBLISHED", publishedAt: new Date(), requiredLessonCount: await this.countRequired(id), updatedBy: actor.id });
    if (!updated) throw await this.conflict(id);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-subject.publish", targetType: "RoadmapSubject", targetId: id });
    return toAdminSubjectRow(updated);
  }

  async unpublish(actor: AuthUser, id: string, expectedVersion: number, reason: string): Promise<AdminSubjectRowDto> {
    const updated = await this.d.subjects.updateIf(id, expectedVersion, { status: "DRAFT", updatedBy: actor.id });
    if (!updated) throw await this.conflict(id);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-subject.unpublish", targetType: "RoadmapSubject", targetId: id, reason });
    return toAdminSubjectRow(updated);
  }

  async archive(actor: AuthUser, id: string, expectedVersion: number, reason: string): Promise<AdminSubjectRowDto> {
    const updated = await this.d.subjects.updateIf(id, expectedVersion, { status: "ARCHIVED", archivedAt: new Date(), updatedBy: actor.id });
    if (!updated) throw await this.conflict(id);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-subject.archive", targetType: "RoadmapSubject", targetId: id, reason });
    return toAdminSubjectRow(updated);
  }

  async remove(actor: AuthUser, id: string, expectedVersion: number, reason: string): Promise<void> {
    const updated = await this.d.subjects.updateIf(id, expectedVersion, { deletedAt: new Date(), updatedBy: actor.id });
    if (!updated) throw await this.conflict(id);
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-subject.delete", targetType: "RoadmapSubject", targetId: id, reason });
  }

  async createPhase(actor: AuthUser, subjectId: string, dto: { title: string; summary?: string | null; stageLabel?: string | null; color?: string | null; capstone?: string | null }): Promise<AdminPhaseDto> {
    const subject = await this.d.subjects.findById(subjectId);
    if (!subject) throw roadmapErrors.notFound();
    if ((await this.d.phases.count(subjectId)) >= LIMITS.roadmap.phasesPerSubjectMax) throw roadmapErrors.limitExceeded("phases", LIMITS.roadmap.phasesPerSubjectMax);

    const maxOrder = await this.d.phases.maxOrder(subjectId);
    const maxIndex = await this.d.phases.maxIndex(subjectId);
    const phase = await this.d.tx.run(async (tx) => {
      const created = await this.d.phases.create({ subjectId, index: maxIndex + 1, title: dto.title, summary: dto.summary ?? null, stageLabel: dto.stageLabel ?? null, color: dto.color ?? null, capstone: dto.capstone ?? null, order: (maxOrder ?? 0) + 1024 }, tx);
      await this.d.subjects.updateIf(subjectId, subject.version, { phaseCount: subject.phaseCount + 1 }, tx);
      return created;
    });
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-phase.create", targetType: "RoadmapPhase", targetId: phase.id });
    return toAdminPhase(phase, []);
  }

  async patchPhase(actor: AuthUser, phaseId: string, expectedVersion: number, dto: { title?: string; summary?: string | null; stageLabel?: string | null; color?: string | null; capstone?: string | null }): Promise<AdminPhaseDto> {
    const updated = await this.d.phases.updateIf(phaseId, expectedVersion, dto);
    if (!updated) {
      const current = await this.d.phases.findById(phaseId);
      throw current ? new VersionConflictError(current.version) : roadmapErrors.notFound();
    }
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-phase.update", targetType: "RoadmapPhase", targetId: phaseId });
    return toAdminPhase(updated, []);
  }

  async deletePhase(actor: AuthUser, phaseId: string, reason: string): Promise<void> {
    const phase = await this.d.phases.findById(phaseId);
    if (!phase) throw roadmapErrors.notFound();
    if ((await this.d.lessons.countByPhase(phaseId)) > 0) throw roadmapErrors.phaseHasLessons();
    await this.d.tx.run(async (tx) => {
      await this.d.phases.updateIf(phaseId, phase.version, { deletedAt: new Date() }, tx);
      const subject = await this.d.subjects.findById(phase.subjectId, tx);
      if (subject) await this.d.subjects.updateIf(phase.subjectId, subject.version, { phaseCount: Math.max(0, subject.phaseCount - 1) }, tx);
    });
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap-phase.delete", targetType: "RoadmapPhase", targetId: phaseId, reason });
  }

  async reorder(actor: AuthUser, subjectId: string, expectedVersion: number, dto: { phases: { id: string; order: number }[]; lessons: { id: string; phaseId: string; order: number }[] }): Promise<void> {
    const subject = await this.d.subjects.findById(subjectId);
    if (!subject) throw roadmapErrors.notFound();
    await this.d.tx.run(async (tx) => {
      for (const p of dto.phases) await this.d.phases.updateIf(p.id, (await this.d.phases.findById(p.id, tx))?.version ?? 0, { order: p.order }, tx);
      for (const l of dto.lessons) {
        const current = await this.d.lessons.findById(l.id, tx);
        if (current) await this.d.lessons.updateIf(l.id, current.version, { order: l.order, phaseId: l.phaseId }, tx);
      }
      await this.d.lessons.renumber(subjectId, tx);
      await this.d.subjects.updateIf(subjectId, expectedVersion, {}, tx);
    });
    await this.audit.record({ actorId: actor.id, actorRole: actor.role, action: "roadmap.reorder", targetType: "RoadmapSubject", targetId: subjectId });
  }

  private async countRequired(subjectId: string): Promise<number> {
    const lessons = await this.d.lessons.list({ subjectId, publishedOnly: true });
    return lessons.filter((l) => !l.optional).length;
  }

  private async conflict(id: string): Promise<Error> {
    const current = await this.d.subjects.findById(id);
    return current ? new VersionConflictError(current.version) : roadmapErrors.notFound();
  }
}
