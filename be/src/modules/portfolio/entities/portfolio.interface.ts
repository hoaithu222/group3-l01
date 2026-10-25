/**
 * Thực thể miền của `portfolio` (p6-07) — khai ĐỘC LẬP với kiểu Prisma (cùng giá trị) để service/test không import `@prisma/client` vào tầng domain.
 * Điểm/phần trăm lưu ×10 số nguyên (`…X10`, 91,0 → 910); chuyển sang số hiển thị ở `portfolio.presenter.ts`.
 */
export const PORTFOLIO_TEMPLATES = ["CLASSIC", "DEVELOPER", "DESIGNER", "MINIMAL"] as const;
export type PortfolioTemplate = (typeof PORTFOLIO_TEMPLATES)[number];

export const PORTFOLIO_ACCENTS = ["GREEN", "BLUE", "VIOLET", "ORANGE", "ROSE", "SLATE"] as const;
export type PortfolioAccent = (typeof PORTFOLIO_ACCENTS)[number];

export const PORTFOLIO_SECTION_KINDS = ["ABOUT", "PROJECTS", "SKILLS", "CONTACT"] as const;
export type PortfolioSectionKind = (typeof PORTFOLIO_SECTION_KINDS)[number];

export const PORTFOLIO_STATUSES = ["DRAFT", "PUBLISHED", "UNPUBLISHED"] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

export const BUILD_STATUSES = ["QUEUED", "BUILDING", "READY", "FAILED"] as const;
export type PortfolioBuildStatus = (typeof BUILD_STATUSES)[number];

export const BUILD_TRIGGERS = ["PUBLISH", "SKILL_REVOKED", "RESTORE"] as const;
export type PortfolioBuildTrigger = (typeof BUILD_TRIGGERS)[number];

export interface PortfolioLink {
  label: string;
  url: string;
}

export interface PortfolioTheme {
  template: PortfolioTemplate;
  accent: PortfolioAccent;
}

export interface PortfolioSection {
  kind: PortfolioSectionKind;
  visible: boolean;
  order: number;
}

export const DEFAULT_THEME: PortfolioTheme = { template: "CLASSIC", accent: "GREEN" };

export const DEFAULT_SECTIONS: readonly PortfolioSection[] = [
  { kind: "ABOUT", visible: true, order: 0 },
  { kind: "PROJECTS", visible: true, order: 1 },
  { kind: "SKILLS", visible: true, order: 2 },
  { kind: "CONTACT", visible: true, order: 3 },
];

export interface Portfolio {
  id: string;
  userId: string;
  slug: string;
  slugKey: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  links: PortfolioLink[];
  theme: PortfolioTheme;
  sections: PortfolioSection[];
  seoIndexable: boolean;
  status: PortfolioStatus;
  currentBuildVersion: number | null;
  nextBuildVersion: number;
  publishedAt: Date | null;
  unpublishedAt: Date | null;
  takenDownAt: Date | null;
  takenDownBy: string | null;
  takedownReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Số liệu hệ thống ghi nhận (xem `schema.prisma` `PortfolioSnapshot`). `null` = chưa có dữ liệu hoặc không được phép công khai. */
export interface PortfolioSnapshot {
  tasksDone: number;
  storyPointsX10: number;
  onTimeRatePct: number | null;
  contributionPctX10: number | null;
  contributionShareX10: number | null;
  peerReviewAvgX10: number | null;
  filesUploaded: number;
  teammatesCount: number;
  namedTeammates: string[];
  skillBadges: { skillId: string; code: string; name: string; icon: string; unlockedAt: Date }[];
}

export const EMPTY_SNAPSHOT: PortfolioSnapshot = {
  tasksDone: 0,
  storyPointsX10: 0,
  onTimeRatePct: null,
  contributionPctX10: null,
  contributionShareX10: null,
  peerReviewAvgX10: null,
  filesUploaded: 0,
  teammatesCount: 0,
  namedTeammates: [],
  skillBadges: [],
};

export interface PortfolioProject {
  id: string;
  portfolioId: string;
  userId: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  role: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  highlights: string[];
  coverAssetId: string | null;
  visible: boolean;
  order: number;
  showTeammates: boolean;
  snapshot: PortfolioSnapshot;
  snapshotAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioBuild {
  id: string;
  portfolioId: string;
  buildVersion: number;
  status: PortfolioBuildStatus;
  trigger: PortfolioBuildTrigger;
  portfolioVersion: number;
  storageKey: string | null;
  files: string[];
  sizeBytes: number | null;
  error: string | null;
  createdBy: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  purgedAt: Date | null;
}

export interface SlugReservation {
  id: string;
  slugKey: string;
  portfolioId: string;
  /** slugKey mới (301) hoặc `null` (hồ sơ đã bị xoá/ẩn danh hoá: 404 nhưng không ai khác lấy được). */
  redirectTo: string | null;
  expiresAt: Date;
  createdAt: Date;
}

/** Nguồn số liệu của MỘT (người, nhóm) — gộp các bảng của nhóm từ snapshot `ALL` của `contribution` (p4-06). */
export interface MemberStats {
  tasksDone: number;
  storyPointsX10: number;
  tasksWithDue: number;
  tasksOnTime: number;
  reviewCount: number;
  /** Σ (điểm chấm TB × số lượt chấm) — chia cho `reviewCount` ra điểm TB có trọng số (thang 10). */
  peerScoreWeightedSum: number;
}
