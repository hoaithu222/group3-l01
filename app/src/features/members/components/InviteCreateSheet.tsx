import { useState } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Chip } from '@/shared/ui/chip';
import { Section } from '@/shared/ui/section';
import { Stepper } from '@/shared/ui/stepper';

import type { CreateInvitePayload } from '../api';

const EXPIRY_OPTIONS: { label: string; value: CreateInvitePayload['expiresInHours'] }[] = [
  { label: '1 giờ', value: 1 },
  { label: '24 giờ', value: 24 },
  { label: '7 ngày', value: 168 },
];

const MAX_USES_MIN = 1;
const MAX_USES_MAX = 100;
const DEFAULT_MAX_USES = 10;

export interface InviteCreateSheetProps {
  loading: boolean;
  onClose: () => void;
  onCreate: (payload: CreateInvitePayload) => void;
  visible: boolean;
}

/**
 * Chọn hạn (1h/24h/7 ngày) + số lượt (stepper 1–100) rồi tạo link (app.md §2, §3). Đáy `SheetActions` [Huỷ | Tạo link] kèm dòng tóm
 * tắt lựa chọn ngay trên nút ("Link dùng được 24 giờ, tối đa 10 lượt.") — đọc lại một lần trước khi bấm.
 */
export function InviteCreateSheet({ loading, onClose, onCreate, visible }: InviteCreateSheetProps) {
  const [expiresInHours, setExpiresInHours] = useState<CreateInvitePayload['expiresInHours']>(24);
  const [maxUses, setMaxUses] = useState(DEFAULT_MAX_USES);

  const expiryLabel = EXPIRY_OPTIONS.find((option) => option.value === expiresInHours)?.label;

  return (
    <BottomSheet
      // Đang tạo thì khoá nền mờ + "Huỷ": đóng tấm giữa lúc yêu cầu đang bay là link vẫn được tạo mà người dùng không thấy URL.
      dismissOnBackdrop={!loading}
      footer={
        <SheetActions
          hint={`Link dùng được ${expiryLabel ?? ''}, tối đa ${maxUses} lượt.`}
          primary={{ label: 'Tạo link', loading, onPress: () => onCreate({ expiresInHours, maxUses }) }}
          secondary={{ disabled: loading, label: 'Huỷ', onPress: onClose }}
        />
      }
      title="Tạo link mời"
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md">
        {/* ✅ Tiêu đề nhóm qua `Section tone="default"` (vai `header`, khe 8 xuống hàng chip) — bản cũ là `Text` trần, trình đọc màn
            hình không nhảy tới được. Hàng chip mang vai `radiogroup` + nhãn: mỗi chip là `radio`, thiếu nhóm thì không biết chọn gì. */}
        <Section title="Hạn sử dụng" tone="default">
          <View
            accessibilityLabel="Hạn sử dụng"
            accessibilityRole="radiogroup"
            className="flex-row flex-wrap gap-xs"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                role="radio"
                selected={expiresInHours === option.value}
                onPress={() => setExpiresInHours(option.value)}
              />
            ))}
          </View>
        </Section>

        <View className="flex-row items-center justify-between gap-sm">
          <Text className="text-label-md text-fg-1">Số lượt dùng tối đa</Text>
          <Stepper
            accessibilityLabel="Số lượt dùng tối đa"
            max={MAX_USES_MAX}
            min={MAX_USES_MIN}
            value={maxUses}
            onChange={setMaxUses}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
