/**
 * Test viewpoint riêng tư của phần khách / lời mời (p3-04 admin.md §4): bảng lời mời hiển thị email CHE và
 * KHÔNG có token; admin nền tảng chỉ xem, không mời/duyệt thay chủ nhóm. Hai lớp chặn:
 *
 *  1. DOM — cho BE "lỡ" trả thừa token/email đầy đủ; giao diện không in.
 *  2. Mã nguồn — kiểu/service của phần truy cập không khai token, không có lệnh ghi.
 */
import { screen } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import InvitationsReadonlyTable from '@/features/workspace/components/InvitationsReadonlyTable';

import { okBody, renderWithRouter, signIn } from './p3-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view', 'user:view']));

const LEAKY_ROWS = [
  {
    id: 'inv-1',
    // BE lỡ trả email ĐẦY ĐỦ — client phải che tiếp.
    email: 'linh.nguyen@gmail.com',
    role: 'GUEST',
    invitedBy: '64a1b2c3d4e5f60718293b0a',
    status: 'PENDING',
    expiresAt: '2026-09-25T10:00:00.000Z',
    token: 'tok_9f8e7d6c5b4a39281706f5e4d3c2b1a0',
    tokenHash: 'sha256_abcdef0123456789',
    inviteLink: 'https://superapp.vcijsc.com/invite/e/tok_9f8e7d6c5b4a39281706f5e4d3c2b1a0',
    message: 'Mời bạn vào nhóm đồ án',
    guestChannelIds: ['c-secret-1'],
  },
  {
    id: 'inv-2',
    // BE đã che đúng — giữ nguyên.
    email: 'm***@truong.edu.vn',
    role: 'MEMBER',
    invitedBy: null,
    status: 'ACCEPTED',
    expiresAt: '2026-09-20T10:00:00.000Z',
    token: 'tok_second_secret',
  },
];

const renderTable = () => renderWithRouter(<InvitationsReadonlyTable workspaceId="ws-1" />);

describe('bảng lời mời — DOM không lộ token / email đầy đủ', () => {
  it('BE lỡ trả thừa token và email đầy đủ ⇒ chỉ email che lên màn hình', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/invitations', () =>
        okBody(LEAKY_ROWS, { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false }),
      ),
    );
    renderTable();
    await screen.findByText('l***@gmail.com'); // email đầy đủ bị che ở client: ký tự đầu + *** + tên miền
    expect(screen.getByText('m***@truong.edu.vn')).toBeInTheDocument();

    const text = document.body.textContent ?? '';
    for (const leaked of [
      'linh.nguyen',
      'tok_9f8e7d6c',
      'tok_second_secret',
      'sha256_abcdef',
      'invite/e/',
      'Mời bạn vào nhóm đồ án',
      'c-secret-1',
    ]) {
      expect(text, `không được in "${leaked}"`).not.toContain(leaked);
    }
  });

  it('không cột token/liên kết và không nút hành động nào', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/invitations', () =>
        okBody(LEAKY_ROWS, { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false }),
      ),
    );
    renderTable();
    await screen.findByText('l***@gmail.com');

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Email',
      'Vai trò',
      'Người mời',
      'Trạng thái',
      'Hết hạn',
    ]);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /thu hồi|gửi lại|mời|copy|sao chép/i })).not.toBeInTheDocument();
  });
});

// Đọc mã nguồn ở dạng chuỗi (không dùng `fs`: tsconfig.app không nạp type của Node).
const SOURCES = import.meta.glob(
  [
    '../../../src/features/workspace/**/*[Aa]ccess*.{ts,tsx}',
    '../../../src/features/workspace/**/Invitations*.{ts,tsx}',
    '../../../src/features/workspace/**/PendingJoinRequests.tsx',
  ],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const entries = Object.entries(SOURCES).map(([path, raw]) => [path, stripComments(raw)] as const);
const inFile = (suffix: string) => entries.filter(([path]) => path.endsWith(suffix));

describe('phần truy cập — mã nguồn không chạm token, không có lệnh ghi', () => {
  it('quét được đủ các file (không quét rỗng)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(8);
  });

  it('kiểu dữ liệu không khai token / liên kết mời', () => {
    const types = inFile('workspace-access.types.ts');
    expect(types).toHaveLength(1);
    expect(/\b(token\w*|inviteLink|link|url|secret)\s*[?:]/i.exec(types[0][1])?.[0]).toBeUndefined();
  });

  it('không file nào đọc token của lời mời', () => {
    const offenders = entries.filter(([, code]) => /\.(token\w*|inviteLink)\b/i.test(code)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('service + api truy cập chỉ đọc (GET): không mời/duyệt/thu hồi thay chủ nhóm', () => {
    const service = inFile('workspace-access.service.ts');
    const api = inFile('workspace-access.api.ts');
    expect(service).toHaveLength(1);
    expect(api).toHaveLength(1);
    expect(service[0][1]).toMatch(/apiClient\.get\b/);
    expect(service[0][1]).not.toMatch(/apiClient\.(post|put|patch|delete)\b/);
    expect(api[0][1]).not.toMatch(/approve|reject|revoke|resend|accept/i);
  });

  it('bảng lời mời và danh sách yêu cầu không nhập nút/hộp thoại hành động', () => {
    const readonly = [...inFile('InvitationsReadonlyTable.tsx'), ...inFile('PendingJoinRequests.tsx')];
    expect(readonly).toHaveLength(2);
    const action = /\b(Button|Toggle|Menu|Modal|ConfirmDialog|ConfirmWithReasonModal|FormModal)\b/;
    expect(readonly.filter(([, code]) => action.test(code)).map(([p]) => p)).toEqual([]);
  });
});
