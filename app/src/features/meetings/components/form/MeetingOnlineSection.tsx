import { Controller, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';
import { FormInput } from '@/shared/ui/input';

import type { MeetingFormat, MeetingPlatform } from '../../api/meetings.types';
import { FORMAT_LABEL, LOCATION_MAX, PLATFORM_LABEL } from '../../constants/meetings.constants';
import type { MeetingFormValues } from '../../schemas/meeting-form.schema';
import { ChipField } from './ChipField';
import type { MeetingFormApi } from './meeting-form.types';

const PLATFORMS: readonly MeetingPlatform[] = ['INTERNAL', 'ZOOM', 'TEAMS', 'GOOGLE_MEET', 'OTHER'];
const FORMATS: readonly MeetingFormat[] = ['ONLINE', 'OFFLINE', 'HYBRID'];
/** Cùng icon với thẻ lịch/chi tiết (máy quay = trực tuyến, ghim = tại chỗ) — người dùng thấy một ngôn ngữ hình ở cả ba màn. */
const FORMAT_ICONS: Record<MeetingFormat, IconName> = {
  HYBRID: 'link',
  OFFLINE: 'location',
  ONLINE: 'video-camera',
};

export interface MeetingOnlineSectionProps {
  form: MeetingFormApi;
  /** Họp đang diễn ra: BE chỉ nhận tiêu đề/agenda/`endAt`/lobby ⇒ khoá hình thức, nền tảng, địa điểm, link. */
  limited?: boolean;
}

/**
 * Hình thức + nơi họp. ONLINE: nền tảng (+ link https khi KHÔNG phải phòng nội bộ). OFFLINE: chỉ địa điểm — BE từ chối nền tảng ngoài
 * cho họp trực tiếp (`MEET_015`) nên chọn OFFLINE là đưa nền tảng về "Phòng nội bộ". HYBRID: cả địa điểm lẫn nền tảng.
 */
export function MeetingOnlineSection({ form, limited = false }: MeetingOnlineSectionProps) {
  const { control, setValue } = form;
  const format = useWatch({ control, name: 'format' });
  const platform = useWatch({ control, name: 'platform' });

  return (
    <View className="gap-md">
      <Controller
        control={control}
        name="format"
        render={({ field }) => (
          <ChipField
            icons={FORMAT_ICONS}
            label="Hình thức"
            labels={FORMAT_LABEL}
            locked={limited}
            options={FORMATS}
            value={field.value}
            onChange={(next) => {
              field.onChange(next);
              if (next === 'OFFLINE') {
                setValue('platform', 'INTERNAL');
                setValue('externalUrl', '');
              }
            }}
          />
        )}
      />
      {format !== 'ONLINE' ? (
        <FormInput<MeetingFormValues>
          control={control}
          disabled={limited}
          label="Địa điểm"
          maxLength={LOCATION_MAX}
          name="location"
          placeholder="Ví dụ: Phòng họp 3, tầng 5"
        />
      ) : null}
      {format !== 'OFFLINE' ? (
        <>
          <Controller
            control={control}
            name="platform"
            render={({ field, fieldState }) => (
              <ChipField
                label="Nền tảng"
                labels={PLATFORM_LABEL}
                locked={limited}
                message={fieldState.error?.message}
                options={PLATFORMS}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {platform !== 'INTERNAL' ? (
            <FormInput<MeetingFormValues>
              autoCapitalize="none"
              control={control}
              disabled={limited}
              keyboardType="url"
              label="Liên kết họp"
              name="externalUrl"
              placeholder="https://"
              required
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
