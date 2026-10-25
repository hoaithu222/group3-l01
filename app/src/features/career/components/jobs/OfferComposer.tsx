import { useState } from 'react';
import { Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { AutoGrowTextInput } from '@/shared/ui/auto-grow-text-input';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { JOB_LIMITS } from '../../constants/recruiter.constants';

export interface OfferComposerProps {
  /** Thread đóng (chưa Quan tâm, bị khoá, công ty tạm ngưng, `RECR_008`) ⇒ THAY ô soạn bằng thông báo — không để ô nhập mà gửi luôn thất bại. */
  closed: boolean;
  /** Trả `true` khi tin được nhận (đã xoá nháp); `false` khi rỗng/quá dài. */
  onSend: (text: string) => boolean;
}

/** Cảnh báo đếm ký tự chỉ hiện khi gần trần — hiện mãi thì chật màn hình một ô soạn một dòng. */
const COUNTER_FROM = JOB_LIMITS.messageMax - 200;

/**
 * Ô soạn tin trong lời mời (app.md §3 "Trao đổi"): chỉ chữ, ≤ 2000 ký tự (đếm theo độ dài chuỗi như BE). `KeyboardStickyView` bám trên bàn phím, KHÔNG cộng
 * `insets.bottom` (do `Screen` lo) — cùng ô soạn bình luận của bảng công việc. Nháp giữ trong state màn, không lưu xuống máy (app.md §5).
 */
export function OfferComposer({ closed, onSend }: OfferComposerProps) {
  const [text, setText] = useState('');

  if (closed) {
    return (
      <View className="flex-row items-center gap-xs border-t border-divider-1 bg-bg-1 px-md py-sm">
        <Icon color="fg-2" name="lock" size={16} />
        <Text className="flex-1 text-caption-lg text-fg-2">
          Cuộc trao đổi đã đóng — bạn vẫn đọc lại được các tin cũ.
        </Text>
      </View>
    );
  }

  const length = text.trim().length;
  const over = length > JOB_LIMITS.messageMax;

  return (
    <KeyboardStickyView>
      <View className="border-t border-divider-1 bg-bg-1">
        <View className="flex-row items-end gap-xs px-md py-2xs">
          <View className="flex-1 rounded-md border-hairline border-border-1 bg-bg-input px-sm py-xs">
            <AutoGrowTextInput
              accessibilityLabel="Nội dung tin nhắn"
              className="text-body-lg text-fg-1"
              maxRows={5}
              placeholder="Nhắn tin cho doanh nghiệp…"
              value={text}
              onChangeText={setText}
            />
          </View>
          <Button
            accessibilityLabel="Gửi tin nhắn"
            disabled={length === 0 || over}
            iconLeft="circle-arrow-up"
            iconOnly
            size="sm"
            onPress={() => {
              if (onSend(text)) setText('');
            }}
          />
        </View>
        {length >= COUNTER_FROM ? (
          <Text
            className={
              over
                ? 'px-md pb-xs text-caption-sm text-error'
                : 'px-md pb-xs text-caption-sm text-fg-2'
            }
          >
            {`${String(length)}/${String(JOB_LIMITS.messageMax)}`}
          </Text>
        ) : null}
      </View>
    </KeyboardStickyView>
  );
}
