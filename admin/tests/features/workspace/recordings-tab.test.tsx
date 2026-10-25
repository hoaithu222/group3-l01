/**
 * Tab "Ghi hình" của workspace (p2-06 admin.md §2, §4) — CHỈ metadata vận hành: cột, nhãn trạng thái bằng CHỮ, lọc/sắp xếp/phân trang phía SERVER
 * đồng bộ URL (khoá riêng `rec*`), thẻ tóm tắt (số chưa có hiện `—`, không `0`), trạng thái lỗi tải, và — quan trọng nhất — KHÔNG phát/tải/xem
 * trước bản ghi, không lộ URL ký/khoá S3/mã họp/tên người đồng ý dù BE lỡ trả kèm (D-24, OPC-05). Mock ở tầng HTTP (MSW).
 */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceRecordingsTab from '@/features/workspace/components/tabs/WorkspaceRecordingsTab';
import { formatDate } from '@/shared/utils/format';

import {
  errorBody,
  makeRecording,
  mockRecordings,
  okBody,
  pageMeta,
  RECORDING_ROWS,
  renderTabAt,
  signIn,
  SUMMARY,
  urlParam,
} from './recordings-fixtures';

let recordingFlag = { enabled: true, available: true };
const server = setupServer(
  http.get('*/capabilities', () =>
    okBody({
      features: { meeting: { enabled: true, available: true }, meetingRecording: recordingFlag },
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  recordingFlag = { enabled: true, available: true };
  signIn(['workspace:view']);
});

const URL0 = '/workspace/ws-1?tab=recordings';
const renderTab = (url = URL0) => renderTabAt(<WorkspaceRecordingsTab workspaceId="ws-1" />, url);
const row = (title: string) => screen.getByText(title).closest('tr')!;

describe('WorkspaceRecordingsTab — hiển thị', () => {
  it('gọi đúng endpoint (workspaceId cố định, page=1, limit=20, sort=-startedAt); đủ cột, KHÔNG có cột Workspace; mỗi trạng thái có nhãn CHỮ', async () => {
    const { calls, summaryCalls } = mockRecordings(server);
    renderTab();

    for (const title of [
      'Họp khởi động',
      'Họp đang ghi',
      'Họp đang dừng',
      'Họp đang xử lý',
      'Họp tuần sản phẩm',
      'Họp bị lỗi',
    ])
      expect(await screen.findByText(title)).toBeInTheDocument();
    expect(calls[0]!.path).toMatch(/\/admin\/recordings$/);
    expect(Object.fromEntries(calls[0]!.q)).toEqual({
      page: '1',
      limit: '20',
      sort: '-startedAt',
      workspaceId: 'ws-1',
    });
    expect(summaryCalls[0]!.get('workspaceId')).toBe('ws-1');

    for (const header of [
      'Bắt đầu ghi',
      'Cuộc họp',
      'Người bắt đầu',
      'Thời lượng',
      'Dung lượng',
      'Trạng thái',
      'Hết hạn',
    ]) {
      expect(screen.getByRole('columnheader', { name: new RegExp(header) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('columnheader', { name: /Workspace/ })).not.toBeInTheDocument();

    expect(within(row('Họp khởi động')).getByText('Đang bắt đầu')).toBeInTheDocument();
    expect(within(row('Họp đang ghi')).getByText('Đang ghi')).toBeInTheDocument();
    expect(within(row('Họp đang dừng')).getByText('Đang dừng')).toBeInTheDocument();
    expect(within(row('Họp đang xử lý')).getByText('Đang xử lý')).toBeInTheDocument();
    expect(within(row('Họp tuần sản phẩm')).getByText('Sẵn sàng')).toBeInTheDocument();
    expect(within(row('Họp bị lỗi')).getByText('Lỗi')).toBeInTheDocument();

    const ready = within(row('Họp tuần sản phẩm'));
    expect(ready.getByText('An Nguyễn')).toBeInTheDocument();
    expect(ready.getByText('1 giờ 05 phút')).toBeInTheDocument();
    expect(ready.getByText('700 MB')).toBeInTheDocument();
    expect(ready.getByText(formatDate('2027-01-03T03:05:00.000Z'))).toBeInTheDocument();
    expect(ready.getByText('còn 80 ngày')).toBeInTheDocument();
    expect(
      ready.getByText(formatDate('2026-10-05T02:00:00.000Z', 'HH:mm DD/MM/YYYY')),
    ).toBeInTheDocument();
  });

  it('không có workspaceId (giám sát toàn nền tảng) → thêm cột Workspace và KHÔNG gửi workspaceId', async () => {
    const { calls, summaryCalls } = mockRecordings(server);
    renderTabAt(<WorkspaceRecordingsTab />, URL0);

    await screen.findByText('Họp tuần sản phẩm');
    expect(screen.getByRole('columnheader', { name: /Workspace/ })).toBeInTheDocument();
    expect(within(row('Họp tuần sản phẩm')).getByText('Nhóm Alpha')).toBeInTheDocument();
    expect(calls[0]!.q.has('workspaceId')).toBe(false);
    expect(summaryCalls[0]!.has('workspaceId')).toBe(false);
  });

  it('bản đã xoá hiện "Đã xoá" kèm lý do; bản chưa có hạn/kích thước hiện —; tiêu đề/tài khoản không còn có chữ thay thế', async () => {
    mockRecordings(server, [
      makeRecording({
        id: 'r-del',
        deletedAt: '2026-10-20T00:00:00.000Z',
        deleteReason: 'Yêu cầu của chủ trì',
        retentionExpiresAt: null,
        retentionDaysLeft: null,
      }),
      makeRecording({
        id: 'r-gone',
        meeting: { id: 'm9', title: null },
        startedBy: { id: 'u9', name: null },
        status: 'PROCESSING',
        fileSizeBytes: null,
        retentionExpiresAt: null,
        retentionDaysLeft: null,
      }),
    ]);
    renderTab();

    const deleted = within(
      await screen.findByText('Yêu cầu của chủ trì').then((el) => el.closest('tr')!),
    );
    expect(deleted.getByText('Đã xoá')).toBeInTheDocument();
    const gone = within(screen.getByText('Cuộc họp không còn').closest('tr')!);
    expect(gone.getByText('Không còn tài khoản')).toBeInTheDocument();
    expect(gone.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('hạn lưu trữ ≤ 7 ngày dùng sắc cảnh báo; đã quá hạn/hôm nay có chữ riêng', async () => {
    mockRecordings(server, [
      makeRecording({ id: 'a', meeting: { id: 'ma', title: 'Sắp hết' }, retentionDaysLeft: 3 }),
      makeRecording({ id: 'b', meeting: { id: 'mb', title: 'Hôm nay' }, retentionDaysLeft: 0 }),
      makeRecording({ id: 'c', meeting: { id: 'mc', title: 'Quá hạn' }, retentionDaysLeft: -2 }),
    ]);
    renderTab();

    await screen.findByText('Sắp hết');
    expect(within(row('Sắp hết')).getByText('còn 3 ngày')).toHaveClass('text-warning');
    expect(within(row('Hôm nay')).getByText('hết hạn hôm nay')).toBeInTheDocument();
    expect(within(row('Quá hạn')).getByText('đã quá hạn 2 ngày')).toBeInTheDocument();
  });
});

describe('WorkspaceRecordingsTab — quyền riêng tư (D-24)', () => {
  it('KHÔNG phát/tải/xem trước: không <video>/<audio>/liên kết, không nút phát/tải, không URL ký/khoá S3/mã họp/tên người đồng ý — dù BE lỡ trả kèm', async () => {
    const hostile = {
      ...makeRecording({ meeting: { id: 'm1', title: 'Họp kín' } }),
      storageKey: 'recordings/66f0/77a1/88b2.mp4',
      playbackUrl: 'https://s3.example.com/bucket/x.mp4?X-Amz-Signature=BI-MAT',
      downloadUrl: 'https://s3.example.com/bucket/x.mp4?X-Amz-Credential=KHOA',
      code: 'abc-defg-hij',
      consent: [{ userId: 'u9', name: 'NGUOI-DONG-Y-BI-AN' }],
      minutes: 'NOI-DUNG-BIEN-BAN-BI-AN',
    } as unknown as ReturnType<typeof makeRecording>;
    mockRecordings(server, [hostile]);
    signIn(['workspace:view', 'meeting:delete']);
    renderTab();

    await screen.findByText('Họp kín');
    const text = document.body.textContent ?? '';
    for (const secret of [
      'BI-MAT',
      'KHOA',
      'X-Amz',
      's3.example.com',
      '66f0',
      '88b2',
      'abc-defg-hij',
      'NGUOI-DONG-Y-BI-AN',
      'NOI-DUNG-BIEN-BAN-BI-AN',
    ])
      expect(text).not.toContain(secret);
    expect(document.body.querySelector('video, audio, source, iframe, embed, object')).toBeNull();
    expect(document.body.querySelector('a[href], [download]')).toBeNull();
    // Nút duy nhất trong hàng là "Xoá" (admin); mọi nút khác của tab là bộ lọc/phân trang/sắp xếp.
    for (const name of [
      /phát/i,
      /tải (xuống|về)/i,
      /xem trước/i,
      /download/i,
      /play/i,
      /mở bản ghi/i,
    ])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.getByText(/không phát, không tải và không xem trước/)).toBeInTheDocument();
  });
});

describe('WorkspaceRecordingsTab — bộ lọc, sắp xếp, phân trang đồng bộ URL', () => {
  it('URL → tham số API: trạng thái theo thứ tự vòng đời, khoảng ngày (đầu/cuối ngày giờ máy), sắp hết hạn 7 ngày, gồm đã xoá, sort, trang', async () => {
    const { calls } = mockRecordings(server);
    renderTab(
      `${URL0}&recStatus=FAILED,READY&recFrom=2026-10-01&recTo=2026-10-31&recExpiring=1&recDeleted=1&recSort=-fileSizeBytes&recPage=2&recPageSize=50`,
    );

    await screen.findByText('Họp tuần sản phẩm');
    expect(Object.fromEntries(calls[0]!.q)).toEqual({
      page: '2',
      limit: '50',
      sort: '-fileSizeBytes',
      workspaceId: 'ws-1',
      status: 'READY,FAILED',
      from: new Date(2026, 9, 1, 0, 0, 0, 0).toISOString(),
      to: new Date(2026, 9, 31, 23, 59, 59, 999).toISOString(),
      expiringWithinDays: '7',
      includeDeleted: 'true',
    });
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
  });

  it('URL do người dùng sửa bậy không làm hỏng: trạng thái lạ bị bỏ, pageSize > 100 kẹp về 100, sort lạ về mặc định, ngày hỏng bị bỏ', async () => {
    const { calls } = mockRecordings(server);
    renderTab(
      `${URL0}&recStatus=BOGUS,READY&recPageSize=9999&recSort=drop-table&recFrom=khong-phai-ngay`,
    );

    await screen.findByText('Họp tuần sản phẩm');
    expect(Object.fromEntries(calls[0]!.q)).toEqual({
      page: '1',
      limit: '100',
      sort: '-startedAt',
      workspaceId: 'ws-1',
      status: 'READY',
    });
  });

  it('không lọc → không có nút "Xoá bộ lọc"; "Xoá bộ lọc" bỏ mọi khoá lọc nhưng GIỮ sắp xếp', async () => {
    const { calls } = mockRecordings(server);
    const { router } = renderTab(
      `${URL0}&recStatus=FAILED&recExpiring=1&recSort=durationSec&recPage=3`,
    );
    await screen.findByText('Họp tuần sản phẩm');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    await waitFor(() => expect(urlParam(router, 'recStatus')).toBeNull());
    expect([urlParam(router, 'recExpiring'), urlParam(router, 'recPage')]).toEqual([null, null]);
    expect(urlParam(router, 'recSort')).toBe('durationSec');
    expect(urlParam(router, 'tab')).toBe('recordings');
    await waitFor(() => expect(calls.at(-1)!.q.get('status')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();
  });

  it('bấm tiêu đề cột: asc → desc → về mặc định; cột mặc định (Bắt đầu ghi) lật asc ↔ desc chứ không đứng yên', async () => {
    const { calls } = mockRecordings(server);
    const { router } = renderTab();
    await screen.findByText('Họp tuần sản phẩm');
    const user = userEvent.setup();
    const lastSort = () => calls.at(-1)!.q.get('sort');

    await user.click(screen.getByRole('button', { name: 'Sắp xếp theo Dung lượng' }));
    await waitFor(() => expect(lastSort()).toBe('fileSizeBytes'));
    expect(urlParam(router, 'recSort')).toBe('fileSizeBytes');
    await user.click(screen.getByRole('button', { name: 'Sắp xếp theo Dung lượng' }));
    await waitFor(() => expect(lastSort()).toBe('-fileSizeBytes'));
    expect(urlParam(router, 'recSort')).toBe('-fileSizeBytes');
    await user.click(screen.getByRole('button', { name: 'Sắp xếp theo Dung lượng' }));
    await waitFor(() => expect(lastSort()).toBe('-startedAt'));
    expect(urlParam(router, 'recSort')).toBeNull();

    // Cột mặc định đang desc: bấm → asc (không phải "bỏ sắp xếp" trùng chính nó), bấm nữa → về desc (URL sạch).
    await user.click(screen.getByRole('button', { name: 'Sắp xếp theo Bắt đầu ghi' }));
    await waitFor(() => expect(lastSort()).toBe('startedAt'));
    expect(urlParam(router, 'recSort')).toBe('startedAt');
    await user.click(screen.getByRole('button', { name: 'Sắp xếp theo Bắt đầu ghi' }));
    await waitFor(() => expect(lastSort()).toBe('-startedAt'));
    expect(urlParam(router, 'recSort')).toBeNull();
    // Chỉ bốn cột có thể sắp xếp.
    expect(screen.getAllByRole('button', { name: /^Sắp xếp theo / })).toHaveLength(4);
  });

  it('khoá URL riêng: đổi bộ lọc/trang KHÔNG đụng ?tab, ?page của tab khác', async () => {
    mockRecordings(server);
    const { router } = renderTab(`${URL0}&page=7&meetingStatus=LIVE`);
    await screen.findByText('Họp tuần sản phẩm');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sắp xếp theo Thời lượng' }));

    await waitFor(() => expect(urlParam(router, 'recSort')).toBe('durationSec'));
    expect([
      urlParam(router, 'tab'),
      urlParam(router, 'page'),
      urlParam(router, 'meetingStatus'),
    ]).toEqual(['recordings', '7', 'LIVE']);
  });
});

describe('WorkspaceRecordingsTab — thẻ tóm tắt', () => {
  it('dung lượng (so với 30 ngày trước), số bản sẵn sàng, sắp hết hạn 7 ngày, lỗi 24 giờ', async () => {
    mockRecordings(server);
    renderTab();

    expect(await screen.findByText('5 GB')).toBeInTheDocument();
    expect(screen.getByText('Tăng 1 GB so với 30 ngày trước')).toBeInTheDocument();
    // Số đếm do `AnimatedNumber` vẽ hai lần (chữ chạy `aria-hidden` + bản `sr-only` chốt giá trị) — đọc bản chốt.
    const value = (label: string) =>
      screen.getByText(label).nextElementSibling?.querySelector('.sr-only') ??
      screen.getByText(label).nextElementSibling;
    expect(value('Bản ghi sẵn sàng')).toHaveTextContent(/^12$/);
    expect(value('Sắp hết hạn 7 ngày')).toHaveTextContent(/^2$/);
    expect(value('Lỗi 24 giờ')).toHaveTextContent(/^1$/);
    expect(value('Tổng dung lượng')).toHaveTextContent(/^5 GB$/);
  });

  it('nút dưới thẻ lọc bảng: "Xem các bản lỗi" → recStatus=FAILED, "Xem … sắp hết hạn" → recExpiring=1 (gọi lại API kèm tham số)', async () => {
    const { calls } = mockRecordings(server);
    const { router } = renderTab();
    const user = userEvent.setup();
    await screen.findByText('5 GB');

    await user.click(screen.getByRole('button', { name: /Xem các bản lỗi \(1 trong 24 giờ\)/ }));
    await waitFor(() => expect(calls.at(-1)!.q.get('status')).toBe('FAILED'));
    expect(urlParam(router, 'recStatus')).toBe('FAILED');

    await user.click(screen.getByRole('button', { name: 'Xem 2 bản sắp hết hạn' }));
    await waitFor(() => expect(calls.at(-1)!.q.get('expiringWithinDays')).toBe('7'));
    expect(urlParam(router, 'recExpiring')).toBe('1');
  });

  it('không có bản sắp hết hạn/lỗi → không có nút lọc nhanh; thẻ đổi sang màu trung tính', async () => {
    mockRecordings(server, RECORDING_ROWS, { ...SUMMARY, expiringIn7d: 0, failed24h: 0 });
    renderTab();

    await screen.findByText('5 GB');
    expect(screen.queryByRole('button', { name: /Xem các bản lỗi/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sắp hết hạn$/ })).not.toBeInTheDocument();
  });

  it('thẻ tóm tắt lỗi → hiện — (KHÔNG phải 0) trong khi bảng vẫn tải được', async () => {
    mockRecordings(server);
    server.use(
      http.get('*/admin/recordings/summary', () => errorBody(500, 'SYS_500', 'Lỗi máy chủ')),
    );
    renderTab();

    await screen.findByText('Họp tuần sản phẩm');
    for (const label of [
      'Tổng dung lượng',
      'Bản ghi sẵn sàng',
      'Sắp hết hạn 7 ngày',
      'Lỗi 24 giờ',
    ]) {
      await waitFor(() =>
        expect(screen.getByText(label).nextElementSibling).toHaveTextContent(/^—$/),
      );
    }
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('WorkspaceRecordingsTab — trạng thái rỗng, lỗi, cờ tắt', () => {
  it('danh sách rỗng: "Chưa có bản ghi hình nào"; có lọc mà rỗng: "Không có bản ghi nào khớp bộ lọc"', async () => {
    mockRecordings(server, []);
    renderTab();
    expect(await screen.findByText('Chưa có bản ghi hình nào')).toBeInTheDocument();
    cleanup();

    renderTab(`${URL0}&recStatus=FAILED`);
    expect(await screen.findByText('Không có bản ghi nào khớp bộ lọc')).toBeInTheDocument();
  });

  it('lỗi tạm thời (5xx) → Callout + "Thử lại" (tải lại cả danh sách lẫn thẻ), KHÔNG vẽ bảng "chưa có bản ghi"', async () => {
    const { calls, summaryCalls } = mockRecordings(server);
    let failing = true;
    server.use(
      http.get('*/admin/recordings', ({ request }) => {
        if (failing) return errorBody(500, 'SYS_500', 'Lỗi máy chủ');
        const u = new URL(request.url);
        calls.push({ path: u.pathname, q: u.searchParams });
        return okBody(RECORDING_ROWS, pageMeta(RECORDING_ROWS.length));
      }),
    );
    renderTab();

    expect(await screen.findByText('Không tải được danh sách bản ghi hình')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có bản ghi hình nào')).not.toBeInTheDocument();
    failing = false;
    const before = summaryCalls.length;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Họp tuần sản phẩm')).toBeInTheDocument();
    await waitFor(() => expect(summaryCalls.length).toBeGreaterThan(before));
  });

  it('403 → khung "không có quyền", KHÔNG có nút Thử lại', async () => {
    mockRecordings(server);
    server.use(http.get('*/admin/recordings', () => errorBody(403, 'AUTH_005', 'Không có quyền')));
    renderTab();

    expect(await screen.findByText('Không tải được danh sách bản ghi hình')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('cờ meeting tắt giữa chừng (404 CFG_005) → "Ghi hình họp đang tắt", không phải lỗi', async () => {
    mockRecordings(server);
    server.use(
      http.get('*/admin/recordings', () => errorBody(404, 'CFG_005', 'Tính năng đang tắt')),
    );
    renderTab();

    expect(await screen.findByText('Ghi hình họp đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách bản ghi hình')).not.toBeInTheDocument();
  });

  it('ghi hình đang tắt/chưa khả dụng → cảnh báo, nhưng bản ghi cũ vẫn hiện; khả dụng → không có cảnh báo', async () => {
    mockRecordings(server);
    recordingFlag = { enabled: true, available: false };
    renderTab();
    expect(await screen.findByText(/Ghi hình đang tắt hoặc chưa khả dụng/)).toBeInTheDocument();
    expect(await screen.findByText('Họp tuần sản phẩm')).toBeInTheDocument();
    cleanup();

    recordingFlag = { enabled: true, available: true };
    renderTab();
    await screen.findByText('Họp tuần sản phẩm');
    expect(screen.queryByText(/Ghi hình đang tắt hoặc chưa khả dụng/)).not.toBeInTheDocument();
  });
});
