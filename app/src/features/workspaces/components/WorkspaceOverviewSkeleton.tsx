import { View } from 'react-native';

import { RADIUS } from '@/shared/theme';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

import { useHeroCoverRatio } from '../hooks/useHeroCoverRatio';

/** Số ô lưới vẽ sẵn — MỘT hàng bốn ô: thành viên thường gần như luôn có ≥ 4 ô (Kênh · Thành viên · Lịch họp · …). */
const GRID_TILES = 4;
/** Ô icon của ô lưới (`IconTile` cỡ `md`) — 40dp, bo `sm`. */
const TILE_SIZE = 40;
/** Ô icon ở đầu khung "Lối vào nhanh" (`IconTile` cỡ `sm`) — 32dp, bo `xs`. */
const HEADER_TILE_SIZE = 32;

/**
 * Khung xương của tổng quan nhóm — CÙNG HÌNH với `WorkspaceOverviewHero` + `WorkspaceHubCard` để nội dung thật về không làm
 * màn nhảy: bìa đúng tỉ lệ của bản thật (`useHeroCoverRatio` — đứng `banner-slim`, nằm ngang mỏng hơn), avatar tròn 64 đè NỬA
 * lên mép dưới bìa, tên + hàng "huy hiệu vai trò · số thành viên" căn giữa, rồi khung "Lối vào nhanh": đầu khung (ô icon 32 +
 * tiêu đề) và một hàng bốn ô lưới (ô icon 40 + tên).
 *
 * ⚠️ Mỗi thanh chữ cao ĐÚNG bằng `lineHeight` của vai chữ thật (tên `header-sm` 24, tên ô `caption-lg` 17, số thành viên
 * `caption-lg` 17) và huy hiệu `sm` 24 — thanh thấp hơn là mỗi khối hụt vài dp, cộng dồn thành cú nhảy khi dữ liệu về.
 * Mô tả và nút "Mời thành viên" KHÔNG vẽ sẵn: tuỳ nhóm/vai trò, đoán sai còn nhảy nhiều hơn.
 *
 * ⚠️ Vành `bg-1` quanh vòng avatar (`p-2xs`, nên `-mt-9` thay cho `-mt-8` của bản thật): khung xương của bìa và của avatar
 * cùng MỘT màu — thiếu vành thì nửa trên vòng tròn chìm vào bìa, mắt không thấy "avatar đè lên bìa" nữa.
 */
export function WorkspaceOverviewSkeleton() {
  const coverRatio = useHeroCoverRatio();

  return (
    <View className="gap-xl">
      <View className="overflow-hidden rounded-md bg-bg-1">
        {/* `aspectRatio` qua `style`: tỉ lệ là SỐ, không có lớp NativeWind tương ứng. */}
        <View style={{ aspectRatio: coverRatio }}>
          <Skeleton height="100%" radius={0} variant="rect" width="100%" />
        </View>
        <View className="-mt-9 items-center gap-sm px-md pb-md">
          <View className="rounded-full bg-bg-1 p-2xs">
            <Skeleton className="h-16 w-16" variant="circle" />
          </View>
          <View className="items-center gap-xs">
            <Skeleton height={24} width={160} />
            <View className="flex-row items-center gap-sm">
              <Skeleton height={24} radius={RADIUS.sm} width={72} />
              <Skeleton height={17} width={96} />
            </View>
          </View>
        </View>
      </View>

      {/* Cùng lề với `WorkspaceHubCard`: thẻ `px-xs pt-2xs pb-xs`, đầu khung `px-xs pt-sm pb-2xs`, ô `py-xs`. */}
      <Card className="gap-0 px-xs pb-xs pt-2xs" padded={false}>
        <View className="flex-row items-center gap-xs px-xs pb-2xs pt-sm">
          <Skeleton height={HEADER_TILE_SIZE} radius={RADIUS.xs} variant="rect" width={HEADER_TILE_SIZE} />
          <Skeleton height={16} width="35%" />
        </View>
        <View className="flex-row">
          {Array.from({ length: GRID_TILES }, (_, index) => (
            <View key={index} className="min-h-16 w-1/4 items-center gap-2xs px-3xs py-xs">
              <Skeleton height={TILE_SIZE} radius={RADIUS.sm} variant="rect" width={TILE_SIZE} />
              <Skeleton height={17} width="70%" />
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
