import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Khung xương của widget Trang chủ lúc TẢI LẦN ĐẦU: giữ nguyên tiêu đề nhóm (khỏi nhảy bố cục khi dữ liệu về) và một khối
 * thẻ. Chỉ dùng khi đang tải — lỗi/không có dữ liệu thì widget trả `null`, không hiện lỗi ồn ào trên Trang chủ.
 */
export function HomeWidgetSkeleton({ title }: { title: string }) {
  return (
    <Section title={title}>
      <Skeleton variant="card" />
    </Section>
  );
}
