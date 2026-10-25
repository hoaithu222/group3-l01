import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  WorkspaceOverviewHero,
  type WorkspaceOverviewHeroProps,
} from '../components/WorkspaceOverviewHero';

/**
 * Đầu trang tổng quan nhóm: tên là `header`; hàng "vai trò · N thành viên" (khách không có số); mô tả thu gọn 2 dòng chỉ kèm
 * "Xem thêm" khi chữ THẬT SỰ dài hơn (đo bằng bản sao ẩn); nút "Mời thành viên" chỉ khi màn truyền `onInvite`.
 */
const LONG =
  'Nhóm ôn thi tốt nghiệp môn Toán: chia đề theo tuần, chữa bài mỗi tối thứ Năm, tổng hợp lỗi sai hay gặp.';

function workspace(
  patch: Partial<WorkspaceOverviewHeroProps['workspace']> = {},
): WorkspaceOverviewHeroProps['workspace'] {
  return {
    avatarUrl: null,
    coverPreset: null,
    coverUrl: null,
    description: null,
    myRole: 'OWNER',
    name: 'Nhóm Toán 12',
    ...patch,
  };
}

/** Bắn `onTextLayout` của bản sao ẩn — Jest không dựng bố cục chữ nên số dòng phải giả lập. */
async function layoutDescription(lineCount: number): Promise<void> {
  const measure = screen.getByTestId('ws-hero-description-measure', {
    includeHiddenElements: true,
  });
  await fireEvent(measure, 'textLayout', {
    nativeEvent: { lines: Array.from({ length: lineCount }, () => ({})) },
  });
}

describe('WorkspaceOverviewHero', () => {
  it('tên nhóm là tiêu đề; vai trò bằng CHỮ; số thành viên khi có', async () => {
    await render(<WorkspaceOverviewHero memberCount={12} workspace={workspace()} wsId="ws-1" />);

    expect(screen.getByRole('header', { name: 'Nhóm Toán 12' })).toBeOnTheScreen();
    expect(screen.getByText('Chủ nhóm')).toBeOnTheScreen();
    expect(screen.getByText('12 thành viên')).toBeOnTheScreen();
  });

  it('không có memberCount (khách) ⇒ không vẽ số thành viên', async () => {
    await render(<WorkspaceOverviewHero workspace={workspace({ myRole: 'GUEST' })} wsId="ws-1" />);

    expect(screen.getByText('Khách')).toBeOnTheScreen();
    expect(screen.queryByText(/thành viên/)).toBeNull();
  });

  it('mô tả dài hơn 2 dòng ⇒ "Xem thêm" mở hết, "Thu gọn" thu lại; mô tả chỉ đọc MỘT lần', async () => {
    await render(
      <WorkspaceOverviewHero workspace={workspace({ description: LONG })} wsId="ws-1" />,
    );

    expect(screen.getAllByText(LONG)).toHaveLength(1);
    expect(screen.getByText(LONG).props.numberOfLines).toBe(2);
    expect(screen.queryByText('Xem thêm')).toBeNull();

    await layoutDescription(4);
    await fireEvent.press(screen.getByRole('button', { name: 'Xem thêm mô tả nhóm' }));

    expect(screen.getByText(LONG).props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByRole('button', { name: 'Thu gọn mô tả nhóm' }));
    expect(screen.getByText(LONG).props.numberOfLines).toBe(2);
  });

  it('mô tả vừa 2 dòng ⇒ không có nút "Xem thêm" vô nghĩa', async () => {
    await render(
      <WorkspaceOverviewHero workspace={workspace({ description: 'Ôn thi' })} wsId="ws-1" />,
    );

    await layoutDescription(2);

    expect(screen.queryByText('Xem thêm')).toBeNull();
  });

  it('"Mời thành viên" chỉ hiện khi có onInvite, bấm gọi đúng một lần', async () => {
    const onInvite = jest.fn();
    await render(<WorkspaceOverviewHero workspace={workspace()} wsId="ws-1" onInvite={onInvite} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Mời thành viên' }));
    expect(onInvite).toHaveBeenCalledTimes(1);

    await screen.rerender(<WorkspaceOverviewHero workspace={workspace()} wsId="ws-1" />);
    expect(screen.queryByText('Mời thành viên')).toBeNull();
  });
});
