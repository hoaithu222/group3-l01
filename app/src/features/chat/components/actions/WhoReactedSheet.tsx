import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';
import { LoadingMore } from '@/shared/ui/progress';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { ReactorEntry, ResolveChatAuthor } from '../../api/chat.types';

export interface WhoReactedSheetProps {
  visible: boolean;
  emoji: string | undefined;
  onClose: () => void;
  resolveAuthor?: ResolveChatAuthor;
  listReactors: (
    emoji: string,
    cursor?: string,
  ) => Promise<{ data: ReactorEntry[]; cursor: string | null }>;
}

/**
 * Giữ chip reaction → danh sách người đã thả, cursor (app.md §3).
 *
 * Bốn trạng thái, mỗi cái một dáng riêng (bản cũ chỉ có vòng quay "đang tải thêm" cho CẢ lần đầu, và danh sách rỗng/lỗi là một tấm trắng):
 * tải trang đầu → khung xương hàng người · lỗi trang đầu → `EmptyState` + "Thử lại" · rỗng → `EmptyState` · trang sau → `LoadingMore`.
 * Tấm danh sách: `padded={false}` + `SheetList` (lề 16) + hàng `ListItem` kẻ ngăn — cùng dáng "Đã xem" của hội thoại.
 */
export function WhoReactedSheet({
  visible,
  emoji,
  onClose,
  resolveAuthor,
  listReactors,
}: WhoReactedSheetProps) {
  const [entries, setEntries] = useState<ReactorEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Tăng để tải lại trang đầu ("Thử lại") — effect bên dưới chạy lại theo nó. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible || !emoji) return undefined;
    // ⚠️ `setTimeout(…, 0)` CỐ Ý — React Compiler (`react-hooks/set-state-in-effect`)
    // chặn `setState` ĐỒNG BỘ ngay trong thân effect, cùng cách `use-voice-recorder.ts`
    // đã xử lý; dời sang tác vụ kế tiếp không đổi hành vi quan sát được.
    const timer = setTimeout(() => {
      // Xoá danh sách cũ: mở lại cho emoji KHÁC mà vẫn hiện người của emoji trước (tới khi trang mới về) là thông tin sai.
      setEntries([]);
      setCursor(null);
      setFailed(false);
      setLoading(true);
      listReactors(emoji)
        .then((page) => {
          setEntries(page.data);
          setCursor(page.cursor);
        })
        // `.finally` KHÔNG nuốt reject — không `.catch` thì mất mạng là Promise reject vô chủ (LogBox đỏ ở bản dev).
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, emoji, listReactors, attempt]);

  const loadMore = () => {
    if (!emoji || !cursor) return;
    setLoading(true);
    listReactors(emoji, cursor)
      .then((page) => {
        setEntries((prev) => [...prev, ...page.data]);
        setCursor(page.cursor);
      })
      // Lỗi trang SAU: giữ nguyên danh sách đã có, nút "Xem thêm" còn đó để thử lại.
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  const firstPageLoading = loading && entries.length === 0;

  return (
    <BottomSheet
      padded={false}
      scrollable
      title={emoji ? `Đã thả ${emoji}` : 'Đã thả cảm xúc'}
      visible={visible}
      onClose={onClose}
    >
      {firstPageLoading ? (
        <View
          accessibilityLabel="Đang tải danh sách người đã thả cảm xúc"
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          accessible
          className="gap-md px-md pb-md pt-xs"
        >
          <SkeletonParagraphWithIcon />
          <SkeletonParagraphWithIcon />
          <SkeletonParagraphWithIcon />
        </View>
      ) : entries.length === 0 ? (
        failed ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => setAttempt((n) => n + 1) }]}
            description="Kiểm tra kết nối rồi thử lại."
            icon="alert-warning"
            size="compact"
            title="Không tải được danh sách"
            tone="danger"
          />
        ) : (
          <EmptyState
            description="Chưa có ai thả cảm xúc này."
            icon="user"
            size="compact"
            tone="neutral"
          />
        )
      ) : (
        <SheetList accessibilityRole="list" className="pb-md">
          {entries.map((entry, index) => {
            // Ảnh THẬT của người thả (danh bạ màn cha đã có `avatarUrl`) — chữ viết tắt đỡ khi không có ảnh; không gọi thêm API nào.
            const author = resolveAuthor?.(entry.userId);
            const name = author?.name ?? 'Thành viên';
            return (
              <ListItem
                key={entry.userId}
                // Hàng chỉ để đọc (không `onPress`) mặc định `items-start` — canh giữa để tên thẳng tâm ảnh 32dp.
                className="items-center"
                divider={index < entries.length - 1}
                emphasis="title"
                label={name}
                leading={
                  <Avatar
                    name={name}
                    size="sm"
                    source={author?.avatarUrl ? { uri: author.avatarUrl } : undefined}
                  />
                }
              />
            );
          })}
          {loading ? (
            <LoadingMore label="Đang tải thêm người phản ứng" />
          ) : cursor ? (
            <Button
              label="Xem thêm"
              pressableClassName="self-center"
              size="sm"
              variant="tertiary"
              onPress={loadMore}
            />
          ) : null}
        </SheetList>
      )}
    </BottomSheet>
  );
}
