import { render, screen } from '@testing-library/react-native';

import { LiveLeaderboard } from '../components/LiveLeaderboard';
import { RankedBoard } from '../components/RankedBoard';
import type { RankedEntry } from '../utils/ranked-entries';

/**
 * Bảng xếp hạng: top 3 lên bục (dạng `podium`) + phần còn lại là danh sách; dòng của CHÍNH người chơi được nhấn (hậu tố "(bạn)"
 * ở nhãn); tôi ngoài top thì in thêm ở cuối. Mỗi cột/dòng là MỘT ô trợ năng đọc trọn "Hạng n, tên, điểm".
 */

const entry = (n: number, name: string, score: number): RankedEntry => ({
  name,
  rank: n,
  score,
  userId: `u${String(n)}`,
});
const ENTRIES = [
  entry(1, 'An', 1250),
  entry(2, 'Bình', 900),
  entry(3, 'Chi', 700),
  entry(4, 'Dũng', 400),
  entry(5, 'Em', 300),
];

describe('RankedBoard', () => {
  it('variant "podium": top 3 lên bục, hạng 4–5 là dòng danh sách (điểm có dấu chấm nghìn)', async () => {
    await render(<RankedBoard entries={ENTRIES} variant="podium" />);

    expect(screen.getByLabelText('Hạng 1, An, 1.250 điểm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạng 2, Bình, 900 điểm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạng 3, Chi, 700 điểm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạng 4, Dũng, 400 điểm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạng 5, Em, 300 điểm')).toBeOnTheScreen();
  });

  it('variant "list": cả năm người là dòng danh sách (tên hiện trong dòng, không có cột bục)', async () => {
    await render(<RankedBoard entries={ENTRIES} variant="list" />);

    // Dòng danh sách có tên trong Text riêng; cột bục cũng có nên đếm theo nhãn cả dòng.
    expect(screen.getAllByLabelText(/^Hạng \d/)).toHaveLength(5);
    expect(screen.getByText('An')).toBeOnTheScreen();
  });

  it('dòng của tôi được nhấn: nhãn có "(bạn)" ở danh sách và ", bạn" ở bục', async () => {
    const { rerender } = await render(<RankedBoard entries={ENTRIES} meId="u4" variant="podium" />);
    expect(screen.getByLabelText('Hạng 4, Dũng (bạn), 400 điểm')).toBeOnTheScreen();

    await rerender(<RankedBoard entries={ENTRIES} meId="u1" variant="podium" />);
    expect(screen.getByLabelText('Hạng 1, An, bạn, 1.250 điểm')).toBeOnTheScreen();
  });

  it('tôi ngoài top ⇒ in thêm một dòng của tôi ở cuối, luôn được nhấn', async () => {
    await render(<RankedBoard entries={ENTRIES} extra={entry(9, 'Tôi', 50)} variant="list" />);

    expect(screen.getByLabelText('Hạng 9, Tôi (bạn), 50 điểm')).toBeOnTheScreen();
  });

  it('phòng chỉ có hai người ⇒ bục có hai cột, không lỗi', async () => {
    await render(<RankedBoard entries={ENTRIES.slice(0, 2)} variant="podium" />);

    expect(screen.getByLabelText('Hạng 1, An, 1.250 điểm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạng 2, Bình, 900 điểm')).toBeOnTheScreen();
  });
});

describe('LiveLeaderboard', () => {
  const rows = [
    { cumulativeMs: 0, rank: 1, score: 1250, userId: 'u1' },
    { cumulativeMs: 0, rank: 2, score: 900, userId: 'u2' },
  ];
  const players = [
    { avatarAssetId: null, nickname: 'An', userId: 'u1' },
    { avatarAssetId: null, nickname: 'Bình', userId: 'u2' },
  ];

  it('tra tên từ `players`, có tiêu đề "Bảng xếp hạng" và nhấn dòng của tôi khi tôi nằm trong top', async () => {
    await render(<LiveLeaderboard me={rows[1] ?? null} players={players} rows={rows} />);

    expect(screen.getByRole('header', { name: 'Bảng xếp hạng' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạng 2, Bình (bạn), 900 điểm')).toBeOnTheScreen();
    // Tôi ĐÃ nằm trong top ⇒ không in thêm dòng thứ hai của tôi ở cuối.
    expect(screen.getAllByLabelText(/Bình/)).toHaveLength(1);
  });

  it('tôi ngoài top ⇒ thêm dòng của tôi; chưa có điểm ⇒ "Chưa có điểm."', async () => {
    const me = { cumulativeMs: 0, rank: 8, score: 100, userId: 'u8' };
    const view = await render(
      <LiveLeaderboard
        me={me}
        players={[...players, { avatarAssetId: null, nickname: 'Tôi', userId: 'u8' }]}
        rows={rows}
      />,
    );
    expect(screen.getByLabelText('Hạng 8, Tôi (bạn), 100 điểm')).toBeOnTheScreen();

    await view.rerender(<LiveLeaderboard me={null} players={players} rows={[]} />);
    expect(screen.getByText('Chưa có điểm.')).toBeOnTheScreen();
  });
});
