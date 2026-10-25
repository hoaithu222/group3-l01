import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';

import { INVITE_EMAILS_MAX } from '../api';
import { hasEmailSeparator, isValidEmail, mergeEmails } from '../utils/email.utils';

export interface EmailChipsInputProps {
  disabled?: boolean;
  emails: string[];
  max?: number;
  /** Lỗi cấp form (vd 429 đếm ngược) — hiện dưới ô nhập. */
  message?: string;
  onChange: (emails: string[]) => void;
}

/**
 * Nhập NHIỀU email (app.md p3-04 §2): gõ/dán, tách bằng dấu phẩy · chấm phẩy ·
 * khoảng trắng · xuống dòng · Enter, mỗi địa chỉ thành một chip.
 *
 * Địa chỉ sai định dạng KHÔNG bị lặng lẽ bỏ — nó vẫn thành chip, kèm icon cảnh
 * báo VÀ chữ "sai định dạng" (không chỉ màu — `AGENTS.md`), để người dùng thấy
 * và bỏ/sửa trước khi gửi. Nơi gọi khoá nút Gửi khi còn chip sai
 * (`hasInvalidEmail`).
 *
 * ⚠️ Commit cả lúc MẤT FOCUS: người dùng gõ xong địa chỉ cuối rồi bấm thẳng nút
 * Gửi (không dấu phẩy, không Enter) — thiếu nhánh này thì địa chỉ đó nằm trong
 * ô nhập mà không được gửi, và không có dấu hiệu nào báo.
 */
export function EmailChipsInput({ disabled, emails, max = INVITE_EMAILS_MAX, message, onChange }: EmailChipsInputProps) {
  const [draft, setDraft] = useState('');
  const [overflow, setOverflow] = useState(false);

  function commit(text: string): void {
    setDraft('');
    if (!text.trim()) return;
    const result = mergeEmails(emails, text, max);
    setOverflow(result.overflow);
    if (result.emails.length !== emails.length) onChange(result.emails);
  }

  function remove(email: string): void {
    setOverflow(false);
    onChange(emails.filter((item) => item !== email));
  }

  return (
    <View className="gap-sm">
      <Input
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        disabled={disabled}
        hint={`${emails.length}/${max}`}
        keyboardType="email-address"
        label="Email người được mời"
        message={overflow ? `Tối đa ${max} email mỗi lần gửi.` : message}
        placeholder="ten@congty.com, ten2@congty.com"
        returnKeyType="done"
        textContentType="emailAddress"
        value={draft}
        onBlur={() => commit(draft)}
        onChangeText={(text) => (hasEmailSeparator(text) ? commit(text) : setDraft(text))}
        onSubmitEditing={() => commit(draft)}
      />

      {emails.length > 0 ? (
        <View className="flex-row flex-wrap gap-xs">
          {emails.map((email) => {
            const valid = isValidEmail(email);
            return (
              <Chip
                key={email}
                label={valid ? email : `${email} · sai định dạng`}
                leading={valid ? undefined : <Icon color="error" name="alert-warning" size="sm" />}
                size="sm"
                trailing={
                  <Pressable
                    accessibilityLabel={`Bỏ ${email}`}
                    accessibilityRole="button"
                    disabled={disabled}
                    hitSlop={12}
                    onPress={() => remove(email)}
                  >
                    <Icon name="cancel" size="sm" />
                  </Pressable>
                }
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
