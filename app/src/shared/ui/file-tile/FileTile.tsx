import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatFileSize } from '@/shared/utils/format/file-size.utils';
import { tCommon } from '@/shared/utils/i18n';
import { cn } from '@/shared/utils/style/cn';

import { Button } from '../button/Button';
import { Icon } from '../icon';
import { ProgressRing } from '../progress-ring/ProgressRing';
import { iconForMime } from './mime-icon';

export type FileTileStatus = 'failed' | 'ready' | 'uploading';

export interface FileTileProps {
  className?: string;
  mime: string;
  name: string;
  /** `uploading`: nút "Huỷ tải lên". Không truyền thì không có nút (tệp không huỷ được). */
  onCancel?: () => void;
  /** `ready`: bấm cả thẻ để mở. Không truyền thì thẻ chỉ để xem (không bấm được). */
  onOpen?: () => void;
  /** `failed`: nút "Thử tải lại". */
  onRetry?: () => void;
  /** Tiến độ 0..1 khi `uploading`. Bỏ trống = chưa biết (vòng quay liên tục). */
  progress?: number;
  /** Dung lượng (byte). `null`/thiếu ⇒ không hiện. */
  size?: number | null;
  /** Mặc định `ready`. */
  status?: FileTileStatus;
}

/**
 * Thẻ MỘT tệp đính kèm: icon theo loại, tên, dung lượng đọc được ("2,4 MB"), và theo trạng thái — đang tải lên (vòng tiến độ + huỷ),
 * hỏng (thử lại), sẵn sàng (bấm để mở) (p0-12). Dùng trong khay đính kèm trước khi gửi và trong bong bóng tin nhắn/tài liệu.
 *
 * ```tsx
 * <FileTile mime="application/pdf" name="bao-cao.pdf" size={2_516_582} onOpen={open} />
 * <FileTile mime="image/png" name="anh.png" size={4_000_000} status="uploading" progress={0.45} onCancel={cancel} />
 * <FileTile mime="video/mp4" name="clip.mp4" status="failed" onRetry={retry} />
 * ```
 *
 * ── Trợ năng: nút KHÔNG lồng nhau ─────────────────────────────────────────────
 * Khối "icon + tên + dung lượng" và nút hành động là HAI anh em, không lồng. Lồng nút vào một `Pressable` là gộp cả cây thành một
 * phần tử — trình đọc màn hình không lia tới nút Huỷ/Thử lại được (cùng bẫy `Chip trailing`). Nhãn của khối gộp cả tên, dung lượng
 * và trạng thái ("bao-cao.pdf, 2,4 MB, đang tải lên 45%"). Nút hành động cao ≥ 44dp nhờ `Button` (hitSlop).
 */
export function FileTile({
  className,
  mime,
  name,
  onCancel,
  onOpen,
  onRetry,
  progress,
  size,
  status = 'ready',
}: FileTileProps) {
  const sizeText = formatFileSize(size);
  const percent = progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const statusText =
    status === 'uploading'
      ? tCommon('file.uploading', { progress: percent ?? 0 })
      : status === 'failed'
        ? tCommon('file.failed')
        : '';
  // Dòng phụ: "Đang tải lên 45% · 2,4 MB" / "Tải lên thất bại · 2,4 MB" / "2,4 MB".
  const subline = [statusText, sizeText].filter(Boolean).join(' · ');
  const spoken = [name, sizeText, statusText].filter(Boolean).join(', ');
  const failed = status === 'failed';
  const openable = status === 'ready' && onOpen !== undefined;

  const info: ReactNode = (
    <>
      <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface-primary">
        <Icon color="fg-brand" name={iconForMime(mime)} />
      </View>
      <View className="flex-1">
        <Text className="text-label-md text-fg-1" numberOfLines={1}>
          {name}
        </Text>
        {subline ? (
          <Text className={failed ? 'text-caption-sm text-error' : 'text-caption-sm text-fg-2'} numberOfLines={1}>
            {subline}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View className={cn('min-h-14 flex-row items-center gap-xs rounded-xs bg-bg-2 px-sm py-xs', className)}>
      {openable ? (
        <Pressable
          accessibilityHint={tCommon('file.open')}
          accessibilityLabel={spoken}
          accessibilityRole="button"
          className="min-h-11 flex-1 flex-row items-center gap-xs"
          onPress={onOpen}
        >
          {info}
        </Pressable>
      ) : (
        <View accessibilityLabel={spoken} accessible className="min-h-11 flex-1 flex-row items-center gap-xs">
          {info}
        </View>
      )}

      {status === 'uploading' ? (
        <ProgressRing
          indeterminate={progress === undefined}
          label={tCommon('file.uploading', { progress: percent ?? 0 })}
          progress={progress}
          size={28}
        />
      ) : null}
      {status === 'uploading' && onCancel ? (
        <Button
          accessibilityLabel={tCommon('file.cancelUpload')}
          iconLeft="cancel"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={onCancel}
        />
      ) : null}
      {failed && onRetry ? (
        <Button
          accessibilityLabel={tCommon('file.retry')}
          iconLeft="reload"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}
