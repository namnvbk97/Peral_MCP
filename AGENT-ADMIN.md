# peral-admin MCP — quản trị website Peral

MCP riêng cho **platform admin** (tách khỏi `open-designer` là MCP làm việc trong shop).

- Token: `adm_…` — mỗi admin 1 token, lấy ở `/app/admin` → **Admin MCP** (copy lại được, Gen lại thì token cũ chết).
- Token chỉ chạy khi tài khoản còn là platform admin (`is_admin` hoặc nằm trong `CRETIP_ADMIN_EMAILS`).
- Token MCP của shop **không** gọi được API admin (403).

## Tool

| Nhóm | Tool |
|------|------|
| Website | `od_admin_site_status`, `od_admin_recent_activity`, `od_admin_list_integrations`, `od_admin_overview`, `od_admin_usage` |
| Tài khoản | `od_admin_list_users`, `od_admin_set_user_admin`, `od_admin_reset_usage` |
| Giới hạn | `od_admin_set_limits` |
| Shop | `od_admin_list_stores`, `od_admin_get_store`, `od_admin_update_store`, `od_admin_delete_store` |
| Thành viên | `od_admin_add_member`, `od_admin_set_member_role`, `od_admin_remove_member` |
| Token shop | `od_admin_rotate_store_token`, `od_admin_revoke_store_token` |
| Dữ liệu shop | `od_admin_shop_campaigns`, `od_admin_shop_artworks`, `od_admin_shop_orders` |

## Luật

1. Hỏi user trước khi: xoá shop (`confirm=DELETE`), Gen lại/thu hồi token shop, hạ quyền admin, xoá thành viên, khoá shop.
2. `od_admin_delete_store` không có `confirm` chỉ trả kế hoạch xoá — đọc cho user trước.
3. Không in token của người khác ra chat trừ khi user yêu cầu.
4. Sửa campaign/artwork trong shop thì dùng MCP `open-designer` với token của shop đó.
