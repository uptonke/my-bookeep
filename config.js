// 記帳系統後端設定
// 注意：Supabase anon / publishable key 是前端公開金鑰，不是 service_role 私密金鑰。
// 若無法連線，請到 Supabase 專案設定複製真正的 Project URL 與 anon / publishable key。

const SUPABASE_URL = "https://nsopmqzuuwkryyvfvgtj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zb3BtcXp1dXdrcnl5dmZ2Z3RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDQ3ODIsImV4cCI6MjA5NDQ4MDc4Mn0.sc5oXk9QjaW-81IlPP_lcbxRcJGEjV9qq6o0EO7z92Q";

window.APP_CONFIG = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY
};
