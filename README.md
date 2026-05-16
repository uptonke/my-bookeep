# 個人記帳系統 v8

本版重點：訂閱管理改為真正寫入後驗證。新增訂閱時若 Supabase 沒有回傳 id、或重新讀取後找不到該筆資料，會直接顯示錯誤，不會再假裝成功。

更新方式：覆蓋 index.html、style.css、script.js、config.js、README.md。若已經跑過 v4 以前的 migration，不需要再跑 SQL。

打開網站時建議在網址後加 `?v=8`，避免 GitHub Pages 或瀏覽器快取舊版。
