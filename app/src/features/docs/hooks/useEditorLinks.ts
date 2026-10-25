import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { showToast } from '@/shared/utils/toast.utils';

/**
 * Chạm liên kết trong tài liệu (chế độ chỉ đọc — bridge `openLink`): GIỮ URL đó lại, hỏi người dùng (Dialog) rồi mới mở ngoài app.
 * Không bao giờ mở thẳng: liên kết do người khác soạn có thể dẫn tới trang lừa đảo. http(s) mở bằng trình duyệt trong app
 * (`expo-web-browser` — không dùng chung cookie đăng nhập của app), `mailto:`/`tel:` giao cho hệ điều hành. URL đã qua `isSafeLinkUrl`
 * ở `parseEditorMessage`.
 */
export function useEditorLinks() {
  const [pending, setPending] = useState<string | null>(null);

  const confirm = useCallback(() => {
    const url = pending;
    setPending(null);
    if (!url) return;
    const open = /^https?:/i.test(url) ? WebBrowser.openBrowserAsync(url) : Linking.openURL(url);
    Promise.resolve(open).catch(() => showToast('error', 'Không mở được liên kết này.'));
  }, [pending]);

  return { confirm, dismiss: () => setPending(null), pending, request: setPending };
}
