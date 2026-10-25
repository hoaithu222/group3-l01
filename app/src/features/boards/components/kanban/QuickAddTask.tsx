import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { hapticTap } from '@/shared/utils/haptics';

import type { BoardColumn } from '../../api/boards.types';
import type { CreateTaskInput } from '../../queries/tasks.queries';
import { newIdempotencyKey } from '../../utils/idempotency-key';

/** Tiêu đề thẻ tối đa 200 ký tự (`LIMITS.task.titleMax`, README §7). */
const TITLE_MAX = 200;

/**
 * Ô thêm thẻ nhanh dưới cột (`app.md` §2 `QuickAddTask`).
 *
 * `Idempotency-Key` sinh khi MỞ ô và đổi sau mỗi lần tạo xong — bấm "Thêm" hai
 * lần trên mạng chậm chỉ ra MỘT thẻ (app.md §4). Ô nhập là UNCONTROLLED
 * (`defaultValue`): ghi đè `value` giữa lúc bộ gõ đang ghép dấu làm mất dấu tiếng
 * Việt trên Android + Telex (`docs/rules/ui-components.md` §4.1).
 *
 * Mở ô rồi để mở: thêm liên tiếp nhiều thẻ mà không phải bấm lại nút. Xoá chữ
 * sau mỗi thẻ bằng `clear()` xuống thẳng native (cùng cách `SearchInput`), ⛔ không
 * bằng đổi `key`: dựng lại ô nhập là `TextInput` cũ bị `blur()` lúc tháo ⇒ bàn
 * phím sập rồi bật lại sau MỖI thẻ, cột co giãn theo `KeyboardAvoidingView`.
 */
export function QuickAddTask({
  column,
  disabled,
  onSubmit,
}: {
  column: BoardColumn;
  disabled: boolean;
  onSubmit: (input: CreateTaskInput) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey('task'));

  const close = () => {
    setOpen(false);
    setTitle('');
  };

  const submit = () => {
    const trimmed = title.trim();
    // `disabled` (mất mạng, hết quyền) chặn cả phím Enter của bàn phím — trước đây chỉ nút "Thêm" bị khoá.
    if (!trimmed || disabled) return;
    // Rung nhẹ xác nhận cú "Thêm" ngay lúc chạm — thẻ tạm hiện ngay nhưng lệnh tạo còn chờ mạng.
    hapticTap();
    onSubmit({ columnId: column.id, columnKind: column.kind, idempotencyKey, title: trimmed });
    inputRef.current?.clear();
    setTitle('');
    setIdempotencyKey(newIdempotencyKey('task'));
  };

  if (!open) {
    return (
      <Button
        accessibilityLabel={`Thêm thẻ vào cột ${column.title}`}
        disabled={disabled}
        iconLeft="add"
        label="Thêm thẻ"
        size="sm"
        variant="tertiary"
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <View className="gap-xs">
      <Input
        ref={inputRef}
        accessibilityLabel={`Tiêu đề thẻ mới trong cột ${column.title}`}
        autoFocus
        blurOnSubmit={false}
        defaultValue=""
        maxLength={TITLE_MAX}
        placeholder="Tiêu đề thẻ"
        returnKeyType="done"
        onChangeText={setTitle}
        onSubmitEditing={submit}
      />
      <View className="flex-row justify-end gap-xs">
        <Button label="Đóng" size="sm" variant="tertiary" onPress={close} />
        <Button
          disabled={disabled || title.trim().length === 0}
          label="Thêm"
          size="sm"
          onPress={submit}
        />
      </View>
    </View>
  );
}
