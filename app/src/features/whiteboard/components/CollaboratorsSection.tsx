import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import type { Collaborator, WhiteboardVisibility } from '../api/whiteboard.types';
import { CollaboratorRow } from './CollaboratorRow';

export interface CollaboratorsSectionProps {
  canManage: boolean;
  collaborators: readonly Collaborator[];
  /** Câu lỗi tải danh sách (đã qua `whiteboardErrorMessage`) — `null` khi không lỗi. */
  errorMessage: string | null;
  loading: boolean;
  /** Đã tải xong ít nhất một lần — chỉ khi đó mới được nói "chưa mời ai". */
  ready: boolean;
  visibility: WhiteboardVisibility;
  onAdd: () => void;
  onPressPerson: (collaborator: Collaborator) => void;
}

/**
 * Khối "Người cộng tác" của màn Chia sẻ: `Section` (tiêu đề + nút "Thêm người") → thẻ chứa các hàng người, hoặc hình
 * minh hoạ gọn khi chưa mời ai ("Chỉ bạn" với bảng riêng tư). Tách khỏi `WhiteboardShareScreen` cho màn đó gọn (cùng khuôn
 * với khối cùng tên của `docs` — hai feature không import chéo nhau nên mỗi bên một bản).
 *
 * ⚠️ Vỏ `overflow-hidden` + con `-mb-px` (cùng mẹo `MeNavGroup`): mỗi hàng tự có kẻ dưới, lề âm cắt vạch thừa của hàng
 * CUỐI để thẻ không kết thúc bằng một đường kẻ. Lề ngang 16 là của THẺ (`px-md`) nên kẻ chia thụt cùng lề với chữ.
 */
export function CollaboratorsSection({
  canManage,
  collaborators,
  errorMessage,
  loading,
  ready,
  visibility,
  onAdd,
  onPressPerson,
}: CollaboratorsSectionProps) {
  const isPrivate = visibility === 'PRIVATE';
  return (
    <Section
      action={
        canManage ? (
          <Button
            iconLeft="user-add"
            label="Thêm người"
            size="sm"
            variant="secondary"
            onPress={onAdd}
          />
        ) : undefined
      }
      title="Người cộng tác"
    >
      {loading ? <Skeleton className="h-14 rounded-md" /> : null}
      {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}
      {ready && collaborators.length === 0 ? (
        <EmptyState
          description={
            isPrivate
              ? 'Chưa mời ai — chỉ bạn xem và vẽ được bảng này.'
              : 'Chưa mời riêng ai — mọi thành viên của nhóm đều đã có quyền.'
          }
          icon={isPrivate ? 'lock' : 'add-team'}
          size="compact"
          title={isPrivate ? 'Chỉ bạn' : 'Cả nhóm đã có quyền'}
          tone="neutral"
        />
      ) : null}
      {collaborators.length > 0 ? (
        <Card className="gap-0 px-md py-2xs" padded={false}>
          <View className="overflow-hidden">
            <View className="-mb-px">
              {collaborators.map((item) => (
                <CollaboratorRow
                  key={item.userId}
                  collaborator={item}
                  onPress={canManage ? onPressPerson : undefined}
                />
              ))}
            </View>
          </View>
        </Card>
      ) : null}
    </Section>
  );
}
