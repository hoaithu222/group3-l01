import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text } from 'react-native';

import { Dialog } from '@/shared/ui/modal';

import { splitLinks } from '../../utils/split-links';

/**
 * Nội dung lời mời/tin nhắn: giữ xuống dòng, liên kết bấm được SAU KHI xác nhận mở ngoài (app.md §3). Nội dung do người lạ (doanh nghiệp) soạn nên
 * KHÔNG mở thẳng: một hộp thoại nói rõ đây là liên kết ngoài app, kèm địa chỉ đầy đủ để nhìn ra tên miền giả. Chỉ nhận `http(s)` (`splitLinks`).
 */
export function OfferMessageText({
  className = 'text-body-md text-fg-1',
  text,
}: {
  className?: string;
  text: string;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const close = () => setPending(null);

  return (
    <>
      <Text className={className} selectable>
        {splitLinks(text).map((part, index) =>
          part.link ? (
            <Text
              key={`${String(index)}:${part.text}`}
              accessibilityRole="link"
              className="text-link underline"
              onPress={() => setPending(part.text)}
            >
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
      </Text>
      <Dialog
        description={pending ?? ''}
        primaryAction={{
          label: 'Mở liên kết',
          onPress: () => {
            const url = pending;
            close();
            if (url) void WebBrowser.openBrowserAsync(url);
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: close }}
        title="Mở liên kết ngoài ứng dụng?"
        variant="warning"
        visible={pending !== null}
        onClose={close}
      />
    </>
  );
}
