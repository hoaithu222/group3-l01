import type { PortfolioBuild as PrismaBuild } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { PortfolioBuild } from "../entities/portfolio.interface";
import type { BuildReadyInfo, IPortfolioBuildRepository, NewPortfolioBuild } from "./portfolio-build.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

export const toBuild = (r: PrismaBuild): PortfolioBuild => ({
  id: r.id,
  portfolioId: r.portfolioId,
  buildVersion: r.buildVersion,
  status: r.status,
  trigger: r.trigger,
  portfolioVersion: r.portfolioVersion,
  storageKey: r.storageKey ?? null,
  files: [...r.files],
  sizeBytes: r.sizeBytes ?? null,
  error: r.error ?? null,
  createdBy: r.createdBy ?? null,
  createdAt: r.createdAt,
  startedAt: r.startedAt ?? null,
  finishedAt: r.finishedAt ?? null,
  purgedAt: r.purgedAt ?? null,
});

const dbOf = (tx?: TxHandle) => tx ?? prisma;

export class PrismaPortfolioBuildRepository implements IPortfolioBuildRepository {
  async findById(id: string, tx?: TxHandle): Promise<PortfolioBuild | null> {
    const r = await dbOf(tx).portfolioBuild.findUnique({ where: { id } });
    return r ? toBuild(r) : null;
  }

  async find(portfolioId: string, buildVersion: number, tx?: TxHandle): Promise<PortfolioBuild | null> {
    const r = await dbOf(tx).portfolioBuild.findUnique({ where: { portfolioId_buildVersion: { portfolioId, buildVersion } } });
    return r ? toBuild(r) : null;
  }

  async latest(portfolioId: string, tx?: TxHandle): Promise<PortfolioBuild | null> {
    const r = await dbOf(tx).portfolioBuild.findFirst({ where: { portfolioId }, orderBy: { buildVersion: "desc" } });
    return r ? toBuild(r) : null;
  }

  async listByPortfolio(portfolioId: string, tx?: TxHandle): Promise<PortfolioBuild[]> {
    const rows = await dbOf(tx).portfolioBuild.findMany({ where: { portfolioId }, orderBy: { buildVersion: "asc" } });
    return rows.map(toBuild);
  }

  async hasInFlight(portfolioId: string, tx?: TxHandle): Promise<boolean> {
    return (await dbOf(tx).portfolioBuild.count({ where: { portfolioId, status: { in: ["QUEUED", "BUILDING"] } } })) > 0;
  }

  async hasQueued(portfolioId: string, tx?: TxHandle): Promise<boolean> {
    return (await dbOf(tx).portfolioBuild.count({ where: { portfolioId, status: "QUEUED" } })) > 0;
  }

  async create(input: NewPortfolioBuild, tx?: TxHandle): Promise<PortfolioBuild> {
    const r = await mapUnique(`PortfolioBuild:${input.portfolioId}:${input.buildVersion}`, () =>
      dbOf(tx).portfolioBuild.create({
        data: {
          portfolioId: input.portfolioId,
          buildVersion: input.buildVersion,
          trigger: input.trigger,
          portfolioVersion: input.portfolioVersion,
          status: "QUEUED",
          files: [],
          storageKey: null,
          sizeBytes: null,
          error: null,
          createdBy: input.createdBy,
          startedAt: null,
          finishedAt: null,
          purgedAt: null,
        },
      })
    );
    return toBuild(r);
  }

  async claim(id: string, opts: { now: Date; staleBefore: Date }, tx?: TxHandle): Promise<PortfolioBuild | null> {
    const res = await dbOf(tx).portfolioBuild.updateMany({
      where: { id, OR: [{ status: "QUEUED" }, { status: "BUILDING", startedAt: { lt: opts.staleBefore } }] },
      data: { status: "BUILDING", startedAt: opts.now },
    });
    return res.count === 1 ? this.findById(id, tx) : null;
  }

  async markReady(id: string, info: BuildReadyInfo, at: Date, tx?: TxHandle): Promise<boolean> {
    const res = await dbOf(tx).portfolioBuild.updateMany({
      where: { id, status: "BUILDING" },
      data: { status: "READY", storageKey: info.storageKey, files: { set: info.files }, sizeBytes: info.sizeBytes, error: null, finishedAt: at },
    });
    return res.count === 1;
  }

  async markFailed(id: string, error: string, at: Date, tx?: TxHandle): Promise<boolean> {
    const res = await dbOf(tx).portfolioBuild.updateMany({ where: { id, status: { in: ["QUEUED", "BUILDING"] } }, data: { status: "FAILED", error, finishedAt: at } });
    return res.count === 1;
  }

  async failInFlight(portfolioId: string, error: string, at: Date, tx?: TxHandle): Promise<number> {
    const res = await dbOf(tx).portfolioBuild.updateMany({ where: { portfolioId, status: { in: ["QUEUED", "BUILDING"] } }, data: { status: "FAILED", error, finishedAt: at } });
    return res.count;
  }

  async findStale(opts: { buildingBefore: Date; queuedBefore: Date }, limit: number): Promise<PortfolioBuild[]> {
    const rows = await prisma.portfolioBuild.findMany({
      where: { OR: [{ status: "BUILDING", startedAt: { lt: opts.buildingBefore } }, { status: "QUEUED", createdAt: { lt: opts.queuedBefore } }] },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(toBuild);
  }

  async markPurged(id: string, at: Date, tx?: TxHandle): Promise<void> {
    await dbOf(tx).portfolioBuild.updateMany({ where: { id }, data: { purgedAt: at } });
  }

  async deleteByPortfolio(portfolioId: string, tx?: TxHandle): Promise<number> {
    return (await dbOf(tx).portfolioBuild.deleteMany({ where: { portfolioId } })).count;
  }
}
