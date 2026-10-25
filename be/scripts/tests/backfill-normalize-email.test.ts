/**
 * Script `db:backfill-normalize-email` (rà soát auth BE 2026-09-25) trên Mongo memory replset (`TEST_DB=memory`):
 * tài khoản cũ có email chữ hoa/khoảng trắng được chuẩn hoá (`trim + lowercase`) để đăng nhập lại được; idempotent; có dry-run
 * (chỉ đếm + liệt kê, KHÔNG ghi); XUNG ĐỘT (email chuẩn hoá đã thuộc tài khoản khác) KHÔNG bị sửa mà được báo lại; duyệt theo lô.
 * Chỉ chạy trên Mongo in-memory — KHÔNG bao giờ trỏ vào Atlas (tự `describe.skip` nếu không có `TEST_DB=memory`).
 */
import { prisma } from "../../src/infrastructure/database";
import { newObjectId } from "../../src/core/utils/object-id";
import { backfillNormalizeEmails } from "../backfill-normalize-email";

// Chốt an toàn: test này GHI/XOÁ dữ liệu — chỉ chạy trên Mongo memory replset của `global-setup` (`TEST_DB=memory`).
const describeMemoryDb = process.env.TEST_DB === "memory" ? describe : describe.skip;
function assertMemoryDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
    throw new Error("Từ chối chạy: DATABASE_URL không phải Mongo memory (loopback) — chạy bằng TEST_DB=memory");
  }
}

describeMemoryDb("backfill-normalize-email (Mongo memory replset)", () => {
  beforeAll(assertMemoryDatabase);

  const created: string[] = [];
  // Miền riêng mỗi lượt chạy: mọi khoá tìm/xoá của test này nằm trong miền đó, không đụng dữ liệu của test khác.
  const domain = `bf-${newObjectId().slice(-8)}.test`;

  async function seed(localPart: string, overrides: { email?: string } = {}) {
    const email = overrides.email ?? `${localPart}@${domain}`;
    const user = await prisma.user.create({
      data: { email, name: localPart, normalizedName: localPart.toLowerCase(), passwordHash: "h", status: "ACTIVE" },
    });
    created.push(user.id);
    return user;
  }

  /** Chỉ phần của test này trong kết quả (DB dùng chung có thể còn tài khoản của suite khác). */
  const mine = <T extends { id: string }>(rows: T[]): T[] => rows.filter((r) => created.includes(r.id));

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  });

  it("dry-run: liệt kê email sẽ đổi và xung đột, KHÔNG ghi gì", async () => {
    const upper = await seed("Foo", { email: `Foo@${domain.toUpperCase()}` });
    const padded = await seed("bar", { email: `  bar@${domain}  ` });
    await seed("ok"); // đã chuẩn hoá
    const before = await prisma.user.findMany({ where: { id: { in: created } }, orderBy: { id: "asc" } });

    const result = await backfillNormalizeEmails(prisma, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.updated).toBe(0);
    expect(mine(result.changes).map((c) => [c.id, c.to]).sort()).toEqual(
      [
        [upper.id, `foo@${domain}`],
        [padded.id, `bar@${domain}`],
      ].sort()
    );
    const after = await prisma.user.findMany({ where: { id: { in: created } }, orderBy: { id: "asc" } });
    expect(after.map((u) => u.email)).toEqual(before.map((u) => u.email));
  });

  it("ghi thật: email chữ hoa/khoảng trắng → chữ thường; tài khoản đã chuẩn hoá giữ nguyên; tra theo email chuẩn hoá thấy đúng tài khoản", async () => {
    const upper = await seed("Foo", { email: `Foo.Bar+Tag@${domain.toUpperCase()}` });
    const padded = await seed("bar", { email: `\tbar@${domain} ` });
    const ok = await seed("ok");

    const result = await backfillNormalizeEmails(prisma);

    expect(result.updated).toBeGreaterThanOrEqual(2);
    expect(mine(result.changes)).toHaveLength(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: upper.id } })).email).toBe(`foo.bar+tag@${domain}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: padded.id } })).email).toBe(`bar@${domain}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ok.id } })).email).toBe(`ok@${domain}`);
    // Đúng thứ mà đăng nhập làm: tra bằng email đã chuẩn hoá.
    expect((await prisma.user.findUnique({ where: { email: `foo.bar+tag@${domain}` } }))?.id).toBe(upper.id);
  });

  it("idempotent: chạy lần 2 không đổi gì", async () => {
    await seed("Foo", { email: `Foo@${domain.toUpperCase()}` });
    await backfillNormalizeEmails(prisma);

    const second = await backfillNormalizeEmails(prisma);

    expect(mine(second.changes)).toHaveLength(0);
    expect(second.updated).toBe(0);
  });

  it("XUNG ĐỘT: email chuẩn hoá đã thuộc tài khoản khác (đứng trước HOẶC sau theo _id) → KHÔNG sửa, được báo lại", async () => {
    const legacyFirst = await seed("dup1", { email: `Dup1@${domain}` }); // _id nhỏ hơn bản chuẩn hoá
    const lowerOfFirst = await seed("dup1-lower", { email: `dup1@${domain}` });
    const lowerSecond = await seed("dup2-lower", { email: `dup2@${domain}` });
    const legacySecond = await seed("dup2", { email: `DUP2@${domain}` }); // _id lớn hơn bản chuẩn hoá

    const dry = await backfillNormalizeEmails(prisma, { dryRun: true });
    const real = await backfillNormalizeEmails(prisma);

    for (const result of [dry, real]) {
      const collisions = mine(result.collisions);
      expect(collisions.map((c) => [c.id, c.conflictWith]).sort()).toEqual(
        [
          [legacyFirst.id, lowerOfFirst.id],
          [legacySecond.id, lowerSecond.id],
        ].sort()
      );
      expect(mine(result.changes)).toHaveLength(0);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: legacyFirst.id } })).email).toBe(`Dup1@${domain}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: legacySecond.id } })).email).toBe(`DUP2@${domain}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: lowerOfFirst.id } })).email).toBe(`dup1@${domain}`);
  });

  it("hai tài khoản cũ cùng ra một email: người đầu nhận, người sau báo xung đột — dry-run mô phỏng đúng như ghi thật", async () => {
    const first = await seed("Same", { email: `Same@${domain}` });
    const second = await seed("Same2", { email: `SAME@${domain}` });

    const dry = await backfillNormalizeEmails(prisma, { dryRun: true });
    expect(mine(dry.changes).map((c) => c.id)).toEqual([first.id]);
    expect(mine(dry.collisions).map((c) => [c.id, c.conflictWith])).toEqual([[second.id, first.id]]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).email).toBe(`Same@${domain}`);

    const real = await backfillNormalizeEmails(prisma);
    expect(mine(real.changes).map((c) => c.id)).toEqual([first.id]);
    expect(mine(real.collisions).map((c) => c.id)).toEqual([second.id]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).email).toBe(`same@${domain}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second.id } })).email).toBe(`SAME@${domain}`);
  });

  it("email toàn khoảng trắng → giữ nguyên, báo invalid; duyệt theo lô nhỏ (batchSize 1) vẫn thấy hết", async () => {
    const blank = await seed("blank", { email: "   " });
    const upper = await seed("Foo", { email: `Foo@${domain.toUpperCase()}` });
    await seed("ok");

    const result = await backfillNormalizeEmails(prisma, { batchSize: 1 });

    expect(mine(result.invalid).map((c) => c.id)).toEqual([blank.id]);
    expect(mine(result.changes).map((c) => c.id)).toEqual([upper.id]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: blank.id } })).email).toBe("   ");
    expect(result.scanned).toBeGreaterThanOrEqual(3);
  });
});
