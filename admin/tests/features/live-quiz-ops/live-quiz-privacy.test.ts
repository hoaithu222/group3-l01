/**
 * Riêng tư của giám sát Live Quiz (p5-01 admin.md §4 "Test riêng tư"): mã nguồn phân hệ không khai/đọc PIN, nội dung câu hỏi hay đáp án từng người,
 * và service chỉ gọi đúng ba route (list, chi tiết, kết thúc). Đọc mã nguồn dạng chuỗi (không dùng `fs`: tsconfig.app không nạp type của Node).
 */
import { describe, expect, it } from 'vitest';

import {
  liveQuizEndReasonLabel,
  LIVE_QUIZ_END_REASON_LABELS,
} from '@/features/live-quiz-ops/constants/live-quiz-ops.constants';
import { progressLabel, shortId } from '@/features/live-quiz-ops/utils/live-quiz-ops.utils';

const SOURCES = import.meta.glob('../../../src/features/live-quiz-ops/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const entries = Object.entries(SOURCES).map(([path, raw]) => [path, stripComments(raw)] as const);
const inFile = (suffix: string) => entries.filter(([path]) => path.endsWith(suffix));

describe('live-quiz-ops — mã nguồn không chạm PIN/câu hỏi/đáp án', () => {
  it('quét được đủ các file của phân hệ (không quét rỗng)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(12);
  });

  it('kiểu dữ liệu không khai pin, câu hỏi, lựa chọn, đáp án từng người', () => {
    const types = inFile('live-quiz-ops.types.ts');
    expect(types).toHaveLength(1);
    // Khai báo thuộc tính (`pin: string`, `answers?: …`) — không quét chữ trong chuỗi/kiểu union.
    const forbidden =
      /\b(pin|answers?|questions?|choices?|options|prompt|explanation|itemId)\s*[?:]/;
    expect(forbidden.exec(types[0][1])?.[0]).toBeUndefined();
  });

  it('không file nào đọc `.pin` / `.answers` / `.questions` của dữ liệu', () => {
    const access = /\.(pin|answers?|questions?|choices?|explanation)\b/;
    const offenders = entries.filter(([, code]) => access.test(code)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('service chỉ gọi ba route: list (GET), chi tiết (GET), kết thúc (POST) — không PUT/PATCH/DELETE', () => {
    const service = inFile('live-quiz-ops.service.ts');
    expect(service).toHaveLength(1);
    expect(service[0][1]).toMatch(/apiClient\.get\b/);
    expect(service[0][1]).toMatch(/apiClient\.post\b/);
    expect(service[0][1]).not.toMatch(/apiClient\.(put|patch|delete)\b/);
    expect(service[0][1].match(/apiClient\.post/g)).toHaveLength(1);
  });
});

describe('live-quiz-ops — tiện ích', () => {
  it('shortId: # + 6 ký tự cuối', () => {
    expect(shortId('650000000000000000000abc')).toBe('#000abc');
  });

  it('progressLabel: sảnh chờ "— / n", đang chơi "câu hiện tại / n", kẹp không vượt tổng', () => {
    expect(progressLabel({ status: 'WAITING', currentIndex: 0, total: 10 })).toBe('— / 10');
    expect(progressLabel({ status: 'IN_PROGRESS', currentIndex: 2, total: 10 })).toBe('3 / 10');
    expect(progressLabel({ status: 'FINISHED', currentIndex: 10, total: 10 })).toBe('10 / 10');
  });

  it('nhãn lý do kết thúc: đủ mã BE, lý do lạ → chính mã, null → "—"', () => {
    expect(Object.keys(LIVE_QUIZ_END_REASON_LABELS).sort()).toEqual(
      ['ADMIN_ENDED', 'COMPLETED', 'EXPIRED', 'HOST_ENDED', 'HOST_TIMEOUT'].sort(),
    );
    expect(liveQuizEndReasonLabel('ADMIN_ENDED')).toBe('Quản trị nền tảng kết thúc');
    expect(liveQuizEndReasonLabel('NEW_REASON')).toBe('NEW_REASON');
    expect(liveQuizEndReasonLabel(null)).toBe('—');
  });
});
