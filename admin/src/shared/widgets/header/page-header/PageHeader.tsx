/**
 * PageHeader — page dùng component này để CHIẾM SLOT trên thanh header toàn cục.
 *
 * Nó KHÔNG render tại chỗ: mọi thứ đi qua portal vào ba slot của `<Header>`
 * (`start` mép trái · `title` cụm tâm · `end` mép phải). Nhờ portal, node vẫn
 * nằm trong CÂY REACT của page nên router/query/provider của page dùng được
 * bình thường — xem `page-header-slots.tsx`.
 *
 * Bố cục cụm tâm:
 *   [ô nav trái] ⟨BẢNG TÊN MODULE⟩ [ô nav phải]
 * Nav được chia đôi quanh bảng tên (`nav.splitAt` để ghim điểm cắt).
 *
 * Dùng trong page:
 *   <PageHeader
 *     title="Người dùng"
 *     backHref="/"
 *     onBack={goHome}
 *     nav={{ items, active: tab, onSelect: setTab, actions }}
 *   />
 *
 * Đặt ở BẤT KỲ đâu trong page (thường ngay đầu JSX). Page unmount → portal gỡ
 * theo, header tự sạch.
 */
import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';

import { pageHeaderStyles } from './page-header.theme';
import PageHeaderBack from './PageHeaderBack';
import type { PageHeaderChipAnchor, PageHeaderChipSide } from './PageHeaderChip';
import PageHeaderNav from './PageHeaderNav';
import type { PageHeaderNavConfig } from './PageHeaderNav';
import PageHeaderTitle from './PageHeaderTitle';
import type { PageHeaderTitleProps } from './PageHeaderTitle';
import { HeaderSlotPortal } from './page-header-slots';

export interface PageHeaderProps extends PageHeaderTitleProps {
  /** Dải tab + action của page. Chia đôi quanh bảng tên. */
  nav?: PageHeaderNavConfig;
  /** Node tuỳ ý đẩy ra mép TRÁI thanh header. */
  start?: ReactNode;
  /** Node tuỳ ý đẩy ra mép PHẢI thanh header. */
  end?: ReactNode;
  /** Bật nút quay lại ở mép trái. */
  onBack?: () => void;
  /** Tooltip + `aria-label` của nút quay lại — mặc định "Quay lại". */
  backLabel?: string;
  /** Path cố định — BẮT BUỘC truyền khi đích không phải `navigate(-1)`. */
  backHref?: string;
  /** Hướng nghiêng nút quay lại — mặc định `end`. Xem `PageHeaderBackProps.side`. */
  backSide?: PageHeaderChipSide;
  /** Neo dọc nút quay lại — mặc định `center`. Xem `PageHeaderBackProps.anchor`. */
  backAnchor?: PageHeaderChipAnchor;
  /** Nút quay lại ở bậc compact (chỉ siết BỀ NGANG). */
  backCompact?: boolean;
}

const { cluster, navCell } = pageHeaderStyles();

function PageHeader({
  title,
  subtitle,
  tone,
  titleSize,
  nav,
  start,
  end,
  onBack,
  backLabel,
  backHref,
  backSide,
  backAnchor,
  backCompact,
}: PageHeaderProps) {
  // Nửa đầu danh sách nằm bên TRÁI bảng tên, nửa sau bên PHẢI.
  const [navStart, navEnd] = useMemo(() => {
    const items = nav?.items ?? [];
    const cut = nav?.splitAt ?? Math.ceil(items.length / 2);
    return [items.slice(0, cut), items.slice(cut)];
  }, [nav?.items, nav?.splitAt]);

  /**
   * Action bám theo DẢI CUỐI CÙNG có mặt, không phải một mép cố định — neo sai
   * chỗ là nút action văng khỏi nav.
   */
  const actionsOnEnd = navEnd.length > 0;

  /**
   * Dải TRÁI vẫn phải render khi KHÔNG còn chip nào nhưng vẫn có action — ca
   * thật: user bị ẩn hết tab vì thiếu quyền xem, nhưng vẫn có quyền vào Cài đặt.
   * Thiếu nhánh này thì nút action biến mất theo tab.
   */
  const hasNavStart = navStart.length > 0 || (!actionsOnEnd && (nav?.actions?.length ?? 0) > 0);
  const hasNavEnd = navEnd.length > 0;

  /**
   * Cụm tâm có nội dung ở HAI BÊN bảng tên hay không.
   *
   * ⛔ Một cờ CHUNG cho cả hai ô, KHÔNG tách `hasLeft`/`hasRight`. Hai ô phải
   *    CÙNG có mặt thì mới cùng `flex-1 basis-0` mà rộng bằng nhau — render lẻ
   *    một ô là bảng tên lệch khỏi tâm đúng bằng ô còn thiếu. Ô rỗng không tốn
   *    chỗ (`basis-0`, không nội dung) nên render thừa cũng vô hại.
   */
  const hasSides = nav != null && (hasNavStart || hasNavEnd);

  const backNode = onBack ? (
    <PageHeaderBack
      anchor={backAnchor}
      compact={backCompact}
      href={backHref}
      label={backLabel}
      side={backSide}
      onBack={onBack}
    />
  ) : null;

  const startNode = start != null && start !== false ? start : null;
  const endNode = end != null && end !== false ? end : null;

  return (
    <>
      {(backNode != null || startNode != null) && (
        <HeaderSlotPortal slot="start">
          <>
            {backNode}
            {startNode}
          </>
        </HeaderSlotPortal>
      )}

      <HeaderSlotPortal slot="title">
        <span className={cluster({ sided: hasSides })}>
          {hasSides && (
            <span className={navCell({ side: 'left' })}>
              {nav && hasNavStart && (
                <PageHeaderNav
                  actions={actionsOnEnd ? undefined : nav.actions}
                  active={nav.active}
                  disabled={nav.disabled}
                  items={navStart}
                  side="start"
                  onSelect={nav.onSelect}
                />
              )}
            </span>
          )}

          <PageHeaderTitle
            sided={hasSides}
            subtitle={subtitle}
            title={title}
            titleSize={titleSize}
            tone={tone}
          />

          {hasSides && (
            <span className={navCell({ side: 'right' })}>
              {nav && hasNavEnd && (
                <PageHeaderNav
                  actions={nav.actions}
                  active={nav.active}
                  disabled={nav.disabled}
                  items={navEnd}
                  side="end"
                  onSelect={nav.onSelect}
                />
              )}
            </span>
          )}
        </span>
      </HeaderSlotPortal>

      {endNode != null && <HeaderSlotPortal slot="end">{endNode}</HeaderSlotPortal>}
    </>
  );
}

export default memo(PageHeader);
