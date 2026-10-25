import { useState } from 'react';
import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { OpenHour } from '../api/o2o.types';
import { openStatusText, todayHoursText, weekSchedule } from '../utils/o2o-format';

export interface OpenHoursCardProps {
  openHours: OpenHour[];
  openNow: boolean | null;
}

/** Giờ mở cửa (app.md §3): trạng thái đang mở/đóng + giờ HÔM NAY, bấm "Cả tuần" để xem đủ 7 ngày. Chưa khai giờ → nói rõ "Chưa có giờ mở cửa". */
export function OpenHoursCard({ openHours, openNow }: OpenHoursCardProps) {
  const [expanded, setExpanded] = useState(false);
  const today = todayHoursText(openHours);

  return (
    <Section icon="clock" title="Giờ mở cửa">
      <Card>
        <View className="flex-row items-center gap-xs">
          <Badge
            label={openStatusText(openNow)}
            size="sm"
            variant={openNow === true ? 'success' : 'neutral'}
          />
          {today ? (
            <Text className="flex-1 text-body-md text-fg-1">{today}</Text>
          ) : (
            <View className="flex-1" />
          )}
          {openHours.length > 0 ? (
            <Button
              label={expanded ? 'Thu gọn' : 'Cả tuần'}
              size="sm"
              variant="tertiary"
              onPress={() => setExpanded((value) => !value)}
            />
          ) : null}
        </View>
        {expanded
          ? weekSchedule(openHours).map((row) => (
              <ListItem key={row.day} divider label={row.label} value={row.text} />
            ))
          : null}
      </Card>
    </Section>
  );
}
