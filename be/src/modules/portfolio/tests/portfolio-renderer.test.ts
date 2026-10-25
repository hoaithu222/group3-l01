import { EMPTY_SNAPSHOT, PORTFOLIO_ACCENTS, PORTFOLIO_TEMPLATES, type PortfolioProject, type PortfolioSection } from "../entities/portfolio.interface";
import { PortfolioHtmlTooLargeError, PortfolioRenderer, type PageInput } from "../services/portfolio-renderer.service";

const at = new Date("2026-09-26T07:05:00.000Z");
const SECTIONS: PortfolioSection[] = [
  { kind: "ABOUT", visible: true, order: 0 },
  { kind: "PROJECTS", visible: true, order: 1 },
  { kind: "SKILLS", visible: true, order: 2 },
  { kind: "CONTACT", visible: true, order: 3 },
];

function project(title = "Đồ án Quản lý kho"): PortfolioProject {
  return {
    id: "p1",
    portfolioId: "pf",
    userId: "u",
    workspaceId: "w",
    title,
    summary: "Xây hệ thống kho.\nDòng hai.",
    role: "Trưởng nhóm",
    periodFrom: new Date("2025-09-05T00:00:00Z"),
    periodTo: new Date("2025-12-20T00:00:00Z"),
    highlights: ["Giảm 30% thời gian nhập kho"],
    coverAssetId: null,
    visible: true,
    order: 0,
    showTeammates: false,
    snapshot: { ...EMPTY_SNAPSHOT, tasksDone: 40, storyPointsX10: 620, onTimeRatePct: 90, filesUploaded: 7, teammatesCount: 3, namedTeammates: ["Lan Anh"] },
    snapshotAt: at,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

function input(over: Partial<PageInput> = {}): PageInput {
  return {
    mode: "public",
    displayName: "Nguyễn Văn An",
    headline: "Lập trình viên Fullstack",
    bio: "Tôi thích xây sản phẩm.",
    links: [{ label: "GitHub", url: "https://github.com/an-dev" }],
    theme: { template: "CLASSIC", accent: "GREEN" },
    sections: SECTIONS,
    seoIndexable: false,
    avatarUrl: "/p/an-dev/assets/img-11223344.webp",
    projects: [{ project: project(), coverUrl: "/p/an-dev/assets/img-aabbccdd.webp" }],
    badges: [{ name: "ReactJS", unlockedAt: new Date("2026-08-01T00:00:00Z") }],
    canonicalUrl: "https://superapp.test/p/an-dev",
    generatedAt: at,
    ...over,
  };
}

const renderer = new PortfolioRenderer();

describe("PortfolioRenderer — an toàn (CR-33)", () => {
  it("thoát mọi dữ liệu người dùng: <script> trong tên/giới thiệu/tóm tắt/nhãn liên kết chỉ còn là chữ", () => {
    const evil = `<script>alert("xss")</script>`;
    const html = renderer.render(
      input({
        displayName: `An ${evil}`,
        headline: `<img src=x onerror=alert(1)>`,
        bio: `Giới thiệu ${evil}\n<b>đậm</b>`,
        links: [{ label: `GH ${evil}`, url: "https://github.com/an" }],
        projects: [{ project: { ...project(`Dự án ${evil}`), summary: evil, role: evil, highlights: [evil] }, coverUrl: null }],
        badges: [{ name: evil, unlockedAt: at }],
      })
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).not.toMatch(/<b>đậm/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("liên kết javascript:/data:/http: bị BỎ; https giữ nguyên với rel noopener nofollow ugc", () => {
    const html = renderer.render(
      input({
        links: [
          { label: "Xấu 1", url: "javascript:alert(1)" },
          { label: "Xấu 2", url: "data:text/html,<script>1</script>" },
          { label: "Xấu 3", url: "http://khong-bao-mat.com" },
          { label: "Xấu 4", url: "https://tin-cay.com@doc-hai.com" },
          { label: "Tốt", url: "https://github.com/an-dev" },
        ],
      })
    );
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("khong-bao-mat");
    expect(html).not.toContain("doc-hai.com");
    expect(html).toContain('<a href="https://github.com/an-dev" rel="noopener nofollow ugc" target="_blank">Tốt</a>');
  });

  it("thoát cả nháy kép/đơn để không thoát khỏi thuộc tính (alt ảnh, canonical, meta)", () => {
    const html = renderer.render(input({ displayName: `An" onload="alert(1)`, headline: `x' onfocus='alert(1)` }));
    expect(html).not.toMatch(/onload="alert/);
    expect(html).not.toMatch(/onfocus='alert/);
    expect(html).toContain("&quot;");
  });

  it.each(PORTFOLIO_TEMPLATES.flatMap((t) => PORTFOLIO_ACCENTS.map((a) => [t, a] as const)))("mẫu %s × màu %s: không script, không handler on*, có lang/main/h1 duy nhất, ≤ htmlMaxBytes", (template, accent) => {
    const html = renderer.render(input({ theme: { template, accent } }));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).toContain('<html lang="vi">');
    expect(html).toContain("<main>");
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(Buffer.byteLength(html)).toBeLessThan(2 * 1024 * 1024);
    expect(html).toContain(`tpl-${template.toLowerCase()}`);
  });
});

describe("PortfolioRenderer — nội dung", () => {
  it("CR-04: 'Làm cùng 3 đồng đội', không tên đồng đội khi showTeammates=false", () => {
    const html = renderer.render(input());
    expect(html).toContain("Làm cùng 3 đồng đội");
    expect(html).not.toContain("Lan Anh");
    expect(html).toContain("40 task");
    expect(html).toContain("62 điểm");
    expect(html).toContain("90%");
    expect(html).toContain("Số liệu cập nhật lúc 26/09/2026 14:05");
  });

  it("CR-31: showTeammates=true → chỉ tên người đã đồng ý, người còn lại 'Đồng đội'", () => {
    const html = renderer.render(input({ projects: [{ project: { ...project(), showTeammates: true }, coverUrl: null }] }));
    expect(html).toContain("Làm cùng 3 đồng đội: Lan Anh, Đồng đội, Đồng đội");
  });

  it("xuống dòng trong giới thiệu/tóm tắt → <br>, không HTML", () => {
    const html = renderer.render(input());
    expect(html).toContain("Xây hệ thống kho.<br>Dòng hai.");
  });

  it("mục tắt không xuất hiện; thứ tự theo `order`; mục bật nhưng trống bị bỏ", () => {
    const html = renderer.render(
      input({
        sections: [
          { kind: "CONTACT", visible: true, order: 0 },
          { kind: "ABOUT", visible: true, order: 1 },
          { kind: "PROJECTS", visible: false, order: 2 },
          { kind: "SKILLS", visible: true, order: 3 },
        ],
        badges: [],
      })
    );
    expect(html).not.toContain('id="h-projects"');
    expect(html).not.toContain('id="h-skills"');
    expect(html.indexOf('id="h-contact"')).toBeLessThan(html.indexOf('id="h-about"'));
  });

  it("noindex mặc định (meta robots); bật SEO thì không có meta robots noindex; canonical + og:url", () => {
    expect(renderer.render(input())).toContain('<meta name="robots" content="noindex, nofollow">');
    const indexable = renderer.render(input({ seoIndexable: true }));
    expect(indexable).not.toContain("noindex");
    expect(indexable).toContain('<link rel="canonical" href="https://superapp.test/p/an-dev">');
    expect(indexable).toContain('<meta property="og:url" content="https://superapp.test/p/an-dev">');
  });

  it("xem trước: luôn noindex, banner, không canonical", () => {
    const html = renderer.render(input({ mode: "preview", seoIndexable: true }));
    expect(html).toContain("noindex, nofollow");
    expect(html).toContain("Bản xem trước");
    expect(html).not.toContain('rel="canonical"');
  });

  it("mẫu DEVELOPER dùng nền tối + color-scheme dark; mẫu còn lại nền sáng", () => {
    expect(renderer.render(input({ theme: { template: "DEVELOPER", accent: "BLUE" } }))).toContain('<meta name="color-scheme" content="dark">');
    expect(renderer.render(input({ theme: { template: "MINIMAL", accent: "BLUE" } }))).toContain('<meta name="color-scheme" content="light">');
  });

  it("vượt htmlMaxBytes → PortfolioHtmlTooLargeError (build FAILED, không phục vụ trang phình)", () => {
    const small = new PortfolioRenderer(500);
    expect(() => small.render(input())).toThrow(PortfolioHtmlTooLargeError);
  });
});
