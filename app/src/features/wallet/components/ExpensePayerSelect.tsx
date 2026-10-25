import { useState } from 'react';

import { Select, SelectSheet } from '@/shared/ui/select';

import type { WalletMember } from '../api';

export interface ExpensePayerSelectProps {
  disabled?: boolean;
  members: readonly WalletMember[];
  message?: string;
  value: string;
  onChange: (userId: string) => void;
}

/**
 * Người trả — mặc định là tôi. Bộ chọn tìm được theo tên (`SelectSheet searchable` là ô
 * tìm UNCONTROLLED, IME-safe: gõ Telex không mất dấu).
 */
export function ExpensePayerSelect({
  disabled,
  members,
  message,
  onChange,
  value,
}: ExpensePayerSelectProps) {
  const [open, setOpen] = useState(false);
  const current = members.find((member) => member.userId === value);

  return (
    <>
      <Select
        disabled={disabled}
        label="Người trả"
        message={message}
        messageTone="error"
        placeholder="Chọn người trả"
        required
        value={
          current
            ? `${current.displayName ?? current.name}${current.isMe ? ' (Bạn)' : ''}`
            : undefined
        }
        onPress={() => setOpen(true)}
      />
      <SelectSheet
        options={members.map((member) => ({
          label: `${member.displayName ?? member.name}${member.isMe ? ' (Bạn)' : ''}`,
          value: member.userId,
        }))}
        searchable
        searchPlaceholder="Tìm thành viên"
        title="Ai đã trả tiền?"
        value={value}
        visible={open}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
