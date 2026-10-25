import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { TalentSearchRow } from "../repositories/talent-search-index.repository";
import { DELETED_ACCOUNT_NAME, presentStudent, presentTalentCard } from "../services/recruiter.presenter";
import { recruiterErrors } from "../services/recruiter.errors";

const OID = "65f000000000000000000001";
/** URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (bản THUMB) của asset — thay cho đường dẫn cũ `/api/v1/users/:id/avatar` cần Bearer. */
const signedThumb = (assetId: string) => new RegExp(`^https?://\\S+/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

const row = (over: Partial<TalentSearchRow> = {}): TalentSearchRow => ({
  userId: OID,
  displayName: "Nguyễn Văn An",
  avatarAssetId: "65f0000000000000000000aa",
  headline: "Lập trình viên",
  preferredRoles: ["Frontend"],
  location: "Hà Nội",
  skills: Array.from({ length: 8 }, (_, i) => ({ skillId: `65f00000000000000000010${i}`, code: `sk${i}`, name: `Kỹ năng ${i}`, icon: "x" })),
  badgeCount: 8,
  contributionPctX10: 823,
  contributionWorkspaces: 3,
  portfolioUrl: "https://superapp.test/p/an",
  matchScore: 2,
  ...over,
});

describe("presentTalentCard — CR-42 (snapshot response)", () => {
  it("KHÔNG có khoá email/phone/workspace* ở mọi cấu hình; ≤ 6 kỹ năng", () => {
    const card = presentTalentCard(row(), 6, true);
    for (const forbidden of ["email", "phone", "workspaceName", "workspaceId", "workspaces", "teammates"]) expect(Object.keys(card)).not.toContain(forbidden);
    expect(card.skills).toHaveLength(6);
    expect(card.contributionPct).toBe(82.3);
    expect(card.contributionWorkspaces).toBe(3);
    expect(card.portfolioUrl).toBe("https://superapp.test/p/an");
    expect(card.matchedSkills).toBe(2);
    expect(card.avatarUrl).toMatch(signedThumb("65f0000000000000000000aa"));
    expect(card.avatarUrl).not.toContain(`/users/${OID}/avatar`);
  });

  it("showContribution=false / chưa publish portfolio → khoá contributionPct*/portfolioUrl VẮNG hẳn (không phải null); không lọc kỹ năng → không matchedSkills", () => {
    const card = presentTalentCard(row({ contributionPctX10: null, contributionWorkspaces: null, portfolioUrl: null }), 6, false);
    expect(Object.keys(card)).not.toContain("contributionPct");
    expect(Object.keys(card)).not.toContain("contributionWorkspaces");
    expect(Object.keys(card)).not.toContain("portfolioUrl");
    expect(Object.keys(card)).not.toContain("matchedSkills");
  });

  it("không ảnh đại diện → avatarUrl null", () => {
    expect(presentTalentCard(row({ avatarAssetId: null }), 6, false).avatarUrl).toBeNull();
    expect(presentStudent(OID, { id: OID, name: "An", email: "an@e.com", status: "ACTIVE", role: "user", avatarAssetId: null }).avatarUrl).toBeNull();
  });
});

describe("presentStudent — tài khoản đã ẩn danh hoá (CR-45)", () => {
  it("hiện 'Tài khoản đã xoá', không ảnh", () => {
    const gone = presentStudent(OID, { id: OID, name: "Tài khoản đã xoá", email: "deleted@anon.local", status: "ANONYMIZED", role: "user", avatarAssetId: "x" });
    expect(gone).toEqual({ userId: OID, displayName: DELETED_ACCOUNT_NAME, avatarUrl: null });
    expect(presentStudent(OID, undefined).displayName).toBe(DELETED_ACCOUNT_NAME);
  });

  it("người dùng bình thường: tên + ảnh (URL ký sẵn của đúng asset, dùng thẳng làm nguồn ảnh)", () => {
    const s = presentStudent(OID, { id: OID, name: "An", email: "an@e.com", status: "ACTIVE", role: "user", avatarAssetId: "65f0000000000000000000aa" });
    expect(s.displayName).toBe("An");
    expect(s.avatarUrl).toMatch(signedThumb("65f0000000000000000000aa"));
    expect(Object.keys(s)).not.toContain("email");
  });
});

describe("recruiterErrors — mã RECR_001..012 (be.md §8)", () => {
  const table: Array<[keyof typeof ErrorCode, () => { statusCode: number; errorCode: string; message: string }, number]> = [
    ["RECR_001", () => recruiterErrors.alreadyInCompany(), 409],
    ["RECR_002", () => recruiterErrors.notApproved(), 403],
    ["RECR_003", () => recruiterErrors.ownerOnly(), 403],
    ["RECR_004", () => recruiterErrors.duplicateCompany(), 409],
    ["RECR_005", () => recruiterErrors.quotaExceeded({ period: "2026-09", used: 5, quota: 5 }), 429],
    ["RECR_006", () => recruiterErrors.openOfferExists(), 409],
    ["RECR_007", () => recruiterErrors.cannotOffer(), 422],
    ["RECR_008", () => recruiterErrors.threadClosed(), 403],
    ["RECR_009", () => recruiterErrors.invalidState(), 409],
    ["RECR_011", () => recruiterErrors.memberElsewhere(), 409],
    ["RECR_012", () => recruiterErrors.lastOwner(), 400],
  ];

  it.each(table)("%s → HTTP %s khớp be.md và có thông điệp tiếng Việt", (code, make, status) => {
    const e = make();
    expect(e.errorCode).toBe(code);
    expect(e.statusCode).toBe(status);
    expect(e.message).toBe(ErrorMessages[code]);
    expect(e.message.length).toBeGreaterThan(5);
  });

  it("RECR_010 (ScopeRateLimitError) có thông điệp; không còn nhầm với REC_* của ghi hình họp (REC_001 vẫn là bản cũ)", () => {
    expect(ErrorMessages.RECR_010).toBe("Đã đạt giới hạn xem hồ sơ ứng viên trong ngày");
    expect(ErrorMessages.REC_001).toBe("Còn người tham gia chưa đồng ý ghi hình");
    expect(ErrorMessages.REC_002).toBe("Cuộc họp đang được ghi hình");
  });

  it("RECR_005 mang details period/used/quota để client hiện còn bao nhiêu lượt", () => {
    expect(recruiterErrors.quotaExceeded({ period: "2026-09", used: 5, quota: 5 }).details).toEqual({ period: "2026-09", used: 5, quota: 5 });
  });
});
