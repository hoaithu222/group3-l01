/**
 * `Table` (kit2) — trợ năng của dòng bấm được và cột sắp xếp.
 *
 *  - dòng có `onRowClick` tới được bằng Tab và kích hoạt bằng Enter/Space (trước đây chỉ bấm chuột —
 *    người dùng bàn phím/đọc màn hình không mở nổi chi tiết ở MỌI bảng dùng `onRowClick`);
 *  - phím gõ trong nút BÊN TRONG dòng không kéo theo `onRowClick`;
 *  - bảng không có `onRowClick` thì dòng KHÔNG thành điểm dừng Tab (đừng thêm tab-stop vô nghĩa);
 *  - cột sắp xếp được tự khai `aria-sort`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';

interface Row {
  id: string;
  name: string;
}

const DATA: Row[] = [
  { id: 'a', name: 'Dòng A' },
  { id: 'b', name: 'Dòng B' },
];

const COLUMNS: TableColumn<Row>[] = [{ key: 'name', header: 'Tên' }];

const bodyRows = () => screen.getAllByRole('row').slice(1); // bỏ dòng tiêu đề

describe('Table — dòng bấm được dùng được bằng bàn phím', () => {
  it('Tab tới dòng, Enter và Space đều mở dòng đó', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(<Table columns={COLUMNS} data={DATA} pagination={false} onRowClick={onRowClick} />);

    const [first, second] = bodyRows();
    expect(first).toHaveAttribute('tabindex', '0');

    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenLastCalledWith(DATA[0], 0);

    await user.tab();
    expect(second).toHaveFocus();
    await user.keyboard(' ');
    expect(onRowClick).toHaveBeenLastCalledWith(DATA[1], 1);
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('phím khác (chữ cái, mũi tên) không kích hoạt dòng', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(<Table columns={COLUMNS} data={DATA} pagination={false} onRowClick={onRowClick} />);

    await user.tab();
    await user.keyboard('a{ArrowDown}{Escape}');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('Enter trên nút BÊN TRONG dòng chỉ chạy nút đó, không mở dòng', async () => {
    const onRowClick = vi.fn();
    const onInner = vi.fn();
    const columns: TableColumn<Row>[] = [
      {
        key: 'name',
        header: 'Tên',
        cell: (row) => (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation(); // đúng như mọi nút trong ô của các bảng thật
              onInner(row.id);
            }}
          >
            Sửa {row.name}
          </Button>
        ),
      },
    ];
    const user = userEvent.setup();
    render(<Table columns={columns} data={DATA} pagination={false} onRowClick={onRowClick} />);

    await user.tab(); // dòng A
    await user.tab(); // nút trong dòng A
    expect(screen.getByRole('button', { name: 'Sửa Dòng A' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onInner).toHaveBeenCalledWith('a');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('không có onRowClick thì dòng KHÔNG là điểm dừng Tab', () => {
    render(<Table columns={COLUMNS} data={DATA} pagination={false} />);
    for (const row of bodyRows()) expect(row).not.toHaveAttribute('tabindex');
  });
});

describe('Table — cột sắp xếp khai aria-sort', () => {
  const sortColumns: TableColumn<Row>[] = [
    { key: 'name', header: 'Tên', sortable: true },
    { key: 'id', header: 'Mã' },
  ];

  it('cột đang sắp: ascending / descending; cột sắp được nhưng chưa chọn: none; cột thường: không khai', () => {
    const { rerender } = render(
      <Table
        columns={sortColumns}
        data={DATA}
        pagination={false}
        sortDir="asc"
        sortKey="name"
        onSortChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Tên/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: /Mã/ })).not.toHaveAttribute('aria-sort');

    rerender(
      <Table
        columns={sortColumns}
        data={DATA}
        pagination={false}
        sortDir="desc"
        sortKey="name"
        onSortChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Tên/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    rerender(
      <Table
        columns={sortColumns}
        data={DATA}
        pagination={false}
        sortDir={null}
        sortKey={null}
        onSortChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Tên/ })).toHaveAttribute('aria-sort', 'none');
  });
});
