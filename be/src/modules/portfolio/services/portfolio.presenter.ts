import type { Portfolio, PortfolioBuild, PortfolioProject, PortfolioSnapshot } from "../entities/portfolio.interface";

/** DTO trả client — số hiển thị (không còn ×10). Không lộ `takenDownBy`/`takedownReason` (nội dung xử lý của vận hành). */
export interface SnapshotDto {
  tasksDone: number;
  storyPoints: number;
  onTimeRatePct: number | null;
  /** Điểm đóng góp 0–100 (công thức D-09); `null` khi chủ hồ sơ tắt `showContribution` hoặc chưa đủ dữ liệu. */
  contributionPct: number | null;
  /** % chiếm khối lượng của cả nhóm (cùng điều kiện). */
  contributionSharePct: number | null;
  /** Điểm review trung bình thang 10. */
  peerReviewAvg: number | null;
  filesUploaded: number;
  teammatesCount: number;
  namedTeammates: string[];
}

export interface PortfolioProjectDto {
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
  snapshot: SnapshotDto;
  snapshotAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioDto {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  links: { label: string; url: string }[];
  theme: { template: string; accent: string };
  sections: { kind: string; visible: boolean; order: number }[];
  seoIndexable: boolean;
  status: string;
  currentBuildVersion: number | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  takenDown: boolean;
  takenDownAt: string | null;
  /** `true` khi đang PUBLISHED mà hồ sơ/dự án đã đổi SAU lần dựng hiện hành — app hiện nút "Cập nhật trang". */
  hasUnpublishedChanges: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioBuildDto {
  id: string;
  buildVersion: number;
  status: string;
  trigger: string;
  /** `Portfolio.version` lúc yêu cầu dựng. */
  portfolioVersion: number;
  sizeBytes: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface PortfolioOverviewDto {
  portfolio: PortfolioDto | null;
  projects: PortfolioProjectDto[];
  latestBuild: PortfolioBuildDto | null;
  /** `<PUBLIC_PORTFOLIO_BASE_URL>/<slug>` khi PUBLISHED và không bị gỡ; ngược lại `null`. */
  publicUrl: string | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const x10 = (n: number | null): number | null => (n === null ? null : n / 10);

export function presentSnapshot(s: PortfolioSnapshot): SnapshotDto {
  return {
    tasksDone: s.tasksDone,
    storyPoints: s.storyPointsX10 / 10,
    onTimeRatePct: s.onTimeRatePct,
    contributionPct: x10(s.contributionPctX10),
    contributionSharePct: x10(s.contributionShareX10),
    peerReviewAvg: x10(s.peerReviewAvgX10),
    filesUploaded: s.filesUploaded,
    teammatesCount: s.teammatesCount,
    namedTeammates: [...s.namedTeammates],
  };
}

export function presentProject(p: PortfolioProject): PortfolioProjectDto {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    title: p.title,
    summary: p.summary,
    role: p.role,
    periodFrom: iso(p.periodFrom),
    periodTo: iso(p.periodTo),
    highlights: [...p.highlights],
    coverAssetId: p.coverAssetId,
    visible: p.visible,
    order: p.order,
    showTeammates: p.showTeammates,
    snapshot: presentSnapshot(p.snapshot),
    snapshotAt: p.snapshotAt.toISOString(),
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function presentBuild(b: PortfolioBuild): PortfolioBuildDto {
  return {
    id: b.id,
    buildVersion: b.buildVersion,
    status: b.status,
    trigger: b.trigger,
    portfolioVersion: b.portfolioVersion,
    sizeBytes: b.sizeBytes,
    error: b.error,
    createdAt: b.createdAt.toISOString(),
    finishedAt: iso(b.finishedAt),
  };
}

export function presentPortfolio(p: Portfolio, opts: { hasUnpublishedChanges: boolean }): PortfolioDto {
  return {
    id: p.id,
    slug: p.slug,
    displayName: p.displayName,
    headline: p.headline,
    bio: p.bio,
    avatarAssetId: p.avatarAssetId,
    links: p.links.map((l) => ({ label: l.label, url: l.url })),
    theme: { ...p.theme },
    sections: p.sections.map((s) => ({ ...s })),
    seoIndexable: p.seoIndexable,
    status: p.status,
    currentBuildVersion: p.currentBuildVersion,
    publishedAt: iso(p.publishedAt),
    unpublishedAt: iso(p.unpublishedAt),
    takenDown: p.takenDownAt !== null,
    takenDownAt: iso(p.takenDownAt),
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Bản cho quản trị (drawer báo cáo p1-08): metadata + trạng thái gỡ, KHÔNG nội dung hồ sơ/dự án. */
export interface AdminPortfolioDto {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  status: string;
  publicUrl: string | null;
  takenDownAt: string | null;
  takenDownBy: string | null;
  takedownReason: string | null;
  publishedAt: string | null;
  version: number;
}

export function presentAdminPortfolio(p: Portfolio, publicUrl: string | null): AdminPortfolioDto {
  return {
    id: p.id,
    userId: p.userId,
    slug: p.slug,
    displayName: p.displayName,
    status: p.status,
    publicUrl,
    takenDownAt: iso(p.takenDownAt),
    takenDownBy: p.takenDownBy,
    takedownReason: p.takedownReason,
    publishedAt: iso(p.publishedAt),
    version: p.version,
  };
}
