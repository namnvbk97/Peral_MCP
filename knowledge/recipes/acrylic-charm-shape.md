---
name: acrylic-charm-shape
description: Charm điện thoại mica cắt theo dáng ảnh khách (Printway CSPC, phôi custom-shape-phone-charm / CCV) — sheet 508×1017 cut trên / in dưới, khuôn cut-silhouette theo ảnh + vòng treo; mockup treo trên dây thật.
products: [CCV, custom-shape-phone-charm]
example: CCVLG29102602 — artwork 2ec71025-b338-4f00-b592-f1821dcaf978, campaign a76f9eb4-c9ee-4df0-872a-b7f874e0f2c6
---

# Recipe · Charm mica cắt theo ảnh (CCV)

## File in
- Layout `sheet` 508×1017 @300dpi (template PSD 4.3×8.61 cm): band cut y 0–508, band in từ y 509. Safe zone 44..464.

## Layer
| id | loại | cài đặt |
| --- | --- | --- |
| layer-photo | photo-upload | band in: x 50 y 639 w 408 h 330 · removeBackground · contain · **fitAlign top** · trim |
| layer-cut | cut-silhouette | cloneOf layer-photo, cutPaddingPx 5–12, cùng khung ở band cut (y 130) |
| layer-ring | static-photo | Hình số 8 (hanging) — **ẩn** (`visible: false`); chỉ làm asset nguồn |
| Hanging + solid cut | user-code `stage: print` | Print script: fill lỗ silhouette (blur→threshold); neo hanging theo **body_top** (hàng opaque rộng ≥200px, không lấy tai); `stick_out` ~42px — chỉ vòng trên số 8 thừa ra, **đuôi số 8 lấp gần hết trong shape cut** |

Ảnh `fitAlign: top`. Không sửa web — chỉ print script trên artwork.

## Campaign
Chỉ bật ACRYLIC / ONE SIDE × 13 màu dây (Color = màu dây đeo). Giá mặc định 4.99 → cần merchant xem lại.
Mockup: `charm_mockup.py --print <sheet>` trên ảnh dây + móc thật của Printway. Preview form: scene dây đã xoá charm, quad (186,326)-(542,326)-(542,594)-(186,594), crop y 0.6234..1.
