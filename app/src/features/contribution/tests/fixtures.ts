import type {
  ContributionConfig,
  ContributionExport,
  Heatmap,
  MemberTaskItem,
} from '../api/contribution.types';
import { FORMULA, TZ } from './fixtures.base';

/** Hằng số, công thức, thành viên, báo cáo, kỳ — ở `fixtures.base.ts` (tách cho ≤ 150 dòng); re-export để test nhập từ một chỗ. */
export * from './fixtures.base';

export function makeConfig(over: Partial<ContributionConfig> = {}): ContributionConfig {
  return {
    changedAt: null,
    changedBy: null,
    definitions: FORMULA.definitions,
    isDefault: true,
    onTimeGraceHours: 0,
    previousWeights: null,
    unestimatedPoints: 1,
    version: 3,
    weights: { onTime: 20, peer: 20, points: 60 },
    ...over,
  };
}

export function makeHeatmap(over: Partial<Heatmap> = {}): Heatmap {
  return {
    days: [
      { checklist: 0, comment: 2, date: '2026-09-15', review: 1, task: 4, total: 7 },
      { checklist: 0, comment: 0, date: '2026-09-14', review: 0, task: 2, total: 2 },
    ],
    from: '2026-03-23',
    maxTotal: 7,
    timezone: TZ,
    to: '2026-09-15',
    ...over,
  };
}

export function makeExport(over: Partial<ContributionExport> = {}): ContributionExport {
  return {
    createdAt: '2026-09-15T03:30:00.000Z',
    dataHash: 'a'.repeat(64),
    expiresAt: '2026-10-15T03:30:00.000Z',
    id: 'e-1',
    includeHeatmap: true,
    periodKey: 'ALL',
    readyAt: '2026-09-15T03:31:00.000Z',
    status: 'READY',
    verifyCode: 'ABCD123456',
    ...over,
  };
}

export function makeTask(over: Partial<MemberTaskItem> = {}): MemberTaskItem {
  return {
    assigneeCount: 1,
    completedAt: '2026-09-14T10:00:00.000Z',
    deleted: false,
    dueDate: '2026-09-15T16:59:59.000Z',
    onTime: true,
    reviewCount: 2,
    reviewScoreAvg: 8,
    sharedPoints: 3,
    storyPoints: 3,
    taskId: 't-1',
    title: 'Viết báo cáo',
    ...over,
  };
}
