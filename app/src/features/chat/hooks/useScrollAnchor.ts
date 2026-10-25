import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';

import { STICK_TO_BOTTOM_THRESHOLD_PX } from '../chat.constants';

export interface UseScrollAnchorResult<T> {
  listRef: React.RefObject<FlashListRef<T> | null>;
  isAtBottom: boolean;
  newCount: number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Gọi khi CHÍNH MÌNH vừa chèn một bản tạm/tin mới vào cuối (app.md §7 "chỉ tự dính cuối khi đã ở cuối"). */
  notifyAppended: () => void;
  scrollToBottom: () => void;
}

/**
 * "Ở cuối?", số tin mới, cuộn tới cuối — app.md §4 (`useScrollAnchor.ts`).
 * KHÔNG tự cuộn khi người dùng đang đọc tin cũ (TX-07): chỉ `scrollToBottom()`
 * tự động khi ĐANG ở cuối (`isAtBottom`), người gọi (`ChatRoom`) tự quyết định
 * gọi hay không dựa trên giá trị đó — hook này không tự ý cuộn.
 */
export function useScrollAnchor<T>(): UseScrollAnchorResult<T> {
  const listRef = useRef<FlashListRef<T>>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const atBottom = distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
    setIsAtBottom(atBottom);
    if (atBottom) setNewCount(0);
  }, []);

  const notifyAppended = useCallback(() => {
    setNewCount((count) => (isAtBottom ? count : count + 1));
  }, [isAtBottom]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    setNewCount(0);
  }, []);

  /**
   * Đóng bàn phím (vd. sau khi gửi rồi tắt bàn phím) làm khung nhìn cao thêm — `maintainVisibleContentPosition`
   * giữ nguyên `contentOffset` nên phần cao thêm đó lộ ra THÀNH KHOẢNG TRỐNG dưới tin vừa gửi thay vì đẩy nó
   * xuống sát đáy. Chỉ tự cuộn khi ĐANG ở cuối (cùng luật "chỉ tự dính cuối khi đã ở cuối" — TX-07): đang đọc
   * tin cũ mà tắt bàn phím (vd. gõ dở rồi thôi) thì không được kéo tuột về tin mới nhất.
   */
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (isAtBottom) scrollToBottom();
    });
    return () => sub.remove();
  }, [isAtBottom, scrollToBottom]);

  return { listRef, isAtBottom, newCount, onScroll, notifyAppended, scrollToBottom };
}
