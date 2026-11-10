# Peral knowledge — skill + recipe cho AI Agent

Nguồn chuẩn (có git, deploy cùng MCP) của mọi skill tạo phôi / artwork / campaign. Agent nào nối MCP
`open-designer` đều đọc được — Cursor, Claude Code, agent trên server — không phụ thuộc thư mục
`.cursor/skills` hay `.claude/skills` của từng máy.

| Thư mục | Nội dung | Đọc bằng |
| --- | --- | --- |
| `skills/<name>/SKILL.md` | Quy trình từng việc (phôi, canvas file in, form khách, campaign…) | `od_knowledge_get("skill:<name>")` |
| `recipes/<name>.md` | Công thức theo **loại sản phẩm** đã làm thật (khổ in, layer, form, mockup, bài học, id mẫu) | `od_knowledge_get("recipe:<name>")` |

Quy trình cho agent:
1. `od_agent_guide` (luật) → `od_knowledge_list` (danh mục).
2. Làm sản phẩm giống loại đã có → đọc recipe đó trước; có artwork mẫu tốt → `od_artwork_recipe(artwork_id)` để lấy cấu trúc thật.
3. Xong một loại sản phẩm mới → thêm recipe ở đây (frontmatter `name`, `description`, `products`, `example`).

Sửa skill ở đây rồi chạy `node scripts/sync-skills.mjs` để chép sang `.cursor/skills` và `.claude/skills` của máy.
Script hỗ trợ (mockup, nền, kiểm tra) nằm ở `webtools/tools/` trên máy làm việc.
