# 個人記帳系統 v6

本版修正訂閱管理：

- 新增訂閱後會直接重新讀取 `recurring_transactions`。
- 訂閱列表新增「重新讀取訂閱」按鈕。
- `index.html` 對 `style.css`、`config.js`、`script.js` 加上 `?v=6`，降低 GitHub Pages 快取造成舊版 JS 沒更新的機率。

更新方式：只需要覆蓋前端檔案，不需要重新執行 schema 或 migration。

要覆蓋的檔案：

```txt
index.html
style.css
script.js
config.js
README.md
```

如果訂閱仍未顯示，請在 Supabase SQL Editor 執行：

```sql
SELECT id, name, type, amount, frequency, next_due_date, is_active, created_at
FROM public.recurring_transactions
ORDER BY created_at DESC
LIMIT 20;
```

如果 SQL 查得到、網站看不到，幾乎就是部署或快取問題。


## v7 修正

- 訂閱管理改成固定扣款支出，不再提供收入 / 轉帳型訂閱。
- 新增訂閱前會檢查必填欄位。
- 訂閱寫入 Supabase 後必須回傳 id，否則會顯示錯誤。
- 訂閱新增後會重新讀取訂閱列表。
