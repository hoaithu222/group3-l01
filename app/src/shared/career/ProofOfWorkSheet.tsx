import { Text, View } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraph } from '@/shared/ui/skeleton';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { ProofTask, SkillProof } from './skill-badge.types';
import { formatPoints, formatScore } from './skill-format';

export interface ProofOfWorkSheetProps {
  /** Tấm mở khi `visible` (kể cả lúc đang tải minh chứng). */
  visible: boolean;
  title: string;
  proof: SkillProof | undefined;
  loading: boolean;
  /** Không tải được (mất quyền/404/mạng) — hiện câu trung tính + "Thử lại". */
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
}

function taskLine(t: ProofTask): string {
  const parts = [`${formatPoints(t.storyPoints)} điểm`, formatDate(t.completedAt)];
  if (t.reviewScore !== null) parts.push(`review ${formatScore(t.reviewScore)}`);
  if (t.workspaceName) parts.push(t.workspaceName);
  return parts.join(' · ');
}

/**
 * Minh chứng của một huy hiệu (app.md p6-06 §3 `ProofOfWorkSheet`, đặc tả gốc `ProofOfWorkModal`): tổng task · điểm · review TB, danh sách ≤ 5 task
 * (tiêu đề hoặc "Task ẩn tiêu đề" — SERVER quyết theo quyền riêng tư, không tự đoán), ghi rõ "do hệ thống ghi nhận". Chỉ HIỂN THỊ: nơi gọi tải dữ liệu.
 *
 * ⚠️ Tấm `padded={false}` + `SheetList` + `ListItem`: task là HÀNG của danh sách — kẻ ngăn GIỮA các hàng, bỏ ở hàng cuối.
 * ❌ Bản trước tự dựng hàng bằng `border-b` nên hàng CUỐI vẫn mang kẻ, dính vào câu chú thích bên dưới. Khối chữ ngoài danh
 * sách tự `px-md` (thân tấm tràn viền không còn lề 16).
 */
export function ProofOfWorkSheet({
  error,
  loading,
  onClose,
  onRetry,
  proof,
  title,
  visible,
}: ProofOfWorkSheetProps) {
  let body;
  if (proof) {
    body = (
      <View className="gap-sm pb-md">
        <Text className="px-md text-body-md text-fg-1">
          {`${String(proof.tasksDone)} task · ${formatPoints(proof.storyPoints)} điểm · review TB ${formatScore(proof.avgPeerScore)}`}
        </Text>
        <SheetList accessibilityLabel="Task minh chứng" accessibilityRole="list">
          {proof.tasks.map((t, i) => (
            <ListItem
              key={`${t.completedAt}-${String(i)}`}
              description={taskLine(t)}
              divider={i < proof.tasks.length - 1}
              emphasis="title"
              label={t.title ?? 'Task ẩn tiêu đề'}
              labelNumberOfLines={2}
            />
          ))}
        </SheetList>
        <Text className="px-md text-caption-lg text-fg-2">
          Dữ liệu do hệ thống ghi nhận từ task đã hoàn thành, không tự khai.
        </Text>
      </View>
    );
  } else if (error) {
    // ✅ `EmptyState` gọn: câu TRUNG TÍNH (không lộ lý do quyền riêng tư) + "Thử lại" đúng dáng nút của trạng thái lỗi mọi nơi khác.
    body = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry, variant: 'secondary' }]}
        description="Không xem được minh chứng này."
        icon="alert-information"
        size="compact"
        tone="neutral"
      />
    );
  } else if (loading) {
    // ✅ Khung chờ theo HÌNH của hàng task (tiêu đề + dòng phụ) — ❌ bản trước là hai khối xám cao thấp không khớp gì cả.
    body = (
      <View accessibilityLabel="Đang tải minh chứng" className="gap-md px-md pb-md">
        <SkeletonParagraph />
        <SkeletonParagraph />
        <SkeletonParagraph />
      </View>
    );
  }

  return (
    <BottomSheet padded={false} scrollable title={title} visible={visible} onClose={onClose}>
      {body}
    </BottomSheet>
  );
}
