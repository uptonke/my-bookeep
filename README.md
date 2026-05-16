# 個人記帳系統 — Supabase 版

## 檔案

- `index.html`：主畫面
- `style.css`：樣式
- `script.js`：前端邏輯
- `config.js`：Supabase 連線設定
- `schema.sql`：資料庫 schema

## 使用步驟

1. 到 Supabase 新 project。
2. 開啟 `SQL Editor`。
3. 貼上 `schema.sql`，按 `Run without RLS`。
4. 把整包檔案上傳到 GitHub repo。
5. 開 GitHub Pages。
6. 開啟網頁後測試新增帳戶、年度預算、流水帳。

## 重要注意

你貼的 `sb_publishable_...` 不是 Project URL。  
我已用 anon JWT 裡的 project ref 推出：

```txt
https://nsopmqzuuwkryyvfvgtj.supabase.co
```

如果連線失敗，到 Supabase：

```txt
Project Settings → API → Project URL
```

把真正 URL 複製到 `config.js` 的 `SUPABASE_URL`。

## 安全提醒

這版是單人測試版：

- 沒有 Auth
- 沒有 RLS
- 前端直接用 anon key
- 不適合放敏感真實帳務資料

正式版應改成 Supabase Auth + Row Level Security。
