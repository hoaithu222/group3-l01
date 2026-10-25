/**
 * Màn "chưa hỏi được máy chủ" — hiện khi khôi phục phiên sau F5 gặp mất mạng / BE 5xx
 * (`status === 'unavailable'`) trong lúc trình duyệt CÓ dấu hiệu từng đăng nhập.
 *
 * Vì sao không đá ra trang đăng nhập: không biết phiên còn hay chết. Một cú chập mạng lúc
 * mở tab mà bị bắt đăng nhập lại là lỗi kinh điển (`unavailable ≠ unauthenticated`); mạng
 * về là lượt thử kế tiếp vào thẳng ứng dụng, không mất gì.
 */
import { memo, useCallback, useEffect, useState } from 'react';

import { purgeAuthSession } from '@/core/api/session';
import { Button, EmptyState } from '@/shared/ui';
import { restoreSession } from '../service/session-restore';

/** Tự thử lại im lặng sau mỗi ngần này (ms) — người dùng khỏi phải bấm khi mạng vừa về. */
const AUTO_RETRY_MS = 15_000;

const SessionUnavailableState = memo(function SessionUnavailableState() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => void restoreSession(), AUTO_RETRY_MS);
    return () => window.clearInterval(id);
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await restoreSession();
    } finally {
      setRetrying(false);
    }
  }, []);

  // Bỏ hồ sơ đã nhớ → `AuthGuard` đưa về trang đăng nhập.
  const handleSignInAgain = useCallback(() => purgeAuthSession(null, { broadcast: false }), []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-base p-4">
      <EmptyState
        action={
          <div className="flex items-center gap-2">
            <Button loading={retrying} variant="primary" onClick={handleRetry}>
              Thử lại
            </Button>
            <Button variant="stroke" onClick={handleSignInAgain}>
              Đăng nhập lại
            </Button>
          </div>
        }
        description="Phiên đăng nhập của bạn vẫn được giữ. Hệ thống sẽ tự thử lại; bạn cũng có thể thử lại ngay."
        icon="triangle-exclamation-bold"
        iconColor="yellow"
        size="lg"
        title="Không kết nối được máy chủ"
      />
    </div>
  );
});

export default SessionUnavailableState;
