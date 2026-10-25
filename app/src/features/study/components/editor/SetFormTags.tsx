import { useWatch, type Control } from 'react-hook-form';
import { View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { FormInput } from '@/shared/ui/input';

import type { StudyLimits } from '../../constants/study.constants';
import { parseTags, type SetFormValues } from '../../schemas/study.schemas';

export interface SetFormTagsProps {
  control: Control<SetFormValues>;
  limits: StudyLimits;
}

/**
 * Nhóm "Thẻ (#tag)": gõ cách nhau bằng dấu phẩy, hiện NGAY các thẻ đã hiểu được (`#toán` `#lớp 9`) và bộ đếm "3/10". Người dùng thấy
 * trước thẻ nào sẽ được lưu — dấu phẩy/dấu cách thừa, thẻ trùng và thẻ quá dài đã bị `parseTags` gọt bỏ (cùng hàm lúc gửi, nên thứ
 * hiện ra là đúng thứ được gửi). Vượt số thẻ tối đa thì nói rõ "chỉ giữ N thẻ đầu" thay vì lặng lẽ cắt.
 */
export function SetFormTags({ control, limits }: SetFormTagsProps) {
  const raw = useWatch({ control, name: 'tags' }) ?? '';
  // Bỏ trần số thẻ để BIẾT có thẻ bị cắt hay không; phần hiện ra và bộ đếm dùng đúng `tagsMax` đầu.
  const all = parseTags(raw, { tagMax: limits.tagMax, tagsMax: Number.MAX_SAFE_INTEGER });
  const kept = all.slice(0, limits.tagsMax);
  const over = all.length > limits.tagsMax;

  return (
    <Card>
      <FormInput<SetFormValues>
        autoCapitalize="none"
        control={control}
        hint={`${kept.length}/${limits.tagsMax}`}
        label="Thẻ (cách nhau bằng dấu phẩy)"
        message={
          over
            ? `Chỉ giữ ${limits.tagsMax} thẻ đầu tiên.`
            : `Tối đa ${limits.tagsMax} thẻ, mỗi thẻ ${limits.tagMax} ký tự.`
        }
        messageTone={over ? 'error' : 'hint'}
        name="tags"
        placeholder="toán, hình học, lớp 9"
      />
      {kept.length > 0 ? (
        <View className="flex-row flex-wrap gap-xs">
          {kept.map((tag) => (
            <Badge key={tag} label={`#${tag}`} variant="brand" />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
