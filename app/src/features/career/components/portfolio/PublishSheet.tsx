import { useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';

import type { Portfolio, PortfolioProject } from '../../api/portfolio.types';
import { usePublishPortfolio } from '../../queries/portfolio.mutations';
import { isVersionConflict, portfolioErrorMessage } from '../../utils/portfolio-errors';
import { canPublish, publishChecklist } from '../../utils/portfolio-publish-check';
import { PublishSummary } from './PublishSummary';

export interface PublishSheetProps {
  visible: boolean;
  portfolio: Portfolio;
  projects: PortfolioProject[];
  /** Đã mở "Xem trước" trong phiên này (khuyến nghị, không bắt buộc). */
  previewed: boolean;
  onClose: () => void;
}

/**
 * Tấm "Công khai" / "Cập nhật trang" (app.md p6-07 §3 `PublishSheet`): checklist tự động (≥ 1 dự án đang hiện, có tên hiển thị — bắt buộc; đã xem trước — khuyến nghị), TÓM TẮT thứ sẽ lên
 * trang công khai ("số liệu 3 dự án, 4 huy hiệu, giới thiệu, 2 liên kết"), nhắc noindex, rồi nút. Bấm ⇒ BE nhận 202 và dựng trang NỀN: tấm đóng, tiến độ hiện ở thẻ trạng thái (socket, poll dự phòng).
 * Lỗi giữ lại TRONG tấm (`PORT_008` bị gỡ · `PORT_009` đang dựng · `PORT_010` chỉ ra mục còn trống) — toast tự tắt sau 4 giây trong khi người dùng cần đọc để sửa.
 *
 * ✅ Nút chính ở `footer` (đứng yên, luôn trong tầm ngón cái — trước đây nằm CUỐI vùng cuộn, phải kéo qua cả checklist mới thấy), lỗi
 * ở khe `alert` (ghim dưới tiêu đề), câu "cần mạng" là `hint` ngay trên nút nó giải thích.
 */
export function PublishSheet({
  onClose,
  portfolio,
  previewed,
  projects,
  visible,
}: PublishSheetProps) {
  const publish = usePublishPortfolio();
  const offline = useConnectionState() === 'offline';
  const [error, setError] = useState<string | null>(null);

  const visibleProjects = projects.filter((project) => project.visible).length;
  const checklist = publishChecklist({
    displayName: portfolio.displayName,
    previewed,
    visibleProjects,
  });
  const updating = portfolio.status === 'PUBLISHED' && !portfolio.takenDown;

  const close = () => {
    setError(null);
    onClose();
  };

  const submit = () => {
    setError(null);
    publish.mutate(portfolio.version, {
      onError: (failure) =>
        setError(
          isVersionConflict(failure)
            ? 'Hồ sơ vừa được thay đổi ở nơi khác. Đã tải bản mới — hãy kiểm tra rồi bấm lại.'
            : portfolioErrorMessage(failure),
        ),
      onSuccess: close,
    });
  };

  return (
    <BottomSheet
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      footer={
        <SheetActions
          hint={offline ? 'Cần kết nối mạng để công khai.' : undefined}
          primary={{
            disabled: !canPublish(checklist) || offline,
            label: updating ? 'Cập nhật trang' : 'Công khai',
            loading: publish.isPending,
            onPress: submit,
          }}
        />
      }
      scrollable
      title={updating ? 'Cập nhật trang' : 'Công khai hồ sơ'}
      visible={visible}
      onClose={close}
    >
      <View className="gap-md">
        <View className="gap-xs">
          {checklist.map((item) => (
            <View
              key={item.key}
              accessibilityLabel={`${item.label}: ${item.ok ? 'đã đạt' : 'chưa đạt'}`}
              accessible
              className="flex-row items-start gap-xs"
            >
              <Icon
                color={item.ok ? 'success' : item.blocking ? 'error' : 'fg-2'}
                name={item.ok ? 'checkmark-circle' : 'alert-warning'}
                size="sm"
              />
              <Text className="flex-1 text-body-md text-fg-1">{item.label}</Text>
            </View>
          ))}
        </View>

        <PublishSummary portfolio={portfolio} visibleProjects={visibleProjects} />
        <Text className="text-body-md text-fg-2">
          Số liệu được chụp lại đúng lúc công khai, và trang ghi rõ thời điểm cập nhật.
        </Text>

        <Alert
          description={
            portfolio.seoIndexable
              ? 'Trang cho phép công cụ tìm kiếm hiển thị. Đổi ở màn Giao diện.'
              : 'Mặc định trang KHÔNG hiện trên công cụ tìm kiếm — chỉ người có link mới thấy. Bật ở màn Giao diện nếu bạn muốn.'
          }
          tone="info"
        />
      </View>
    </BottomSheet>
  );
}
