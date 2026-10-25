/* eslint-disable @typescript-eslint/require-await -- bản in-memory cài đặt interface bất đồng bộ */
import { newObjectId } from "../../../core/utils/object-id";
import type { Portfolio } from "../entities/portfolio.interface";
import type { IPortfolioRepository, NewPortfolio, ProfilePatch, PublishMarkResult } from "./portfolio.repository.interface";
import { UniqueViolationError } from "./tx";

const copy = (p: Portfolio): Portfolio => ({
  ...p,
  links: p.links.map((l) => ({ ...l })),
  theme: { ...p.theme },
  sections: p.sections.map((s) => ({ ...s })),
});

export class InMemoryPortfolioRepository implements IPortfolioRepository {
  readonly rows = new Map<string, Portfolio>();
  now: () => Date = () => new Date();

  async findById(id: string): Promise<Portfolio | null> {
    const r = this.rows.get(id);
    return r ? copy(r) : null;
  }

  async findByUserId(userId: string): Promise<Portfolio | null> {
    const r = [...this.rows.values()].find((p) => p.userId === userId);
    return r ? copy(r) : null;
  }

  async findBySlugKey(slugKey: string): Promise<Portfolio | null> {
    const r = [...this.rows.values()].find((p) => p.slugKey === slugKey);
    return r ? copy(r) : null;
  }

  async create(input: NewPortfolio): Promise<Portfolio> {
    for (const p of this.rows.values()) {
      if (p.slugKey === input.slug) throw new UniqueViolationError("Portfolio:slugKey");
      if (p.userId === input.userId) throw new UniqueViolationError("Portfolio:userId");
    }
    const at = this.now();
    const row: Portfolio = {
      id: newObjectId(),
      userId: input.userId,
      slug: input.slug,
      slugKey: input.slug,
      displayName: input.displayName,
      headline: input.headline,
      bio: input.bio,
      avatarAssetId: input.avatarAssetId,
      links: input.links.map((l) => ({ ...l })),
      theme: { ...input.theme },
      sections: input.sections.map((s) => ({ ...s })),
      seoIndexable: input.seoIndexable,
      status: "DRAFT",
      currentBuildVersion: null,
      nextBuildVersion: 1,
      publishedAt: null,
      unpublishedAt: null,
      takenDownAt: null,
      takenDownBy: null,
      takedownReason: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.set(row.id, row);
    return copy(row);
  }

  async updateProfile(id: string, expectedVersion: number, patch: ProfilePatch): Promise<Portfolio | null> {
    const r = this.rows.get(id);
    if (!r || r.version !== expectedVersion) return null;
    if (patch.displayName !== undefined) r.displayName = patch.displayName;
    if (patch.headline !== undefined) r.headline = patch.headline;
    if (patch.bio !== undefined) r.bio = patch.bio;
    if (patch.avatarAssetId !== undefined) r.avatarAssetId = patch.avatarAssetId;
    if (patch.links !== undefined) r.links = patch.links.map((l) => ({ ...l }));
    if (patch.theme !== undefined) r.theme = { ...patch.theme };
    if (patch.sections !== undefined) r.sections = patch.sections.map((s) => ({ ...s }));
    if (patch.seoIndexable !== undefined) r.seoIndexable = patch.seoIndexable;
    r.version += 1;
    r.updatedAt = this.now();
    return copy(r);
  }

  async changeSlug(id: string, expectedVersion: number, slug: string): Promise<Portfolio | null> {
    const r = this.rows.get(id);
    if (!r || r.version !== expectedVersion) return null;
    if ([...this.rows.values()].some((p) => p.id !== id && p.slugKey === slug)) throw new UniqueViolationError("Portfolio:slugKey");
    r.slug = slug;
    r.slugKey = slug;
    r.version += 1;
    r.updatedAt = this.now();
    return copy(r);
  }

  async reserveBuildVersion(id: string, opts: { expectedVersion?: number }): Promise<number | null> {
    const r = this.rows.get(id);
    if (!r || r.takenDownAt || (opts.expectedVersion !== undefined && r.version !== opts.expectedVersion)) return null;
    r.nextBuildVersion += 1;
    return r.nextBuildVersion - 1;
  }

  async markPublished(id: string, buildVersion: number, at: Date): Promise<PublishMarkResult> {
    const r = this.rows.get(id);
    if (!r) return { applied: false, reason: "NOT_FOUND", wasPublished: false, previousBuildVersion: null };
    const wasPublished = r.status === "PUBLISHED";
    const previousBuildVersion = r.currentBuildVersion;
    if (r.takenDownAt) return { applied: false, reason: "TAKEN_DOWN", wasPublished, previousBuildVersion };
    if (previousBuildVersion !== null && previousBuildVersion >= buildVersion) return { applied: false, reason: "NEWER_BUILD", wasPublished, previousBuildVersion };
    r.status = "PUBLISHED";
    r.currentBuildVersion = buildVersion;
    r.publishedAt = wasPublished ? (r.publishedAt ?? at) : at;
    r.unpublishedAt = null;
    return { applied: true, wasPublished, previousBuildVersion };
  }

  async markUnpublished(id: string, at: Date): Promise<Portfolio | null> {
    const r = this.rows.get(id);
    if (!r || r.status !== "PUBLISHED") return null;
    r.status = "UNPUBLISHED";
    r.unpublishedAt = at;
    return copy(r);
  }

  async setTakedown(id: string, by: string, reason: string, at: Date): Promise<Portfolio | null> {
    const r = this.rows.get(id);
    if (!r || r.takenDownAt) return null;
    if (r.status === "PUBLISHED") {
      r.status = "UNPUBLISHED";
      r.unpublishedAt = at;
    }
    Object.assign(r, { takenDownAt: at, takenDownBy: by, takedownReason: reason });
    return copy(r);
  }

  async clearTakedown(id: string): Promise<Portfolio | null> {
    const r = this.rows.get(id);
    if (!r || !r.takenDownAt) return null;
    Object.assign(r, { takenDownAt: null, takenDownBy: null, takedownReason: null });
    return copy(r);
  }

  async touch(id: string, at: Date): Promise<void> {
    const r = this.rows.get(id);
    if (r) r.updatedAt = at;
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}
