---
name: peral-create-artwork
description: >-
  Tạo hoặc sửa Artwork (thiết kế khách cá nhân hoá) trên Peral / CreTip — quy trình chung: chọn đúng
  Product Base, dựng canvas / file in (skill peral-artwork-print-canvas), dựng form khách
  (skill peral-artwork-customer-options), kiểm và publish. Dùng khi user bảo "tạo artwork",
  "sửa artwork", "làm mã …", "artwork từ brief / PSD".
---

# Peral · Tạo Artwork (quy trình chung)

> **Luật bắt buộc** (chi tiết: `webtools/AGENTS.md` → "Luật bắt buộc cho Agent"):
> 1. Liệt kê / tạo / sửa artwork, campaign, phôi **chỉ qua MCP `od_*`** (hoặc CLI `webtools/mcp/scripts/call.ts` khi chưa nối). Hạn chế tối đa sửa code; thiếu tính năng thì làm bằng dữ liệu và hỏi user trước khi đụng code.
> 2. Preview / mockup campaign phải **giống sản phẩm thật nhất**: ảnh chụp thật của phôi + file in thật ghép lên.
> 3. Mã khó mà editor không làm được → **print script** (dữ liệu, không deploy).

Artwork = thiết kế khách cá nhân hoá **trên một Product Base**. Có hai phần, mỗi phần một skill:

| Phần | Skill | Nội dung |
| --- | --- | --- |
| **Canvas / file in** | `peral-artwork-print-canvas` | khổ trang theo print layout, đo vị trí từ brief, nền, ảnh, chữ, nhiều mặt, mặt sau, khuôn cắt, print script, soát file in |
| **Customer options (form)** | `peral-artwork-customer-options` | loại ô khách điền, kiểu hiển thị gọn (chấm màu / lưới ảnh / dropdown), màu chữ, font, mặc định, ảnh mẫu, Auto layout |

Session chưa nối MCP → CLI (env lấy từ `~/.cursor/mcp.json`):

```bash
cd webtools/mcp && npx tsx scripts/call.ts open-designer --list
cd webtools/mcp && npx tsx scripts/call.ts open-designer od_get_artwork '{"artwork_id":"…"}'
cd webtools/mcp && npx tsx scripts/call.ts open-designer od_artwork_update_layer @args.json
```

## Luật tool: chỉ dùng tool có trên thanh Tools của UI

Panel Layers chia đôi đúng như vậy: trên là **Canvas** (in ra file), dưới là **Customer Form** (ô khách điền, không vẽ lên canvas).

| Nhóm | Tool trên UI | `type` | Ghi chú |
| --- | --- | --- | --- |
| Canvas | Static Image | `static-photo` | ảnh design cố định |
| Canvas | **Place Image** | `place-image` | chỗ ảnh khách: **Khung** (layer box, nét đứt cam = vùng giới hạn, ảnh ra ngoài bị cắt) + **ROI Ảnh** (`imageBox`, px tính từ góc khung) |
| Canvas | Static Text | `static-text` | chữ in (tên khách đổ vào đây) |
| Canvas | Cut Silhouette | `cut-silhouette` | khuôn cắt |
| Form | Text | `text` + `formOnly: true` | 1 dòng |
| Form | **Multi-line Text** | `paragraph` + `formOnly: true` | khách bấm Enter xuống dòng; `autoscale` co theo cả chiều rộng lẫn chiều cao |
| Form | Photo Upload | `photo-upload` + `formOnly: true` | |
| Form | Clipart / Option / Move / Slot Group | như UI | |

Ô form đổ dữ liệu sang lớp canvas bằng **events** (không vẽ thẳng):
- Photo Upload → Place Image: `{"id":"ev-upload","on":"upload","target":["<place-image id>"],"prop":"src","frame":true}`
- Text / Multi-line Text → Static Text: `{"id":"ev-input","on":"input","target":["<static-text id>"],"prop":"text","from":"typed"}`
- Màu chữ (`color`): `bindTargetLayerId` = id Static Text, `bindMode: "fill"`.

**Không dùng kiểu cũ**: `photo-upload` / `text` vẽ thẳng trên canvas (không `formOnly`). Artwork cũ còn kiểu này thì chuyển, **giữ nguyên id ô form** (đơn và câu trả lời cũ khớp theo id), thêm lớp canvas mới `<id>-place` / `<id>-text` ngay trên nó trong thứ tự lớp, rồi so file in trước / sau. Mẫu đã chuyển: **PCVLG08102601** (ốp lưng 1–4 bé).

Place Image đặt thế nào:
- ROI Ảnh = đúng chỗ ảnh mẫu (giữ `fit`, `fitAlign`, `trim` như cũ) → file in không đổi.
- Khung đủ rộng để khách kéo / thu nhỏ ảnh thoải mái, nhưng trong vùng in: trải tới **đường cắt của phôi + ~20 px dư** (đo trên template của xưởng), tránh vùng camera / lỗ / chữ quan trọng. Ảnh mẫu chạm mép đáy thì khung xuống tới mép đáy, không dừng ở vùng an toàn.
- Ở bước Place, ảnh khách bắt đầu tại ROI Ảnh, kéo ra ngoài Khung thì bị cắt.

## Artwork ≠ Mockup Editor

- **Artwork = file in.** Chỉ lo đúng khổ, đúng vị trí, đúng nội dung in. Không dựng cảnh, bóng, ảnh phôi trong artwork để "preview cho đẹp".
- **Mockup Editor trong Edit Campaign** (ảnh chính / Main Image scene của campaign) = **preview giống ảnh thật**: ghép artwork lên ảnh chụp thật của phôi cho khách xem khi điền form. Preview sai → sửa ở Mockup Editor của campaign, không sửa artwork.

## Quy trình

1. **Phôi**: tìm theo mã sản phẩm (tiền tố mã = `productCode` phôi, ví dụ TMB / CCV / SX / WST). Danh sách mặc định có thể chỉ hiện phôi active — xem cả phôi archive của shop. `od_get_print_layouts` + `od_get_product_base_guide`. Phôi chưa có layout → khai báo trước (skill `peral-add-product-base`, hỏi user).
2. **Đọc brief**: thư mục mã (ví dụ `F:\GmdArtWork\<mã>`) có brief, PSD, nền, font. Đo bbox từng thành phần; font của designer → `od_upload_font`; nền → `od_upload_assets_folder`.
3. **Canvas / file in** → skill `peral-artwork-print-canvas`.
4. **Customer options** → skill `peral-artwork-customer-options`.
5. **Kiểm**: `od_artwork_form_preview`, `od_artwork_print_file` với 2–3 bộ giá trị (mở PNG xem), `peral_check.py artwork <id>` 0 FAIL, `od_validate_artwork` → `od_publish_artwork`.
6. **Campaign + mockup ảnh thật** → skill `peral-create-campaign`.
7. Phôi chưa có guide → ghi lại cách làm vào guide phôi (`od_update_product_base` `agent_doc`) để artwork sau không phải đoán.

## Không được

- Đặt thiết kế vào layer Product Base (blank); dán template TIF vào file in.
- Đổi kích thước canvas hàng loạt; bịa khổ in, bleed, giá.
- Bảng chọn dài (lưới ảnh cho hàng chục màu đặc) — dùng chấm màu; form xếp bằng `od_artwork_form_grid` (ô nhỏ cạnh nhau), không để mỗi ô một hàng.
- Sửa backend / frontend để làm xong một mã.
