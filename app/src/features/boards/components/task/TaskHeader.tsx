import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Input } from '@/shared/ui/input';

import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';

export interface TaskHeaderProps {
  canEdit: boolean;
  /** Tên cột hiện tại (chip mở `MoveTaskSheet`); `undefined` khi chưa tải bảng. */
  columnTitle?: string;
  title: string;
  onOpenColumn: () => void;
  /** Lưu tiêu đề; trả về câu lỗi (giữ ô sửa mở, giữ chữ đang gõ) hoặc `null` khi xong. */
  onSaveTitle: (title: string) => Promise<string | null>;
}

/**
 * Đầu chi tiết thẻ (app.md §2 `TaskHeader`): tiêu đề SỬA TẠI CHỖ (chạm → ô nhập, Lưu/Huỷ) và chip cột hiện
 * tại (chạm → chuyển cột). Nút "…" (Giao cho tôi · Sao chép link · Xoá) nằm ở `AppBar` của màn — chỗ quen thuộc của menu
 * tràn, thay vì một nút icon lẻ dưới tiêu đề.
 *
 * Ô sửa là controlled bằng state cục bộ ĐỒNG BỘ theo từng phím (không có nhịp bất đồng bộ ghi đè giữa lúc
 * bộ gõ ghép dấu — bẫy IME chỉ xảy ra với giá trị đặt lại sau một độ trễ). Lỗi lưu (409, mất mạng) giữ
 * NGUYÊN chữ đang gõ để người dùng sửa tiếp hoặc lưu lại.
 */
export function TaskHeader({
  canEdit,
  columnTitle,
  title,
  onOpenColumn,
  onSaveTitle,
}: TaskHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    setDraft(title);
    setError(null);
    setEditing(true);
  };

  const submit = async () => {
    const next = draft.trim();
    if (next === '' || next === title) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const failure = await onSaveTitle(next);
    setBusy(false);
    if (failure) setError(failure);
    else setEditing(false);
  };

  return (
    <View className="gap-sm">
      {editing ? (
        <View className="gap-xs">
          <Input
            accessibilityLabel="Tiêu đề thẻ"
            autoFocus
            maxLength={FALLBACK_TASK_LIMITS.titleMax}
            message={error ?? undefined}
            messageTone="error"
            multiline
            placeholder="Ví dụ: Thiết kế màn đăng nhập"
            value={draft}
            onChangeText={setDraft}
          />
          <View className="flex-row justify-end gap-xs">
            <Button
              disabled={busy}
              label="Huỷ"
              size="sm"
              variant="tertiary"
              onPress={() => setEditing(false)}
            />
            <Button
              disabled={draft.trim() === ''}
              label="Lưu"
              loading={busy}
              size="sm"
              onPress={() => void submit()}
            />
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityHint={canEdit ? 'Chạm để sửa tiêu đề' : undefined}
          accessibilityRole={canEdit ? 'button' : 'header'}
          className="min-h-[44px] justify-center active:opacity-70"
          disabled={!canEdit}
          onPress={start}
        >
          <Text className="text-header-sm font-semibold text-fg-1" maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
        </Pressable>
      )}

      {columnTitle ? (
        <View className="flex-row">
          <Chip label={`Cột: ${columnTitle}`} size="sm" onPress={onOpenColumn} />
        </View>
      ) : null}
    </View>
  );
}
