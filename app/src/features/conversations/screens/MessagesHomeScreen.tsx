import { useBreakpoint } from '@/shared/theme';

import { NoConversationSelected } from '../components/NoConversationSelected';
import { ConversationListScreen } from './ConversationListScreen';

/**
 * Màn của `messages/index`. Điện thoại: chính danh sách hội thoại. Máy tính bảng:
 * danh sách đã nằm ở cột TRÁI của `MessagesSplitLayout`, nên khung phải chỉ cần
 * lời nhắc chọn — hiện danh sách ở đây nữa là hai bản cạnh nhau.
 */
export function MessagesHomeScreen() {
  const { isTablet } = useBreakpoint();
  return isTablet ? <NoConversationSelected /> : <ConversationListScreen />;
}
