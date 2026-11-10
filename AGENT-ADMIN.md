# peral-admin MCP — quản trị website Peral

MCP riêng cho **platform admin** (tách khỏi `open-designer` là MCP làm việc trong shop).

- Token: `adm_…` — mỗi admin 1 token, lấy ở `/app/admin` → **Admin MCP** (copy lại được, Gen lại thì token cũ chết).
- Token chỉ chạy khi tài khoản còn là platform admin (`is_admin` hoặc nằm trong `ADMIN_EMAILS`).
- Token MCP của shop **không** gọi được API admin (403).

## Tool

| Nhóm | Tool |
|------|------|
| Website | `od_admin_site_status`, `od_admin_recent_activity`, `od_admin_list_integrations`, `od_admin_overview`, `od_admin_usage` |
| Tài khoản | `od_admin_list_users`, `od_admin_set_user_admin`, `od_admin_reset_usage` |
| Giới hạn | `od_admin_set_limits` |
| Shop | `od_admin_list_stores`, `od_admin_get_store`, `od_admin_update_store`, `od_admin_delete_store` |
| Yêu cầu tạo shop | `od_admin_list_shop_requests`, `od_admin_approve_shop_request`, `od_admin_reject_shop_request` — shop chỉ được tạo khi admin duyệt |
| Thành viên | `od_admin_add_member`, `od_admin_set_member_role`, `od_admin_remove_member` |
| Token shop | `od_admin_rotate_store_token`, `od_admin_revoke_store_token` |
| Dữ liệu shop | `od_admin_shop_campaigns`, `od_admin_shop_artworks`, `od_admin_shop_orders` |
| Hỗ trợ seller — order | `od_admin_get_order`, `od_admin_patch_order`, `od_admin_move_order`, `od_admin_delete_orders`, `od_admin_render_order_print` |
| Hỗ trợ seller — file in | `od_admin_order_print_urls`, `od_admin_download_order_prints` |
| Hỗ trợ seller — catalog | `od_admin_get_artwork`, `od_admin_shop_product_bases`, `od_admin_get_product_base`, `od_admin_get_campaign` |

## Hỗ trợ seller (support)

Dùng khi seller nhờ chuyển/xóa đơn, tải file in, hoặc check artwork / product base của shop:

1. **Xem đơn + link file in:** `od_admin_get_order` hoặc `od_admin_order_print_urls` (URL tuyệt đối, mở/ tải được).
2. **Tải zip file in về máy chạy MCP:** `od_admin_download_order_prints` (`order_ids` + `save_path` tuyệt đối, ví dụ `C:/tmp/prints.zip`).
3. **Gen lại file in:** `od_admin_render_order_print` (optional `item_id`).
4. **Chuyển shop:** `od_admin_move_order` (`to_store_id`) — hỏi seller shop đích trước; đơn rời shop cũ (không copy).
5. **Xóa đơn CreTip:** `od_admin_delete_orders` — `confirm` phải là `"DELETE"`; không đụng Shopify.
6. **Check artwork / phôi / campaign:** `od_admin_get_artwork`, `od_admin_shop_product_bases` / `od_admin_get_product_base`, `od_admin_get_campaign`.

## Luật

1. Hỏi user trước khi: xoá shop (`confirm=DELETE`), Gen lại/thu hồi token shop, hạ quyền admin, xoá thành viên, khoá shop, **xoá đơn**, **chuyển đơn sang shop khác**.
2. `od_admin_delete_store` / `od_admin_delete_orders` không có `confirm="DELETE"` chỉ trả kế hoạch — đọc cho user trước.
3. Không in token của người khác ra chat trừ khi user yêu cầu.
4. Sửa sâu campaign/artwork (layer, template) trong shop thì dùng MCP `open-designer` với token của shop đó; admin MCP đủ để **đọc / kiểm tra** và xử lý order/print.
