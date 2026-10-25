import { Prisma, type Portfolio as PrismaPortfolio } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { Portfolio } from "../entities/portfolio.interface";
import type { IPortfolioRepository, NewPortfolio, ProfilePatch, PublishMarkResult } from "./portfolio.repository.interface";
import { UniqueViolationError, isPrismaUniqueViolation, type TxHandle } from "./tx";

export const toPortfolio = (r: PrismaPortfolio): Portfolio => ({
  id: r.id,
  userId: r.userId,
  slug: r.slug,
  slugKey: r.slugKey,
  displayName: r.displayName,
  headline: r.headline ?? null,
  bio: r.bio ?? null,
  avatarAssetId: r.avatarAssetId ?? null,
  links: r.links.map((l) => ({ label: l.label, url: l.url })),
  theme: { template: r.theme.template, accent: r.theme.accent },
  sections: r.sections.map((s) => ({ kind: s.kind, visible: s.visible, order: s.order })),
  seoIndexable: r.seoIndexable,
  status: r.status,
  currentBuildVersion: r.currentBuildVersion ?? null,
  nextBuildVersion: r.nextBuildVersion,
  publishedAt: r.publishedAt ?? null,
  unpublishedAt: r.unpublishedAt ?? null,
  takenDownAt: r.takenDownAt ?? null,
  takenDownBy: r.takenDownBy ?? null,
  takedownReason: r.takedownReason ?? null,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** P2002 → lỗi miền, phân biệt khoá trùng qua `meta.target` (tên index Prisma chứa tên field). */
function uniqueKey(err: Prisma.PrismaClientKnownRequestError): string {
  return String(err.meta?.["target"] ?? "").includes("slugKey") ? "Portfolio:slugKey" : "Portfolio:userId";
}

const dbOf = (tx?: TxHandle) => tx ?? prisma;

export class PrismaPortfolioRepository implements IPortfolioRepository {
  async findById(id: string, tx?: TxHandle): Promise<Portfolio | null> {
    const r = await dbOf(tx).portfolio.findUnique({ where: { id } });
    return r ? toPortfolio(r) : null;
  }

  async findByUserId(userId: string, tx?: TxHandle): Promise<Portfolio | null> {
    const r = await dbOf(tx).portfolio.findUnique({ where: { userId } });
    return r ? toPortfolio(r) : null;
  }

  async findBySlugKey(slugKey: string, tx?: TxHandle): Promise<Portfolio | null> {
    const r = await dbOf(tx).portfolio.findUnique({ where: { slugKey } });
    return r ? toPortfolio(r) : null;
  }

  async create(input: NewPortfolio, tx?: TxHandle): Promise<Portfolio> {
    try {
      const r = await dbOf(tx).portfolio.create({
        data: {
          userId: input.userId,
          slug: input.slug,
          slugKey: input.slug,
          displayName: input.displayName,
          headline: input.headline,
          bio: input.bio,
          avatarAssetId: input.avatarAssetId,
          links: input.links,
          theme: input.theme,
          sections: input.sections,
          seoIndexable: input.seoIndexable,
          status: "DRAFT",
          // null TƯỜNG MINH cho mọi trường về sau lọc bằng `null` (Prisma-Mongo không khớp field vắng mặt).
          currentBuildVersion: null,
          publishedAt: null,
          unpublishedAt: null,
          takenDownAt: null,
          takenDownBy: null,
          takedownReason: null,
        },
      });
      return toPortfolio(r);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError(uniqueKey(err as Prisma.PrismaClientKnownRequestError));
      throw err;
    }
  }

  async updateProfile(id: string, expectedVersion: number, patch: ProfilePatch, tx?: TxHandle): Promise<Portfolio | null> {
    const db = dbOf(tx);
    const res = await db.portfolio.updateMany({
      where: { id, version: expectedVersion },
      data: {
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.headline !== undefined && { headline: patch.headline }),
        ...(patch.bio !== undefined && { bio: patch.bio }),
        ...(patch.avatarAssetId !== undefined && { avatarAssetId: patch.avatarAssetId }),
        ...(patch.links !== undefined && { links: { set: patch.links } }),
        ...(patch.theme !== undefined && { theme: { set: patch.theme } }),
        ...(patch.sections !== undefined && { sections: { set: patch.sections } }),
        ...(patch.seoIndexable !== undefined && { seoIndexable: patch.seoIndexable }),
        version: { increment: 1 },
      },
    });
    return res.count === 1 ? this.findById(id, tx) : null;
  }

  async changeSlug(id: string, expectedVersion: number, slug: string, tx?: TxHandle): Promise<Portfolio | null> {
    try {
      const res = await dbOf(tx).portfolio.updateMany({ where: { id, version: expectedVersion }, data: { slug, slugKey: slug, version: { increment: 1 } } });
      return res.count === 1 ? this.findById(id, tx) : null;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("Portfolio:slugKey");
      throw err;
    }
  }

  async reserveBuildVersion(id: string, opts: { expectedVersion?: number }, tx?: TxHandle): Promise<number | null> {
    try {
      const r = await dbOf(tx).portfolio.update({
        where: { id, takenDownAt: null, ...(opts.expectedVersion !== undefined && { version: opts.expectedVersion }) },
        data: { nextBuildVersion: { increment: 1 } },
        select: { nextBuildVersion: true },
      });
      return r.nextBuildVersion - 1;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
      throw err;
    }
  }

  async markPublished(id: string, buildVersion: number, at: Date, tx?: TxHandle): Promise<PublishMarkResult> {
    const db = dbOf(tx);
    const cur = await db.portfolio.findUnique({ where: { id }, select: { status: true, currentBuildVersion: true, takenDownAt: true, publishedAt: true } });
    if (!cur) return { applied: false, reason: "NOT_FOUND", wasPublished: false, previousBuildVersion: null };
    const wasPublished = cur.status === "PUBLISHED";
    const previousBuildVersion = cur.currentBuildVersion ?? null;
    if (cur.takenDownAt) return { applied: false, reason: "TAKEN_DOWN", wasPublished, previousBuildVersion };
    if (previousBuildVersion !== null && previousBuildVersion >= buildVersion) return { applied: false, reason: "NEWER_BUILD", wasPublished, previousBuildVersion };
    const res = await db.portfolio.updateMany({
      where: { id, takenDownAt: null, OR: [{ currentBuildVersion: null }, { currentBuildVersion: { lt: buildVersion } }] },
      data: { status: "PUBLISHED", currentBuildVersion: buildVersion, publishedAt: wasPublished ? (cur.publishedAt ?? at) : at, unpublishedAt: null },
    });
    return res.count === 1 ? { applied: true, wasPublished, previousBuildVersion } : { applied: false, reason: "RACE", wasPublished, previousBuildVersion };
  }

  async markUnpublished(id: string, at: Date, tx?: TxHandle): Promise<Portfolio | null> {
    const res = await dbOf(tx).portfolio.updateMany({ where: { id, status: "PUBLISHED" }, data: { status: "UNPUBLISHED", unpublishedAt: at } });
    return res.count === 1 ? this.findById(id, tx) : null;
  }

  async setTakedown(id: string, by: string, reason: string, at: Date, tx?: TxHandle): Promise<Portfolio | null> {
    const db = dbOf(tx);
    const cur = await db.portfolio.findUnique({ where: { id }, select: { status: true } });
    if (!cur) return null;
    const res = await db.portfolio.updateMany({
      where: { id, takenDownAt: null },
      data: {
        takenDownAt: at,
        takenDownBy: by,
        takedownReason: reason,
        // Hồ sơ chưa từng công khai giữ DRAFT; đang công khai → UNPUBLISHED (+ mốc).
        ...(cur.status === "PUBLISHED" && { status: "UNPUBLISHED" as const, unpublishedAt: at }),
      },
    });
    return res.count === 1 ? this.findById(id, tx) : null;
  }

  async clearTakedown(id: string, tx?: TxHandle): Promise<Portfolio | null> {
    const res = await dbOf(tx).portfolio.updateMany({ where: { id, takenDownAt: { not: null } }, data: { takenDownAt: null, takenDownBy: null, takedownReason: null } });
    return res.count === 1 ? this.findById(id, tx) : null;
  }

  async touch(id: string, at: Date, tx?: TxHandle): Promise<void> {
    await dbOf(tx).portfolio.updateMany({ where: { id }, data: { updatedAt: at } });
  }

  async delete(id: string, tx?: TxHandle): Promise<boolean> {
    return (await dbOf(tx).portfolio.deleteMany({ where: { id } })).count === 1;
  }
}
