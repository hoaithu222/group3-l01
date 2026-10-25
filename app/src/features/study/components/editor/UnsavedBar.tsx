import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

export interface UnsavedBarProps {
  /** Lỗi cấp bộ (`STUDY_002/004`, mạng…) hiện phía trên thanh. */
  banner?: string | null;
  changeCount: number;
  /** Số tệp ảnh/âm thanh tải LỖI — khoá Lưu tới khi thử lại hoặc bỏ tệp đó (không im lặng lưu thiếu ảnh). */
  mediaFailed?: number;
  /** Số tệp ảnh/âm thanh còn đang tải — khoá Lưu (asset chưa READY thì BE từ chối `STUDY_006`). */
  mediaPending?: number;
  /** Tắt nút Lưu khi ngoại tuyến (nháp vẫn giữ trong bộ nhớ). */
  offline: boolean;
  saving: boolean;
  /** Bộ đã đủ số mục tối đa (`itemsPerSetMax`) — khoá "Thêm mục" và nói rõ, thay vì để BE từ chối lúc Lưu. */
  addDisabled?: boolean;
  /** Có = hiện nút "Thêm mục" cạnh Lưu (màn danh sách): hành động chính của trình soạn nằm trong tầm ngón cái. */
  onAdd?: () => void;
  onSave: () => void;
}

/**
 * Thanh dưới của trình soạn (app.md p4-01 §2 `UnsavedBar`): "N thay đổi chưa lưu · Lưu", kèm "Thêm mục" ở màn danh sách. Khi chưa
 * có thay đổi thì chỉ báo "Đã lưu". Ngoại tuyến: khoá Lưu và nói rõ nháp còn nằm trong bộ nhớ (§3 "Offline"). Còn tệp ảnh/âm thanh
 * đang tải hoặc lỗi: khoá Lưu và nói rõ (§4 "Upload media": "mục chỉ lưu được khi mọi asset READY").
 *
 * ⚠️ Có `onAdd` thì hai nút XẾP HÀNG DƯỚI dòng trạng thái (mỗi nút `flex-1`, cao 48): trên máy 320dp một hàng gồm chữ trạng thái +
 * "Thêm mục" + "Lưu" không đủ chỗ (chữ Plus Jakarta rộng hơn Roboto ~10%) và nhãn nút bị cắt. Không có `onAdd` (form mục đang mở
 * trên điện thoại) thì giữ một hàng gọn như cũ.
 */
export function UnsavedBar({
  addDisabled = false,
  banner,
  changeCount,
  mediaFailed = 0,
  mediaPending = 0,
  offline,
  onAdd,
  onSave,
  saving,
}: UnsavedBarProps) {
  const dirty = changeCount > 0;
  const blocked = !dirty || offline || mediaPending > 0 || mediaFailed > 0;
  const status = (
    <View
      className={onAdd ? 'flex-row items-center gap-xs' : 'flex-1 flex-row items-center gap-xs'}
    >
      {dirty ? (
        <View className="size-2 rounded-full bg-action-accent" />
      ) : (
        <Icon color="success" name="checkmark-circle" size={16} />
      )}
      <Text accessibilityLiveRegion="polite" className="shrink text-label-md text-fg-1">
        {dirty ? `${changeCount} thay đổi chưa lưu` : 'Đã lưu'}
      </Text>
    </View>
  );

  return (
    <View className="gap-xs border-t border-t-divider-1 bg-bg-1 px-md py-xs">
      {banner ? <Alert description={banner} tone="error" /> : null}
      {offline ? (
        <Text className="text-caption-sm text-fg-2">
          Đang ngoại tuyến — thay đổi được giữ tạm, kết nối lại để lưu.
        </Text>
      ) : null}
      {mediaPending > 0 ? (
        <Text accessibilityLiveRegion="polite" className="text-caption-sm text-fg-2">
          Đang tải {mediaPending} tệp lên… Lưu được khi tải xong.
        </Text>
      ) : null}
      {onAdd && addDisabled ? (
        <Text className="text-caption-sm text-fg-2">
          Bộ đã đủ số mục tối đa — xoá bớt mục rồi mới thêm được.
        </Text>
      ) : null}
      {mediaFailed > 0 ? (
        <Text className="text-caption-sm text-error">
          {mediaFailed} tệp tải lỗi — thử lại hoặc bỏ tệp đó rồi mới Lưu được.
        </Text>
      ) : null}
      {onAdd ? (
        <>
          {status}
          <View className="flex-row gap-xs">
            <View className="flex-1">
              <Button
                disabled={addDisabled}
                fullWidth
                iconLeft="add"
                label="Thêm mục"
                variant="secondary"
                onPress={onAdd}
              />
            </View>
            <View className="flex-1">
              <Button disabled={blocked} fullWidth label="Lưu" loading={saving} onPress={onSave} />
            </View>
          </View>
        </>
      ) : (
        <View className="flex-row items-center justify-between gap-sm">
          {status}
          <Button disabled={blocked} label="Lưu" loading={saving} size="sm" onPress={onSave} />
        </View>
      )}
    </View>
  );
}
