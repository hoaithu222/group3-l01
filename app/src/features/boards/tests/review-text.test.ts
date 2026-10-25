import type { ReviewCancelReason, RoundCloseReason, TaskReviewStatus } from '../api/reviews.types';
import { reviewActionText } from '../utils/activity-review';
import { dropReviewHint } from '../utils/review-chip';
import { configFieldErrors } from '../utils/review-config-form';
import {
  CANCEL_REASON_TEXT,
  CLOSE_REASON_TEXT,
  reviewStatusText,
  roundStatusText,
} from '../utils/review-status-text';
import { moveBlockedText, reviewErrorMessage, scoreProblemText } from '../utils/review-text';
import { apiError, makeRound } from './review-fixtures';

/** p4-05 app.md §8: `review-text` — mọi `cancelReason`, trạng thái, câu chặn Done, mã lỗi `REVIEW_*`, activity. Hàm thuần. */

const CANCEL_REASONS: ReviewCancelReason[] = ['BECAME_ASSIGNEE', 'MANUAL', 'MEMBER_LEFT', 'REVIEW_DISABLED', 'ROUND_CLOSED'];
const CLOSE_REASONS: RoundCloseReason[] = ['APPROVED', 'CHANGES_REQUESTED', 'LEFT_REVIEW', 'REVIEW_DISABLED', 'TASK_DELETED', 'WAIVED'];

describe('lý do huỷ / đóng lượt', () => {
  it.each(CANCEL_REASONS)('cancelReason %s có câu tiếng Việt riêng', (reason) => {
    expect(CANCEL_REASON_TEXT[reason]).toMatch(/\S/);
  });

  it('mỗi cancelReason một câu KHÁC nhau (không gộp nghĩa)', () => {
    expect(new Set(CANCEL_REASONS.map((reason) => CANCEL_REASON_TEXT[reason])).size).toBe(CANCEL_REASONS.length);
    expect(CANCEL_REASON_TEXT.BECAME_ASSIGNEE).toBe('Người chấm đã trở thành người làm thẻ');
  });

  it.each(CLOSE_REASONS)('closeReason %s có câu tiếng Việt', (reason) => {
    expect(CLOSE_REASON_TEXT[reason]).toMatch(/\S/);
  });
});

describe('trạng thái', () => {
  it('review cá nhân: SUBMITTED (bị che) đọc là "Đã chấm", không lộ quyết định', () => {
    const texts: Record<TaskReviewStatus, string> = {
      APPROVED: 'Đã duyệt',
      CANCELLED: 'Đã huỷ',
      PENDING: 'Chưa chấm',
      REASSIGNED: 'Đã giao lại',
      REQUEST_CHANGES: 'Yêu cầu sửa',
      SUBMITTED: 'Đã chấm',
    };
    for (const [status, text] of Object.entries(texts)) expect(reviewStatusText({ status: status as TaskReviewStatus })).toBe(text);
  });

  it('lượt: "Chờ duyệt 1/2"; tự duyệt nói rõ vì thiếu người chấm', () => {
    expect(roundStatusText(makeRound({ approvedCount: 1 }))).toBe('Chờ duyệt 1/2');
    expect(roundStatusText(makeRound({ autoApproved: true, status: 'APPROVED' }))).toBe('Tự duyệt do nhóm không đủ người chấm');
    expect(roundStatusText(makeRound({ status: 'WAIVED' }))).toBe('Được miễn chấm');
    expect(roundStatusText(makeRound({ status: 'CHANGES_REQUESTED' }))).toBe('Cần sửa');
  });
});

describe('moveBlockedText (TASK_002 REVIEW_REQUIRED)', () => {
  it('lượt đang mở: "Cần 2 lượt duyệt, đã có 1"', () => {
    expect(moveBlockedText({ approvedCount: 1, requiredReviews: 2, roundStatus: 'OPEN' }).headline).toBe('Cần 2 lượt duyệt, đã có 1');
  });

  it('đang cần sửa / chưa từng vào Review: hướng dẫn bước tiếp theo', () => {
    expect(moveBlockedText({ approvedCount: 0, requiredReviews: 2, roundStatus: 'CHANGES_REQUESTED' }).hint).toMatch(/cột Review/);
    expect(moveBlockedText({ approvedCount: 0, requiredReviews: 2, roundStatus: 'NONE' }).headline).toBe(
      'Thẻ cần 2 lượt duyệt trước khi hoàn thành',
    );
  });
});

describe('gợi ý vùng thả khi kéo sang Hoàn thành', () => {
  it('chỉ khi CHẮC chưa đủ duyệt (PENDING/CHANGES_REQUESTED) và đang lướt qua cột DONE khác cột nguồn', () => {
    expect(dropReviewHint('PENDING', 'DONE', false)).toBe('Cần duyệt trước');
    expect(dropReviewHint('CHANGES_REQUESTED', 'DONE', false)).toBe('Cần duyệt trước');
    // NONE: bảng có thể không bật chấm chéo — không đoán, server quyết.
    expect(dropReviewHint('NONE', 'DONE', false)).toBeNull();
    expect(dropReviewHint('APPROVED', 'DONE', false)).toBeNull();
    expect(dropReviewHint('PENDING', 'IN_PROGRESS', false)).toBeNull();
    expect(dropReviewHint('PENDING', 'DONE', true)).toBeNull();
  });
});

describe('lỗi', () => {
  it('REVIEW_001..007 → câu riêng; mã lạ rơi về câu chung (không rỗng)', () => {
    expect(reviewErrorMessage(apiError('REVIEW_003', 403))).toBe('Bạn đang là người thực hiện thẻ này nên không thể tự chấm.');
    expect(reviewErrorMessage(apiError('REVIEW_006', 400))).toBe('Vui lòng ghi nhận xét khi yêu cầu sửa.');
    expect(reviewErrorMessage(apiError('XYZ_999', 500))).toMatch(/\S/);
  });

  it('câu lỗi tại ô điểm', () => {
    expect(scoreProblemText('MISSING', 4)).toBe('Chưa chấm ô này');
    expect(scoreProblemText('OUT_OF_RANGE', 4)).toBe('Điểm từ 0 đến 4');
    expect(scoreProblemText('INVALID_STEP', 4)).toBe('Điểm tính theo bước 0,5');
  });

  it('REVIEW_004 { rubric, reviewerPool } → tách lỗi tiêu chí khỏi phần còn lại; chi tiết hỏng → null', () => {
    expect(configFieldErrors({ rubric: ['Mã tiêu chí bị trùng', 'Tổng điểm tối đa phải lớn hơn 0'] })).toEqual({
      other: null,
      rubric: 'Mã tiêu chí bị trùng · Tổng điểm tối đa phải lớn hơn 0',
    });
    expect(configFieldErrors({ reviewerPool: ['1 người không phải thành viên'] }).other).toBe('1 người không phải thành viên');
    expect(configFieldErrors(undefined)).toEqual({ other: null, rubric: null });
    expect(configFieldErrors({ rubric: 'không phải mảng' })).toEqual({ other: null, rubric: null });
  });
});

describe('activity chấm chéo (không mang điểm)', () => {
  const activity = (type: string, after: unknown, before: unknown = null) =>
    ({ actor: null, after, before, createdAt: '', id: 'a1', type }) as never;

  it('giao / nộp / miễn / giao lại', () => {
    expect(reviewActionText(activity('REVIEW_REQUESTED', { reviewerIds: ['u1', 'u2'] }))).toBe('đã giao thẻ cho 2 người chấm');
    expect(reviewActionText(activity('REVIEW_REQUESTED', { autoApproved: true, reviewerIds: [] }))).toMatch(/tự duyệt/);
    expect(reviewActionText(activity('REVIEW_SUBMITTED', { status: 'REQUEST_CHANGES' }))).toBe('đã yêu cầu sửa thẻ');
    expect(reviewActionText(activity('REVIEW_WAIVED', { roundId: 'r' }))).toBe('đã miễn chấm cho thẻ');
    const names: Record<string, string> = { u1: 'Lan', u2: 'Minh' };
    expect(reviewActionText(activity('REVIEW_REASSIGNED', { userId: 'u2' }, { userId: 'u1' }), (id) => names[id])).toBe(
      'đã giao lại lượt chấm từ Lan sang Minh',
    );
    expect(reviewActionText(activity('REVIEW_REASSIGNED', { userId: null }, { userId: 'u1' }), (id) => names[id])).toBe(
      'đã bỏ lượt chấm của Lan',
    );
  });
});
