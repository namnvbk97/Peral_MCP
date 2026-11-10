---
name: peral-scrape-product-base
description: >-
  Cào và tạo Product Base trên Peral bằng tool, không dùng AI đọc trang hay ảnh.
  Dùng khi user bảo cào Printway/Merchize/Onospod, copy catalog Lark, gom card
  Trello, tải template Lark, tạo product base hàng loạt, hoặc ghi lại tool/skill
  phôi. Chạy lark_catalog.py, trello_product_base.py, supplier_blank.py,
  catalog_bases.py, lark_drive.py, peral_check.py.
---

# Peral · Cào rồi tạo Product Base

Chạy tool. Không đọc HTML, không nhìn ảnh template, không chép bảng Lark bằng model. Thiếu số thì ghi `missing` và dừng. Không bịa SKU, giá vốn, khổ pixel, DPI, bleed.

Một link xưởng = một Product Base. Size, mặt, pack, kiểu là option, không phải nhiều base. Giá bán nằm ở campaign. `templateMode` luôn là `guide`, không bao giờ `print`.

Luật phôi: skill `peral-add-product-base` và `peral-product-structure`. Dữ liệu shop đi qua API hoặc MCP `od_*`, không ghi tay `products/*.json`. Không in API key hay token xưởng.

Python: `webtools/backend/.venv/Scripts/python.exe`

## Thứ tự

1. Catalog Lark → `lark_catalog.py`
2. Card Trello (nếu có) → `trello_product_base.py` — chỉ ra bản nháp, không tạo base
3. Một link xưởng → `supplier_blank.py`. Nhiều mã trong catalog → `catalog_bases.py`
4. Folder template Lark → `lark_drive.py`
5. Gắn file template vào base (upload `kind: layout`, layout đúng pixel và dpi của file)
6. `peral_check.py base <slug>` phải 0 FAIL trước khi nói phôi in được

## 1. Catalog Lark

Trong view UPDATE CATALOG, chọn hết dòng (ô header) rồi Ctrl+C. Không xoá filter của view khác. Không sửa ô trên Lark.

```bash
webtools/backend/.venv/Scripts/python.exe webtools/tools/lark_catalog.py --clipboard --xlsx webtools/data/lark/update_catalog.xlsx --json webtools/data/lark/update_catalog.json
webtools/backend/.venv/Scripts/python.exe webtools/tools/lark_catalog.py webtools/data/lark/update_catalog.xlsx --code ETV
```

Tool tự ghi: vendor OTH → note `bỏ qua vendor OTH`; mã GM → note `thêm sau`; mã TSV → vendor Printway. Cột ảnh chỉ là tên file, không có byte ảnh.

## 2. Gom card Trello

Mã card `ETVLG07112603`: 2–3 chữ đầu là Product Code trên Lark, 2 chữ sau là người thiết kế (LINH GIANG = LG, MINH TRANG = MT, MINH DUONG = MD, NGUYEN NAM = NN), phần còn lại là ngày. Nhiều card cùng mã = một phôi.

```bash
webtools/backend/.venv/Scripts/python.exe webtools/tools/trello_product_base.py board.json --list "LINH GIANG" --catalog webtools/data/lark/update_catalog.json --out webtools/data/lark/trello_draft.json
```

Tool này không tạo base. Bỏ qua OTH, note `thêm sau`, và note bắt đầu bằng `bỏ qua`.

## 3. Một link xưởng

```bash
webtools/backend/.venv/Scripts/python.exe webtools/tools/supplier_blank.py URL --out webtools/data/blanks/<slug> --download
webtools/backend/.venv/Scripts/python.exe webtools/tools/supplier_blank.py URL --partners <partners.json> --out webtools/data/blanks/<slug> --download
```

`--partners` chỉ để lấy SKU và giá Printway. Không in token. Khớp mã catalog bằng đúng mã hoặc đúng đoạn cuối URL. Không khớp chuỗi con (SOCKS không phải CKS).

Đọc `blank.json`:

| Trường | Dùng khi |
| --- | --- |
| `variants[].sku` + `variants[].baseCost` | Có cả hai mới thành một biến thể |
| `variants[].tiers` | Merchize. `baseCost` là tier 1. Áo có `dtf_tier1` / `dtg_tier1` thì option Print = DTF hoặc DTG, giá là tier 1 của cách in đó |
| `startingPrice` | Giá khởi điểm Printway, không phải giá từng biến thể |
| `printAreas` | Pixel trang xưởng đã ghi. `dpi` null thì không điền |
| `templateLinks` | Folder Lark thì sang bước 4. File trực tiếp thì đã nằm trong `templates/` |
| `mockups/` | Ảnh đã tải. Không lấy logo trang |

Trang công khai Printway không có byte template, không có SKU từng biến thể, không có DPI. `printway_scrape.py` chỉ đọc trang đó. Merchize giá lấy từ trang công khai. Không gọi API tạo đơn của Merchize hay Onospod.

## 4. Tạo nhiều base từ catalog

```bash
webtools/backend/.venv/Scripts/python.exe webtools/tools/catalog_bases.py --catalog webtools/data/lark/update_catalog.json --products-root <products> --api <shop-api> --store gmdshop --partners-dir <integrations> --env-file <backend/.env> --progress webtools/data/lark/progress.json
```

- Printway và Merchize: file in png. Onospod: jpg.
- Chỉ tạo biến thể khi có SKU và giá vốn. Không điền DPI hay khổ pixel lúc này.
- Bỏ qua mã đã có, vendor OTH, note `thêm sau` / `bỏ qua`, và link trùng sau khi bỏ `/en/` với `/vi/`.
- `--only CODE` tạo một mã. Chạy lại không tạo bản thứ hai.
- Key đọc từ env, không in ra.

Options tối đa 3. `size` của biến thể là các giá trị option nối bằng ` / `.

## 5. File template trong Lark

Folder Lark không tải bằng HTTP thường. Tool mở Edge, đăng nhập giữ ở `%LOCALAPPDATA%\OpenDesigner\lark-edge`.

```bash
webtools/backend/.venv/Scripts/python.exe webtools/tools/lark_drive.py FOLDER_URL --out webtools/data/lark/templates/CODE --wait-login 300
webtools/backend/.venv/Scripts/python.exe webtools/tools/lark_drive.py --links webtools/data/lark/_tpl_links.json --out webtools/data/lark/templates
```

Ưu tiên link Made in VN khi có cả VN và US. Tải tif, psd, ai, pdf, eps, và png/jpg có chữ template trong tên. Bỏ file và folder có chữ mockup. Lần đầu thêm `--wait-login 300` rồi đăng nhập trong cửa sổ Edge đó. Edge đã bật `--remote-debugging-port` thì thêm `--attach 127.0.0.1:PORT`.

`manifest.json` ghi `width`, `height`, `dpi` đọc từ file. Không có dpi trong file thì để trống. Không ghi 300 chỉ vì shop hay file khác dùng 300.

Gắn lên base: upload `kind: layout`, rồi layout `width`/`height`/`dpi` đúng file, `format` png với Printway và Merchize (jpg với Onospod), `transparent: true`, `templateMode: guide`, `layers: []`. Ảnh list là `blankAssets.photoBlank`, đặt bằng API preview, không phải gallery.

## 6. Kiểm tra

```bash
webtools/backend/.venv/Scripts/python.exe webtools/tools/peral_check.py base <slug>
```

0 FAIL thì mới nói phôi in được. FAIL khi thiếu biến thể, SKU, giá vốn, print layout, width, height, dpi, hoặc `templateMode` là `print`.

Archive (`archived: true`) chỉ khi user bảo đẩy những mã đó sang Archive. Không archive cả catalog.
