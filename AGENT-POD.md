# Peral — Agent tạo Product Base, Artwork, Campaign

Đọc file này trước khi tạo một món hàng. Khách thấy brand **Peral** (`https://peral.top`). Agent nối MCP gọi `od_agent_guide` để lấy đúng bản này.

Khách không vẽ file in. Khách chỉ tải ảnh, gõ tên, đôi khi chọn nền. File in của từng đơn mới là thứ gửi xưởng. Mỗi món có phôi riêng, artwork riêng, campaign riêng. Không lấy khổ in, bleed, shape, hay giá của món này gán sang món khác. Không bịa các số đó. Đọc product base.

## Luật bắt buộc

1. **Chỉ làm dữ liệu qua MCP `od_*`.** Liệt kê / tạo / sửa phôi, artwork, campaign, mockup bằng tool MCP (chưa nối MCP → `cd webtools/mcp && npx tsx scripts/call.ts open-designer <tool> '<json>'`). Không ghi file dữ liệu, không gọi API thẳng, hạn chế sửa code; thiếu tính năng thì làm bằng layer / điều kiện / clone / preview có sẵn và hỏi user trước khi sửa code.
2. **Preview campaign giống sản phẩm thật nhất.** Mockup chính = ảnh chụp thật của phôi (trang xưởng) ghép file in thật — cốc quấn hình trụ, mica có viền + lỗ treo, light box như ảnh xưởng. Không dùng mockup "Studio" phẳng, hình vẽ code hay ảnh AI làm ảnh chính. Preview form (`preview` mode scene) dùng ảnh phôi trơn + mask + quad, kiểm bằng `od_campaign_live_preview`. Tool: `webtools/tools/tumbler_scene_mockup.py`, `lightbox_mockup.py`, `charm_mockup.py`.

3. **Mã khó, UI không làm được → print script (dữ liệu, không deploy).** Gắn Python sandbox vào **riêng** artwork (`od_artwork_set_print_script`) hoặc riêng một sản phẩm campaign (`od_campaign_set_print_script`); script chạy trên từng file in hoàn chỉnh (cả preview, nhỏ hơn — dùng `api.px()`), chỉ cho mã đó. Có bộ hàm ảnh: cắt, fit, xoay, dán, mask, silhouette / lót trắng, tint, chỉnh màu, bóng, warp, arc, chữ font studio, rembg. Đọc `od_print_script_guide` trước; kiểm bằng `od_artwork_print_file` / `od_campaign_print_file` (log + lỗi nằm trong warnings). Không sửa backend / frontend cho một mã. Chỉ đổi chữ / ảnh / ẩn hiện layer thì dùng layer `user-code` thường (chạy trước khi vẽ).

Skill từng bước (Claude Code `.claude/skills`, Cursor `.cursor/skills`): `peral-add-product-base`, `peral-create-artwork` (quy trình chung) → `peral-artwork-print-canvas` (canvas / file in) + `peral-artwork-customer-options` (form khách: chấm màu cho màu đặc, màu chữ, font; xếp form gọn bằng `od_artwork_form_grid`), `peral-create-campaign`, `peral-product-structure`.

**Kiểm tra sau mỗi bước** (0 FAIL mới báo xong):

```bash
webtools/backend/.venv/Scripts/python webtools/tools/peral_check.py base <slug>
webtools/backend/.venv/Scripts/python webtools/tools/peral_check.py artwork <artwork-id>
webtools/backend/.venv/Scripts/python webtools/tools/peral_check.py campaign <campaign-id>
```

## Platform Admin

Tài khoản vận hành Peral (`ADMIN_EMAILS` / `is_admin`) — mặc định `nam.nv.bk97@gmail.com`:

- Vào được **mọi shop** (menu chọn shop liệt kê hết; mọi `od_*` nhận bất kỳ `store_id`), quyền như Quản lý + chuyển owner
- Web: `/app/admin` (chỉ hiện khi `platform_admin`) — shop (đổi tên, bật/tắt, thành viên, MCP token, xoá), tài khoản (cấp/gỡ admin, reset quota), giới hạn dùng thử
- Tool `od_admin_*` **không** nằm trong MCP này — dùng MCP riêng `peral-admin` (`src/admin-server.ts`, remote `/mcp-admin`, token `adm_…` lấy ở `/app/admin` → Admin MCP). Xem `AGENT-ADMIN.md`.
- Token MCP của shop gọi API admin sẽ bị 403.

Đổi platform admin: sửa `ADMIN_EMAILS` + `MCP_ACT_AS_EMAIL` trong `webtools/backend/.env` → restart API → Gmail mới đăng nhập một lần; gỡ `is_admin` của người cũ trên `/app/admin` nếu cần.

## MCP token theo shop

- **1 shop = 1 token** (chỉ owner/admin của shop tạo/xem). Gen lại = thay token cũ.
- Secret được lưu → trang AI Assistant MCP cho **Copy lại** bất cứ lúc nào (không còn “show once”).
- Đổi shop trên menu trái → token theo shop đó.

## Thứ tự

1. `od_list_stores` rồi làm trên đúng shop.
2. `od_list_product_bases`, rồi `od_get_product_base_guide` cho đúng slug. Guide là cách file in của phôi đó được tạo (vị trí ảnh, font, màu chữ, ô in). Đọc xong mới `od_get_product_base`. Chưa có file in thì khóa file in ở Product Base trước.
3. `od_create_artwork` trên đúng slug và size.
4. Thêm layer khách điền: ảnh, chữ, nền.
5. `od_create_campaign` gắn artwork đó, bật size bán.
6. File in xuất từ đơn (`od_list_orders` rồi render), không xuất từ trang artwork.

## Product Base và file in

`od_create_product_base` khi chưa có phôi. `slug` chỉ gồm chữ thường, số và dấu gạch. Điền chất liệu, cách in, nhà cung cấp, sizes, SKU, giá vốn từ bảng giá xưởng.

Ảnh phôi (ảnh minh họa, không phải file in): `od_upload_product_base_preview`.

File in: `od_get_print_layouts`. Chưa có layout thì tải template xưởng bằng `od_upload_product_base_file` (`kind` = `layout` hoặc `guide`), rồi `od_set_print_layouts`.

Một layout là một file in. `width`, `height`, `dpi` lấy từ template, không tự đặt. `templateMode` = `guide` nghĩa là ảnh nền chỉ để canh, không dán vào file xuất.

- **Slot Front**: ô artwork mặt trước.
- Phôi hai mặt: thêm **Slot Back**.
- Mica / acrylic cắt: layer `cut` đúng band cắt. Shape cắt chỉ nằm ở đó. Không vẽ dao cắt và không đục lỗ treo lên slot front hay back.
- In phẳng (chăn, áo, cốc): chỉ slot in, không thêm đường cắt.

Artwork chỉ thiết kế trong slot. Khổ tờ thuộc Product Base.

### Một phôi xưởng = một Product Base

- Cùng một phôi của xưởng (ví dụ Printway CRORM ornament, Custom Shape Light Box) chỉ có **một** Product Base. Kiểu dáng (Circle / Heart / Star), số lượng (1PC / 2PCS), một mặt / hai mặt là **option biến thể** của base đó, không tách thành nhiều base.
- Không tạo Product Base riêng cho một artwork. Một tấm sheet thành phẩm (khuôn cắt + thiết kế dán sẵn làm template `print`) là sai: đưa artwork về phôi xưởng, phần thiết kế thành layer mặt trước, phần khuôn thành layer `cut` của artwork.
- Option: `options` = `[{name: "Style", values: [...]}, {name: "Pack", values: [...]}]` (tối đa 3). Mỗi biến thể: `size` = `"Heart / 2PCS"`, `options` = `{Style: "Heart", Pack: "2PCS"}`, `sku` = SKU đặt hàng của xưởng, `baseCost`, `pieces` (số miếng của một pack).
- Ô in khác nhau theo Style: ghi đè trong `sizes` của layout bằng **giá trị option** (`sizes["Heart"]` = width, height, template, khung slot, mask). Không lặp cho từng Pack.
- Số mặt in do biến thể quyết định: `sides` = 1 hoặc 2, hoặc `titles` có đúng một trong `ONE SIDE` / `TWO SIDES`. Artwork chỉ quyết định in gì lên các mặt.
- Khuôn cắt: Product Base chỉ đặt **ô** `cut` (vị trí, kích thước, `mirror` cho miếng thứ hai). Không gắn file die vào base. Hình cắt do từng artwork tải lên.

## Artwork

`od_create_artwork` với `title`, `product_slug`, `size`. Phôi gắn sẵn layer Product Base.

Thêm layer bằng `od_artwork_add_layer`. Sửa bằng `od_artwork_update_layer`. Layer khách điền chính là ô trên form.

| Việc khách làm | `type` | Ghi chú |
| --- | --- | --- |
| Tải một ảnh | `photo-upload` | `formLabel` là nhãn form. `props.removeBackground: true` thì server xóa nền khi khách tải ảnh. |
| Gõ tên | `text` | `props.text` là chữ mẫu trên canvas. `formLabel`, `fontFamily`, `fill`, `align`, `fontSize`. Cỡ chữ nhỏ nhất là 0. |
| Chọn nền hoặc họa tiết | `clipart-category` | Mỗi lựa chọn có ảnh. Ảnh đó là nền in, không phải ảnh khách upload. |
| Ảnh chỉ để in, khách không thấy ô | `static-photo` | Dùng cho mặt sau hoặc hình cố định. |

Kéo vị trí bằng `props.x`, `props.y`, `props.width`, `props.height` trong vùng slot, không vẽ ra ngoài khổ phôi.

Ảnh đưa vào layer: `od_artwork_set_layer_image` hoặc `image` lúc add. Đúng một trong `file_path` (máy đang chạy MCP), `asset_id`, `url`. Ảnh khách và ảnh gallery không phải file in.

**Ảnh thiết kế (wrap tumbler, background, nền in) là một layer `static-photo` riêng — không bao giờ đặt vào layer Product Base (`blank`).** Layer Product Base chỉ là phôi xem trên canvas và bị bỏ khi xuất file in: thiết kế để trong đó thì file in chỉ còn chữ (lỗi TWHMT13082601 / TWHMT14092603 / TWHMT27082604 / TWHMT31082605 / KCMT05092601). Xuất file in sẽ cảnh báo "Thiết kế đang nằm trong layer Product Base".

`od_artwork_form_preview` để xem form trước khi giao khách.

### Khuôn cắt của artwork

Phôi có ô `cut` thì artwork thêm một layer `static-photo` full canvas với `props.side` = `cut`, `customizationType` = `no_customization` (tab **Khuôn cắt** trong editor). Thiếu layer này thì file in tự tạo khuôn tạm từ viền mặt trước và báo cảnh báo — phải sửa, không giao xưởng như vậy.

### Nhiều template trong một artwork (một template mỗi Style)

- Mỗi Style có ô in khác kích thước thì có **template riêng**, canvas đúng bằng ô in của Style đó (Heart 898×852, Star 957×957, Oval 709×969). Không dùng chung một template cho hai ô khác tỉ lệ: file in bị cắt mép (cảnh báo "Tỉ lệ artwork … khác ô in").
- Tạo template mới bằng `od_artwork_duplicate_template` từ template chuẩn rồi chỉnh vị trí. Không dựng lại từ đầu. Các template của một artwork phải giống nhau về: id layer, thứ tự layer (nền dưới cùng, mũ / phụ kiện dưới ảnh nếu template chuẩn làm vậy), điều kiện `__sides`, `defaultValue` của từng lựa chọn, `displayType` của picker (color / image), ảnh nền mặc định. Chỉ khác vị trí và kích thước.
- Canvas mỗi template giữ kích thước riêng. Sau khi sửa, `od_artwork_composite` từng template để có ảnh thumbnail: ảnh này là ô chọn mẫu / chọn Style trên form khách (không dùng combobox).
- Đổi phôi cho artwork: `od_artwork_move_to_base`. Không tạo artwork mới chỉ để đổi phôi.

## Mặt sau

Artwork có một trang cho mỗi file in của Product Base (`imageDoc.pages`), cùng kích thước file in. Mặt sau là layer đặt ở chỗ mặt sau trên trang (cùng file in) hoặc trên trang của file mặt sau (`props.side` = key trang). Không có chế độ lật tự động: lật từng layer bằng `props.flipH` (ngang) và / hoặc `props.flipV` (dọc); bật cả hai = xoay 180°. Bỏ cả hai trên layer clone = giống nguồn.

Layer chỉ in khi khách mua TWO SIDES: điều kiện `{"element": "__sides", "value": ["2"]}` (ô "Ẩn khi ONE SIDE" trong editor).

Muốn ảnh lật còn chữ không lật: layer ảnh và chữ gốc ở mặt trước. Tạo layer mới (`static-photo` hoặc `text`) ở vùng mặt sau, `props.cloneOf` = id layer gốc, `props.flipH` bật hoặc tắt riêng layer đó, `props.customizationType` = `no_customization` để khách không thấy ô thứ hai. Clone from nằm trên layer tạo sau.

Khuôn cắt mica theo ảnh khách (sau rembg): layer type `cut-silhouette` đặt ở vùng khuôn cắt trên trang, `props.cloneOf` = id layer ảnh (`photo-upload` / `static-photo`), cùng width / height / fit với layer đó (x / y là chỗ khuôn cắt), `props.cutPaddingPx` = số px phình (mặc định 24 ≈ 2mm khi canvas ≈ file in 300 DPI). Layer lấy `src` từ nguồn; lúc render tô đen theo alpha và phình padding.

Clipart có ảnh back riêng từng lựa chọn thì không đồng thời `cloneOf` trên cùng layer đích. Một trong hai cách.

Nhiều ô in, khách chỉ tải vài ảnh: nhóm slot (`od` tool slot group trên artwork), không thêm một ô upload cho mỗi góc.

## Campaign

`od_create_campaign` với `artwork_id`. `sizes` là size bán. Giá tính từ giá vốn phôi. Sửa giá tay thì giữ số đã sửa, không bịa giá bán.

Mockup là ảnh quảng cáo. Listing là nội dung trang bán. `od_campaign_generate_mockups` và `od_campaign_generate_listing` khi cần. `od_validate_campaign` trước khi `od_publish_campaign`.

Chưa nối Shopify vẫn tạo đơn thủ công được. Đăng bán chỉ khi shop đã nối kênh.

- Phôi có option (Style × Pack) thì campaign có **một** sản phẩm với đủ biến thể, không tách mỗi Style một sản phẩm. Gắn Style với template bằng `od_campaign_update_product` `template_by_option` = `{Style: {Circle: "tpl-…", Heart: "tpl-…"}}`. Khách đổi Style thì form đổi template; Shopify có option Style và Pack riêng.
- Chỉ bật biến thể artwork in được: artwork một mặt (`front-only`, không có layer mặt sau) thì không bật biến thể hai mặt.
- Gộp / chuyển sản phẩm: giữ đúng giá bán, giá gạch, SKU campaign cũ. Thấy giá vô lý (size lớn rẻ hơn size nhỏ) thì báo merchant, không tự sửa giá.

## Nhiều shop dùng chung (không copy)

- Muốn shop khác dùng một Product Base / Artwork / Campaign: `od_share_to_shop` (dùng chung) — một món, không tạo file mới, sửa ở shop nào cũng thấy ở mọi shop. Campaign kéo theo artwork và phôi; artwork kéo theo phôi.
- `od_copy_to_shop` chỉ khi shop kia cần sửa riêng (chép cả template PSD/TIF — tốn bộ nhớ).
- Campaign dùng chung có một bảng giá và một đơn vị tiền. Đăng Shopify cho từng shop: `od_publish_campaign` với `store_id`; mỗi Shopify có link sản phẩm và variant id riêng.
- Thôi dùng chung: `od_unshare_from_shop` (không xoá gì, shop chủ giữ nguyên).

## Đổi cấu trúc dữ liệu đang bán (gộp phôi, chuyển artwork, tách template)

1. Chỉ qua MCP / API. Không ghi file `product.json`, artwork, campaign trực tiếp.
2. Xuất file in mẫu **trước** khi đổi (`od_campaign_print_file` hoặc print-file của artwork) cho từng Style và vài Pack.
3. Đổi, rồi xuất lại cùng size và so từng pixel. Phải giống hệt (trừ phần merchant yêu cầu đổi). Khác thì dừng và báo, không giao.
4. Xem lại kích thước canvas của mọi template sau mỗi thao tác hàng loạt (thumbnail, duplicate, move).
5. Phôi cũ chỉ xoá (vào `_trash`) khi usage rỗng: không artwork, không campaign dùng.

## Agent không được

- Bịa bleed, khổ sheet, DPI, giá vốn, hoặc gán đầu giá nào là một mặt hay hai mặt.
- Đổi luật in của mọi artwork vì một món. `flip-front` thì chữ cũng lật.
- Đục lỗ treo vào mặt in. Composite template TIF vào file xuất.
- Coi ảnh khách upload là file in.
- Tạo một Product Base cho mỗi kiểu dáng hay mỗi artwork của cùng một phôi xưởng.
- Gắn file die / shape cut vào Product Base.
- Dùng chung một template cho các Style có ô in khác tỉ lệ.
- Gọi `/order/create/test` của Onospod: nó đặt đơn **thật**.
