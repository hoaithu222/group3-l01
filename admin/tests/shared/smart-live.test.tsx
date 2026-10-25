/**
 * Nhóm component "sống & tự chạy" — kiểm HÀNH VI, không kiểm hình.
 *
 * Ba điều dưới đây là HỢP ĐỒNG của nhóm này, và cả ba đều dễ vỡ âm thầm khi ai
 * đó "dọn dẹp" một `useEffect`:
 *   1. `prefers-reduced-motion` ⇒ hiện NGAY giá trị cuối, không chạy.
 *   2. Số cuối cùng phải bằng ĐÚNG giá trị đích (không kẹt ở "…,999").
 *   3. `ScrollBoard` vừa khung thì KHÔNG dựng bộ hẹn giờ nào.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimatedNumber, ScrollBoard } from '@/shared/ui';
import type { ScrollBoardColumn } from '@/shared/ui';

/** Bật/tắt `prefers-reduced-motion` cho `matchMedia` giả lập của setup. */
function setReducedMotion(on: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

interface Row {
  id: string;
  name: string;
}

const COLUMNS: ScrollBoardColumn<Row>[] = [{ key: 'name', header: 'Tên', cell: (r) => r.name }];
const rowKey = (r: Row) => r.id;
const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Dòng ${i}` }));

describe('AnimatedNumber', () => {
  afterEach(() => setReducedMotion(false));

  it('máy giảm chuyển động thì in THẲNG giá trị cuối, không đếm', () => {
    setReducedMotion(true);
    render(<AnimatedNumber value={1234} />);
    // Nhánh đọc màn hình luôn giữ giá trị đích; nhánh nhìn thấy phải khớp NGAY.
    expect(screen.getAllByText('1.234').length).toBeGreaterThan(0);
  });

  it('`disabled` cũng in thẳng, không phụ thuộc media query', () => {
    setReducedMotion(false);
    render(<AnimatedNumber disabled value={987} />);
    expect(screen.getAllByText('987').length).toBeGreaterThan(0);
  });

  it('trình đọc màn hình luôn nhận GIÁ TRỊ ĐÍCH, không nhận từng bước chạy', () => {
    setReducedMotion(false);
    const { container } = render(<AnimatedNumber value={5000} />);
    // `sr-only` chốt ở đích ngay khung hình đầu, kể cả khi phần nhìn thấy còn 0.
    expect(container.querySelector('.sr-only')?.textContent).toBe('5.000');
  });
});

describe('ScrollBoard', () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    setReducedMotion(false);
  });

  it('dữ liệu VỪA khung thì không dựng bộ hẹn giờ nào', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    render(<ScrollBoard columns={COLUMNS} data={rows(4)} rowCount={6} rowKey={rowKey} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('dữ liệu TRÀN khung thì có hẹn giờ để nhích', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    render(<ScrollBoard columns={COLUMNS} data={rows(20)} rowCount={6} rowKey={rowKey} />);
    expect(spy).toHaveBeenCalled();
  });

  it('máy giảm chuyển động thì KHÔNG tự cuộn dù dữ liệu tràn khung', () => {
    setReducedMotion(true);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    render(<ScrollBoard columns={COLUMNS} data={rows(20)} rowCount={6} rowKey={rowKey} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('`paused` dừng hẳn vòng lặp', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    render(<ScrollBoard columns={COLUMNS} data={rows(20)} paused rowCount={6} rowKey={rowKey} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('gỡ khỏi cây thì dọn sạch hẹn giờ — không rò bộ nhớ', () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(
      <ScrollBoard columns={COLUMNS} data={rows(20)} rowCount={6} rowKey={rowKey} />,
    );
    act(() => unmount());
    expect(clear).toHaveBeenCalled();
  });
});
