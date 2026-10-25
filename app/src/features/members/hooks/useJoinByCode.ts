import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { inviteHref } from '../utils/invite-routes';
import { parseInviteInput } from '../utils/parse-invite-input';

const INVALID_INVITE_MESSAGE = 'Liên kết hoặc mã mời không hợp lệ.';

/**
 * Trạng thái ô "Tham gia nhóm": nội dung dán/gõ, lỗi ngay dưới ô, nút dán và nút Tiếp tục.
 *
 * Không gọi API ở đây: xem trước và tham gia là việc của màn đích (`InviteLandingScreen` /
 * `AcceptInvitationScreen`) — cùng đường với deep link, nên lỗi 404/410 hiện ở đúng một chỗ.
 */
export function useJoinByCode() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** Lỗi cũ nói về nội dung cũ — để nó lại lúc người dùng đang sửa là báo sai ngay khi họ vừa gõ đúng. */
  function change(next: string): void {
    setValue(next);
    setError(null);
  }

  async function paste(): Promise<void> {
    let text = '';
    try {
      text = (await Clipboard.getStringAsync()).trim();
    } catch {
      showToast('error', 'Không đọc được bộ nhớ tạm.');
      return;
    }
    // iOS 16+ trả chuỗi rỗng cả khi người dùng từ chối quyền dán — không phân biệt được với clipboard trống.
    if (!text) {
      showToast('info', 'Bộ nhớ tạm đang trống.');
      return;
    }
    change(text);
  }

  function submit(): void {
    const parsed = parseInviteInput(value);
    if (!parsed) {
      setError(INVALID_INVITE_MESSAGE);
      return;
    }
    router.push(inviteHref(parsed));
  }

  return { change, error, paste, submit, value };
}
