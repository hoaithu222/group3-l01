#!/usr/bin/env ts-node
/**
 * ============================================================================
 * BACKFILL ChannelGrant.subjectKey (p3-04, D-28 mục 5)
 * ============================================================================
 *
 * `ChannelGrant` đổi khoá unique từ `[channelId, userId, source]` sang
 * `[channelId, subjectKey, source]` (để một grant theo VAI TRÒ — `userId = null` — vẫn duy nhất
 * trong Mongo). Grant Phase 1 tạo trước khi có `subjectKey` nên thiếu trường này:
 *
 *   - DIRECT (có `userId`)           → `subjectKey = <userId>`
 *   - ROLE   (có `roleRef`, không userId) → `subjectKey = "role:<roleRef>"`
 *
 * PHẢI chạy TRƯỚC `npm run db:push` của lần deploy p3-04: `db push` tạo unique index mới
 * `[channelId, subjectKey, source]` — nhiều doc thiếu `subjectKey` cùng kênh sẽ đụng khoá (null trùng null).
 *
 * Đặc tính:
 *   - IDEMPOTENT: chỉ chạm doc chưa có `subjectKey` (null hoặc vắng); chạy lần 2 không đổi gì.
 *   - CÓ chế độ dry-run: chỉ đếm, không ghi.
 *   - Dùng lệnh Mongo thô (`$runCommandRaw`, update pipeline) vì sau khi đổi schema Prisma coi
 *     `subjectKey` là bắt buộc → đọc doc cũ bằng client có kiểu sẽ lỗi P2032.
 *   - Doc không suy được `subjectKey` (không userId và không phải ROLE hợp lệ) KHÔNG bị sửa, chỉ báo `invalid`.
 *
 * Sử dụng:
 *   npm run db:backfill-grant-subject-key -- --dry-run   # chỉ đếm
 *   npm run db:backfill-grant-subject-key                # ghi thật
 * ============================================================================
 */
import type { PrismaClient } from "@prisma/client";

const COLLECTION = "ChannelGrant";
const ROLE_REFS = ["ADMIN", "MEMBER"] as const;

/** `{ subjectKey: null }` trong Mongo thô khớp CẢ trường vắng lẫn null. */
const MISSING = { subjectKey: null } as const;
const ROLE_QUERY = { ...MISSING, source: "ROLE", roleRef: { $in: [...ROLE_REFS] } } as const;
const DIRECT_QUERY = { ...MISSING, userId: { $ne: null } } as const;

export interface BackfillOptions {
  dryRun?: boolean;
}

export interface BackfillResult {
  dryRun: boolean;
  /** Tổng số grant trong collection. */
  total: number;
  /** Số grant còn thiếu `subjectKey` trước khi chạy. */
  missing: number;
  /** Số grant đã ghi `subjectKey` (0 khi dry-run). */
  updated: number;
  /** Số grant thiếu `subjectKey` nhưng không suy được (giữ nguyên, cần xử lý tay). */
  invalid: number;
}

interface CountResponse {
  n?: number;
}
interface UpdateResponse {
  nModified?: number;
}

async function count(client: PrismaClient, query?: object): Promise<number> {
  const res = (await client.$runCommandRaw({
    count: COLLECTION,
    ...(query && { query }),
  })) as CountResponse;
  return res.n ?? 0;
}

/** Idempotent — export riêng để test gọi trực tiếp (không qua CLI `main()`). */
export async function backfillChannelGrantSubjectKey(
  client: PrismaClient,
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const dryRun = options.dryRun === true;
  const [total, missing, roleCount, directCount] = await Promise.all([
    count(client),
    count(client, MISSING),
    count(client, ROLE_QUERY),
    count(client, DIRECT_QUERY),
  ]);
  // ROLE và DIRECT không giao nhau khi grant hợp lệ (ROLE không có userId); nếu một doc khớp cả hai
  // (dữ liệu lạ) DIRECT thắng vì chạy sau — nên `invalid` chỉ tính phần không khớp cái nào.
  const invalid = Math.max(missing - roleCount - directCount, 0);

  if (dryRun || missing === 0) {
    return { dryRun, total, missing, updated: 0, invalid };
  }

  const res = (await client.$runCommandRaw({
    update: COLLECTION,
    updates: [
      { q: ROLE_QUERY, u: [{ $set: { subjectKey: { $concat: ["role:", "$roleRef"] } } }], multi: true },
      { q: DIRECT_QUERY, u: [{ $set: { subjectKey: { $toString: "$userId" } } }], multi: true },
    ],
  })) as UpdateResponse;

  return { dryRun, total, missing, updated: res.nModified ?? 0, invalid };
}

async function main(): Promise<void> {
  const { PrismaClient: Client } = await import("@prisma/client");
  const client = new Client();
  try {
    const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
    const result = await backfillChannelGrantSubjectKey(client, { dryRun });
    console.log(
      `[backfill-grant-subject-key] ${result.dryRun ? "DRY-RUN — " : ""}Tổng ${result.total} grant, ` +
        `${result.missing} thiếu subjectKey, đã cập nhật ${result.updated}` +
        (result.invalid > 0 ? `, ${result.invalid} KHÔNG suy được (cần xử lý tay)` : "") +
        "."
    );
    if (result.invalid > 0) process.exitCode = 2;
  } finally {
    await client.$disconnect();
  }
}

// Chỉ chạy `main()` khi gọi trực tiếp qua CLI — import từ test không tự chạy.
if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill ChannelGrant.subjectKey thất bại:", err);
    process.exit(1);
  });
}
