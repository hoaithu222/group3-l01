import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import type { MemberLookupItem } from '../api';

export interface MemberLookupRowProps {
  /** Khoá nút "Thêm" (đang gửi lượt thêm khác, mất mạng…). */
  disabled?: boolean;
  item: MemberLookupItem;
  /** Đang thêm CHÍNH người này. */
  adding?: boolean;
  onAdd: (item: MemberLookupItem) => void;
}

/**
 * Dòng gợi ý phía dưới tên: khớp bằng gì + liên hệ CÒN LẠI đã che (BE chỉ trả gợi ý che, không bao giờ trả email/SĐT đầy đủ).
 * Nhờ đó người thêm phân biệt được hai tài khoản trùng SĐT (SĐT tự khai, không unique).
 */
function matchLine(item: MemberLookupItem): string {
  if (item.matchedBy === 'EMAIL') return item.hint ? `Khớp email · SĐT ${item.hint}` : 'Khớp email';
  return item.hint ? `Khớp số điện thoại · Email ${item.hint}` : 'Khớp số điện thoại';
}

/** Nhãn trạng thái là huy hiệu CÓ CHỮ — đã trong nhóm `neutral` (không có gì phải làm), bị chặn `error` (cần bỏ chặn trước). */
const STATE_BADGE = {
  ALREADY_MEMBER: { label: 'Đã trong nhóm', variant: 'neutral' },
  BANNED: { label: 'Đang bị chặn khỏi nhóm', variant: 'error' },
} as const satisfies Record<string, { label: string; variant: BadgeVariant }>;

/**
 * Một kết quả tra người (app.md — "Thêm thành viên bằng SĐT/email"): avatar + tên + dòng khớp, bên phải là nút "Thêm" hoặc nhãn
 * trạng thái BẰNG CHỮ (không chỉ màu). Chỉ `AVAILABLE` mới có nút; "Đang bị chặn" hướng người dùng sang Thành viên → bỏ chặn.
 */
export function MemberLookupRow({ adding, disabled, item, onAdd }: MemberLookupRowProps) {
  return (
    <View className="flex-row items-center gap-sm px-md py-sm">
      <Avatar name={item.name} size="md" source={item.avatarUrl ? { uri: item.avatarUrl } : undefined} />

      <View className="flex-1 gap-3xs">
        <Text className="text-label-md text-fg-1" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-caption-sm text-fg-2" numberOfLines={2}>
          {matchLine(item)}
        </Text>
      </View>

      {item.state === 'AVAILABLE' ? (
        <Button
          accessibilityLabel={`Thêm ${item.name} vào nhóm`}
          disabled={disabled}
          label="Thêm"
          loading={adding}
          size="sm"
          onPress={() => onAdd(item)}
        />
      ) : (
        <Badge label={STATE_BADGE[item.state].label} size="sm" variant={STATE_BADGE[item.state].variant} />
      )}
    </View>
  );
}
