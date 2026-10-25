import { z } from 'zod';

import { requiredText } from '@/shared/utils/validation/validators.utils';

import {
  AMENITY_CODES,
  LOCATION_TYPES,
  O2O_LIMITS as L,
  TIME_PATTERN,
} from '../constants/o2o.constants';

const minutesOf = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Một khung giờ mở cửa — khớp `openHourSchema` BE (`dtos/admin.dto.ts`): "HH:mm" (đóng có thể "24:00"), đóng SAU mở
 * (không hỗ trợ qua nửa đêm — tách thành hai dòng ngày). `day` là CHUỖI ("0"–"6") vì ô chọn thứ trả chuỗi; chuyển
 * về số ở `toLocationBody`.
 */
const openHourFormSchema = z
  .object({
    day: z.string().regex(/^[0-6]$/, 'Chọn thứ'),
    open: z.string().regex(TIME_PATTERN, 'Giờ mở dạng HH:mm'),
    close: z.string().regex(TIME_PATTERN, 'Giờ đóng dạng HH:mm'),
  })
  .superRefine((h, ctx) => {
    if (!TIME_PATTERN.test(h.open) || !TIME_PATTERN.test(h.close)) return;
    if (minutesOf(h.close) <= minutesOf(h.open)) {
      ctx.addIssue({ code: 'custom', path: ['close'], message: 'Giờ đóng phải sau giờ mở' });
    }
  });

/** `objectIdSchema` BE — id asset. */
const ASSET_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * Một ảnh địa điểm = giá trị của `FileField` (`UploadedFile`) — `url` LÀ id asset chứ không phải URL: handler
 * `createAssetUploader` trả id (xem `core/uploads`). Ảnh cũ (đã `READY`) nạp lại từ `photoAssetIds` cũng qua hình
 * dạng này (`initLocationValues`) để dùng chung một danh sách sửa/xoá/thêm.
 */
const locationPhotoSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  url: z.string().regex(ASSET_ID_RE, 'Ảnh chưa tải xong, hãy đợi hoặc chọn lại'),
  size: z.number().optional(),
});

/**
 * Form tạo/sửa địa điểm — khớp `adminLocationSchema` BE: tên 2–120, địa chỉ 3–300, vĩ độ −90…90, kinh độ −180…180,
 * loại, tiện ích (mã đã biết), tối đa 14 khung giờ, ảnh tối đa `photosMax` (`photoAssetIds`, scope `LOCATION`).
 */
export const locationFormSchema = z.object({
  name: requiredText('Tên địa điểm là bắt buộc')
    .min(L.nameMin, `Tên tối thiểu ${L.nameMin} ký tự`)
    .max(L.nameMax, `Tên tối đa ${L.nameMax} ký tự`),
  address: requiredText('Địa chỉ là bắt buộc')
    .min(L.addressMin, `Địa chỉ tối thiểu ${L.addressMin} ký tự`)
    .max(L.addressMax, `Địa chỉ tối đa ${L.addressMax} ký tự`),
  type: z.enum(LOCATION_TYPES),
  lat: z
    .number({ error: 'Nhập vĩ độ' })
    .min(-90, 'Vĩ độ từ −90 đến 90')
    .max(90, 'Vĩ độ từ −90 đến 90'),
  lng: z
    .number({ error: 'Nhập kinh độ' })
    .min(-180, 'Kinh độ từ −180 đến 180')
    .max(180, 'Kinh độ từ −180 đến 180'),
  amenities: z.array(z.enum(AMENITY_CODES)),
  openHours: z.array(openHourFormSchema).max(L.openHoursMax, `Tối đa ${L.openHoursMax} khung giờ`),
  photos: z.array(locationPhotoSchema).max(L.photosMax, `Tối đa ${L.photosMax} ảnh`),
});

export type LocationFormValues = z.infer<typeof locationFormSchema>;
