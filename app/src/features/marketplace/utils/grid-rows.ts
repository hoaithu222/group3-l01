/**
 * Chia danh sách thành các HÀNG `size` phần tử (hàng cuối có thể thiếu) cho lưới chợ.
 *
 * Vì sao chia hàng thay vì `FlatList numColumns`: `numColumns` + ô `flex-1` làm ô LẺ cuối cùng giãn ra gấp đôi bề rộng; chia hàng rồi
 * đệm ô trống (`MarketplaceGridRow`) giữ mọi ô cùng bề rộng, mà danh sách vẫn ảo hoá theo HÀNG (cùng cách `ShopGrid` của phân hệ xu).
 */
export function chunkRows<T>(list: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let start = 0; start < list.length; start += size) rows.push(list.slice(start, start + size));
  return rows;
}
