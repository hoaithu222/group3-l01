import type {
  Portfolio,
  PortfolioBuild,
  PortfolioOverview,
  PortfolioProject,
  PortfolioSnapshot,
  PortfolioTemplateInfo,
} from '../api/portfolio.types';

/** Dữ liệu mẫu của p6-07 — hình dạng khớp `be/src/modules/portfolio/services/portfolio.presenter.ts`. */
export function makePortfolio(over: Partial<Portfolio> = {}): Portfolio {
  return {
    avatarAssetId: null,
    bio: 'Sinh viên năm cuối, thích làm giao diện.',
    createdAt: '2026-09-01T00:00:00.000Z',
    currentBuildVersion: null,
    displayName: 'Nguyễn Văn An',
    hasUnpublishedChanges: false,
    headline: 'Sinh viên CNTT',
    id: 'pf-1',
    links: [{ label: 'GitHub', url: 'https://github.com/an' }],
    publishedAt: null,
    sections: [
      { kind: 'ABOUT', order: 0, visible: true },
      { kind: 'PROJECTS', order: 1, visible: true },
      { kind: 'SKILLS', order: 2, visible: true },
      { kind: 'CONTACT', order: 3, visible: true },
    ],
    seoIndexable: false,
    slug: 'an-dev',
    status: 'DRAFT',
    takenDown: false,
    takenDownAt: null,
    theme: { accent: 'GREEN', template: 'CLASSIC' },
    unpublishedAt: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 3,
    ...over,
  };
}

export function makeSnapshot(over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    contributionPct: null,
    contributionSharePct: null,
    filesUploaded: 5,
    namedTeammates: [],
    onTimeRatePct: 90,
    peerReviewAvg: 8.2,
    storyPoints: 62,
    tasksDone: 40,
    teammatesCount: 3,
    ...over,
  };
}

export function makeProject(over: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    coverAssetId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    highlights: [],
    id: 'pj-1',
    order: 0,
    periodFrom: null,
    periodTo: null,
    role: null,
    showTeammates: false,
    snapshot: makeSnapshot(),
    snapshotAt: '2026-09-15T03:32:00.000Z',
    summary: null,
    title: 'Ứng dụng quản lý nhóm',
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 1,
    visible: true,
    workspaceId: 'ws-1',
    ...over,
  };
}

export function makeBuild(over: Partial<PortfolioBuild> = {}): PortfolioBuild {
  return {
    buildVersion: 1,
    createdAt: '2026-09-15T03:32:00.000Z',
    error: null,
    finishedAt: null,
    id: 'bd-1',
    portfolioVersion: 3,
    sizeBytes: null,
    status: 'QUEUED',
    trigger: 'PUBLISH',
    ...over,
  };
}

export function makeOverview(over: Partial<PortfolioOverview> = {}): PortfolioOverview {
  return {
    latestBuild: null,
    portfolio: makePortfolio(),
    projects: [makeProject()],
    publicUrl: null,
    ...over,
  };
}

export const TEMPLATES: PortfolioTemplateInfo[] = (
  ['CLASSIC', 'DEVELOPER', 'DESIGNER', 'MINIMAL'] as const
).map((template, index) => ({
  accents: [
    { accent: 'GREEN', color: '#0F766E', name: 'Xanh lá' },
    { accent: 'BLUE', color: '#1D4ED8', name: 'Xanh dương' },
  ],
  dark: template === 'DEVELOPER',
  description: `Mô tả mẫu ${String(index)}`,
  name: template === 'DEVELOPER' ? 'Lập trình viên' : `Mẫu số ${String(index)}`,
  previewImageUrl: null,
  template,
}));
