/**
 * `Input` / `Textarea` (kit2) đứng RIÊNG (ngoài `*Field` của hệ form) — trạng thái lỗi phải lộ ra cho
 * công nghệ hỗ trợ chứ không chỉ đổi màu viền: `invalid` ⇒ `aria-invalid`. Trước đây `invalid` chỉ đổi
 * class, nên ô lọc sai định dạng (vd ID 24 ký tự hex ở trang nhật ký) im lặng với người đọc màn hình.
 *
 * Cùng file: TÊN truy cập của các điều khiển không có nhãn hiển thị — `Dropdown`/`MultiSelect` (bộ lọc),
 * `SegmentToggle` (nhóm nút) và `Tabs` (dải tab) nhận `aria-label`.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dropdown, Input, MultiSelect, SegmentToggle, Tabs, Textarea } from '@/shared/ui';

describe('Input — invalid ⇒ aria-invalid', () => {
  it('invalid → aria-invalid="true"', () => {
    render(<Input invalid placeholder="ID người thực hiện" />);
    expect(screen.getByPlaceholderText('ID người thực hiện')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('hợp lệ → KHÔNG có thuộc tính (không khai "false" cho mọi ô)', () => {
    render(<Input placeholder="ID người thực hiện" />);
    expect(screen.getByPlaceholderText('ID người thực hiện')).not.toHaveAttribute('aria-invalid');
  });

  it('aria-invalid do nơi gọi truyền (vd hook của field) vẫn thắng', () => {
    render(<Input aria-invalid="false" invalid placeholder="Ô" />);
    expect(screen.getByPlaceholderText('Ô')).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('Textarea — invalid ⇒ aria-invalid', () => {
  it('invalid → aria-invalid="true"; hợp lệ → không có', () => {
    const { rerender } = render(<Textarea invalid placeholder="Ghi chú" />);
    expect(screen.getByPlaceholderText('Ghi chú')).toHaveAttribute('aria-invalid', 'true');

    rerender(<Textarea placeholder="Ghi chú" />);
    expect(screen.getByPlaceholderText('Ghi chú')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Dropdown / MultiSelect — aria-label trực tiếp (bộ lọc không có nhãn hiển thị)', () => {
  const options = [
    { value: 'all', label: 'Mọi vai trò' },
    { value: 'admin', label: 'Quản trị viên' },
  ];

  it('Dropdown: tên truy cập là nhãn khai báo, không phải chữ của giá trị đang chọn', () => {
    render(<Dropdown aria-label="Lọc theo vai trò" options={options} value="all" />);
    const trigger = screen.getByRole('combobox', { name: 'Lọc theo vai trò' });
    // Giá trị đang chọn vẫn hiện trên nút — chỉ TÊN của ô là cái nói ô này lọc theo gì.
    expect(trigger).toHaveTextContent('Mọi vai trò');
  });

  it('Dropdown: aria-labelledby (nhãn hiển thị của *Field) vẫn thắng aria-label', () => {
    render(
      <>
        <span id="lbl">Vai trò mới</span>
        <Dropdown aria-label="Nhãn phụ" aria-labelledby="lbl" options={options} value="all" />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Vai trò mới' })).toBeInTheDocument();
  });

  it('MultiSelect: nhận aria-label', () => {
    render(
      <MultiSelect
        aria-label="Lọc theo hành động"
        options={options}
        placeholder="Mọi hành động"
        value={[]}
      />,
    );
    // Trigger của MultiSelect là nút mở popover (không phải `combobox` như Dropdown/Radix Select).
    expect(screen.getByRole('button', { name: 'Lọc theo hành động' })).toBeInTheDocument();
  });
});

describe('SegmentToggle — tên của cả nhóm nút', () => {
  const options = [
    { key: 'WEEK', label: 'Tuần' },
    { key: 'MONTH', label: 'Tháng' },
  ];

  it('aria-label đặt tên cho nhóm; các nút vẫn có aria-pressed', () => {
    render(<SegmentToggle aria-label="Kỳ xếp hạng" options={options} value="WEEK" />);
    const group = screen.getByRole('group', { name: 'Kỳ xếp hạng' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tuần' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tháng' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('aria-labelledby trỏ vào nhãn hiển thị', () => {
    render(
      <>
        <span id="giao-dien">Giao diện</span>
        <SegmentToggle aria-labelledby="giao-dien" options={options} value="WEEK" />
      </>,
    );
    expect(screen.getByRole('group', { name: 'Giao diện' })).toBeInTheDocument();
  });
});

describe('Tabs — tên của dải tab', () => {
  const options = [
    { key: 'limits', label: 'Giới hạn' },
    { key: 'features', label: 'Tính năng' },
  ];

  it('aria-label đặt tên cho tablist (phân biệt dải tab chính với dải sub-tab)', () => {
    render(<Tabs aria-label="Nhóm cấu hình hệ thống" options={options} value="limits" />);
    expect(screen.getByRole('tablist', { name: 'Nhóm cấu hình hệ thống' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Giới hạn' })).toHaveAttribute('aria-selected', 'true');
  });

  it('không truyền aria-label → tablist không có tên (hành vi cũ, không khai thuộc tính rỗng)', () => {
    render(<Tabs options={options} value="limits" />);
    expect(screen.getByRole('tablist')).not.toHaveAttribute('aria-label');
  });
});
