import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/shared/ui/icon';

export interface MeetingInfoRowProps {
  icon: IconName;
  text: string;
}

/** Một dòng "icon + chữ" của khối thông tin cuộc họp. Icon chỉ trang trí — nghĩa nằm ở chữ. */
export function MeetingInfoRow({ icon, text }: MeetingInfoRowProps) {
  return (
    <View className="flex-row items-start gap-xs">
      {/* Hộp icon cao ĐÚNG một dòng `text-body-md` (20dp) ⇒ icon 16 nằm giữa DÒNG ĐẦU. Để icon trần với `items-start` thì nó
          dính mép trên, lệch 2dp so với chữ — lộ rõ khi địa điểm/nội dung dài xuống nhiều dòng. */}
      <View className="h-5 justify-center">
        <Icon color="fg-2" name={icon} size={16} />
      </View>
      <Text className="flex-1 text-body-md text-fg-1">{text}</Text>
    </View>
  );
}
