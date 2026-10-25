import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';

import { ROOT_FOLDER } from '../api';
import { useFolderQuery } from '../queries/folder.queries';
import { ROOT_LABEL, type BreadcrumbSegment } from '../utils/breadcrumb';
import { MoveFolderRows } from './MoveFolderRows';

export interface MoveTarget {
  /** Thư mục cha hiện tại (`null` = gốc) — di chuyển về CHÍNH chỗ đó là vô nghĩa, nút bị khoá. */
  currentParentId: string | null;
  id: string;
  kind: 'folder' | 'resource';
  name: string;
}

export interface MoveToFolderSheetProps {
  error?: string;
  /** `LIMITS.resource.folderDepthMax`. */
  maxDepth: number;
  onClose: () => void;
  /** `null` = về gốc. */
  onMove: (destinationId: string | null) => void;
  pending: boolean;
  /** `null` ⇒ đóng. */
  target: MoveTarget | null;
  wsId: string;
}

const ROOT_SEGMENT: BreadcrumbSegment = { id: ROOT_FOLDER, label: ROOT_LABEL };

export function MoveToFolderSheet(props: MoveToFolderSheetProps) {
  return <MoveToFolderSheetContent key={props.target?.id ?? 'closed'} {...props} />;
}

/**
 * Duyệt cây thư mục TỪNG CẤP để chọn nơi đến (app.md p3-01 §2). Chặn chọn chính
 * nó/con bằng cách KHÔNG cho vào thư mục đang di chuyển — cả cây con của nó
 * không với tới được, nên `RSC_006` chỉ còn là lưới an toàn của BE. Độ sâu: chọn
 * thư mục đã ở cấp tối đa thì khoá nút (BE `RSC_001` kiểm cả cây con sâu nhất).
 *
 * Bố cục (tấm tràn viền): đường dẫn + nút "Lên một cấp" GHIM ở khe `search` (không cuộn mất khi danh sách dài), cảnh
 * báo quá sâu / lỗi máy chủ ở khe `alert`, danh sách hàng ở `MoveFolderRows`, nút chính ở `footer`.
 *
 * ⚠️ Đường dẫn là VẾT DUYỆT tại chỗ (`trail`: vào một cấp = thêm, lên một cấp = bỏ) chứ không đọc `breadcrumb` của lần
 * tải: đọc từ lần tải thì trong nhịp chờ cấp mới, đường dẫn co về "Tài liệu" và nút lên cấp biến mất rồi hiện lại —
 * dải đầu tấm giật mỗi lần chạm.
 */
function MoveToFolderSheetContent({
  error,
  maxDepth,
  onClose,
  onMove,
  pending,
  target,
  wsId,
}: MoveToFolderSheetProps) {
  const [trail, setTrail] = useState<readonly BreadcrumbSegment[]>([ROOT_SEGMENT]);
  const current = trail[trail.length - 1] ?? ROOT_SEGMENT;
  const browseId = current.id;
  const listing = useFolderQuery(wsId, browseId, target !== null);

  const destination = browseId === ROOT_FOLDER ? null : browseId;
  const browseDepth = listing.data?.folder?.depth ?? 0;
  const tooDeep = target?.kind === 'folder' && browseDepth + 1 > maxDepth;
  const unchanged = destination === target?.currentParentId;
  const canGoUp = trail.length > 1;
  const ancestors = trail.slice(0, -1).map((segment) => segment.label);
  const path = [...ancestors, current.label].join(' › ');

  const notices =
    tooDeep || error ? (
      <View className="gap-xs">
        {tooDeep ? (
          <Alert description="Thư mục này đã ở cấp sâu nhất cho phép." tone="warning" />
        ) : null}
        {error ? <Alert description={error} tone="error" /> : null}
      </View>
    ) : undefined;

  return (
    <BottomSheet
      alert={notices}
      footer={
        <Button
          disabled={unchanged || tooDeep || listing.isLoading}
          fullWidth
          label="Di chuyển vào đây"
          loading={pending}
          onPress={() => onMove(destination)}
        />
      }
      padded={false}
      scrollable
      search={
        // Nút lên cấp LUÔN có chỗ (khoá ở gốc) để chữ đường dẫn không nhảy ngang khi vào/ra cấp gốc.
        <View className="flex-row items-center gap-xs">
          <Button
            accessibilityLabel="Lên một cấp"
            disabled={!canGoUp}
            iconLeft="arrow-left"
            iconOnly
            size="sm"
            variant="secondary"
            onPress={() => setTrail((segments) => segments.slice(0, -1))}
          />
          <Text
            accessibilityLabel={`Đang xem: ${path}`}
            className="flex-1 text-body-md text-fg-2"
            numberOfLines={2}
          >
            {ancestors.length > 0 ? `${ancestors.join(' › ')} › ` : null}
            {/* Cấp đang xem đậm + chữ chính — mắt thấy ngay mình đang ở đâu giữa chuỗi tổ tiên. */}
            <Text className="font-semibold text-fg-1">{current.label}</Text>
          </Text>
        </View>
      }
      title="Chọn thư mục đích"
      visible={target !== null}
      onClose={onClose}
    >
      <MoveFolderRows
        folders={listing.data?.children ?? []}
        isError={listing.isError}
        isLoading={listing.isLoading}
        movingFolderId={target?.kind === 'folder' ? target.id : null}
        onOpen={(folder) =>
          setTrail((segments) => [...segments, { id: folder.id, label: folder.name }])
        }
        onRetry={() => void listing.refetch()}
      />
    </BottomSheet>
  );
}
