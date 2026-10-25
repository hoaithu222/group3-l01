import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { ListItem } from '@/shared/ui/list';

import type { ShopListing, Wallet } from '../api/coins.types';
import { SHOP_KIND_LABELS } from '../constants/coins.constants';
import { coinErrorCode, coinErrorMessage, shortfallOf } from '../utils/coin-errors';
import { formatCoins } from '../utils/coin-format';
import { CoinsNote } from './CoinsNote';
import { ItemPreview } from './ItemPreview';

export interface PurchaseConfirmSheetProps {
  /** Vật phẩm đang xem (giữ nguyên trong lúc tấm đóng dần — nơi gọi không xoá ngay khi đóng). */
  item: ShopListing | null;
  visible: boolean;
  /** Chưa tải/lỗi ⇒ `undefined`: vẫn cho mua (BE quyết định `COIN_001`), chỉ không tính được "số dư sau khi mua". */
  wallet: Wallet | undefined;
  /** Lỗi của lượt mua gần nhất (`mutation.error`). */
  error: unknown;
  pending: boolean;
  offline: boolean;
  onConfirm: () => void;
  onClose: () => void;
  onOpenInventory: () => void;
}

/**
 * Tấm xác nhận mua (app.md p7-02 §3): xem trước, giá, số dư hiện tại và SAU khi mua, rồi "Xác nhận mua". Lỗi giữ lại TRONG tấm (toast tự tắt sau 4 giây trong khi
 * người dùng cần đọc "còn thiếu N xu"): `COIN_001` nói số xu còn thiếu (ưu tiên số của server, rơi về tự tính từ ví ở máy), `COIN_002` (đã sở hữu — vật phẩm đã đổi
 * sang "Đã có" sau khi làm mới, tấm chuyển sang trạng thái sở hữu), lỗi mạng/429 dùng câu chung. Không ngôn ngữ thúc giục chi tiêu; luôn có dòng "xu không quy đổi ra tiền".
 * `Idempotency-Key` KHÔNG nằm ở đây mà ở `useBuyItem` (giữ theo vật phẩm qua các lần bấm lại). Rung "thành công" sau khi mua do `ShopScreen` lo (`hapticSuccess`).
 *
 * ✅ Nút ở `footer` qua `SheetActions` [Huỷ | Xác nhận mua]: đứng yên ở đáy tấm (không trôi theo nội dung cuộn), chia đôi đúng
 * cách của bộ chung — và luôn có lối thoát bằng chữ cạnh nút chính, không chỉ vuốt xuống. Giá / số dư / số dư sau khi mua là
 * các `ListItem` nhãn–giá trị (đọc "Giá: 300 xu" một lượt).
 */
export function PurchaseConfirmSheet({
  error,
  item,
  offline,
  onClose,
  onConfirm,
  onOpenInventory,
  pending,
  visible,
  wallet,
}: PurchaseConfirmSheetProps) {
  if (!item) return null;

  const balance = wallet?.balance;
  // Ví ở máy là nguồn tính "còn thiếu" (sau `COIN_001`, `useBuyItem` làm mới ví nên số này tự đúng lại khi người dùng kiếm thêm xu); chưa có ví thì mượn số của server.
  const missing =
    balance !== undefined ? Math.max(0, item.price - balance) : (shortfallOf(error)?.missing ?? 0);
  const errorCode = coinErrorCode(error);
  // `COIN_002` đã hiện ở khối "đã sở hữu"; `COIN_001` đã hiện ở khối "còn thiếu" — trừ lúc ví ở máy còn nói "đủ xu" (chờ làm mới), khi đó vẫn phải báo câu của server.
  const otherError =
    error && errorCode !== 'COIN_002' && !(errorCode === 'COIN_001' && missing > 0);

  return (
    <BottomSheet
      footer={
        item.owned ? (
          <SheetActions
            primary={{ label: 'Xem Kho đồ', onPress: onOpenInventory }}
            secondary={{ label: 'Đóng', onPress: onClose }}
          />
        ) : (
          <SheetActions
            primary={{
              disabled: missing > 0 || offline,
              label: 'Xác nhận mua',
              loading: pending,
              onPress: onConfirm,
            }}
            secondary={{ label: 'Huỷ', onPress: onClose }}
          />
        )
      }
      scrollable
      title={item.name}
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md pb-md">
        <ItemPreview item={item} />
        <Text className="text-body-md text-fg-2">{SHOP_KIND_LABELS[item.kind]}</Text>

        <View>
          <ListItem divider label="Giá" value={formatCoins(item.price)} />
          {balance !== undefined ? (
            <ListItem divider={missing === 0} label="Số dư của bạn" value={formatCoins(balance)} />
          ) : null}
          {balance !== undefined && missing === 0 ? (
            <ListItem label="Số dư sau khi mua" value={formatCoins(balance - item.price)} />
          ) : null}
        </View>

        {item.owned ? (
          <Alert description="Bạn đã sở hữu vật phẩm này. Vào Kho đồ để trang bị." tone="success" />
        ) : null}
        {!item.owned && missing > 0 ? (
          <Alert
            description="Hoàn thành nhiệm vụ ngày hoặc công việc đúng hạn để nhận thêm xu."
            title={`Bạn còn thiếu ${formatCoins(missing)}`}
            tone="warning"
          />
        ) : null}
        {otherError ? <Alert description={coinErrorMessage(error)} tone="error" /> : null}
        {offline ? <Alert description="Cần kết nối mạng để mua." tone="warning" /> : null}

        <CoinsNote />
      </View>
    </BottomSheet>
  );
}
