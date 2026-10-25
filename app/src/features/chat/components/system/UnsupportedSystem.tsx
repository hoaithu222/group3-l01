import { Text, View } from 'react-native';

/** `systemType` lạ HOẶC chưa dựng UI riêng (`CALL_SUMMARY`/`MEETING_*` — cần p2-01/p2-04, be.md §5.7). */
export function UnsupportedSystem() {
  return (
    <View className="items-center px-md py-2xs">
      <Text className="text-caption-sm text-fg-2">Nội dung chưa hỗ trợ trên phiên bản này</Text>
    </View>
  );
}
