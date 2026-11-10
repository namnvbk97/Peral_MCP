---
name: peral-add-product-base
description: >-
  Thêm hoặc sửa một Product Base (phôi xưởng) trên Peral / CreTip: lấy thông tin từ trang nhà cung cấp
  (Printway, Onospod…), SKU + giá vốn thật, options (size / kiểu / pack / số mặt), Print Layout khớp
  template của xưởng, luật in 2 mặt. Dùng khi user đưa link sản phẩm xưởng hoặc file template và bảo
  "thêm phôi / product base", "check product base này", "gộp phôi", "thêm size / 1 mặt 2 mặt".
  Cào hàng loạt và thứ tự tool nằm ở skill peral-scrape-product-base.
---

# Peral · Thêm Product Base

> **Luật bắt buộc** (chi tiết: `webtools/AGENTS.md` → "Luật bắt buộc cho Agent"):
> 1. Liệt kê / tạo / sửa artwork, campaign, phôi **chỉ qua MCP `od_*`** (hoặc CLI `webtools/mcp/scripts/call.ts` khi chưa nối). Hạn chế tối đa sửa code; thiếu tính năng thì làm bằng dữ liệu và hỏi user trước khi đụng code.
> 2. Preview / mockup campaign phải **giống sản phẩm thật nhất**: ảnh chụp thật của phôi + file in thật ghép lên (hình trụ cho cốc, viền mica cho đồ cắt), preview form mode scene kiểm bằng `od_campaign_live_preview`.

Product Base = **một phôi của một xưởng**. Nó khoá: SKU nhà fulfill, giá vốn, size, khổ file in, DPI, vị trí ô in, ô cắt. Artwork và campaign dựng trên nó, nên sai ở đây là sai cả file in.

Luật chung: `webtools/AGENTS.md`, `webtools/mcp/AGENT-POD.md` (tool `od_agent_guide`), skill `peral-product-structure`.
**Mọi thay đổi dữ liệu đi qua MCP `od_*` hoặc API** — không ghi file trong `backend/data` hay `products/`.

## Nhiều phôi từ catalog Lark

Làm đúng skill `peral-scrape-product-base`: catalog → `catalog_bases.py` → template Lark bằng `lark_drive.py` → `peral_check.py`. Không cào từng trang bằng model.

- Printway và Merchize: file in `png`. Onospod: file in `jpg`.
- Chỉ tạo biến thể khi có SKU và giá vốn. Không điền DPI hay khổ pixel nếu xưởng không ghi.
- Một link = một base. Mã đã có trên shop thì bỏ qua, không tạo bản thứ hai.

## Tài liệu cho agent

Tab **Tài liệu** trên form Product Base (không phải JSON nâng cao) lưu `agentDoc`. Lưu xong, API ghi cùng nội dung ra `products/<slug>/AGENT.md`. Ghi cách in, vị trí ảnh, font, màu chữ. Agent đọc file đó trước khi tạo artwork.

## 0. Trước khi tạo: có sẵn chưa?

1. `od_list_product_bases` — tìm theo tên / supplier / catalog code (vd `CSAKC`, `CRORM`).
2. Có rồi → `od_get_product_base_json` và **sửa** cái đó. Không tạo base thứ hai cho cùng một phôi xưởng.
3. Một phôi xưởng có nhiều kiểu (Circle / Heart / Star, 1 mặt / 2 mặt, pack 1–5) vẫn là **một** base với `options`, không phải nhiều base.

## 1. Thu thập dữ liệu thật — không bịa

Chạy `webtools/tools/supplier_blank.py` (skill `peral-supplier-blank`) trước. Đọc `blank.json`. Không cào lại trang bằng model.

| Cần | Lấy ở đâu |
| --- | --- |
| Tên, mô tả, chất liệu, thời gian sx/ship | Trang sản phẩm của xưởng (link user đưa) |
| **SKU nhà fulfill** từng biến thể | Printway: `od_printway_sku_search` (store_id, connection_id của shop, q = mã catalog). Onospod: SKU trong catalog / bảng import. Ví dụ Printway: `PW-CSAKC-2X2 INCHES-TWO SIDES` |
| **Giá vốn** từng biến thể | Bảng giá / báo giá của xưởng. 1 mặt và 2 mặt thường khác giá — lấy đúng từng biến thể |
| Khổ file in, DPI, ô cắt / mặt trước / mặt sau, vùng an toàn, lỗ treo | **Template TIF / PNG của xưởng** (đọc chữ trên template, đo pixel) |

Thiếu số nào thì hỏi user. Không đoán bleed, khổ sheet, giá vốn, hay đầu giá nào là 1 mặt / 2 mặt.

## 2. Options và biến thể

- Tối đa 3 option (giới hạn Shopify). Ví dụ `[{name:"Size",values:["2x2 inches","3x3 inches"]},{name:"Sides",values:["ONE SIDE","TWO SIDES"]}]`.
- Mỗi tổ hợp là **một** biến thể: `size` = giá trị option nối bằng `" / "` → `"3x3 inches / TWO SIDES"`, kèm `options: {Size:"3x3 inches", Sides:"TWO SIDES"}`, `sku`, `baseCost`.
- Pack (2PCS, 3PCS…) của một SKU lẻ: `pieces: 3` — Peral đặt 3 cái SKU lẻ.
- **Bán 1 mặt / 2 mặt**: mỗi biến thể có `sides: 1|2` (hoặc `titles: ["ONE SIDE"]`). Artwork đánh dấu layer mặt sau "Ẩn khi ONE SIDE" (điều kiện `__sides` = 2); lật gương do `flipH` từng layer. ONE SIDE cần file khác cỡ thì ghi đè `sizes[<size>]` (width / height / template / align).
- Tạo: `od_create_product_base` (name, supplier, source_url, category, options, variants, sizes, store_ids…). Sửa: `od_update_product_base` (cùng trường).

## 3. Print Layout — khớp template xưởng

1. Upload template: `od_upload_product_base_file` với `kind: "layout"` (chỉ lưu, dùng làm guide). Template khác theo size / kiểu → upload từng file.
2. `od_set_print_layouts` — mỗi layout: `width`, `height` = **đúng pixel của template**, `dpi`, `format: "png"`, `transparent: true`, `templateMode: "guide"` (**không bao giờ `print`** — template không được dán vào file xuất), `template` = đường dẫn file vừa upload.
3. Không có ô slot / cut: mỗi file in = một trang artwork cùng kích thước. Mặt trước, mặt sau, shape cắt là vùng trên trang artwork (vd keychain: 3 ô 960×960 từ trên xuống).
   - `layers` chỉ còn dấu in thêm: `image`, `text` (mã order), `code`.
   - Shape cắt cho preview khách: `mask` (PNG trắng = sản phẩm, cùng cỡ file), `maskPrint` để cắt cả file in. Mặt gửi xưởng: `side` (mặc định = key).
4. Kích thước khác theo size / kiểu: `sizes: {"2x3 inches": {width: 660, template: "...", align: "left"}}` — khoá là một giá trị option (vd `"Heart"`), áp cho mọi biến thể có giá trị đó. Trang artwork khác cỡ file thì `fit` (cover / contain) + `align` quyết định.
5. Đọc lại bằng `od_get_print_layouts` (có `size`) cho từng kiểu.

Template mica Printway (ví dụ keychain): sheet 960×2880 = 3 ô 960×960 từ trên xuống: **cut / front / back**; vùng an toàn 900×900 (cách mép 30px); lỗ treo Ø35px, vành nhựa quanh lỗ 24–47px (2–4mm); nét nhỏ nhất 24px; mặt sau lật so với mặt trước.

## 4. Kiểm tra trước khi báo xong

```bash
webtools/backend/.venv/Scripts/python webtools/tools/peral_check.py base <slug>
```

Phải **0 FAIL**: biến thể đủ SKU + giá vốn, option đủ tổ hợp, `size` đúng dạng, layout khớp khổ template, không còn layer slot / cut.

Rồi báo user: SKU, giá vốn (nguồn lấy), options, layout, chỗ còn WARN. Nhắc giá bán đặt ở campaign, không ở base.

## Không được

- Tạo base riêng cho một artwork, hay một base cho mỗi kiểu của cùng phôi.
- Bịa SKU / giá vốn / khổ in / bleed. Đặt `templateMode: "print"`.
- Gọi Onospod `POST /order/create/test` (tạo **đơn thật**).
- Đưa token / API key vào file, chat, hay tài liệu.
