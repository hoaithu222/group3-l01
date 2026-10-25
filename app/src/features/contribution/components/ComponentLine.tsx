import { Text, View } from 'react-native';

export interface ComponentLineProps {
  label: string;
  /** Số gốc ngay cạnh phần trăm ("8 điểm thẻ", "3/4 đúng hạn", "chấm 8,0 (5 lượt)") hoặc "Chưa có dữ liệu". */
  raw: string;
  /** 0–1; `null` = chưa có dữ liệu (không vẽ thanh, không hiện 0%). */
  value: number | null;
}

/**
 * Một thành phần của điểm đóng góp (app.md §7): NHÃN + số gốc + phần trăm + thanh. Mỗi % luôn đi kèm số gốc ngay cạnh, và thành phần chưa có dữ
 * liệu hiện CHỮ thay vì 0%. Thanh chỉ là phụ — số và chữ mang nghĩa nên màu/độ dài không phải dấu hiệu duy nhất.
 */
export function ComponentLine({ label, raw, value }: ComponentLineProps) {
  const percent = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <View className="gap-3xs">
      <View className="flex-row items-baseline justify-between gap-xs">
        <Text className="text-label-md font-semibold text-fg-1">{label}</Text>
        <Text className="shrink text-right text-body-md text-fg-2">{percent === null ? raw : `${raw} · ${percent}%`}</Text>
      </View>
      {percent === null ? null : (
        <View className="h-2 overflow-hidden rounded-full bg-bg-3">
          <View className="h-2 rounded-full bg-action-base" style={{ width: `${percent}%` }} />
        </View>
      )}
    </View>
  );
}
