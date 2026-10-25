import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/icon-names.generated';
import { sectionStyles, type SectionTone } from './section.styles';

export type { SectionTone } from './section.styles';

export interface SectionProps {
  /**
   * Khe hành động dạt phải của hàng tiêu đề — trong bản vẽ là icon bút chì
   * (`531:29597`, `1108:28220`; 2 chỗ khác để `hidden`).
   *
   * ⛔ Component KHÔNG tự vẽ icon sửa: cùng khe đó còn phải chứa `<LinkButton>`
   * ("Xem tất cả") hay một `<Button iconOnly>` mở bottom sheet. Nơi gọi truyền
   * vào, đúng luật của `ListItem.trailing` / `Chip.trailing`.
   *
   * ⚠️ Khe này nằm NGOÀI ô trợ năng của tiêu đề nên phần tử đặt vào phải tự có
   * `accessibilityLabel` (nút chỉ có icon) — nếu không trình đọc màn hình xướng
   * một ô trống ngay sau mỗi tiêu đề.
   */
  action?: ReactNode;
  /** Ruột của nhóm: `Card`, `Input`, cụm form, hay một đoạn văn. */
  children: ReactNode;
  className?: string;
  /**
   * Icon nhỏ (20dp, hai tông) đứng TRƯỚC tiêu đề — mốc nhìn để mắt quét nhanh giữa các nhóm của màn dài (chi tiết, cài
   * đặt, tổng quan). Màu đi theo `tone` (`brand` ⇒ `fg-brand` như chữ tiêu đề; `default` ⇒ `fg-2`, nhạt hơn chữ `fg-1`).
   *
   * ⚠️ Trang trí thuần — không nhãn, bị ẩn khỏi trình đọc màn hình; nghĩa nằm ở `title`. Chọn icon ĐÚNG NGHĨA của nhóm,
   * và đừng gắn cho MỌI `Section` của một màn chỉ có hai nhóm: icon là mốc, không phải hoa văn.
   */
  icon?: IconName;
  /** Tiêu đề. Là `string` để mang được vai `header` — xem `titleAsHeader`. */
  title: string;
  /**
   * Gắn `accessibilityRole="header"` cho tiêu đề. Mặc định BẬT: đó là cái mốc
   * để trình đọc màn hình nhảy giữa các nhóm thay vì vuốt qua từng dòng của cả
   * màn chi tiết đơn hàng (4 nhóm × ~4 hàng).
   *
   * ⛔ Tắt khi khối cha ĐÃ có một `header` cho cùng nội dung này — `Card` với
   * `title` dạng chuỗi, `BottomSheet`/`Dialog` với `title`, `EmptyState`. Hai
   * node `header` lồng nhau làm TalkBack đếm hai tiêu đề cho một nhóm và điều
   * hướng theo heading nhảy vào cái bên trong.
   */
  titleAsHeader?: boolean;
  /** Chỉnh riêng dòng tiêu đề (đổi màu cho nhóm trên nền tối, cắt dòng…). */
  titleClassName?: string;
  tone?: SectionTone;
}

/**
 * Nhóm nội dung có tiêu đề — tiêu đề nằm NGOÀI khối, một khe, rồi tới nội dung.
 * (Khe 12 hay 8 là do `tone` quyết — xem biến thể `tone` ở `section.styles.ts`.)
 *
 * Figma: khối mẫu `822:28748` ("Thông tin đơn hàng", 343×252) — chữ tiêu đề
 * 343×24 ở y=0, thẻ trắng 343×216 ở y=36 ⇒ khe **12** (`Gap/Ga12`). Hàng tiêu
 * đề có hành động là `Frame 1597881248` (`531:29601`, 343×24): chữ bên trái,
 * icon `icon_ht_edit` 24×24 tại **x=319** (sát mép phải, khối rộng 343).
 *
 * Đây là bố cục lặp NHIỀU NHẤT trong bản vẽ — 29 khối đo được trong 4 section
 * (~60 lần nếu đếm cả các màn trùng nhau). Viết tay ở từng nơi thì chắc chắn có
 * chỗ gõ `text-header-md`, có chỗ quên `text-fg-brand`, và gần như không chỗ
 * nào đặt `accessibilityRole="header"`.
 *
 * ── ⛔ Vì sao KHÔNG có nền, không bo góc, không đệm ──────────────────────────
 * Tiêu đề đứng trên nền màn (`bg-base`); cái hộp trắng là việc của `Card`. Gộp
 * hai thứ thành một ("InfoCard") thì hỏng ngay những ca mà CÙNG cái tiêu đề đó
 * đứng trên một `Input` (`301:128885`), trên một cụm form (`259:125374`) hay
 * trên một đoạn văn (slide quy định `193:25481`).
 *
 * ── ⛔ Khe GIỮA hai `Section` là việc của NƠI GỌI ───────────────────────────
 * Bản vẽ để 24 (`gap-xl`) giữa hai nhóm. ⛔ Đừng nhét `mb-xl` vào đây: màn hình
 * nào đã có `gap` ở khối cha sẽ cộng dồn thành 48 và không ai lần ra vì sao các
 * nhóm tụt xa nhau — đúng cái bẫy đã ghi lại ở `EmptyState`.
 *
 * @example
 *   // Khe 24 giữa hai nhóm do NƠI GỌI đặt, không phải component.
 *   <View className="gap-xl">
 *     <Section
 *       action={<LinkButton accessibilityLabel="Sửa thông tin nhận hàng" iconLeft="edit" onPress={edit} />}
 *       icon="location"
 *       title="Thông tin nhận hàng"
 *     >
 *       <Card>
 *         <ListItem label="Người nhận" value="NGUYEN VAN A" />
 *       </Card>
 *     </Section>
 *   </View>
 */
export function Section({
  action,
  children,
  className,
  icon,
  title,
  titleAsHeader = true,
  titleClassName,
  tone = 'brand',
}: SectionProps) {
  const styles = sectionStyles({ tone });
  const titleNode = (
    <Text
      accessibilityRole={titleAsHeader ? 'header' : undefined}
      className={styles.title({ className: titleClassName })}
    >
      {title}
    </Text>
  );

  return (
    <View className={styles.root({ className })}>
      <View className={styles.header()}>
        {icon ? (
          <View className={styles.heading()}>
            <Icon
              color={tone === 'default' ? 'fg-2' : 'fg-brand'}
              name={icon}
              size="sm"
              variant="twotone"
            />
            {titleNode}
          </View>
        ) : (
          titleNode
        )}
        {action}
      </View>
      {children}
    </View>
  );
}
