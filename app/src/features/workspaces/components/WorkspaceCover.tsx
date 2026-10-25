import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { MEDIA_ASPECT_RATIO } from '@/shared/ui/card';
import { cn } from '@/shared/utils/style/cn';

import type { WorkspaceCoverPreset } from '../api';
import {
  coverPresetFor,
  displayImageCacheKey,
  WORKSPACE_COVER_SURFACE,
} from '../utils/workspace-cover';

/** `{ uri }` kèm khoá cache ổn định khi nhận ra URL ảnh ký sẵn của BE — lý do ở `displayImageCacheKey`. */
function imageSourceOf(uri: string): ImageSource {
  const cacheKey = displayImageCacheKey(uri);
  return cacheKey ? { cacheKey, uri } : { uri };
}

export interface WorkspaceCoverProps {
  /** Suy màu nền ỔN ĐỊNH khi `coverPreset` là `null` — xem `coverPresetFor`. */
  workspaceId: string;
  /** `coverUrl` của nhóm (BE đã ký sẵn, `WorkspaceImageView`) — dùng THẲNG, không qua `useAssetUrl`. */
  coverUrl: string | null | undefined;
  coverPreset: WorkspaceCoverPreset | null | undefined;
  className?: string;
  /**
   * Tỉ lệ khung. Mặc định `banner-slim` (343×163) — tỉ lệ của ô xem trước ở Cài đặt nhóm, nên đầu trang tổng quan hiện ĐÚNG
   * khung người dùng đã chọn. Thẻ danh sách dùng `WORKSPACE_CARD_COVER_RATIO` (3:1). `null` = không khoá tỉ lệ, chiều cao do
   * `className` quyết.
   * ⚠️ Truyền `null` mà quên lớp chiều cao thì khối cao 0 — ảnh không hiện, không lỗi nào báo.
   */
  aspectRatio?: number | null;
  /**
   * Bản THU NHỎ (`coverThumbUrl`, webp ≤ 320 px — `thumbMaxPx` của BE) vẽ TẠM trong lúc bản gốc `coverUrl` còn đang tải: mảng
   * màu → ảnh mờ → ảnh nét, thay vì mảng màu đứng yên cả giây trên mạng chậm.
   * ⛔ Chỉ là ảnh đỡ, KHÔNG làm nguồn chính cho khung rộng hết thẻ: 320 px kéo ra ~1000 px thật (thẻ ~343dp × mật độ 3) là
   * phóng ~3 lần ⇒ ảnh vỡ hạt — đúng lỗi của thẻ danh sách trước đây.
   */
  placeholderUrl?: string | null;
}

/**
 * Ảnh bìa nhóm: ảnh thật khi có `coverUrl`, còn lại mảng màu suy từ `coverPreset` (be.md
 * `WorkspaceImageView` — "coverUrl null = chưa đặt, client vẽ nền theo coverPreset").
 *
 * Khác `SetCoverBanner` (bộ học): `coverUrl` ở đây đã là URL KÝ SẴN nằm ngay trong response danh
 * sách/chi tiết nhóm (`workspaceImagesOf`, be `shared/media/display-image.ts`) — không cần
 * `useAssetUrl` xin URL riêng, và không cần `cachePolicy="none"`: cache đĩa mặc định của
 * `expo-image` dùng được, khoá theo `<assetId>:<biến thể>` (`displayImageCacheKey`) chứ không theo
 * URL — URL ký đổi mỗi "ô" thời gian (`displayImageUrlBucketSeconds`, 1 ngày), khoá theo URL là
 * mỗi ngày tải lại ảnh bìa bản gốc một lần.
 *
 * ⚠️ Cùng cách xếp LỚP với `SetCoverBanner`: ô màu nằm dưới, ảnh phủ lên trên bằng
 * `StyleSheet.absoluteFill` — `expo-image` gặp URL hỏng/hết hạn thì vẽ trong suốt và im lặng, mảng
 * màu bên dưới tự lộ ra thay vì để lại một ô trống.
 */
export function WorkspaceCover({
  aspectRatio = MEDIA_ASPECT_RATIO['banner-slim'],
  className,
  coverPreset,
  coverUrl,
  placeholderUrl,
  workspaceId,
}: WorkspaceCoverProps) {
  const preset = coverPreset ?? coverPresetFor(workspaceId);
  const source = coverUrl ? imageSourceOf(coverUrl) : undefined;
  // Trùng nguồn chính (nơi gọi đã rơi về bản thu nhỏ) thì bỏ — không tải một ảnh hai lần.
  const placeholder =
    placeholderUrl && placeholderUrl !== coverUrl ? imageSourceOf(placeholderUrl) : undefined;

  return (
    <View
      accessibilityElementsHidden
      className={cn('w-full overflow-hidden rounded-sm', WORKSPACE_COVER_SURFACE[preset], className)}
      importantForAccessibility="no-hide-descendants"
      style={aspectRatio === null ? undefined : { aspectRatio }}
    >
      {source ? (
        <Image
          contentFit="cover"
          placeholder={placeholder}
          // ⛔ Phải đi cùng `placeholder`: mặc định `scale-down` vẽ ảnh tạm NHỎ giữa khung rồi mới "phình" ra khi bản gốc về.
          placeholderContentFit="cover"
          source={source}
          style={StyleSheet.absoluteFill}
          transition={200}
        />
      ) : null}
    </View>
  );
}
