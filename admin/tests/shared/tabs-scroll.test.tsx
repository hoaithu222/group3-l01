/**
 * `Tabs` (kit2) khi màn hẹp — "CUỘN, KHÔNG ẨN" (`ipad-responsive.md §4`).
 *
 * Trang cấu hình hệ thống có 8 tab, chi tiết workspace tới 9: trước đây dải tab không cuộn nên tab thứ
 * 6–9 tràn ra ngoài và làm cả trang tràn ngang. Nay dải cuộn ngang trong khung của nó, nhãn không co,
 * và tab đang chọn tự cuộn vào tầm nhìn.
 *
 * jsdom không dựng layout: các phép đo (`offsetLeft`/`offsetWidth`/`clientWidth`) và `scrollLeft` được
 * giả lập bằng cách vá prototype — mỗi tab rộng 100px xếp liền nhau, khung nhìn rộng 300px.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tabs } from '@/shared/ui';

const OPTIONS = Array.from({ length: 8 }, (_, i) => ({ key: `t${i + 1}`, label: `Tab ${i + 1}` }));
const TAB_WIDTH = 100;
const VIEWPORT = 300;

/** `scrollLeft` từng phần tử — jsdom không lưu giá trị ghi vào. */
const scrollLefts = new WeakMap<Element, number>();
const tabIndexOf = (el: Element) => OPTIONS.findIndex((o) => o.label === el.textContent);

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'tab' ? tabIndexOf(this) * TAB_WIDTH : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'tab' ? TAB_WIDTH : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'tablist' ? VIEWPORT : 0;
  });
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(function (this: Element) {
    return scrollLefts.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(function (
    this: Element,
    v: number,
  ) {
    scrollLefts.set(this, v);
  });
});

afterEach(() => vi.restoreAllMocks());

const list = () => screen.getByRole('tablist');

describe('Tabs — dải cuộn ngang khi hẹp', () => {
  it('dải cuộn NGANG trong khung của nó (không đẩy cả trang tràn), thanh cuộn ẩn, vuốt hết dải không "lùi trang"', () => {
    render(<Tabs options={OPTIONS} value="t1" onValueChange={() => undefined} />);

    const cls = list().className;
    expect(cls).toContain('overflow-x-auto');
    expect(cls).toContain('overscroll-x-contain');
    expect(cls).toContain('scrollbar-hidden');
    // Co được trong hàng flex chứ không giữ nguyên bề rộng nội dung.
    expect(cls).toContain('min-w-0');
  });

  it('nhãn tab KHÔNG co và KHÔNG xuống dòng — cuộn chứ không cắt chữ', () => {
    render(<Tabs options={OPTIONS} value="t1" onValueChange={() => undefined} />);

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('shrink-0');
      expect(tab.className).toContain('whitespace-nowrap');
    }
  });

  it('mở thẳng một tab nằm ngoài khung nhìn → dải tự cuộn tới tab đó (uncontrolled)', () => {
    render(<Tabs defaultValue="t7" options={OPTIONS} />);

    // Tab 7 chiếm 600–700px, khung nhìn 300px ⇒ cuộn tới khi mép phải tab chạm mép phải khung.
    expect(scrollLefts.get(list())).toBe(700 - VIEWPORT);
  });

  it('đổi tab đang chọn (controlled) sang tab thò ra bên phải/trái → cuộn vừa đủ; tab đã trọn trong khung → đứng yên', () => {
    const { rerender } = render(
      <Tabs options={OPTIONS} value="t1" onValueChange={() => undefined} />,
    );
    expect(scrollLefts.get(list()) ?? 0).toBe(0);

    rerender(<Tabs options={OPTIONS} value="t8" onValueChange={() => undefined} />);
    expect(scrollLefts.get(list())).toBe(800 - VIEWPORT); // 500

    // Tab 6 (500–600) đã nằm trọn trong [500, 800] ⇒ không cuộn thêm.
    rerender(<Tabs options={OPTIONS} value="t6" onValueChange={() => undefined} />);
    expect(scrollLefts.get(list())).toBe(500);

    // Tab 2 (100–200) nằm bên trái khung ⇒ cuộn ngược đúng tới mép trái tab.
    rerender(<Tabs options={OPTIONS} value="t2" onValueChange={() => undefined} />);
    expect(scrollLefts.get(list())).toBe(100);
  });

  it('có `right`: dải và hành động cùng hàng, dải vẫn là vùng cuộn (không đẩy hành động ra khỏi khung)', () => {
    render(
      <Tabs
        options={OPTIONS}
        right={<button type="button">Tạo mới</button>}
        value="t1"
        onValueChange={() => undefined}
      />,
    );

    expect(list().className).toContain('overflow-x-auto');
    expect(screen.getByRole('button', { name: 'Tạo mới' })).toBeInTheDocument();
  });

  it('chọn tab bằng chuột và mũi tên bàn phím vẫn hoạt động như cũ', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs options={OPTIONS} value="t1" onValueChange={onValueChange} />);

    await user.click(screen.getByRole('tab', { name: 'Tab 3' }));
    expect(onValueChange).toHaveBeenLastCalledWith('t3');

    screen.getByRole('tab', { name: 'Tab 1' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenLastCalledWith('t2');
  });
});
