---
name: peral-trello-campaign
description: >-
  Lên Campaign Garby từ mã card Trello (WSTLG…): 1 ảnh cover Trello làm mockup, Product Base
  GmdShop→Active+share Garby, chọn mẫu artwork/free. Dùng khi user bảo lên camp / lên sản phẩm
  từ Trello, LINH GIANG, mã …LG….
---

# Peral · Trello → Campaign Garby (nhanh, ít token)

Agent **không** tự duyệt API / gallery Product Base / generate flat mockup. Một card = một lần chạy tool.

## Luật mockup

- **Chỉ 1 ảnh cover của card Trello** → `od_campaign_add_mockup` (primary).
- **Cấm** lấy gallery / preview Product Base làm mockup campaign.
- **Cấm** `od_campaign_generate_mockups` trong flow Trello→Garby.

## Việc agent làm (tối đa 3 bước)

1. **Tải cover** (browser đã login Trello): fetch `…/attachments/<id>/download/…` →  
   `webtools/data/lark/trello_mockups/<CODE>.png` (1 file).
2. **Chạy tool** (mọi bước còn lại nằm trong script):
   ```bash
   webtools/backend/.venv/Scripts/python.exe webtools/tools/trello_garby_campaign.py <CODE> \
     --mockup webtools/data/lark/trello_mockups/<CODE>.png \
     --price 450000 --compare 550000
   ```
3. Trả user **URL** `https://peral.top/Seller/campaigns/<id>` + `productCode` + `templateKind`.

`--dry-run` chỉ in plan (base / artwork / cover URL), không tạo.

## Tool tự làm

| Bước | Chi tiết |
| --- | --- |
| Mã | `WSTLG09112601` → prefix `WST` |
| Base | Active hoặc Archived trên GmdShop; unarchive + `storeIds` có `garby` |
| Template | Có artwork trên phôi → **artwork**; không → **free** (+ ô ảnh/tên) |
| Create | `generateMockups: false`, `productCode` = mã card, giá VND |
| Mockup | Xóa mockup cũ → gắn đúng 1 file `--mockup` |

## Không làm

- Không đọc skill campaign dài / recipe trừ khi tool FAIL.
- Không publish Shopify trừ khi user yêu cầu.
- Không tạo artwork mới trong flow này (reuse artwork archived/live của phôi).
