/**
 * Test viewpoint riêng tư của tab `resources` (p3-01 admin.md §4, cổng ra Phase 3 mục 5): admin CHỈ thấy
 * số liệu dung lượng — KHÔNG tên tệp, tên thư mục hay nội dung kho tài liệu của nhóm. Hai lớp chặn:
 *
 *  1. DOM — cho BE "lỡ" trả thừa tên tệp/thư mục; giao diện chỉ in các trường trong hợp đồng.
 *  2. Mã nguồn — kiểu và component của tab không khai/đọc trường nào mang tên tệp hay thư mục.
 */
import { screen } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceResourcesTab from '@/features/workspace/components/tabs/WorkspaceResourcesTab';

import { okBody, renderWithQuery, RESOURCE_STATS, signIn } from './p3-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view', 'system-config:update']));

/** Response "vi phạm hợp đồng": kèm đủ tên tệp/thư mục mà admin tuyệt đối không được thấy. */
const LEAKY_RESPONSE = {
  ...RESOURCE_STATS,
  byType: RESOURCE_STATS.byType.map((t, i) => ({
    ...t,
    name: `Giao-trinh-mat-${i}.pdf`,
    fileName: `Ke-hoach-noi-bo-${i}.docx`,
    files: [{ name: 'Bang-luong-thang-9.xlsx' }],
  })),
  files: [{ id: 'r-1', name: 'De-thi-cuoi-ky-CONFIDENTIAL.pdf', mimeType: 'application/pdf' }],
  folders: [{ id: 'f-1', name: 'Thu-muc-rieng-cua-nhom-Alpha' }],
  recentUploads: [{ name: 'Anh-chup-man-hinh-bug.png', uploaderName: 'Nguyễn Văn An' }],
};

const LEAKED = [
  'Giao-trinh-mat-',
  'Ke-hoach-noi-bo-',
  'Bang-luong-thang-9',
  'De-thi-cuoi-ky',
  'Thu-muc-rieng-cua-nhom-Alpha',
  'Anh-chup-man-hinh-bug',
  'Nguyễn Văn An',
];

describe('tab resources — DOM không lộ tên tệp/thư mục', () => {
  it('BE lỡ trả thừa tên ⇒ không chữ nào trong số đó lên màn hình', async () => {
    server.use(http.get('*/admin/workspaces/:id/resource-stats', () => okBody(LEAKY_RESPONSE)));
    renderWithQuery(<WorkspaceResourcesTab workspaceId="ws-1" />);
    await screen.findByText('Dung lượng kho tài liệu');

    const text = document.body.textContent ?? '';
    for (const leaked of LEAKED) {
      expect(text, `không được in "${leaked}"`).not.toContain(leaked);
    }
  });

  it('bảng theo loại chỉ có ba cột số liệu — không cột tên/đường dẫn', async () => {
    server.use(http.get('*/admin/workspaces/:id/resource-stats', () => okBody(LEAKY_RESPONSE)));
    renderWithQuery(<WorkspaceResourcesTab workspaceId="ws-1" />);
    await screen.findByText('Dung lượng kho tài liệu');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Loại', 'Số tệp', 'Dung lượng']);
    expect(screen.queryByRole('columnheader', { name: /tên|đường dẫn|người tải/i })).not.toBeInTheDocument();
  });
});

// Đọc mã nguồn ở dạng chuỗi (không dùng `fs`: tsconfig.app không nạp type của Node).
const SOURCES = import.meta.glob('../../../src/features/workspace/**/*[Rr]esource*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const entries = Object.entries(SOURCES).map(([path, raw]) => [path, stripComments(raw)] as const);
const inFile = (suffix: string) => entries.filter(([path]) => path.endsWith(suffix));

describe('tab resources — mã nguồn không chạm tên tệp/thư mục', () => {
  it('quét được đủ các file kho tài liệu (không quét rỗng)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it('kiểu dữ liệu không khai trường tên tệp/thư mục/đường dẫn/người tải', () => {
    const types = inFile('workspace-resources.types.ts');
    expect(types).toHaveLength(1);
    const forbidden = /\b(name|fileName|filename|folderName|path|title|url|uploader\w*|owner\w*)\s*[?:]/;
    expect(forbidden.exec(types[0][1])?.[0]).toBeUndefined();
  });

  it('không file nào đọc `.name` / `.fileName` của dữ liệu kho', () => {
    const offenders = entries
      .filter(([, code]) => /\.(name|fileName|folderName|path)\b/.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('service chỉ có GET số liệu và ghi hạn mức — không có route tệp/thư mục', () => {
    const api = inFile('workspace-resources.api.ts');
    expect(api).toHaveLength(1);
    expect(api[0][1]).not.toMatch(/\/(folders?|files?|resources)\b/);
    expect(api[0][1]).toMatch(/resource-stats/);
    expect(api[0][1]).toMatch(/resource-quota/);
  });
});
