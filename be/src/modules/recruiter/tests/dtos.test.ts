import { LIMITS } from "../../../core/constants/limits";
import {
  addMemberSchema,
  adminCompanyPatchSchema,
  careerSettingsSchema,
  declineSchema,
  interestedSchema,
  offerMessageSchema,
  registerCompanySchema,
  sendOfferSchema,
  statsQuerySchema,
  talentSearchQuerySchema,
  updateCompanySchema,
} from "../dtos";

const OID = "65f000000000000000000001";
const ok = (r: { success: boolean }) => r.success;

describe("registerCompanySchema", () => {
  const base = { name: "Công ty ACME", website: "https://acme.vn" };

  it("hợp lệ tối thiểu (tên + website); chấp nhận MST 10 số và 10 số-3 số", () => {
    expect(ok(registerCompanySchema.safeParse(base))).toBe(true);
    expect(ok(registerCompanySchema.safeParse({ ...base, taxCode: "0123456789" }))).toBe(true);
    expect(ok(registerCompanySchema.safeParse({ ...base, taxCode: "0123456789-001" }))).toBe(true);
  });

  it("từ chối: MST sai dạng, website không phải http(s), trường lạ (.strict — không tự đặt tier/status), tên quá ngắn/dài, logo không phải ObjectId", () => {
    for (const bad of [
      { ...base, taxCode: "12345" },
      { ...base, taxCode: "0123456789-01" },
      { ...base, website: "javascript:alert(1)" },
      { ...base, website: "ftp://acme.vn" },
      { ...base, tier: "ENTERPRISE" },
      { ...base, status: "APPROVED" },
      { ...base, name: "A" },
      { ...base, name: "x".repeat(LIMITS.company.nameMax + 1) },
      { ...base, logoAssetId: "khong-phai-objectid" },
      { ...base, sizeRange: "HUGE" },
    ]) {
      expect(ok(registerCompanySchema.safeParse(bad))).toBe(false);
    }
  });
});

describe("updateCompanySchema / addMemberSchema", () => {
  it("PATCH cần expectedVersion; cho null để xoá trường tuỳ chọn; từ chối trường lạ", () => {
    expect(ok(updateCompanySchema.safeParse({ description: "mới", expectedVersion: 1 }))).toBe(true);
    expect(ok(updateCompanySchema.safeParse({ logoAssetId: null, industry: null, sizeRange: null, taxCode: null, expectedVersion: 0 }))).toBe(true);
    expect(ok(updateCompanySchema.safeParse({ description: "mới" }))).toBe(false);
    expect(ok(updateCompanySchema.safeParse({ tier: "PRO", expectedVersion: 1 }))).toBe(false);
  });

  it("thêm nhân sự: email chuẩn hoá chữ thường, vai OWNER|RECRUITER", () => {
    const r = addMemberSchema.safeParse({ email: "  HR@Acme.VN ", role: "RECRUITER" });
    expect(r.success && r.data.email).toBe("hr@acme.vn");
    expect(ok(addMemberSchema.safeParse({ email: "hr@acme.vn", role: "ADMIN" }))).toBe(false);
    expect(ok(addMemberSchema.safeParse({ email: "sai", role: "OWNER" }))).toBe(false);
  });
});

describe("careerSettingsSchema — PUT /me/career", () => {
  const base = { openToWork: false, headline: null, preferredRoles: [], location: null };

  it("tắt Open to work không cần consentVersion; bật cần consentVersion (VAL_001 nếu thiếu)", () => {
    expect(ok(careerSettingsSchema.safeParse(base))).toBe(true);
    expect(ok(careerSettingsSchema.safeParse({ ...base, openToWork: true }))).toBe(false);
    expect(ok(careerSettingsSchema.safeParse({ ...base, openToWork: true, consentVersion: "v1" }))).toBe(true);
  });

  it("giới hạn: headline ≤ 120, ≤ 5 vị trí (2–40 ký tự), khu vực ≤ 60, không ghi visibility, không trường lạ", () => {
    expect(ok(careerSettingsSchema.safeParse({ ...base, headline: "x".repeat(121) }))).toBe(false);
    expect(ok(careerSettingsSchema.safeParse({ ...base, preferredRoles: ["a", "bb"] }))).toBe(false);
    expect(ok(careerSettingsSchema.safeParse({ ...base, preferredRoles: ["aa", "bb", "cc", "dd", "ee", "ff"] }))).toBe(false);
    expect(ok(careerSettingsSchema.safeParse({ ...base, location: "x".repeat(61) }))).toBe(false);
    expect(ok(careerSettingsSchema.safeParse({ ...base, visibility: { showSkills: true } }))).toBe(false);
  });
});

describe("talentSearchQuerySchema", () => {
  it("skills nhận CSV hoặc lặp tham số, ≤ filterSkillsMax, mã hợp lệ; số ngoài khoảng bị từ chối", () => {
    const csv = talentSearchQuerySchema.safeParse({ skills: "ReactJS, nodejs" });
    expect(csv.success && csv.data.skills).toEqual(["reactjs", "nodejs"]);
    const rep = talentSearchQuerySchema.safeParse({ skills: ["a-b", "cd"] });
    expect(rep.success && rep.data.skills).toEqual(["a-b", "cd"]);
    expect(ok(talentSearchQuerySchema.safeParse({ skills: Array.from({ length: LIMITS.talent.filterSkillsMax + 1 }, (_, i) => `sk${i}`).join(",") }))).toBe(false);
    expect(ok(talentSearchQuerySchema.safeParse({ skills: "Không Hợp Lệ!" }))).toBe(false);
    expect(ok(talentSearchQuerySchema.safeParse({ minContribution: "101" }))).toBe(false);
    expect(ok(talentSearchQuerySchema.safeParse({ minBadges: "51" }))).toBe(false);
    expect(ok(talentSearchQuerySchema.safeParse({ q: "a" }))).toBe(false);
    expect(ok(talentSearchQuerySchema.safeParse({ limit: String(LIMITS.talent.searchPageMax + 1) }))).toBe(false);
  });

  it("mặc định limit 20; ép kiểu số từ chuỗi", () => {
    const r = talentSearchQuerySchema.safeParse({ minContribution: "20", minBadges: "1" });
    expect(r.success && r.data).toMatchObject({ limit: 20, minContribution: 20, minBadges: 1 });
  });
});

describe("sendOfferSchema / phản hồi / tin nhắn", () => {
  const offer = { studentId: OID, title: "Thực tập React", message: "Chúng tôi muốn mời bạn tham gia dự án frontend.", employmentType: "INTERNSHIP" };

  it("hợp lệ; nội dung ≥ 20 ký tự, tiêu đề ≥ 3; loại việc thuộc danh sách; .strict", () => {
    expect(ok(sendOfferSchema.safeParse(offer))).toBe(true);
    expect(ok(sendOfferSchema.safeParse({ ...offer, message: "ngắn" }))).toBe(false);
    expect(ok(sendOfferSchema.safeParse({ ...offer, title: "ab" }))).toBe(false);
    expect(ok(sendOfferSchema.safeParse({ ...offer, employmentType: "VOLUNTEER" }))).toBe(false);
    expect(ok(sendOfferSchema.safeParse({ ...offer, status: "INTERESTED" }))).toBe(false);
    expect(ok(sendOfferSchema.safeParse({ ...offer, message: "x".repeat(LIMITS.offer.messageMax + 1) }))).toBe(false);
    expect(ok(sendOfferSchema.safeParse({ ...offer, jdAssetId: OID, location: "Hà Nội" }))).toBe(true);
  });

  it("Quan tâm: shareEmail mặc định false; Từ chối cần mã lý do hợp lệ", () => {
    const r = interestedSchema.safeParse({});
    expect(r.success && r.data.shareEmail).toBe(false);
    expect(ok(declineSchema.safeParse({ reason: "NOT_A_FIT" }))).toBe(true);
    expect(ok(declineSchema.safeParse({ reason: "RUDE" }))).toBe(false);
    expect(ok(declineSchema.safeParse({}))).toBe(false);
  });

  it("tin nhắn: clientMessageId 8–64 ký tự; nội dung không rỗng ≤ 2000", () => {
    expect(ok(offerMessageSchema.safeParse({ content: "Xin chào", clientMessageId: "msg-12345678" }))).toBe(true);
    expect(ok(offerMessageSchema.safeParse({ content: "Xin chào", clientMessageId: "ngắn" }))).toBe(false);
    expect(ok(offerMessageSchema.safeParse({ content: "   ", clientMessageId: "msg-12345678" }))).toBe(false);
    expect(ok(offerMessageSchema.safeParse({ content: "x".repeat(LIMITS.offer.threadMessageMax + 1), clientMessageId: "msg-12345678" }))).toBe(false);
  });
});

describe("admin DTO", () => {
  it("PATCH admin cần lý do ≥ 10 ký tự + expectedVersion; hạn mức 0–10000 hoặc null", () => {
    const base = { reason: "Nâng gói theo hợp đồng", expectedVersion: 2 };
    expect(ok(adminCompanyPatchSchema.safeParse({ ...base, tier: "PRO", offerQuotaOverride: 100 }))).toBe(true);
    expect(ok(adminCompanyPatchSchema.safeParse({ ...base, offerQuotaOverride: null }))).toBe(true);
    expect(ok(adminCompanyPatchSchema.safeParse({ ...base, offerQuotaOverride: 10001 }))).toBe(false);
    expect(ok(adminCompanyPatchSchema.safeParse({ ...base, tier: "GOLD" }))).toBe(false);
    expect(ok(adminCompanyPatchSchema.safeParse({ tier: "PRO", expectedVersion: 2 }))).toBe(false);
    expect(ok(adminCompanyPatchSchema.safeParse({ reason: "ngắn", expectedVersion: 2 }))).toBe(false);
  });

  it("thống kê: from ≤ to, tối đa 366 ngày, múi giờ IANA hợp lệ", () => {
    expect(ok(statsQuerySchema.safeParse({ from: "2026-01-01", to: "2026-09-30" }))).toBe(true);
    expect(ok(statsQuerySchema.safeParse({ from: "2026-09-30", to: "2026-01-01" }))).toBe(false);
    expect(ok(statsQuerySchema.safeParse({ from: "2025-01-01", to: "2026-09-30" }))).toBe(false);
    expect(ok(statsQuerySchema.safeParse({ from: "2026-01-01", to: "2026-02-01", tz: "Mars/Olympus" }))).toBe(false);
  });
});
