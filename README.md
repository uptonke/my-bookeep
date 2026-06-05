# 個人記帳 v60-full 完整整合版

這版不是 v60-safe launcher，不會再從外部 commit 載入核心程式。  
`script.js` 已經是完整主程式，並整合前面 hotfix。

## 使用方式

1. 備份目前 repo。
2. 用本包的 `index.html`、`script.js`、`style.css`、`config.js` 覆蓋 repo 根目錄。
3. 開啟網站時使用：

```txt
?v=60-full
```

左側應顯示：

```txt
雲端資料庫｜v60-full
```

## 已整合內容

- 保留 v58 完整 UI：年度預算圖表、預算操作、結轉 / 提撥 / 移轉紀錄、報表模式。
- `config.js` 同時支援大寫與小寫 Supabase 設定 key。
- 寫入資料時，如果 Supabase 舊 schema 缺少某欄位，會自動移除該欄位後重試，避免 `Could not find column` 連環爆。
- `quick_templates` 若沒有 `to_account_id` 欄位，轉帳模板仍會把轉入帳戶備援存入 note marker；App 顯示時會自動隱藏 marker。
- 流水帳「最近交易」改為預覽最近 20 筆，避免畫面被大量交易塞爆。
- 若常用 view 不存在，會盡量由 base tables fallback 計算。

## 測試清單

```txt
[ ] 左側顯示 v60-full
[ ] 總覽可開
[ ] 流水帳可開
[ ] 年度預算可開
[ ] 帳戶可開
[ ] 報表可開
[ ] 更多可開
[ ] 年度預算圖表存在
[ ] 全局提撥紀錄存在
[ ] 項目提撥紀錄存在
[ ] 預算移轉紀錄存在
[ ] 編輯帳戶可儲存
[ ] 新增 / 編輯轉帳模板可套入轉入帳戶
[ ] 新增 1 元測試支出成功
[ ] 刪除 1 元測試支出成功
```

## 注意

如果資料庫真的缺少 `quick_templates.to_account_id`，這版會用 note marker 備援保存轉入帳戶。長期乾淨做法仍是補欄位，可執行本包的 `migration_v60_full_optional.sql`。


## v60-full-close-records 修正

- 新增「結帳紀錄（點擊展開 / 收合）」區塊。
- 預算項目按「結帳」後產生的 `[CLOSE]` 提撥紀錄，現在會獨立顯示在「結帳紀錄」。
- 「項目提撥紀錄」會排除 `[CLOSE]` 結帳承接資料，避免混在一般手動提撥紀錄裡。
- 不需要跑 SQL；結帳紀錄沿用既有 `budget_contributions.note` 的 `[CLOSE]` 標記。
