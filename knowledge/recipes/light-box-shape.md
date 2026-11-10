---
name: light-box-shape
description: Light box cắt theo hình (Printway CSPLB, phôi custom-shape-photo-light-box-2 / SX) — sheet 2518×5036, ô cut trên + ô front dưới, design cố định + tên trên biển; mockup bật / tắt đèn.
products: [SX, custom-shape-photo-light-box-2]
example: SXMT25052603 — artwork 80d60825-dad6-4cb5-b268-1a2d128f3aa4, campaign 00d33494-5842-4f12-89e1-7636b98a056e
---

# Recipe · Light box cắt hình (SX)

## File in
- 1 mặt: 2518×5036 — ô cut (59,59,2400,2400) trên, ô front (59,2577,2400,2400) dưới. 2 mặt: 5036×5036 (thêm cột back, bản lật).
- Brief designer 4800×2400: nửa trái = khuôn cắt (đen), nửa phải = thiết kế.

## Cách dựng nhanh
1. `od_duplicate_artwork` từ một artwork SX đã chuẩn (SXMT27032603 / SXMT25052603) — giữ sẵn quy ước 1 mặt / 2 mặt / back.
2. Thay `src` của layer-cut, layer-cut-cut-2, layer-cut-2s (khuôn) và layer-design, -2s, -back (thiết kế).
3. Tên trên biển: đo khung trống trên thiết kế, `text` + 2 bản sao (2s, back x = 5036 − (x + w)).

## Campaign
4 size 1 mặt bật, giá 15.99 / 22.99 như các SXMT khác. Mockup: `lightbox_mockup.py --print <file 1 mặt>` (bật đèn nền tối + tắt đèn nền trắng).
