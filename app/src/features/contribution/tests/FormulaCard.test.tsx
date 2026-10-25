import { fireEvent, render, screen } from '@testing-library/react-native';

import { FormulaCard } from '../components/FormulaCard';
import { FORMULA, TZ } from './fixtures';

/**
 * Thẻ công thức (app.md §3, §8): mọi thành viên đọc được công thức + định nghĩa do server trả; CHỈ người có quyền sửa bảng (OWNER/ADMIN) thấy "Đổi trọng số";
 * dòng minh bạch "Trọng số đổi lúc … bởi … (trước: …)".
 */
describe('FormulaCard', () => {
  it('trọng số dạng chữ, ba câu định nghĩa NGUYÊN VĂN của server, số giờ trễ và điểm thẻ chưa gán', async () => {
    await render(<FormulaCard canEdit={false} formula={FORMULA} timezone={TZ} onEdit={jest.fn()} />);

    expect(screen.getByText('60%')).toBeOnTheScreen();
    expect(screen.getAllByText('20%')).toHaveLength(2);
    expect(screen.getByText(FORMULA.definitions.points)).toBeOnTheScreen();
    expect(screen.getByText(FORMULA.definitions.onTime)).toBeOnTheScreen();
    expect(screen.getByText(FORMULA.definitions.peer)).toBeOnTheScreen();
    expect(screen.getByText(/Cho phép trễ 0 giờ sau cuối ngày hạn · Thẻ chưa gán điểm tính 1 điểm/)).toBeOnTheScreen();
  });

  it('MEMBER (canEdit false) KHÔNG thấy "Đổi trọng số"', async () => {
    await render(<FormulaCard canEdit={false} formula={FORMULA} timezone={TZ} onEdit={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Đổi trọng số' })).toBeNull();
  });

  it('OWNER/ADMIN (canEdit true) thấy "Đổi trọng số"; bấm gọi onEdit', async () => {
    const onEdit = jest.fn();
    await render(<FormulaCard canEdit formula={FORMULA} timezone={TZ} onEdit={onEdit} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Đổi trọng số' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('đã từng đổi: "Trọng số đổi lúc 10:32 15/09 bởi Minh (trước: 60 / 20 / 20)" — ai cũng thấy', async () => {
    const changed = {
      ...FORMULA,
      changedAt: '2026-09-15T03:32:00.000Z',
      changedBy: { id: 'u1', name: 'Minh' },
      previousWeights: { onTime: 20, peer: 20, points: 60 },
      weights: { onTime: 30, peer: 20, points: 50 },
    };
    await render(<FormulaCard canEdit={false} formula={changed} timezone={TZ} onEdit={jest.fn()} />);

    expect(screen.getByText('Trọng số đổi lúc 10:32 15/09 bởi Minh (trước: 60 / 20 / 20)')).toBeOnTheScreen();
    expect(screen.getByText('50%')).toBeOnTheScreen();
  });

  it('công thức chưa từng đổi → không có dòng "đổi lúc"', async () => {
    await render(<FormulaCard canEdit={false} formula={FORMULA} timezone={TZ} onEdit={jest.fn()} />);

    expect(screen.queryByText(/Trọng số đổi lúc/)).toBeNull();
  });
});
