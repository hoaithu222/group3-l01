import { Text } from 'react-native';

import type { MessageBodyProps } from '@/shared/message-extensions';
import { useFeature } from '@/shell/capabilities';

import { PollCard } from './PollCard';

/**
 * Thân bong bóng của tin `kind = 'POLL'` (khe `messageBody`). Cờ `polls` BẬT ⇒ thẻ khảo sát tương tác. Cờ TẮT/chưa biết ⇒ hiện CÂU HỎI như chữ thường (không lựa chọn, không bầu được):
 * tin đã đăng vẫn đọc được, nhưng app không dẫn người dùng vào các endpoint mà BE sẽ trả 404 `CFG_005`. (Renderer của khe là hàm không có hook nên cờ phải kiểm ở component này.)
 */
export function PollBody(props: MessageBodyProps) {
  const enabled = useFeature('polls') === true;
  if (!enabled) return <Text className="text-body-md text-fg-1">{props.message.content ?? ''}</Text>;
  return <PollCard {...props} />;
}
