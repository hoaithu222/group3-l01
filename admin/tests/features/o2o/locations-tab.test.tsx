/**
 * Tab "Địa điểm" (p6-05 admin.md §2.1/§4): bộ lọc + trang + ngăn kéo sống trên URL và đi thẳng vào request; ngăn kéo chỉ có nút Sửa/Ẩn
 * khi có `o2o:update`; ẩn địa điểm qua lý do → `POST …/hide`; ẩn/hiện đánh giá; lỗi tải có "Thử lại". Mock tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import LocationsTab from '@/features/o2o/components/locations/LocationsTab';

import {
  cursorMeta,
  LOCATION_ID,
  makeLocation,
  makeLocationDetail,
  makeReview,
  okBody,
  pageMeta,
  REVIEW_ID,
  renderAt,
  signIn,
  urlParam,
} from './o2o-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['o2o:view']);
});

function mockList(rows = [makeLocation()]) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/locations', ({ request }) => {
      calls.push(new URL(request.url).searchParams);
      return okBody(rows, pageMeta(rows.length));
    }),
  );
  return calls;
}

function mockDetail(detail = makeLocationDetail()) {
  server.use(http.get(`*/admin/locations/${LOCATION_ID}`, () => okBody(detail)));
}

describe('LocationsTab — danh sách và bộ lọc trên URL', () => {
  it('cột: tên là liên kết, loại, tiện ích ≤ 3 chip + "+N", sao/độ ồn, tiệm in, trạng thái bằng chữ', async () => {
    mockList([
      makeLocation(),
      makeLocation({
        id: '650000000000000000000a09',
        name: 'Thư viện Tạ Quang Bửu',
        type: 'LIBRARY',
        status: 'HIDDEN',
        amenities: [],
        ratingCount: 0,
        shop: { id: 's', displayName: 'In A', status: 'PENDING' },
      }),
    ]);
    renderAt(<LocationsTab />, '/o2o?tab=locations');
    expect(await screen.findByRole('link', { name: 'Cà phê Sách' })).toBeInTheDocument();
    expect(screen.getByText('Quán cà phê')).toBeInTheDocument();
    expect(screen.getByText('Wi-Fi nhanh')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('4,5 ★ (12)')).toBeInTheDocument();
    expect(screen.getByText('Chưa có đánh giá')).toBeInTheDocument();
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    expect(screen.getByText('Đã ẩn')).toBeInTheDocument();
    expect(screen.getByText('Đang hiển thị')).toBeInTheDocument();
  });

  it('q/type/status/amenity/trang trên URL đi vào request; "Xoá bộ lọc" bỏ hết, giữ tab', async () => {
    const calls = mockList();
    const { router } = renderAt(
      <LocationsTab />,
      '/o2o?tab=locations&q=cafe&type=CAFE&status=ACTIVE&amenity=wifi_fast&page=2',
    );
    await screen.findByRole('link', { name: 'Cà phê Sách' });
    const q = calls[0]!;
    expect(q.get('q')).toBe('cafe');
    expect(q.get('type')).toBe('CAFE');
    expect(q.get('status')).toBe('ACTIVE');
    expect(q.get('amenity')).toBe('wifi_fast');
    expect(q.get('page')).toBe('2');
    expect(q.get('limit')).toBe('20');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitFor(() => expect(urlParam(router, 'type')).toBeNull());
    expect(urlParam(router, 'q')).toBeNull();
    expect(urlParam(router, 'amenity')).toBeNull();
    expect(urlParam(router, 'tab')).toBe('locations');
    await waitFor(() => expect(calls.at(-1)!.get('type')).toBeNull());
  });

  it('giá trị URL lạ bị bỏ, không gửi BE', async () => {
    const calls = mockList();
    renderAt(<LocationsTab />, '/o2o?tab=locations&type=EVIL&status=x&amenity=sauna');
    await screen.findByRole('link', { name: 'Cà phê Sách' });
    expect(calls[0]!.get('type')).toBeNull();
    expect(calls[0]!.get('status')).toBeNull();
    expect(calls[0]!.get('amenity')).toBeNull();
  });

  it('lỗi tải hiện Callout + "Thử lại", KHÔNG vẽ bảng rỗng như thể chưa có địa điểm', async () => {
    let fail = true;
    server.use(
      http.get('*/admin/locations', () =>
        fail ? new Response(null, { status: 500 }) : okBody([makeLocation()], pageMeta(1)),
      ),
    );
    renderAt(<LocationsTab />, '/o2o?tab=locations');
    expect(await screen.findByText('Không tải được danh sách địa điểm')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có địa điểm nào')).not.toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('link', { name: 'Cà phê Sách' })).toBeInTheDocument();
  });

  it('nút "Thêm địa điểm" chỉ có khi có o2o:create', async () => {
    mockList();
    const first = renderAt(<LocationsTab />, '/o2o?tab=locations');
    await screen.findByRole('link', { name: 'Cà phê Sách' });
    expect(screen.queryByRole('button', { name: 'Thêm địa điểm' })).not.toBeInTheDocument();
    first.unmount();

    signIn(['o2o:view', 'o2o:create']);
    renderAt(<LocationsTab />, '/o2o?tab=locations');
    expect(await screen.findByRole('button', { name: 'Thêm địa điểm' })).toBeInTheDocument();
  });
});

describe('LocationDrawer', () => {
  it('bấm tên mở ngăn kéo (URL ?locationId=): giờ mở cửa, tiện ích, liên kết bản đồ; thiếu o2o:update → không có Sửa/Ẩn', async () => {
    mockList();
    mockDetail();
    const { router } = renderAt(<LocationsTab />, '/o2o?tab=locations');
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Cà phê Sách' }));
    expect(await screen.findByText('Thứ hai: 07:00–22:00')).toBeInTheDocument();
    expect(urlParam(router, 'locationId')).toBe(LOCATION_ID);
    const map = screen.getByRole('link', { name: 'Xem trên bản đồ' });
    expect(map).toHaveAttribute('href', expect.stringContaining('openstreetmap.org'));
    expect(map).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ẩn địa điểm' })).not.toBeInTheDocument();
  });

  it('404 hiện "Không tìm thấy địa điểm" (không toast)', async () => {
    mockList();
    server.use(
      http.get(
        `*/admin/locations/${LOCATION_ID}`,
        () =>
          new Response(
            JSON.stringify({ success: false, error: { code: 'RES_001', message: 'x' } }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    renderAt(<LocationsTab />, `/o2o?tab=locations&locationId=${LOCATION_ID}`);
    expect(await screen.findByText('Không tìm thấy địa điểm')).toBeInTheDocument();
  });

  it('có o2o:update: Ẩn địa điểm → lý do → POST /hide { reason }', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail();
    let posted: unknown = null;
    server.use(
      http.post(`*/admin/locations/${LOCATION_ID}/hide`, async ({ request }) => {
        posted = await request.json();
        return okBody(makeLocation({ status: 'HIDDEN' }));
      }),
    );
    renderAt(<LocationsTab />, `/o2o?tab=locations&locationId=${LOCATION_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ẩn địa điểm' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Quán đã đóng cửa vĩnh viễn');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(posted).toEqual({ reason: 'Quán đã đóng cửa vĩnh viễn' }));
  });

  it('địa điểm đang ẩn: nút đổi thành "Hiện lại" và hiện lý do ẩn', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail(makeLocationDetail({ status: 'HIDDEN', hiddenReason: 'Báo cáo sai địa chỉ' }));
    renderAt(<LocationsTab />, `/o2o?tab=locations&locationId=${LOCATION_ID}`);
    expect(await screen.findByRole('button', { name: 'Hiện lại' })).toBeInTheDocument();
    expect(screen.getByText('Báo cáo sai địa chỉ')).toBeInTheDocument();
  });
});

describe('LocationReviewsPanel', () => {
  it('liệt kê đánh giá kể cả đã ẩn; Ẩn → lý do → POST /admin/location-reviews/:id/hide', async () => {
    signIn(['o2o:view', 'o2o:update']);
    mockList();
    mockDetail();
    server.use(
      http.get(`*/admin/locations/${LOCATION_ID}/reviews`, () =>
        okBody(
          [
            makeReview(),
            makeReview({
              id: '650000000000000000000d02',
              comment: 'Đã bị ẩn trước đó',
              hiddenAt: '2026-09-11T00:00:00.000Z',
            }),
          ],
          cursorMeta(),
        ),
      ),
    );
    let posted: unknown = null;
    server.use(
      http.post(`*/admin/location-reviews/${REVIEW_ID}/hide`, async ({ request }) => {
        posted = await request.json();
        return okBody({ id: REVIEW_ID, hiddenAt: '2026-09-12T00:00:00.000Z' });
      }),
    );
    renderAt(<LocationsTab />, `/o2o?tab=locations&locationId=${LOCATION_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Đánh giá' }));
    expect(await screen.findByText('Ồn ào, ổ cắm hỏng')).toBeInTheDocument();
    expect(screen.getByText('Đã bị ẩn trước đó')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hiện lại' })).toBeInTheDocument();

    const row = screen.getByText('Ồn ào, ổ cắm hỏng').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Ẩn' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Bình luận chứa ngôn từ xúc phạm');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(posted).toEqual({ reason: 'Bình luận chứa ngôn từ xúc phạm' }));
  });

  it('thiếu o2o:update: chỉ xem, không có nút Ẩn/Hiện lại', async () => {
    mockList();
    mockDetail();
    server.use(
      http.get(`*/admin/locations/${LOCATION_ID}/reviews`, () =>
        okBody([makeReview()], cursorMeta()),
      ),
    );
    renderAt(<LocationsTab />, `/o2o?tab=locations&locationId=${LOCATION_ID}`);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Đánh giá' }));
    expect(await screen.findByText('Ồn ào, ổ cắm hỏng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ẩn' })).not.toBeInTheDocument();
  });
});
