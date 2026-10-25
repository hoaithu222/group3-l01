import { Text, View } from 'react-native';

/** Một ô điều khiển của thanh cuộc gọi: nút (icon) + nhãn CHỮ dưới nó — nhãn luôn có, không chỉ dựa vào màu/icon. */
export function CallControl({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View className="items-center gap-3xs">
      {children}
      <Text className="text-caption-sm text-fg-on-nav-muted">{label}</Text>
    </View>
  );
}
