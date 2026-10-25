import { buildTalentPipeline, ejsonDate, ejsonId, hashTalentQuery } from "../domain/talent-query";

const COMPANY = "65f000000000000000000001";

type Doc = Record<string, unknown>;
const stage = (p: Doc[], key: string): Doc => p.find((s) => key in s)?.[key] as Doc;

describe("buildTalentPipeline — bộ lọc cứng trên TalentSearchIndex (be.md §5 'Tìm kiếm')", () => {
  it("luôn lọc openToWork + loại công ty bị chặn ($ne ObjectId) — không truy vấn nào khác ngoài index", () => {
    const { pipeline, fetch } = buildTalentPipeline(COMPANY, { offset: 0, limit: 20 });
    const match = stage(pipeline, "$match");
    expect(match.openToWork).toBe(true);
    expect(match.blockedCompanyIds).toEqual({ $ne: { $oid: COMPANY } });
    expect(match.skillCodes).toBeUndefined();
    expect(match.$and).toBeUndefined();
    expect(fetch).toBe(21);
    expect(stage(pipeline, "$limit")).toBe(21);
    expect(stage(pipeline, "$skip")).toBe(0);
  });

  it("kỹ năng → $all (chữ thường, bỏ trùng); điểm đóng góp tối thiểu nhân 10; số huy hiệu tối thiểu", () => {
    const { pipeline } = buildTalentPipeline(COMPANY, { skills: ["ReactJS", "nodejs", "reactjs"], minContribution: 20.5, minBadges: 2, offset: 40, limit: 10 });
    const match = stage(pipeline, "$match");
    expect(match.skillCodes).toEqual({ $all: ["reactjs", "nodejs"] });
    expect(match.contributionPctX10).toEqual({ $gte: 205 });
    expect(match.badgeCount).toEqual({ $gte: 2 });
    expect(stage(pipeline, "$skip")).toBe(40);
    const fields = stage(pipeline, "$addFields") as { matchScore: { $size: { $setIntersection: unknown[] } } };
    expect(fields.matchScore.$size.$setIntersection).toEqual(["$skillCodes", ["reactjs", "nodejs"]]);
  });

  it("từ khoá: mỗi từ khớp ĐẦU một từ và ĐÃ escape (chuỗi người dùng không thành regex); role/khu vực chuẩn hoá không dấu", () => {
    const { pipeline } = buildTalentPipeline(COMPANY, { q: "Nguyễn (a+)+", role: "Front-end", location: "Hà Nội", offset: 0, limit: 5 });
    const and = stage(pipeline, "$match").$and as Doc[];
    const patterns = and.flatMap((c) => Object.values(c).map((v) => (v as { $regex: string }).$regex));
    expect(patterns).toContain("(^|[^a-z0-9])nguyen");
    expect(patterns.some((p) => p.includes("\\(a\\+\\)\\+") || p.includes("a\\+"))).toBe(true);
    expect(patterns.some((p) => p === "^ha noi")).toBe(true);
    expect(patterns.some((p) => p.includes("front-end"))).toBe(true);
    // Không pattern nào chứa nhóm/lặp chưa escape (chống ReDoS).
    for (const p of patterns) expect(p.replace(/\\./g, "").replace("(^|[^a-z0-9])", "")).not.toMatch(/[()+*?]/);
  });

  it("sắp xếp ổn định: kỹ năng khớp → điểm đóng góp (null cuối) → cập nhật gần nhất → id", () => {
    const { pipeline } = buildTalentPipeline(COMPANY, { offset: 0, limit: 20 });
    expect(stage(pipeline, "$sort")).toEqual({ matchScore: -1, contribSort: -1, rebuiltAt: -1, _id: -1 });
    expect((stage(pipeline, "$addFields") as { contribSort: unknown }).contribSort).toEqual({ $ifNull: ["$contributionPctX10", -1] });
  });

  it("$project chỉ những trường an toàn — không email/SĐT/normalizedText/blockedCompanyIds", () => {
    const { pipeline } = buildTalentPipeline(COMPANY, { offset: 0, limit: 20 });
    const keys = Object.keys(stage(pipeline, "$project"));
    for (const forbidden of ["email", "phone", "normalizedText", "blockedCompanyIds", "locationKey", "preferredRolesKey"]) expect(keys).not.toContain(forbidden);
    expect(keys).toEqual(expect.arrayContaining(["userId", "displayName", "skills", "contributionPctX10", "portfolioUrl", "matchScore"]));
  });
});

describe("hashTalentQuery — khoá cache ổn định", () => {
  const base = { skills: ["reactjs", "nodejs"], minContribution: 10, q: "An", offset: 0, limit: 20 };

  it("không phụ thuộc thứ tự/hoa thường của kỹ năng và dấu của từ khoá", () => {
    expect(hashTalentQuery(base)).toBe(hashTalentQuery({ ...base, skills: ["NodeJS", "ReactJS"], q: "an" }));
    expect(hashTalentQuery({ ...base, q: "Ân" })).toBe(hashTalentQuery({ ...base, q: "an" }));
  });

  it("đổi bộ lọc/trang/kích thước trang → khoá khác", () => {
    const h = hashTalentQuery(base);
    expect(hashTalentQuery({ ...base, minContribution: 11 })).not.toBe(h);
    expect(hashTalentQuery({ ...base, offset: 20 })).not.toBe(h);
    expect(hashTalentQuery({ ...base, limit: 10 })).not.toBe(h);
    expect(hashTalentQuery({ ...base, skills: ["reactjs"] })).not.toBe(h);
  });
});

describe("Extended JSON helpers (kết quả aggregateRaw)", () => {
  it("ejsonId đọc {$oid} hoặc chuỗi; ejsonDate đọc {$date} ISO/số/$numberLong", () => {
    expect(ejsonId({ $oid: "abc" })).toBe("abc");
    expect(ejsonId("abc")).toBe("abc");
    expect(ejsonId(undefined)).toBe("");
    expect(ejsonDate({ $date: "2026-09-15T00:00:00.000Z" })?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(ejsonDate({ $date: 1789000000000 })?.getTime()).toBe(1789000000000);
    expect(ejsonDate({ $date: { $numberLong: "1789000000000" } })?.getTime()).toBe(1789000000000);
    expect(ejsonDate(null)).toBeNull();
  });
});
