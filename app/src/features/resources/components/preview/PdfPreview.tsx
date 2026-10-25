import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { PdfRef } from 'react-native-pdf';

import { Chip } from '@/shared/ui/chip';

import { useDownloadedFile } from '../../hooks/useDownloadedFile';
import { loadPdfComponent, type PdfComponent } from '../../utils/load-pdf-module';
import { ProgressBar } from '../ProgressBar';
import { PageJumpSheet } from './PageJumpSheet';
import type { PreviewProps } from './preview.types';
import { PreviewErrorBoundary } from './PreviewErrorBoundary';
import { UnsupportedPreview } from './UnsupportedPreview';

/**
 * Xem PDF bằng `react-native-pdf` — TẢI VỀ cache tạm rồi mở `file://` (app.md
 * p3-01 §3), kèm tiến độ. Hiển thị trang đầu ≤ 3 s sau khi tải xong là ST-02
 * (CHƯA XÁC MINH — cần dev-client build lại, xem app.md §6).
 *
 * ⛔ Module native nạp LƯỜI (`loadPdfComponent`) và render trong error boundary:
 * thiếu native module (dev-client hiện tại CHƯA có `react-native-pdf`) thì rơi về
 * "Mở bằng ứng dụng khác" thay vì crash. Chỉ TẢI tệp sau khi biết module dùng
 * được — không tải 20 MB để rồi không vẽ được.
 */
export function PdfPreview({ onDownload, onOpenExternal, resource, variant }: PreviewProps) {
  // Nạp lười MỘT lần khi khung này mount lần đầu; `null` = thiếu native module.
  const [Pdf] = useState<PdfComponent | null>(loadPdfComponent);
  const [renderFailed, setRenderFailed] = useState(false);
  const [pages, setPages] = useState({ page: 1, total: 0 });
  const [jumpOpen, setJumpOpen] = useState(false);
  const pdfRef = useRef<PdfRef>(null);

  const usable = Pdf !== null && !renderFailed;
  const file = useDownloadedFile(resource, variant, usable);
  const fallbackActions = [
    { label: 'Mở bằng ứng dụng khác', onPress: onOpenExternal },
    { label: 'Tải về', onPress: onDownload, variant: 'secondary' as const },
  ];

  if (Pdf === null || renderFailed)
    return <UnsupportedPreview actions={fallbackActions} reason="no-native-pdf" />;
  if (file.status === 'error') {
    return (
      <UnsupportedPreview
        actions={[
          { label: 'Thử lại', onPress: file.retry },
          ...fallbackActions.map((a) => ({ ...a, variant: 'secondary' as const })),
        ]}
        reason="error"
      />
    );
  }
  if (file.status !== 'ready') {
    const percent = file.status === 'downloading' ? Math.round(file.progress * 100) : 0;
    return (
      <View className="flex-1 items-center justify-center gap-sm px-xl">
        <Text className="text-body-md text-fg-2">{`Đang tải tệp… ${percent}%`}</Text>
        <View className="w-full max-w-[280px]">
          <ProgressBar label={`Đang tải tệp ${percent}%`} percent={percent} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <PreviewErrorBoundary
        fallback={<UnsupportedPreview actions={fallbackActions} reason="no-native-pdf" />}
        onError={() => setRenderFailed(true)}
      >
        <Pdf
          ref={pdfRef}
          fitPolicy={0}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          source={{ uri: file.uri }}
          style={{ flex: 1 }}
          onError={() => setRenderFailed(true)}
          onLoadComplete={(total) => setPages({ page: 1, total })}
          onPageChanged={(page, total) => setPages({ page, total })}
        />
      </PreviewErrorBoundary>
      {pages.total > 0 ? (
        <View className="absolute bottom-sm self-center">
          <Chip
            label={`Trang ${pages.page}/${pages.total}`}
            role="button"
            size="sm"
            onPress={() => setJumpOpen(true)}
          />
        </View>
      ) : null}
      <PageJumpSheet
        currentPage={pages.page}
        totalPages={pages.total}
        visible={jumpOpen}
        onClose={() => setJumpOpen(false)}
        onJump={(page) => pdfRef.current?.setPage(page)}
      />
    </View>
  );
}
