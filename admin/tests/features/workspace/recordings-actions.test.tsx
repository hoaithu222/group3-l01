/**
 * Tab "Ghi hình" — ngăn kéo chi tiết và xoá bản ghi (p2-06 admin.md §2.3, §2.4, §4): chỉ `admin` (`workspace:delete`) thấy nút Xoá, nút tắt khi bản
 * còn đang ghi, hộp thoại BẮT BUỘC lý do ≥ 10 ký tự rồi mới gọi `DELETE /admin/recordings/:id?reason=`; ngăn kéo chỉ hiện metadata (số người đồng ý,
 * không tên; khoá object che một phần; lỗi đã làm sạch; nhật ký `MeetingRecording`). Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceRecordingsTab from '@/features/workspace/components/tabs/WorkspaceRecordingsTab';

import {
  errorBody,
  makeDetail,
  mockRecordings,
  okBody,
  renderTabAt,
  signIn,
  urlParam,
} from './recordings-fixtures';

const server = setupServer(
  http.get('*/capabilities', () =>
    okBody({
      features: {
        meeting: { enabled: true, available: true },
        meetingRecording: { enabled: true, available: true },
      },
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ADMIN = ['workspace:view', 'meeting:delete'];
const URL0 = '/workspace/ws-1?tab=recordings';
const renderTab = (url = URL0) => renderTabAt(<WorkspaceRecordingsTab workspaceId="ws-1" />, url);
const row = (title: string) => screen.getByText(title).closest('tr')!;
const deleteButton = (title: string) =>
  within(row(title)).queryByRole('button', { name: /^Xoá bản ghi / });

interface DeleteCall {
  id: string;
  reason: string | null;
}

/** DELETE ghi lại `id` + `reason`; `reply` quyết định phản hồi (mặc định 204). */
function mockDelete(reply: () => Response = () => new HttpResponse(null, { status: 204 })) {
  const calls: DeleteCall[] = [];
  server.use(
    http.delete('*/admin/recordings/:id', ({ params, request }) => {
      calls.push({
        id: String(params.id),
        reason: new URL(request.url).searchParams.get('reason'),
      });
      return reply();
    }),
  );
  return calls;
}

beforeEach(() => signIn(ADMIN));

describe('nút Xoá theo quyền và trạng thái', () => {
  it('manager (không meeting:delete) KHÔNG thấy nút Xoá nào; admin thấy', async () => {
    mockRecordings(server);
    signIn(['workspace:view']);
    renderTab();
    await screen.findByText('Họp tuần sản phẩm');
    expect(screen.queryByRole('button', { name: /^Xoá bản ghi / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
  });

  it('admin: Xoá được bản READY/FAILED/PROCESSING; TẮT (kèm lý do) khi STARTING/RECORDING/STOPPING; bản đã xoá không còn nút', async () => {
    mockRecordings(server);
    renderTab();
    await screen.findByText('Họp tuần sản phẩm');

    for (const title of ['Họp tuần sản phẩm', 'Họp bị lỗi', 'Họp đang xử lý'])
      expect(deleteButton(title)).toBeEnabled();
    for (const title of ['Họp khởi động', 'Họp đang ghi', 'Họp đang dừng'])
      expect(deleteButton(title)).toBeDisabled();
    expect(deleteButton('Họp đã xoá bản ghi')).toBeNull();

    await userEvent.setup().hover(deleteButton('Họp đang ghi')!.parentElement!);
    expect(
      await screen.findAllByText('Bản ghi đang được ghi hoặc đang dừng, chưa thể xoá.'),
    ).not.toHaveLength(0);
  });

  it('bấm Xoá KHÔNG mở ngăn kéo chi tiết (chỉ mở hộp thoại xoá)', async () => {
    mockRecordings(server);
    const { router } = renderTab();
    await screen.findByText('Họp tuần sản phẩm');

    await userEvent.setup().click(deleteButton('Họp tuần sản phẩm')!);

    expect(await screen.findByText('Xoá bản ghi "Họp tuần sản phẩm"')).toBeInTheDocument();
    expect(urlParam(router, 'recId')).toBeNull();
  });
});

describe('hộp thoại xoá (lý do + audit)', () => {
  it('nêu tác động; lý do < 10 ký tự không gửi; đủ lý do → DELETE ?reason= đúng một lần, làm mới danh sách + thẻ, đóng hộp thoại', async () => {
    const { calls, summaryCalls } = mockRecordings(server);
    const deletes = mockDelete();
    renderTab();
    await screen.findByText('Họp tuần sản phẩm');
    const user = userEvent.setup();
    const listBefore = calls.length;
    const summaryBefore = summaryCalls.length;

    await user.click(deleteButton('Họp tuần sản phẩm')!);
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'Bản ghi bị xoá vĩnh viễn khỏi lưu trữ, người tham dự không xem được nữa. Không hoàn tác.',
      ),
    ).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'ngắn quá');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá bản ghi' }));
    expect(await within(dialog).findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(deletes).toHaveLength(0);

    await user.clear(within(dialog).getByRole('textbox', { name: /Lý do/ }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /Lý do/ }),
      'Chủ trì yêu cầu gỡ bản ghi',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Xoá bản ghi' }));

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0]).toEqual({ id: 'r-ready', reason: 'Chủ trì yêu cầu gỡ bản ghi' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(calls.length).toBeGreaterThan(listBefore));
    expect(summaryCalls.length).toBeGreaterThan(summaryBefore);
  });

  it('lý do gồm khoảng trắng đầu/cuối → gửi đã cắt; chỉ toàn khoảng trắng → coi như thiếu', async () => {
    mockRecordings(server);
    const deletes = mockDelete();
    renderTab();
    await screen.findByText('Họp bị lỗi');
    const user = userEvent.setup();

    await user.click(deleteButton('Họp bị lỗi')!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), '              ');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá bản ghi' }));
    expect(deletes).toHaveLength(0);

    await user.clear(within(dialog).getByRole('textbox', { name: /Lý do/ }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /Lý do/ }),
      '   Bản ghi lỗi, dọn kho   ',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Xoá bản ghi' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0]!.reason).toBe('Bản ghi lỗi, dọn kho');
  });

  it('BE báo còn đang ghi (409 MEET_009) hoặc đã xoá (404 REC_005) → đóng hộp thoại (thử lại cũng vẫn thế); lỗi tạm thời (500) → giữ mở để thử lại', async () => {
    mockRecordings(server);
    let reply: () => Response = () => errorBody(409, 'MEET_009', 'Bản ghi đang được ghi');
    const deletes = mockDelete(() => reply());
    renderTab();
    await screen.findByText('Họp tuần sản phẩm');
    const user = userEvent.setup();
    const submit = async (reason: string) => {
      await user.click(deleteButton('Họp tuần sản phẩm')!);
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), reason);
      await user.click(within(dialog).getByRole('button', { name: 'Xoá bản ghi' }));
      return dialog;
    };

    await submit('Thử xoá bản đang ghi');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    reply = () => errorBody(404, 'REC_005', 'Bản ghi không còn khả dụng');
    await submit('Thử xoá bản đã xoá rồi');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    reply = () => errorBody(500, 'SYS_500', 'Lỗi máy chủ');
    const dialog = await submit('Thử lại khi máy chủ lỗi');
    await waitFor(() => expect(deletes).toHaveLength(3));
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('ngăn kéo chi tiết bản ghi', () => {
  const auditEntry = {
    id: 'a1',
    actorId: 'u-admin',
    actor: { id: 'u-admin', name: 'Quản trị Bình', role: 'admin' },
    actorRole: 'admin',
    action: 'recording.delete',
    targetType: 'MeetingRecording',
    targetId: 'r-ready',
    workspaceId: 'ws-1',
    reason: 'Dọn kho lưu trữ',
    metadata: null,
    ip: null,
    userAgent: null,
    at: '2026-10-20T01:00:00.000Z',
  };

  it('bấm hàng → ?recId= + metadata vận hành; số người đồng ý là SỐ (không tên); khoá object che một phần; KHÔNG có phát/tải/liên kết', async () => {
    mockRecordings(server);
    const audits: URLSearchParams[] = [];
    server.use(
      http.get('*/audit-logs', ({ request }) => {
        audits.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          success: true,
          data: [auditEntry],
          meta: { nextCursor: null, hasMore: false, limit: 20 },
        });
      }),
    );
    signIn([...ADMIN, 'audit-log:view']);
    const { router } = renderTab();
    await screen.findByText('Họp tuần sản phẩm');

    await userEvent.setup().click(screen.getByText('Họp tuần sản phẩm'));

    const drawer = await screen.findByRole('dialog');
    expect(urlParam(router, 'recId')).toBe('r-ready');
    expect(await within(drawer).findByText('Bố cục: Lưới')).toBeInTheDocument();
    expect(within(drawer).getByText('Số người đã đồng ý').nextElementSibling).toHaveTextContent(
      /^3$/,
    );
    expect(within(drawer).getByText('Chỉ đếm số người, không nêu tên')).toBeInTheDocument();
    expect(within(drawer).getByText('Chủ trì dừng ghi')).toBeInTheDocument();
    expect(within(drawer).getByText('recordings/…/r-ready.mp4')).toBeInTheDocument();
    expect(within(drawer).getByText('Có tệp trên kho lưu trữ (700 MB)')).toBeInTheDocument();
    expect(within(drawer).getByText('EG_abc123')).toBeInTheDocument();
    expect(within(drawer).getByText('call-1')).toBeInTheDocument();
    expect(drawer.querySelector('video, audio, source, a[href], [download]')).toBeNull();
    expect(
      within(drawer).queryByRole('button', { name: /phát|tải|xem trước|download|play/i }),
    ).not.toBeInTheDocument();
    // Nhật ký của ĐÚNG đối tượng.
    expect(await within(drawer).findByText('Dọn kho lưu trữ')).toBeInTheDocument();
    expect(audits[0]!.get('targetType')).toBe('MeetingRecording');
    expect(audits[0]!.get('targetId')).toBe('r-ready');
  });

  it('KHÔNG lộ tên người đồng ý/URL ký/nội dung biên bản dù BE lỡ trả kèm', async () => {
    mockRecordings(server);
    const hostile = {
      ...makeDetail(),
      consent: [{ userId: 'u9', name: 'NGUOI-DONG-Y-BI-AN' }],
      consentNames: ['NGUOI-DONG-Y-BI-AN'],
      playbackUrl: 'https://s3.example.com/x?X-Amz-Signature=BI-MAT',
      minutes: 'NOI-DUNG-BIEN-BAN-BI-AN',
    };
    server.use(http.get('*/admin/recordings/r-ready', () => okBody(hostile)));
    renderTab(`${URL0}&recId=r-ready`);

    const drawer = await screen.findByRole('dialog');
    await within(drawer).findByText('Bố cục: Lưới');
    const text = document.body.textContent ?? '';
    for (const secret of [
      'NGUOI-DONG-Y-BI-AN',
      'BI-MAT',
      'X-Amz',
      's3.example.com',
      'NOI-DUNG-BIEN-BAN-BI-AN',
    ])
      expect(text).not.toContain(secret);
  });

  it('bản FAILED: hiện lỗi đã làm sạch; trạng thái tệp theo HEAD (không thấy tệp / chưa kiểm được / đang ghi chưa có tệp)', async () => {
    mockRecordings(server);
    renderTab(`${URL0}&recId=r-failed`);
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Lỗi khi ghi hoặc xử lý bản ghi')).toBeInTheDocument();
    expect(
      within(drawer).getByText('Egress dừng đột ngột (mã lỗi đã làm sạch)'),
    ).toBeInTheDocument();
  });

  it.each([
    [
      'tệp không còn trên kho',
      { object: { exists: false, sizeBytes: null } },
      'Không thấy tệp trên kho lưu trữ',
    ],
    [
      'storage lỗi lúc kiểm (object null)',
      { object: null },
      'Chưa kiểm tra được kho lưu trữ lúc này',
    ],
    [
      'bản đang ghi',
      { status: 'RECORDING' as const, object: null, fileSizeBytes: null },
      'Chưa có tệp (đang ghi)',
    ],
    [
      'bản đã xoá',
      { deletedAt: '2026-10-20T00:00:00.000Z', deleteReason: 'Hết hạn theo yêu cầu', object: null },
      'Đã xoá khỏi lưu trữ',
    ],
  ])('trạng thái object: %s', async (_name, patch, label) => {
    mockRecordings(server);
    server.use(http.get('*/admin/recordings/r-ready', () => okBody(makeDetail(patch))));
    renderTab(`${URL0}&recId=r-ready`);

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(label)).toBeInTheDocument();
  });

  it('bản đã xoá: hiện thời điểm + lý do xoá, KHÔNG có nút Xoá', async () => {
    mockRecordings(server);
    server.use(
      http.get('*/admin/recordings/r-deleted', () =>
        okBody(
          makeDetail({
            id: 'r-deleted',
            deletedAt: '2026-10-20T00:00:00.000Z',
            deleteReason: 'Yêu cầu của chủ trì',
            object: null,
          }),
        ),
      ),
    );
    renderTab(`${URL0}&recId=r-deleted`);

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(/^Đã xoá lúc /)).toBeInTheDocument();
    expect(within(drawer).getByText('Lý do: Yêu cầu của chủ trì')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Xoá bản ghi' })).not.toBeInTheDocument();
  });

  it('không có audit-log:view → nhật ký nói rõ không có quyền (không gọi /audit-logs)', async () => {
    mockRecordings(server);
    renderTab(`${URL0}&recId=r-ready`);

    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText('Bạn không có quyền xem nhật ký quản trị.'),
    ).toBeInTheDocument();
  });

  it('id lạ (404) → "Không tìm thấy bản ghi", không lộ dữ liệu; Escape đóng và bỏ ?recId=, giữ ?tab', async () => {
    mockRecordings(server);
    const { router } = renderTab(`${URL0}&recId=khong-co`);
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Không tìm thấy bản ghi')).toBeInTheDocument();

    await userEvent.setup().keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(urlParam(router, 'recId')).toBeNull();
    expect(urlParam(router, 'tab')).toBe('recordings');
  });

  it('manager: ngăn kéo không có nút Xoá; admin: bản đang ghi thì nút Xoá bị tắt', async () => {
    mockRecordings(server);
    signIn(['workspace:view']);
    renderTab(`${URL0}&recId=r-ready`);
    const drawer = await screen.findByRole('dialog');
    await within(drawer).findByText('Bố cục: Lưới');
    expect(within(drawer).queryByRole('button', { name: 'Xoá bản ghi' })).not.toBeInTheDocument();
  });

  it('admin: bản đang ghi → nút Xoá trong ngăn kéo bị tắt', async () => {
    mockRecordings(server);
    server.use(
      http.get('*/admin/recordings/r-recording', () =>
        okBody(
          makeDetail({ id: 'r-recording', status: 'RECORDING', object: null, fileSizeBytes: null }),
        ),
      ),
    );
    renderTab(`${URL0}&recId=r-recording`);
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByRole('button', { name: 'Xoá bản ghi' })).toBeDisabled();
  });

  it('admin xoá TỪ ngăn kéo: hộp thoại lý do mở chồng lên ngăn kéo, gửi DELETE đúng id, ngăn kéo vẫn mở và hiện bản đã xoá sau khi làm mới', async () => {
    mockRecordings(server);
    let deleted = false;
    server.use(
      http.get('*/admin/recordings/r-ready', () =>
        okBody(
          deleted
            ? makeDetail({
                deletedAt: '2026-10-25T00:00:00.000Z',
                deleteReason: 'Dọn kho từ ngăn kéo',
                object: null,
              })
            : makeDetail(),
        ),
      ),
    );
    const deletes = mockDelete(() => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    });
    renderTab(`${URL0}&recId=r-ready`);
    const drawer = await screen.findByRole('dialog');
    const user = userEvent.setup();

    await user.click(await within(drawer).findByRole('button', { name: 'Xoá bản ghi' }));
    const dialogs = await screen.findAllByRole('dialog');
    const modal = dialogs.at(-1)!;
    await user.type(within(modal).getByRole('textbox', { name: /Lý do/ }), 'Dọn kho từ ngăn kéo');
    await user.click(within(modal).getByRole('button', { name: 'Xoá bản ghi' }));

    await waitFor(() =>
      expect(deletes).toEqual([{ id: 'r-ready', reason: 'Dọn kho từ ngăn kéo' }]),
    );
    expect(await screen.findByText(/^Đã xoá lúc /)).toBeInTheDocument();
    expect(screen.getByText('Lý do: Dọn kho từ ngăn kéo')).toBeInTheDocument();
  });
});
