---
name: peral-artwork-customer-options
description: >-
  Dựng phần khách điền (customer options / form) của Artwork Peral: chọn loại control (ảnh, tên, nền,
  màu chữ, font, số lượng), kiểu hiển thị gọn (chấm màu, lưới ảnh, dropdown), mặc định, bắt buộc,
  thứ tự, ảnh mẫu, Auto layout và kiểm form. Dùng khi user nói "form khách", "options", "cho chọn màu /
  nền / font / màu chữ", "bảng chọn màu dài quá", "thêm ô nhập", "customer options".
---

# Peral · Customer options của Artwork

> **Luật bắt buộc** (`webtools/AGENTS.md` → "Luật bắt buộc cho Agent"): sửa qua MCP `od_*` (hoặc CLI `webtools/mcp/scripts/call.ts`, tham số dài dùng `@file.json`); không sửa code cho một mã; mã khó → print script (skill `peral-artwork-print-canvas`).

Form khách = các layer tương tác của artwork theo thứ tự `positions`. Khách chỉ thấy form, không thấy layer. Phần canvas / file in: skill `peral-artwork-print-canvas`. Quy trình chung: `peral-create-artwork`.

## 0. Nhiều mẫu trong một artwork (1 Pet / 2 Pets / 3 Pets)

Mỗi **tab** trên thanh template là một mẫu riêng (Teeinblue Template): layer và ô form thuộc tab đang mở. Khách chọn mẫu trước, form đổi theo tab đó. Một tab thì form không hiện ô chọn mẫu.

- **Tools → Template**: danh sách template của đúng artwork đó. **Thêm bản sao** (giữ layer), **Thêm trống** (chỉ Product Base), **Nhân bản**, **Xóa** (còn ít nhất một). Đổi tên ngay trên dòng. **Save** mới ghi. Thanh trên canvas (+ / ⧉ / 🗑) làm cùng việc.
- **Gom** (bảng Layers): tick layer → đặt tên → **Tạo tab**. Tab mới có Product Base + các layer đã tick. Tab cũ giữ nguyên.
- **✎**: ảnh khách chọn (thumbnail), **Ẩn trên cửa hàng**, **Mẫu gốc**. Mẫu gốc rồi **Đồng bộ option** chép nhãn / bắt buộc / lựa chọn / kiểu hiện sang layer cùng id ở tab khác. Vị trí và cỡ không đổi — muốn 1 Pet thì nhân bản mẫu 3 Pet rồi ẩn layer Pet 2 và Pet 3.
- **Khách chọn**: nhãn trên form, hiện bằng nút (có ảnh thì hiện ảnh) hoặc danh sách.

Không dùng tab này để đổi màu chữ theo nền. Việc đó vẫn là `condition` trên từng layer (§3).

## 1. Chỉ hỏi thứ khách thật sự chọn

Thứ tự chuẩn: **Nền / màu → Ảnh → Tên → Màu chữ → Font → tuỳ chọn phụ**. Layer chỉ để in (static, clone, cut, user-code, print script) đặt `customizationType: "no_customization"` — không thành ô nhập thứ hai.

| Khách làm gì | Layer | Cài đặt bắt buộc |
| --- | --- | --- |
| Tải ảnh pet / người | `photo-upload` | `formLabel`, `required`, `removeBackground: true` khi in kiểu cut-out; `photoStyles: true` cho khách chọn hiệu ứng sau khi tải (Hoạt hình, Comic, Pastel, Màu nước, Chì màu, Phác thảo — filter CPU, không AI); `src` = ảnh mẫu **thật** đã xoá nền |
| Gõ tên / chữ | `text` | `maxLength` (tên 12–18), `autoscale`, `defaultValue` mẫu, `required` |
| Chọn nền in (ảnh / hoạ tiết) | `clipart-category` | `value` = ảnh nền **đúng khổ trang in**, `thumbnail` = swatch nhỏ |
| Chọn màu đặc (chữ, nền trơn) | `color` | `options` `value` hex, `bindTargetLayerId` + `bindMode: "fill"` |
| Chọn font | `additional-option` (ảnh mẫu từng font) | xem §4 |
| Chọn thứ để bật / tắt layer | `additional-option` | dùng làm `condition` |

## 2. Kiểu hiển thị — không để form dài

| Lựa chọn | `displayType` | Vì sao |
| --- | --- | --- |
| Màu đặc, nền trơn (bất kể bao nhiêu màu) | **`color`** — chấm tròn 28px | 66 màu ≈ 6–7 hàng; dạng lưới ảnh 64px thành 14 hàng (lỗi TMBLG07102603) |
| Hoạ tiết / ảnh nền / clipart ≤ 12 | `image` (lưới ảnh) | khách cần thấy hoạ tiết |
| Hoạ tiết > 12 | `image` + `thumbnail` nhỏ, hoặc tách 2 bước (nhóm → mẫu) bằng `additional-option` + `condition` | |
| Chữ / số lượng / kiểu (Style) | `radio` (≤ 6) hoặc `dropdown` | |
| Style có hình dáng khác (Heart / Star) | `image` với thumbnail có **hình dáng** | luật `peral-product-structure` |

- `clipart-category` hiển thị `color` vẫn in bằng ảnh `value`: chấm tròn vẽ từ `thumbnail` → upload swatch **64×64** (không dùng ảnh nền khổ thật làm thumbnail: nặng, 66 ảnh cỡ in).
- Sau khi đổi: `od_artwork_form_grid` (§2b) rồi xem `formView.height` trong `od_artwork_form_preview` — ảnh + tên + 2 bảng màu ≈ 550–600px.

## 2b. Bố cục form — gọn, không cuộn

Khung form (Options ImageBox) rộng **400px**, lề 16, khoảng cách 12 → một hàng đầy = 368px. Mỗi ô có `formX / formY / formWidth / formHeight`; form xếp theo `y`, ô bị ẩn bởi điều kiện tự co (`formFlow: "stack"`).

Mẫu merchant đã chỉnh tay (TMBLG07102603, 790px → 600px):
- **Bảng chọn đặt trên, full width, liền nhau**: nền (66 chấm màu) rồi ngay dưới là màu chữ — các lựa chọn về màu ở một chỗ.
- **Ô nhỏ đặt cạnh nhau**: ảnh pet (≈170×122) | tên (≈175×72) chung một hàng, ô tên căn giữa theo chiều dọc với ô ảnh.
- Chiều cao bảng màu theo **chấm thật** (28px + 6 gap, ~10–11 chấm / hàng), không theo ô 44px.

Làm bằng tool: **`od_artwork_form_grid`** (thay cho `od_artwork_auto_form_layout` — tool đó xếp mỗi ô một hàng và tính bảng màu quá cao):
- Mặc định: bảng chọn (color / image / radio) mỗi bảng một hàng theo thứ tự form, sau đó các ô còn lại 2 ô / hàng. Tự đặt `positions` theo thứ tự nhìn thấy, `formFlow: "stack"`, chiều cao form.
- Tự chỉ định: `rows: [["layer-bg"],["layer-textcolor"],["layer-photo","layer-name"]]`, tỉ lệ cột `widths: {"2": [1, 1]}`; `dry_run: true` để xem trước.
- Không dàn 3 ô / hàng cho ảnh hoặc tên (quá hẹp trên mobile); ô ảnh tối thiểu ~160px rộng.
- Merchant đã tự chỉnh form → **không** chạy lại layout đè lên; chỉ sửa ô mới thêm.

## 3. Màu chữ

- Khách chọn (Trắng / Đen …): layer `color` "Text color", `bindTargetLayerId` = ô tên, `bindMode: "fill"`, mặc định = màu trong brief.
- **Binding chỉ đổi 1 layer.** Bản sao tên ở mặt kia (`cloneOf`) không ăn màu → mỗi màu một bản sao, `condition` theo layer màu chữ:
  `{"action":"show","match_type":"all","dependencies":[{"element":"layer-textcolor","value":["black"]}]}`.
- **Màu chữ tự đổi theo nền (không hỏi khách) → dùng `condition`**, không thêm thuộc tính riêng cho mã (mẫu: MCSMT17102603):
  1. Ô tên gốc `text` đặt `formOnly: true` ("Ẩn trên canvas": vẫn là ô nhập, không in).
  2. Mỗi option nền × mỗi mặt một `text` `cloneOf` ô gốc, `fill` = màu chữ của nền đó, `customizationType: "no_customization"`, `condition` `{"action":"show","match_type":"all","dependencies":[{"element":"layer-bg","value":["<id nền>"]}]}`.
  3. Bảng Layers tự chia **một tab cho mỗi nền** (không có tab Tất cả). Ảnh nền và layer không gắn điều kiện hiện trên mọi tab; layer chữ chỉ hiện ở tab nền của nó. Bấm tab thì canvas đổi theo — merchant sửa màu ngay trên layer đó.
  4. Xoá `textColor` ở option và `textLayerId(s)` ở layer nền (cách cũ) để không ghi đè.
  5. Ảnh chính campaign: layer chữ của scene đặt `fillMode: "custom"` + `fill` theo từng nền.
  Kiểm bằng `od_artwork_print_file` (từng nền, cả 2 mặt) **và** `od_campaign_live_preview`.

## 4. Chọn font

Chưa có binding font. Làm bằng dữ liệu:
1. `additional-option` "Font style", `displayType: "image"`, thumbnail = chữ mẫu từng font (240×120).
2. Ô tên gốc `text` **`fontSize: 0`** (vẫn là ô nhập, không in).
3. Mỗi font × mỗi mặt một `text` `cloneOf` ô gốc, `customizationType: "no_customization"`, `condition` theo option font.
4. **Không** dùng `opacity: 0` (renderer coi 0 là 1 → in chồng) hay `visible: false` (ẩn luôn ô nhập).
5. Có thêm màu chữ → mỗi bản sao cần cả 2 điều kiện (font và màu) — cân nhắc số bản sao (font × màu × mặt).

## 5. Mặc định và ảnh mẫu

- Mặc định = đúng brief / mockup chính (nền, màu chữ, font) để thumbnail và preview giống ảnh bán.
- Ảnh mẫu trong `photo-upload` là ảnh **chụp thật** (ví dụ `F:\ai-video\library\oxford-pets\images`), đã xoá nền (`od_asset_edit` birefnet, dính nền thì isnet), soát trên nền tối. Không dùng ảnh AI.
- `required: true` cho mọi ô bắt buộc để đơn không thiếu ảnh / tên.

## 6. Kiểm trước khi báo xong

1. `od_artwork_form_preview` — đúng ô, nhãn, thứ tự, số lựa chọn; `formView.height` gọn (không cuộn), ô nhỏ cạnh nhau.
2. `od_campaign_print_file` với 2 tổ hợp đối lập (nền sáng + chữ đen, nền tối + chữ trắng; font khác nhau) — mở PNG xem cả hai mặt.
3. `od_campaign_live_preview` với cùng giá trị — preview đổi theo lựa chọn.
4. Sửa artwork đang bán: `od_artwork_save_version` trước.

## Mẫu đã làm

- `TMBLG07102603` (`10a4202b-114a-45ac-8841-bec4a5217190`): 66 màu nền → `displayType: "color"` + swatch 64px; màu chữ Trắng / Đen bằng `color` bind `layer-name` + 2 bản sao mặt phải theo điều kiện; form do merchant xếp: 2 bảng màu trên, ảnh | tên cùng hàng (600px).
- `WSTLG22082601` (`5852fa6b-c105-4335-8cc7-765b8ea4ad12`): 8 nền caro, 3 font (ô tên fontSize 0 + 6 bản sao).
