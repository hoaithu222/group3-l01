/**
 * Lời mời đang mở màn "Trao đổi" — để `offer:message-created` KHÔNG tăng "chưa đọc" của chính cuộc trao đổi đang hiện trước mặt (server đã đặt
 * lại chưa đọc khi mở thread). Biến cấp module chứ không phải state: chỉ `useOfferEvents` đọc trong callback socket, không cần vẽ lại màn nào.
 */
let activeOfferId: string | null = null;

export const setActiveThread = (offerId: string | null): void => {
  activeOfferId = offerId;
};

export const isThreadActive = (offerId: string): boolean => activeOfferId === offerId;
