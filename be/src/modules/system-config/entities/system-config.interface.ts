/** Bản ghi `SystemConfig` (1 document/khoá registry) — be.md p0-07 §2. */
export interface SystemConfigRecord {
  key: string;
  /** Chỉ phần override (partial) — KHÔNG phải bản hợp nhất với default. */
  value: Record<string, unknown>;
  version: number;
  updatedBy: string | null;
  reason: string | null;
  updatedAt: Date;
}
