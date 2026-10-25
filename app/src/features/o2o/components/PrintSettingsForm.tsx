import { ScrollView, Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Input } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';
import { Stepper } from '@/shared/ui/stepper';
import { Toggle } from '@/shared/ui/toggle';

import { PAPER_SIZES, type PrintCapabilities, type PrintSettings } from '../api/o2o.types';
import {
  O2O_LIMITS,
  PAPER_LABEL,
  PICKUP_PRESETS,
  type PickupPresetKey,
} from '../constants/o2o.constants';

export interface PrintSettingsFormProps {
  settings: PrintSettings;
  /** `undefined` khi chưa tải xong tiệm — mọi ô khoá cho tới khi biết tiệm hỗ trợ gì. */
  capabilities: PrintCapabilities | undefined;
  pickup: PickupPresetKey;
  /** Lỗi của ô khoảng trang (app hoặc `O2O_012` từ server). */
  rangeError: string | null;
  disabled?: boolean;
  onChange: (patch: Partial<PrintSettings>) => void;
  onPickupChange: (key: PickupPresetKey) => void;
}

/**
 * Cấu hình in (app.md §3 `PrintSettingsForm`): khổ giấy, màu, hai mặt, số bản, khoảng trang, đóng gáy, hẹn giờ lấy.
 * Tuỳ chọn tiệm KHÔNG hỗ trợ thì KHOÁ kèm câu giải thích (không giấu): A3 khoá khi `capabilities.a3` false, màu/hai mặt khoá tương tự — người dùng thấy
 * "tiệm này không có" thay vì thắc mắc tuỳ chọn đâu mất. Đóng gáy là P1 nên chỉ hiện khi tiệm có. BE vẫn chốt (`O2O_002`).
 */
export function PrintSettingsForm({
  settings,
  capabilities: caps,
  pickup,
  rangeError,
  disabled = false,
  onChange,
  onPickupChange,
}: PrintSettingsFormProps) {
  const locked = disabled || !caps;

  return (
    <Section icon="setting" title="Cấu hình in">
      <View className="gap-md">
        <View className="gap-xs">
          <Text className="text-label-md font-semibold text-fg-1">Khổ giấy</Text>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-xs">
            {PAPER_SIZES.map((paper) => (
              <Chip
                key={paper}
                disabled={locked || (paper === 'A3' && !caps?.a3)}
                label={PAPER_LABEL[paper]}
                role="radio"
                selected={settings.paper === paper}
                size="sm"
                onPress={() => onChange({ paper })}
              />
            ))}
          </View>
          {caps && !caps.a3 ? (
            <Text className="text-caption-lg text-fg-2">Tiệm này chỉ in khổ A4.</Text>
          ) : null}
        </View>

        <Toggle
          description={caps && !caps.color ? 'Tiệm này chỉ in đen trắng.' : undefined}
          disabled={locked || !caps?.color}
          label="In màu"
          value={settings.color}
          onChange={(color) => onChange({ color })}
        />
        <Toggle
          description={caps && !caps.duplex ? 'Tiệm này không in hai mặt.' : undefined}
          disabled={locked || !caps?.duplex}
          label="In hai mặt"
          value={settings.duplex}
          onChange={(duplex) => onChange({ duplex })}
        />
        {caps?.binding ? (
          <Toggle
            disabled={locked}
            label="Đóng gáy"
            value={settings.binding}
            onChange={(binding) => onChange({ binding })}
          />
        ) : null}

        <View className="min-h-14 flex-row items-center justify-between gap-sm">
          <Text className="flex-1 text-body-md text-fg-1">Số bản</Text>
          <Stepper
            accessibilityLabel="Số bản"
            disabled={locked}
            max={O2O_LIMITS.copiesMax}
            min={1}
            value={settings.copies}
            onChange={(copies) => onChange({ copies })}
          />
        </View>

        <Input
          autoCapitalize="none"
          autoCorrect={false}
          disabled={locked}
          hint="Để trống để in cả tệp"
          keyboardType="numbers-and-punctuation"
          label="Khoảng trang (không bắt buộc)"
          message={rangeError ?? undefined}
          messageTone={rangeError ? 'error' : 'hint'}
          placeholder="Ví dụ: 1-3,5"
          value={settings.pageRange ?? ''}
          onChangeText={(pageRange) => onChange({ pageRange })}
        />

        <View className="gap-xs">
          <Text className="text-label-md font-semibold text-fg-1">
            Hẹn giờ lấy (không bắt buộc)
          </Text>
          <ScrollView
            className="grow-0"
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <View accessibilityRole="radiogroup" className="flex-row gap-xs">
              {PICKUP_PRESETS.map((preset) => (
                <Chip
                  key={preset.key}
                  disabled={disabled}
                  label={preset.label}
                  role="radio"
                  selected={pickup === preset.key}
                  size="sm"
                  onPress={() => onPickupChange(preset.key)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Section>
  );
}
