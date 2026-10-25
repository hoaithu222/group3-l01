import { prepareChatImage } from '@/core/media/prepare-image';
import { validateFile } from '@/core/uploads/mime';
import type { PickedFile } from '@/core/uploads/upload.types';
import { showToast } from '@/shared/utils/toast.utils';

/**
 * Tệp vừa chọn → tệp đủ điều kiện xếp hàng tải. Ảnh nén song song TRƯỚC (gửi nguyên bản 12 MB là khâu chậm nhất của luồng đính kèm; tệp khác đi qua
 * nguyên vẹn), rồi tệp sai định dạng/dung lượng (hoặc không đọc được) báo NGAY kèm tên tệp — không đẩy lên để BE trả `400 VAL_001` chung chung.
 */
export async function prepareAndValidate(files: PickedFile[]): Promise<PickedFile[]> {
  const prepared = await Promise.all(files.map(prepareChatImage));
  return prepared.filter((file) => {
    const result = validateFile(file);
    if (!result.ok) showToast('error', `${file.name}: ${result.message}`);
    return result.ok;
  });
}
