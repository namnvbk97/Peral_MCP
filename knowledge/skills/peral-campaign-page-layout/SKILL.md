---
name: peral-campaign-page-layout
description: >-
  Bố cục trang bán Campaign (page.blocks): đặt khối gallery / giá / size / form / ảnh khách / chữ /
  nút mua theo x,y,w,h — không chồng, không lệch cột, khoảng cách đều. Dùng khi tạo/sửa campaign
  (kể cả mẫu Store), form không artwork, "upload photo với text xa/gần", "control lệch",
  od_update_campaign page, hoặc agent MCP dựng trang storefront.
---

# Peral · Bố cục trang Campaign (page.blocks)

> **Luật bắt buộc** (`webtools/AGENTS.md`): chỉ sửa qua MCP `od_*` / `od_update_campaign` (CLI `call.ts`, JSON dài dùng `@file.json`). Không sửa code frontend cho một mã.

Trang bán = canvas **1080px** (`page.width`), các khối `page.blocks[]` mỗi khối có **`x, y, w, h`** (pixel artboard). Thứ tự mảng = z-order. Skill tạo campaign: `peral-create-campaign`. Form artwork (layer): `peral-artwork-customer-options` (`od_artwork_form_grid`) — **khác** skill này.

## 1. Hai cột chuẩn (mẫu mặc định)

| Cột | `x` | `w` | Nội dung |
| --- | --- | --- | --- |
| Trái (ảnh) | **32** | **492** | `gallery`, `thumbs` (dưới gallery) |
| Phải (mua) | **556** | **492** | `title` → `price` → `products?` → `size` → form / customer-* → `buttons` → `description` |

- Mọi control cột phải **cùng `x` và cùng `w`** (556 / 492). Lệch 4px (`x: 560`) là lỗi — khách thấy lệch mép.
- `products` chỉ hiện khi ≥ 2 artwork; không có thì `visible: false`, **không** chiếm chỗ trong chuỗi xếp (bỏ qua khi tính `y`).

## 2. Luật xếp dọc — đọc bbox trước khi đặt khối mới

Trước khi thêm / dời khối **B**:

1. Lấy mọi khối cùng cột phải, `visible !== false`, trừ chính B.
2. Với mỗi khối A: `bottom = A.y + A.h`.
3. `y(B) = max(bottoms) + GAP` — **GAP = 12** giữa field khách (ảnh / chữ); **GAP = 16** giữa nhóm (sau `size` / trước `buttons`).
4. Không đặt `y` sao cho `[y, y+h)` giao `[A.y, A.y+A.h)` trên cùng cột (chồng ảnh–chữ, size–photo…).
5. Sau khi đổi `h` của một khối (vd `size` cao vì Color + Size + Style), **tính lại `y` mọi khối bên dưới** — không để nguyên `y` cũ.

Công thức an toàn:

```text
stack(right_blocks sorted by y):
  cursor = first.y
  for each block in stack order:
    block.x = 556; block.w = 492
    block.y = cursor
    cursor = block.y + block.h + gap_after(block)
```

`gap_after`: 12 sau `customer-photo` / `customer-text` / field module; 16 sau `price`, `size`, `form`; 24 trước `buttons` nếu cần thở.

## 3. Form không artwork (fanpage) — Photo + Text

Khối `customer-photo` (~**h 160–168**) và `customer-text` (~**h 68–72**):

| Sai | Đúng |
| --- | --- |
| Photo `y` nằm trong vùng `size` / `form` | Photo bắt đầu **dưới** đáy `size` (hoặc `form` nếu còn) + 16 |
| Text `y` = photo.y + vài chục (chồng lên ảnh) | Text `y` = photo.y + photo.h + **12** |
| Photo `x=556`, text `x=560` | Cùng **556**, cùng **w=492** |
| Để `form` `visible` khi đã dùng customer-* | `form.visible = false` (tránh đè và form trống) |
| `buttons` còn `y` cũ sau khi thêm ảnh+chữ | Đẩy `buttons` (rồi `description`) xuống dưới đáy chữ + 16 |

Hai ô **cạnh nhau** (ảnh | tên) chỉ khi cả hai `h` gần nhau và tổng `w + gap ≤ 492` (vd ảnh 240 + gap 12 + chữ 240). Mặc định **xếp dọc** (mobile-safe).

## 4. Khối `size` (Color / Size / Style)

- Cao thật phụ thuộc số hàng option. Ước lượng khi gen: Color chấm ≈ 40–70; Size 1–2 hàng nút ≈ 50–90; Style 1 hàng ≈ 50; cộng nhãn ≈ **+28 / option**. Áo TSV 3 option ≈ **h 280–320**.
- Sau khi set `optionDisplay` (color swatches / buttons), nếu preview thấy cắt nút → tăng `h`, rồi **reflow** khối dưới (§2).
- Giá bán **đồng nhất** → `props.showPrice: false` (giá chỉ ở khối `price`). Giá lệch theo size/style → `showPrice: true` (nút option cuối hiện giá).

## 5. Quy trình agent (MCP)

1. `od_get_campaign` — đọc `page.blocks` (đủ `id,type,x,y,w,h,visible,props`).
2. Liệt kê cột phải theo `y`; phát hiện chồng: `A.y < B.y + B.h && B.y < A.y + A.h` cùng cột.
3. Sửa toạ độ theo §2–§4; giữ `id` / `type` / `props`.
4. `od_update_campaign(campaign_id, page: { width: 1080, blocks })`.
5. Kiểm: mở Live preview / `od_campaign_live_preview` — ảnh và chữ không đè size, mép trái thẳng, khoảng cách đều ~12–16px.

Mẫu Store (`shopTemplate`): sửa trang mẫu trước; campaign bán đã tạo **không** tự đổi — chỉ campaign mới copy mẫu.

## 6. Không được

- Đoạn cứng `y: 280 + i * (h+12)` khi đã có `size` / `form` phía trên (dễ chồng).
- Đổi `x`/`w` từng control một cách ngẫu nhiên “cho vừa”.
- Tăng `h` của `size` mà không đẩy photo / text / buttons.
- Trộn luật form artwork (`formX/formY`) với `page.blocks` — hai hệ toạ độ khác nhau.
