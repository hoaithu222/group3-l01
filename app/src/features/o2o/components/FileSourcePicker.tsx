import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { AttachmentTray } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { LoadingMore } from '@/shared/ui/progress';
import { Section } from '@/shared/ui/section';

import { O2O_ERROR_MESSAGES } from '../constants/o2o.constants';
import type { usePrintUpload } from '../hooks/usePrintUpload';
import { isNotAvailable, o2oErrorMessage } from '../utils/o2o-errors';

/** BE trả 404 TRUNG TÍNH khi người đặt không còn quyền đọc tài liệu (hoặc tài liệu đã xoá) — không phân biệt hai ca. Câu nói việc nên làm. */
const LOST_ACCESS = 'Không còn quyền với tài liệu này hoặc tài liệu đã bị xoá. Hãy chọn tệp khác.';

export interface FileSourcePickerProps {
  /** Tên tệp để hiện — tệp vừa chọn, hoặc tên trong đơn nháp đang mở lại. `null` = chưa chọn tệp. */
  fileName: string | null;
  pages: number | null;
  /** Job đếm trang còn chạy. */
  counting: boolean;
  creating: boolean;
  createError: unknown;
  /** Tệp BỊ TỪ CHỐI khi đếm trang: không đọc được (`O2O_003`) / quá số trang (`O2O_011`). */
  fileProblem: 'O2O_003' | 'O2O_011' | null;
  upload: ReturnType<typeof usePrintUpload>;
  onRetryCreate: () => void;
  onChangeFile: () => void;
  onPickResource?: () => void;
}

/**
 * Bước 1 — tệp cần in (app.md §3 `FileSourcePicker`): "Tải PDF lên" hoặc "Chọn từ tài liệu nhóm". Sau khi có tệp: tên + số trang, hoặc
 * "Đang đếm trang…" (BE đếm ở job nền; socket/hỏi lại báo khi xong). Tệp hỏng/quá số trang hiện lý do KÈM VIỆC NÊN LÀM ("xuất PDF…").
 * Chỉ nhận PDF (P0): chặn sớm ở `validatePrintFile`, BE vẫn chốt bằng `O2O_003`.
 */
export function FileSourcePicker({
  fileName,
  pages,
  counting,
  creating,
  createError,
  fileProblem,
  upload,
  onRetryCreate,
  onChangeFile,
  onPickResource,
}: FileSourcePickerProps) {
  if (!fileName) {
    return (
      <Section icon="document-2" title="Tài liệu cần in">
        <View className="gap-xs">
          {upload.item && upload.item.status !== 'ready' ? (
            <AttachmentTray
              items={[upload.item]}
              onCancel={upload.remove}
              onRemove={upload.remove}
              onRetry={upload.retry}
            />
          ) : (
            <View className="gap-xs">
              <Button
                fullWidth
                iconLeft="upload"
                label="Tải PDF lên"
                variant="secondary"
                onPress={() => void upload.pick()}
              />
              {onPickResource ? (
                <Button
                  fullWidth
                  iconLeft="document"
                  label="Chọn từ tài liệu nhóm"
                  variant="secondary"
                  onPress={onPickResource}
                />
              ) : null}
            </View>
          )}
          {upload.problem ? <Alert description={upload.problem} tone="warning" /> : null}
        </View>
      </Section>
    );
  }

  return (
    <Section icon="document-2" title="Tài liệu cần in">
      <Card>
        <View className="flex-row items-center gap-sm">
          <IconTile name="document-2" tone="brand" />
          <View className="flex-1 gap-2xs">
            <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
              {fileName}
            </Text>
            {pages !== null ? <Text className="text-body-md text-fg-2">{pages} trang</Text> : null}
          </View>
          <Button label="Đổi tệp" size="sm" variant="tertiary" onPress={onChangeFile} />
        </View>
        {creating ? <LoadingMore label="Đang tạo đơn" /> : null}
        {counting && !creating ? <LoadingMore label="Đang đếm trang" /> : null}
        {counting && !creating ? (
          <Text className="pb-xs text-center text-body-md text-fg-2">Đang đếm trang…</Text>
        ) : null}
        {createError ? (
          <View className="gap-xs pt-xs">
            <Alert
              description={isNotAvailable(createError) ? LOST_ACCESS : o2oErrorMessage(createError)}
              tone="error"
            />
            <Button label="Thử lại" size="sm" variant="secondary" onPress={onRetryCreate} />
          </View>
        ) : null}
        {fileProblem ? (
          <View className="pt-xs">
            <Alert description={O2O_ERROR_MESSAGES[fileProblem]} tone="error" />
          </View>
        ) : null}
      </Card>
    </Section>
  );
}
