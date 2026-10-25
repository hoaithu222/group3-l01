import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

export interface StatusPageProps {
  /** Nút ở thanh đáy (`BottomActionBar`) — thường 1–2 `Button`. */
  actions: ReactNode;
  /** Khối phụ giữa trang: đếm ngược, khung xem trước… */
  children?: ReactNode;
  description?: string;
  /** Chữ nhỏ trên tiêu đề — thường là tên cuộc họp. */
  eyebrow?: string;
  /** Tiêu đề thanh trên (`AppBar`). */
  headerTitle: string;
  /** Biểu tượng trong ô tông màu; bị `iconSlot` thay khi cần hoạt ảnh. */
  icon: IconName;
  /** Thay ô biểu tượng tĩnh (vd `WaitingPulse`). */
  iconSlot?: ReactNode;
  /** Không truyền ⇒ không có nút quay lại trên `AppBar` (màn chỉ thoát bằng nút đáy). */
  onBack?: () => void;
  title: string;
  /**
   * Tông ô biểu tượng — cùng quy ước với `EmptyState`: chờ = `info`, xong = `success`, bị chặn/cần chú ý = `warning`, không còn khả dụng
   * = `neutral`. ⛔ Không `danger`: các màn này KHÔNG phải lỗi của người dùng (lời lẽ trung tính của `BLOCKED_COPY`). Mặc định `neutral`.
   */
  tone?: IconTileTone;
}

/**
 * Khung dùng chung của các MÀN TRẠNG THÁI trước/sau phòng họp (chờ chủ trì, chờ vào phòng, không vào được, đã kết thúc): ô biểu tượng
 * có tông — tiêu đề — mô tả căn giữa, nút ở đáy. Tách riêng vì bốn màn cùng một bố cục; sửa nhịp/khe ở đây là cả bốn đổi theo.
 *
 * Dựng bằng `EmptyState`-cùng-tinh-thần nhưng KHÔNG dùng chính `EmptyState`: nó xếp tối đa hai nút chia đôi hàng 311dp và cắt nhãn ở một
 * dòng — "Về chi tiết cuộc họp" + "Mở liên kết cuộc họp" không vừa ở 320dp. Ở đây nút xếp DỌC, full-width, nhãn nào cũng đọc đủ.
 *
 * Ô biểu tượng là `IconTile xl` (64dp, nền `surface-*` + icon hai tông cùng họ màu) thay cho đĩa xám trơn: màu nói trước nội dung ("đang
 * chờ" xanh, "đã xong" xanh lá, "bị chặn" cam) — trang trí thuần, nghĩa nằm ở tiêu đề.
 */
export function StatusPage({
  actions,
  children,
  description,
  eyebrow,
  headerTitle,
  icon,
  iconSlot,
  onBack,
  title,
  tone = 'neutral',
}: StatusPageProps) {
  return (
    <Screen
      footer={<BottomActionBar>{actions}</BottomActionBar>}
      header={<AppBar title={headerTitle} onBack={onBack} />}
    >
      <View className="items-center gap-md py-xl">
        {iconSlot ?? <IconTile name={icon} size="xl" tone={tone} />}
        <View className="items-center gap-xs">
          {eyebrow ? <Text className="text-center text-label-md text-fg-2">{eyebrow}</Text> : null}
          <Text accessibilityRole="header" className="text-center text-header-sm text-fg-1">
            {title}
          </Text>
          {description ? <Text className="text-center text-body-md text-fg-2">{description}</Text> : null}
        </View>
        {children}
      </View>
    </Screen>
  );
}
