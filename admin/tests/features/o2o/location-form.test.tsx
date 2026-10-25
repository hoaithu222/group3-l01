/**
 * Form địa điểm (p6-05 admin.md §2.1/§4 — nhóm "Form"): bắt buộc tên/địa chỉ/toạ độ (ô nhập tạm thay `MapPointField`), tạo → `POST` với
 * số (không chuỗi), sửa → `PATCH` CHỈ trường đã đổi + `expectedVersion`, 409 `RES_003` giữ nguyên form và báo "Dữ liệu đã thay đổi".
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import LocationsTab from '@/features/o2o/components/locations/LocationsTab';

import {
  LOCATION_ID,
  makeLocation,
  makeLocationDetail,
  okBody,
  pageMeta,
  renderAt,
  signIn,
} from './o2o-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['o2o:view', 'o2o:create', 'o2o:update']);
  server.use(http.get('*/admin/locations', () => okBody([makeLocation()], pageMeta(1))));
});

describe('LocationFormModal — tạo mới', () => {
  it('thiếu tên/địa chỉ báo lỗi và KHÔNG gọi BE; ô toạ độ có giá trị hợp lệ sẵn', async () => {
    let posts = 0;
    server.use(
      http.post('*/admin/locations', () => {
        posts += 1;
        return okBody(makeLocation());
      }),
    );
    renderAt(<LocationsTab />, '/o2o?tab=locations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thêm địa điểm' }));
    await user.click(await screen.findByRole('button', { name: 'Tạo địa điểm' }));
    expect(await screen.findByText('Tên địa điểm là bắt buộc')).toBeInTheDocument();
    expect(screen.getByText('Địa chỉ là bắt buộc')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('xoá vĩ độ → "Nhập vĩ độ"; hiện chú thích chưa có bản đồ chọn điểm', async () => {
    renderAt(<LocationsTab />, '/o2o?tab=locations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thêm địa điểm' }));
    expect(await screen.findByText(/Chưa có bản đồ chọn điểm/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Tên địa điểm/), 'Quán Học Bài');
    await user.type(screen.getByLabelText(/Địa chỉ/), '5 Lê Thanh Nghị');
    await user.clear(screen.getByLabelText(/Vĩ độ/));
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }));
    expect(await screen.findByText('Nhập vĩ độ')).toBeInTheDocument();
  });

  it('hợp lệ → POST /admin/locations với lat/lng LÀ SỐ, giờ mở là mảng đã đổi thứ về số', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('*/admin/locations', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, data: makeLocation() }, { status: 201 });
      }),
    );
    renderAt(<LocationsTab />, '/o2o?tab=locations');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thêm địa điểm' }));
    await user.type(screen.getByLabelText(/Tên địa điểm/), 'Quán Học Bài');
    await user.type(screen.getByLabelText(/Địa chỉ/), '5 Lê Thanh Nghị');
    await user.click(screen.getByRole('button', { name: 'Thêm khung giờ' }));
    await user.click(screen.getByRole('button', { name: 'Tạo địa điểm' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      name: 'Quán Học Bài',
      address: '5 Lê Thanh Nghị',
      type: 'CAFE',
      amenities: [],
      openHours: [{ day: 1, open: '07:00', close: '22:00' }],
    });
    expect(typeof (body as unknown as { lat: unknown }).lat).toBe('number');
    expect(typeof (body as unknown as { lng: unknown }).lng).toBe('number');
    expect(body).not.toHaveProperty('photoAssetIds');
  });
});

describe('LocationFormModal — sửa', () => {
  const open = async () => {
    server.use(http.get(`*/admin/locations/${LOCATION_ID}`, () => okBody(makeLocationDetail())));
    renderAt(<LocationsTab />, `/o2o?tab=locations&locationId=${LOCATION_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sửa' }));
    return user;
  };

  it('PATCH chỉ gửi trường đã đổi + expectedVersion (không lat/lng khi không đụng)', async () => {
    let body: unknown = null;
    server.use(
      http.patch(`*/admin/locations/${LOCATION_ID}`, async ({ request }) => {
        body = await request.json();
        return okBody(makeLocation({ name: 'Tên mới' }));
      }),
    );
    const user = await open();
    const name = await screen.findByLabelText(/Tên địa điểm/);
    expect(name).toHaveValue('Cà phê Sách');
    await user.clear(name);
    await user.type(name, 'Tên mới');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(body).toEqual({ expectedVersion: 3, name: 'Tên mới' }));
  });

  it('409 RES_003 → banner "Dữ liệu đã thay đổi", form giữ nguyên nội dung đã nhập', async () => {
    server.use(
      http.patch(`*/admin/locations/${LOCATION_ID}`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'RES_003',
              message: 'Xung đột phiên bản',
              details: { currentVersion: 4 },
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = await open();
    const name = await screen.findByLabelText(/Tên địa điểm/);
    await user.clear(name);
    await user.type(name, 'Đang gõ dở');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên địa điểm/)).toHaveValue('Đang gõ dở');
  });
});
