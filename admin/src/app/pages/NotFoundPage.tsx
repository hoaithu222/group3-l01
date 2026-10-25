import { memo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { Button, Heading, Text } from '@/shared/ui';

const NotFoundPage = memo(function NotFoundPage() {
  const navigate = useNavigate();
  const handleBack = useCallback(() => navigate(-1), [navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg-base p-4 text-center">
      <Text className="text-h1-bold text-fg-5" size="extraLarge">
        404
      </Text>
      <Heading size="small">Không tìm thấy trang</Heading>
      <Text className="max-w-md" size="small" skin="muted">
        Trang bạn tìm không tồn tại hoặc đã được chuyển đi nơi khác.
      </Text>
      <div className="flex gap-2">
        {/* Quay lại là lệnh trên LỊCH SỬ trình duyệt, không phải một URL —
            nên đây đúng là <button>, không phải <Link>. */}
        <Button variant="stroke" onClick={handleBack}>
          Quay lại
        </Button>
        {/* Về trang chủ ĐI TỚI một URL thật → phải là <Link> để chuột phải /
            Ctrl+click mở tab mới được. Xem docs/rules/navigable-controls.md */}
        <Button asChild variant="primary">
          <Link to={PATHS.HOME}>Về trang chủ</Link>
        </Button>
      </div>
    </div>
  );
});

export default NotFoundPage;
