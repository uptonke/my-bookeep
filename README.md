# 個人記帳系統 v14

## 更新方式

1. 覆蓋 GitHub repo 根目錄的 `index.html`、`style.css`、`script.js`、`config.js`。
2. 開啟網站時使用 `?v=13`，確認左側顯示「雲端資料庫｜v14」。
3. Supabase 權限只需要執行一次 `final_permissions.sql`。

## v14 修正

- 修正年度預算、流水帳等表單出現「未知表單：[object HTMLInputElement]」。
- 修正原因：表單內有 `name="id"` 的隱藏欄位，導致 `form.id` 被 HTMLInputElement 覆蓋。現在全部改用 `form.getAttribute("id")`。
- 修正訂閱表單不應同時進入通用儲存流程。
- 刪除流程改成刪除後再查一次資料庫確認，不再依賴 Supabase 是否回傳被刪資料。
- 權限 SQL 收斂成單一 `final_permissions.sql`。


更新：v15 已加入年度預算圓環圖、分類支出長條圖、月度收支折線圖、預算 vs 實際圖表。


v16：圖表版面調整成更乾淨的卡片式介面，並加入圖表篩選器：本年 / 本月、全部分類 / 指定分類。


v18：不做年化，預算金額維持你填的原始尺度；報表頁借貸帳改成真正 T 字帳卡片，依科目分組顯示借方 / 貸方。


v19：專門優化手機板 UI/UX。桌機版 CSS 不動；760px 以下改為底部導覽、單欄卡片、表單大觸控區、表格左右滑動提示、圖表手機高度與 T 字帳手機排版。
