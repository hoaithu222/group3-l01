#!/usr/bin/env ts-node
/**
 * ============================================================================
 * BACKFILL chuẩn hoá email (User.email → cắt khoảng trắng + chữ thường)
 * ============================================================================
 *
 * (Rà soát luồng auth BE 2026-09-25) DTO, service và repository nay LUÔN chuẩn hoá email
 * (`normalizeEmail` = trim + lowercase) trước khi tra `findByEmail`/tạo tài khoản, vì `User.email`
 * unique nhưng Mongo so khớp PHÂN BIỆT hoa/thường. Hệ quả với dữ liệu cũ: tài khoản đã lưu email có
 * chữ hoa (vd bàn phím điện thoại tự viết hoa chữ đầu → `Foo@x.com`) sẽ KHÔNG đăng nhập được nữa
 * cho tới khi email được chuẩn hoá — chạy script này TRƯỚC/CÙNG lần deploy chứa thay đổi đó.
 *
 * Đặc tính:
 *   - IDEMPOTENT: chỉ chạm tài khoản có email chưa chuẩn hoá; chạy lần 2 không đổi gì.
 *   - CÓ chế độ dry-run: chỉ đếm và liệt kê (kể cả xung đột), KHÔNG ghi.
 *   - XUNG ĐỘT KHÔNG bị sửa: nếu email chuẩn hoá đã thuộc về MỘT TÀI KHOẢN KHÁC (vd `Foo@x.com` và
 *     `foo@x.com` cùng tồn tại — Mongo coi là hai email khác nhau) thì bỏ qua và báo lại để xử lý tay
 *     (gộp/xoá một bản); tự ý ghi đè sẽ vi phạm unique index hoặc gộp nhầm hai người.
 *   - Duyệt theo lô (cursor theo `_id`) nên không nạp cả collection vào bộ nhớ.
 *
 * Sử dụng:
 *   npm run db:backfill-normalize-email -- --dry-run   # chỉ đếm + liệt kê, không ghi
 *   npm run db:backfill-normalize-email                # ghi thật
 *
 * ⚠ Luôn chạy `--dry-run` trước, đọc danh sách xung đột, rồi mới ghi thật. KHÔNG chạy trên DB dùng chung
 * khi chưa có bản sao lưu.
 * ============================================================================
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeEmail } from "../src/core/auth/normalize-email";

export interface NormalizeEmailBackfillOptions {
  dryRun?: boolean;
  /** Số tài khoản đọc mỗi lô (mặc định 500). */
  batchSize?: number;
}

export interface EmailChange {
  id: string;
  from: string;
  to: string;
}

export interface EmailCollision extends EmailChange {
  /** Id tài khoản đang giữ email chuẩn hoá `to`. */
  conflictWith: string;
}

export interface NormalizeEmailBackfillResult {
  dryRun: boolean;
  /** Tổng số tài khoản đã duyệt. */
  scanned: number;
  /** Tài khoản có email chưa chuẩn hoá VÀ đổi được (không xung đột). */
  changes: EmailChange[];
  /** Số tài khoản đã ghi email chuẩn hoá (0 khi dry-run). */
  updated: number;
  /** Tài khoản không đổi được vì email chuẩn hoá đã thuộc tài khoản khác — cần xử lý tay. */
  collisions: EmailCollision[];
  /** Email chuẩn hoá ra chuỗi rỗng (toàn khoảng trắng) — giữ nguyên, cần xử lý tay. */
  invalid: EmailChange[];
}

export async function backfillNormalizeEmails(
  prisma: PrismaClient,
  options: NormalizeEmailBackfillOptions = {}
): Promise<NormalizeEmailBackfillResult> {
  const dryRun = options.dryRun ?? false;
  const batchSize = Math.max(1, options.batchSize ?? 500);
  const result: NormalizeEmailBackfillResult = {
    dryRun,
    scanned: 0,
    changes: [],
    updated: 0,
    collisions: [],
    invalid: [],
  };
  // Email đích đã được "giữ chỗ" trong lượt chạy này (dry-run không ghi nên phải tự nhớ để mô phỏng đúng).
  const claimed = new Map<string, string>();

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.user.findMany({
      select: { id: true, email: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const last = batch[batch.length - 1];
    if (!last) break;
    cursor = last.id;

    for (const user of batch) {
      result.scanned++;
      const target = normalizeEmail(user.email);
      if (target === user.email) continue;
      const change: EmailChange = { id: user.id, from: user.email, to: target };
      if (!target) {
        result.invalid.push(change);
        continue;
      }

      const owner =
        claimed.get(target) ??
        (await prisma.user.findFirst({ where: { email: target, NOT: { id: user.id } }, select: { id: true } }))?.id;
      if (owner && owner !== user.id) {
        result.collisions.push({ ...change, conflictWith: owner });
        continue;
      }

      claimed.set(target, user.id);
      if (dryRun) {
        result.changes.push(change);
        continue;
      }
      try {
        await prisma.user.update({ where: { id: user.id }, data: { email: target } });
        result.changes.push(change);
        result.updated++;
      } catch (err) {
        // Thua đua với một lượt ghi khác cùng email (unique index): coi là xung đột, không dừng cả lượt chạy.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          claimed.delete(target);
          result.collisions.push({ ...change, conflictWith: "(ghi đồng thời)" });
          continue;
        }
        throw err;
      }
    }
  }
  return result;
}

const PRINT_LIMIT = 50;

function printList(title: string, rows: Array<EmailChange & { conflictWith?: string }>): void {
  if (rows.length === 0) return;
  console.log(`\n${title} (${rows.length}):`);
  for (const row of rows.slice(0, PRINT_LIMIT)) {
    console.log(`  ${row.id}  ${JSON.stringify(row.from)} → ${JSON.stringify(row.to)}${row.conflictWith ? `  [trùng với ${row.conflictWith}]` : ""}`);
  }
  if (rows.length > PRINT_LIMIT) console.log(`  … và ${rows.length - PRINT_LIMIT} dòng nữa.`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    console.log(dryRun ? "[DRY-RUN] Chỉ đếm, không ghi." : "Ghi thật — chuẩn hoá email tài khoản.");
    const result = await backfillNormalizeEmails(prisma, { dryRun });
    console.log(`Đã duyệt ${result.scanned} tài khoản.`);
    console.log(
      dryRun
        ? `Sẽ chuẩn hoá ${result.changes.length} email.`
        : `Đã chuẩn hoá ${result.updated}/${result.changes.length} email.`
    );
    printList(dryRun ? "Sẽ đổi" : "Đã đổi", result.changes);
    printList("XUNG ĐỘT — không sửa, cần xử lý tay (email chuẩn hoá đã thuộc tài khoản khác)", result.collisions);
    printList("KHÔNG HỢP LỆ — email rỗng sau khi chuẩn hoá, không sửa", result.invalid);
    if (result.collisions.length > 0 || result.invalid.length > 0) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill thất bại:", err);
    process.exit(1);
  });
}
