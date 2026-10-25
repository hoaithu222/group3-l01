import type { ReviewConfigDto } from '../../api/reviews.types';
import { useReviewSettingsForm } from '../../hooks/useReviewSettingsForm';
import type { ReviewLimits } from '../../schemas/review.schemas';
import { ReviewSettingsForm } from './ReviewSettingsForm';

export interface ReviewSettingsEditorProps {
  boardId: string;
  config: ReviewConfigDto;
  limits: ReviewLimits;
  /** `RES_003` — màn cha tải lại cấu hình để lấy `version` mới. */
  onConflict: () => void;
}

/**
 * Nối trạng thái sửa (`useReviewSettingsForm`) với form. Tách khỏi màn để nháp được khởi tạo MỘT LẦN từ cấu hình đã tải: màn chỉ dựng
 * component này sau khi có dữ liệu, và cấu hình tải lại sau đó KHÔNG ghi đè chữ người dùng đang sửa.
 */
export function ReviewSettingsEditor({ boardId, config, limits, onConflict }: ReviewSettingsEditorProps) {
  const form = useReviewSettingsForm({ boardId, config, limits, onConflict });
  return <ReviewSettingsForm config={config} form={form} limits={limits} />;
}
