---
name: wine-tumbler-wrap
description: Wine tumbler 12oz (Printway WSSTL, phôi WST) — wrap 3057×981, nền caro chọn màu, pet xoá nền, tên 3 font, 2 mặt; mockup trên ảnh cốc thật.
products: [WST, 12oz-wine-stainless-steel-tumbler]
example: WSTLG22082601 — artwork 5852fa6b-c105-4335-8cc7-765b8ea4ad12, campaign 451de166-7ae4-4b6b-9cf0-02c0dc3533e4
---

# Recipe · Wine tumbler wrap (WST)

## File in
- 1 file `wrap` 3057×981 @300dpi (25.88×8.31 cm), băng in dưới vành inox; đáy trắng không in.
- Mặt trái tâm x≈765, mặt phải x≈2295 (template Printway LEFT / RIGHT SIDE). Không đặt gì lên mép 0 / 3057 (đường nối).

## Layer (dưới → trên)
| id | loại | vị trí / cài đặt |
| --- | --- | --- |
| layer-bg | clipart-category | 0,0,3057,981 — 8 nền caro (`make_pattern_backgrounds.py --pattern checker --rows 4`), swatch 160px |
| layer-photo-l | photo-upload | x 385 y 395 w 760 h 586 · removeBackground · fit contain · fitAlign bottom · trim |
| layer-photo-r | static-photo | cloneOf layer-photo-l, x +1530 |
| layer-name | text | **fontSize 0** (ô nhập, không in), maxLength 18 |
| layer-name-{l,r}-{classic,minimal,script} | text | cloneOf layer-name, box 1150×190 tại y 140, condition theo layer-font |
| layer-font | additional-option | 3 ảnh mẫu: Questrial 96 (in hoa) · Julius Sans One 92 (in hoa) · Amilly Signature 150 |

Màu chữ tự theo nền: option `textColor` + `textLayerIds` (6 bản sao).

## Form
Background color (lưới ảnh 8) → Pet photo → Pet name → Font style.

## Mockup / preview
- Ảnh cốc thật Printway (myth_4 christmas, myth_5 table) → `tumbler_scene_mockup.py --scenes tools/mockup_scenes/wst --face 0.25`; hero 3 cốc ghép ngang.
- Preview form: scene = ảnh table đã xoá chữ + mask băng in, quad (268,212)-(783,212)-(783,765)-(268,765), crop x 0..0.5.

## Bài học
- Không ship "ảnh + chữ Georgia trên nền trắng". Ảnh mẫu pet phải là ảnh thật.
- `opacity: 0` vẫn in (renderer coi 0 là 1) → ẩn ô nhập bằng `fontSize: 0`.
