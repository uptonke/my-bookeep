# 個人記帳系統 v13

## 更新方式

1. 覆蓋 GitHub repo 根目錄的 `index.html`、`style.css`、`script.js`、`config.js`。
2. 開啟網站時使用 `?v=13`，確認左側顯示「雲端資料庫｜v13」。
3. Supabase 權限只需要執行一次 `final_permissions.sql`。

## v13 修正

- 修正年度預算、流水帳等表單出現「未知表單：[object HTMLInputElement]」。
- 修正原因：表單內有 `name="id"` 的隱藏欄位，導致 `form.id` 被 HTMLInputElement 覆蓋。現在全部改用 `form.getAttribute("id")`。
- 修正訂閱表單不應同時進入通用儲存流程。
- 刪除流程改成刪除後再查一次資料庫確認，不再依賴 Supabase 是否回傳被刪資料。
- 權限 SQL 收斂成單一 `final_permissions.sql`。
