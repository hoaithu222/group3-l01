import { buildTalentIndexDoc, type TalentIndexSource } from "../domain/talent-index.builder";

const NOW = new Date("2026-09-15T05:00:00Z");
const oid = (n: number): string => n.toString(16).padStart(24, "0");

function source(over: Partial<TalentIndexSource> & { visibility?: Partial<TalentIndexSource["career"]["visibility"]> } = {}): TalentIndexSource {
  const { visibility, ...rest } = over;
  return {
    now: NOW,
    user: { id: oid(1), name: "Nguyễn Văn An", status: "ACTIVE", avatarAssetId: oid(90) },
    career: { openToWork: true, headline: "  Lập trình viên React  ", preferredRoles: ["Frontend Developer", "  Fullstack "], location: "Hà Nội", updatedAt: new Date("2026-09-10T00:00:00Z"), visibility: { showSkills: true, showContribution: true, ...visibility } },
    badges: [
      { skill: { id: oid(11), code: "ReactJS", name: "ReactJS", icon: "react" } },
      { skill: { id: oid(12), code: "nodejs", name: "Node.js", icon: "node" } },
      { skill: { id: oid(11), code: "reactjs", name: "ReactJS (trùng)", icon: "react" } },
    ],
    contribution: { pctX10: 823, workspaces: 3 },
    portfolioUrl: "https://superapp.test/p/an",
    blockedCompanyIds: [oid(50), oid(50)],
    ...rest,
  };
}

describe("buildTalentIndexDoc — lọc quyền riêng tư NGAY LÚC DỰNG (CR-42)", () => {
  it("dựng đủ trường khi mọi cờ bật: kỹ năng (bỏ trùng, chữ thường), điểm ×10, portfolio, danh sách chặn (bỏ trùng)", () => {
    const d = buildTalentIndexDoc(source());
    expect(d).not.toBeNull();
    expect(d).toMatchObject({
      userId: oid(1),
      openToWork: true,
      displayName: "Nguyễn Văn An",
      headline: "Lập trình viên React",
      preferredRoles: ["Frontend Developer", "Fullstack"],
      preferredRolesKey: ["frontend developer", "fullstack"],
      location: "Hà Nội",
      locationKey: "ha noi",
      skillCodes: ["reactjs", "nodejs"],
      badgeCount: 2,
      contributionPctX10: 823,
      contributionWorkspaces: 3,
      portfolioUrl: "https://superapp.test/p/an",
      blockedCompanyIds: [oid(50)],
    });
    expect(d?.skills.map((s) => s.code)).toEqual(["reactjs", "nodejs"]);
    expect(d?.normalizedText).toContain("nguyen van an");
    expect(d?.normalizedText).toContain("lap trinh vien react");
    expect(d?.normalizedText).toContain("frontend developer");
    expect(d?.normalizedText).toContain("ha noi");
    expect(d?.sourceUpdatedAt).toEqual(new Date("2026-09-10T00:00:00Z"));
    expect(d?.rebuiltAt).toEqual(NOW);
  });

  it("showSkills=false → KHÔNG kỹ năng và badgeCount=0 (không lộ số huy hiệu)", () => {
    const d = buildTalentIndexDoc(source({ visibility: { showSkills: false } }));
    expect(d?.skills).toEqual([]);
    expect(d?.skillCodes).toEqual([]);
    expect(d?.badgeCount).toBe(0);
  });

  it("showContribution=false → điểm đóng góp và số nhóm là null dù nguồn có dữ liệu", () => {
    const d = buildTalentIndexDoc(source({ visibility: { showContribution: false } }));
    expect(d?.contributionPctX10).toBeNull();
    expect(d?.contributionWorkspaces).toBeNull();
  });

  it("chưa nhóm nào đủ dữ liệu (contribution null) → null; chưa publish portfolio → portfolioUrl null", () => {
    const d = buildTalentIndexDoc(source({ contribution: null, portfolioUrl: null }));
    expect(d?.contributionPctX10).toBeNull();
    expect(d?.portfolioUrl).toBeNull();
  });

  it("tắt Open to work hoặc tài khoản không ACTIVE (khoá/chờ xoá/ẩn danh) → null (xoá khỏi index)", () => {
    expect(buildTalentIndexDoc(source({ career: { ...source().career, openToWork: false } }))).toBeNull();
    for (const status of ["LOCKED", "PENDING_DELETION", "ANONYMIZED"]) {
      expect(buildTalentIndexDoc(source({ user: { id: oid(1), name: "X", status, avatarAssetId: null } }))).toBeNull();
    }
  });

  it("bản chiếu KHÔNG chứa email/SĐT/tên nhóm/đồng đội", () => {
    const keys = Object.keys(buildTalentIndexDoc(source()) ?? {});
    for (const forbidden of ["email", "phone", "workspaceName", "workspaces", "teammates"]) expect(keys).not.toContain(forbidden);
  });

  it("chuỗi rỗng/khoảng trắng của headline/location → null; giới hạn số vị trí mong muốn", () => {
    const d = buildTalentIndexDoc(source({ career: { ...source().career, headline: "   ", location: "", preferredRoles: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"] } }));
    expect(d?.headline).toBeNull();
    expect(d?.location).toBeNull();
    expect(d?.locationKey).toBeNull();
    expect(d?.preferredRoles).toHaveLength(5);
  });
});
