import type {
  ContributionFormula,
  ContributionMember,
  ContributionPeriods,
  ContributionReport,
} from '../api/contribution.types';

/**
 * Nửa đầu của bộ dữ liệu giả p4-06 (hằng số + công thức + thành viên + báo cáo + kỳ) — tách khỏi `fixtures.ts` cho mỗi file ≤ 150
 * dòng (`check:file-size`). Các test vẫn nhập từ `./fixtures` (file đó re-export toàn bộ ở đây).
 */
export const WS = 'ws-1';
export const BOARD = 'b-1';
export const TZ = 'Asia/Ho_Chi_Minh';

/** Id thành viên hợp lệ (ObjectId 24 hex) — `?heat=` được kiểm dạng trước khi gọi API. */
export const USER_A = 'a'.repeat(24);
export const USER_B = 'b'.repeat(24);
export const USER_C = 'c'.repeat(24);

export const FORMULA: ContributionFormula = {
  changedAt: null,
  changedBy: null,
  definitions: {
    onTime: 'Tỷ lệ thẻ hoàn thành đúng hạn trên thẻ có hạn.',
    peer: 'Điểm trung bình bạn cùng nhóm chấm (thang 10).',
    points: 'Điểm thẻ đã hoàn thành so với người nhiều nhất nhóm.',
  },
  formulaVersion: 1,
  onTimeGraceHours: 0,
  previousWeights: null,
  unestimatedPoints: 1,
  weights: { onTime: 20, peer: 20, points: 60 },
};

/** Người đủ ba thành phần: 91,0 điểm · 58,7% — khớp ví dụ PM2-33 của kế hoạch. */
export function makeMember(over: Partial<ContributionMember> & { id?: string; name?: string } = {}): ContributionMember {
  const { id = USER_A, name = 'Nguyễn Văn A', ...rest } = over;
  return {
    components: { onTime: 0.75, peer: 0.8, points: 1 },
    explanation: '60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0',
    peerScoreAvg: 8,
    reviewCount: 5,
    score: 91,
    share: 58.7,
    storyPointsDone: 8,
    tasksDone: 4,
    tasksLate: 1,
    tasksOnTime: 3,
    tasksWithDue: 4,
    unestimatedTasks: 0,
    user: { avatarUrl: null, id, membership: 'ACTIVE', name },
    weightsUsed: { onTime: 20, peer: 20, points: 60 },
    ...rest,
  };
}

/** Người chưa có thẻ có hạn và chưa có lượt chấm: chỉ còn thành phần điểm thẻ, trọng số chia lại. */
export function makePointsOnlyMember(over: Partial<ContributionMember> & { id?: string; name?: string } = {}): ContributionMember {
  return makeMember({
    components: { onTime: null, peer: null, points: 0.5 },
    explanation: '100 × 4/8 = 50,0',
    id: USER_B,
    name: 'Trần Thị B',
    peerScoreAvg: null,
    reviewCount: 0,
    score: 50,
    share: 41.3,
    storyPointsDone: 4,
    tasksDone: 2,
    tasksLate: 0,
    tasksOnTime: 0,
    tasksWithDue: 0,
    weightsUsed: { onTime: 0, peer: 0, points: 100 },
    ...over,
  });
}

export function makeReport(over: Partial<ContributionReport> = {}): ContributionReport {
  return {
    boardId: BOARD,
    computedAt: '2026-09-15T03:32:00.000Z',
    formula: FORMULA,
    maxStoryPoints: 8,
    members: [makeMember(), makePointsOnlyMember()],
    period: { from: null, key: 'ALL', timezone: TZ, to: null },
    stale: false,
    totals: { storyPointsDone: 12, tasksDone: 6 },
    ...over,
  };
}

export const PERIODS: ContributionPeriods = {
  months: ['M:2026-09', 'M:2026-08'],
  timezone: TZ,
  weeks: ['W:2026-W37', 'W:2026-W36'],
};
