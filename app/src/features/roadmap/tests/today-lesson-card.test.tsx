import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { RoadmapSubjectCardDto, RoadmapTodayItemDto } from '../api/roadmap.types';
import { TodayLessonCard } from '../components/home/TodayLessonCard';
import { useTodayLessons } from '../hooks/useTodayLessons';
import { useRoadmapSubjects } from '../queries/roadmap.queries';

/**
 * Thẻ "Hôm nay học gì" ở đầu tab "Của tôi": ẩn hẳn khi không có môn đang học; thanh tiến độ MÔN lấy `myEnrollment.percent` THẬT của
 * `GET /roadmap/subjects` (một ô trợ năng `progressbar` có `accessibilityValue`) — chưa có số thì KHÔNG vẽ (không bịa 0%); nút "Vào học"
 * vẫn mở đúng buổi (ánh quét trên nút chỉ là trang trí, không đổi hành vi).
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../hooks/useTodayLessons', () => ({ useTodayLessons: jest.fn() }));
jest.mock('../queries/roadmap.queries', () => ({ useRoadmapSubjects: jest.fn() }));

const today = jest.mocked(useTodayLessons);
const subjects = jest.mocked(useRoadmapSubjects);

const ITEM: RoadmapTodayItemDto = {
  behind: 0,
  lesson: { id: 'l5', number: 5, title: 'Flexbox' },
  plannedDate: '2026-09-30',
  subject: {
    color: null,
    icon: null,
    id: 'sub-1',
    lessonLabel: 'Buổi',
    slug: 'fullstack',
    title: 'Fullstack',
  },
};

function subjectsResult(data: Partial<RoadmapSubjectCardDto>[] | undefined) {
  return { data } as unknown as ReturnType<typeof useRoadmapSubjects>;
}

beforeEach(() => {
  jest.clearAllMocks();
  today.mockReturnValue({ items: [ITEM] });
  subjects.mockReturnValue(
    subjectsResult([{ id: 'sub-1', myEnrollment: { behind: 0, nextLessonId: 'l5', percent: 40 } }]),
  );
});

describe('TodayLessonCard', () => {
  it('không có môn đang học ⇒ không vẽ gì (và không hỏi danh sách môn)', async () => {
    today.mockReturnValue({ items: [] });
    await render(<TodayLessonCard />);
    expect(screen.toJSON()).toBeNull();
    expect(subjects).not.toHaveBeenCalled();
  });

  it('có % của môn ⇒ thanh tiến độ là MỘT ô progressbar có nhãn + accessibilityValue', async () => {
    await render(<TodayLessonCard />);
    const bar = screen.getByRole('progressbar', { name: 'Tiến độ môn Fullstack: 40%' });
    expect(bar).toHaveAccessibilityValue({ max: 100, min: 0, now: 40 });
  });

  it('chưa có số tiến độ (đang tải/lỗi) ⇒ không vẽ thanh, thẻ và nút vẫn dùng được', async () => {
    subjects.mockReturnValue(subjectsResult(undefined));
    await render(<TodayLessonCard />);
    expect(screen.queryByRole('progressbar')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Vào học Buổi 5, Fullstack' }));
    expect(router.push).toHaveBeenCalledWith({
      params: { lessonId: 'l5', subjectId: 'sub-1' },
      pathname: '/study/roadmap/[subjectId]/lessons/[lessonId]',
    });
  });
});
