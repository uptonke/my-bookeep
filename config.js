// Supabase config
// 注意：你貼的 sb_publishable_... 是 publishable API key，不是 Project URL。
// 這裡已根據 anon JWT 裡的 project ref 推出 Project URL。
// 如果無法連線，請到 Supabase → Project Settings → API → Project URL 複製替換下方 URL。

const SUPABASE_URL = "https://nsopmqzuuwkryyvfvgtj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zb3BtcXp1dXdrcnl5dmZ2Z3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDQ3ODIsImV4cCI6MjA5NDQ4MDc4Mn0.sc5oXk9QjaW-81IlPP_lcbxRcJGEjV9qq6o0EO7z92Q";

window.APP_CONFIG = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  APP_NAME: "個人記帳系統"
};
