---
name: peral-supplier-blank
description: >-
  Lấy dữ liệu phôi Printway, Merchize, Onospod bằng webtools/tools/supplier_blank.py
  (SKU, giá phôi, khổ in, mockup, link template) không dùng AI. Dùng khi user đưa
  link xưởng, bảo lấy file in, giá phôi, mockup, hoặc chuẩn bị Product Base từ
  printway.io, merchize.com, onospod.com. Cả chuỗi catalog Lark, Trello, tạo base
  và tải template nằm ở skill peral-scrape-product-base.
---

# Peral · Lấy phôi từ xưởng

Chạy tool. Không đọc HTML bằng model, không đoán SKU, giá, DPI, khổ pixel.

```bash
webtools/backend/.venv/Scripts/python webtools/tools/supplier_blank.py URL --out webtools/data/blanks/<slug> --download
```

Printway thêm SKU và giá từng biến thể khi có file partners của shop (không in token):

```bash
webtools/backend/.venv/Scripts/python webtools/tools/supplier_blank.py URL --partners <partners.json> --out webtools/data/blanks/<slug> --download
```

Đọc `blank.json`. Tạo Product Base theo skill `peral-add-product-base`, chỉ từ các trường tool đã ghi.

## Cách đọc blank.json

| Trường | Dùng khi |
| --- | --- |
| `variants[].sku` + `variants[].baseCost` | Có cả hai thì mới thành một biến thể. Thiếu một cái thì ghi vào missing, không bịa |
| `variants[].tiers` | Merchize. `baseCost` là Tier 1. Trang áo ghi `dtf_tier1` / `dtg_tier1` thì mỗi cách in là một biến thể, giá là tier 1 của cách đó |
| `startingPrice` | Giá khởi điểm Printway, không phải giá từng biến thể |
| `printAreas` | `width` / `height` là pixel xưởng đã ghi. `dpi` null thì không điền DPI |
| `templateLinks` | Folder Drive / Lark. File trực tiếp thì tool tải luôn. Folder Lark thì chạy `lark_drive.py` |
| `templates/` | File tải được (png, jpg, tif, pdf, zip). Upload `kind: layout`, `templateMode: "guide"` |
| `mockups/` | Ảnh đã tải. Không lấy logo trang, không gen mockup |

`missing` là việc còn thiếu. Hỏi user phần đó. Không tạo base thứ hai nếu mã phôi đã có.

Folder Lark (link `larksuite.com/drive/folder/...`) không tải bằng HTTP thường vì phải đăng nhập. Dùng Edge:

```bash
webtools/backend/.venv/Scripts/python webtools/tools/lark_drive.py FOLDER_URL --out webtools/data/lark/templates/CODE --wait-login 300
webtools/backend/.venv/Scripts/python webtools/tools/lark_drive.py --links webtools/data/lark/_tpl_links.json --out webtools/data/lark/templates
```

Lần đầu đăng nhập Lark trong cửa sổ Edge của tool. Profile nằm ở `%LOCALAPPDATA%\OpenDesigner\lark-edge`, lần sau không hỏi lại. Tool tải file đuôi tif / psd / ai / pdf / eps, và ảnh png/jpg khi tên có chữ template. Bỏ qua file và folder có chữ mockup. `manifest.json` ghi width, height, dpi đọc từ file. DPI không có trong file thì để trống, không điền 300. Nếu Edge đang chạy với `--remote-debugging-port` thì thêm `--attach 127.0.0.1:PORT` để dùng chính phiên đã đăng nhập.

Một link xưởng = một Product Base. Size / mặt / pack là option, không phải nhiều base.
