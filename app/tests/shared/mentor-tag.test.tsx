import { render, screen } from '@testing-library/react-native';

import { isMentorTag, MemberMentorTag, MentorTag, MENTOR_DISPLAY_TAG } from '@/shared/mentor';

/**
 * Nhãn "Cố vấn" dùng chung (p6-03): `mentor` (đợt cố vấn) và `members` (danh sách/thẻ thành viên) cùng vẽ, hai feature không import nhau.
 * Khoá: khi nào một thành viên được coi là cố vấn; nhãn luôn là CHỮ; hạn đọc theo cùng luật với hạn khách (dưới 48 giờ → giờ).
 */
const HOUR = 60 * 60 * 1000;

describe('isMentorTag', () => {
  it('cần cả nhãn MENTOR lẫn vai KHÁCH; không truyền vai thì chỉ xét nhãn', () => {
    expect(MENTOR_DISPLAY_TAG).toBe('MENTOR');
    expect(isMentorTag('MENTOR', 'GUEST')).toBe(true);
    expect(isMentorTag('MENTOR')).toBe(true);
    // Nhãn sót trên người đã được nâng vai: không che vai thật.
    expect(isMentorTag('MENTOR', 'MEMBER')).toBe(false);
    expect(isMentorTag('MENTOR', 'ADMIN')).toBe(false);
  });

  it('nhãn lạ / thiếu / null → không phải cố vấn', () => {
    expect(isMentorTag('AMBASSADOR', 'GUEST')).toBe(false);
    expect(isMentorTag(undefined, 'GUEST')).toBe(false);
    expect(isMentorTag(null, 'GUEST')).toBe(false);
  });
});

describe('MentorTag', () => {
  it('có `remaining`: "Cố vấn · còn 12 ngày" (chữ đầu của remaining được hạ thường); không có: chỉ "Cố vấn"', async () => {
    const view = await render(<MentorTag remaining="Còn 12 ngày" />);
    expect(screen.getByText('Cố vấn · còn 12 ngày')).toBeOnTheScreen();
    await view.unmount();

    await render(<MentorTag />);
    expect(screen.getByText('Cố vấn')).toBeOnTheScreen();
  });
});

describe('MemberMentorTag', () => {
  it('còn > 48 giờ → "còn N ngày"; ≤ 48 giờ → "còn N giờ"; quá hạn → "đã hết hạn"', async () => {
    const days = await render(
      <MemberMentorTag expiresAt={new Date(Date.now() + 10 * 24 * HOUR).toISOString()} />,
    );
    expect(screen.getByText('Cố vấn · còn 10 ngày')).toBeOnTheScreen();
    await days.unmount();

    const hours = await render(
      <MemberMentorTag expiresAt={new Date(Date.now() + 30 * HOUR - 1000).toISOString()} />,
    );
    expect(screen.getByText('Cố vấn · còn 30 giờ')).toBeOnTheScreen();
    await hours.unmount();

    await render(<MemberMentorTag expiresAt={new Date(Date.now() - HOUR).toISOString()} />);
    expect(screen.getByText('Cố vấn · đã hết hạn')).toBeOnTheScreen();
  });

  it('không có hạn (BE chỉ gửi cho OWNER/ADMIN) → chỉ "Cố vấn", không đoán', async () => {
    const view = await render(<MemberMentorTag />);
    expect(screen.getByText('Cố vấn')).toBeOnTheScreen();
    await view.unmount();

    await render(<MemberMentorTag expiresAt={null} />);
    expect(screen.getByText('Cố vấn')).toBeOnTheScreen();
  });
});
