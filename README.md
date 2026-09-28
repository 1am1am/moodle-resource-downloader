# Moodle Course Resource Downloader (FIT@HCMUS & Moodle LMS)

Extension hỗ trợ sinh viên tải toàn bộ tài liệu học tập (PDF, Slide, Bài giảng, Đề bài...) của một môn học trên trang Moodle của trường chỉ với **1 click**.

---

## 🌟 Tính năng nổi bật

1. **Tự động quét tài liệu:** Tự nhận diện tên môn học, các phân mục (General, Ôn tập, WEEK 1, WEEK 2...).
2. **Nút bấm trực quan trên trang:** Tự động gắn nút nổi `[ 📥 Tải tài liệu ]` ở góc dưới bên phải trang môn học.
3. **Phân chia thư mục thông minh:** Tự động tạo thư mục tải về theo cấu trúc:
   ```text
   Downloads/
   └── [Tên môn học]/
       ├── General/
       │   └── Course_Syllabus.pdf
       ├── WEEK 6/
       │   └── Bai06_Thiet_ke_CPU_LEGv8.pdf
       └── WEEK 7/
           └── Chap9_Storage_System.pdf
   ```
4. **Tùy chọn linh hoạt:**
   - Chọn tất cả / Bỏ chọn từng file hoặc từng tuần.
   - Bật/tắt phân chia thư mục con theo tuần/chương.
   - Tùy chọn đánh số thứ tự file (`01_...`, `02_...`).
5. **Chống nghẽn & giữ phiên đăng nhập:** Chạy trực tiếp qua Chrome Downloads API với session đăng nhập Moodle của bạn, có cơ chế delay nhẹ giữa các file để tránh bị Moodle chặn lượt truy cập nhanh.

---

## 🚀 Hướng dẫn cài đặt vào Google Chrome (Chỉ mất 30 giây)

1. Mở trình duyệt Google Chrome hoặc Microsoft Edge, Cốc Cốc, Brave.
2. Nhập vào thanh địa chỉ:
   ```text
   chrome://extensions
   ```
   (và nhấn **Enter**).
3. Bật công tắc **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải màn hình.
4. Bấm vào nút **Load unpacked (Tải tiện ích đã giải nén)** ở góc trên bên trái.
5. Chọn thư mục chứa tiện ích:
   ```text
   C:\Users\Lam\.gemini\antigravity\scratch\moodle-downloader-extension
   ```
6. Tiện ích **Moodle Course Resource Downloader** sẽ xuất hiện trên danh sách extension của bạn!

---

## 📖 Cách sử dụng

1. Truy cập vào trang môn học trên Moodle (ví dụ: `https://courses.ctda.hcmus.edu.vn/course/view.php?id=4907`).
2. Nếu trang đang mở sẵn trước khi cài extension, hãy bấm **F5 (Tải lại trang)**.
3. Bạn sẽ thấy 2 cách để tải:
   - **Cách 1:** Nhìn xuống góc dưới bên phải màn hình web, bạn sẽ thấy nút xanh nổi **`[ 📥 Tải tài liệu (X) ]`**. Bấm vào để mở bảng chọn và tải.
   - **Cách 2:** Bấm vào biểu tượng tiện ích trên thanh công cụ của Chrome (Extension Toolbar).
4. Xem danh sách các file được gom nhóm theo từng tuần, chọn các file muốn tải và bấm **🚀 Tải các file đã chọn**.
