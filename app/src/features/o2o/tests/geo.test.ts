import {
  directionsUrl,
  distanceMeters,
  formatDistance,
  formatRadius,
  movedEnough,
  nextRadius,
  roundCoord,
  roundLatLng,
} from '../utils/geo';
import { o2oKeys } from '../queries/o2o.keys';

describe('geo — làm tròn toạ độ cho khoá cache (app.md §8 "làm tròn toạ độ cho query key")', () => {
  it('làm tròn 3 chữ số thập phân (~110 m)', () => {
    expect(roundCoord(21.02851234)).toBe(21.029);
    expect(roundLatLng({ lat: 21.0285, lng: 105.8542 })).toEqual({ lat: 21.029, lng: 105.854 });
  });

  it('hai tâm cách nhau vài mét cùng MỘT khoá; cách nhau cỡ 300 m thì khác', () => {
    const filters = { radiusM: 2000 };
    const near = o2oKeys.near({ lat: 21.02851, lng: 105.85421 }, filters);
    const sameCell = o2oKeys.near({ lat: 21.02855, lng: 105.85418 }, filters);
    const farther = o2oKeys.near({ lat: 21.03151, lng: 105.85421 }, filters);
    expect(sameCell).toEqual(near);
    expect(farther).not.toEqual(near);
  });

  it('khoá gồm MỌI tham số ảnh hưởng kết quả; thứ tự tiện ích không đổi khoá', () => {
    const center = { lat: 21.0285, lng: 105.8542 };
    const a = o2oKeys.near(center, { radiusM: 2000, amenities: ['wifi_fast', 'ac'] });
    const b = o2oKeys.near(center, { radiusM: 2000, amenities: ['ac', 'wifi_fast'] });
    expect(a).toEqual(b);
    expect(o2oKeys.near(center, { radiusM: 5000 })).not.toEqual(
      o2oKeys.near(center, { radiusM: 2000 }),
    );
    expect(o2oKeys.near(center, { radiusM: 2000, type: 'CAFE' })).not.toEqual(
      o2oKeys.near(center, { radiusM: 2000 }),
    );
  });
});

describe('geo — khi nào tải lại theo tâm bản đồ (lệch > 30 % bán kính)', () => {
  const home = { lat: 21.0285, lng: 105.8542 };

  it('haversine: 0,01° vĩ độ ≈ 1,11 km', () => {
    expect(distanceMeters(home, { lat: 21.0385, lng: 105.8542 })).toBeGreaterThan(1100);
    expect(distanceMeters(home, { lat: 21.0385, lng: 105.8542 })).toBeLessThan(1120);
    expect(distanceMeters(home, home)).toBe(0);
  });

  it('bán kính 2 km: nhích ~300 m KHÔNG tải lại, nhích ~700 m tải lại', () => {
    expect(movedEnough(home, { lat: 21.0312, lng: 105.8542 }, 2000)).toBe(false); // ≈ 300 m < 600 m
    expect(movedEnough(home, { lat: 21.0348, lng: 105.8542 }, 2000)).toBe(true); // ≈ 700 m > 600 m
  });
});

describe('geo — định dạng hiển thị', () => {
  it('khoảng cách: dưới 1 km làm tròn 10 m, từ 1 km dấu PHẨY thập phân', () => {
    // Dùng regex thay chuỗi: `check:classes` đọc chuỗi "350 m" như class Tailwind `m` (báo nhầm).
    expect(formatDistance(347)).toMatch(/^350 m$/);
    expect(formatDistance(3)).toMatch(/^10 m$/);
    expect(formatDistance(1234)).toBe('1,2 km');
    expect(formatDistance(-5)).toBe('');
    expect(formatRadius(2000)).toBe('2 km');
  });

  it('bậc bán kính kế tiếp dừng ở mức tối đa của BE', () => {
    const steps = [2000, 5000, 10_000];
    expect(nextRadius(2000, steps)).toBe(5000);
    expect(nextRadius(5000, steps)).toBe(10_000);
    expect(nextRadius(10_000, steps)).toBeNull();
  });

  it('URL chỉ đường mang đúng toạ độ đích', () => {
    expect(directionsUrl({ lat: 21.03, lng: 105.85 })).toContain('21.03,105.85');
  });
});
