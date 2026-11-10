---
name: peral-artwork-print-canvas
description: >-
  Dựng canvas / file in của Artwork Peral: trang đúng print layout của phôi, đo vị trí từ brief,
  nền full bleed, ảnh & chữ đặt đúng mặt, nhiều mặt (cốc wrap), mặt sau, khuôn cắt mica + lỗ treo,
  print script cho mã khó, xuất và soát file in. Dùng khi user nói "file in", "canvas", "đặt vị trí",
  "khuôn cắt", "mặt sau", "2 mặt", "in sai khổ", "file in không có nền", "code riêng cho mã".
---

# Peral · Canvas & file in của Artwork

> **Luật bắt buộc** (`webtools/AGENTS.md`): mọi thay đổi qua MCP `od_*` (CLI `webtools/mcp/scripts/call.ts` khi chưa nối); không sửa code cho một mã — mã khó dùng print script (§6).

Canvas artwork **chính là file in**: mỗi print layout của phôi là một trang cùng khổ, thấy gì in nấy. Phần khách điền: skill `peral-artwork-customer-options`. Quy trình chung: `peral-create-artwork`.

## 1. Khổ in từ phôi, không tự đặt

1. `od_get_print_layouts(slug)` — key, width × height, DPI, template guide. Layout `declared: false` / khổ mặc định 864×1152 → phôi chưa có layout: dừng, khai báo bằng `od_set_print_layouts` (skill `peral-add-product-base`, cần user đồng ý vì là dữ liệu dùng chung).
2. `od_get_product_base_guide(slug)` — vùng mặt, đường nối, vị trí chuẩn. Guide rỗng → đọc template TIF / PSD của xưởng rồi ghi guide (`od_update_product_base` `agent_doc`) sau artwork đầu tiên.
3. Brief / PSD của designer có cùng khổ với template xưởng → dùng làm thước: đo bbox từng thành phần (ảnh, tên, nền) theo pixel và đặt layer đúng số đo đó (ví dụ TMBLG: tên `x 553 y 282 w 360 h 810` xoay −90°; pet `x 415 y 1246 w 869`).
4. Kiểu có ô khác tỉ lệ (Heart / Circle) → template riêng (`od_artwork_duplicate_template`), không kéo giãn canvas.

## 2. Lớp in

| Việc | Layer | Lưu ý |
| --- | --- | --- |
| Nền / thiết kế cố định | `static-photo` (hoặc `clipart-category` khi khách chọn nền) | full bleed đúng khổ trang; **không** đặt vào layer Product Base (blank) — blank không in |
| Ảnh khách | `photo-upload` | `fit: "contain"`, `fitAlign: "bottom"` (pet "ngồi" mép dưới) hoặc `"top"` (charm cần chạm vòng treo), `trim: true` |
| Tên | `text` | font studio, `autoscale`, `textCase`; chữ dọc: `rotation: -90`, đặt `x` = mép trái, `y` = mép **dưới** khung, `width` = chiều dài chữ |
| Bản sao mặt khác | `static-photo` / `text` `cloneOf` | `customizationType: "no_customization"` |
| Khuôn cắt theo ảnh khách | `cut-silhouette` `cloneOf` ảnh | `cutPaddingPx` 12–24, cùng khung với ảnh ở band in |
| Vòng treo / dải nối | `static-photo` ở band cut | hình đen, lỗ trong suốt; tách từ PSD xưởng nếu có |

Chuẩn thẩm mỹ (không ship "ảnh + chữ trên nền trắng"): nền phủ kín, ảnh pet thật đã xoá nền, font đẹp, mọi mặt nhìn thấy đều có thiết kế. Cỡ chữ đo theo mockup mẫu: chữ hoa ≈ 6–8% chiều cao băng in, script lớn hơn sans ~1.5×.

## 3. Cốc / tumbler (wrap)

- Wrap một trang (WST 3057×981, skinny 20oz 2799×2445). Mặt trái / phải theo guide (Printway: tâm ≈ W/4 và 3W/4; TMBLG brief: 849 và 2191). Không đặt chữ / mặt lên mép 0 / W (đường nối).
- Mặt 2 = bản sao (`cloneOf`). Nền: `webtools/tools/make_pattern_backgrounds.py` hoặc ảnh nền của designer đúng khổ.

## 4. Mặt sau / 2 mặt

- Trang mặt sau theo print layout; layer mặt sau `side` = key trang, lật bằng `flipH` từng layer.
- Chỉ in khi 2 mặt: `condition` `__sides` = 2 (`show_by_default: true`).
- Light box SX (2518×5036, ô cut trên / ô front dưới, inset 59): nhân bản từ artwork SX có sẵn (`od_duplicate_artwork`) rồi thay ảnh cut / design / chữ — giữ nguyên quy ước bản 2 mặt.

## 5. Khuôn cắt (mica / charm / ornament)

- Band cut và band in đúng template (CSPC 508×1017: cut trên, in dưới từ y 509). Khuôn chỉ nằm ở band cut — không vẽ die / lỗ lên band in.
- Viền ~1–2 mm quanh phần in; lỗ treo + dải nối phải **chạm** dáng ảnh (ảnh `fitAlign: "top"`, dải nối kéo xuống đủ sâu).
- Phần in nằm giữa khuôn; mặt sau là bản lật.

## 6. Mã khó — print script (dữ liệu, không deploy)

Editor không làm được (lót trắng theo dáng, ghép ảnh theo luật riêng, uốn chữ, chỉnh màu, xếp ô đặc biệt):
1. `od_print_script_guide` → danh sách `api.*` (ảnh là handle số, `0` = file in; kích thước bọc `api.px()` cho preview).
2. Viết `.py` → `od_artwork_set_print_script(artwork_id, code_file, files=[key])` hoặc riêng sản phẩm campaign `od_campaign_set_print_script`. Code rỗng = gỡ.
3. Log / lỗi nằm trong `warnings` của `od_artwork_print_file` / `od_campaign_print_file`.
Chỉ đổi chữ / ảnh / ẩn hiện theo câu trả lời → layer `user-code` thường (chạy trước khi vẽ).

## 7. Soát file in trước khi báo xong

1. `od_artwork_print_file` / `od_campaign_print_file` với 2–3 bộ giá trị khác nhau — **mở PNG ra xem**: đúng khổ, có nền, đủ các mặt, chữ không bị cắt, ảnh khách đúng chỗ, khuôn khớp.
2. `webtools/backend/.venv/Scripts/python webtools/tools/peral_check.py artwork <id>` (đặt `WEBTOOLS_API_URL=https://peral.top`) — 0 FAIL.
3. `od_validate_artwork` → `od_publish_artwork`.
4. Sửa artwork đang bán: `od_artwork_save_version`, xuất trước / sau và so pixel — chỉ đổi đúng chỗ.

## Không được

- Đặt thiết kế vào layer Product Base (blank); dán template TIF vào file in.
- Đổi kích thước canvas hàng loạt; tự bịa khổ in / bleed.
- Bật biến thể 2 mặt khi artwork chỉ có 1 mặt.

## Mẫu đã làm

`WSTLG22082601` (wine tumbler wrap 2 mặt), `TMBLG07102603` (skinny tumbler, tên dọc), `SXMT25052603` (light box cut + design), `CCVLG29102602` (charm mica, khuôn theo ảnh + vòng treo).
