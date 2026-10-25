/**
 * Hành động `board.contribution-config` trong nhật ký (p4-06 admin.md §1, §4): chủ nhóm/quản trị nhóm đổi công thức
 * đóng góp của MỘT bảng — có nhãn tiếng Việt, lọc được theo hành động, drawer chi tiết hiện trọng số TRƯỚC/SAU và
 * không mang số liệu thành viên. Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import AuditLogPage from '@/features/audit-log/pages/AuditLogPage';
import {
  AUDIT_ACTION_OPTIONS,
  auditActionLabel,
  auditTargetTypeLabel,
} from '@/shared/constants/audit-actions';

import {
  auditLogHandler,
  makeLog,
  OID_ACTOR,
  OID_WORKSPACE,
  type AuditLogRequestLog,
} from './audit-log-fixtures';

const ACTION = 'board.contribution-config';
const LABEL = 'Đổi công thức tính đóng góp của bảng';
const BOARD_ID = '64a1b2c3d4e5f60718293a01';

const CONFIG_ROW = makeLog({
  id: 'c1',
  action: ACTION,
  actor: { id: OID_ACTOR, name: 'Nguyễn Văn An', role: 'user' },
  targetType: 'Board',
  targetId: BOARD_ID,
  workspaceId: OID_WORKSPACE,
  reason: null,
  metadata: {
    before: {
      weights: { points: 60, onTime: 20, peer: 20 },
      onTimeGraceHours: 0,
      unestimatedPoints: 1,
    },
    after: {
      weights: { points: 50, onTime: 30, peer: 20 },
      onTimeGraceHours: 24,
      unestimatedPoints: 1,
    },
    version: 2,
  },
});

const server = setupServer();
beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderPage(initialUrl = '/audit-log') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <AuditLogPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: {
      id: 'me',
      email: 'ops@congty.vn',
      name: 'Vận hành',
      roles: ['editor'],
      permissions: ['audit-log:view'],
    },
    token: 'test-token',
  });
});

describe('nhãn và danh sách lọc', () => {
  it('có nhãn tiếng Việt cho action và loại đối tượng Board; action nằm trong danh sách lọc đúng một lần', () => {
    expect(auditActionLabel(ACTION)).toBe(LABEL);
    expect(auditTargetTypeLabel('Board')).toBe('Bảng công việc');
    expect(AUDIT_ACTION_OPTIONS.filter((o) => o.value === ACTION)).toEqual([
      { value: ACTION, label: LABEL },
    ]);
  });
});

describe('AuditLogPage — board.contribution-config', () => {
  it('dòng nhật ký hiện nhãn + mã phụ + loại đối tượng "Bảng công việc"', async () => {
    server.use(auditLogHandler([[CONFIG_ROW]]));
    renderPage();

    expect(await screen.findByText(LABEL)).toBeInTheDocument();
    expect(screen.getByText(ACTION)).toBeInTheDocument();
    expect(screen.getByText('Bảng công việc')).toBeInTheDocument();
  });

  it('chọn hành động này ở bộ lọc → URL `action=board.contribution-config` và query gửi đúng giá trị', async () => {
    const log: AuditLogRequestLog = { params: [] };
    server.use(auditLogHandler([[CONFIG_ROW]], log));
    renderPage();
    await screen.findByText(LABEL);

    await userEvent.click(screen.getByText('Mọi hành động'));
    await userEvent.click(await screen.findByRole('checkbox', { name: LABEL }));

    await waitFor(() =>
      expect(
        new URLSearchParams(screen.getByTestId('search').textContent ?? '').get('action'),
      ).toBe(ACTION),
    );
    await waitFor(() => expect(log.params.at(-1)?.get('action')).toBe(ACTION));
  });

  it('drawer hiện công thức TRƯỚC/SAU (trọng số 60/20/20 → 50/30/20) và không có dữ liệu thành viên', async () => {
    server.use(auditLogHandler([[CONFIG_ROW]]));
    renderPage();

    await userEvent.click(await screen.findByText(LABEL));

    const dialog = await screen.findByRole('dialog');
    const diff = within(dialog).getByRole('region', { name: 'So sánh trước và sau' });
    expect(diff.textContent).toContain('"points": 60');
    expect(diff.textContent).toContain('"points": 50');
    expect(diff.textContent).toContain('"onTime": 30');
    // Đối tượng dẫn tới bảng theo id; không có khoá nào nói về người/điểm của thành viên.
    const metadata = within(dialog).getByRole('region', { name: 'Metadata' });
    expect(metadata.textContent).not.toMatch(/members?|score|share|heatmap|userId/i);
  });
});
