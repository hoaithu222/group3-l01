import { type ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { ProgressStep, type ProgressStatus } from './ProgressStep';

export interface ProgressStepItem {
  description?: ReactNode;
  /** ⛔ Ổn định theo dữ liệu (mã hồ sơ, mã bước) — đừng dùng chỉ số mảng làm key. */
  id: string;
  meta?: ReactNode;
  status?: ProgressStatus;
  title: string;
}

export interface ProgressProps {
  className?: string;
  steps: readonly ProgressStepItem[];
}

/**
 * Dòng thời gian trạng thái theo chiều DỌC (stepper), không phải thanh tiến độ
 * ngang — mỗi bước có tiêu đề, mô tả và một đoạn kẻ nối xuống bước sau.
 *
 * ⚠️ Bước cuối do component này tự nhận ra và tắt đoạn nối. Nếu bạn tự dựng
 * bằng `<ProgressStep>` rời thì PHẢI tự truyền `isLast` cho bước cuối, không
 * thì dưới chấm cuối lòi ra một đoạn kẻ cụt.
 *
 * @example
 *   <Progress
 *     steps={[
 *       { id: 'dang-ky', status: 'done', title: 'Đăng ký' },
 *       { id: 'tham-dinh', description: 'Bộ phận tiếp nhận xử lý hồ sơ', status: 'current', title: 'Thẩm định' },
 *       { id: 'giai-ngan', description: 'Chưa giải ngân', status: 'pending', title: 'Giải ngân' },
 *     ]}
 *   />
 */
export function Progress({ className, steps }: ProgressProps) {
  const lastIndex = steps.length - 1;

  return (
    // `list` giúp trình đọc màn hình xướng "danh sách, 6 mục" trước khi đọc từng
    // bước — người dùng biết còn bao nhiêu bước nữa thay vì vuốt tới lúc hết.
    <View accessibilityRole="list" className={cn('w-full', className)}>
      {steps.map((step, index) => (
        <ProgressStep
          key={step.id}
          description={step.description}
          index={index + 1}
          isLast={index === lastIndex}
          meta={step.meta}
          status={step.status}
          title={step.title}
        />
      ))}
    </View>
  );
}
