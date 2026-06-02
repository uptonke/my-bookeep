// v59 hotfix：補回缺失 helper、相容舊 Supabase schema、補回主選單點擊。
// 這個檔案必須在 script.js 前載入。

(function patchSupabaseMissingViews() {
  if (!window.supabase || window.supabase.__bookeepV59Patched) return;
  const originalCreateClient = window.supabase.createClient.bind(window.supabase);

  window.supabase.createClient = function patchedCreateClient(...args) {
    const client = originalCreateClient(...args);
    const originalFrom = client.from.bind(client);

    client.from = function patchedFrom(tableName) {
      if (tableName === "v_transaction_details") {
        return {
          select: async columns => {
            const res = await originalFrom("transactions").select(columns || "*");
            if (res.error) return res;
            return { data: (res.data || []).map(normalizeTransactionDetail), error: null };
          }
        };
      }

      // 舊 schema 沒有這兩個 view；目前前端主要用 getCurrentYearSummary() 自算，所以給空陣列避免假錯誤。
      if (tableName === "v_year_summary" || tableName === "v_budget_summary") {
        return { select: async () => ({ data: [], error: null }) };
      }

      return originalFrom(tableName);
    };

    return client;
  };

  window.supabase.__bookeepV59Patched = true;
})();

(function patchMainNavClick() {
  window.addEventListener("DOMContentLoaded", () => {
    const bind = () => {
      if (typeof window.setPage !== "function" && typeof setPage !== "function") return false;
      document.querySelectorAll(".nav-btn[data-tab]").forEach(btn => {
        if (btn.dataset.hotfixBound === "true") return;
        btn.dataset.hotfixBound = "true";
        btn.addEventListener("click", () => {
          const tab = btn.dataset.tab;
          if (!tab) return;
          if (typeof window.setPage === "function") window.setPage(tab);
          else setPage(tab);
        });
      });
      return true;
    };

    if (bind()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (bind() || tries >= 20) clearInterval(timer);
    }, 100);
  });
})();

function normalizeTransactionDetail(t) {
  const date = String(t.transaction_date || "");
  const year = Number(date.slice(0, 4)) || null;
  const month = Number(date.slice(5, 7)) || null;
  return {
    ...t,
    tx_year: t.tx_year ?? year,
    tx_month: t.tx_month ?? month,
    account_name: t.account_name || "",
    to_account_name: t.to_account_name || "",
    category_name: t.category_name || "",
    budget_item_name: t.budget_item_name || "",
    tags: t.tags || "",
    status: t.status || "cleared"
  };
}

function renderAnalyticsSummaryCards() {
  const s = getCurrentYearSummary();
  const monthly = getMonthlyAnalyticsRows();
  const latestMonth = [...monthly].reverse().find(r => r.income || r.expense) || monthly[monthly.length - 1] || {};
  const healthRows = getHealthRows();
  const luxury = healthRows.find(r => r.key === "luxury")?.amount || 0;
  const expense = Number(s.actual_expense || 0);
  const luxuryPct = expense ? luxury / expense * 100 : 0;
  const savingRate = Number(latestMonth.income || 0) ? (Number(latestMonth.income || 0) - Number(latestMonth.expense || 0)) / Number(latestMonth.income || 0) * 100 : null;

  return `
    <div class="grid cols-4">
      ${metricCard("年度淨現金流", fmtMoney(s.net_cashflow), "收入 − 淨支出", Number(s.net_cashflow || 0) >= 0 ? "good" : "bad")}
      ${metricCard("預算使用率", `${fmtNumber(s.budget_used_pct, 1)}%`, `已用 ${fmtMoney(s.actual_expense)}`, Number(s.budget_used_pct || 0) <= 100 ? "good" : "bad")}
      ${metricCard("最近月份儲蓄率", savingRate === null ? "N/A" : `${fmtNumber(savingRate, 1)}%`, latestMonth.label || "尚無月份資料", savingRate === null ? "" : savingRate >= 0 ? "good" : "bad")}
      ${metricCard("奢侈娛樂占比", `${fmtNumber(luxuryPct, 1)}%`, `金額 ${fmtMoney(luxury)}`, luxuryPct <= 30 ? "" : "warn")}
    </div>
  `;
}

function renderBudgetProgressList(limit = 8) {
  const rows = getBudgetCompareRows(limit);
  if (!rows.length) return `<div class="empty">尚無預算項目</div>`;
  return `
    <div class="budget-progress-list">
      ${rows.map(r => {
        const pct = r.planned ? Math.max(0, r.actual / r.planned * 100) : 0;
        return `
          <div class="budget-progress-item">
            <div class="top">
              <strong>${escapeHtml(r.name)}</strong>
              <span class="badge ${pct > 100 ? "expense" : "income"}">${fmtNumber(pct, 1)}%</span>
            </div>
            <div class="${pct > 100 ? "progress danger" : "progress"}"><span style="width:${Math.min(100, pct)}%"></span></div>
            <div class="meta">
              <span>實際 ${fmtMoney(r.actual)}</span>
              <span>預算 ${fmtMoney(r.planned)}</span>
              <span>${Number(r.remaining || 0) >= 0 ? `剩餘 ${fmtMoney(r.remaining)}` : `超支 ${fmtMoney(Math.abs(Number(r.remaining || 0)))}`}</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}
