import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { ReactElement } from 'react';

import type { RoadmapPhaseDto, RoadmapSubjectDetailDto } from '../api/roadmap.types';
import { PhaseTabs } from '../components/subject/PhaseTabs';
import { SubjectHeader } from '../components/subject/SubjectHeader';
import { computeSubjectInsights } from '../utils/roadmap-progress';

/**
 * Đầu màn tổng quan môn (p4-07 app.md §3): môn CHƯA đăng ký có thẻ giới thiệu (quy mô · mô tả · lịch gợi ý) với MỘT hành động
 * "Bắt đầu lộ trình"; dải tháng đổi tháng khi chạm và chỉ rung "đổi lựa chọn" khi tháng THẬT SỰ đổi.
 */
jest.mock('@/core/uploads/use-asset-url', () => ({ useAssetUrl: () => ({ data: undefined }) }));

const PHASE_TITLES = ['Nền móng', 'Bố cục', 'Tương tác'];

function phase(index: number): RoadmapPhaseDto {
  return {
    capstone: null,
    color: null,
    id: `p${String(index)}`,
    index,
    lessonCount: 0,
    stageLabel: null,
    subjectId: 'sub-1',
    summary: null,
    title: PHASE_TITLES[index - 1] ?? 'Tháng',
  };
}

function subject(overrides: Partial<RoadmapSubjectDetailDto> = {}): RoadmapSubjectDetailDto {
  return {
    category: 'programming',
    color: 'blue',
    coverAssetId: null,
    defaultStudyDays: [1, 3, 5],
    description: 'Dựng giao diện web từ con số 0.',
    icon: null,
    id: 'sub-1',
    lessonCount: 12,
    lessonLabel: 'Buổi',
    lessons: [],
    myEnrollment: null,
    phaseCount: 3,
    phases: [phase(1), phase(2), phase(3)],
    progress: {},
    requiredLessonCount: 10,
    schedule: {},
    slug: 'web',
    title: 'Lập trình web',
    unlockMode: 'FREE',
    ...overrides,
  };
}

function withQueryClient(ui: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe('SubjectHeader — môn chưa đăng ký', () => {
  it('thẻ giới thiệu nêu quy mô, mô tả, lịch gợi ý; "Bắt đầu lộ trình" mở tấm đăng ký', async () => {
    const data = subject();
    const onEnroll = jest.fn();
    await render(
      withQueryClient(
        <SubjectHeader
          insights={computeSubjectInsights(data, null)}
          subject={data}
          onContinue={jest.fn()}
          onEnroll={onEnroll}
        />,
      ),
    );

    expect(screen.getByText('Lộ trình 3 tháng')).toBeOnTheScreen();
    expect(screen.getByText('12 buổi · 10 bắt buộc')).toBeOnTheScreen();
    expect(screen.getByText('Dựng giao diện web từ con số 0.')).toBeOnTheScreen();
    expect(screen.getByText('Gợi ý học T2 · T4 · T6')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu lộ trình' }));
    expect(onEnroll).toHaveBeenCalledTimes(1);
  });
});

describe('PhaseTabs', () => {
  it('chạm tháng khác ⇒ đổi tháng + rung một nhịp; chạm lại tháng đang chọn ⇒ không rung', async () => {
    const data = subject();
    const onChange = jest.fn();
    await render(
      <PhaseTabs
        phases={data.phases}
        stats={computeSubjectInsights(data, null).phases}
        unit="buổi"
        value="p1"
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByRole('tab', { name: /^Tháng 2, Bố cục/ }));
    expect(onChange).toHaveBeenLastCalledWith('p2');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('tab', { name: /^Tháng 1, Nền móng/ }));
    expect(onChange).toHaveBeenLastCalledWith('p1');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tab', { name: /^Tháng 1, Nền móng/ })).toBeSelected();
  });
});
