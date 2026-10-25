import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetActions, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { ListItem } from '@/shared/ui/list';
import { SearchInput } from '@/shared/ui/search';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { normalizeSearch } from '@/shared/utils/format/string.utils';
import { hapticSelection } from '@/shared/utils/haptics';

export interface TransferOwnerMemberOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface TransferOwnerSheetProps {
  visible: boolean;
  /**
   * Thành viên ACTIVE (khác OWNER, khác chính mình) có thể nhận quyền — màn cha
   * lấy từ `GET /workspaces/:id/members` (`useTransferCandidates`) rồi truyền
   * xuống, sheet không tự gọi API.
   */
  members: TransferOwnerMemberOption[];
  /** Đang tải danh sách người nhận (lần mở sheet đầu, hoặc đang tìm). */
  membersLoading?: boolean;
  /** Tải danh sách lỗi — hiện "Thử lại" thay vì "chưa có ai" (hai ca khác hẳn nhau). */
  membersError?: boolean;
  /** Nhóm lớn hơn một trang: tìm phía server. Không truyền thì ẩn ô tìm. */
  onSearchChange?: (query: string) => void;
  onRetry?: () => void;
  /** Đang gửi yêu cầu chuyển quyền. */
  loading?: boolean;
  onClose: () => void;
  onConfirm: (input: { toUserId: string; confirmName: string }) => void;
}

/**
 * be.md p1-01 §3.3 — chọn thành viên + gõ lại tên để xác nhận (chống bấm nhầm).
 *
 * So khớp `confirmName` BỎ DẤU + không phân biệt hoa/thường (`normalizeSearch`),
 * đúng như BE (`workspace-lifecycle.service.ts`): người dùng gõ "nguyen van an"
 * cho "Nguyễn Văn An" vẫn qua. Kiểm cứng dấu ở client sẽ chặn nhầm một thao tác
 * mà server chấp nhận.
 *
 * ── Bố cục (cùng khuôn `conversations/components/TransferOwnerSheet.tsx`) ─────────────────────────────────────
 *  · Thân CUỘN: danh sách chọn MỘT người — `padded={false}` + `SheetList` (lề 16) + `ListItem` kẻ ngăn. Người đang chọn:
 *    `selected` (nền tint + `accessibilityState`) VÀ dấu tích kèm nhãn — không để màu là dấu hiệu duy nhất.
 *  · ĐÁY đứng yên: ô gõ lại tên + [Huỷ | Chuyển quyền] (`SheetActions`). ⚠️ Bản cũ đặt ô gõ tên SAU danh sách trong thân cuộn
 *    (nhóm đông phải cuộn mới thấy ô) và ghép hai `Button fullWidth` trần trong `flex-row` — nút "Chuyển quyền" bị đẩy ra ngoài
 *    mép tấm. Đang gửi thì "Huỷ" khoá: huỷ giữa lúc yêu cầu đang bay là đóng tấm mà việc vẫn xảy ra.
 */
export function TransferOwnerSheet({
  visible,
  members,
  membersLoading,
  membersError,
  onSearchChange,
  onRetry,
  loading,
  onClose,
  onConfirm,
}: TransferOwnerSheetProps) {
  const [selected, setSelected] = useState<TransferOwnerMemberOption | null>(null);
  const [confirmName, setConfirmName] = useState('');

  function handleClose(): void {
    setSelected(null);
    setConfirmName('');
    onClose();
  }

  function choose(member: TransferOwnerMemberOption): void {
    if (selected?.id === member.id) return;
    // Rung "đổi lựa chọn" + xoá chữ đã gõ: tên gõ cho người TRƯỚC không bao giờ khớp người mới, để lại chỉ làm nút khoá mà không rõ vì sao.
    hapticSelection();
    setSelected(member);
    setConfirmName('');
  }

  const typed = normalizeSearch(confirmName);
  const nameMatches =
    selected !== null && typed.length > 0 && typed === normalizeSearch(selected.name);
  const listReady = !membersLoading && !membersError && members.length > 0;

  return (
    <BottomSheet
      description="Người nhận trở thành chủ nhóm mới, bạn chuyển sang quản trị viên."
      dismissOnBackdrop={!loading}
      footer={
        <View className="gap-sm">
          {selected ? (
            <Input
              autoCapitalize="words"
              label={`Gõ lại tên "${selected.name}" để xác nhận`}
              message={nameMatches ? 'Tên khớp' : undefined}
              messageTone="success"
              placeholder={selected.name}
              value={confirmName}
              onChangeText={setConfirmName}
            />
          ) : null}
          <SheetActions
            hint={selected || !listReady ? undefined : 'Chọn người nhận quyền trong danh sách'}
            primary={{
              disabled: !nameMatches,
              label: 'Chuyển quyền',
              loading,
              onPress: () => {
                if (!selected) return;
                onConfirm({ toUserId: selected.id, confirmName: confirmName.trim() });
              },
            }}
            secondary={{ disabled: loading, label: 'Huỷ', onPress: handleClose }}
            tone="danger"
          />
        </View>
      }
      padded={false}
      scrollable
      search={
        onSearchChange ? (
          <SearchInput placeholder="Tìm thành viên" onChangeText={onSearchChange} />
        ) : undefined
      }
      title="Chuyển quyền sở hữu"
      visible={visible}
      onClose={handleClose}
    >
      {membersLoading ? (
        <SheetList className="gap-md py-xs">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonParagraphWithIcon key={index} />
          ))}
        </SheetList>
      ) : membersError ? (
        <EmptyState
          actions={onRetry ? [{ label: 'Thử lại', onPress: onRetry }] : undefined}
          description="Kiểm tra kết nối rồi thử lại."
          icon="alert-warning"
          size="compact"
          title="Không tải được danh sách thành viên"
          tone="danger"
        />
      ) : members.length === 0 ? (
        <EmptyState
          description="Cần có thêm thành viên đang hoạt động trong nhóm để chuyển quyền."
          icon="user"
          size="compact"
          title="Chưa có ai để chọn"
          tone="info"
        />
      ) : (
        <SheetList accessibilityLabel="Người nhận quyền sở hữu" accessibilityRole="radiogroup">
          {members.map((member, index) => {
            const isSelected = selected?.id === member.id;
            return (
              <ListItem
                key={member.id}
                divider={index < members.length - 1}
                label={member.name}
                labelNumberOfLines={2}
                leading={
                  <Avatar
                    name={member.name}
                    size="sm"
                    source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
                  />
                }
                selected={isSelected}
                trailing={
                  isSelected ? (
                    <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" />
                  ) : undefined
                }
                onPress={() => choose(member)}
              />
            );
          })}
        </SheetList>
      )}
    </BottomSheet>
  );
}
