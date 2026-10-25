/* eslint-disable @typescript-eslint/require-await -- bản in-memory cài đặt interface bất đồng bộ */
import { newObjectId } from "../../../core/utils/object-id";
import type { SlugReservation } from "../entities/portfolio.interface";
import type { IPortfolioSlugReservationRepository, ReservationInput } from "./portfolio-slug-reservation.repository.interface";

export class InMemoryPortfolioSlugReservationRepository implements IPortfolioSlugReservationRepository {
  readonly rows = new Map<string, SlugReservation>();
  now: () => Date = () => new Date();

  async findByKey(slugKey: string): Promise<SlugReservation | null> {
    const r = this.rows.get(slugKey);
    return r ? { ...r } : null;
  }

  async upsert(input: ReservationInput): Promise<SlugReservation> {
    const cur = this.rows.get(input.slugKey);
    const row: SlugReservation = cur
      ? { ...cur, portfolioId: input.portfolioId, redirectTo: input.redirectTo, expiresAt: input.expiresAt }
      : { id: newObjectId(), slugKey: input.slugKey, portfolioId: input.portfolioId, redirectTo: input.redirectTo, expiresAt: input.expiresAt, createdAt: this.now() };
    this.rows.set(row.slugKey, row);
    return { ...row };
  }

  async redirectAll(portfolioId: string, redirectTo: string | null): Promise<number> {
    let n = 0;
    for (const r of this.rows.values()) {
      if (r.portfolioId === portfolioId && r.redirectTo !== null) {
        r.redirectTo = redirectTo;
        n += 1;
      }
    }
    return n;
  }

  async deleteByKey(slugKey: string): Promise<boolean> {
    return this.rows.delete(slugKey);
  }

  async deleteExpired(now: Date, limit: number): Promise<string[]> {
    const keys = [...this.rows.values()].filter((r) => r.expiresAt < now).slice(0, limit).map((r) => r.slugKey);
    keys.forEach((k) => this.rows.delete(k));
    return keys;
  }
}
