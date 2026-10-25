import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { progressStep } from './progress-step.styles';

export type ProgressStatus = 'done' | 'current' | 'pending' | 'error';

/**
 * Trạng thái đọc thành lời. ⛔ Bắt buộc, không phải trang trí: người khiếm thị
 * KHÔNG thấy được màu chấm — với họ mọi bước đều giống nhau nếu chỉ đọc tiêu đề.
 */
const STATUS_LABEL: Record<ProgressStatus, string> = {
  done: 'đã xong',
  current: 'đang xử lý',
  pending: 'chưa thực hiện',
  error: 'không thành công',
};

/**
 * Một bước của dòng thời gian dọc. Công thức class và số đo tương phản của từng
 * trạng thái nằm ở `progress-step.styles.ts`.
 *
 * ⛔ Bước CUỐI không được vẽ đoạn nối. Vẽ thừa thì dưới chấm cuối lòi ra một
 * đoạn kẻ cụt lửng, nhìn là thấy ngay và trông như dữ liệu bị cắt mất.
 */
export interface ProgressStepProps {
  className?: string;
  description?: ReactNode;
  /** Số thứ tự đọc lên cho trình đọc màn hình ("Bước 2, …"). `Progress` tự truyền. */
  index?: number;
  /** ⛔ Bước cuối phải bật cờ này, nếu không đoạn nối thừa lòi ra dưới chấm cuối. */
  isLast?: boolean;
  /** Dòng phụ cỡ nhỏ — thời điểm xử lý, mã hồ sơ. */
  meta?: ReactNode;
  status?: ProgressStatus;
  title: string;
}

export function ProgressStep({
  className,
  description,
  index,
  isLast = false,
  meta,
  status = 'pending',
  title,
}: ProgressStepProps) {
  const styles = progressStep({ last: isLast, status });

  // Chỉ gộp được phần chữ THẬT. `description`/`meta` nhận ReactNode để nhấn
  // mạnh giữa câu, mà nhãn trợ năng phải là chuỗi phẳng.
  const step = index === undefined ? '' : `Bước ${index}, `;
  const detail = typeof description === 'string' ? `. ${description}` : '';
  const note = typeof meta === 'string' ? `. ${meta}` : '';

  return (
    <View
      accessibilityLabel={`${step}${STATUS_LABEL[status]}: ${title}${detail}${note}`}
      accessibilityRole="text"
      /**
       * Gộp cả hàng thành MỘT nút trợ năng. Không gộp thì TalkBack đọc rời rạc
       * "Thẩm định" rồi "Đã xử lý" ở hai lần vuốt, và nhãn trạng thái ở trên vô
       * dụng vì nó gắn với node cha mà không ai dừng lại ở đó.
       */
      accessible
      className={styles.root({ className })}
    >
      <View
        // Chấm và đoạn kẻ là trang trí thuần — trạng thái đã nằm trong nhãn ở trên.
        accessibilityElementsHidden
        className={styles.rail()}
        importantForAccessibility="no-hide-descendants"
      >
        {/* ⛔ `collapsable={false}`: quầng (chỉ `current`) và lõi (không có ở `pending`) chỉ có nền ở MỘT SỐ trạng thái — bước
            chuyển `pending → current` tại chỗ thì Android dựng view không kèm `rounded-full` ⇒ chấm vuông. */}
        <View className={styles.dotHalo()} collapsable={false}>
          <View className={styles.dotRing()}>
            <View className={styles.dotCore()} collapsable={false} />
          </View>
        </View>

        {isLast ? null : <View className={styles.connector()} />}
      </View>

      <View className={styles.content()}>
        <Text className={styles.title()}>{title}</Text>
        {description ? <Text className={styles.description()}>{description}</Text> : null}
        {meta ? <Text className={styles.meta()}>{meta}</Text> : null}
      </View>
    </View>
  );
}
