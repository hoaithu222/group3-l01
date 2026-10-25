import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { ResolveAction, ScopeReportDetail, ScopeReportItem } from '../api/moderation.types';
import {
  REPORT_REASON_LABEL,
  REPORT_TARGET_LABEL,
  RESOLUTION_LABEL,
  RESOLVE_ACTION_COPY,
} from '../constants/moderation.constants';
import { cleanExcerpt } from '../utils/excerpt';

export interface ReportDetailBodyProps {
  /** Bản chi tiết (có `myActions`) — `undefined` khi còn tải hoặc lỗi. */
  detail: ScopeReportDetail | undefined;
  detailError: string | undefined;
  detailLoading: boolean;
  item: ScopeReportItem;
  onChoose: (action: ResolveAction) => void;
}

/**
 * Bước 1 của `ReportReviewSheet` (app.md p1-08 §3): xem nhóm báo cáo — đích, số báo cáo, các lý do, trích
 * đoạn tin (nếu đọc được phạm vi) — rồi chọn hành động THEO `myActions` của BE. Không tự suy quyền phía
 * app: nút nào hiện là do `myActions`, và BE vẫn kiểm lại lúc xử lý.
 */
export function ReportDetailBody({ detail, detailError, detailLoading, item, onChoose }: ReportDetailBodyProps) {
  const actions = detail?.myActions;
  const preview = item.preview;

  return (
    <View className="gap-md">
      <View className="gap-3xs">
        <Text className="text-label-md text-fg-1">
          {REPORT_TARGET_LABEL[item.targetType]}
          {item.scope?.name ? ` · ${item.scope.name}` : ''}
        </Text>
        <Text className="text-caption-sm text-fg-2">
          {String(item.reportCount)} báo cáo · mới nhất {formatDateTime(item.latestAt)}
        </Text>
      </View>

      {preview ? (
        <View className="gap-3xs rounded-md bg-bg-2 p-sm">
          {preview.authorName ? <Text className="text-label-xs font-semibold text-fg-2">{preview.authorName}</Text> : null}
          <Text className="text-body-md text-fg-1">
            {preview.deleted ? 'Tin nhắn đã bị gỡ' : cleanExcerpt(preview.excerpt)}
          </Text>
        </View>
      ) : (
        <Text className="text-body-md text-fg-2">Nội dung không hiển thị với bạn — chỉ có thông tin báo cáo.</Text>
      )}

      <View className="gap-3xs">
        <Text className="text-caption-sm font-medium text-fg-2">Lý do</Text>
        <Text className="text-body-md text-fg-1">{item.reasons.map((reason) => REPORT_REASON_LABEL[reason]).join(', ')}</Text>
      </View>

      {item.resolution ? (
        <Text className="text-body-md text-fg-2">Kết quả: {RESOLUTION_LABEL[item.resolution]}</Text>
      ) : null}

      {detailLoading ? <Skeleton className="h-12 rounded-md" /> : null}
      {detailError ? <Text className="text-body-md text-error">{detailError}</Text> : null}

      {actions ? (
        <View className="gap-sm">
          {actions.canRemove ? (
            <Button fullWidth label={RESOLVE_ACTION_COPY.REMOVE_MESSAGE.button} variant="danger" onPress={() => onChoose('REMOVE_MESSAGE')} />
          ) : null}
          {actions.canWarn ? (
            <Button fullWidth label={RESOLVE_ACTION_COPY.WARN_AUTHOR.button} variant="neutral-secondary" onPress={() => onChoose('WARN_AUTHOR')} />
          ) : null}
          {actions.canDismiss ? (
            <Button fullWidth label={RESOLVE_ACTION_COPY.DISMISS.button} variant="neutral-secondary" onPress={() => onChoose('DISMISS')} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
