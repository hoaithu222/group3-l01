import { render, screen } from '@testing-library/react-native';

import { HighlightedSnippet } from '../components/HighlightedSnippet';

/**
 * `HighlightedSnippet` (app.md p5-04 §8 "highlights chồng"): `highlights` của BE là mảng `{ start, end }` theo UTF-16 code unit của
 * chính `snippet` và có thể CHỒNG/liền nhau. Mỗi đoạn nhấn là một `<Text>` lồng riêng nên `getByText` tìm đúng đoạn đó.
 */

const SNIPPET = 'Họp đồ án nhóm';
// H0 ọ1 p2 ␠3 đ4 ồ5 ␠6 á7 n8 ␠9 n10 h11 ó12 m13

describe('HighlightedSnippet', () => {
  it('highlights CHỒNG nhau gộp thành MỘT đoạn nhấn, chữ thường giữ nguyên hai bên', async () => {
    await render(
      <HighlightedSnippet
        highlights={[
          { end: 7, start: 4 },
          { end: 9, start: 6 },
        ]}
        snippet={SNIPPET}
      />,
    );

    expect(screen.getByText('đồ án')).toBeOnTheScreen();
    expect(screen.queryByText('đồ')).toBeNull();
    expect(screen.queryByText('án')).toBeNull();
    expect(screen.getByText('Họp đồ án nhóm')).toBeOnTheScreen();
  });

  it('highlights KỀ nhau (đoạn sau bắt đầu đúng chỗ đoạn trước kết thúc) cũng gộp; đoạn cách nhau thì GIỮ RIÊNG', async () => {
    const adjacent = await render(
      <HighlightedSnippet
        highlights={[
          { end: 6, start: 4 },
          { end: 9, start: 6 },
        ]}
        snippet={SNIPPET}
      />,
    );
    expect(screen.getByText('đồ án')).toBeOnTheScreen();
    await adjacent.unmount();

    await render(
      <HighlightedSnippet
        highlights={[
          { end: 3, start: 0 },
          { end: 9, start: 7 },
        ]}
        snippet={SNIPPET}
      />,
    );
    expect(screen.getByText('Họp')).toBeOnTheScreen();
    expect(screen.getByText('án')).toBeOnTheScreen();
    expect(screen.queryByText('Họp đồ án')).toBeNull();
  });

  it('highlights không sắp xếp / trùng / hỏng (ngoài biên, đảo đầu-cuối, không nguyên) không làm vỡ hàng kết quả', async () => {
    await render(
      <HighlightedSnippet
        highlights={[
          { end: 9, start: 7 },
          { end: 9, start: 7 },
          { end: 2, start: 5 },
          { end: 500, start: 10 },
          { end: 1.5, start: 0 },
          { end: 3, start: -4 },
        ]}
        snippet={SNIPPET}
      />,
    );

    expect(screen.getByText('Họp')).toBeOnTheScreen();
    expect(screen.getByText('án')).toBeOnTheScreen();
    expect(screen.getByText('nhóm')).toBeOnTheScreen();
  });

  it('không cắt GIỮA một emoji (hai code unit): đoạn nhấn nới ra cho tròn ký tự', async () => {
    // "vui 🙂 lắm": v0 u1 i2 ␠3 🙂4-5 ␠6 l7 ắ8 m9 — đoạn [5,8) bắt đầu GIỮA cặp surrogate của 🙂.
    await render(<HighlightedSnippet highlights={[{ end: 8, start: 5 }]} snippet="vui 🙂 lắm" />);

    expect(screen.getByText('🙂 l')).toBeOnTheScreen();
    expect(screen.queryByText('�')).toBeNull();
  });

  it('nhấn KHÔNG chỉ bằng màu: đoạn nhấn có chữ ĐẬM + GẠCH CHÂN, đoạn thường thì không', async () => {
    await render(<HighlightedSnippet highlights={[{ end: 9, start: 4 }]} snippet={SNIPPET} />);

    const marked = screen.getByText('đồ án').props.className as string;
    expect(marked).toContain('font-bold');
    expect(marked).toContain('underline');
    expect(screen.getByText('Họp').props.className ?? '').not.toContain('underline');
  });

  it('không có highlights hoặc snippet rỗng: hiện nguyên văn / không hiện gì, không ném lỗi', async () => {
    const plain = await render(<HighlightedSnippet highlights={[]} snippet={SNIPPET} />);
    expect(screen.getByText(SNIPPET)).toBeOnTheScreen();
    await plain.unmount();

    await render(<HighlightedSnippet highlights={[{ end: 3, start: 0 }]} snippet="" />);
    expect(screen.queryByText('Họp')).toBeNull();
  });
});
