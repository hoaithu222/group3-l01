import { type ReactNode } from 'react';
import { View } from 'react-native';

import { tCommon } from '@/shared/utils/i18n';

import { EmptyState } from '../empty-state/EmptyState';
import type { IconName } from '../icon';
import type { IconTileTone } from '../icon-tile/IconTile';
import { SkeletonParagraph } from '../skeleton/SkeletonParagraph';

/** Năm trạng thái không-phải-nội-dung của một màn/khối dữ liệu. */
export type ScreenStateKind = 'empty' | 'error' | 'forbidden' | 'loading' | 'offline';

export interface ScreenStateAction {
  label: string;
  onPress: () => void;
}

export interface ScreenStateProps {
  /** Nút dưới cùng (Thử lại, Về trang chủ…). `loading` không vẽ nút. */
  action?: ScreenStateAction;
  className?: string;
  description?: string;
  /** Canh giữa theo chiều dọc, chiếm hết chỗ trống của cha (mặc định bật cho trạng thái cả màn). */
  fullscreen?: boolean;
  /** Icon minh hoạ cho trạng thái `empty` (mặc định không có) — hoặc thay icon mặc định của lỗi/mất quyền/ngoại tuyến. */
  icon?: IconName;
  /** Khung xương riêng cho `loading` (đúng hình dạng nội dung sắp hiện). Mặc định: một đoạn văn xương. */
  skeleton?: ReactNode;
  state: ScreenStateKind;
  /** Ghi đè tiêu đề mặc định của trạng thái (đã tiếng Việt, xem `shared/strings/common.ts` mục `state`). */
  title?: string;
}

/**
 * Biểu tượng + tông theo trạng thái — `empty` mặc định KHÔNG có (danh sách trống thường nằm giữa nội dung khác); nơi
 * gọi muốn hình cho trạng thái rỗng thì truyền prop `icon`. Tông: lỗi = `danger`, mất quyền = `warning`, ngoại tuyến =
 * `neutral` (không phải lỗi của người dùng, cũng không nguy hiểm). `unlink` (sợi xích đứt) là icon gần nhất với "mất kết
 * nối" trong bộ — bộ không có icon sóng/wifi.
 */
const STATE_ART: Partial<Record<ScreenStateKind, { icon: IconName; tone: IconTileTone }>> = {
  error: { icon: 'alert-warning', tone: 'danger' },
  forbidden: { icon: 'lock', tone: 'warning' },
  offline: { icon: 'unlink', tone: 'neutral' },
};

/**
 * Trạng thái của một MÀN/khối dữ liệu: đang tải (khung xương) · rỗng · lỗi + thử lại · ngoại tuyến · mất quyền (p0-12).
 * Mỗi màn dữ liệu trước đây tự dựng bộ này (`SearchStateView`, `MessageListText`…) — mỗi nơi một câu, một bố cục.
 *
 * ```tsx
 * if (query.isPending) return <ScreenState state="loading" skeleton={<ListSkeleton />} />;
 * if (query.isError) return <ScreenState state="error" action={{ label: 'Thử lại', onPress: query.refetch }} />;
 * if (data.length === 0) return <ScreenState state="empty" title="Chưa có tin nhắn" />;
 * ```
 *
 * ── Chọn trạng thái ──────────────────────────────────────────────────────────
 *  · lỗi MẠNG (`isNetworkError(error)`, hoặc `useNetworkStatus().isOnline === false`) → `offline` (Thử lại chữa được);
 *  · 403/404 (mất quyền, bị xoá) → `forbidden` — ⛔ KHÔNG nút "Thử lại": thử lại vẫn 403/404;
 *  · lỗi khác → `error` + "Thử lại".
 *
 * Dựng trên `EmptyState` (khối "không có gì ở đây" của bộ chung): tiêu đề là `header` cho trình đọc màn hình, mô tả tối đa 3
 * dòng. `loading` không phải `EmptyState` mà là khung xương có nhãn "Đang tải…" + `busy` để người dùng khiếm thị biết đang chờ.
 */
export function ScreenState({
  action,
  className,
  description,
  fullscreen = true,
  icon,
  skeleton,
  state,
  title,
}: ScreenStateProps) {
  if (state === 'loading') {
    return (
      <View
        accessibilityLabel={title ?? tCommon('state.loading')}
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
        accessible
        className={className}
      >
        {skeleton ?? <SkeletonParagraph />}
      </View>
    );
  }

  const art = STATE_ART[state];
  const strings = {
    description: description ?? tCommon(`state.${state}.description`),
    title: title ?? tCommon(`state.${state}.title`),
  };

  return (
    <EmptyState
      actions={action ? [{ label: action.label, onPress: action.onPress }] : undefined}
      className={className}
      description={strings.description}
      fullscreen={fullscreen}
      icon={icon ?? art?.icon}
      title={strings.title}
      tone={art?.tone}
    />
  );
}
