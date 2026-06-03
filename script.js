/* global supabase, APP_CONFIG */

// Bookeep v60-safe launcher.
// It loads the last known large core script and then installs schema compatibility patches.
// This avoids overwriting the full app with a truncated script.

const BOOKEEP_SAFE_VERSION = "v60-safe";
const BOOKEEP_CORE_SCRIPT_URL = "https://cdn.jsdelivr.net/gh/uptonke/my-bookeep@b7318447085096ad1ccb9febd07fdf1bdda78324/script.js";

(function patchSupabaseMissingViews() {
  if (!window.supabase || window.supabase.__bookeepSafePatched) return;
  const originalCreateClient = window.supabase.createClient.bind(window.supabase);

  window.supabase.createClient = function patchedCreateClient(...args) {
    const client = originalCreateClient(...args);
    const originalFrom = client.from.bind(client);

    client.from = function patchedFrom(tableName) {
      if (tableName === "v_transaction_details") {
        return {
          select: async columns => {
            const txRes = await originalFrom("transactions").select(columns || "*");
            if (txRes.error) return txRes;

            const [accountsRes, categoriesRes, budgetItemsRes] = await Promise.allSettled([
              originalFrom("accounts").select("*"),
              originalFrom("categories").select("*"),
              originalFrom("budget_items").select("*")
            ]);

            const okData = settled => settled.status === "fulfilled" && !settled.value.error ? (settled.value.data || []) : [];
            const mapById = rows => new Map((rows || []).map(row => [row.id, row]));
            const lookups = {
              accounts: mapById(okData(accountsRes)),
              categories: mapById(okData(categoriesRes)),
              budgetItems: mapById(okData(budgetItemsRes))
            };

            return { data: (txRes.data || []).map(t => normalizeTransactionDetailSafe(t, lookups)), error: null };
          }
        };
      }

      if (tableName === "v_year_summary" || tableName === "v_budget_summary") {
        return { select: async () => ({ data: [], error: null }) };
      }

      return originalFrom(tableName);
    };

    return client;
  };

  window.supabase.__bookeepSafePatched = true;
})();

function normalizeTransactionDetailSafe(t, lookups = {}) {
  const date = String(t.transaction_date || "");
  const year = Number(date.slice(0, 4)) || null;
  const month = Number(date.slice(5, 7)) || null;
  const account = lookups.accounts?.get?.(t.account_id) || {};
  const toAccount = lookups.accounts?.get?.(t.to_account_id) || {};
  const category = lookups.categories?.get?.(t.category_id) || {};
  const budgetItem = lookups.budgetItems?.get?.(t.budget_item_id) || {};

  return {
    ...t,
    tx_year: t.tx_year ?? year,
    tx_month: t.tx_month ?? month,
    account_name: t.account_name || account.name || "",
    to_account_name: t.to_account_name || toAccount.name || "",
    category_name: t.category_name || category.name || "",
    budget_item_name: t.budget_item_name || budgetItem.name || "",
    tags: t.tags || "",
    status: t.status || "cleared"
  };
}

function missingColumnNameFromErrorSafe(error) {
  const text = String(error?.message || error || "");
  const match = text.match(/Could not find the '([^']+)' column/);
  return match ? match[1] : "";
}

function installBookeepSafePatches() {
  window.renderAnalyticsSummaryCards = function renderAnalyticsSummaryCardsCompat() {
    const s = getCurrentYearSummary();
    const monthly = getMonthlyAnalyticsRows();
    const latestMonth = [...monthly].reverse().find(r => r.income || r.expense) || monthly[monthly.length - 1] || {};
    const healthRows = getHealthRows();
    const luxury = healthRows.find(r => r.key === "luxury")?.amount || 0;
    const expense = Number(s.actual_expense || 0);
    const luxuryPct = expense ? luxury / expense * 100 : 0;
    const savingRate = Number(latestMonth.income || 0)
      ? (Number(latestMonth.income || 0) - Number(latestMonth.expense || 0)) / Number(latestMonth.income || 0) * 100
      : null;

    return `
      <div class="grid cols-4">
        ${metricCard("年度淨現金流", fmtMoney(s.net_cashflow), "收入 − 淨支出", Number(s.net_cashflow || 0) >= 0 ? "good" : "bad")}
        ${metricCard("預算使用率", `${fmtNumber(s.budget_used_pct, 1)}%`, `已用 ${fmtMoney(s.actual_expense)}`, Number(s.budget_used_pct || 0) <= 100 ? "good" : "bad")}
        ${metricCard("最近月份儲蓄率", savingRate === null ? "N/A" : `${fmtNumber(savingRate, 1)}%`, latestMonth.label || "尚無月份資料", savingRate === null ? "" : savingRate >= 0 ? "good" : "bad")}
        ${metricCard("奢侈娛樂占比", `${fmtNumber(luxuryPct, 1)}%`, `金額 ${fmtMoney(luxury)}`, luxuryPct <= 30 ? "" : "warn")}
      </div>
    `;
  };

  window.renderBudgetProgressList = function renderBudgetProgressListCompat(limit = 8) {
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
  };

  async function upsertCompat(table, payload, expect = {}) {
    let attempt = { ...payload };
    const removed = [];
    for (let i = 0; i < 12; i += 1) {
      try {
        return await upsert(table, attempt, { expect });
      } catch (error) {
        const col = missingColumnNameFromErrorSafe(error);
        if (!col || !(col in attempt)) throw error;
        delete attempt[col];
        removed.push(col);
      }
    }
    throw new Error(`${table} 儲存失敗：schema 欄位不相容。已移除欄位：${removed.join("、")}`);
  }

  window.saveAccount = async function saveAccountCompat(form) {
    const d = readForm(form);
    const payload = {
      id: d.id || undefined,
      name: d.name,
      type: d.type,
      currency: d.currency || "TWD",
      initial_balance: numberOrZero(d.initial_balance),
      color: d.color || "#64748b",
      sort_order: numberOrZero(d.sort_order),
      is_active: boolValue(d.is_active),
      note: applyAccountCoverageMarker(d.note || "", d.coverage_mode || "auto")
    };
    return await upsertCompat("accounts", payload, { name: payload.name });
  };

  window.saveQuickTemplate = async function saveQuickTemplateCompat(form) {
    const d = readForm(form);
    const payload = {
      id: d.id || undefined,
      name: d.name,
      type: d.type || "expense",
      default_account_id: d.default_account_id || null,
      default_to_account_id: d.default_to_account_id || null,
      category_id: d.category_id || null,
      budget_item_id: d.budget_item_id || null,
      merchant: d.merchant || null,
      default_amount: d.default_amount ? numberOrZero(d.default_amount) : null,
      payment_method: d.payment_method || null,
      necessity_level: d.necessity_level || "quality",
      cashflow_nature: d.cashflow_nature || "variable",
      control_level: d.control_level || "controllable",
      sort_order: numberOrZero(d.sort_order),
      is_active: boolValue(d.is_active),
      note: d.note || null
    };
    return await upsertCompat("quick_templates", payload, { name: payload.name, type: payload.type });
  };

  document.querySelectorAll(".nav-btn[data-tab]").forEach(btn => {
    if (btn.dataset.safeBound === "true") return;
    btn.dataset.safeBound = "true";
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab && typeof window.setPage === "function") window.setPage(tab);
      else if (tab && typeof setPage === "function") setPage(tab);
    });
  });

  const brandVersion = document.querySelector(".brand p");
  if (brandVersion) brandVersion.textContent = `雲端資料庫｜${BOOKEEP_SAFE_VERSION}`;
}

function loadBookeepCoreSafe() {
  const script = document.createElement("script");
  script.src = BOOKEEP_CORE_SCRIPT_URL;
  script.defer = false;
  script.onload = () => {
    installBookeepSafePatches();
    setTimeout(installBookeepSafePatches, 0);
    setTimeout(installBookeepSafePatches, 500);
  };
  script.onerror = () => {
    const box = document.querySelector("#alertBox");
    if (box) {
      box.className = "alert bad";
      box.textContent = "核心程式載入失敗。請檢查網路或重新整理。";
    }
  };
  document.head.appendChild(script);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadBookeepCoreSafe, { once: true });
} else {
  loadBookeepCoreSafe();
}
