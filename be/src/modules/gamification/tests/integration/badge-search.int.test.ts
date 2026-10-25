/**
 * Integration — `PrismaBadgeRepository.listPage` với `q` (p4-03 admin.md §2.2, Mongo memory replset): khớp KHÔNG DẤU, phân trang SAU khi lọc
 * (`total` là số khớp thật), kết hợp `isActive`. Không cần Redis/Express — chỉ repository + Prisma thật.
 */
import { randomUUID } from "crypto";
import { prisma } from "../../../../infrastructure/database";
import { PrismaBadgeRepository } from "../../repositories/badge.repository.prisma";

const repo = new PrismaBadgeRepository();
/** Hậu tố duy nhất cho MỌI tên/mã của test này — cô lập với dữ liệu suite khác dùng chung DB. */
const tag = randomUUID().slice(0, 8);
const codes: string[] = [];

async function seed(code: string, name: string, over: { order: number; isActive?: boolean }) {
  const full = `${code}-${tag}`;
  codes.push(full);
  await prisma.badge.create({
    data: { code: full, name: `${name} ${tag}`, description: "", emoji: null, iconAssetId: null, criteria: { all: [{ counter: "tasksDone", op: "gte", value: 1 }] }, counters: ["tasksDone"], rarity: "COMMON", isActive: over.isActive ?? true, order: over.order, createdBy: null },
  });
}

const plain = (n: string): string => n.replace(` ${tag}`, "");

describe("PrismaBadgeRepository.listPage — q theo tên (integration)", () => {
  beforeAll(async () => {
    await seed("cham", "Chăm chỉ", { order: 1 });
    await seed("dung", "Đúng hạn", { order: 2 });
    await seed("chuoi", "Chuỗi 7 ngày", { order: 3, isActive: false });
    await seed("chuoi30", "Chuỗi 30 ngày", { order: 4 });
    await seed("cham2", "CHĂM học", { order: 5 });
  });

  afterAll(async () => {
    await prisma.badge.deleteMany({ where: { code: { in: codes } } });
  });

  const search = async (q: string, isActive?: boolean) => {
    const res = await repo.listPage({ page: 1, limit: 100, isActive, q });
    return res.rows.filter((b) => b.code.endsWith(`-${tag}`)).map((b) => plain(b.name));
  };

  it("không dấu, không phân biệt hoa/thường; theo thứ tự `order`", async () => {
    expect(await search("cham")).toEqual(["Chăm chỉ", "CHĂM học"]);
    expect(await search("ĐÚNG")).toEqual(["Đúng hạn"]);
    expect(await search("dung han")).toEqual(["Đúng hạn"]);
    expect(await search("  chuoi  ")).toEqual(["Chuỗi 7 ngày", "Chuỗi 30 ngày"]);
  });

  it("không khớp → rỗng và total 0; q rỗng = không lọc", async () => {
    expect(await repo.listPage({ page: 1, limit: 20, q: "khong-co-huy-hieu-nay" })).toEqual({ rows: [], total: 0 });
    expect(await search("")).toHaveLength(5);
  });

  it("kết hợp isActive", async () => {
    expect(await search("chuoi", true)).toEqual(["Chuỗi 30 ngày"]);
    expect(await search("chuoi", false)).toEqual(["Chuỗi 7 ngày"]);
  });

  it("phân trang SAU khi lọc: total là số khớp thật, các trang không trùng và đủ phần dư", async () => {
    const pages = await Promise.all([1, 2, 3, 4].map((page) => repo.listPage({ page, limit: 2, q: tag })));
    expect(pages.map((p) => p.total)).toEqual([5, 5, 5, 5]);
    expect(pages.map((p) => p.rows.length)).toEqual([2, 2, 1, 0]);
    const ids = pages.flatMap((p) => p.rows.map((b) => b.id));
    expect(new Set(ids).size).toBe(5);
    expect(pages[0]!.rows.map((b) => plain(b.name))).toEqual(["Chăm chỉ", "Đúng hạn"]);
  });
});
