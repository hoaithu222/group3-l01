/**
 * Tab "Tổng quan" của workspace — dải ảnh bìa + gỡ ảnh VI PHẠM (`POST /admin/workspaces/:id/remove-image`):
 *  - có ảnh bìa ⇒ dải bìa dùng `coverUrl` (URL ký sẵn, dùng thẳng làm `src`); chưa có ⇒ nền gradient theo `coverPreset`;
 *  - có `workspace:update` + nhóm đang có ảnh ⇒ nút "Gỡ ảnh đại diện" / "Gỡ ảnh bìa"; xác nhận có lý do ⇒ gọi đúng
 *    endpoint với body `{ kind, reason }` và toast;
 *  - thiếu quyền, hoặc nhóm không có ảnh loại đó ⇒ không có nút.
 *
 * Mock ở tầng HTTP (MSW). Radix Avatar không mount `<img>` trong jsdom nên ảnh đại diện chỉ kiểm qua nút/hành vi.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceOverviewTab from '@/features/workspace/components/WorkspaceOverviewTab';
import type {
  AdminWorkspaceDetail,
  AdminWorkspaceRow,
  WorkspaceImageKind,
} from '@/features/workspace/types/workspace.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { ACCESS_SUMMARY, okBody, renderWithRouter, signIn } from './p3-fixtures';

const IMAGE_BASE = 'https://api.superapp.test/api/v1/assets';
const COVER_URL = `${IMAGE_BASE}/c-1/image?v=ORIGINAL&e=1790000000&s=abc`;

const WORKSPACE: AdminWorkspaceRow = {
  id: 'ws-1',
  name: 'Nhóm Alpha',
  avatarUrl: `${IMAGE_BASE}/a-1/image?v=THUMB&e=1790000000&s=def`,
  coverUrl: COVER_URL,
  coverThumbUrl: `${IMAGE_BASE}/c-1/image?v=THUMB&e=1790000000&s=ghi`,
  coverPreset: 'ocean',
  owner: { id: 'o-1', name: 'Chủ nhóm' },
  memberCount: 3,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastActivityAt: '2026-09-01T00:00:00.000Z',
};
const NO_IMAGES: Partial<AdminWorkspaceRow> = { avatarUrl: null, coverUrl: null, coverThumbUrl: null };

const detailOf = (patch: Partial<AdminWorkspaceRow> = {}): AdminWorkspaceDetail => ({
  workspace: { ...WORKSPACE, ...patch },
  stats30d: { messages: 1, activeMembers: 1, files: 0 },
});

/** Mọi lượt gọi `remove-image` mà "BE" nhận — để kiểm đúng đường dẫn và đúng body. */
const removeCalls: Array<{ id: string; body: unknown }> = [];

const server = setupServer(
  http.get('*/admin/workspaces/:id/stats', () => okBody([])),
  http.get('*/admin/workspaces/:id/access-summary', () => okBody(ACCESS_SUMMARY)),
  http.post('*/admin/workspaces/:id/remove-image', async ({ params, request }) => {
    const body = (await request.json()) as { kind: WorkspaceImageKind; reason: string };
    removeCalls.push({ id: String(params.id), body });
    const cleared = body.kind === 'COVER' ? { coverUrl: null, coverThumbUrl: null } : { avatarUrl: null };
    return okBody({ removed: true, workspace: { ...WORKSPACE, ...cleared } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  removeCalls.length = 0;
  useToastStore.setState({ toasts: [] });
});

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const renderTab = (detail: AdminWorkspaceDetail) =>
  renderWithRouter(<WorkspaceOverviewTab detail={detail} />);

describe('WorkspaceOverviewTab — dải ảnh bìa', () => {
  it('có ảnh bìa: dùng thẳng `coverUrl` làm nguồn ảnh, bấm được để xem cỡ lớn', async () => {
    signIn(['workspace:view']);
    renderTab(detailOf());

    expect(await screen.findByAltText('Ảnh bìa nhóm Nhóm Alpha')).toHaveAttribute('src', COVER_URL);
    expect(screen.getByRole('button', { name: 'Ảnh bìa nhóm Nhóm Alpha' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('chưa có ảnh bìa: nền gradient theo `coverPreset` của BE, không có thẻ ảnh', async () => {
    signIn(['workspace:view']);
    const { container } = renderTab(detailOf({ ...NO_IMAGES, coverPreset: 'forest' }));

    await screen.findByText('Nhóm Alpha');
    expect(screen.queryByAltText('Ảnh bìa nhóm Nhóm Alpha')).not.toBeInTheDocument();
    expect(container.querySelector('[data-cover-preset="forest"]')).toBeInTheDocument();
  });

  it('`coverPreset` null: chọn mẫu ổn định theo id nhóm (cùng thuật toán app)', async () => {
    signIn(['workspace:view']);
    const { container } = renderTab(detailOf({ ...NO_IMAGES, coverPreset: null }));

    await screen.findByText('Nhóm Alpha');
    // `ws-1` → băm ×31 = 3657088 → chỉ số 1 → `amber` (xem workspace-cover.test.ts).
    expect(container.querySelector('[data-cover-preset="amber"]')).toBeInTheDocument();
  });
});

describe('WorkspaceOverviewTab — gỡ ảnh vi phạm', () => {
  it('có `workspace:update` + ảnh bìa: xác nhận có lý do ⇒ POST remove-image `{ kind: "COVER", reason }` + toast', async () => {
    signIn(['workspace:view', 'workspace:update']);
    const user = userEvent.setup();
    renderTab(detailOf());

    expect(await screen.findByRole('button', { name: 'Gỡ ảnh đại diện' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Gỡ ảnh bìa' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Gỡ ảnh bìa — Nhóm Alpha' }));
    expect(dialog.getByText(/chủ nhóm được thông báo/)).toBeInTheDocument();
    await user.type(dialog.getByLabelText(/^Lý do/), 'Ảnh bìa có nội dung phản cảm');
    await user.click(dialog.getByRole('button', { name: 'Gỡ ảnh bìa' }));

    await waitFor(() =>
      expect(removeCalls).toEqual([
        { id: 'ws-1', body: { kind: 'COVER', reason: 'Ảnh bìa có nội dung phản cảm' } },
      ]),
    );
    await waitFor(() => expect(toastTitles()).toContain('Đã gỡ ảnh bìa và ghi nhật ký'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Gỡ ảnh bìa — Nhóm Alpha' })).not.toBeInTheDocument(),
    );
  });

  it('gỡ ảnh đại diện gửi `kind: "AVATAR"`; lý do quá ngắn thì KHÔNG gọi API', async () => {
    signIn(['workspace:view', 'workspace:update']);
    const user = userEvent.setup();
    renderTab(detailOf());

    await user.click(await screen.findByRole('button', { name: 'Gỡ ảnh đại diện' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Gỡ ảnh đại diện — Nhóm Alpha' }),
    );
    await user.type(dialog.getByLabelText(/^Lý do/), 'ngắn');
    await user.click(dialog.getByRole('button', { name: 'Gỡ ảnh đại diện' }));
    expect(await dialog.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(removeCalls).toEqual([]);

    await user.clear(dialog.getByLabelText(/^Lý do/));
    await user.type(dialog.getByLabelText(/^Lý do/), 'Ảnh đại diện mạo danh thương hiệu');
    await user.click(dialog.getByRole('button', { name: 'Gỡ ảnh đại diện' }));
    await waitFor(() =>
      expect(removeCalls).toEqual([
        { id: 'ws-1', body: { kind: 'AVATAR', reason: 'Ảnh đại diện mạo danh thương hiệu' } },
      ]),
    );
    await waitFor(() => expect(toastTitles()).toContain('Đã gỡ ảnh đại diện và ghi nhật ký'));
  });

  it('thiếu `workspace:update`: không có nút gỡ ảnh dù nhóm có đủ hai ảnh', async () => {
    signIn(['workspace:view']);
    renderTab(detailOf());

    await screen.findByText('Nhóm Alpha');
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh đại diện' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh bìa' })).not.toBeInTheDocument();
  });

  it('có quyền nhưng nhóm chưa có ảnh: không có nút gỡ (vẫn có "Lưu trữ cấp nền tảng")', async () => {
    signIn(['workspace:view', 'workspace:update']);
    renderTab(detailOf(NO_IMAGES));

    expect(await screen.findByRole('button', { name: 'Lưu trữ cấp nền tảng' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh đại diện' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh bìa' })).not.toBeInTheDocument();
  });
});
