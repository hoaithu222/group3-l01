/**
 * DTO của p6-07 — khớp `be/src/modules/portfolio/services/portfolio.presenter.ts` (+ `dtos/portfolio.dto.ts` cho phần GỬI đi). Điểm/phần trăm ở
 * đơn vị HIỂN THỊ (BE đã chia 10). Chuỗi enum BE trả là `string` trơn; ở đây thu hẹp về union đúng giá trị BE (`entities/portfolio.interface.ts`).
 */
export type PortfolioTemplate = 'CLASSIC' | 'DEVELOPER' | 'DESIGNER' | 'MINIMAL';
export type PortfolioAccent = 'GREEN' | 'BLUE' | 'VIOLET' | 'ORANGE' | 'ROSE' | 'SLATE';
export type PortfolioSectionKind = 'ABOUT' | 'PROJECTS' | 'SKILLS' | 'CONTACT';
export type PortfolioStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
export type PortfolioBuildStatus = 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED';

export interface PortfolioLink {
  label: string;
  url: string;
}

export interface PortfolioSection {
  kind: PortfolioSectionKind;
  visible: boolean;
  order: number;
}

export interface Portfolio {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  links: PortfolioLink[];
  theme: { template: PortfolioTemplate; accent: PortfolioAccent };
  sections: PortfolioSection[];
  seoIndexable: boolean;
  status: PortfolioStatus;
  currentBuildVersion: number | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  /** `true` khi vận hành đã gỡ vi phạm (`PORT_008` khi công khai) — lý do gỡ KHÔNG bao giờ tới app. */
  takenDown: boolean;
  takenDownAt: string | null;
  /** `true` khi đang PUBLISHED mà hồ sơ/dự án đã đổi SAU lần dựng hiện hành ⇒ hiện nút "Cập nhật trang". */
  hasUnpublishedChanges: boolean;
  /** CAS — mọi `PUT` hồ sơ/slug/công khai gửi lại làm `expectedVersion`. `0` khi CHƯA có hồ sơ (tạo lười ở lần lưu đầu). */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSnapshot {
  tasksDone: number;
  storyPoints: number;
  /** `null` khi p4-06 chưa có dữ liệu. */
  onTimeRatePct: number | null;
  /** Điểm đóng góp 0–100 (công thức D-09); `null` khi chủ hồ sơ tắt `showContribution` hoặc chưa đủ dữ liệu. */
  contributionPct: number | null;
  /** % chiếm khối lượng của cả nhóm (cùng điều kiện). */
  contributionSharePct: number | null;
  /** Điểm review trung bình, thang 10. */
  peerReviewAvg: number | null;
  filesUploaded: number;
  teammatesCount: number;
  /** Chỉ có tên khi `showTeammates` VÀ người đó bật `appearInOthersPortfolios`; rỗng nếu không. */
  namedTeammates: string[];
}

export interface PortfolioProject {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  role: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  highlights: string[];
  coverAssetId: string | null;
  visible: boolean;
  order: number;
  showTeammates: boolean;
  snapshot: PortfolioSnapshot;
  snapshotAt: string;
  /** CAS riêng của DỰ ÁN (`PATCH` gửi làm `expectedVersion`). */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioBuild {
  id: string;
  buildVersion: number;
  status: PortfolioBuildStatus;
  trigger: 'PUBLISH' | 'SKILL_REVOKED' | 'RESTORE';
  portfolioVersion: number;
  sizeBytes: number | null;
  /** Câu tiếng Việt rút gọn của BE, không có stack. */
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** `GET /me/portfolio` — `portfolio: null` khi chưa tạo (BE tạo lười ở lần lưu / thêm dự án đầu tiên). */
export interface PortfolioOverview {
  portfolio: Portfolio | null;
  projects: PortfolioProject[];
  latestBuild: PortfolioBuild | null;
  /** `<PUBLIC_PORTFOLIO_BASE_URL>/<slug>` khi PUBLISHED và không bị gỡ; ngược lại `null`. */
  publicUrl: string | null;
}

export interface PortfolioTemplateInfo {
  template: PortfolioTemplate;
  name: string;
  description: string;
  /** Mẫu nền tối. */
  dark: boolean;
  /** BE luôn trả `null` (ảnh mẫu do app đóng gói) — app hiện mô tả chữ thay cho ảnh. */
  previewImageUrl: string | null;
  /** `color` = mã màu nhấn (BE đã kiểm tương phản) — dữ liệu từ server, không phải màu chép cứng trong app. */
  accents: { accent: PortfolioAccent; name: string; color: string }[];
}

export interface EligibleWorkspace {
  workspaceId: string;
  name: string;
  archived: boolean;
  /** Không còn là thành viên ACTIVE — nhãn "Đã rời nhóm". */
  left: boolean;
  myTasksDone: number;
  alreadyAdded: boolean;
}

export interface EligiblePage {
  items: EligibleWorkspace[];
  nextCursor: string | null;
}

export type SlugUnavailableReason = 'TAKEN' | 'INVALID' | 'BANNED' | 'RESERVED';

export interface SlugAvailability {
  available: boolean;
  reason?: SlugUnavailableReason;
}

/** Thân `PUT /me/portfolio` — BE `.strict()`: ghi ĐỦ mọi trường, KHÔNG trường lạ. */
export interface SavePortfolioInput {
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  links: PortfolioLink[];
  theme: { template: PortfolioTemplate; accent: PortfolioAccent };
  sections: PortfolioSection[];
  seoIndexable: boolean;
  expectedVersion: number;
}

/** Thân `PATCH /me/portfolio/projects/:id` — mọi trường tuỳ chọn trừ `expectedVersion`; BE `.strict()`. */
export interface UpdateProjectInput {
  title?: string;
  summary?: string | null;
  role?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  highlights?: string[];
  coverAssetId?: string | null;
  visible?: boolean;
  showTeammates?: boolean;
  expectedVersion: number;
}

export interface PublishResult {
  buildId: string;
  buildVersion: number;
}

/** Socket `portfolio:build-updated` (`user:{id}`) — payload v1. `url` chỉ khi READY, `error` chỉ khi FAILED. */
export interface PortfolioBuildUpdatedEvent {
  v: number;
  portfolioId: string;
  buildId: string;
  buildVersion: number;
  status: Exclude<PortfolioBuildStatus, 'QUEUED'>;
  url?: string;
  error?: string;
}
