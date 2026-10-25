import type { SrSummary } from '../api/sr.types';
import type { StudySetSummaryDto } from '../api/study.types';
import { makeSet } from './fixtures';

/** Dữ liệu giả dùng chung cho test Trang chủ Học/thẻ bộ — hình dạng đúng như BE trả (`GET /study-sets`, `GET /sr/summary`). */

/** Một dòng của danh sách (`StudySetSummaryDto`) — `makeSet` trừ các trường CHỈ có ở bản chi tiết. */
export function makeSetSummary(overrides: Partial<StudySetSummaryDto> = {}): StudySetSummaryDto {
  const {
    myPermissions: _perms,
    hiddenAt: _at,
    hiddenReason: _reason,
    itemTypesMask: _mask,
    ...rest
  } = makeSet();
  return { ...rest, ...overrides };
}

/** Số đếm ôn tập hôm nay: 5 đến hạn + 7 thẻ mới, đã ôn 8, chuỗi 3 ngày. */
export function makeSrSummary(overrides: Partial<SrSummary> = {}): SrSummary {
  return {
    dueNext7Days: [],
    dueToday: 5,
    newToday: 7,
    reviewStreakDays: 3,
    reviewedToday: 8,
    serverNow: '2026-09-26T02:00:00.000Z',
    ...overrides,
  };
}
