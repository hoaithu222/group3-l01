import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

/**
 * Hỏi "Bỏ thay đổi chưa lưu?" trước khi rời trình soạn (app.md §5 `useRecapDraftGuard`) — nút quay lại trên thanh tiêu đề VÀ phím Back
 * cứng của Android. Không có gì chưa lưu thì rời ngay. Nháp không lưu bền trên máy (riêng tư), nên hộp thoại này là lớp giữ duy nhất.
 */
export function useRecapDraftGuard(unsaved: boolean, leave: () => void) {
  const [asking, setAsking] = useState(false);

  const requestLeave = useCallback(() => {
    if (unsaved) setAsking(true);
    else leave();
  }, [leave, unsaved]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!unsaved) return false;
      setAsking(true);
      return true;
    });
    return () => sub.remove();
  }, [unsaved]);

  return {
    asking,
    cancel: () => setAsking(false),
    confirm: () => {
      setAsking(false);
      leave();
    },
    requestLeave,
  };
}
