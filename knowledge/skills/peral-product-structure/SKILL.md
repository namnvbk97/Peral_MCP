---
name: peral-product-structure
description: >-
  Luật dựng Product Base / Artwork / Campaign trên Peral (CreTip) khi một phôi xưởng có nhiều kiểu
  dáng, pack, một/hai mặt, hoặc có khuôn cắt. Dùng khi tạo hay gộp phôi, thêm template cho Style,
  chuyển artwork sang phôi khác, gắn Style với template trong campaign, hoặc sửa editor campaign/artwork.
---

# Peral · Cấu trúc phôi → artwork → campaign

> **Luật bắt buộc** (chi tiết: `webtools/AGENTS.md` → "Luật bắt buộc cho Agent"):
> 1. Liệt kê / tạo / sửa artwork, campaign, phôi **chỉ qua MCP `od_*`** (hoặc CLI `webtools/mcp/scripts/call.ts` khi chưa nối). Hạn chế tối đa sửa code; thiếu tính năng thì làm bằng dữ liệu và hỏi user trước khi đụng code.
> 2. Preview / mockup campaign phải **giống sản phẩm thật nhất**: ảnh chụp thật của phôi + file in thật ghép lên (hình trụ cho cốc, viền mica cho đồ cắt), preview form mode scene kiểm bằng `od_campaign_live_preview`.

Đọc thêm `webtools/mcp/AGENT-POD.md` (tool `od_agent_guide`). Mọi thay đổi dữ liệu đi qua MCP `od_*` / API, không ghi file data.

## Những lỗi đã gặp — không lặp lại

| Lỗi | Đúng |
| --- | --- |
| 4 Product Base cho 4 kiểu ornament của cùng phôi Printway CRORM | 1 base, `options` Style × Pack, 20 biến thể `"Heart / 2PCS"` |
| Product Base riêng cho một artwork (sheet thành phẩm làm template `print`) | Artwork về phôi xưởng; thiết kế và khuôn là các vùng trên trang file in của artwork |
| File die gắn trên Product Base | Base chỉ có ô `cut`; artwork tải hình cắt |
| Circle và Heart dùng chung template 898×898, Heart in bị cắt 23px | Template riêng cho Heart, canvas 898×852 (nhân bản rồi dời layer) |
| Template Star khác Circle: nền, mặc định, picker, thứ tự layer, điều kiện `__sides` | Nhân bản từ template chuẩn; chỉ khác vị trí / kích thước |
| Tạo thumbnail làm canvas mọi template về 898×898 | Template giữ kích thước riêng; kiểm tra lại sau thao tác hàng loạt |
| Bật biến thể 2 mặt cho artwork một mặt | Chỉ bật biến thể artwork in được |
| Ô chọn mẫu là combobox, ảnh vuông không thấy hình dáng | Ô ảnh, thumbnail cắt theo hình dáng Style |
| Khối Style/Pack đè lên form | Khối có nội dung thay đổi tự giãn và đẩy khối dưới |
| Campaign editor tự lưu, không có Close để huỷ | Undo / Redo, Save mới ghi, Close hỏi và bỏ thay đổi |

## Quy trình gộp phôi / chuyển artwork

1. `od_get_product_base` các phôi cũ, `od_get_print_layouts` từng phôi.
2. Xuất file in mẫu trước (mỗi Style × vài Pack) qua print-file của campaign.
3. `od_duplicate_product_base` phôi chuẩn → upload file của Style khác (`kind=layout`) → `od_set_print_layouts` với `sizes[<Style>]` → `od_update_product_base` với `options`, `variants`, `sizes`.
4. Campaign: thêm sản phẩm trên phôi mới, chép giá / giá gạch / SKU cũ, `template_by_option`, chuyển mockup, bỏ sản phẩm cũ.
5. `od_artwork_move_to_base`.
6. Xuất lại, so pixel. Giống hệt mới tiếp. Phôi cũ xoá (vào `_trash`) khi usage rỗng.
