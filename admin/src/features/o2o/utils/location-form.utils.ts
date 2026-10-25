import type { LocationFormValues } from '../schemas/location.schema';
import { AMENITY_CODES } from '../constants/o2o.constants';
import type {
  AdminLocation,
  AmenityCode,
  LocationBody,
  OpenHour,
  UpdateLocationPayload,
} from '../types/o2o.types';

/**
 * Tâm mặc định khi tạo địa điểm mới — khuôn viên (Hà Nội), khớp `LIMITS.o2o.defaultCenter` của BE. Chỉ là điểm xuất phát
 * để ô toạ độ có giá trị hợp lệ; người vận hành PHẢI sửa cho đúng vị trí thật.
 */
const DEFAULT_CENTER = { lat: 21.0285, lng: 105.8542 };

const isKnownAmenity = (code: string): code is AmenityCode =>
  (AMENITY_CODES as string[]).includes(code);

/** Giá trị khởi tạo form: `null` = tạo mới; có địa điểm = sửa. Tiện ích lạ (dữ liệu cũ) bị bỏ vì BE chỉ nhận mã đã biết. */
export function initLocationValues(loc: AdminLocation | null): LocationFormValues {
  if (!loc) {
    return {
      name: '',
      address: '',
      type: 'CAFE',
      lat: DEFAULT_CENTER.lat,
      lng: DEFAULT_CENTER.lng,
      amenities: [],
      openHours: [],
      photos: [],
    };
  }
  return {
    name: loc.name,
    address: loc.address,
    type: loc.type,
    lat: loc.lat,
    lng: loc.lng,
    amenities: loc.amenities.filter(isKnownAmenity),
    openHours: loc.openHours.map((h) => ({ day: String(h.day), open: h.open, close: h.close })),
    // `url` LÀ id asset (quy ước `FileField`, xem `location.schema.ts`) — ảnh cũ chưa có tên riêng nên đánh số để phân biệt trong danh sách.
    photos: loc.photoAssetIds.map((id, i) => ({ id, name: `Ảnh ${i + 1}`, url: id })),
  };
}

const toOpenHours = (values: LocationFormValues): OpenHour[] =>
  values.openHours.map((h) => ({ day: Number(h.day), open: h.open, close: h.close }));

/** Form → thân `POST /admin/locations`. `photos[].url` LÀ id asset (không phải URL — quy ước `FileField`). */
export function toLocationBody(values: LocationFormValues): LocationBody {
  return {
    name: values.name,
    address: values.address,
    lat: values.lat,
    lng: values.lng,
    type: values.type,
    amenities: values.amenities,
    openHours: toOpenHours(values),
    photoAssetIds: values.photos.map((p) => p.url),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

const sameHours = (a: readonly OpenHour[], b: readonly OpenHour[]): boolean =>
  a.length === b.length &&
  a.every((h, i) => h.day === b[i].day && h.open === b[i].open && h.close === b[i].close);

/**
 * Form → thân `PATCH /admin/locations/:id`: chỉ gửi trường ĐÃ ĐỔI (nhật ký `fields` khỏi liệt kê cả những trường không đụng tới),
 * kèm `expectedVersion` để BE chặn ghi đè khi người khác vừa sửa (409 `RES_003`). BE bắt buộc vĩ độ và kinh độ đi CÙNG nhau
 * (`adminLocationUpdateSchema`), nên đổi một trong hai là gửi cả hai.
 */
export function toUpdateLocationPayload(
  loc: AdminLocation,
  values: LocationFormValues,
): UpdateLocationPayload {
  const next = toLocationBody(values);
  const payload: UpdateLocationPayload = { id: loc.id, expectedVersion: loc.version };
  if (next.name !== loc.name) payload.name = next.name;
  if (next.address !== loc.address) payload.address = next.address;
  if (next.type !== loc.type) payload.type = next.type;
  if (next.lat !== loc.lat || next.lng !== loc.lng) {
    payload.lat = next.lat;
    payload.lng = next.lng;
  }
  if (!sameSet(next.amenities, loc.amenities.filter(isKnownAmenity))) {
    payload.amenities = next.amenities;
  }
  if (!sameHours(next.openHours, loc.openHours)) payload.openHours = next.openHours;
  // Thứ tự ảnh không mang ý nghĩa nghiệp vụ (BE không sắp theo thứ tự riêng) — chỉ gửi khi TẬP hợp id đổi
  // (thêm/xoá), tránh PATCH thừa lúc người dùng chỉ mở form rồi lưu ngay.
  if (!sameSet(next.photoAssetIds, loc.photoAssetIds)) payload.photoAssetIds = next.photoAssetIds;
  return payload;
}
