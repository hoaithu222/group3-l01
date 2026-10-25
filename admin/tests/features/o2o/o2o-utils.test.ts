/**
 * Hàm thuần của phân hệ `o2o` (p6-05 admin.md §4 — nhóm "Form"): schema địa điểm/tiệm khớp giới hạn BE, chuyển form ↔ payload, và các
 * hàm hiển thị (cấu hình in, giờ mở cửa, tác động tạm ngưng).
 */
import { describe, expect, it } from 'vitest';

import { locationFormSchema } from '@/features/o2o/schemas/location.schema';
import { shopCreateFormSchema, shopPriceFormSchema } from '@/features/o2o/schemas/shop.schema';
import { formatOpenHours, shopChip } from '@/features/o2o/utils/location.utils';
import {
  initLocationValues,
  toLocationBody,
  toUpdateLocationPayload,
} from '@/features/o2o/utils/location-form.utils';
import { formatPagesTimesCopies, formatPrintSettings } from '@/features/o2o/utils/print.utils';
import { initShopCreateValues, toCreateShopPayload } from '@/features/o2o/utils/shop-form.utils';
import { suspendImpact } from '@/features/o2o/utils/shop.utils';

import { makeLocation, makeOrder } from './o2o-fixtures';

const validLocation = () => initLocationValues(makeLocation());

describe('locationFormSchema', () => {
  it('bản hợp lệ qua được', () => {
    expect(locationFormSchema.safeParse(validLocation()).success).toBe(true);
  });

  it('toạ độ ngoài khoảng và thiếu toạ độ báo lỗi từng ô', () => {
    const bad = locationFormSchema.safeParse({ ...validLocation(), lat: 91, lng: -181 });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['lat', 'lng']));

    const missing = locationFormSchema.safeParse({ ...validLocation(), lat: null });
    expect(missing.success ? [] : missing.error.issues.map((i) => i.message)).toContain(
      'Nhập vĩ độ',
    );
  });

  it('giờ đóng phải SAU giờ mở; "24:00" hợp lệ; định dạng sai báo lỗi', () => {
    const wrongOrder = locationFormSchema.safeParse({
      ...validLocation(),
      openHours: [{ day: '1', open: '18:00', close: '09:00' }],
    });
    expect(wrongOrder.success ? [] : wrongOrder.error.issues.map((i) => i.message)).toContain(
      'Giờ đóng phải sau giờ mở',
    );

    expect(
      locationFormSchema.safeParse({
        ...validLocation(),
        openHours: [{ day: '0', open: '08:00', close: '24:00' }],
      }).success,
    ).toBe(true);

    expect(
      locationFormSchema.safeParse({
        ...validLocation(),
        openHours: [{ day: '1', open: '7h', close: '22:00' }],
      }).success,
    ).toBe(false);
  });

  it('tối đa 14 khung giờ, tên ≥ 2 ký tự sau khi cắt khoảng trắng', () => {
    const many = Array.from({ length: 15 }, () => ({ day: '1', open: '07:00', close: '08:00' }));
    expect(locationFormSchema.safeParse({ ...validLocation(), openHours: many }).success).toBe(
      false,
    );
    expect(locationFormSchema.safeParse({ ...validLocation(), name: '  a ' }).success).toBe(false);
  });
});

describe('shop schemas', () => {
  it('tạo tiệm: giá số nguyên ≥ 0, % giảm 0–100, email hợp lệ', () => {
    const base = initShopCreateValues('650000000000000000000a02');
    expect(
      shopCreateFormSchema.safeParse({ ...base, ownerEmail: 'chu@tiem.vn', displayName: 'Tiệm A' })
        .success,
    ).toBe(true);
    expect(
      shopCreateFormSchema.safeParse({
        ...base,
        ownerEmail: 'chu@tiem.vn',
        displayName: 'Tiệm A',
        priceTable: { ...base.priceTable, a4Bw: 500.5 },
      }).success,
    ).toBe(false);
    expect(
      shopCreateFormSchema.safeParse({
        ...base,
        ownerEmail: 'chu@tiem.vn',
        displayName: 'Tiệm A',
        priceTable: { ...base.priceTable, duplexDiscountPct: 101 },
      }).success,
    ).toBe(false);
    expect(
      shopCreateFormSchema.safeParse({
        ...base,
        ownerEmail: 'khong-phai-email',
        displayName: 'Tiệm A',
      }).success,
    ).toBe(false);
  });

  it('sửa bảng giá bắt buộc có lý do (≥ 3 ký tự)', () => {
    const base = initShopCreateValues();
    const values = { priceTable: base.priceTable, capabilities: base.capabilities };
    expect(shopPriceFormSchema.safeParse({ ...values, reason: '' }).success).toBe(false);
    expect(shopPriceFormSchema.safeParse({ ...values, reason: 'ab' }).success).toBe(false);
    expect(shopPriceFormSchema.safeParse({ ...values, reason: 'Tăng giá giấy' }).success).toBe(
      true,
    );
  });

  it('SĐT rỗng gửi null; có SĐT gửi nguyên chuỗi', () => {
    const base = {
      ...initShopCreateValues('650000000000000000000a02'),
      ownerEmail: 'c@t.vn',
      displayName: 'Tiệm',
    };
    expect(toCreateShopPayload({ ...base, phone: '' }).phone).toBeNull();
    expect(toCreateShopPayload({ ...base, phone: '0912345678' }).phone).toBe('0912345678');
  });
});

describe('form ↔ payload địa điểm', () => {
  it('toLocationBody đổi thứ (chuỗi) về số', () => {
    const body = toLocationBody({
      ...validLocation(),
      openHours: [{ day: '6', open: '08:00', close: '12:00' }],
    });
    expect(body.openHours).toEqual([{ day: 6, open: '08:00', close: '12:00' }]);
    expect(typeof body.lat).toBe('number');
  });

  it('PATCH chỉ gửi trường ĐÃ ĐỔI kèm expectedVersion; lat/lng đi cùng nhau', () => {
    const loc = makeLocation({ version: 7 });
    const same = toUpdateLocationPayload(loc, initLocationValues(loc));
    expect(same).toEqual({ id: loc.id, expectedVersion: 7 });

    const renamed = toUpdateLocationPayload(loc, { ...initLocationValues(loc), name: 'Tên mới' });
    expect(renamed).toEqual({ id: loc.id, expectedVersion: 7, name: 'Tên mới' });

    const moved = toUpdateLocationPayload(loc, { ...initLocationValues(loc), lng: 105.9 });
    expect(moved.lat).toBe(loc.lat);
    expect(moved.lng).toBe(105.9);
  });

  it('tiện ích lạ của dữ liệu cũ bị bỏ khỏi form (BE chỉ nhận mã đã biết)', () => {
    const loc = makeLocation({ amenities: ['wifi_fast', 'sauna'] });
    expect(initLocationValues(loc).amenities).toEqual(['wifi_fast']);
  });
});

describe('hàm hiển thị', () => {
  it('formatPrintSettings mô tả khổ · màu · mặt · bản · khoảng trang · đóng gáy', () => {
    expect(
      formatPrintSettings({
        paper: 'A3',
        color: true,
        copies: 3,
        duplex: true,
        pageRange: '1-3,5',
        binding: true,
      }),
    ).toBe('A3 · In màu · 2 mặt · 3 bản · trang 1-3,5 · đóng gáy');
    expect(
      formatPrintSettings({
        paper: 'A4',
        color: false,
        copies: 1,
        duplex: false,
        pageRange: null,
        binding: false,
      }),
    ).toBe('A4 · Đen trắng · 1 mặt · 1 bản');
  });

  it('formatPagesTimesCopies: trang in thực × bản; đang đếm / tệp lỗi khi chưa có số trang', () => {
    expect(formatPagesTimesCopies(makeOrder())).toBe('12 trang × 2 bản');
    expect(formatPagesTimesCopies(makeOrder({ pages: null, quote: null }))).toBe('Đang đếm trang');
    expect(
      formatPagesTimesCopies(makeOrder({ pages: null, quote: null, pageCountError: 'O2O_003' })),
    ).toBe('Tệp lỗi');
  });

  it('formatOpenHours xếp Thứ hai → Chủ nhật, gộp nhiều khung một dòng', () => {
    const lines = formatOpenHours([
      { day: 0, open: '09:00', close: '12:00' },
      { day: 1, open: '13:00', close: '17:00' },
      { day: 1, open: '07:00', close: '11:00' },
    ]);
    expect(lines).toEqual(['Thứ hai: 07:00–11:00, 13:00–17:00', 'Chủ nhật: 09:00–12:00']);
    expect(formatOpenHours([])).toEqual([]);
  });

  it('shopChip: không có / chờ duyệt / có / tạm ngưng', () => {
    expect(shopChip(null)).toBe('Không');
    expect(shopChip({ id: 's', displayName: 'A', status: 'PENDING' })).toBe('Chờ duyệt');
    expect(shopChip({ id: 's', displayName: 'A', status: 'APPROVED' })).toBe('Có');
    expect(shopChip({ id: 's', displayName: 'A', status: 'SUSPENDED' })).toBe('Tạm ngưng');
  });

  it('suspendImpact NÊU số đơn chờ nhận bị ảnh hưởng', () => {
    expect(suspendImpact(3)).toContain('3 đơn đang chờ tiệm nhận');
    expect(suspendImpact(0)).toContain('không có đơn nào đang chờ tiệm nhận');
  });
});
