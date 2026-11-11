---
name: peral-create-campaign
description: >-
  Tạo hoặc sửa Campaign (sản phẩm đem bán) trên Peral / CreTip: gắn artwork với Product Base, bật biến thể,
  giá bán / giá gạch, gắn Style → template, mockup, listing, xuất file in thử từng biến thể, publish lên
  Shopify. Dùng khi user bảo "tạo campaign", "lên sản phẩm", "bật size", "đổi giá", "gắn template theo kiểu",
  "mockup", "publish".
---

# Peral · Tạo Campaign

> **Luật bắt buộc** (chi tiết: `webtools/AGENTS.md` → "Luật bắt buộc cho Agent"):
> 1. Liệt kê / tạo / sửa artwork, campaign, phôi **chỉ qua MCP `od_*`** (hoặc CLI `webtools/mcp/scripts/call.ts` khi chưa nối). Hạn chế tối đa sửa code; thiếu tính năng thì làm bằng dữ liệu và hỏi user trước khi đụng code.
> 2. Preview / mockup campaign phải **giống sản phẩm thật nhất**: ảnh chụp thật của phôi + file in thật ghép lên (hình trụ cho cốc, viền mica cho đồ cắt), preview form mode scene kiểm bằng `od_campaign_live_preview`.

Campaign = **một artwork trên một Product Base đem bán**: biến thể bật, giá, mockup, listing. File in của đơn xuất từ campaign. Storefront Shopify là form khách thấy.

Luật chung: `webtools/AGENTS.md`, `webtools/mcp/AGENT-POD.md`, skill `peral-product-structure`. Mọi thay đổi qua MCP `od_*`.


## Mã đặc biệt — print script (không sửa code, không deploy)

Khi một artwork / campaign cần thứ editor không làm được (lót trắng theo dáng ảnh, ghép nhiều ảnh theo luật riêng, uốn chữ, chỉnh màu riêng, xếp ô đặc biệt…):

1. `od_print_script_guide` — đọc danh sách `api.*`.
2. Viết script ra file `.py` (sandbox: không `import`, không tên bắt đầu `_`, timeout 30 s). Ảnh là handle số, `0` = file in đang vẽ; kích thước theo pixel file in, bọc bằng `api.px(...)` để preview khớp.
3. Gắn: `od_artwork_set_print_script(artwork_id, code_file, files=[key file in])` (mọi campaign dùng artwork) hoặc `od_campaign_set_print_script(campaign_id, product_id, code_file)` (chỉ sản phẩm đó). Code rỗng = gỡ.
4. Kiểm: `od_artwork_print_file` / `od_campaign_print_file` — log `api.log()` và lỗi nằm trong `warnings`; mở PNG ra xem; `od_campaign_live_preview` cho preview.
5. Đổi chữ / ảnh / ẩn hiện layer theo câu trả lời của khách thì dùng layer `user-code` thường (chạy trước khi vẽ), không cần print script.

## 1. Điều kiện trước

- Product Base đã qua `peral_check.py base` (0 FAIL) — skill `peral-add-product-base`.
- Artwork đã qua `peral_check.py artwork` và file in mở ra đúng — skill `peral-create-artwork`.

## 2. Tạo

1. `od_create_campaign` (artwork_id, product_slug nếu khác phôi của artwork, sizes = các biến thể bán được, store_id, channel).
2. **Một sản phẩm cho cả phôi.** Phôi có option kiểu dáng (Style) với template riêng → `od_campaign_update_product` với `template_by_option: {"Style": {"Heart": "<tpl-heart>", "Circle": "<tpl-circle>"}}`. Khách chọn Style bằng ô ảnh (thumbnail có hình dáng), không combobox.
3. Chỉ bật biến thể **artwork in được**: artwork 1 mặt thì không bật TWO SIDES; artwork chưa có template cho một kích thước (vd 2x3) thì để tắt.
4. Thêm phôi / artwork khác vào cùng campaign: `od_campaign_add_product`.
5. **Đặt thiết kế lên phôi (Placement) tự chạy.** Sản phẩm mới có placement auto-fit: mỗi file in khác tỉ lệ trang thiết kế > 2% được fit theo `shapeFamily` của format (round → contain · wrap → cover nếu lệch ≤ 10% · chữ nhật / free → cover khi có nền tràn, không thì contain). Gọi `od_campaign_placement` (action `check`) để lint + xuất thử. **Chỉ chỉnh khi lint báo** (P-FIT bị cắt, P-SAFE sát mép, P-TINY chữ < 6pt, P-GAP nền hở): `action: "set"`, `overrides: {"<size>": {fit, align, zoom, offsetX, offsetY}}`, rồi check lại. P-FMT (lệch > 10%) cần format riêng trong artwork, không chỉnh riêng. Hình dáng sai → `od_design_format_shape` (cho mọi campaign của thiết kế) hoặc `shape_family` trên placement (chỉ sản phẩm này). Sản phẩm cũ chưa có placement giữ nguyên file in; `action: "auto"` trên campaign đang bán cần `confirm: true` sau khi user xem file in thử.

## 3. Giá

- Giá vốn lấy từ Product Base (`baseCost`); campaign đặt **giá bán** và **giá gạch** (`compareAtPrice ≥ giá bán`). Giá bán phải > giá vốn.
- Theo quy tắc của shop: `od_campaign_reprice` (hệ số / cộng thêm); sửa tay từng biến thể bằng `variants` trong `od_campaign_update_product`.
- Đơn vị tiền mặc định theo Shop Settings (USD, EUR, VND…). **Không đổi đơn vị tiền mà giữ nguyên con số** — Peral không quy đổi tỷ giá.
- 1 mặt / 2 mặt: giá vốn khác nhau thì cân nhắc giá bán khác nhau; không tự quyết thay user.

## 4. Mockup và listing

- Mockup là ảnh quảng cáo, **không phải file in**. `od_campaign_generate_mockups` / `od_render_mockups`, ảnh chính `od_campaign_set_primary_mockup`. Mockup theo kiểu (Heart, Star…) dùng `options` trên mockup template.
- **Cốc / tumbler / mug**: mockup template warp phẳng ra tấm thẻ — không làm ảnh chính. Ghép lên **ảnh cốc thật** của xưởng bằng `webtools/tools/tumbler_scene_mockup.py` (file in từ `od_campaign_print_file`, 2–3 màu nền; ảnh + hình học ở `webtools/tools/mockup_scenes/<phôi>/`) → `od_campaign_add_mockup(file_path, is_primary: true)`. Không dùng cốc vẽ bằng code làm ảnh chính. Preview storefront: `od_campaign_update_product.preview` mode scene (ảnh cốc trơn + mask băng in + quad). Xoá mockup tấm phẳng nếu đã sinh. Mockup phải trông như ảnh đối thủ / ảnh user đưa; flat mockup chỉ là ảnh phụ.
- **Light box (SX) / charm mica (CCV, AT)**: `webtools/tools/lightbox_mockup.py --print <file 1 mặt>` (bật đèn nền tối + tắt đèn nền trắng, giống ảnh Printway); `webtools/tools/charm_mockup.py --print <sheet>` (dây + móc thật của ảnh Printway, mặt mica theo khuôn cắt). Cốc in kín màu (ảnh xưởng in màu cam toàn thân): scene `"erase": "colored"` trong `scenes.json`.
- **Preview form của light box**: `lightbox_mockup.py --print <file 1 mặt> --preview` ra scene + mask + quad → `preview` mode scene, `frame.crop {y:0.5,h:0.5}` (ô front). Không để mặc định — mặc định hiện nguyên tấm file in (khuôn đen). Chi tiết: `recipe:light-box-shape`.
- Preview form cho cốc: ảnh scene phải **sạch mẫu in của xưởng** (renderer nhân bóng từ ảnh scene → logo xưởng hiện lên) — dùng ảnh đã xoá / ảnh "white" trong `mockup_scenes/<phôi>/`.
- `od_campaign_generate_listing` cho tiêu đề / mô tả / tags; `od_validate_campaign` cảnh báo khi thiếu.

## 5. Kiểm tra trước khi publish

1. `od_campaign_form_preview` + `od_campaign_live_preview` (theo từng biến thể) — form đúng, ảnh xem trước đúng hình dáng và đúng số mặt.
2. ```bash
   webtools/backend/.venv/Scripts/python webtools/tools/peral_check.py campaign <campaign-id> --max-variants 8
   ```
   Lệnh này chạy validate, kiểm giá (bán > vốn, gạch ≥ bán), `template_by_option` đủ mọi Style, và **xuất file in thử từng biến thể** (không tạo đơn). Phải 0 FAIL; đọc kỹ WARN của file in.
3. Mở vài file in ra xem bằng mắt (1 mặt, 2 mặt, mỗi Style).
   Mỗi nhóm fit khác nhau: `od_render_matrix` (một file in thử cho mỗi format × khổ file × fit); `od_campaign_check` liệt kê tier + fit từng file + lint.
4. `od_publish_campaign` khi user đồng ý. Publish đẩy sản phẩm lên Shopify thật — hỏi trước.

## Không được

- Bật biến thể mà artwork không in được (2 mặt cho artwork 1 mặt, size chưa có template).
- Tạo nhiều sản phẩm cho các kiểu của cùng một phôi thay vì `template_by_option`.
- Publish khi chưa xuất thử file in.
- Đặt giá bán ≤ giá vốn, hoặc giá gạch < giá bán.
