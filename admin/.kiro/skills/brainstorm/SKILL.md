---
name: brainstorm
description: Debate kiến trúc/trade-off trước khi implement — không tự chốt 1 phương án khi có ≥2 lựa chọn hợp lý ảnh hưởng nhiều tới codebase. Dùng trước khi bắt đầu 1 thay đổi lớn/khó đảo ngược.
---

# Brainstorm — cân nhắc trade-off trước khi code

Dùng khi quyết định KHÓ ĐẢO NGƯỢC hoặc ảnh hưởng NHIỀU FILE: thêm 1 layer
kiến trúc mới, đổi cách 1 hệ thống con hoạt động (routing, state, data
fetching pattern), chọn giữa mở rộng component có sẵn vs tạo mới. Không cần
cho quyết định nhỏ, cục bộ, dễ sửa lại.

## Quy trình

1. **Phát biểu vấn đề bằng 1-2 câu** — không mô tả sẵn giải pháp, chỉ mô tả
   RÀNG BUỘC/MỤC TIÊU thật.
2. **Liệt kê ≥2 phương án khả thi** (kể cả phương án "không làm gì cả" nếu
   hợp lý). Với mỗi phương án, dùng đúng nguyên tắc 3R của kit2 làm lăng
   kính nếu liên quan tới UI: REUSE luôn rẻ hơn EXTEND, EXTEND luôn rẻ hơn
   CREATE — nêu rõ đang chọn ở mức nào và vì sao mức rẻ hơn không đủ.
3. **So sánh trade-off cụ thể** — không nói chung chung "phương án A tốt
   hơn", nói RÕ: A tốn công hơn ở đâu, B rủi ro gì nếu sai, cái nào dễ sửa
   lại nếu chọn nhầm (chi phí đảo ngược là tiêu chí quan trọng nhất khi 2
   phương án gần ngang nhau).
4. **Đề xuất 1 phương án + lý do**, KHÔNG liệt kê rồi để user tự chọn nếu
   bản thân đã đủ dữ kiện để có khuyến nghị rõ ràng — brainstorm để quyết
   định nhanh hơn, không phải để né trách nhiệm đề xuất.
5. Nếu phương án được chọn tạo ra 1 pattern MỚI sẽ lặp lại nhiều nơi → cân
   nhắc dùng skill `docs` viết rule ngay khi implement xong, đừng để pattern
   sống chỉ trong đầu người vừa quyết định.

## Câu hỏi hay dùng để ép rõ trade-off

- "Nếu sai, sửa lại tốn bao nhiêu?" (chi phí đảo ngược)
- "Có component/pattern nào trong kit2/`docs/rules/` đã giải quyết gần đúng
  vấn đề này chưa?" (tránh phát minh lại — xem `reuse-first.md`)
- "Phương án nào ít file phải đổi nhất để đạt cùng mục tiêu?" (không phải
  lúc nào cũng thắng, nhưng luôn đáng hỏi)
- "6 tháng nữa có ai hiểu được quyết định này không cần hỏi lại không?"

## Không phải lúc nào cũng cần skill này

Quyết định có thể sửa lại trong 5 phút nếu sai (đặt tên biến, chọn `size`
prop nào cho 1 component) — cứ chọn và làm, không cần debate. Dùng
`brainstorm` khi chi phí SAI thật sự cao, không phải cho mọi lựa chọn nhỏ.
