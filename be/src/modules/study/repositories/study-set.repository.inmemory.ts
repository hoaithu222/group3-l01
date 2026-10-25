import type {
  PopularTag,
  StudyOwnerSummary,
  StudySet,
  StudySetAdminListParams,
  StudySetCreateInput,
  StudySetListParams,
  StudySetPatch,
  StudySetUpdateCondition,
} from "../entities/study-set.interface";
import type { IStudySetRepository } from "./study-set.repository.interface";

/** Test — cùng ngữ nghĩa với bản Prisma (CAS `version`, lọc xoá mềm, sắp `updatedAt desc, id desc`). */
export class InMemoryStudySetRepository implements IStudySetRepository {
  readonly sets = new Map<string, StudySet>();
  private clock = 0;
  private seq = 0;

  private tick(): Date {
    this.clock += 1;
    return new Date(Date.UTC(2026, 8, 1, 0, 0, 0) + this.clock * 1000);
  }

  findById(id: string): Promise<StudySet | null> {
    const set = this.sets.get(id);
    return Promise.resolve(set ? { ...set } : null);
  }

  findByIds(ids: string[]): Promise<StudySet[]> {
    return Promise.resolve(ids.flatMap((id) => (this.sets.has(id) ? [{ ...(this.sets.get(id) as StudySet) }] : [])));
  }

  create(input: StudySetCreateInput): Promise<StudySet> {
    this.seq += 1;
    const now = this.tick();
    const set: StudySet = {
      ...input,
      status: "ACTIVE",
      hiddenReason: null,
      hiddenBy: null,
      hiddenAt: null,
      reportedCount: 0,
      copyCount: 0,
      version: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sets.set(set.id, set);
    return Promise.resolve({ ...set });
  }

  updateIf(id: string, cond: StudySetUpdateCondition, patch: StudySetPatch): Promise<StudySet | null> {
    const set = this.sets.get(id);
    if (!set) return Promise.resolve(null);
    if (cond.version !== undefined && set.version !== cond.version) return Promise.resolve(null);
    if (cond.statusIn && !cond.statusIn.includes(set.status)) return Promise.resolve(null);
    for (const [key, value] of Object.entries(patch)) if (value !== undefined) (set as unknown as Record<string, unknown>)[key] = value;
    set.version += 1;
    set.updatedAt = this.tick();
    return Promise.resolve({ ...set });
  }

  list(p: StudySetListParams): Promise<StudySet[]> {
    const rows = [...this.sets.values()].filter((s) => {
      if (s.deletedAt !== null) return false;
      if (p.scope === "mine") {
        if (s.ownerId !== p.viewerId || s.status === "DELETED") return false;
      } else if (p.scope === "workspace") {
        if (s.workspaceId !== p.workspaceId || s.visibility !== "WORKSPACE") return false;
        const ok = s.status === "ACTIVE" || (s.status === "HIDDEN" && (p.includeHidden === true || s.ownerId === p.viewerId));
        if (!ok) return false;
      } else if (s.visibility !== "PUBLIC" || s.status !== "ACTIVE") {
        return false;
      }
      if (p.tag && !s.tags.includes(p.tag)) return false;
      if (p.hasQuiz && s.itemTypesMask <= 1) return false;
      if ((p.terms ?? []).some((t) => !s.normalizedTitle.includes(t))) return false;
      return true;
    });
    rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));
    const after = p.after;
    const paged = after
      ? rows.filter((s) => s.updatedAt.getTime() < after.at.getTime() || (s.updatedAt.getTime() === after.at.getTime() && s.id < after.id))
      : rows;
    return Promise.resolve(paged.slice(0, p.limit).map((s) => ({ ...s })));
  }

  countByOwner(ownerId: string): Promise<number> {
    return Promise.resolve([...this.sets.values()].filter((s) => s.ownerId === ownerId && s.deletedAt === null).length);
  }

  listAdminReported(p: StudySetAdminListParams): Promise<{ rows: StudySet[]; total: number }> {
    const all = [...this.sets.values()]
      .filter((s) => s.visibility === "PUBLIC" && s.deletedAt === null && (p.status ? s.status === p.status : s.status === "ACTIVE" || s.status === "HIDDEN") && s.reportedCount >= p.minReported)
      .sort((a, b) => b.reportedCount - a.reportedCount || b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1));
    const start = (p.page - 1) * p.limit;
    return Promise.resolve({ rows: all.slice(start, start + p.limit).map((s) => ({ ...s })), total: all.length });
  }

  ownerSummary(ownerId: string): Promise<StudyOwnerSummary> {
    const mine = [...this.sets.values()].filter((s) => s.ownerId === ownerId && s.deletedAt === null);
    const count = (pred: (s: StudySet) => boolean) => mine.filter(pred).length;
    return Promise.resolve({
      total: mine.length,
      public: count((s) => s.visibility === "PUBLIC"),
      workspace: count((s) => s.visibility === "WORKSPACE"),
      private: count((s) => s.visibility === "PRIVATE"),
      hidden: count((s) => s.status === "HIDDEN"),
    });
  }

  incCopyCount(id: string): Promise<void> {
    const set = this.sets.get(id);
    if (set) set.copyCount += 1;
    return Promise.resolve();
  }

  setReportedCount(id: string, count: number): Promise<void> {
    const set = this.sets.get(id);
    if (set) set.reportedCount = count;
    return Promise.resolve();
  }

  popularTags(p: { workspaceId?: string; limit: number }): Promise<PopularTag[]> {
    const counts = new Map<string, number>();
    for (const s of this.sets.values()) {
      const inScope = p.workspaceId ? s.workspaceId === p.workspaceId && s.visibility === "WORKSPACE" : s.visibility === "PUBLIC";
      if (!inScope || s.status !== "ACTIVE") continue;
      for (const tag of s.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Promise.resolve(
      [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
        .slice(0, p.limit)
    );
  }
}
