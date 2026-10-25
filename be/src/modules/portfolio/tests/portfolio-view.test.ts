import { EMPTY_SNAPSHOT, type PortfolioProject, type PortfolioSnapshot } from "../entities/portfolio.interface";
import { safeHttpsUrl } from "../entities/portfolio.rules";
import { buildProjectView, emptyVisibleSections, formatDateTimeVN, formatPeriod, formatX10, sectionsWithContent, TEAMMATE_PLACEHOLDER, toParagraphs, visibleSections } from "../services/portfolio-view";

const at = new Date("2026-09-26T07:05:00.000Z");

function project(over: Partial<PortfolioProject> = {}, snap: Partial<PortfolioSnapshot> = {}): PortfolioProject {
  return {
    id: "p1",
    portfolioId: "pf",
    userId: "u",
    workspaceId: "w",
    title: "Đồ án Quản lý kho",
    summary: null,
    role: null,
    periodFrom: null,
    periodTo: null,
    highlights: [],
    coverAssetId: null,
    visible: true,
    order: 0,
    showTeammates: false,
    snapshot: { ...EMPTY_SNAPSHOT, tasksDone: 40, storyPointsX10: 620, onTimeRatePct: 90, contributionPctX10: 910, contributionShareX10: 310, peerReviewAvgX10: 85, filesUploaded: 7, teammatesCount: 3, namedTeammates: ["Lan", "Minh"], ...snap },
    snapshotAt: at,
    version: 1,
    createdAt: at,
    updatedAt: at,
    ...over,
  };
}

const view = (p: PortfolioProject) => buildProjectView(p, { coverUrl: null, snapshotAtText: formatDateTimeVN(at) });

describe("định dạng", () => {
  it("formatX10: số nguyên không dấu phẩy, thập phân dùng dấu phẩy Việt", () => {
    expect(formatX10(620)).toBe("62");
    expect(formatX10(625)).toBe("62,5");
    expect(formatX10(0)).toBe("0");
    expect(formatX10(85)).toBe("8,5");
  });

  it("formatDateTimeVN cố định giờ Việt Nam (UTC+7), không phụ thuộc máy chủ", () => {
    expect(formatDateTimeVN(at)).toBe("26/09/2026 14:05");
  });

  it("formatPeriod: đủ hai đầu / một đầu / không có", () => {
    expect(formatPeriod(new Date("2025-09-05T00:00:00Z"), new Date("2025-12-20T00:00:00Z"))).toBe("09/2025 – 12/2025");
    expect(formatPeriod(new Date("2025-09-05T00:00:00Z"), null)).toBe("Từ 09/2025");
    expect(formatPeriod(null, new Date("2025-12-20T00:00:00Z"))).toBe("Đến 12/2025");
    expect(formatPeriod(null, null)).toBeNull();
  });

  it("toParagraphs: đoạn ngăn bởi dòng trống, xuống dòng giữ lại, bỏ dòng rỗng, KHÔNG diễn giải HTML", () => {
    expect(toParagraphs("Dòng 1\nDòng 2\n\nĐoạn 2\r\n  \n\n\nĐoạn 3")).toEqual([["Dòng 1", "Dòng 2"], ["Đoạn 2"], ["Đoạn 3"]]);
    expect(toParagraphs("<b>đậm</b>")).toEqual([["<b>đậm</b>"]]);
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs("   \n  ")).toEqual([]);
  });
});

describe("safeHttpsUrl (CR-33) — liên kết chỉ https, không tài khoản nhúng", () => {
  it.each([
    ["https://github.com/an-dev", "https://github.com/an-dev"],
    ["  https://vcijsc.com/  ", "https://vcijsc.com/"],
  ])("nhận %s", (raw, expected) => {
    expect(safeHttpsUrl(raw)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "http://insecure.com", "ftp://x.com", "https://tin-cay.com@doc-hai.com", "https://user:pw@x.com", "//x.com", "không-phải-url", "", "https://"])("bỏ %s", (raw) => {
    expect(safeHttpsUrl(raw)).toBeNull();
  });

  it("URL quá dài bị bỏ", () => {
    expect(safeHttpsUrl(`https://x.com/${"a".repeat(300)}`)).toBeNull();
  });
});

describe("buildProjectView — số liệu và quyền riêng tư đồng đội", () => {
  it("CR-04: số liệu đúng, có nhãn chữ + đơn vị, KHÔNG có tên đồng đội khi showTeammates=false", () => {
    const v = view(project());
    expect(v.stats).toEqual([
      { label: "Task hoàn thành", value: "40 task" },
      { label: "Story points", value: "62 điểm" },
      { label: "Đúng hạn", value: "90%" },
      { label: "Điểm đóng góp", value: "91/100" },
      { label: "Chiếm khối lượng nhóm", value: "31%" },
      { label: "Điểm review trung bình", value: "8,5/10" },
      { label: "Tệp đã tải lên", value: "7 tệp" },
    ]);
    expect(v.teammatesHeading).toBe("Làm cùng 3 đồng đội");
    expect(v.teammateNames).toEqual([]);
    expect(JSON.stringify(v)).not.toMatch(/Lan|Minh/); // dù snapshot còn lưu tên (kiểm lại lúc render)
  });

  it("CR-31: showTeammates=true → tên người đã đồng ý + 'Đồng đội' cho người còn lại", () => {
    const v = view(project({ showTeammates: true }, { namedTeammates: ["Lan"], teammatesCount: 3 }));
    expect(v.teammateNames).toEqual(["Lan", TEAMMATE_PLACEHOLDER, TEAMMATE_PLACEHOLDER]);
    expect(v.teammatesHeading).toBe("Làm cùng 3 đồng đội");
  });

  it("chỉ số chưa có/không được phép công khai bị ẩn (null), không hiện 0", () => {
    const v = view(project({}, { onTimeRatePct: null, contributionPctX10: null, contributionShareX10: null, peerReviewAvgX10: null, teammatesCount: 0, namedTeammates: [] }));
    expect(v.stats.map((s) => s.label)).toEqual(["Task hoàn thành", "Story points", "Tệp đã tải lên"]);
    expect(v.contributionNote).toBeNull();
    expect(v.teammatesHeading).toBeNull();
  });

  it("có điểm đóng góp → kèm ghi chú công thức rút gọn (D-09)", () => {
    expect(view(project()).contributionNote).toContain("công thức");
  });
});

describe("mục hiển thị", () => {
  const sections = [
    { kind: "CONTACT" as const, visible: true, order: 3 },
    { kind: "ABOUT" as const, visible: true, order: 1 },
    { kind: "SKILLS" as const, visible: false, order: 2 },
    { kind: "PROJECTS" as const, visible: true, order: 0 },
  ];

  it("visibleSections lọc mục tắt và sắp theo order", () => {
    expect(visibleSections(sections).map((s) => s.kind)).toEqual(["PROJECTS", "ABOUT", "CONTACT"]);
  });

  it("chỉ mục đang bật VÀ có nội dung xuất hiện; mục bật mà trống được liệt kê riêng (PORT_010 details)", () => {
    const content = { hasAbout: false, hasProjects: true, hasSkills: true, hasContact: false };
    expect(sectionsWithContent(sections, content)).toEqual(["PROJECTS"]);
    expect(emptyVisibleSections(sections, content)).toEqual(["ABOUT", "CONTACT"]);
    expect(sectionsWithContent(sections, { hasAbout: false, hasProjects: false, hasSkills: true, hasContact: false })).toEqual([]);
  });
});
