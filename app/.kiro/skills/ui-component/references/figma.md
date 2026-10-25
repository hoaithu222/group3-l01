# Đọc Figma — cạm bẫy, và bản tham chiếu hiện tại

> Kiro IDE: Read → read_file; subagent → invoke_sub_agent (built-in `context-gatherer`); tool Figma MCP (`get_design_context`…) chỉ có khi người dùng đã cấu hình MCP Figma (`.kiro/settings/mcp.json`). Chi tiết: .kiro/steering/kiro-compat.md.

Chia làm hai phần:

- **Mục "Bẫy đo đạc" và "Hạn mức gọi"** là cơ chế chung — đúng với file Figma
  BẤT KỲ, giữ nguyên khi sang dự án khác.
- **Mọi `fileKey`, `nodeId`, tên section** dưới đây thuộc **bản tham chiếu hiện
  tại** của base. ⛔ Dự án khác thì thay hết; đừng đi đọc file này để lấy số đo
  cho một dự án không phải nó.

Bản tham chiếu hiện tại: `JKRCweXTvHehczYn87NOWK` — "BTMH x BIDV". Trang duy
nhất: `0:1` "Vàng tích luỹ Bảo Tín Mạnh Hải".

⛔ Trước MỌI lời gọi `get_design_context`, phải gọi skill `figma:figma-design-to-code` (không có trong project này).

---

## ⚠️ Bẫy lớn nhất: file có BA hạng khách hàng, không phải sáng/tối

Biến màu trong file chia theo **`Mass` · `Premier` · `VVIP`**, KHÔNG phải
light/dark. Hệ token của repo lấy theo **Mass**.

⛔ `get_variable_defs` ở các section **`Input`**, **`Badge`**, **`App bar`** trả về
giá trị của **Premier** (chữ `#ffffffe5`, nhấn vàng `#dfa62a`, nền `#011511`).
Chép thẳng vào code là lẫn hai hạng khách hàng trong cùng một màn hình.

**Cách né:** đừng lấy màu từ Figma. Lấy SỐ ĐO từ Figma, còn màu thì ánh xạ theo
vai trò sang token của repo (xem `tokens.md`). Làm vậy thì bẫy này không chạm tới
code được.

---

## Bẫy đo đạc

**Chiều cao thanh gồm cả tai thỏ của máy mẫu.** "App bar" cao 118 = 54 (thanh
trạng thái của đúng chiếc iPhone dựng thiết kế) + 8 + 56 (hàng nội dung). Chỉ
8 + 56 là số thật của component; 54 kia phải lấy từ `useSafeAreaInsets().top`
lúc chạy. ⛔ Viết `h-[118px]` là sai trên mọi máy khác.

Cùng luật cho thanh dưới: 97 = 12 + 48 + 16 + 21 (vạch gạt ngang) ⇒ dùng
`insets.bottom`.

**Instance lồng nhau không phải là nền.** Frame "App bar" có lồng instance
"Background Screen" — nhưng đo Plugin API thì `fills: []`. Thanh tiêu đề TRONG
SUỐT, nằm trên gradient của màn hình. Thứ có nền trắng 90% + `BACKGROUND_BLUR` là
**thanh dưới**, nằm chung section nên dễ đọc nhầm sang.

**Component bị lưới kéo giãn.** Chip "Chip Pill" 109×48 ở màn nạp tiền là CÙNG
component set với Chip thường, chỉ bị lưới ba cột kéo ra. Nó là `size` + `fullWidth`,
không phải component thứ hai. Luôn kiểm xem một "biến thể" có phải chỉ là
instance bị kéo giãn không.

**Tên node nói dối.** Node `259:97560` tên "Bottom nav" nhưng thực chất là một
nút chính chiếm hết bề rộng + vạch gạt ngang, không phải thanh tab.

**Section trả về rỗng.** `get_metadata` trên một số section trả về thẻ tự đóng
không có con. Lúc đó dùng `get_screenshot` (maxDimension 2000–2400) để đọc số đo,
và `get_design_context` trên chính section.

**Node quá lớn.** Kết quả > ~25k token sẽ bị ghi ra file thay vì trả về. Dò bằng
`jq 'type, length'` rồi trích từng phần — ⛔ Read với offset/limit KHÔNG chunk
được file JSON đó. Việc này nên giao cho subagent để khỏi tràn ngữ cảnh.

---

## Hạn mức gọi

Tài khoản đang dùng là gói Education và **có hạn mức lời gọi Figma MCP**. Đã chạm
hạn mức thật khi chạy nhiều agent song song.

- Chờ rồi thử lại, đừng bỏ cuộc sau một lần lỗi.
- ⛔ Số đo nào chưa lấy được thì **ghi rõ là chưa lấy được**, đừng đoán im lặng.
- Chạy nhiều agent đọc Figma cùng lúc thì chia theo section, và chấp nhận có
  agent phải chờ.

---

## Các section đã dựng thành component

| Section           | nodeId                    | Component                                                         |
| ----------------- | ------------------------- | ----------------------------------------------------------------- |
| Empty State       | `259:96221` · `259:97281` | `EmptyState`                                                      |
| Skeleton          | `259:96411`               | `Skeleton` + 4 khối ghép                                          |
| Slider dot        | `259:97091`               | `SliderDot`                                                       |
| Chip              | `259:97097`               | `Chip`                                                            |
| Divider           | `259:97329`               | `Divider`                                                         |
| Tooltip           | `259:97688`               | `Tooltip` · `TooltipSheet`                                        |
| Screen Example    | `259:97528`               | `Alert` `Progress` `ListItem` `Input` `AppBar` `BottomNav` `Card` |
| HTML (điều khoản) | `259:97506`               | — màn hình, chưa dựng                                             |
| Quy định webview  | `193:25214`               | → `docs/rules/webview.md`                                         |

Ghi chú thiết kế trong file (khung vàng "Design Note") là **quy định bắt buộc**,
không phải gợi ý — ví dụ ngưỡng 4 cấp nội dung của Tooltip ("Max 2 dòng, 56 ký
tự bao gồm cả dấu cách") đã được mã hoá thành hằng số trong `tooltip.constants.ts`.
