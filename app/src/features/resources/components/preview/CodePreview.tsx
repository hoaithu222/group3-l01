import * as Clipboard from 'expo-clipboard';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import { useResourceLimits } from '../../hooks/useResourceLimits';
import { useResourceText } from '../../hooks/useResourceText';
import { prismLanguageFor } from '../../utils/code-language';
import { countLines, evaluateCodePreview, tokenizeCode } from '../../utils/code-tokens';
import { CodeLines } from './CodeLines';
import type { PreviewProps } from './preview.types';
import { UnsupportedPreview } from './UnsupportedPreview';

/**
 * Xem mã nguồn: token hoá bằng `prism-react-renderer` → `<Text>` lồng, KHÔNG
 * WebView (README p3-01 §2). Quá `codePreviewMaxBytes` (500 KB) hoặc 2.000 dòng ⇒
 * "Tệp quá lớn để xem trước" + Tải về — kiểm dung lượng TRƯỚC khi tải nội dung.
 */
export function CodePreview({ onDownload, onOpenExternal, resource }: PreviewProps) {
  const limits = useResourceLimits();
  const oversize =
    evaluateCodePreview({
      maxBytes: limits.codePreviewMaxBytes,
      maxLines: limits.codePreviewMaxLines,
      size: resource.size,
    }) === 'too-large';
  const text = useResourceText(resource, limits.codePreviewMaxBytes, !oversize);
  const content = text.data;
  const lineCount = content === undefined ? 0 : countLines(content);
  const tooManyLines =
    content !== undefined &&
    evaluateCodePreview({
      lineCount,
      maxBytes: limits.codePreviewMaxBytes,
      maxLines: limits.codePreviewMaxLines,
      size: 0,
    }) === 'too-large';

  const language = prismLanguageFor(resource);
  const lines = useMemo(
    () => (content === undefined || tooManyLines ? [] : tokenizeCode(content, language)),
    [content, language, tooManyLines],
  );

  if (oversize || tooManyLines) {
    return (
      <UnsupportedPreview actions={[{ label: 'Tải về', onPress: onDownload }]} reason="too-large" />
    );
  }
  if (text.isError) {
    return (
      <UnsupportedPreview
        actions={[
          { label: 'Thử lại', onPress: () => void text.refetch() },
          { label: 'Mở bằng ứng dụng khác', onPress: onOpenExternal, variant: 'secondary' },
        ]}
        reason="error"
      />
    );
  }
  if (content === undefined) return <Skeleton className="h-full w-full" />;

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(content);
      showToast('success', 'Đã sao chép nội dung');
    } catch (error) {
      showToast('error', toErrorMessage(error));
    }
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-md py-xs">
        <Text className="text-caption-lg text-fg-2">{`${lineCount} dòng · ${language}`}</Text>
        <Button label="Sao chép" size="xs" variant="secondary" onPress={() => void copy()} />
      </View>
      <CodeLines lines={lines} />
    </View>
  );
}
