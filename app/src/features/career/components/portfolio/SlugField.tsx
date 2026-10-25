import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';

import type { Portfolio } from '../../api/portfolio.types';
import { usePortfolioLimits } from '../../hooks/usePortfolioLimits';
import { useSlugField } from '../../hooks/useSlugField';
import { draftUrlOf } from '../../utils/portfolio-url';

export interface SlugFieldProps {
  portfolio: Portfolio;
  /** `version` mà form hồ sơ đang giữ (đổi slug cũng tăng nó) — KHÔNG lấy thẳng `portfolio.version` để không lệch với form. */
  version: number;
  offline: boolean;
  onSaved: (portfolio: Portfolio) => void;
}

/**
 * Ô "Đường dẫn" (app.md p6-07 §3 `SlugField`): trạng thái Có thể dùng / Đã có người dùng / Chứa từ không được phép hiện NGAY dưới ô, kèm cảnh báo hậu quả "Link cũ chuyển hướng 30 ngày".
 * Khối riêng có nút riêng vì đổi slug là một hành động khác hẳn "Lưu thông tin": nó đổi LINK ĐÃ CHIA SẺ. Ô chỉ nhận chữ thường/số/gạch ngang — bàn phím `default` + tắt viết hoa/gợi ý.
 */
export function SlugField({ offline, onSaved, portfolio, version }: SlugFieldProps) {
  const { slugMax } = usePortfolioLimits();
  const field = useSlugField({ current: portfolio.slug, onSaved, version });
  const slug = field.text.trim().toLowerCase();

  return (
    <Card title="Đường dẫn công khai">
      <View className="gap-sm">
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          disabled={field.pending}
          hint={`${slug.length}/${slugMax}`}
          label="Đường dẫn"
          maxLength={slugMax}
          message={field.status.message}
          messageTone={field.status.tone}
          placeholder="ten-cua-ban"
          value={field.text}
          onChangeText={field.setText}
        />
        <Text
          className="text-body-md text-fg-2"
          selectable
        >{`Link: ${draftUrlOf(slug === '' ? portfolio.slug : slug)}`}</Text>
        {field.changed ? (
          <Alert
            description="Link cũ vẫn chuyển hướng sang link mới trong 30 ngày, và không ai khác lấy được link cũ trong thời gian đó."
            tone="info"
          />
        ) : null}
        {field.saveError ? <Alert description={field.saveError} tone="error" /> : null}
        <Button
          disabled={!field.changed || !field.status.canSave || offline}
          label="Đổi đường dẫn"
          loading={field.pending}
          variant="secondary"
          onPress={() => void field.save()}
        />
      </View>
    </Card>
  );
}
