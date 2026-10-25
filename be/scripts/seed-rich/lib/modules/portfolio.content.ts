/**
 * Nội dung portfolio mẫu của 6 người (thu + 5 người). Dự án lấy từ chính các nhóm họ tham gia (khoá nhóm = `WorkspaceSpec.key`); dự án chỉ được thêm
 * khi người đó có ≥ 1 thẻ hoàn thành ở nhóm (đúng điều kiện `PortfolioProjectService.add`). Liên kết GitHub là HƯ CẤU (tài khoản `<khoá>-sv-demo`).
 * Giới hạn (`LIMITS.portfolio`): headline ≤ 120, bio ≤ 600, ≤ 6 liên kết (nhãn ≤ 30), tiêu đề dự án ≤ 80, tóm tắt ≤ 500, vai trò ≤ 60, ≤ 3 điểm nhấn ≤ 160.
 */
export type PortfolioTemplateName = "CLASSIC" | "DEVELOPER" | "DESIGNER" | "MINIMAL";
export type PortfolioAccentName = "GREEN" | "BLUE" | "VIOLET" | "ORANGE" | "ROSE" | "SLATE";

export interface PortfolioProjectText {
  /** Khoá nhóm làm việc (`frontend`, `appdev`, `backend`, `capstone`, `uiux`…). */
  ws: string;
  title: string;
  summary: string;
  role: string;
  highlights: string[];
  /** Có hiện tên đồng đội (chỉ người đã bật `appearInOthersPortfolios` mới được nêu tên). */
  showTeammates: boolean;
}

export interface PortfolioSpec {
  key: string;
  /** `DRAFT`: chưa công khai (app hiện nút "Công khai"). `UNPUBLISHED`: đã từng công khai rồi ngừng (build cũ đã dọn). */
  status: "DRAFT" | "UNPUBLISHED";
  template: PortfolioTemplateName;
  accent: PortfolioAccentName;
  /** Slug tuỳ chọn người dùng đặt sau khi hồ sơ được tạo với slug tự sinh (slug cũ được giữ 30 ngày, chuyển hướng 301 sang slug mới). */
  customSlug?: string;
  /** Hồ sơ được tạo cách đây bao nhiêu ngày. */
  createdDaysAgo: number;
  headline: string;
  bio: string;
  links: Array<{ label: string; url: string }>;
  projects: PortfolioProjectText[];
}

const gh = (key: string, repo: string): string => `https://github.com/${key}-sv-demo/${repo}`;

export const PORTFOLIOS: readonly PortfolioSpec[] = [
  {
    key: "thu",
    status: "DRAFT",
    template: "DEVELOPER",
    accent: "BLUE",
    customSlug: "thu-fullstack",
    createdDaysAgo: 9,
    headline: "Sinh viên CNTT · định hướng Fullstack (React + Node.js)",
    bio: "Mình là sinh viên CNTT, đang làm trưởng nhóm dự án Tiêu Gọn — ứng dụng quản lý chi tiêu cho sinh viên viết bằng React Native và Node.js/MongoDB. Mình thích chia nhỏ công việc bằng bảng Kanban, review code cho bạn cùng nhóm và viết tài liệu để người đến sau dễ tiếp tục. Đang tìm cơ hội thực tập Fullstack để học thêm về quy trình làm sản phẩm thật.",
    links: [
      { label: "GitHub — Tiêu Gọn", url: gh("thu", "tieu-gon-app") },
      { label: "GitHub — Bài tập Front-end", url: gh("thu", "frontend-bai-tap") },
    ],
    projects: [
      {
        ws: "appdev",
        title: "Tiêu Gọn — quản lý chi tiêu sinh viên",
        summary: "Ứng dụng di động ghi chép và thống kê chi tiêu hằng ngày cho sinh viên: nhập khoản chi nhanh, phân loại, xem thống kê tuần/tháng và nhắc ghi chép mỗi tối. App viết bằng React Native + Expo, backend Node.js/Express + MongoDB.",
        role: "Trưởng nhóm · Fullstack",
        highlights: ["Chia việc theo bảng Kanban, chốt sprint hằng tuần với cả nhóm", "Viết tài liệu API và hướng dẫn chạy dự án để thành viên mới vào việc nhanh", "Review code các PR liên quan tới luồng nhập khoản chi"],
        showTeammates: true,
      },
      {
        ws: "capstone",
        title: "Đồ án quản lý thư viện trường",
        summary: "Tham gia đồ án tốt nghiệp của nhóm bạn: web React + Node/Express + MongoDB với nghiệp vụ mượn–trả, phạt trễ hạn và tìm kiếm sách.",
        role: "Thành viên · hỗ trợ kiểm thử",
        highlights: ["Viết kịch bản kiểm thử cho luồng mượn–trả sách", "Góp ý thiết kế màn hình tìm kiếm"],
        showTeammates: true,
      },
      {
        ws: "backend",
        title: "CLB Backend Node.js",
        summary: "Quản trị viên của câu lạc bộ học backend Node.js: mỗi sprint làm một API thật với Express, MongoDB/Prisma và Docker, có mentor review code.",
        role: "Quản trị viên CLB",
        highlights: ["Điều phối lịch sprint và theo dõi bảng công việc", "Thực hành Express, Prisma và deploy qua Docker"],
        showTeammates: false,
      },
      {
        ws: "frontend",
        title: "Nhóm học Front-end",
        summary: "Lập nhóm tự học front-end theo lộ trình 8 tuần (HTML, CSS, JavaScript, React): làm bài tập, review code cho nhau và chia sẻ tài liệu.",
        role: "Người sáng lập nhóm",
        highlights: ["Tổ chức lộ trình 8 tuần và buổi review code hằng tuần", "Hoàn thành bài tập React Hooks của nhóm"],
        showTeammates: true,
      },
      {
        ws: "uiux",
        title: "Đồ án thiết kế app Học nhóm",
        summary: "Cùng nhóm UI/UX thiết kế lại luồng onboarding của app Học nhóm bằng Figma, từ phỏng vấn người dùng tới prototype.",
        role: "Thành viên · nghiên cứu người dùng",
        highlights: ["Phỏng vấn người dùng và tổng hợp insight", "Vẽ wireframe luồng đăng ký nhóm"],
        showTeammates: true,
      },
    ],
  },
  {
    key: "phuocloi",
    status: "DRAFT",
    template: "CLASSIC",
    accent: "ORANGE",
    customSlug: "phuocloi-database",
    createdDaysAgo: 10,
    headline: "SV năm 4 · thiết kế CSDL & Backend",
    bio: "Mình phụ trách phần cơ sở dữ liệu của nhóm đồ án quản lý thư viện: vẽ ERD, chốt schema và viết truy vấn thống kê. Mình thích chuẩn hoá dữ liệu cẩn thận trước khi viết code, vì sửa schema về sau luôn tốn công hơn nhiều. Đang tìm vị trí Backend/Database cấp junior.",
    links: [
      { label: "GitHub — CSDL thư viện", url: gh("phuocloi", "thu-vien-database") },
      { label: "GitHub — API đặt sân", url: gh("phuocloi", "api-dat-san") },
    ],
    projects: [
      {
        ws: "capstone",
        title: "Đồ án quản lý thư viện — thiết kế CSDL",
        summary: "Phụ trách cơ sở dữ liệu của đồ án quản lý thư viện trường: mô hình hoá nghiệp vụ mượn–trả, phạt trễ hạn và tìm kiếm sách, rồi chốt schema cho cả nhóm.",
        role: "Phụ trách CSDL · Backend",
        highlights: ["Vẽ ERD và chốt schema trước khi nhóm viết API", "Viết truy vấn thống kê sách được mượn nhiều nhất"],
        showTeammates: true,
      },
      {
        ws: "backend",
        title: "CLB Backend Node.js",
        summary: "Thành viên CLB backend: thực hành Express, MongoDB/Prisma và Docker qua dự án thật mỗi sprint, review PR chéo với các bạn trong CLB.",
        role: "Thành viên",
        highlights: ["Góp ý thiết kế index cho truy vấn theo ngày"],
        showTeammates: false,
      },
    ],
  },
  {
    key: "quocbao",
    status: "DRAFT",
    template: "CLASSIC",
    accent: "GREEN",
    createdDaysAgo: 8,
    headline: "SV năm 4 · Backend Node.js/MongoDB",
    bio: "Mình tập trung vào backend: thiết kế API REST gọn, mô hình dữ liệu MongoDB và tối ưu truy vấn. Mình là trưởng CLB Backend Node.js, mỗi sprint cả nhóm làm một dịch vụ thật và review code chéo. Mình đang tìm vị trí Backend Junior.",
    links: [
      { label: "GitHub — API đặt sân", url: gh("quocbao", "api-dat-san") },
      { label: "GitHub — API Tiêu Gọn", url: gh("quocbao", "tieu-gon-api") },
    ],
    projects: [
      {
        ws: "backend",
        title: "CLB Backend Node.js",
        summary: "Trưởng câu lạc bộ học backend: mỗi sprint hai tuần làm một API thật (sprint hiện tại là API đặt sân thể thao) với Express, MongoDB/Prisma và Docker.",
        role: "Trưởng CLB · Backend",
        highlights: ["Lập kế hoạch sprint và chia việc theo bảng Kanban", "Đặt quy ước PR nhỏ, có mô tả và có test", "Thiết kế schema MongoDB cho dịch vụ đặt sân"],
        showTeammates: true,
      },
      {
        ws: "appdev",
        title: "Tiêu Gọn — API chi tiêu",
        summary: "Phụ trách backend của app Tiêu Gọn: API ghi chép khoản chi, thống kê theo danh mục và xác thực người dùng bằng JWT.",
        role: "Backend (Node.js/Express)",
        highlights: ["Thiết kế API ghi chép và thống kê khoản chi", "Cấu hình index MongoDB cho truy vấn theo ngày"],
        showTeammates: true,
      },
    ],
  },
  {
    key: "thuytrang",
    status: "DRAFT",
    template: "DESIGNER",
    accent: "ROSE",
    createdDaysAgo: 7,
    headline: "Học UI/UX · thích bảng màu pastel",
    bio: "Mình học thiết kế giao diện và trải nghiệm người dùng, dùng Figma hằng ngày. Mình thích những giao diện nhẹ nhàng, màu pastel nhưng vẫn đủ tương phản và dễ đọc. Hiện mình đang dẫn nhóm UI/UX cùng làm đồ án thiết kế app Học nhóm và đang tìm thực tập thiết kế sản phẩm.",
    links: [
      { label: "Behance — Học nhóm (demo)", url: "https://www.behance.net/thuytrang-sv-demo" },
      { label: "Figma — Prototype Học nhóm", url: "https://www.figma.com/proto/thuytrang-sv-demo/hoc-nhom" },
    ],
    projects: [
      {
        ws: "uiux",
        title: "Đồ án thiết kế app Học nhóm",
        summary: "Dẫn nhóm thiết kế app Học nhóm từ nghiên cứu người dùng, wireframe tới prototype Figma; mỗi tuần có buổi critique để cả nhóm góp ý.",
        role: "Trưởng nhóm thiết kế",
        highlights: ["Tổ chức buổi critique hằng tuần", "Xây bộ design token và component trong Figma"],
        showTeammates: true,
      },
      {
        ws: "appdev",
        title: "Tiêu Gọn — giao diện app",
        summary: "Thiết kế giao diện cho app Tiêu Gọn: luồng nhập khoản chi nhanh, màn hình thống kê và bộ biểu tượng danh mục.",
        role: "UI/UX Designer",
        highlights: ["Thiết kế luồng nhập khoản chi ít thao tác", "Chuẩn hoá bảng màu và khoảng cách cho toàn app"],
        showTeammates: true,
      },
    ],
  },
  {
    key: "thaonguyen",
    status: "DRAFT",
    template: "DESIGNER",
    accent: "VIOLET",
    createdDaysAgo: 5,
    headline: "SV năm 2 · UI/UX · thích vẽ wireframe",
    bio: "Mình thích bắt đầu mọi thiết kế bằng wireframe đơn giản trên giấy rồi mới đưa lên Figma, vì như vậy dễ bỏ ý chưa ổn mà không tiếc công. Mình là quản trị viên nhóm học UI/UX, hay làm bài tập nghiên cứu người dùng cùng các bạn. Đang tìm thực tập thiết kế giao diện.",
    links: [{ label: "Figma — Wireframe Học nhóm", url: "https://www.figma.com/design/thaonguyen-sv-demo/wireframe-hoc-nhom" }],
    projects: [
      {
        ws: "uiux",
        title: "Đồ án thiết kế app Học nhóm — wireframe",
        summary: "Phụ trách wireframe low-fi và mid-fi cho luồng đăng ký và tham gia nhóm của app Học nhóm, sau đó cùng cả nhóm critique và chỉnh lại trước khi lên prototype.",
        role: "Quản trị viên nhóm · Wireframe",
        highlights: ["Vẽ wireframe cho luồng đăng ký và tham gia nhóm", "Tổng hợp phản hồi sau buổi critique để chỉnh lại màn hình"],
        showTeammates: true,
      },
    ],
  },
  {
    key: "ngocdiep",
    status: "UNPUBLISHED",
    template: "CLASSIC",
    accent: "SLATE",
    createdDaysAgo: 14,
    headline: "SV năm 4 · trưởng nhóm đồ án tốt nghiệp",
    bio: "Mình là trưởng nhóm đồ án “Hệ thống quản lý thư viện trường”. Công việc chính của mình là giữ timeline, chia việc rõ người rõ hạn và làm cầu nối với thầy hướng dẫn. Mình đã tạm ngừng công khai trang này để cập nhật lại sau khi bảo vệ đồ án.",
    links: [{ label: "GitHub — Quản lý thư viện", url: gh("ngocdiep", "quan-ly-thu-vien") }],
    projects: [
      {
        ws: "capstone",
        title: "Đồ án quản lý thư viện trường",
        summary: "Trưởng nhóm đồ án tốt nghiệp: web React + Node/Express + MongoDB với nghiệp vụ mượn–trả, phạt trễ hạn, tìm kiếm sách và thống kê.",
        role: "Trưởng nhóm · quản lý tiến độ",
        highlights: ["Lập timeline nộp báo cáo và bảo vệ, nhắc hạn cả nhóm", "Chia việc theo bảng Kanban và theo dõi tiến độ mỗi tuần"],
        showTeammates: true,
      },
      {
        ws: "frontend",
        title: "Nhóm học Front-end",
        summary: "Thành viên nhóm học front-end: ôn lại HTML/CSS/JavaScript và thực hành React để làm giao diện cho đồ án.",
        role: "Thành viên",
        highlights: ["Làm bài tập React Hooks và áp dụng vào giao diện đồ án"],
        showTeammates: false,
      },
    ],
  },
];
