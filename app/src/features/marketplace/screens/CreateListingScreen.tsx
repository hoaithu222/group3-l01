import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { Input } from '@/shared/ui/input';
import { ListItem } from '@/shared/ui/list';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { formatNumber } from '@/shared/utils/format/currency.utils';
import { hapticSuccess, hapticTap } from '@/shared/utils/haptics';

import type { MyStudySetOption } from '../api/marketplace.types';
import { ContentPickerSheet } from '../components/ContentPickerSheet';
import { CONTENT_TYPE_VISUAL } from '../constants/marketplace.constants';
import { useCreateListing } from '../hooks/useCreateListing';
import { marketplaceErrorMessage } from '../utils/marketplace-errors';
import { MARKETPLACE_MINE_HREF } from '../utils/marketplace-routes';

const PRICE_MIN = 1;
const PRICE_MAX = 5_000;
const TAGS_MAX = 5;

/** "a, b ,, c" → ["a","b","c"] (tối đa 5) — cùng một phép tách cho phần xem trước nhãn lẫn dữ liệu gửi đi. */
function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, TAGS_MAX);
}

/**
 * Niêm yết (app.md §3): chọn nội dung của tôi (`ContentPickerSheet` — P1 chỉ bộ học PUBLIC, xem ghi chú ở đó), tiêu đề, mô tả, tag, giá; lưu ý "Chờ
 * duyệt" khi áp dụng (BE tự quyết theo cấp độ + lịch sử duyệt, hiện SAU khi tạo qua toast của `useCreateListing`). `COIN_006/007` hiện tại chỗ nút gửi.
 *
 * Ba nhóm có tiêu đề + icon (nội dung · thông tin · giá) để mắt quét nhanh. Nhãn nhập vào hiện ngay thành huy hiệu — người bán thấy
 * trước tin sẽ trông thế nào; giá sai khoảng báo NGAY dưới ô thay vì chỉ khoá nút gửi không lời giải thích.
 */
export function CreateListingScreen() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [content, setContent] = useState<MyStudySetOption | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [priceText, setPriceText] = useState('');

  const create = useCreateListing();

  const price = Number(priceText);
  const priceValid = Number.isInteger(price) && price >= PRICE_MIN && price <= PRICE_MAX;
  const canSubmit = content !== null && title.trim().length >= 3 && priceValid;
  const tags = parseTags(tagsText);
  const visual = CONTENT_TYPE_VISUAL.STUDY_SET;

  const onSelectContent = (option: MyStudySetOption) => {
    setContent(option);
    if (!title) setTitle(option.title);
    setPickerOpen(false);
  };

  const submit = () => {
    if (!content) return;
    hapticTap();
    create.mutate(
      { contentType: 'STUDY_SET', contentId: content.id, title: title.trim(), description: description.trim() || undefined, tags, price },
      {
        onSuccess: () => {
          hapticSuccess();
          router.replace(MARKETPLACE_MINE_HREF);
        },
      }
    );
  };

  return (
    <Screen header={<AppBar title="Niêm yết tài liệu" onBack={router.back} />} keyboardAware>
      <View className="gap-xl py-xs">
        <Section icon="book" title="Nội dung niêm yết">
          <Card className="px-md py-2xs" padded={false}>
            <ListItem
              className="py-xs"
              description={
                content
                  ? `${formatNumber(content.itemCount)} mục · Chạm để đổi bộ học khác`
                  : 'Chỉ bộ học công khai (PUBLIC) của bạn mới niêm yết được.'
              }
              emphasis="title"
              label={content ? content.title : 'Chọn bộ học'}
              leading={<IconTile name={visual.icon} tone={visual.tone} />}
              trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
              onPress={() => setPickerOpen(true)}
            />
          </Card>
        </Section>

        {content ? (
          <>
            <Section icon="edit" title="Thông tin tin niêm yết">
              <View className="gap-md">
                <Input label="Tiêu đề" maxLength={120} required value={title} onChangeText={setTitle} />
                <Input label="Mô tả (không bắt buộc)" multiline value={description} onChangeText={setDescription} />
                <Input label="Nhãn, cách nhau bởi dấu phẩy (không bắt buộc)" value={tagsText} onChangeText={setTagsText} />
                {tags.length > 0 ? (
                  <View accessibilityLabel={`Nhãn sẽ hiển thị: ${tags.join(', ')}`} accessible className="flex-row flex-wrap gap-xs">
                    {tags.map((tag) => (
                      <Badge key={tag} label={`#${tag}`} size="sm" variant="brand" />
                    ))}
                  </View>
                ) : null}
              </View>
            </Section>

            <Section icon="loyalty" title="Giá bán">
              <Input
                keyboardType="number-pad"
                label={`Giá (${String(PRICE_MIN)}–${formatNumber(PRICE_MAX)} xu)`}
                message={
                  priceText && !priceValid
                    ? `Giá là số nguyên từ ${String(PRICE_MIN)} đến ${formatNumber(PRICE_MAX)} xu.`
                    : 'Xu không quy đổi ra tiền.'
                }
                messageTone={priceText && !priceValid ? 'error' : 'hint'}
                required
                value={priceText}
                onChangeText={setPriceText}
              />
            </Section>

            {create.isError ? <Alert description={marketplaceErrorMessage(create.error)} tone="error" /> : null}

            <Button disabled={!canSubmit} fullWidth label="Đăng tin niêm yết" loading={create.isPending} onPress={submit} />
          </>
        ) : null}
      </View>

      <ContentPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={onSelectContent} />
    </Screen>
  );
}
