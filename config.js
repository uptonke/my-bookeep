// 記帳系統後端設定
// 注意：你貼的 sb_publishable_... 是公開金鑰，不是專案網址。
// 這裡已依照公開金鑰中的專案代號推回專案網址。
// 如果無法連線，請到後端資料庫後台的專案設定，複製真正的專案網址替換下方內容。

const SUPABASE_URL = "https://nsopmqzuuwkryyvfvgtj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zb3BtcXp1dXdrcnl5dmZ2Z3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDQ3ODIsImV4cCI6MjA5NDQ4MDc4Mn0.sc5oXk9QjaW-81IlPP_lcbxRcJGEjV9qq6o0EO7z92Q";

window.APP_CONFIG = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY
};
