/**
 * Khung màn xác thực — `AuthBackdrop` (nền), `AuthBrandPanel` (khoang giới thiệu), `AuthPageHeading` (tiêu đề),
 * và cả `AuthLayout` ghép ba thứ đó lại.
 *
 *  - `AuthBackdrop` là trang trí thuần: mọi tầng `fixed` ẩn khỏi trình đọc màn hình và không bắt chuột; mọi thứ
 *    chuyển động đều TẮT được khi người dùng chọn giảm chuyển động (`motion-reduce:animate-none`); icon hoạ tiết
 *    có bậc màu riêng cho theme tối (thang tông không tự lật).
 *  - `AuthLayout`: cả màn đúng MỘT heading (h1 của form); mọi chuyển động — kể cả quầng của hình lộ trình — tắt
 *    được; mọi icon của khung nằm trong vùng `aria-hidden`.
 *  - `AuthBrandPanel` đánh số danh sách phân hệ bằng CSS counter; số thứ tự là SỐ ⇒ font sans + `tabular-nums`,
 *    KHÔNG `font-mono` (`visual-hierarchy.md §3.3.1`).
 *  - `AuthPageHeading` dựng `<h1>` THẬT (bản cũ ra `<h3>`), và lời chào nằm NGOÀI h1 — tên của heading đúng bằng
 *    tiêu đề, các bài kiểm luồng đăng nhập tìm heading theo đúng tên đó.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import AuthLayout from '@/app/router/layouts/AuthLayout';
import AuthBackdrop from '@/features/auth/components/AuthBackdrop';
import AuthBrandPanel from '@/features/auth/components/AuthBrandPanel';
import AuthPageHeading from '@/features/auth/components/AuthPageHeading';

/** Cả khung (nền + khoang giới thiệu + khoang form) với một trang giả chỉ có cụm tiêu đề. */
function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route
            element={<AuthPageHeading eyebrow="Chào mừng trở lại" title="Đăng nhập" />}
            path="/login"
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthBackdrop', () => {
  it('mọi hoạ tiết chuyển động đều tắt được khi người dùng chọn giảm chuyển động', () => {
    const { container } = render(<AuthBackdrop />);

    const animated = [...container.querySelectorAll('[class*="animate-"]')];
    // Có chuyển động thật (sao XP nhấp nháy) — nếu không, câu khẳng định dưới đúng một cách vô nghĩa.
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) {
      expect(el.getAttribute('class')).toContain('motion-reduce:animate-none');
    }
  });

  it('toàn bộ nền là trang trí: ẩn khỏi trình đọc màn hình và không bắt chuột', () => {
    const { container } = render(<AuthBackdrop />);
    const layers = container.querySelectorAll('.fixed');
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer).toHaveAttribute('aria-hidden', 'true');
      expect(layer.className).toContain('pointer-events-none');
    }
  });

  it('icon hoạ tiết có bậc màu riêng cho theme tối — thang màu tông không tự lật theo theme', () => {
    const { container } = render(<AuthBackdrop />);

    const icons = [...container.querySelectorAll('svg')];
    expect(icons.length).toBeGreaterThan(0);
    // Chỉ một bậc `-5` chung thì hợp nền navy nhưng gần như biến mất trên nền sáng.
    for (const icon of icons) expect(icon.getAttribute('class')).toMatch(/\bdark:text-/);
  });
});

describe('AuthLayout', () => {
  it('cả màn chỉ có MỘT heading — h1 của form, không phải khẩu hiệu bên khoang giới thiệu', () => {
    renderShell();

    const headings = screen.getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0].tagName).toBe('H1');
    expect(headings[0]).toHaveAccessibleName('Đăng nhập');
  });

  it('mọi chuyển động trên màn (sao nền + quầng "đang học") đều tắt được khi giảm chuyển động', () => {
    const { container } = renderShell();

    const animated = [...container.querySelectorAll('[class*="animate-"]')];
    // Có cả quầng của hình lộ trình — không chỉ các sao nền đã kiểm ở trên.
    expect(animated.some((el) => el.getAttribute('class')?.includes('animate-auth-pulse'))).toBe(
      true,
    );
    for (const el of animated) {
      expect(el.getAttribute('class')).toContain('motion-reduce:animate-none');
    }
  });

  it('mọi icon của khung (nền, dấu thương hiệu, hình lộ trình) nằm trong vùng aria-hidden', () => {
    const { container } = renderShell();

    const icons = [...container.querySelectorAll('svg')];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('AuthBrandPanel', () => {
  it('danh sách phân hệ là <ol> đánh số bằng CSS counter, mỗi dòng một câu', () => {
    render(<AuthBrandPanel />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    // Số sinh bằng CSS, không gõ vào markup (gõ tay thì trình đọc màn hình đọc số hai lần).
    for (const li of items) expect(li.textContent).not.toMatch(/^\s*0?\d/);
  });

  it('số thứ tự dùng font sans + tabular-nums, KHÔNG font-mono', () => {
    render(<AuthBrandPanel />);

    for (const li of screen.getAllByRole('listitem')) {
      expect(li.className).toContain('before:tabular-nums');
      expect(li.className).not.toContain('before:font-mono');
    }
  });

  it('khoang giới thiệu không chen heading nào trước h1 của form', () => {
    render(<AuthBrandPanel />);
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });
});

describe('AuthPageHeading', () => {
  it('dựng đúng MỘT <h1>, tên truy cập bằng tiêu đề — lời chào nằm ngoài heading', () => {
    render(
      <AuthPageHeading
        description="Nhập email và mật khẩu để tiếp tục."
        eyebrow="Chào mừng trở lại"
        title="Đăng nhập"
      />,
    );

    const headings = screen.getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0].tagName).toBe('H1');
    expect(headings[0]).toHaveAccessibleName('Đăng nhập');
    expect(screen.getByText('Chào mừng trở lại')).toBeInTheDocument();
  });

  it('không có câu phụ / lời chào thì không sinh thẻ rỗng', () => {
    const { container } = render(<AuthPageHeading title="Liên kết không hợp lệ" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Liên kết không hợp lệ');
  });
});
