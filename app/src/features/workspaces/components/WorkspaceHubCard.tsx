import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import type { WorkspaceHubEntry } from '../hooks/useWorkspaceHubEntries';
import { splitHubEntries } from '../utils/workspace-hub-layout';
import { WorkspaceActionRow } from './WorkspaceActionRow';
import { WorkspaceHubTile } from './WorkspaceHubTile';

export interface WorkspaceHubCardProps {
  entries: WorkspaceHubEntry[];
}

/**
 * Bề rộng ô theo SỐ Ô: 2–3 ô chia đều cả hàng (không để nửa thẻ trống), từ 4 ô trở lên là lưới bốn cột `w-1/4` dồn trái
 * như lưới phân hệ Trang chủ — phần trăm của cha, không tính px nên hàng không tụt cột vì lỗi làm tròn ở máy 320dp.
 */
function tileWidthClass(count: number): string {
  if (count <= 2) return 'w-1/2';
  if (count === 3) return 'w-1/3';
  return 'w-1/4';
}

/**
 * Khung "Lối vào nhanh" của tổng quan nhóm, hai tầng (kiểu lối tắt của Slack/Teams thay cho một danh sách dài đều đều):
 *  1. LƯỚI Ô cho nơi mở hằng ngày (`WORKSPACE_HUB_TILE_KEYS`: Kênh · Thành viên · Lịch họp · Ví · Xếp hạng · Tài liệu cộng tác ·
 *     Bảng trắng) — ô icon + tên + số chưa đọc (`WorkspaceHubTile`, co nhẹ khi nhấn).
 *  2. DANH SÁCH GỌN cho công cụ cấu hình/quản trị còn lại (Tích hợp · Tìm cố vấn · Kiểm tra trùng lặp) — dòng có mô tả
 *     (`WorkspaceActionRow`), ngăn với lưới bằng kẻ mảnh.
 * Cách chia ở `splitHubEntries` (dưới 2 ô thì cả khung là danh sách); danh sách rỗng thì không vẽ khung.
 *
 * ✅ Tông ô icon lấy THẲNG từ mục (`entry.tone`, khai theo loại lối vào ở `useWorkspaceHubEntries`) — ⛔ không xoay vòng theo
 * vị trí: màu phải nói "đây là Ví/Lịch họp", không phải "đây là ô thứ ba".
 *
 * ✅ Đầu khung: ô icon `sm` tông `brand` + tiêu đề (vai `header`) — cùng mẫu "ô icon có tông + tiêu đề" của các thẻ khác. Tĩnh,
 * ⛔ không vòng lặp (vòng lặp duy nhất của màn là sao lấp lánh ở đầu trang).
 *
 * ⚠️ Lề: thẻ `padded={false}` + `px-xs` (8) để bốn ô có thêm 16dp bề ngang ở máy hẹp; đầu khung và danh sách tự thêm 8 cho
 * đủ 16 như mọi thẻ khác (kẻ chia của dòng thụt 16 hai bên, vệt nhấn tràn ra 8 — đúng khuôn `WorkspaceActionRow`).
 */
export function WorkspaceHubCard({ entries }: WorkspaceHubCardProps) {
  if (entries.length === 0) return null;

  const { rows, tiles } = splitHubEntries(entries);
  const tileWidth = tileWidthClass(tiles.length);

  return (
    // `gap-0`: `Card` mặc định `gap-sm` — khe đó chen vào giữa đầu khung, lưới và danh sách vốn đã tự có đệm.
    <Card className={cn('gap-0 px-xs pt-2xs', rows.length > 0 ? 'pb-2xs' : 'pb-xs')} padded={false}>
      <View className="flex-row items-center gap-xs px-xs pb-2xs pt-sm">
        <IconTile name="service" size="sm" tone="brand" />
        <Text accessibilityRole="header" className="flex-1 text-label-lg font-semibold text-fg-1">
          Lối vào nhanh
        </Text>
      </View>
      {tiles.length > 0 ? (
        <View className="flex-row flex-wrap">
          {tiles.map((entry) => (
            <WorkspaceHubTile key={entry.key} entry={entry} widthClassName={tileWidth} />
          ))}
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View className={cn('mx-xs', tiles.length > 0 && 'mt-2xs border-t border-t-divider-1')}>
          {rows.map((entry, index) => (
            <WorkspaceActionRow
              key={entry.key}
              badge={entry.badge}
              chevron
              description={entry.description}
              divider={index < rows.length - 1}
              icon={entry.icon}
              label={entry.label}
              tileTone={entry.tone}
              tone="brand"
              onPress={entry.onPress}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
