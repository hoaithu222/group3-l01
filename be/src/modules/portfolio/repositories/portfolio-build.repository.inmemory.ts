/* eslint-disable @typescript-eslint/require-await -- bản in-memory cài đặt interface bất đồng bộ */
import { newObjectId } from "../../../core/utils/object-id";
import type { PortfolioBuild } from "../entities/portfolio.interface";
import type { BuildReadyInfo, IPortfolioBuildRepository, NewPortfolioBuild } from "./portfolio-build.repository.interface";
import { UniqueViolationError } from "./tx";

const copy = (b: PortfolioBuild): PortfolioBuild => ({ ...b, files: [...b.files] });
const inFlight = (b: PortfolioBuild): boolean => b.status === "QUEUED" || b.status === "BUILDING";

export class InMemoryPortfolioBuildRepository implements IPortfolioBuildRepository {
  readonly rows = new Map<string, PortfolioBuild>();
  now: () => Date = () => new Date();

  async findById(id: string): Promise<PortfolioBuild | null> {
    const r = this.rows.get(id);
    return r ? copy(r) : null;
  }

  async find(portfolioId: string, buildVersion: number): Promise<PortfolioBuild | null> {
    const r = [...this.rows.values()].find((b) => b.portfolioId === portfolioId && b.buildVersion === buildVersion);
    return r ? copy(r) : null;
  }

  async latest(portfolioId: string): Promise<PortfolioBuild | null> {
    const all = [...this.rows.values()].filter((b) => b.portfolioId === portfolioId).sort((a, b) => b.buildVersion - a.buildVersion);
    return all[0] ? copy(all[0]) : null;
  }

  async listByPortfolio(portfolioId: string): Promise<PortfolioBuild[]> {
    return [...this.rows.values()].filter((b) => b.portfolioId === portfolioId).sort((a, b) => a.buildVersion - b.buildVersion).map(copy);
  }

  async hasInFlight(portfolioId: string): Promise<boolean> {
    return [...this.rows.values()].some((b) => b.portfolioId === portfolioId && inFlight(b));
  }

  async hasQueued(portfolioId: string): Promise<boolean> {
    return [...this.rows.values()].some((b) => b.portfolioId === portfolioId && b.status === "QUEUED");
  }

  async create(input: NewPortfolioBuild): Promise<PortfolioBuild> {
    if ([...this.rows.values()].some((b) => b.portfolioId === input.portfolioId && b.buildVersion === input.buildVersion)) {
      throw new UniqueViolationError(`PortfolioBuild:${input.portfolioId}:${input.buildVersion}`);
    }
    const row: PortfolioBuild = {
      id: newObjectId(),
      portfolioId: input.portfolioId,
      buildVersion: input.buildVersion,
      status: "QUEUED",
      trigger: input.trigger,
      portfolioVersion: input.portfolioVersion,
      storageKey: null,
      files: [],
      sizeBytes: null,
      error: null,
      createdBy: input.createdBy,
      createdAt: this.now(),
      startedAt: null,
      finishedAt: null,
      purgedAt: null,
    };
    this.rows.set(row.id, row);
    return copy(row);
  }

  async claim(id: string, opts: { now: Date; staleBefore: Date }): Promise<PortfolioBuild | null> {
    const b = this.rows.get(id);
    if (!b) return null;
    const takeable = b.status === "QUEUED" || (b.status === "BUILDING" && b.startedAt !== null && b.startedAt < opts.staleBefore);
    if (!takeable) return null;
    b.status = "BUILDING";
    b.startedAt = opts.now;
    return copy(b);
  }

  async markReady(id: string, info: BuildReadyInfo, at: Date): Promise<boolean> {
    const b = this.rows.get(id);
    if (!b || b.status !== "BUILDING") return false;
    Object.assign(b, { status: "READY", storageKey: info.storageKey, files: [...info.files], sizeBytes: info.sizeBytes, error: null, finishedAt: at });
    return true;
  }

  async markFailed(id: string, error: string, at: Date): Promise<boolean> {
    const b = this.rows.get(id);
    if (!b || !inFlight(b)) return false;
    Object.assign(b, { status: "FAILED", error, finishedAt: at });
    return true;
  }

  async failInFlight(portfolioId: string, error: string, at: Date): Promise<number> {
    let n = 0;
    for (const b of this.rows.values()) {
      if (b.portfolioId === portfolioId && inFlight(b)) {
        Object.assign(b, { status: "FAILED", error, finishedAt: at });
        n += 1;
      }
    }
    return n;
  }

  async findStale(opts: { buildingBefore: Date; queuedBefore: Date }, limit: number): Promise<PortfolioBuild[]> {
    return [...this.rows.values()]
      .filter((b) => (b.status === "BUILDING" && b.startedAt !== null && b.startedAt < opts.buildingBefore) || (b.status === "QUEUED" && b.createdAt < opts.queuedBefore))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map(copy);
  }

  async markPurged(id: string, at: Date): Promise<void> {
    const b = this.rows.get(id);
    if (b) b.purgedAt = at;
  }

  async deleteByPortfolio(portfolioId: string): Promise<number> {
    const ids = [...this.rows.values()].filter((b) => b.portfolioId === portfolioId).map((b) => b.id);
    ids.forEach((id) => this.rows.delete(id));
    return ids.length;
  }
}
