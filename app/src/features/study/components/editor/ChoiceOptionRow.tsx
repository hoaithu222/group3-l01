import { Pressable, Text, View, type TextInput } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/utils/style/cn';

import type { DraftOption } from '../../utils/editor-draft';
import { AnimatedRow } from './AnimatedRow';
import { ItemMediaSlot } from './ItemMediaSlot';

export interface ChoiceOptionRowProps {
  /** Hàng mới thêm (không có sẵn lúc mở form) mới hiện dần. */
  animate: boolean;
  correct: boolean;
  index: number;
  maxLength: number;
  message?: string;
  option: DraftOption;
  /** Bàn phím còn chỗ đi tiếp (lựa chọn kế hoặc thêm lựa chọn mới) ⇒ Enter là "Tiếp"; hết chỗ thì là "Xong". */
  keepGoing: boolean;
  removable: boolean;
  /** Khoá ô ảnh của lựa chọn trong hàng đợi upload (`itemSlotScopeKey`). */
  scopeKey: string;
  single: boolean;
  inputRef: (node: TextInput | null) => void;
  onChangeText: (text: string) => void;
  onClearMedia: () => void;
  onRemove: () => void;
  onSubmit: () => void;
  onToggle: () => void;
}

/**
 * Một lựa chọn của trắc nghiệm: nút tròn đánh dấu đáp án đúng (cỡ chạm 44dp) + ô chữ + xoá + ảnh. Đáp án đúng có DẤU TÍCH đặc +
 * chữ "Đáp án đúng" + viền/nền xanh — không chỉ màu; chưa đúng thì vòng tròn rỗng mang chữ cái A/B/C… (chữ cái cũng là cách
 * người học thấy lựa chọn trong bài thi).
 */
export function ChoiceOptionRow({
  animate,
  correct,
  index,
  inputRef,
  keepGoing,
  maxLength,
  message,
  onChangeText,
  onClearMedia,
  onRemove,
  onSubmit,
  onToggle,
  option,
  removable,
  scopeKey,
  single,
}: ChoiceOptionRowProps) {
  return (
    <AnimatedRow
      animate={animate}
      className={cn(
        'gap-xs rounded-sm border-hairline p-sm',
        correct ? 'border-border-success-subtle bg-surface-success' : 'border-border-1 bg-bg-1',
      )}
    >
      <View className="flex-row items-start gap-xs">
        <Pressable
          accessibilityLabel={`Lựa chọn ${index + 1} là đáp án đúng`}
          accessibilityRole={single ? 'radio' : 'checkbox'}
          accessibilityState={{ checked: correct }}
          className="size-11 items-center justify-center active:opacity-70"
          onPress={onToggle}
        >
          {correct ? (
            <Icon color="success" name="checkmark-circle" size={28} variant="solid" />
          ) : (
            <View className="size-7 items-center justify-center rounded-full border-medium border-border-2">
              <Text className="text-label-sm text-fg-2">{String.fromCharCode(65 + index)}</Text>
            </View>
          )}
        </Pressable>
        <View className="flex-1">
          <Input
            ref={inputRef}
            accessibilityLabel={`Lựa chọn ${index + 1}`}
            maxLength={maxLength}
            message={message}
            messageTone="error"
            placeholder={`Lựa chọn ${index + 1}`}
            returnKeyType={keepGoing ? 'next' : 'done'}
            submitBehavior={keepGoing ? 'submit' : 'blurAndSubmit'}
            value={option.text}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
          />
        </View>
        <Button
          accessibilityLabel={`Xoá lựa chọn ${index + 1}`}
          disabled={!removable}
          iconLeft="delete"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={onRemove}
        />
      </View>
      {correct ? (
        <View className="flex-row items-center gap-3xs pl-xs">
          <Icon color="success" name="checkmark-circle" size={14} />
          <Text className="text-caption-sm font-semibold text-fg-1">Đáp án đúng</Text>
        </View>
      ) : null}
      <ItemMediaSlot
        assetId={option.mediaAssetId}
        compact
        kind="image"
        label={`Ảnh lựa chọn ${index + 1}`}
        scopeKey={scopeKey}
        onClear={onClearMedia}
      />
    </AnimatedRow>
  );
}
