import { applyFormSchema, addSkill, mentorPostFormSchema } from '../schemas/mentor.schemas';
import { invalidChannelIdsOf, isNotAvailable, mentorErrorMessage } from '../utils/mentor-errors';
import { mentorsNeededText, remainingText } from '../utils/mentor-format';
import { apiError } from './render-helpers';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25, 0, 0, 0);

describe('mentor schemas', () => {
  it('addSkill: bỏ trùng không phân biệt hoa/thường, gộp khoảng trắng, chặn > 10 kỹ năng và > 40 ký tự', () => {
    expect(addSkill(['React'], '  react ').skills).toEqual(['React']);
    expect(addSkill([], 'Node   JS').skills).toEqual(['Node JS']);
    const ten = Array.from({ length: 10 }, (_, i) => `ky-nang-${i}`);
    expect(addSkill(ten, 'Thêm').error).toBe('Tối đa 10 kỹ năng');
    expect(addSkill([], 'x'.repeat(41)).error).toBe('Mỗi kỹ năng tối đa 40 ký tự');
  });

  it('applyFormSchema: lời nhắn 20–1000 (sau trim); link hồ sơ trống hoặc https', () => {
    const ok = { message: 'Tôi có kinh nghiệm cố vấn đồ án.', portfolioUrl: '' };
    expect(applyFormSchema.safeParse(ok).success).toBe(true);
    expect(applyFormSchema.safeParse({ ...ok, message: '   ngắn   ' }).success).toBe(false);
    expect(applyFormSchema.safeParse({ ...ok, portfolioUrl: 'http://a.com' }).success).toBe(false);
    expect(applyFormSchema.safeParse({ ...ok, portfolioUrl: 'https://github.com/a' }).success).toBe(
      true,
    );
  });

  it('mentorPostFormSchema: tiêu đề ≥ 5, mô tả ≥ 20 ký tự', () => {
    expect(
      mentorPostFormSchema.safeParse({ description: 'x'.repeat(20), title: 'Bài 1' }).success,
    ).toBe(true);
    expect(mentorPostFormSchema.safeParse({ description: 'ngắn', title: 'Bài 1' }).success).toBe(
      false,
    );
  });
});

describe('mentor errors', () => {
  it('nhãn MENTOR_* của feature; 404/CFG_005 là "không khả dụng"; MENTOR_008 đọc details.channelIds', () => {
    expect(mentorErrorMessage(apiError(409, 'MENTOR_005'))).toBe(
      'Bài đã đủ cố vấn hoặc vừa thay đổi, tải lại rồi thử lại',
    );
    expect(isNotAvailable(apiError(404, 'PERM_404'))).toBe(true);
    expect(isNotAvailable(apiError(404, 'CFG_005'))).toBe(true);
    expect(isNotAvailable(apiError(409, 'MENTOR_002'))).toBe(false);
    expect(invalidChannelIdsOf(apiError(400, 'MENTOR_008', { channelIds: ['kenh-a', 3] }))).toEqual(
      ['kenh-a'],
    );
    expect(invalidChannelIdsOf(apiError(400, 'MENTOR_007'))).toEqual([]);
  });
});

describe('mentor format', () => {
  it('"Cần 2 · Đã có 1"; hạn còn lại theo ngày/giờ/đã hết', () => {
    expect(mentorsNeededText(2, 1)).toBe('Cần 2 · Đã có 1');
    expect(remainingText(new Date(NOW + 12 * DAY).toISOString(), NOW)).toBe('Còn 12 ngày');
    expect(remainingText(new Date(NOW + 5 * 3_600_000).toISOString(), NOW)).toBe('Còn 5 giờ');
    expect(remainingText(new Date(NOW - 1000).toISOString(), NOW)).toBe('Đã hết hạn');
  });
});
