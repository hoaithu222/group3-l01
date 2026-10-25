---
name: problem-solving
description: Kỹ thuật thoát bế tắc khi đã thử vài cách mà vẫn không giải quyết được vấn đề (không phải debug bug cụ thể — dùng skill "debug" cho việc đó). Dùng khi cảm thấy đang loanh quanh, thử đi thử lại cùng 1 hướng.
---

# Problem Solving — thoát bế tắc

Khác `debug`: `debug` dành cho 1 BUG cụ thể có triệu chứng rõ ràng. Skill
này dành cho tình huống rộng hơn — không rõ vấn đề nằm ở đâu, đã thử vài
hướng mà không tiến triển, hoặc giải pháp hiện tại càng làm càng phức tạp.

## Dấu hiệu cần dừng lại và đổi cách tiếp cận

- Đã sửa cùng 1 vùng code ≥3 lần liên tiếp mà vấn đề gốc vẫn còn.
- Giải pháp đang phình to dần (thêm tham số, thêm nhánh `if`) để vá từng
  case phát sinh — dấu hiệu đang đi sai model, không phải thiếu case.
- Không giải thích được TẠI SAO cách hiện tại nên đúng, chỉ đang "thử xem
  có được không".

## Kỹ thuật

**1. Thu nhỏ vấn đề tới mức tối thiểu tái hiện được.** Bỏ bớt điều kiện/dữ
liệu/component cho tới khi còn lại phần nhỏ nhất vẫn còn thấy vấn đề — phần
còn lại sau khi thu nhỏ thường chỉ ra chính xác gốc rễ.

**2. Giải thích lại vấn đề bằng lời, không nhìn code.** Nếu không diễn đạt
được vấn đề thành 1-2 câu rõ ràng, nghĩa là chưa thực sự hiểu nó — quay lại
điều tra (skill `debug`) trước khi thử thêm giải pháp.

**3. Đảo ngược câu hỏi.** Thay vì "làm sao để X hoạt động", hỏi "điều kiện
nào khiến X KHÔNG hoạt động" — đôi khi dễ liệt kê điều kiện phủ định hơn.

**4. Tìm pattern đã có sẵn trong repo trước khi tự nghĩ ra cái mới.** Vấn đề
tưởng mới thường đã có nơi khác trong codebase giải quyết theo cách tương
tự — `Grep` từ khoá liên quan trong `src/` và `docs/rules/` trước khi thiết
kế giải pháp từ đầu.

**5. Hỏi lại đúng câu hỏi.** Đôi khi bế tắc vì đang giải bài toán KHÔNG cần
giải — quay lại yêu cầu gốc, kiểm xem có cách đơn giản hơn để đạt cùng mục
tiêu mà bỏ qua hẳn vấn đề đang mắc kẹt hay không (nguyên tắc YAGNI/KISS ở
`docs/rules/development-rules.md`).

**6. Trình bày lại với user thay vì tự thử thêm.** Sau 3 lần thử không
thành, dấu hiệu rõ ràng nhất là giả định nền tảng đang sai — dừng, tóm tắt
đã thử gì/kết quả gì, hỏi thẳng thay vì thử lần thứ 4 một mình.

## Liên quan

`debug` (điều tra 1 bug cụ thể) · `brainstorm` (khi vấn đề là CHỌN giữa
nhiều phương án, không phải bế tắc kỹ thuật) · `fix` (quy trình sửa sau khi
đã xác định được root cause).
