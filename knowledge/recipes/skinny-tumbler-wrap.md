---
name: skinny-tumbler-wrap
description: Skinny tumbler 20oz (Printway SNSTL, phôi tumbler-vn / TMB) — wrap 2799×2445, 66 màu nền chấm màu, pet xoá nền, tên chữ ký xoay dọc, chọn chữ trắng / đen, 2 mặt.
products: [TMB, tumbler-vn]
example: TMBLG07102603 — artwork 10a4202b-114a-45ac-8841-bec4a5217190, campaign d4bdbbbb-f257-4728-b138-7b8571ba550d
---

# Recipe · Skinny tumbler wrap (TMB)

## File in
- Layout `wrap` 2799×2445 @300dpi (khổ brief của designer = template Printway 20oz skinny).
- Hai mặt theo brief: tâm pet x≈849 và ≈2191 (cách 1342).

## Layer
| id | loại | cài đặt |
| --- | --- | --- |
| layer-bg | clipart-category | full trang, 66 nền trơn của designer (c1..c66), **displayType color** + thumbnail swatch 64px |
| layer-photo | photo-upload | x 415 y 1246 w 869 h 1199 · removeBackground · contain · bottom · trim |
| layer-photo-r | static-photo | cloneOf, x +1342 |
| layer-name | text | chữ dọc: x 553 · y 1092 (mép dưới) · w 810 · h 360 · rotation −90 · Amilly Signature 500 · autoscale · maxLength 12 |
| layer-textcolor | color | Trắng / Đen, bindTargetLayerId layer-name, bindMode fill |
| layer-name-r / layer-name-r-black | text | cloneOf layer-name, x +1342, fill trắng / đen, condition theo layer-textcolor |

## Form (merchant tối ưu, ~550–600px)
Hàng 1: Background color (66 chấm) · Hàng 2: Text color · Hàng 3: Pet photo | Pet name → `od_artwork_form_grid` mặc định ra đúng bố cục này.

## Mockup / preview
- Ảnh Printway skinny (bàn Giáng sinh, cốc in cam toàn thân) → scene `"erase": "colored"` trong `tools/mockup_scenes/tmb/scenes.json`.
- Preview form: ảnh scene "white" (thân cốc thay bằng bóng sáng trung vị) + mask, quad (155,119)-(470,119)-(470,957)-(155,957), crop x 0.05..0.55.

## Bài học
- Binding màu chỉ đổi 1 layer → bản sao mặt kia cần 1 layer / màu theo điều kiện.
- Không dùng `textColor` tự động cùng lúc với ô màu chữ.
