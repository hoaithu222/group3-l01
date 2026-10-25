import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Reveal } from '@/shared/ui/motion';
import { Section } from '@/shared/ui/section';
import { skipReasonLabel, summarizeTemplateResult } from '@/shared/workspace-templates';

import type { ApplyTemplateResult, TemplateChannel } from '../api';

export interface ApplyResultViewProps {
  /** Kênh của mẫu vừa áp — để đổi khoá kênh bị bỏ qua thành tên (BE chỉ trả khoá). */
  channels: readonly TemplateChannel[];
  result: ApplyTemplateResult;
  onDone: () => void;
  onOpenChannels: () => void;
}

/**
 * Kết quả áp mẫu (app.md p5-04 §3 "kết quả hiện kênh đã tạo/bỏ qua"): một câu tóm tắt, rồi danh sách kênh ĐÃ TẠO và kênh BỊ BỎ
 * QUA kèm lý do bằng chữ (trùng tên / loại kênh chưa bật). Đây là kết quả CHUẨN của BE — khác dự đoán "có thể bị bỏ qua" ở
 * lúc chọn (client không thấy kênh riêng tư của người khác).
 *
 * Mỗi kênh một ô icon (đã tạo = dấu tích `success`, bỏ qua = `neutral`) và các khối hiện dần (`Reveal`) — màn "xong việc" nên
 * đọc ra ngay đâu là phần đã thành, đâu là phần bỏ qua. Nút ở cuối KHÔNG bọc `Reveal`: thứ người dùng bấm phải bấm được ngay.
 */
export function ApplyResultView({
  channels,
  result,
  onDone,
  onOpenChannels,
}: ApplyResultViewProps) {
  const outcome = summarizeTemplateResult(result);
  const nameByKey = new Map(channels.map((channel) => [channel.key, channel.name]));

  return (
    <View className="gap-xl py-xs">
      <Reveal>
        <Alert description={outcome.message} tone={outcome.tone} />
      </Reveal>

      {result.createdChannels.length > 0 ? (
        <Reveal index={1}>
          <Section icon="checkmark-circle" title={`Đã tạo (${result.createdChannels.length})`}>
            <Card>
              {result.createdChannels.map((channel) => (
                <ListItem
                  key={channel.id}
                  divider
                  emphasis="title"
                  label={`#${channel.name}`}
                  leading={<IconTile name="checkmark-circle" size="sm" tone="success" />}
                />
              ))}
            </Card>
          </Section>
        </Reveal>
      ) : null}

      {result.skipped.length > 0 ? (
        <Reveal index={2}>
          <Section icon="alert-information" title={`Đã bỏ qua (${result.skipped.length})`}>
            <Card>
              {result.skipped.map((skip) => (
                <ListItem
                  key={skip.key}
                  description={skipReasonLabel(skip.reason)}
                  divider
                  emphasis="title"
                  label={`#${nameByKey.get(skip.key) ?? skip.key}`}
                  leading={<IconTile name="minus" size="sm" tone="neutral" />}
                />
              ))}
            </Card>
          </Section>
        </Reveal>
      ) : null}

      <View className="gap-xs">
        <Button fullWidth label="Xem danh sách kênh" onPress={onOpenChannels} />
        <Button fullWidth label="Xong" variant="secondary" onPress={onDone} />
      </View>
    </View>
  );
}
