import * as WebBrowser from 'expo-web-browser';
import { Text } from 'react-native';

import type { Span } from '../../api/roadmap.types';
import { MONO_FONT } from '../../constants/roadmap.constants';

export interface SpansProps {
  spans: readonly Span[];
}

/**
 * Dãy `Span` (be.md §5.1) → chuỗi `<Text>` lồng: đậm/nghiêng/gạch ngang/code/liên kết.
 *
 * ⚠️ KHÔNG bọc `<Text>` ngoài cùng ở đây (khác `MarkdownView.Inline`): mọi khối gọi `<Spans>` đều tự đặt nó bên
 * trong `<Text>` của CHÍNH mình (tiêu đề, đoạn văn, ô bảng…), và trả về mảng trần mới lồng được nhiều cấp `<Text>`
 * của React Native. Vì lý do tương tự, liên kết ở đây mở TRỰC TIẾP (không hỏi xác nhận như `MarkdownView`): hộp
 * thoại xác nhận cần `Dialog` (dựng trên `<Modal>`), không lồng được vào trong một chuỗi `<Text>` — mở thẳng cũng
 * nhất quán với các hàng tài liệu ở `ResourcesTab` (chạm để mở, không hỏi lại).
 */
export function Spans({ spans }: SpansProps) {
  return (
    <>
      {spans.map((span, index) => {
        switch (span.t) {
          case 'bold':
            return (
              <Text key={index} className="font-semibold">
                {span.v}
              </Text>
            );
          case 'italic':
            return (
              <Text key={index} className="italic">
                {span.v}
              </Text>
            );
          case 'strike':
            return (
              <Text key={index} className="line-through">
                {span.v}
              </Text>
            );
          case 'code':
            // ⚠️ Họ font đặt bằng `style`, không bằng `font-mono`: plugin font của `tailwind.config.js` gắn Plus Jakarta Sans
            // vào mọi `text-<vai trò>` và `<Text>` con THỪA KẾ họ font của cha — `font-mono` ra chuỗi "ui-monospace, …" mà
            // Android không có ⇒ mã `<head>` vẫn hiện font thường, khó tách khỏi chữ quanh nó.
            return (
              <Text key={index} className="bg-bg-2" style={{ fontFamily: MONO_FONT }}>
                {span.v}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={index}
                accessibilityRole="link"
                className="text-link underline"
                onPress={() => void WebBrowser.openBrowserAsync(span.href)}
              >
                {span.v}
              </Text>
            );
          default:
            return <Text key={index}>{span.v}</Text>;
        }
      })}
    </>
  );
}
