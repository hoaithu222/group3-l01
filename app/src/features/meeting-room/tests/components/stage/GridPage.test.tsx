import { render, screen } from '@testing-library/react-native';

import { GridPage } from '../../../components/stage/GridPage';
import { makePerson } from '../../fixtures';
import { makeRenderVideo } from './stage-helpers';

const people = (count: number) => Array.from({ length: count }, (_, index) => makePerson({ name: `Người ${String(index + 1)}`, userId: `u${String(index + 1)}` }));

async function mount(count: number, landscape: boolean) {
  await render(<GridPage landscape={landscape} people={people(count)} pinnedUserId={null} renderVideo={makeRenderVideo()} onLongPressTile={jest.fn()} />);
  return { rows: screen.queryAllByTestId('grid-row').length, tiles: screen.queryAllByRole('button').length };
}

/** Lưới của MỘT trang (app.md §3.2): số cột theo số ô (`gridColumns`); thiếu ô thì hàng cuối được đệm, không kéo giãn ô lẻ. */
describe('GridPage', () => {
  it.each([
    // [số người, nằm ngang, số hàng]
    [1, false, 1],
    [2, false, 2],
    [3, false, 2],
    [4, false, 2],
    [5, false, 2],
    [6, false, 2],
    [7, false, 3],
    [9, false, 3],
    [2, true, 1],
    [3, true, 2],
    [5, true, 2],
  ])('%i người, nằm ngang=%s → %i hàng, đủ ô', async (count, landscape, rows) => {
    const result = await mount(count, landscape);

    expect(result.rows).toBe(rows);
    expect(result.tiles).toBe(count);
  });

  it('trang rỗng → không có hàng/ô nào', async () => {
    expect(await mount(0, false)).toEqual({ rows: 0, tiles: 0 });
  });

  it('số thứ tự giơ tay lấy từ bảng của CẢ phòng (cha truyền), không đánh lại trong trang', async () => {
    const list = people(2).map((person) => ({ ...person, handRaisedAt: '2026-10-01T09:05:00.000Z' }));
    await render(
      <GridPage
        handOrder={new Map([['u1', 3], ['u2', 4]])}
        landscape={false}
        people={list}
        pinnedUserId={null}
        renderVideo={makeRenderVideo()}
        onLongPressTile={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Người 1, Đang giơ tay thứ 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Người 2, Đang giơ tay thứ 4')).toBeOnTheScreen();
  });

  it('người được ghim có nhãn "Đã ghim"', async () => {
    await render(<GridPage landscape={false} people={people(3)} pinnedUserId="u2" renderVideo={makeRenderVideo()} onLongPressTile={jest.fn()} />);

    expect(screen.getAllByText('Đã ghim')).toHaveLength(1);
    expect(screen.getByLabelText(/Người 2.*Đã ghim/)).toBeOnTheScreen();
  });
});
