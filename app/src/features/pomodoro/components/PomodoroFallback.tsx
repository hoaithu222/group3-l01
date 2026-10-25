import type { ReactNode } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

export type PomodoroFallbackKind = 'error' | 'gone' | 'loading';

export interface PomodoroFallbackProps {
  /** Mô tả lỗi đã dịch (kind `error`). */
  description?: string;
  header: ReactNode;
  kind: PomodoroFallbackKind;
  onRetry: () => void;
  onToChannels: () => void;
}

/**
 * Ba khung "chưa có phòng để vẽ" của màn Pomodoro (app.md §3): đang tải (khung chờ đồng hồ), lỗi tải (+ Thử lại), và mất quyền/kênh bị xoá
 * (`permission:revoked`/404 ⇒ về danh sách kênh).
 */
export function PomodoroFallback({ description, header, kind, onRetry, onToChannels }: PomodoroFallbackProps) {
  return (
    <Screen header={header} scrollable={false}>
      {kind === 'gone' ? (
        <EmptyState
          actions={[{ label: 'Về danh sách kênh', onPress: onToChannels }]}
          description="Bạn không còn quyền xem hoặc kênh đã bị xoá."
          fullscreen
          icon="lock"
          title="Kênh không còn khả dụng"
          tone="warning"
        />
      ) : kind === 'error' ? (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: onRetry }]}
          description={description}
          fullscreen
          icon="alert-warning"
          title="Không tải được phòng"
          tone="danger"
        />
      ) : (
        <View className="gap-sm py-md">
          <Skeleton className="h-60 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </View>
      )}
    </Screen>
  );
}
