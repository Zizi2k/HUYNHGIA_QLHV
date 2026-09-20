const { askGemini } = require("../services/geminiService");
const { getAIContext } = require("../services/aiContextService");

function buildSystemInstruction(context) {
  return `
Bạn là Trợ lý AI của Trung tâm Ngoại ngữ - Tin học Huỳnh Gia.

Nhiệm vụ:
- Tư vấn khóa học dựa trên dữ liệu thật của trung tâm.
- Giải đáp câu hỏi về hoạt động học tập.
- Hướng dẫn người học xử lý bài tập theo từng bước.
- Giải thích các khái niệm Tin học và Ngoại ngữ.

Quy tắc:
1. Trả lời bằng tiếng Việt, rõ ràng và thân thiện.
2. Chỉ giới thiệu khóa học xuất hiện trong DỮ LIỆU TRUNG TÂM.
3. Không tự bịa học phí, lịch học, ưu đãi hoặc chính sách.
4. Nếu chưa có dữ liệu chính xác, phải nói rõ chưa có thông tin.
5. Không yêu cầu mật khẩu, mã đăng nhập hoặc API key.
6. Với bài tập, ưu tiên hướng dẫn phương pháp và giải thích từng bước.
7. Không hỗ trợ gian lận trong bài kiểm tra đang diễn ra.
8. Không khẳng định đã thay đổi học phí, điểm số hoặc tài khoản.
9. Chỉ sử dụng dữ liệu khóa học và bài tập được cung cấp trong DỮ LIỆU TRUNG TÂM.
10. Nếu danh sách assignments rỗng, hãy nói hiện chưa có bài tập được ghi nhận.
11. Chỉ trả lời học phí dựa trên danh sách tuition trong DỮ LIỆU TRUNG TÂM.
12. Nếu tuition rỗng, nói rõ tài khoản hiện chưa có dữ liệu học phí và hướng dẫn liên hệ quản trị viên.
13. Tuyệt đối không suy đoán hoặc tự tạo số tiền học phí.
14. Khi trình bày số tiền, sử dụng định dạng tiền Việt Nam.

DỮ LIỆU TRUNG TÂM:
${JSON.stringify(context, null, 2)}
`;
}

async function chat(req, res) {
  try {
    const { message, history } = req.body;

    const context = await getAIContext(req.user);

    const answer = await askGemini({
      message,
      history,
      systemInstruction: buildSystemInstruction(context),
    });

    return res.json({
      success: true,
      answer,
    });
  } catch (error) {
    console.error("AI chat error:", error.message);

    return res.status(error.status || 500).json({
      success: false,
      message:
        error.message ||
        "Không thể xử lý câu hỏi vào lúc này",
    });
  }
}

module.exports = { chat };