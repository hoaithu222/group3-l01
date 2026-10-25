import type { PersonKey } from "../../types";

/**
 * Tích hợp GitHub (cấp nhóm) HƯ CẤU và lịch sử webhook đã xử lý. GitHub App không lưu token (`credentials: null`, token cài đặt sinh theo yêu cầu) nên bản ghi
 * KHÔNG chứa bí mật nào. Tổ chức/repo/tài khoản là bịa; không có link ra ngoài (không `html_url`), tên người đăng là tên đăng nhập hư cấu có hậu tố `-demo`.
 */
export interface RepoSpec {
  id: string;
  fullName: string;
}

export type GithubEvent =
  | { kind: "push"; repo: number; who: string; branch: string; commits: string[]; created?: boolean }
  | { kind: "pr"; action: "opened" | "merged" | "labeled"; repo: number; who: string; number: number; title: string; head: string; mergedBy?: string }
  | { kind: "issue"; action: "opened" | "closed"; repo: number; who: string; number: number; title: string }
  | { kind: "release"; repo: number; who: string; tag: string; name: string };

/** Một dòng log: cách đây `d` ngày lúc `h:m` (giờ VN). */
export interface TimedEvent {
  d: number;
  h: number;
  m: number;
  ev: GithubEvent;
}

export interface IntegrationSeed {
  ws: string;
  /** installationId giả. */
  installation: string;
  account: string;
  repos: readonly RepoSpec[];
  createdBy: PersonKey;
  /** Tên kênh nhận tin tự động. */
  channel: string;
  /** Cách đây bao nhiêu ngày thì kết nối được tạo. */
  connectedDaysAgo: number;
  events: readonly TimedEvent[];
}

export const INTEGRATIONS: readonly IntegrationSeed[] = [
  {
    ws: "appdev",
    installation: "47120331",
    account: "tieugon-demo",
    repos: [
      { id: "908412301", fullName: "tieugon-demo/tieugon-mobile" },
      { id: "908412302", fullName: "tieugon-demo/tieugon-api" },
    ],
    createdBy: "thu",
    channel: "GitHub",
    connectedDaysAgo: 12,
    events: [
      { d: 11, h: 20, m: 5, ev: { kind: "push", repo: 0, who: "hoanglong-demo", branch: "feat/add-transaction", commits: ["feat: màn hình Thêm khoản chi", "fix: chặn ký tự lạ ở ô số tiền"], created: true } },
      { d: 11, h: 21, m: 10, ev: { kind: "pr", action: "opened", repo: 0, who: "hoanglong-demo", number: 7, title: "Thêm màn hình Thêm khoản chi", head: "feat/add-transaction" } },
      { d: 10, h: 9, m: 40, ev: { kind: "pr", action: "merged", repo: 0, who: "hoanglong-demo", number: 7, title: "Thêm màn hình Thêm khoản chi", head: "feat/add-transaction", mergedBy: "quocbao-demo" } },
      { d: 9, h: 14, m: 20, ev: { kind: "issue", action: "opened", repo: 0, who: "phuongthao-demo", number: 8, title: "App crash khi nhập số tiền có dấu chấm (1.5)" } },
      { d: 8, h: 22, m: 15, ev: { kind: "push", repo: 1, who: "quocbao-demo", branch: "main", commits: ["feat: API /transactions phân trang cursor", "feat: unique index (userId, clientId) chống tạo trùng", "test: thêm test phân trang"] } },
      { d: 7, h: 19, m: 30, ev: { kind: "pr", action: "opened", repo: 1, who: "duyhung-demo", number: 9, title: "API auth: refresh token xoay vòng", head: "feat/refresh-rotation" } },
      { d: 6, h: 10, m: 5, ev: { kind: "pr", action: "merged", repo: 1, who: "duyhung-demo", number: 9, title: "API auth: refresh token xoay vòng", head: "feat/refresh-rotation", mergedBy: "mentortuan-demo" } },
      { d: 5, h: 16, m: 45, ev: { kind: "issue", action: "closed", repo: 0, who: "hoanglong-demo", number: 8, title: "App crash khi nhập số tiền có dấu chấm (1.5)" } },
      { d: 5, h: 21, m: 0, ev: { kind: "push", repo: 0, who: "giahuy-demo", branch: "main", commits: ["chore: thêm commitlint và husky"] } },
      { d: 4, h: 20, m: 30, ev: { kind: "release", repo: 0, who: "thu-demo", tag: "v0.2.0", name: "Sprint 2 — đăng nhập và ghi khoản chi" } },
      { d: 2, h: 18, m: 20, ev: { kind: "pr", action: "opened", repo: 0, who: "minhanh-demo", number: 12, title: "Thống kê theo tuần: biểu đồ cột", head: "feat/weekly-stats" } },
      { d: 2, h: 18, m: 25, ev: { kind: "pr", action: "labeled", repo: 0, who: "thu-demo", number: 12, title: "Thống kê theo tuần: biểu đồ cột", head: "feat/weekly-stats" } },
      { d: 2, h: 21, m: 40, ev: { kind: "push", repo: 0, who: "minhanh-demo", branch: "feat/weekly-stats", commits: ["feat: biểu đồ cột theo ngày trong tuần", "feat: top 3 danh mục chi nhiều nhất"], created: true } },
      { d: 1, h: 10, m: 15, ev: { kind: "issue", action: "opened", repo: 0, who: "thuytrang-demo", number: 13, title: "Thêm chế độ tối (dark mode) theo bảng màu mới" } },
    ],
  },
  {
    ws: "backend",
    installation: "47120332",
    account: "clb-backend-demo",
    repos: [{ id: "908500711", fullName: "clb-backend-demo/booking-api" }],
    createdBy: "quocbao",
    channel: "GitHub",
    connectedDaysAgo: 14,
    events: [
      { d: 13, h: 20, m: 10, ev: { kind: "push", repo: 0, who: "quocbao-demo", branch: "main", commits: ["chore: khởi tạo Express và cấu trúc module", "chore: cấu hình eslint, prettier"] } },
      { d: 11, h: 21, m: 30, ev: { kind: "pr", action: "opened", repo: 0, who: "phuocloi-demo", number: 3, title: "Schema Prisma: User, Court, Booking", head: "feat/prisma-schema" } },
      { d: 10, h: 9, m: 15, ev: { kind: "pr", action: "merged", repo: 0, who: "phuocloi-demo", number: 3, title: "Schema Prisma: User, Court, Booking", head: "feat/prisma-schema", mergedBy: "quocbao-demo" } },
      { d: 8, h: 19, m: 50, ev: { kind: "pr", action: "opened", repo: 0, who: "duyhung-demo", number: 5, title: "API đặt sân chống trùng giờ", head: "feat/booking-overlap" } },
      { d: 7, h: 22, m: 5, ev: { kind: "issue", action: "opened", repo: 0, who: "tuankiet-demo", number: 6, title: "Hai request cùng đặt một khung giờ đều trả 201 (race condition)" } },
      { d: 5, h: 20, m: 40, ev: { kind: "push", repo: 0, who: "duyhung-demo", branch: "feat/booking-overlap", commits: ["fix: dùng unique index (courtId, startTime) và bắt lỗi duplicate key", "test: thêm test hai request đồng thời"] } },
      { d: 4, h: 10, m: 25, ev: { kind: "pr", action: "merged", repo: 0, who: "duyhung-demo", number: 5, title: "API đặt sân chống trùng giờ", head: "feat/booking-overlap", mergedBy: "mentortuan-demo" } },
      { d: 4, h: 10, m: 30, ev: { kind: "issue", action: "closed", repo: 0, who: "quocbao-demo", number: 6, title: "Hai request cùng đặt một khung giờ đều trả 201 (race condition)" } },
      { d: 3, h: 21, m: 0, ev: { kind: "release", repo: 0, who: "quocbao-demo", tag: "v0.1.0", name: "Sprint 5 — đặt sân chống trùng giờ" } },
    ],
  },
];
