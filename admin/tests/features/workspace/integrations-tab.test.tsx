/**
 * Tab "Tích hợp" của workspace (p5-03 admin.md §2.4, §4) — CHỈ ĐỌC các kết nối của nhóm: nhà cung cấp, tài khoản ngoài, trạng thái + lý do, kênh nhận
 * (kênh riêng tư không lộ tên), KHÔNG token/khoá/cấu hình, KHÔNG nút ghi. Mock ở tầng HTTP (MSW).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceIntegrationsTab from '@/features/workspace/components/tabs/WorkspaceIntegrationsTab';

import { CONNECTIONS, makeConnection } from './integrations-mentor-fixtures';
import { errorBody, okBody, renderWithQuery, signIn } from './p3-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['integration:view']));

const URL_PATTERN = '*/admin/workspaces/:id/integrations';
const renderTab = () => renderWithQuery(<WorkspaceIntegrationsTab workspaceId="ws-1" />);

/** Response "vi phạm hợp đồng": kèm token, khoá, cấu hình và tên kênh riêng tư mà admin tuyệt đối không được thấy. */
const LEAKY_RESPONSE = CONNECTIONS.map((c) => ({
  ...c,
  config: { webhookSecret: 'whsec_bi_mat_123', repo: 'vci/app' },
  accessToken: 'ghp_token_bi_mat_456',
  ciphertext: 'ciphertext-bi-mat-789',
  target: { ...c.target, channelName: 'kenh-rieng-tu-luong-thuong' },
}));

describe('WorkspaceIntegrationsTab — kết nối của nhóm', () => {
  it('hiện từng kết nối: nhà cung cấp, tài khoản ngoài, trạng thái + lý do bằng chữ, kênh nhận, người kết nối, sự kiện cuối', async () => {
    let calledPath = '';
    server.use(
      http.get(URL_PATTERN, ({ request }) => {
        calledPath = new URL(request.url).pathname;
        return okBody(CONNECTIONS);
      }),
    );
    renderTab();

    expect(await screen.findByText('vci/app')).toBeInTheDocument();
    expect(calledPath).toMatch(/\/admin\/workspaces\/ws-1\/integrations$/);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent('GitHub');
    expect(rows[0]).toHaveTextContent('Đang hoạt động');
    expect(rows[0]).toHaveTextContent('#thong-bao');
    expect(rows[0]).toHaveTextContent('Nguyễn Chủ Nhóm');
    expect(rows[0]).toHaveTextContent(/\d{2}:\d{2} 20\/09\/2026/);

    expect(rows[1]).toHaveTextContent('Figma');
    expect(rows[1]).toHaveTextContent('Kênh riêng tư');

    expect(rows[2]).toHaveTextContent('GitLab');
    expect(rows[2]).toHaveTextContent('Lỗi');
    // Lý do lỗi hiện bằng chữ tiếng Việt, không phải mã thô.
    expect(rows[2]).toHaveTextContent('Người cấu hình không còn quyền đăng vào kênh nhận');
    expect(rows[2]).not.toHaveTextContent('TARGET_FORBIDDEN');
    expect(rows[2]).toHaveTextContent('Kênh riêng tư');

    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Nhà cung cấp',
      'Tài khoản ngoài',
      'Trạng thái',
      'Kênh nhận',
      'Người kết nối',
      'Sự kiện cuối',
    ]);
  });

  it('chỉ đọc: không có nút nào ở trạng thái thành công, kể cả khi có quyền ghi tích hợp', async () => {
    signIn(['integration:view', 'integration:update', 'workspace:update']);
    server.use(http.get(URL_PATTERN, () => okBody(CONNECTIONS)));
    renderTab();
    await screen.findByText('vci/app');

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('nhóm chưa kết nối gì: bảng rỗng có thông báo (không phải lỗi)', async () => {
    server.use(http.get(URL_PATTERN, () => okBody([])));
    renderTab();

    expect(await screen.findByText('Nhóm chưa kết nối tích hợp nào')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách tích hợp')).not.toBeInTheDocument();
  });

  it('kênh đã bị xoá (không riêng tư, không có tên): "Kênh không còn"', async () => {
    server.use(
      http.get(URL_PATTERN, () =>
        okBody([makeConnection({ target: { scopeType: 'CHANNEL', name: null, private: false } })]),
      ),
    );
    renderTab();

    expect(await screen.findByText('Kênh không còn')).toBeInTheDocument();
  });
});

describe('WorkspaceIntegrationsTab — riêng tư', () => {
  const LEAKED = [
    'whsec_bi_mat_123',
    'ghp_token_bi_mat_456',
    'ciphertext-bi-mat-789',
    'kenh-rieng-tu-luong-thuong',
  ];

  it('BE lỡ trả thừa token/khoá/cấu hình/tên kênh riêng tư ⇒ không chữ nào lên màn hình', async () => {
    server.use(http.get(URL_PATTERN, () => okBody(LEAKY_RESPONSE)));
    renderTab();
    await screen.findByText('vci/app');

    const text = document.body.textContent ?? '';
    for (const leaked of LEAKED) {
      expect(text, `không được in "${leaked}"`).not.toContain(leaked);
    }
    // Tên kênh CÔNG KHAI vẫn hiện; kênh riêng tư chỉ hiện "Kênh riêng tư".
    expect(text).toContain('#thong-bao');
    expect(screen.getAllByText('Kênh riêng tư')).toHaveLength(2);
  });
});

describe('WorkspaceIntegrationsTab — lỗi tải', () => {
  it('lỗi máy chủ: báo lỗi có "Thử lại" (KHÔNG vẽ bảng rỗng), bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get(URL_PATTERN, () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(CONNECTIONS);
      }),
    );
    renderTab();

    expect(await screen.findByText('Không tải được danh sách tích hợp')).toBeInTheDocument();
    expect(screen.queryByText('Nhóm chưa kết nối tích hợp nào')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('vci/app')).toBeInTheDocument();
  });

  it('403 hoặc 404 khác CFG_005: giải thích, KHÔNG có "Thử lại"', async () => {
    server.use(http.get(URL_PATTERN, () => errorBody(403, 'AUTH_003', 'Không có quyền')));
    renderTab();

    expect(await screen.findByText('Không tải được danh sách tích hợp')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('cờ integration tắt giữa chừng (404 CFG_005): "Tích hợp đang tắt", KHÔNG phải lỗi', async () => {
    server.use(http.get(URL_PATTERN, () => errorBody(404, 'CFG_005', 'Tính năng chưa được bật')));
    renderTab();

    expect(await screen.findByText('Tích hợp đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách tích hợp')).not.toBeInTheDocument();
  });
});

// Đọc mã nguồn ở dạng chuỗi (không dùng `fs`: tsconfig.app không nạp type của Node).
const SOURCES = import.meta.glob(
  [
    '../../../src/features/workspace/**/*[Ii]ntegration*.{ts,tsx}',
    '../../../src/features/integration/types/*.ts',
    '../../../src/features/integration/service/integration.service.ts',
  ],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const entries = Object.entries(SOURCES).map(([path, raw]) => [path, stripComments(raw)] as const);

describe('tab tích hợp — mã nguồn không chạm token/khoá', () => {
  it('quét được đủ file (không quét rỗng)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(4);
  });

  it('kiểu dữ liệu và cột không khai/đọc token, secret, ciphertext, cấu hình', () => {
    const forbiddenDecl =
      /\b(token|accessToken|refreshToken|secret|webhookSecret|ciphertext|config)\s*[?:]/i;
    const forbiddenAccess =
      /\.(token|accessToken|refreshToken|secret|webhookSecret|ciphertext|config)\b/i;
    const offenders = entries
      .filter(([, code]) => forbiddenDecl.test(code) || forbiddenAccess.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('service tab tích hợp của workspace là GET (không lệnh ghi cho workspace)', () => {
    const service = entries.filter(([p]) => p.endsWith('integration.service.ts'));
    expect(service).toHaveLength(1);
    expect(service[0][1]).toMatch(/listForWorkspace[\s\S]*?apiClient\.get\b/);
  });
});
