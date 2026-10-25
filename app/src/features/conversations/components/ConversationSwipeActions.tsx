import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon, type IconName } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { useMyConversationSettings } from '../hooks/useMyConversationSettings';
import { getErrorCode } from '../utils/error-details';
import { ClearHistoryConfirmSheet } from './ClearHistoryConfirmSheet';
import { ConversationRow, type ConversationRowProps } from './ConversationRow';
import { ConversationNotifySheet } from './ConversationNotifySheet';

const ACTION_WIDTH = 76;

/**
 * Ba tông màu CỐ ĐỊNH — ⛔ KHÔNG ghép `bg-${color}` động: NativeWind quét
 * chuỗi TĨNH trong mã nguồn để sinh CSS, lớp ghép lúc chạy không có class nào
 * được sinh ra (mục 1 skill `ui-component`). Chữ/icon dùng ĐÚNG `*-fg` cùng
 * cặp với nền `action-*` (mục 3 skill đó) — không dùng chung `fg-inverse` cho
 * cả ba, vì `action-error-fg` (tối: `#1F0404`) khác `fg-inverse` (tối:
 * `#08120F`) — cặp nào không đúng thì độ tương phản đo được không còn đúng.
 */
const TONE_CLASS: Record<'accent' | 'base' | 'error', { root: string; text: string; fg: 'action-accent-fg' | 'action-fg' | 'action-error-fg' }> = {
  accent: { root: 'items-center justify-center gap-3xs bg-action-accent', text: 'text-caption-sm text-action-accent-fg', fg: 'action-accent-fg' },
  base: { root: 'items-center justify-center gap-3xs bg-action-base', text: 'text-caption-sm text-action-fg', fg: 'action-fg' },
  error: { root: 'items-center justify-center gap-3xs bg-action-error', text: 'text-caption-sm text-action-error-fg', fg: 'action-error-fg' },
};

function SwipeActionButton({ tone, icon, label, onPress }: { tone: keyof typeof TONE_CLASS; icon: IconName; label: string; onPress: () => void }) {
  const { root, text, fg } = TONE_CLASS[tone];
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" className={root} style={{ width: ACTION_WIDTH }} onPress={onPress}>
      <Icon color={fg} name={icon} size={20} />
      <Text className={text}>{label}</Text>
    </Pressable>
  );
}

/**
 * Hàng của bảng "Tuỳ chọn" (nhấn giữ) — CÙNG dáng hàng `ActionMenuSheet` (`ListItem` ≥ 48dp, icon `fg-2`, kẻ ngăn; `danger` chữ + icon
 * đỏ) để menu này trông như mọi menu hành động khác. Không dùng thẳng `ActionMenuSheet`: nó hoãn `onPress` tới khi tấm đóng xong, còn
 * ở đây vài hàng phải mở tấm KHÁC ngay (Thông báo, xác nhận xoá).
 */
function MenuRow({ divider = true, icon, label, tone = 'default', onPress }: { divider?: boolean; icon: IconName; label: string; tone?: 'danger' | 'default'; onPress: () => void }) {
  const danger = tone === 'danger';
  return (
    <ListItem
      divider={divider}
      emphasis={danger ? 'danger' : 'title'}
      label={label}
      leading={<Icon color={danger ? 'error' : 'fg-2'} name={icon} />}
      onPress={onPress}
    />
  );
}

export type ConversationSwipeActionsProps = Omit<ConversationRowProps, 'onLongPress'>;

/**
 * app.md §3 "Swipe" — trái→phải: Ghim/Bỏ ghim · Đánh dấu chưa đọc; phải→trái:
 * Tắt tiếng (sheet) · Lưu trữ · Xoá (xác nhận phía tôi). Nhấn giữ mở CÙNG bảng
 * hành động (a11y — vuốt không phải ai cũng thao tác được).
 */
export function ConversationSwipeActions({ item, ...rowProps }: ConversationSwipeActionsProps) {
  const ref = useRef<Swipeable>(null);
  const settings = useMyConversationSettings(item.id);
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  function close(): void {
    ref.current?.close();
  }

  function togglePin(): void {
    settings.pin(!item.pinnedAt);
    if (getErrorCode(settings.error) === 'CONV_009') showToast('error', 'Tối đa 20 cuộc trò chuyện ghim');
    close();
    setMenuOpen(false);
  }

  function toggleUnread(): void {
    settings.markUnread(!item.markedUnread);
    close();
    setMenuOpen(false);
  }

  function archive(): void {
    settings.archive(item.archivedAt === null);
    close();
    setMenuOpen(false);
  }

  function confirmClear(): void {
    settings.clear();
    setConfirmClearOpen(false);
    close();
    setMenuOpen(false);
  }

  return (
    <>
      <Swipeable
        ref={ref}
        renderLeftActions={() => (
          <View className="flex-row">
            <SwipeActionButton icon="favorite" label={item.pinnedAt ? 'Bỏ ghim' : 'Ghim'} tone="accent" onPress={togglePin} />
            <SwipeActionButton icon="email-recieve" label="Chưa đọc" tone="base" onPress={toggleUnread} />
          </View>
        )}
        renderRightActions={() => (
          <View className="flex-row">
            <SwipeActionButton
              icon="noti-off"
              label="Thông báo"
              tone="accent"
              onPress={() => {
                setMuteSheetOpen(true);
                close();
              }}
            />
            <SwipeActionButton icon="history" label={item.archivedAt ? 'Bỏ lưu trữ' : 'Lưu trữ'} tone="base" onPress={archive} />
            <SwipeActionButton
              icon="delete"
              label="Xoá"
              tone="error"
              onPress={() => {
                close();
                setConfirmClearOpen(true);
              }}
            />
          </View>
        )}
        onSwipeableWillOpen={hapticSelection}
      >
        {/* Rung nhẹ khi NHẤN GIỮ mở bảng tuỳ chọn — dấu hiệu "đã giữ đủ lâu" (vuốt mở thì rung `selection` ở trên). */}
        <ConversationRow
          {...rowProps}
          item={item}
          onLongPress={() => {
            hapticTap();
            setMenuOpen(true);
          }}
        />
      </Swipeable>

      <ConversationNotifySheet conversation={item} visible={muteSheetOpen} onClose={() => setMuteSheetOpen(false)} />

      {/* `padded={false}` + `SheetList` (= `px-md`): `ListItem` không tự có lề ngang — thiếu lề này icon dính sát mép tấm. */}
      <BottomSheet padded={false} snapToContent title="Tuỳ chọn" visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <SheetList accessibilityRole="menu" className="pb-md">
          <MenuRow icon="favorite" label={item.pinnedAt ? 'Bỏ ghim' : 'Ghim'} onPress={togglePin} />
          <MenuRow icon="email-recieve" label="Đánh dấu chưa đọc" onPress={toggleUnread} />
          <MenuRow
            icon={item.muted ? 'noti-off' : 'notification'}
            label="Thông báo"
            onPress={() => {
              setMenuOpen(false);
              setMuteSheetOpen(true);
            }}
          />
          <MenuRow icon="history" label={item.archivedAt ? 'Bỏ lưu trữ' : 'Lưu trữ'} onPress={archive} />
          {/* Phá huỷ (mất khỏi danh sách phía mình) ⇒ đỏ và đứng CUỐI; vẫn hỏi lại bằng tấm xác nhận bên dưới. */}
          <MenuRow
            divider={false}
            icon="delete"
            label="Xoá cuộc trò chuyện"
            tone="danger"
            onPress={() => {
              setMenuOpen(false);
              setConfirmClearOpen(true);
            }}
          />
        </SheetList>
      </BottomSheet>

      <ClearHistoryConfirmSheet loading={settings.isPending} visible={confirmClearOpen} onClose={() => setConfirmClearOpen(false)} onConfirm={confirmClear} />
    </>
  );
}
