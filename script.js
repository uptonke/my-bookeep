/* global supabase, APP_CONFIG */

const APP_VERSION = "v28";
const chartInstances = {};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  client: null,
  activeTab: "overview",
  loading: false,
  selectedYearId: null,
  selectedBudgetYear: new Date().getFullYear(),
  draftTxType: "expense",
  draftRecurringType: "expense",
  data: {
    years: [],
    accounts: [],
    categories: [],
    tags: [],
    budgetItems: [],
    transactions: [],
    transactionView: [],
    accountBalances: [],
    yearSummary: [],
    budgetSummary: [],
    categorySpending: [],
    monthlyCashflow: [],
    recurring: [],
    quickTemplates: [],
    creditCards: [],
    creditStatements: [],
    loans: [],
    goals: []
  },
  editing: {
    transaction: null,
    budgetItem: null,
    account: null,
    category: null,
    tag: null,
    recurring: null,
    quickTemplate: null,
    creditCard: null,
    loan: null,
    goal: null,
    year: null
  },
  filters: {
    txSearch: "",
    txType: "",
    txCategory: "",
    txAccount: "",
    txStart: "",
    txEnd: "",
    chartScope: "year",
    chartCategory: ""
  },
  loadErrors: []
};

const pageMeta = {
  overview: ["總覽", "年度預算、現金流與近期交易"],
  transactions: ["記一筆", "支出 / 收入 / 轉帳 / 退款，各自顯示不同欄位"],
  budget: ["年度預算", "年度預算項目、結轉與預算使用率"],
  accounts: ["帳戶", "現金、銀行、電子支付、信用卡與其他帳戶"],
  categories: ["分類 / 標籤", "收支分類與交易標籤管理"],
  recurring: ["訂閱管理", `管理訂閱、固定扣款、下次扣款日與取消狀態｜系統版本 ${APP_VERSION}`],
  creditLoans: ["信用卡 / 貸款", "信用卡帳單與債務追蹤"],
  goals: ["目標", "儲蓄、還債、旅遊與大額購買目標"],
  reports: ["報表", "月現金流、分類支出、借貸帳與表格匯出"],
  templates: ["模板管理", "自訂快速記一筆模板"],
  settings: ["設定", "連線狀態、資料匯出與操作提示"],
  mobileMore: ["更多", "帳戶、分類、訂閱、模板與設定"]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtMoney(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(n);
}

function fmtNumber(value, digits = 0) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}



const labelMaps = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  refund: "退款",
  saving: "儲蓄",
  other: "其他",

  survival: "生存必要",
  quality: "生活品質",
  luxury: "奢侈娛樂",
  investment: "自我投資",

  fixed: "固定",
  variable: "變動",
  one_time: "一次性",

  cleared: "已入帳",
  pending: "待確認",
  cancelled: "已取消",

  annual: "每年",
  monthly: "每月",
  weekly: "每週",
  daily: "每天",
  quarterly: "每季",
  yearly: "每年",
  custom: "自訂",

  none: "無",
  carryover: "餘額結轉",
  overspend_to_next: "超支帶入下期",

  cash: "現金",
  bank: "銀行",
  e_wallet: "電子支付",
  credit_card: "信用卡",
  loan: "貸款",
  asset: "資產",

  cashback: "現金回饋",
  points: "點數",
  miles: "哩程",

  student_loan: "學貸",
  personal_loan: "信貸",
  mortgage: "房貸",
  car_loan: "車貸",
  credit_card_debt: "信用卡債",
  installment: "分期付款",

  active: "啟用",
  paused: "暫停",
  completed: "已完成",
  paid_off: "已還清",

  debt_reduction: "還債",
  travel: "旅行",
  emergency_fund: "緊急預備金",
  purchase: "大額購買"
};

const tableLabelMap = {
  years: "年度",
  accounts: "帳戶",
  categories: "分類",
  tags: "標籤",
  budget_items: "預算項目",
  transactions: "交易",
  recurring_transactions: "訂閱",
  quick_templates: "快速模板",
  credit_cards: "信用卡",
  loans: "貸款",
  goals: "目標"
};

const colorPalette = [
  ["#64748b", "石板灰"],
  ["#2563eb", "穩重藍"],
  ["#0284c7", "湖水藍"],
  ["#0f766e", "深青綠"],
  ["#16a34a", "成長綠"],
  ["#ca8a04", "琥珀黃"],
  ["#f97316", "活力橘"],
  ["#dc2626", "警示紅"],
  ["#7c3aed", "紫色"],
  ["#db2777", "桃紅"],
  ["#334155", "深灰"],
  ["#000000", "黑色"]
];

function labelOf(value) {
  if (value === null || value === undefined || value === "") return "";
  return labelMaps[String(value)] || String(value);
}

function tableLabel(value) {
  return tableLabelMap[String(value)] || "資料";
}

function colorName(value) {
  const found = colorPalette.find(([hex]) => hex.toLowerCase() === String(value || "").toLowerCase());
  return found ? found[1] : "自訂顏色";
}

function colorOptions(selected = "#64748b") {
  const current = selected || "#64748b";
  const hasCurrent = colorPalette.some(([hex]) => hex.toLowerCase() === String(current).toLowerCase());
  const opts = colorPalette.map(([hex, name]) => {
    const isSelected = String(hex).toLowerCase() === String(current).toLowerCase() ? "selected" : "";
    return `<option value="${escapeHtml(hex)}" ${isSelected}>${escapeHtml(name)}</option>`;
  });
  if (!hasCurrent) {
    opts.unshift(`<option value="${escapeHtml(current)}" selected>目前顏色</option>`);
  }
  return opts.join("");
}

function colorDot(value) {
  const color = value || "#64748b";
  return `<span class="color-dot" style="background:${escapeHtml(color)}"></span>${escapeHtml(colorName(color))}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function showAlert(message, type = "warn") {
  const box = $("#alertBox");
  box.className = `alert ${type === "bad" ? "bad" : type === "good" ? "good" : ""}`;
  box.innerHTML = message;
  if (!message) box.classList.add("hidden");
}

function setConnection(ok, text) {
  const dot = $("#connectionDot");
  const status = $("#connectionStatus");
  dot.className = `status-dot ${ok ? "ok" : "bad"}`;
  status.textContent = text;
}

function optionList(rows, selected, label = "name", value = "id", placeholder = "請選擇") {
  const opts = [`<option value="">${escapeHtml(placeholder)}</option>`];
  rows.forEach(row => {
    const isSelected = String(row[value]) === String(selected) ? "selected" : "";
    opts.push(`<option value="${escapeHtml(row[value])}" ${isSelected}>${escapeHtml(row[label])}</option>`);
  });
  return opts.join("");
}

function categoryTypeFor(type = "") {
  if (type === "refund") return "expense";
  return type;
}

function categoryOptions(type = "", selected = "") {
  const mappedType = categoryTypeFor(type);
  const rows = state.data.categories
    .filter(c => !mappedType || c.type === mappedType)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
  return optionList(rows, selected, "name", "id", "未分類");
}

function expenseTransactionOptions(selected = "") {
  const rows = transactionsForSelectedYear()
    .filter(t => t.type === "expense" && t.status !== "cancelled")
    .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)))
    .slice(0, 120);
  const opts = [`<option value="">不關聯原支出</option>`];
  rows.forEach(t => {
    const label = `${t.transaction_date}｜${fmtMoney(t.amount)}｜${t.merchant || t.category_name || "未命名支出"}`;
    opts.push(`<option value="${escapeHtml(t.id)}" ${String(t.id) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`);
  });
  return opts.join("");
}

function accountOptions(selected = "") {
  const rows = state.data.accounts
    .filter(a => a.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
  return optionList(rows, selected, "name", "id", "請選擇帳戶");
}

function creditCardAccountOptions(selected = "") {
  const rows = state.data.accounts
    .filter(a => a.is_active !== false && a.type === "credit_card")
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
  return optionList(rows, selected, "name", "id", "請先在帳戶新增信用卡帳戶");
}

function budgetItemOptions(selected = "") {
  const rows = state.data.budgetItems
    .filter(b => b.year_id === state.selectedYearId && b.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
  return optionList(rows, selected, "name", "id", "不綁定預算項目");
}

function enrichTransaction(row) {
  const account = state.data.accounts.find(a => a.id === row.account_id) || {};
  const toAccount = state.data.accounts.find(a => a.id === row.to_account_id) || {};
  const category = state.data.categories.find(c => c.id === row.category_id) || {};
  const budgetItem = state.data.budgetItems.find(b => b.id === row.budget_item_id) || {};
  const date = row.transaction_date || "";
  return {
    ...row,
    tx_year: date ? Number(String(date).slice(0, 4)) : null,
    tx_month: date ? Number(String(date).slice(5, 7)) : null,
    account_name: account.name || "",
    account_type: account.type || "",
    to_account_name: toAccount.name || "",
    category_name: category.name || "未分類",
    category_type: category.type || "",
    budget_item_name: budgetItem.name || "",
    tags: row.tags || ""
  };
}

function allTransactionsEnriched() {
  return (state.data.transactions || [])
    .map(enrichTransaction)
    .sort((a, b) => String(b.transaction_date || "").localeCompare(String(a.transaction_date || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function transactionsForSelectedYear() {
  return allTransactionsEnriched().filter(t => Number(t.tx_year) === Number(state.selectedBudgetYear));
}

function getCurrentYearSummary() {
  const year = state.data.years.find(y => y.id === state.selectedYearId)
    || state.data.years.find(y => Number(y.budget_year) === Number(state.selectedBudgetYear))
    || {};
  const txRows = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  const actual_income = txRows.reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount || 0) : 0), 0);
  const gross_expense = txRows.reduce((sum, t) => sum + (t.type === "expense" ? Number(t.amount || 0) : 0), 0);
  const refund = txRows.reduce((sum, t) => sum + (t.type === "refund" ? Number(t.amount || 0) : 0), 0);
  const actual_expense = gross_expense - refund;
  const annual_budget = Number(year.annual_budget || 0);
  const carryover_from_previous = Number(year.carryover_from_previous || 0);
  const available_budget = annual_budget + carryover_from_previous;
  const remaining_budget = available_budget - actual_expense;
  return {
    year_id: year.id,
    budget_year: year.budget_year || state.selectedBudgetYear,
    name: year.name || `${state.selectedBudgetYear} 年度預算`,
    annual_budget,
    carryover_from_previous,
    available_budget,
    actual_income,
    actual_expense,
    net_cashflow: actual_income - actual_expense,
    remaining_budget,
    budget_used_pct: available_budget ? Math.round(actual_expense / available_budget * 10000) / 100 : 0,
    is_closed: year.is_closed,
    note: year.note
  };
}

function budgetItemSummariesForSelectedYear() {
  const txRows = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  return (state.data.budgetItems || [])
    .filter(i => i.year_id === state.selectedYearId)
    .map(i => {
      const category = state.data.categories.find(c => c.id === i.category_id) || {};
      const actual_amount = txRows.reduce((sum, t) => {
        if (t.budget_item_id !== i.id) return sum;
        if (i.item_type === "expense" && t.type === "refund") return sum - Number(t.amount || 0);
        if (t.type === i.item_type) return sum + Number(t.amount || 0);
        return sum;
      }, 0);
      const planned_amount = Number(i.planned_amount || 0);
      return {
        ...i,
        budget_item_id: i.id,
        budget_year: state.selectedBudgetYear,
        category_name: category.name || "",
        category_type: category.type || "",
        actual_amount,
        remaining_amount: planned_amount - actual_amount,
        used_pct: planned_amount ? Math.round(actual_amount / planned_amount * 10000) / 100 : 0
      };
    })
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
}

function typeBadge(type) {
  return `<span class="badge ${escapeHtml(type)}">${escapeHtml(labelOf(type))}</span>`;
}

async function queryTable(name, options = {}) {
  let query = state.client.from(name).select(options.select || "*");
  if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
  const { data, error } = await query;
  if (error) throw new Error(`${name}: ${error.message}`);
  return data || [];
}

async function loadRecurringOnly() {
  const rows = await queryTable("recurring_transactions", { order: { column: "next_due_date", ascending: true } });
  state.data.recurring = rows;
  return rows;
}

async function loadAll() {
  state.loading = true;
  state.loadErrors = [];
  showAlert("");

  const requests = {
    years: queryTable("years", { order: { column: "budget_year", ascending: true } }),
    accounts: queryTable("accounts", { order: { column: "sort_order", ascending: true } }),
    categories: queryTable("categories", { order: { column: "sort_order", ascending: true } }),
    tags: queryTable("tags", { order: { column: "name", ascending: true } }),
    budgetItems: queryTable("budget_items", { order: { column: "sort_order", ascending: true } }),
    transactions: queryTable("transactions", { order: { column: "transaction_date", ascending: false } }),
    transactionView: queryTable("v_transactions_full", { order: { column: "transaction_date", ascending: false } }),
    accountBalances: queryTable("v_account_balances", { order: { column: "sort_order", ascending: true } }),
    yearSummary: queryTable("v_year_budget_summary", { order: { column: "budget_year", ascending: true } }),
    budgetSummary: queryTable("v_budget_item_summary", { order: { column: "name", ascending: true } }),
    categorySpending: queryTable("v_category_spending"),
    monthlyCashflow: queryTable("v_monthly_cashflow"),
    recurring: queryTable("recurring_transactions", { order: { column: "next_due_date", ascending: true } }),
    quickTemplates: queryTable("quick_templates", { order: { column: "sort_order", ascending: true } }),
    creditCards: queryTable("credit_cards", { order: { column: "card_name", ascending: true } }),
    creditStatements: queryTable("credit_card_statements", { order: { column: "due_date", ascending: false } }),
    loans: queryTable("loans", { order: { column: "created_at", ascending: false } }),
    goals: queryTable("goals", { order: { column: "priority", ascending: true } })
  };

  try {
    const entries = Object.entries(requests);
    const results = await Promise.allSettled(entries.map(async ([key, promise]) => [key, await promise]));
    const nextData = {};
    const errors = [];

    results.forEach((result, index) => {
      const key = entries[index][0];
      if (result.status === "fulfilled") {
        const [resolvedKey, value] = result.value;
        nextData[resolvedKey] = value;
      } else {
        errors.push(`${key}: ${result.reason?.message || result.reason}`);
      }
    });

    Object.assign(state.data, nextData);
    state.loadErrors = errors;

    if (!state.selectedYearId && state.data.years.length) {
      const current = state.data.years.find(y => Number(y.budget_year) === new Date().getFullYear()) || state.data.years[state.data.years.length - 1];
      state.selectedYearId = current.id;
      state.selectedBudgetYear = current.budget_year;
    }

    if (errors.length) {
      console.warn("部分資料讀取失敗", errors);
      setConnection(false, "部分資料讀取失敗");
      showAlert(`部分資料讀取失敗：${escapeHtml(errors.slice(0, 3).join("；"))}${errors.length > 3 ? "……" : ""}`, "warn");
    } else {
      setConnection(true, "已連線");
    }

    renderYearSelect();
  } catch (error) {
    console.error(error);
    state.loadErrors = [error.message];
    setConnection(false, "連線或資料庫結構異常");
    showAlert(`資料庫讀取失敗：${escapeHtml(error.message)}。請確認已執行資料庫結構檔，且設定檔的專案網址與公開金鑰正確。`, "bad");
  } finally {
    state.loading = false;
  }
}

function renderYearSelect() {
  const select = $("#yearSelect");
  select.innerHTML = state.data.years
    .map(y => `<option value="${escapeHtml(y.id)}" ${y.id === state.selectedYearId ? "selected" : ""}>${escapeHtml(y.budget_year)}</option>`)
    .join("");
}

function setPage(tab) {
  state.activeTab = tab;
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  const [title, subtitle] = pageMeta[tab] || pageMeta.overview;
  $("#pageTitle").textContent = title;
  $("#pageSubtitle").textContent = subtitle;
  render();
}

function render() {
  const app = $("#app");
  destroyCharts();
  if (state.loading) {
    app.innerHTML = `<div class="empty">讀取中...</div>`;
    return;
  }
  const renderers = {
    overview: renderOverview,
    transactions: renderTransactions,
    budget: renderBudget,
    accounts: renderAccounts,
    categories: renderCategories,
    recurring: renderRecurring,
    templates: renderTemplates,
    creditLoans: renderCreditLoans,
    goals: renderGoals,
    reports: renderReports,
    settings: renderSettings,
    mobileMore: renderMobileMore
  };
  app.innerHTML = (renderers[state.activeTab] || renderOverview)();
  bindRenderedEvents();
  initCharts();
}

function renderOverview() {
  const s = getCurrentYearSummary();
  const tx = transactionsForSelectedYear().slice(0, 8);
  const expense = Number(s.actual_expense || 0);
  const available = Number(s.available_budget || 0);
  const remaining = Number(s.remaining_budget || 0);
  const pct = available ? Math.min(100, Math.max(0, expense / available * 100)) : 0;
  const progressClass = pct > 90 ? "progress danger" : "progress";

  return `
    <div class="grid cols-4">
      ${metricCard("可用年度預算", fmtMoney(s.available_budget), `年度 ${state.selectedBudgetYear}`)}
      ${metricCard("實際支出", fmtMoney(s.actual_expense), `使用率 ${fmtNumber(s.budget_used_pct, 1)}%`, "bad")}
      ${metricCard("剩餘預算", fmtMoney(remaining), remaining >= 0 ? "仍在預算內" : "已超支", remaining >= 0 ? "good" : "bad")}
      ${metricCard("實際收入", fmtMoney(s.actual_income), `淨現金流 ${fmtMoney(s.net_cashflow)}`, Number(s.net_cashflow || 0) >= 0 ? "good" : "warn")}
    </div>

    <div class="mobile-action-grid">
      <button type="button" data-go="transactions" class="mobile-action-card primary">
        <strong>＋ 記一筆</strong>
        <span>花錢、收入、退款、轉帳</span>
      </button>
      <button type="button" data-go="budget" class="mobile-action-card">
        <strong>看預算</strong>
        <span>剩多少、哪裡快爆</span>
      </button>
      <button type="button" data-go="reports" class="mobile-action-card">
        <strong>看圖表</strong>
        <span>分類支出與 T 字帳</span>
      </button>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3>年度預算進度</h3>
        <span class="badge">${fmtNumber(pct, 1)}%</span>
      </div>
      <div class="${progressClass}"><span style="width:${pct}%"></span></div>
      <p class="metric-sub">可用預算 = 年度預算 + 前年盈餘結轉。支出會扣除退款，只計入狀態不是「已取消」的交易。</p>
    </div>

    ${renderChartToolbar()}

    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row"><h3>年度預算使用圖</h3><span class="badge">圓環圖</span></div>
        <div class="chart-canvas-wrap tall"><canvas id="overviewBudgetChart"></canvas></div>
        <p class="chart-note">這張固定看年度總預算，不受「本月 / 分類」篩選影響。</p>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>分類淨支出排行</h3><span class="badge">長條圖</span></div>
        <div class="chart-canvas-wrap tall"><canvas id="overviewCategoryChart"></canvas></div>
        <p class="chart-note">${escapeHtml(chartScopeText())}。退款會從原分類扣回。</p>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row"><h3>${state.filters.chartScope === "month" ? "本月日度收支趨勢" : "月度收支趨勢"}</h3><span class="badge">折線圖</span></div>
        <div class="chart-canvas-wrap"><canvas id="overviewMonthlyChart"></canvas></div>
        <p class="chart-note">${escapeHtml(chartScopeText())}。用來看節奏是否失控。</p>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>分類預算進度</h3><span class="badge">進度條</span></div>
        ${renderBudgetProgressList(8)}
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row">
          <h3>帳戶餘額</h3>
          <button class="btn small secondary" data-go="accounts">管理帳戶</button>
        </div>
        ${renderAccountBalanceList()}
      </div>
      <div class="card">
        <div class="card-title-row">
          <h3>近期交易</h3>
          <button class="btn small secondary" data-go="transactions">查看全部</button>
        </div>
        ${renderSmallTxTable(tx)}
      </div>
    </div>
  `;
}

function metricCard(label, value, sub, color = "") {
  return `
    <div class="card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value ${color}">${escapeHtml(value)}</div>
      <div class="metric-sub">${escapeHtml(sub || "")}</div>
    </div>
  `;
}

function renderAccountBalanceList() {
  const rows = state.data.accountBalances.filter(a => a.is_active !== false);
  if (!rows.length) return `<div class="empty">尚無帳戶</div>`;
  return `
    <div class="chart-list">
      ${rows.map(a => `
        <div class="card-title-row">
          <span>${escapeHtml(a.name)} <span class="badge">${escapeHtml(labelOf(a.type))}</span></span>
          <strong class="mono">${fmtMoney(a.current_balance)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSmallTxTable(rows) {
  if (!rows.length) return `<div class="empty">尚無交易</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>日期</th><th>類型</th><th>分類</th><th>金額</th><th>商家</th></tr></thead>
        <tbody>
          ${rows.map(t => `
            <tr>
              <td>${escapeHtml(t.transaction_date)}</td>
              <td>${typeBadge(t.type)}</td>
              <td>${escapeHtml(t.category_name || "未分類")}</td>
              <td class="mono ${(t.type === "income" || t.type === "refund") ? "good" : t.type === "expense" ? "bad" : ""}">${fmtMoney(t.amount)}</td>
              <td>${escapeHtml(t.merchant || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


const fallbackQuickTemplates = [
  { key: "builtin-breakfast", name: "早餐", type: "expense", categoryNames: ["日常餐飲", "餐飲"], budgetNames: ["日常餐飲", "餐飲"], merchant: "早餐", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-lunch", name: "午餐", type: "expense", categoryNames: ["日常餐飲", "餐飲"], budgetNames: ["日常餐飲", "餐飲"], merchant: "午餐", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-dinner", name: "晚餐", type: "expense", categoryNames: ["日常餐飲", "餐飲"], budgetNames: ["日常餐飲", "餐飲"], merchant: "晚餐", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-coffee", name: "咖啡", type: "expense", categoryNames: ["日常餐飲", "餐飲"], budgetNames: ["日常餐飲", "餐飲"], merchant: "咖啡", cashflow_nature: "variable", necessity_level: "luxury", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-transport", name: "交通", type: "expense", categoryNames: ["交通"], budgetNames: ["交通"], merchant: "交通", cashflow_nature: "variable", necessity_level: "survival", accountTypes: ["e_wallet", "credit_card", "cash"], is_builtin: true },
  { key: "builtin-movie", name: "電影", type: "expense", categoryNames: ["娛樂"], budgetNames: ["電影", "娛樂"], merchant: "電影", cashflow_nature: "one_time", necessity_level: "luxury", accountTypes: ["credit_card", "cash"], is_builtin: true },
  { key: "builtin-liveMusic", name: "Live Music", type: "expense", categoryNames: ["娛樂"], budgetNames: ["Live Music", "娛樂"], merchant: "Live Music", cashflow_nature: "one_time", necessity_level: "luxury", accountTypes: ["credit_card", "cash"], is_builtin: true },
  { key: "builtin-comedy", name: "單口喜劇", type: "expense", categoryNames: ["娛樂"], budgetNames: ["單口喜劇", "娛樂"], merchant: "單口喜劇", cashflow_nature: "one_time", necessity_level: "luxury", accountTypes: ["credit_card", "cash"], is_builtin: true },
  { key: "builtin-subscription", name: "訂閱", type: "expense", categoryNames: ["訂閱"], budgetNames: ["訂閱"], merchant: "訂閱", cashflow_nature: "fixed", necessity_level: "quality", accountTypes: ["credit_card", "bank"], is_builtin: true }
];

function activeQuickTemplates() {
  return (state.data.quickTemplates || [])
    .filter(t => t.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name || "").localeCompare(String(b.name || "")))
    .map(t => ({ ...t, key: `custom-${t.id}`, is_builtin: false }));
}

function renderQuickTxTemplates(type = state.draftTxType || "expense") {
  const allTemplates = activeQuickTemplates();
  const templates = allTemplates.filter(t => (t.type || "expense") === type);
  return `
    <div class="quick-template-panel">
      <div class="quick-template-title">
        <strong>${escapeHtml(labelOf(type))}快速模板</strong>
        <span>${templates.length ? `${templates.length} 個自訂模板` : "此類型尚無模板"}</span>
      </div>
      ${templates.length ? `
        <div class="quick-template-grid">
          ${templates.map(t => `<button type="button" class="quick-template-btn" data-tx-template="${escapeHtml(t.key)}">${escapeHtml(t.name || "模板")}</button>`).join("")}
        </div>
      ` : `
        <div class="empty compact-empty">此交易類型還沒有模板。到「模板管理」新增，或匯入預設模板後自行編輯。</div>
        <div class="btn-row">
          <button type="button" class="btn small secondary" data-go="templates">去模板管理</button>
        </div>
      `}
    </div>
  `;
}

function findCategoryByNames(names = []) {
  const normalized = names.map(n => String(n).toLowerCase());
  return state.data.categories.find(c => normalized.includes(String(c.name || "").toLowerCase()))
    || state.data.categories.find(c => c.type === "expense" && normalized.some(n => String(c.name || "").toLowerCase().includes(n)))
    || null;
}

function findBudgetItemByNames(names = []) {
  const normalized = names.map(n => String(n).toLowerCase());
  return budgetItemSummariesForSelectedYear().find(i => normalized.includes(String(i.name || "").toLowerCase()))
    || budgetItemSummariesForSelectedYear().find(i => normalized.some(n => String(i.name || "").toLowerCase().includes(n)))
    || null;
}

function findAccountByTypes(types = []) {
  return state.data.accounts.find(a => a.is_active !== false && types.includes(a.type))
    || state.data.accounts.find(a => a.is_active !== false)
    || null;
}

function setSelectValue(field, value) {
  if (!field || value === undefined || value === null) return;
  const valueString = String(value);

  // v28：同時支援 select、hidden input、一般 input。
  // v27 把交易類型改成 hidden input 後，舊版只處理 select.options，導致快速模板點擊時噴錯。
  if (field.tagName === "SELECT") {
    if (![...field.options].some(o => o.value === valueString)) return;
    field.value = valueString;
    return;
  }

  field.value = valueString;
}

function applyQuickTxTemplate(key) {
  const template = activeQuickTemplates().find(t => t.key === key);
  const form = $("#txForm");
  if (!template || !form) return;

  try {
    const category = template.category_id
      ? state.data.categories.find(c => c.id === template.category_id)
      : findCategoryByNames(template.categoryNames || []);
    const budgetItem = template.budget_item_id
      ? budgetItemSummariesForSelectedYear().find(i => i.budget_item_id === template.budget_item_id || i.id === template.budget_item_id)
      : findBudgetItemByNames(template.budgetNames || []);
    const account = template.account_id
      ? state.data.accounts.find(a => a.id === template.account_id)
      : findAccountByTypes(template.accountTypes || []);
    const toAccount = template.to_account_id
      ? state.data.accounts.find(a => a.id === template.to_account_id)
      : null;

    const type = template.type || "expense";
    setSelectValue(form.elements.type, type);
    state.draftTxType = type;
    setSelectValue(form.elements.account_id, form.elements.account_id.value || account?.id || "");
    setSelectValue(form.elements.to_account_id, toAccount?.id || "");
    setSelectValue(form.elements.category_id, category?.id || "");
    setSelectValue(form.elements.budget_item_id, budgetItem?.budget_item_id || budgetItem?.id || "");
    setSelectValue(form.elements.necessity_level, template.necessity_level || template.necessity || defaultNecessityByType(type));
    setSelectValue(form.elements.cashflow_nature, template.cashflow_nature || template.cashflow || defaultCashflowByType(type));
    setSelectValue(form.elements.status, "cleared");

    if (form.elements.merchant && !form.elements.merchant.value) form.elements.merchant.value = template.merchant || template.name || template.label || "";
    if (form.elements.payment_method && !form.elements.payment_method.value) form.elements.payment_method.value = template.payment_method || (account?.type === "credit_card" ? "信用卡" : labelOf(account?.type || ""));
    if (form.elements.note && !form.elements.note.value && template.note) form.elements.note.value = template.note;

    form.elements.amount?.focus();
    form.elements.amount?.select?.();
    showAlert(`已套用模板：${escapeHtml(template.name || template.label || "模板")}。`, "good");
  } catch (error) {
    showAlert(`套用模板失敗：${escapeHtml(error.message)}`, "bad");
  }
}



function txModeButton(type, current) {
  const labels = {
    expense: ["支出", "消費 / 預算"],
    income: ["收入", "薪資 / 股息"],
    transfer: ["轉帳", "繳卡 / 投資"],
    refund: ["退款", "退貨 / 退票"]
  };
  const [title, sub] = labels[type] || [labelOf(type), ""];
  return `
    <button type="button" class="tx-mode-btn ${current === type ? "active" : ""}" data-tx-mode="${escapeHtml(type)}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(sub)}</span>
    </button>
  `;
}

function renderTxModePicker(current) {
  return `
    <div class="tx-mode-panel">
      ${["expense", "income", "transfer", "refund"].map(t => txModeButton(t, current)).join("")}
    </div>
  `;
}

function renderTxPrimaryFields(type, edit = {}) {
  const accountLabel = type === "income" ? "入帳帳戶" : type === "transfer" ? "轉出帳戶" : type === "refund" ? "退款入帳帳戶" : "付款帳戶";
  const merchantLabel = type === "income" ? "收入來源" : type === "transfer" ? "用途" : type === "refund" ? "退款來源" : "商家 / 對象";
  const merchantPlaceholder = type === "income" ? "例：打工薪資、股息、退稅" : type === "transfer" ? "例：信用卡繳款、投資轉帳" : type === "refund" ? "例：退票退款、退貨退款" : "例：早餐、威秀、Blue Note";
  const categoryLabel = type === "income" ? "收入分類" : "分類";

  const fields = [
    field("日期", `<input class="input" type="date" name="transaction_date" value="${escapeHtml(edit?.transaction_date || today())}" required>`),
    field("金額", `<input class="input tx-amount-input" type="number" min="0" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required placeholder="輸入金額">`),
    field(accountLabel, `<select class="input" name="account_id" required>${accountOptions(edit?.account_id || "")}</select>`)
  ];

  if (type === "transfer") {
    fields.push(field("轉入帳戶", `<select class="input" name="to_account_id" required>${accountOptions(edit?.to_account_id || "")}</select>`));
    fields.push(field("用途", `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}" placeholder="${merchantPlaceholder}">`));
  } else {
    fields.push(field(categoryLabel, `<select class="input" name="category_id">${categoryOptions(type, edit?.category_id || "")}</select>`));
    if (type === "expense" || type === "refund") {
      fields.push(field("預算項目", `<select class="input" name="budget_item_id">${budgetItemOptions(edit?.budget_item_id || "")}</select>`));
    }
    if (type === "refund") {
      fields.push(field("關聯原支出", `<select class="input" name="related_transaction_id">${expenseTransactionOptions(edit?.related_transaction_id || "")}</select>`));
    }
    fields.push(field(merchantLabel, `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}" placeholder="${merchantPlaceholder}">`));
  }

  return fields.join("");
}

function renderTxAdvancedFields(type, edit = {}) {
  return `
    <details class="advanced-fields wide">
      <summary>進階欄位</summary>
      <div class="form-grid">
        ${type !== "transfer" ? field("轉入帳戶", `<select class="input" name="to_account_id">${accountOptions(edit?.to_account_id || "")}</select>`) : ""}
        ${type !== "refund" ? field("關聯原支出", `<select class="input" name="related_transaction_id">${expenseTransactionOptions(edit?.related_transaction_id || "")}</select>`) : ""}
        ${field("付款方式", `<input class="input" name="payment_method" value="${escapeHtml(edit?.payment_method || "")}" placeholder="現金 / 信用卡 / 轉帳 / Apple Pay">`)}
        ${field("必要程度", `<select class="input" name="necessity_level">
          ${selectOpts(["survival","quality","luxury","investment","other"], edit?.necessity_level || defaultNecessityByType(type))}
        </select>`)}
        ${field("現金流性質", `<select class="input" name="cashflow_nature">
          ${selectOpts(["fixed","variable","one_time"], edit?.cashflow_nature || defaultCashflowByType(type))}
        </select>`)}
        ${field("狀態", `<select class="input" name="status">
          ${selectOpts(["cleared","pending","cancelled"], edit?.status || "cleared")}
        </select>`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="補充說明">${escapeHtml(edit?.note || "")}</textarea>
        </div>
      </div>
    </details>
  `;
}

function defaultNecessityByType(type) {
  if (type === "income" || type === "transfer") return "other";
  if (type === "refund") return "other";
  return "quality";
}

function defaultCashflowByType(type) {
  if (type === "income") return "fixed";
  if (type === "transfer") return "fixed";
  if (type === "refund") return "one_time";
  return "variable";
}

function renderTransactions() {
  const edit = state.editing.transaction;
  const type = edit?.type || state.draftTxType || "expense";
  const rows = applyTxFilters(transactionsForSelectedYear());

  return `
    <div class="card">
      <h3>${edit ? `編輯${labelOf(type)}` : "記一筆"}</h3>
      ${edit ? "" : renderTxModePicker(type)}
      ${edit ? "" : renderQuickTxTemplates(type)}
      <form id="txForm" class="form-grid tx-type-form" data-current-type="${escapeHtml(type)}">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        <input type="hidden" name="type" value="${escapeHtml(type)}">
        ${renderTxPrimaryFields(type, edit || {})}
        ${renderTxAdvancedFields(type, edit || {})}

        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : `新增${labelOf(type)}`}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="transaction">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3>最近交易</h3>
        <span class="badge">${rows.length} 筆</span>
      </div>
      ${renderTxFilters()}
      ${renderTxTable(rows)}
    </div>
  `;
}

function applyTxFilters(rows) {
  return rows.filter(t => {
    const q = state.filters.txSearch.trim().toLowerCase();
    const text = [t.merchant, t.note, t.category_name, t.account_name, t.tags].join(" ").toLowerCase();
    if (q && !text.includes(q)) return false;
    if (state.filters.txType && t.type !== state.filters.txType) return false;
    if (state.filters.txCategory && t.category_id !== state.filters.txCategory) return false;
    if (state.filters.txAccount && t.account_id !== state.filters.txAccount && t.to_account_id !== state.filters.txAccount) return false;
    if (state.filters.txStart && t.transaction_date < state.filters.txStart) return false;
    if (state.filters.txEnd && t.transaction_date > state.filters.txEnd) return false;
    return true;
  });
}

function renderTxFilters() {
  return `
    <div class="filters" style="margin-bottom:14px">
      <input class="input" id="filterTxSearch" value="${escapeHtml(state.filters.txSearch)}" placeholder="搜尋商家 / 備註 / 分類">
      <select class="input" id="filterTxType">
        <option value="">全部類型</option>
        <option value="income" ${state.filters.txType === "income" ? "selected" : ""}>收入</option>
        <option value="expense" ${state.filters.txType === "expense" ? "selected" : ""}>支出</option>
        <option value="refund" ${state.filters.txType === "refund" ? "selected" : ""}>退款</option>
        <option value="transfer" ${state.filters.txType === "transfer" ? "selected" : ""}>轉帳</option>
      </select>
      <select class="input" id="filterTxCategory">${categoryOptions("", state.filters.txCategory)}</select>
      <select class="input" id="filterTxAccount">${accountOptions(state.filters.txAccount)}</select>
      <input class="input" type="date" id="filterTxStart" value="${escapeHtml(state.filters.txStart)}">
      <input class="input" type="date" id="filterTxEnd" value="${escapeHtml(state.filters.txEnd)}">
    </div>
  `;
}

function renderTxTable(rows) {
  if (!rows.length) return `<div class="empty">沒有符合條件的交易</div>`;

  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.map(t => `
        <div class="mobile-data-card">
          <div class="mobile-data-head">
            <div>
              <strong>${escapeHtml(t.merchant || t.category_name || "未命名交易")}</strong>
              <span>${escapeHtml(t.transaction_date)} · ${escapeHtml(t.account_name || "")}</span>
            </div>
            <div class="mobile-amount ${(t.type === "income" || t.type === "refund") ? "good" : t.type === "expense" ? "bad" : ""}">
              ${fmtMoney(t.amount)}
            </div>
          </div>
          <div class="mobile-data-meta">
            ${typeBadge(t.type)}
            <span class="badge">${escapeHtml(t.category_name || "未分類")}</span>
            ${t.budget_item_name ? `<span class="badge">${escapeHtml(t.budget_item_name)}</span>` : ""}
            <span class="badge">${escapeHtml(labelOf(t.status))}</span>
          </div>
          ${t.note ? `<p class="mobile-note">${escapeHtml(t.note)}</p>` : ""}
          <div class="mobile-card-actions">
            <button class="btn small secondary" type="button" data-edit-tx="${t.id}">編輯</button>
            <button type="button" class="btn small danger" data-delete="transactions:${t.id}">刪除</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead>
          <tr>
            <th>日期</th><th>類型</th><th>帳戶</th><th>分類</th><th>預算項目</th><th>金額</th><th>商家</th><th>備註</th><th>狀態</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(t => `
            <tr>
              <td>${escapeHtml(t.transaction_date)}</td>
              <td>${typeBadge(t.type)}</td>
              <td>${escapeHtml(t.account_name || "")}${t.to_account_name ? ` → ${escapeHtml(t.to_account_name)}` : ""}</td>
              <td>${escapeHtml(t.category_name || "未分類")}</td>
              <td>${escapeHtml(t.budget_item_name || "")}</td>
              <td class="mono ${(t.type === "income" || t.type === "refund") ? "good" : t.type === "expense" ? "bad" : ""}">${fmtMoney(t.amount)}</td>
              <td>${escapeHtml(t.merchant || "")}</td>
              <td>${escapeHtml(t.note || "")}</td>
              <td>${escapeHtml(labelOf(t.status))}</td>
              <td class="actions">
                <button class="btn small secondary" data-edit-tx="${t.id}">編輯</button>
                <button type="button" class="btn small danger" data-delete="transactions:${t.id}">刪除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  return `${mobileCards}${tableView}`;
}


function renderBudget() {
  const editYear = state.editing.year;
  const editItem = state.editing.budgetItem;
  const current = getCurrentYearSummary();
  const items = budgetItemSummariesForSelectedYear();
  const showEditor = Boolean(editYear || editItem || !items.length);

  return `
    <div class="grid cols-3">
      ${metricCard("年度預算", fmtMoney(current.annual_budget), `結轉 ${fmtMoney(current.carryover_from_previous)}`)}
      ${metricCard("已用預算", fmtMoney(current.actual_expense), `${fmtNumber(current.budget_used_pct, 1)}%`, "bad")}
      ${metricCard("剩餘預算", fmtMoney(current.remaining_budget), Number(current.remaining_budget || 0) >= 0 ? "預算內" : "超支", Number(current.remaining_budget || 0) >= 0 ? "good" : "bad")}
    </div>

    <div class="card budget-focus-card">
      <div class="card-title-row">
        <h3>預算項目</h3>
        <span class="badge">${items.length} 項</span>
      </div>
      <p class="metric-sub">先看每個項目的「預算 / 實際 / 剩餘 / 使用率」。需要新增或調整時，再展開下方管理區。</p>
      ${renderBudgetItemTable(items)}
    </div>

    <details class="card budget-editor" ${showEditor ? "open" : ""}>
      <summary>${editYear || editItem ? "正在編輯預算" : "新增 / 編輯年度與預算項目"}</summary>

      <div class="grid cols-2" style="margin-top:14px">
        <div>
          <h3>${editYear ? "編輯年度" : "年度設定"}</h3>
          <form id="yearForm" class="form-grid two">
            <input type="hidden" name="id" value="${escapeHtml(editYear?.id || "")}">
            ${field("年度", `<input class="input" type="number" name="budget_year" min="2000" max="2100" value="${escapeHtml(editYear?.budget_year || state.selectedBudgetYear)}" required>`)}
            ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editYear?.name || "")}" placeholder="例：2026 年度預算">`)}
            ${field("年度預算", `<input class="input" type="number" step="1" name="annual_budget" value="${escapeHtml(editYear?.annual_budget ?? current.annual_budget ?? 0)}">`)}
            ${field("前期結轉", `<input class="input" type="number" step="1" name="carryover_from_previous" value="${escapeHtml(editYear?.carryover_from_previous ?? current.carryover_from_previous ?? 0)}">`)}
            <div class="field wide">
              <label>備註</label>
              <textarea class="input" name="note">${escapeHtml(editYear?.note || "")}</textarea>
            </div>
            <div class="wide btn-row">
              <button class="btn" type="submit">儲存年度</button>
              <button class="btn secondary" type="button" data-edit-year="${state.selectedYearId}">載入目前年度編輯</button>
              <button class="btn secondary" type="button" id="closeYearBtn">結轉到下一年</button>
              ${editYear ? `<button class="btn secondary" type="button" data-cancel-edit="year">取消編輯</button>` : ""}
            </div>
          </form>
        </div>

        <div>
          <h3>${editItem ? "編輯預算項目" : "新增預算項目"}</h3>
          <form id="budgetItemForm" class="form-grid two">
            <input type="hidden" name="id" value="${escapeHtml(editItem?.id || "")}">
            ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editItem?.name || "")}" required placeholder="例：日常餐飲">`)}
            ${field("類型", `<select class="input" name="item_type">${selectOpts(["expense","income","saving","other"], editItem?.item_type || "expense")}</select>`)}
            ${field("金額", `<input class="input" type="number" step="1" name="planned_amount" value="${escapeHtml(editItem?.planned_amount || "")}" required>`)}
            ${field("分類", `<select class="input" name="category_id">${categoryOptions(editItem?.item_type || "expense", editItem?.category_id || "")}</select>`)}
            <details class="advanced-fields wide">
              <summary>進階欄位</summary>
              <div class="form-grid two">
                ${field("期間", `<select class="input" name="period_type">${selectOpts(["annual","monthly","weekly","custom"], editItem?.period_type || "annual")}</select>`)}
                ${field("結轉模式", `<select class="input" name="rollover_mode">${selectOpts(["none","carryover","overspend_to_next"], editItem?.rollover_mode || "none")}</select>`)}
                ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(editItem?.sort_order || 0)}">`)}
                ${field("啟用", `<select class="input" name="is_active">
                  <option value="true" ${editItem?.is_active !== false ? "selected" : ""}>啟用</option>
                  <option value="false" ${editItem?.is_active === false ? "selected" : ""}>停用</option>
                </select>`)}
                <div class="field wide">
                  <label>備註</label>
                  <textarea class="input" name="note">${escapeHtml(editItem?.note || "")}</textarea>
                </div>
              </div>
            </details>
            <div class="wide btn-row">
              <button class="btn" type="submit">${editItem ? "儲存修改" : "新增項目"}</button>
              ${editItem ? `<button class="btn secondary" type="button" data-cancel-edit="budgetItem">取消編輯</button>` : ""}
            </div>
          </form>
        </div>
      </div>
    </details>
  `;
}

function renderBudgetItemTable(rows) {
  if (!rows.length) return `<div class="empty">尚無預算項目</div>`;

  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.map(i => {
        const pct = Number(i.used_pct || 0);
        return `
          <div class="mobile-data-card">
            <div class="mobile-data-head">
              <div>
                <strong>${escapeHtml(i.name)}</strong>
                <span>${escapeHtml(labelOf(i.item_type))} · ${escapeHtml(i.category_name || "未分類")}</span>
              </div>
              <div class="mobile-amount">${fmtMoney(i.planned_amount)}</div>
            </div>
            <div class="${pct > 100 ? "progress danger" : "progress"}"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div>
            <div class="mobile-data-meta">
              <span>實際 ${fmtMoney(i.actual_amount)}</span>
              <span>${Number(i.remaining_amount || 0) >= 0 ? `剩餘 ${fmtMoney(i.remaining_amount)}` : `超支 ${fmtMoney(Math.abs(Number(i.remaining_amount || 0)))}`}</span>
              <span>${fmtNumber(pct, 1)}%</span>
            </div>
            <div class="mobile-card-actions">
              <button class="btn small secondary" type="button" data-edit-budget="${i.budget_item_id}">編輯</button>
              <button type="button" class="btn small danger" data-delete="budget_items:${i.budget_item_id}">刪除</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead><tr><th>名稱</th><th>類型</th><th>分類</th><th>預算</th><th>實際</th><th>剩餘</th><th>使用率</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.map(i => {
            const pct = Number(i.used_pct || 0);
            return `
              <tr>
                <td>${escapeHtml(i.name)}</td>
                <td><span class="badge">${escapeHtml(labelOf(i.item_type))}</span></td>
                <td>${escapeHtml(i.category_name || "")}</td>
                <td class="mono">${fmtMoney(i.planned_amount)}</td>
                <td class="mono bad">${fmtMoney(i.actual_amount)}</td>
                <td class="mono ${Number(i.remaining_amount || 0) >= 0 ? "good" : "bad"}">${fmtMoney(i.remaining_amount)}</td>
                <td>
                  <div class="${pct > 100 ? "progress danger" : "progress"}"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div>
                  <span class="muted">${fmtNumber(pct, 1)}%</span>
                </td>
                <td class="actions">
                  <button class="btn small secondary" data-edit-budget="${i.budget_item_id}">編輯</button>
                  <button type="button" class="btn small danger" data-delete="budget_items:${i.budget_item_id}">刪除</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  return `${mobileCards}${tableView}`;
}


function renderAccounts() {
  const edit = state.editing.account;
  const rows = state.data.accountBalances;
  return `
    <div class="card">
      <h3>${edit ? "編輯帳戶" : "新增帳戶"}</h3>
      <form id="accountForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required>`)}
        ${field("類型", `<select class="input" name="type">
          ${selectOpts(["cash","bank","e_wallet","credit_card","loan","asset","other"], edit?.type || "bank")}
        </select>`)}
        ${field("初始餘額", `<input class="input" type="number" step="1" name="initial_balance" value="${escapeHtml(edit?.initial_balance || 0)}">`)}
        ${field("開帳日", `<input class="input" type="date" name="opening_date" value="${escapeHtml(edit?.opening_date || "")}">`)}
        ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(edit?.sort_order || 0)}">`)}
        ${field("啟用", `<select class="input" name="is_active">
          <option value="true" ${edit?.is_active !== false ? "selected" : ""}>啟用</option>
          <option value="false" ${edit?.is_active === false ? "selected" : ""}>停用</option>
        </select>`)}
        <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(edit?.note || "")}</textarea></div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : "新增帳戶"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="account">取消編輯</button>` : ""}
        </div>
      </form>
    </div>
    <div class="card">
      <h3>帳戶列表</h3>
      ${renderAccountTable(rows)}
    </div>
  `;
}

function renderAccountTable(rows) {
  if (!rows.length) return `<div class="empty">尚無帳戶</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>名稱</th><th>類型</th><th>初始餘額</th><th>目前餘額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.map(a => `
            <tr>
              <td>${escapeHtml(a.name)}</td>
              <td><span class="badge">${escapeHtml(labelOf(a.type))}</span></td>
              <td class="mono">${fmtMoney(a.initial_balance)}</td>
              <td class="mono ${Number(a.current_balance || 0) >= 0 ? "good" : "bad"}">${fmtMoney(a.current_balance)}</td>
              <td>${a.is_active ? "啟用" : "停用"}</td>
              <td class="actions">
                <button class="btn small secondary" data-edit-account="${a.id}">編輯</button>
                <button type="button" class="btn small danger" data-delete="accounts:${a.id}">刪除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCategories() {
  const editCat = state.editing.category;
  const editTag = state.editing.tag;
  return `
    <div class="grid cols-2">
      <div class="card">
        <h3>${editCat ? "編輯分類" : "新增分類"}</h3>
        <form id="categoryForm" class="form-grid two">
          <input type="hidden" name="id" value="${escapeHtml(editCat?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editCat?.name || "")}" required>`)}
          ${field("類型", `<select class="input" name="type">${selectOpts(["income","expense","transfer"], editCat?.type || "expense")}</select>`)}
          ${field("顏色", `<select class="input" name="color">${colorOptions(editCat?.color || "#64748b")}</select>`)}
          ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(editCat?.sort_order || 0)}">`)}
          <div class="wide btn-row">
            <button class="btn" type="submit">${editCat ? "儲存分類" : "新增分類"}</button>
            ${editCat ? `<button class="btn secondary" type="button" data-cancel-edit="category">取消編輯</button>` : ""}
          </div>
        </form>
      </div>

      <div class="card">
        <h3>${editTag ? "編輯標籤" : "新增標籤"}</h3>
        <form id="tagForm" class="form-grid two">
          <input type="hidden" name="id" value="${escapeHtml(editTag?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editTag?.name || "")}" required>`)}
          ${field("顏色", `<select class="input" name="color">${colorOptions(editTag?.color || "#64748b")}</select>`)}
          <div class="field wide"><label>備註</label><input class="input" name="note" value="${escapeHtml(editTag?.note || "")}"></div>
          <div class="wide btn-row">
            <button class="btn" type="submit">${editTag ? "儲存標籤" : "新增標籤"}</button>
            ${editTag ? `<button class="btn secondary" type="button" data-cancel-edit="tag">取消編輯</button>` : ""}
          </div>
        </form>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>分類列表</h3>
        ${renderCategoryTable()}
      </div>
      <div class="card">
        <h3>標籤列表</h3>
        ${renderTagTable()}
      </div>
    </div>
  `;
}

function renderCategoryTable() {
  const rows = state.data.categories;
  if (!rows.length) return `<div class="empty">尚無分類</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>名稱</th><th>類型</th><th>顏色</th><th>排序</th><th>操作</th></tr></thead>
        <tbody>${rows.map(c => `
          <tr>
            <td>${escapeHtml(c.name)}</td>
            <td><span class="badge ${escapeHtml(c.type)}">${escapeHtml(labelOf(c.type))}</span></td>
            <td>${colorDot(c.color)}</td>
            <td>${escapeHtml(c.sort_order || 0)}</td>
            <td class="actions">
              <button class="btn small secondary" data-edit-category="${c.id}">編輯</button>
              <button type="button" class="btn small danger" data-delete="categories:${c.id}">刪除</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderTagTable() {
  const rows = state.data.tags;
  if (!rows.length) return `<div class="empty">尚無標籤</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>名稱</th><th>顏色</th><th>備註</th><th>操作</th></tr></thead>
        <tbody>${rows.map(t => `
          <tr>
            <td><span class="badge">${escapeHtml(t.name)}</span></td>
            <td>${colorDot(t.color)}</td>
            <td>${escapeHtml(t.note || "")}</td>
            <td class="actions">
              <button class="btn small secondary" data-edit-tag="${t.id}">編輯</button>
              <button type="button" class="btn small danger" data-delete="tags:${t.id}">刪除</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderRecurring() {
  const edit = state.editing.recurring;
  return `
    <div class="card">
      <h3>${edit ? "編輯訂閱" : "新增訂閱"}</h3>
      <p class="metric-sub">這裡只管理固定扣款支出，例如串流、雲端、健身房、手機費。它不會自動新增流水帳。</p>
      <p class="metric-sub">目前前端版本：v12。如果你看不到 v12，代表 GitHub Pages 或瀏覽器還在用舊版。</p>
      <form id="recurringForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("服務名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required placeholder="例：Netflix、Spotify、iCloud、ChatGPT">`)}
        ${field("金額", `<input class="input" type="number" step="1" min="0" name="amount" value="${escapeHtml(edit?.amount || "")}" required>`)}
        ${field("付款帳戶", `<select class="input" name="account_id" required>${accountOptions(edit?.account_id || "")}</select>`)}
        ${field("分類", `<select class="input" name="category_id">${categoryOptions("expense", edit?.category_id || "")}</select>`)}
        ${field("預算項目", `<select class="input" name="budget_item_id">${budgetItemOptions(edit?.budget_item_id || "")}</select>`)}
        ${field("付款週期", `<select class="input" name="frequency">${selectOpts(["monthly","yearly","weekly","quarterly","daily","custom"], edit?.frequency || "monthly")}</select>`)}
        ${field("每幾期扣一次", `<input class="input" type="number" min="1" name="interval_count" value="${escapeHtml(edit?.interval_count || 1)}">`)}
        ${field("開始日", `<input class="input" type="date" name="start_date" value="${escapeHtml(edit?.start_date || today())}" required>`)}
        ${field("下次扣款日", `<input class="input" type="date" name="next_due_date" value="${escapeHtml(edit?.next_due_date || today())}" required>`)}
        ${field("結束日", `<input class="input" type="date" name="end_date" value="${escapeHtml(edit?.end_date || "")}">`)}
        ${field("付款方式", `<input class="input" name="payment_method" value="${escapeHtml(edit?.payment_method || "")}" placeholder="例：信用卡、銀行扣款、電子支付">`)}
        ${field("服務商", `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}" placeholder="例：Netflix、Apple、Google、OpenAI">`)}
        ${field("狀態", `<select class="input" name="is_active">
          <option value="true" ${edit?.is_active !== false ? "selected" : ""}>使用中</option>
          <option value="false" ${edit?.is_active === false ? "selected" : ""}>已取消 / 停用</option>
        </select>`)}
        <div class="field wide"><label>備註 / 取消方式</label><textarea class="input" name="note" placeholder="例：取消入口、方案內容、是否值得續訂">${escapeHtml(edit?.note || "")}</textarea></div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存訂閱" : "新增訂閱"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="recurring">取消編輯</button>` : ""}
        </div>
      </form>
    </div>
    <div class="card">
      <div class="card-title-row">
        <h3>訂閱列表</h3>
        <button class="btn small secondary" id="refreshRecurringBtn" type="button">重新讀取訂閱</button>
      </div>
      ${renderRecurringTable()}
    </div>
  `;
}

function renderRecurringTable() {
  const rows = state.data.recurring;
  if (!rows.length) return `<div class="empty">尚無訂閱</div>`;
  const accountMap = Object.fromEntries(state.data.accounts.map(a => [a.id, a.name]));
  const catMap = Object.fromEntries(state.data.categories.map(c => [c.id, c.name]));
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>服務名稱</th><th>類型</th><th>金額</th><th>付款帳戶</th><th>分類</th><th>付款週期</th><th>下次扣款日</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${typeBadge(r.type)}</td>
            <td class="mono">${fmtMoney(r.amount)}</td>
            <td>${escapeHtml(accountMap[r.account_id] || "")}</td>
            <td>${escapeHtml(catMap[r.category_id] || "")}</td>
            <td>${escapeHtml(labelOf(r.frequency))} / ${escapeHtml(r.interval_count || 1)}</td>
            <td>${escapeHtml(r.next_due_date || "")}</td>
            <td>${r.is_active ? "使用中" : "已取消"}</td>
            <td class="actions">
              <button class="btn small secondary" data-edit-recurring="${r.id}">編輯</button>
              <button type="button" class="btn small danger" data-delete="recurring_transactions:${r.id}">刪除</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderCreditLoans() {
  const editCard = state.editing.creditCard;
  const editLoan = state.editing.loan;
  return `
    <div class="grid cols-2">
      <div class="card">
        <h3>${editCard ? "編輯信用卡" : "新增信用卡"}</h3>
        <form id="creditCardForm" class="form-grid two">
          <input type="hidden" name="id" value="${escapeHtml(editCard?.id || "")}">
          ${field("對應帳戶", `<select class="input" name="account_id" required>${creditCardAccountOptions(editCard?.account_id || "")}</select>`)}
          ${field("卡名", `<input class="input" name="card_name" value="${escapeHtml(editCard?.card_name || "")}" required>`)}
          ${field("發卡行", `<input class="input" name="issuer" value="${escapeHtml(editCard?.issuer || "")}">`)}
          ${field("信用額度", `<input class="input" type="number" step="1" name="credit_limit" value="${escapeHtml(editCard?.credit_limit || 0)}">`)}
          ${field("結帳日", `<input class="input" type="number" min="1" max="31" name="statement_day" value="${escapeHtml(editCard?.statement_day || "")}">`)}
          ${field("繳款日", `<input class="input" type="number" min="1" max="31" name="payment_due_day" value="${escapeHtml(editCard?.payment_due_day || "")}">`)}
          <div class="wide btn-row">
            <button class="btn" type="submit">${editCard ? "儲存信用卡" : "新增信用卡"}</button>
            ${editCard ? `<button class="btn secondary" type="button" data-cancel-edit="creditCard">取消編輯</button>` : ""}
          </div>
        </form>
      </div>

      <div class="card">
        <h3>${editLoan ? "編輯貸款 / 債務" : "新增貸款 / 債務"}</h3>
        <form id="loanForm" class="form-grid two">
          <input type="hidden" name="id" value="${escapeHtml(editLoan?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editLoan?.name || "")}" required>`)}
          ${field("類型", `<select class="input" name="loan_type">${selectOpts(["student_loan","personal_loan","mortgage","car_loan","credit_card_debt","installment","other"], editLoan?.loan_type || "other")}</select>`)}
          ${field("本金", `<input class="input" type="number" step="1" name="principal_amount" value="${escapeHtml(editLoan?.principal_amount || 0)}">`)}
          ${field("剩餘本金", `<input class="input" type="number" step="1" name="remaining_principal" value="${escapeHtml(editLoan?.remaining_principal || 0)}">`)}
          ${field("年利率 %", `<input class="input" type="number" step="0.0001" name="annual_interest_rate" value="${escapeHtml(editLoan?.annual_interest_rate || 0)}">`)}
          ${field("每月還款", `<input class="input" type="number" step="1" name="monthly_payment" value="${escapeHtml(editLoan?.monthly_payment || 0)}">`)}
          ${field("狀態", `<select class="input" name="status">${selectOpts(["active","paid_off","paused","cancelled"], editLoan?.status || "active")}</select>`)}
          ${field("債權人", `<input class="input" name="creditor" value="${escapeHtml(editLoan?.creditor || "")}">`)}
          <div class="wide btn-row">
            <button class="btn" type="submit">${editLoan ? "儲存貸款" : "新增貸款"}</button>
            ${editLoan ? `<button class="btn secondary" type="button" data-cancel-edit="loan">取消編輯</button>` : ""}
          </div>
        </form>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card"><h3>信用卡</h3>${renderCreditCardTable()}</div>
      <div class="card"><h3>貸款 / 債務</h3>${renderLoanTable()}</div>
    </div>
  `;
}

function renderCreditCardTable() {
  const rows = state.data.creditCards;
  if (!rows.length) return `<div class="empty">尚無信用卡</div>`;
  const accountMap = Object.fromEntries(state.data.accounts.map(a => [a.id, a.name]));
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>卡名</th><th>帳戶</th><th>額度</th><th>結帳 / 繳款</th><th>回饋</th><th>操作</th></tr></thead>
      <tbody>${rows.map(c => `
        <tr>
          <td>${escapeHtml(c.card_name)}</td>
          <td>${escapeHtml(accountMap[c.account_id] || "")}</td>
          <td class="mono">${fmtMoney(c.credit_limit)}</td>
          <td>${escapeHtml(c.statement_day || "-")} / ${escapeHtml(c.payment_due_day || "-")}</td>
          <td class="actions">
            <button class="btn small secondary" data-edit-card="${c.id}">編輯</button>
            <button type="button" class="btn small danger" data-delete="credit_cards:${c.id}">刪除</button>
          </td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;
}

function renderLoanTable() {
  const rows = state.data.loans;
  if (!rows.length) return `<div class="empty">尚無貸款</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>名稱</th><th>類型</th><th>剩餘本金</th><th>年利率</th><th>每月還款</th><th>狀態</th><th>操作</th></tr></thead>
      <tbody>${rows.map(l => `
        <tr>
          <td>${escapeHtml(l.name)}</td>
          <td><span class="badge">${escapeHtml(labelOf(l.loan_type))}</span></td>
          <td class="mono bad">${fmtMoney(l.remaining_principal)}</td>
          <td>${fmtNumber(l.annual_interest_rate, 2)}%</td>
          <td class="mono">${fmtMoney(l.monthly_payment)}</td>
          <td>${escapeHtml(labelOf(l.status))}</td>
          <td class="actions">
            <button class="btn small secondary" data-edit-loan="${l.id}">編輯</button>
            <button type="button" class="btn small danger" data-delete="loans:${l.id}">刪除</button>
          </td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;
}

function renderGoals() {
  const edit = state.editing.goal;
  return `
    <div class="card">
      <h3>${edit ? "編輯目標" : "新增目標"}</h3>
      <form id="goalForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required>`)}
        ${field("類型", `<select class="input" name="goal_type">${selectOpts(["saving","debt_reduction","travel","emergency_fund","purchase","other"], edit?.goal_type || "saving")}</select>`)}
        ${field("目標金額", `<input class="input" type="number" step="1" name="target_amount" value="${escapeHtml(edit?.target_amount || 0)}">`)}
        ${field("目前金額", `<input class="input" type="number" step="1" name="current_amount" value="${escapeHtml(edit?.current_amount || 0)}">`)}
        ${field("開始日", `<input class="input" type="date" name="start_date" value="${escapeHtml(edit?.start_date || "")}">`)}
        ${field("目標日", `<input class="input" type="date" name="target_date" value="${escapeHtml(edit?.target_date || "")}">`)}
        ${field("優先級 1-5", `<input class="input" type="number" min="1" max="5" name="priority" value="${escapeHtml(edit?.priority || 3)}">`)}
        ${field("狀態", `<select class="input" name="status">${selectOpts(["active","paused","completed","cancelled"], edit?.status || "active")}</select>`)}
        <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(edit?.note || "")}</textarea></div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存目標" : "新增目標"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="goal">取消編輯</button>` : ""}
        </div>
      </form>
    </div>
    <div class="card">
      <h3>目標列表</h3>
      ${renderGoalCards()}
    </div>
  `;
}

function renderGoalCards() {
  const rows = state.data.goals;
  if (!rows.length) return `<div class="empty">尚無目標</div>`;
  return `
    <div class="grid cols-3">
      ${rows.map(g => {
        const pct = Number(g.target_amount || 0) ? Math.min(100, Number(g.current_amount || 0) / Number(g.target_amount || 0) * 100) : 0;
        return `
          <div class="card">
            <div class="card-title-row">
              <h3>${escapeHtml(g.name)}</h3>
              <span class="badge">${escapeHtml(labelOf(g.status))}</span>
            </div>
            <div class="metric-value">${fmtNumber(pct, 1)}%</div>
            <div class="progress"><span style="width:${pct}%"></span></div>
            <p class="metric-sub">${fmtMoney(g.current_amount)} / ${fmtMoney(g.target_amount)} · ${escapeHtml(labelOf(g.goal_type))}</p>
            <div class="btn-row">
              <button class="btn small secondary" data-edit-goal="${g.id}">編輯</button>
              <button type="button" class="btn small danger" data-delete="goals:${g.id}">刪除</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReports() {
  return `
    ${renderChartToolbar()}
    ${renderAnalyticsSummaryCards()}

    <div class="card chart-card">
      <div class="card-title-row">
        <h3>消費健康度儀表板</h3>
        <span class="badge">necessity_level</span>
      </div>
      <div class="grid cols-2">
        <div>
          <div class="chart-canvas-wrap"><canvas id="reportsHealthDoughnut"></canvas></div>
          <p class="chart-note">依「生存必要 / 生活品質 / 奢侈娛樂 / 自我投資」拆解淨支出。</p>
        </div>
        <div>
          <div class="chart-canvas-wrap"><canvas id="reportsHealthTrend"></canvas></div>
          <p class="chart-note">看 luxury 是否逐月膨脹；若交易都維持預設「其他」，這張圖會失真。</p>
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row"><h3>儲蓄率</h3><span class="badge">每月</span></div>
        <div class="chart-canvas-wrap"><canvas id="reportsSavingsRateChart"></canvas></div>
        <p class="chart-note">公式：(收入 − 淨支出) / 收入。轉帳不計入收入或支出。</p>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>帳面淨資產</h3><span class="badge">帳戶餘額</span></div>
        <div class="chart-canvas-wrap"><canvas id="reportsNetWorthChart"></canvas></div>
        <p class="chart-note">依帳戶期初餘額 + 累積收支估算；不等於股票即時市值。</p>
      </div>
    </div>

    <div class="card chart-card">
      <div class="card-title-row">
        <h3>帕累托分析：哪幾類吃掉大部分支出</h3>
        <span class="badge">80/20</span>
      </div>
      <div class="chart-canvas-wrap tall"><canvas id="reportsParetoChart"></canvas></div>
      ${renderParetoSummary()}
    </div>

    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row"><h3>年度預算使用圖</h3><span class="badge">圓環圖</span></div>
        <div class="chart-canvas-wrap"><canvas id="reportsBudgetChart"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>分類淨支出排行</h3><span class="badge">長條圖</span></div>
        <div class="chart-canvas-wrap"><canvas id="reportsCategoryChart"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>${state.filters.chartScope === "month" ? "本月日度收支趨勢" : "月度收支趨勢"}</h3><span class="badge">折線圖</span></div>
        <div class="chart-canvas-wrap"><canvas id="reportsMonthlyChart"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>預算 vs 實際</h3><span class="badge">橫向長條圖</span></div>
        <div class="chart-canvas-wrap"><canvas id="reportsBudgetCompareChart"></canvas></div>
      </div>
    </div>

    <div class="card chart-card">
      <div class="card-title-row"><h3>分類預算進度</h3><span class="badge">進度條</span></div>
      ${renderBudgetProgressList(12)}
    </div>

    <div class="card wrapped-card">
      <div class="card-title-row">
        <h3>年度財務 Wrapped</h3>
        <span class="badge">${state.selectedBudgetYear}</span>
      </div>
      ${renderFinancialWrapped()}
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3>T 字帳</h3>
        <span class="badge">依科目分組</span>
      </div>
      <p class="metric-sub">同一筆交易會同時進入借方科目與貸方科目。支出：借記費用、貸記資產；收入：借記資產、貸記收入；轉帳：借記轉入資產、貸記轉出資產。</p>
      ${renderTAccountCards()}
    </div>
  `;
}



function expenseRowsForSelectedYear() {
  return transactionsForSelectedYear().filter(t => t.status !== "cancelled" && ["expense", "refund"].includes(t.type));
}

function netExpenseForRows(rows) {
  return rows.reduce((sum, t) => {
    if (t.type === "expense") return sum + Number(t.amount || 0);
    if (t.type === "refund") return sum - Number(t.amount || 0);
    return sum;
  }, 0);
}

function healthLevelName(level) {
  return {
    survival: "生存必要",
    quality: "生活品質",
    luxury: "奢侈娛樂",
    investment: "自我投資",
    other: "其他"
  }[level || "other"] || "其他";
}

function getHealthRows() {
  const order = ["survival", "quality", "luxury", "investment", "other"];
  const map = new Map(order.map(k => [k, { key: k, name: healthLevelName(k), amount: 0 }]));
  expenseRowsForSelectedYear().forEach(t => {
    const key = map.has(t.necessity_level) ? t.necessity_level : "other";
    const row = map.get(key);
    row.amount += t.type === "refund" ? -Number(t.amount || 0) : Number(t.amount || 0);
  });
  return order.map(k => map.get(k)).filter(r => Math.abs(Number(r.amount || 0)) > 0);
}

function getHealthTrendRows() {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1}月`,
    survival: 0,
    quality: 0,
    luxury: 0,
    investment: 0,
    other: 0
  }));
  expenseRowsForSelectedYear().forEach(t => {
    const month = Number(t.tx_month || 0);
    if (!month || month < 1 || month > 12) return;
    const key = ["survival", "quality", "luxury", "investment"].includes(t.necessity_level) ? t.necessity_level : "other";
    rows[month - 1][key] += t.type === "refund" ? -Number(t.amount || 0) : Number(t.amount || 0);
  });
  return rows;
}

function getMonthlyAnalyticsRows() {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1}月`,
    month: i + 1,
    income: 0,
    expense: 0,
    saving: 0,
    savingsRate: null
  }));

  transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .forEach(t => {
      const month = Number(t.tx_month || 0);
      if (!month || month < 1 || month > 12) return;
      const row = rows[month - 1];
      if (t.type === "income") row.income += Number(t.amount || 0);
      if (t.type === "expense") row.expense += Number(t.amount || 0);
      if (t.type === "refund") row.expense -= Number(t.amount || 0);
    });

  rows.forEach(r => {
    r.saving = r.income - r.expense;
    r.savingsRate = r.income > 0 ? Math.round((r.saving / r.income) * 1000) / 10 : null;
  });
  return rows;
}

function getNetWorthRows() {
  const initial = (state.data.accounts || []).reduce((sum, a) => sum + Number(a.initial_balance || 0), 0);
  const allTx = allTransactionsEnriched()
    .filter(t => t.status !== "cancelled")
    .sort((a, b) => String(a.transaction_date || "").localeCompare(String(b.transaction_date || "")));

  let cumulativeBeforeYear = 0;
  allTx.forEach(t => {
    const year = Number(t.tx_year || 0);
    if (year >= Number(state.selectedBudgetYear)) return;
    if (t.type === "income") cumulativeBeforeYear += Number(t.amount || 0);
    if (t.type === "expense") cumulativeBeforeYear -= Number(t.amount || 0);
    if (t.type === "refund") cumulativeBeforeYear += Number(t.amount || 0);
  });

  let cumulative = cumulativeBeforeYear;
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    allTx
      .filter(t => Number(t.tx_year) === Number(state.selectedBudgetYear) && Number(t.tx_month) === month)
      .forEach(t => {
        if (t.type === "income") cumulative += Number(t.amount || 0);
        if (t.type === "expense") cumulative -= Number(t.amount || 0);
        if (t.type === "refund") cumulative += Number(t.amount || 0);
      });
    return { label: `${month}月`, netWorth: initial + cumulative };
  });
}

function getParetoRows(limit = 12) {
  const totalRows = getCategoryNetExpenseRows(999);
  const total = totalRows.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 1;
  let cumulative = 0;
  return totalRows.slice(0, limit).map((r, index) => {
    cumulative += Number(r.amount || 0);
    return {
      rank: index + 1,
      name: r.name,
      amount: Number(r.amount || 0),
      cumulativePct: Math.round(cumulative / total * 1000) / 10
    };
  });
}

function renderParetoSummary() {
  const rows = getParetoRows(999);
  if (!rows.length) return `<p class="chart-note">尚無支出資料。</p>`;
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const threshold = total * 0.8;
  let cumulative = 0;
  let count = 0;
  for (const row of rows) {
    cumulative += row.amount;
    count += 1;
    if (cumulative >= threshold) break;
  }
  const categoryShare = rows.length ? count / rows.length * 100 : 0;
  return `<p class="chart-note">前 ${count} 個分類約吃掉 80% 支出，約占全部支出分類的 ${fmtNumber(categoryShare, 1)}%。若這些分類不是你真正重視的項目，就該優先砍。</p>`;
}

function getFinancialWrappedData() {
  const txRows = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  const expenseRows = txRows.filter(t => t.type === "expense");
  const netExpense = netExpenseForRows(txRows);
  const income = txRows.reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount || 0) : 0), 0);
  const savingsRate = income > 0 ? (income - netExpense) / income * 100 : null;

  const byDay = new Map();
  expenseRows.forEach(t => byDay.set(t.transaction_date, Number(byDay.get(t.transaction_date) || 0) + Number(t.amount || 0)));
  const topDay = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1])[0];

  const merchantCount = new Map();
  const merchantSpend = new Map();
  expenseRows.forEach(t => {
    const name = t.merchant || "未填商家";
    merchantCount.set(name, Number(merchantCount.get(name) || 0) + 1);
    merchantSpend.set(name, Number(merchantSpend.get(name) || 0) + Number(t.amount || 0));
  });
  const topMerchant = Array.from(merchantCount.entries()).sort((a, b) => b[1] - a[1])[0];
  const topMerchantSpend = topMerchant ? merchantSpend.get(topMerchant[0]) : 0;

  const mostExpensiveTx = expenseRows.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const luxuryTotal = expenseRows
    .filter(t => t.necessity_level === "luxury")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const categoryRows = getCategoryNetExpenseRows(999);
  const topCategory = categoryRows[0];

  const goalTarget = state.data.goals.reduce((sum, g) => sum + Number(g.target_amount || 0), 0);
  const goalCurrent = state.data.goals.reduce((sum, g) => sum + Number(g.current_amount || 0), 0);
  const goalPct = goalTarget > 0 ? goalCurrent / goalTarget * 100 : null;

  return {
    income,
    netExpense,
    savingsRate,
    topDay,
    topMerchant,
    topMerchantSpend,
    mostExpensiveTx,
    luxuryTotal,
    topCategory,
    goalPct
  };
}

function renderWrappedTile(label, value, sub = "") {
  return `
    <div class="wrapped-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${sub ? `<em>${escapeHtml(sub)}</em>` : ""}
    </div>
  `;
}

function renderFinancialWrapped() {
  const data = getFinancialWrappedData();
  if (!transactionsForSelectedYear().length) return `<div class="empty">尚無年度資料。開始記帳後，這裡會產生年度總結。</div>`;

  return `
    <div class="wrapped-hero">
      <div>
        <span>你的 ${state.selectedBudgetYear} 財務回顧</span>
        <strong>${fmtMoney(data.netExpense)}</strong>
        <em>年度淨支出</em>
      </div>
    </div>
    <div class="wrapped-grid">
      ${renderWrappedTile("儲蓄率", data.savingsRate === null ? "N/A" : `${fmtNumber(data.savingsRate, 1)}%`, "收入扣除淨支出後")}
      ${renderWrappedTile("最高支出日", data.topDay ? data.topDay[0] : "N/A", data.topDay ? fmtMoney(data.topDay[1]) : "")}
      ${renderWrappedTile("最常消費商家", data.topMerchant ? data.topMerchant[0] : "N/A", data.topMerchant ? `${data.topMerchant[1]} 次｜${fmtMoney(data.topMerchantSpend)}` : "")}
      ${renderWrappedTile("最貴單筆", data.mostExpensiveTx ? fmtMoney(data.mostExpensiveTx.amount) : "N/A", data.mostExpensiveTx ? `${data.mostExpensiveTx.transaction_date}｜${data.mostExpensiveTx.merchant || data.mostExpensiveTx.category_name || ""}` : "")}
      ${renderWrappedTile("Luxury 花費", fmtMoney(data.luxuryTotal), "necessity_level = luxury")}
      ${renderWrappedTile("最花錢分類", data.topCategory ? data.topCategory.name : "N/A", data.topCategory ? fmtMoney(data.topCategory.amount) : "")}
      ${renderWrappedTile("目標達成率", data.goalPct === null ? "N/A" : `${fmtNumber(data.goalPct, 1)}%`, "依目標頁 current / target")}
      ${renderWrappedTile("年度收入", fmtMoney(data.income), "只計入收入交易")}
    </div>
  `;
}

function renderAnalyticsSummaryCards() {
  const data = getFinancialWrappedData();
  const netWorthRows = getNetWorthRows();
  const latestNetWorth = netWorthRows[netWorthRows.length - 1]?.netWorth || 0;
  const paretoRows = getParetoRows(999);
  const paretoTop = paretoRows[0];

  return `
    <div class="grid cols-4 analytics-kpis">
      ${metricCard("儲蓄率", data.savingsRate === null ? "N/A" : `${fmtNumber(data.savingsRate, 1)}%`, "年度收入扣除淨支出")}
      ${metricCard("帳面淨資產", fmtMoney(latestNetWorth), "依帳戶與累積收支估算")}
      ${metricCard("Luxury 花費", fmtMoney(data.luxuryTotal), "奢侈娛樂支出", "warn")}
      ${metricCard("最大支出分類", paretoTop ? paretoTop.name : "N/A", paretoTop ? fmtMoney(paretoTop.amount) : "尚無資料")}
    </div>
  `;
}

function buildTAccountLedgerRows() {
  const ledger = new Map();

  const addEntry = (accountName, side, tx, memo = "") => {
    if (!accountName) return;
    if (!ledger.has(accountName)) {
      ledger.set(accountName, {
        name: accountName,
        debit: [],
        credit: [],
        debitTotal: 0,
        creditTotal: 0
      });
    }

    const row = ledger.get(accountName);
    const entry = {
      date: tx.transaction_date,
      amount: Number(tx.amount || 0),
      memo: memo || tx.merchant || tx.note || labelOf(tx.type)
    };

    row[side].push(entry);
    if (side === "debit") row.debitTotal += entry.amount;
    if (side === "credit") row.creditTotal += entry.amount;
  };

  transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .forEach(t => {
      const assetOut = `資產：${t.account_name || "未命名帳戶"}`;
      const assetIn = `資產：${t.to_account_name || "未命名帳戶"}`;
      const category = t.category_name || "未分類";
      const memo = t.merchant || t.note || labelOf(t.type);

      if (t.type === "expense") {
        addEntry(`費用：${category}`, "debit", t, memo);
        addEntry(assetOut, "credit", t, memo);
      } else if (t.type === "refund") {
        addEntry(assetOut, "debit", t, memo || "退款");
        addEntry(`費用退款：${category}`, "credit", t, memo || "退款");
      } else if (t.type === "income") {
        addEntry(assetOut, "debit", t, memo);
        addEntry(`收入：${category}`, "credit", t, memo);
      } else if (t.type === "transfer") {
        addEntry(assetIn, "debit", t, memo || "轉入");
        addEntry(assetOut, "credit", t, memo || "轉出");
      }
    });

  return Array.from(ledger.values())
    .sort((a, b) => {
      const order = name => {
        if (name.startsWith("資產")) return 1;
        if (name.startsWith("費用")) return 2;
        if (name.startsWith("費用退款")) return 3;
        if (name.startsWith("收入")) return 4;
        return 9;
      };
      return order(a.name) - order(b.name) || a.name.localeCompare(b.name);
    });
}

function renderTAccountCards() {
  const rows = buildTAccountLedgerRows();
  if (!rows.length) return `<div class="empty">尚無資料</div>`;

  const renderSide = entries => {
    if (!entries.length) return `<div class="muted">—</div>`;
    return entries.slice(0, 18).map(e => `
      <div class="t-entry">
        <span>
          ${escapeHtml(e.memo || "")}
          <span class="t-entry-date">${escapeHtml(e.date || "")}</span>
        </span>
        <strong class="mono">${fmtMoney(e.amount)}</strong>
      </div>
    `).join("") + (entries.length > 18 ? `<div class="metric-sub">另有 ${entries.length - 18} 筆未顯示</div>` : "");
  };

  return `
    <div class="t-account-grid">
      ${rows.map(row => {
        const net = Number(row.debitTotal || 0) - Number(row.creditTotal || 0);
        return `
          <div class="t-account-card">
            <div class="t-account-head">
              <span class="t-account-name">${escapeHtml(row.name)}</span>
              <span class="badge">${net >= 0 ? "借餘" : "貸餘"} ${fmtMoney(Math.abs(net))}</span>
            </div>
            <div class="t-account-body">
              <div class="t-side">
                <div class="t-side-title">借方</div>
                ${renderSide(row.debit)}
              </div>
              <div class="t-side">
                <div class="t-side-title">貸方</div>
                ${renderSide(row.credit)}
              </div>
            </div>
            <div class="t-account-total">
              <span>借方合計 <strong class="mono">${fmtMoney(row.debitTotal)}</strong></span>
              <span>貸方合計 <strong class="mono">${fmtMoney(row.creditTotal)}</strong></span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderTAccountTable() {
  const rows = transactionsForSelectedYear().slice(0, 80).map(t => {
    const account = t.account_name || "";
    const to = t.to_account_name || "";
    const category = t.category_name || "未分類";
    let debit = "";
    let credit = "";
    if (t.type === "expense") {
      debit = `費用：${category}`;
      credit = `資產：${account}`;
    } else if (t.type === "refund") {
      debit = `資產：${account}`;
      credit = `費用退款：${category}`;
    } else if (t.type === "income") {
      debit = `資產：${account}`;
      credit = `收入：${category}`;
    } else {
      debit = `資產：${to}`;
      credit = `資產：${account}`;
    }
    return { ...t, debit, credit };
  });
  if (!rows.length) return `<div class="empty">尚無資料</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>日期</th><th>借方</th><th>貸方</th><th>金額</th><th>備註</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${escapeHtml(r.transaction_date)}</td>
          <td>${escapeHtml(r.debit)}</td>
          <td>${escapeHtml(r.credit)}</td>
          <td class="mono">${fmtMoney(r.amount)}</td>
          <td>${escapeHtml(r.note || "")}</td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;
}



function renderTemplates() {
  const edit = state.editing.quickTemplate;
  const rows = (state.data.quickTemplates || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name || "").localeCompare(String(b.name || "")));

  return `
    <div class="card">
      <div class="card-title-row">
        <h3>${edit ? "編輯快速模板" : "新增快速模板"}</h3>
        <span class="badge">v26</span>
      </div>
      <p class="metric-sub">v26 取消不可編輯的內建模板。需要起手式時，按「匯入預設模板」，它們會被存成一般自訂模板，之後可編輯、停用或刪除。</p>
      <form id="quickTemplateForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("模板名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required placeholder="例：Blue Note、午餐、打工薪水">`)}
        ${field("類型", `<select class="input" name="type">${selectOpts(["expense","income","refund","transfer"], edit?.type || "expense")}</select>`)}
        ${field("預設帳戶", `<select class="input" name="account_id">${accountOptions(edit?.account_id || "")}</select>`)}
        ${field("預設轉入帳戶", `<select class="input" name="to_account_id">${accountOptions(edit?.to_account_id || "")}</select>`)}
        ${field("預設分類", `<select class="input" name="category_id">${categoryOptions(edit?.type || "expense", edit?.category_id || "")}</select>`)}
        ${field("預設預算項目", `<select class="input" name="budget_item_id">${budgetItemOptions(edit?.budget_item_id || "")}</select>`)}
        ${field("商家 / 對象", `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}" placeholder="例：Blue Note Taipei">`)}
        ${field("付款方式", `<input class="input" name="payment_method" value="${escapeHtml(edit?.payment_method || "")}" placeholder="例：信用卡、現金">`)}
        ${field("必要程度", `<select class="input" name="necessity_level">${selectOpts(["survival","quality","luxury","investment","other"], edit?.necessity_level || "other")}</select>`)}
        ${field("現金流性質", `<select class="input" name="cashflow_nature">${selectOpts(["fixed","variable","one_time"], edit?.cashflow_nature || "variable")}</select>`)}
        ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(edit?.sort_order || 0)}">`)}
        ${field("啟用", `<select class="input" name="is_active">
          <option value="true" ${edit?.is_active !== false ? "selected" : ""}>啟用</option>
          <option value="false" ${edit?.is_active === false ? "selected" : ""}>停用</option>
        </select>`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="模板備註，不一定會顯示在流水帳">${escapeHtml(edit?.note || "")}</textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : "新增模板"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="quickTemplate">取消編輯</button>` : ""}
          <button class="btn secondary" type="button" id="seedDefaultTemplatesBtn">匯入預設模板</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3>自訂快速模板</h3>
        <span class="badge">${rows.length} 個</span>
      </div>
      ${renderTemplateCards(rows)}
    </div>
  `;
}

function renderTemplateCards(rows) {
  if (!rows.length) {
    return `<div class="empty">尚無自訂模板。你可以按上方「匯入預設模板」，把起手式模板存成可編輯的自訂模板。</div>`;
  }

  return `
    <div class="mobile-card-list always-card-list">
      ${rows.map(t => {
        const category = state.data.categories.find(c => c.id === t.category_id);
        const budget = state.data.budgetItems.find(b => b.id === t.budget_item_id);
        const account = state.data.accounts.find(a => a.id === t.account_id);
        return `
          <div class="mobile-data-card">
            <div class="mobile-data-head">
              <div>
                <strong>${escapeHtml(t.name)}</strong>
                <span>${escapeHtml(labelOf(t.type))} · ${escapeHtml(account?.name || "未指定帳戶")}</span>
              </div>
              <span class="badge">${t.is_active === false ? "停用" : "啟用"}</span>
            </div>
            <div class="mobile-data-meta">
              ${category ? `<span class="badge">${escapeHtml(category.name)}</span>` : ""}
              ${budget ? `<span class="badge">${escapeHtml(budget.name)}</span>` : ""}
              <span class="badge">${escapeHtml(labelOf(t.necessity_level || "other"))}</span>
              <span class="badge">${escapeHtml(labelOf(t.cashflow_nature || "variable"))}</span>
            </div>
            <div class="mobile-card-actions">
              <button class="btn small secondary" type="button" data-edit-template="${t.id}">編輯</button>
              <button type="button" class="btn small danger" data-delete="quick_templates:${t.id}">刪除</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}


function renderMobileMore() {
  const items = [
    { tab: "accounts", title: "帳戶", desc: "現金、銀行、電子支付、信用卡餘額" },
    { tab: "categories", title: "分類 / 標籤", desc: "調整分類、顏色與標籤" },
    { tab: "recurring", title: "訂閱管理", desc: "固定扣款、下次扣款日與取消狀態" },
    { tab: "templates", title: "模板管理", desc: "自訂、匯入、編輯快速記一筆模板" },
    { tab: "creditLoans", title: "信用卡 / 貸款", desc: "信用卡總帳、貸款與債務" },
    { tab: "goals", title: "目標", desc: "儲蓄、旅遊、還債與大額購買" },
    { tab: "settings", title: "設定", desc: "匯出資料、連線狀態與提醒" }
  ];

  return `
    <div class="mobile-more-grid">
      ${items.map(item => `
        <button class="mobile-more-card" type="button" data-go="${item.tab}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.desc)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="grid cols-2">
      <div class="card">
        <h3>連線設定</h3>
        <p class="metric-sub">目前已使用設定檔連到後端資料庫。</p>
        <p class="metric-sub">若讀不到資料，先確認：已在後端資料庫編輯器執行資料庫結構檔，且沒有直接開啟列層級安全規則導致缺少存取規則。</p>
      </div>
      <div class="card">
        <h3>資料匯出</h3>
        <p class="metric-sub">匯出目前年度流水帳表格，或下載畫面目前暫存的資料備份。</p>
        <div class="btn-row">
          <button class="btn secondary" id="exportCsvBtn">匯出目前年度表格</button>
          <button class="btn secondary" id="downloadJsonBtn">下載暫存資料</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>重要限制</h3>
      <p class="metric-sub">
        這版沒有 登入驗證 / 列層級安全規則，適合單人測試或非敏感資料。若要公開長期使用，應改成 登入驗證與列層級安全規則。
      </p>
    </div>
  `;
}

function renderCategoryChart(type, limit = 8) {
  const rows = state.data.categorySpending
    .filter(r => Number(r.budget_year) === Number(state.selectedBudgetYear) && r.type === type)
    .sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0))
    .slice(0, limit);
  if (!rows.length) return `<div class="empty">尚無資料</div>`;
  const max = Math.max(...rows.map(r => Number(r.total_amount || 0)), 1);
  return `
    <div class="chart-list">
      ${rows.map(r => `
        <div class="chart-row">
          <span>${escapeHtml(r.category_name)}</span>
          <div class="bar"><span style="width:${Math.max(2, Number(r.total_amount || 0) / max * 100)}%"></span></div>
          <strong class="mono">${fmtMoney(r.total_amount)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMonthlyChart(limit = 12) {
  const rows = state.data.monthlyCashflow
    .filter(r => Number(r.budget_year) === Number(state.selectedBudgetYear))
    .slice(-limit);
  if (!rows.length) return `<div class="empty">尚無資料</div>`;
  const max = Math.max(...rows.map(r => Math.max(Number(r.income || 0), Number(r.expense || 0))), 1);
  return `
    <div class="chart-list">
      ${rows.map(r => `
        <div class="chart-row">
          <span>${escapeHtml(r.budget_month)} 月</span>
          <div>
            <div class="bar" title="收入"><span style="width:${Math.max(2, Number(r.income || 0) / max * 100)}%"></span></div>
            <div class="bar" title="支出" style="margin-top:4px"><span style="width:${Math.max(2, Number(r.expense || 0) / max * 100)}%"></span></div>
          </div>
          <strong class="mono">${fmtMoney(r.net_cashflow)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}


function renderChartToolbar() {
  return `
    <div class="chart-toolbar">
      <div class="left">
        <span class="chart-scope-note">圖表篩選</span>
        <div class="segmented" role="group" aria-label="圖表範圍">
          <button type="button" class="${state.filters.chartScope === "year" ? "active" : ""}" data-chart-scope="year">本年</button>
          <button type="button" class="${state.filters.chartScope === "month" ? "active" : ""}" data-chart-scope="month">本月</button>
        </div>
      </div>
      <div class="right">
        <span class="chart-scope-note">分類</span>
        <select class="input compact" id="chartCategoryFilter">
          <option value="">全部分類</option>
          ${state.data.categories
            .filter(c => c.type === "expense")
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
            .map(c => `<option value="${escapeHtml(c.id)}" ${state.filters.chartCategory === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
            .join("")}
        </select>
        <span class="chart-scope-note">${escapeHtml(chartScopeText())}</span>
      </div>
    </div>
  `;
}

function chartScopeText() {
  const category = state.data.categories.find(c => c.id === state.filters.chartCategory)?.name || "全部分類";
  const scope = state.filters.chartScope === "month" ? `${new Date().getMonth() + 1} 月` : `${state.selectedBudgetYear} 年`;
  return `${scope}｜${category}`;
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

function chartTransactions() {
  const currentMonth = new Date().getMonth() + 1;
  return transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .filter(t => state.filters.chartScope !== "month" || Number(t.tx_month) === currentMonth)
    .filter(t => !state.filters.chartCategory || t.category_id === state.filters.chartCategory);
}

function getBudgetUsageChartData() {
  const s = getCurrentYearSummary();
  const available = Number(s.available_budget || 0);
  const used = Math.max(0, Number(s.actual_expense || 0));
  const usedWithinBudget = Math.min(used, available);
  const overspend = Math.max(0, used - available);
  const remaining = Math.max(0, available - used);

  if (available <= 0 && used <= 0) return null;

  if (overspend > 0) {
    return {
      labels: ["預算內使用", "超支部分"],
      data: [usedWithinBudget, overspend],
      colors: ["rgba(10, 132, 255, 0.92)", "rgba(255, 69, 58, 0.92)"]
    };
  }

  return {
    labels: ["已使用", "剩餘"],
    data: [used, remaining],
    colors: ["rgba(10, 132, 255, 0.92)", "rgba(48, 209, 88, 0.92)"]
  };
}

function getCategoryNetExpenseRows(limit = 8) {
  const grouped = new Map();
  chartTransactions().forEach(t => {
    if (!["expense", "refund"].includes(t.type)) return;
    const key = t.category_id || t.category_name || "uncategorized";
    const name = t.category_name || "未分類";
    const delta = t.type === "refund" ? -Number(t.amount || 0) : Number(t.amount || 0);
    grouped.set(key, { name, amount: Number((grouped.get(key)?.amount || 0) + delta) });
  });

  return Array.from(grouped.values())
    .filter(r => Number(r.amount || 0) > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function getTrendRows() {
  const rows = chartTransactions();
  if (state.filters.chartScope === "month") {
    const currentMonth = new Date().getMonth() + 1;
    const daysInMonth = new Date(Number(state.selectedBudgetYear), currentMonth, 0).getDate();
    const buckets = Array.from({ length: daysInMonth }, (_, i) => ({ label: `${i + 1}日`, income: 0, expense: 0, net: 0 }));
    rows.forEach(t => {
      const date = t.transaction_date ? new Date(`${t.transaction_date}T00:00:00`) : null;
      const day = date ? date.getDate() : 0;
      if (!day || day < 1 || day > daysInMonth) return;
      const bucket = buckets[day - 1];
      if (t.type === "income") bucket.income += Number(t.amount || 0);
      if (t.type === "expense") bucket.expense += Number(t.amount || 0);
      if (t.type === "refund") bucket.expense -= Number(t.amount || 0);
    });
    buckets.forEach(b => { b.net = b.income - b.expense; });
    return buckets;
  }

  const buckets = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}月`, income: 0, expense: 0, net: 0 }));
  rows.forEach(t => {
    const month = Number(t.tx_month || 0);
    if (!month || month < 1 || month > 12) return;
    const bucket = buckets[month - 1];
    if (t.type === "income") bucket.income += Number(t.amount || 0);
    if (t.type === "expense") bucket.expense += Number(t.amount || 0);
    if (t.type === "refund") bucket.expense -= Number(t.amount || 0);
  });
  buckets.forEach(b => { b.net = b.income - b.expense; });
  return buckets;
}

function getBudgetCompareRows(limit = 8) {
  let rows = budgetItemSummariesForSelectedYear()
    .filter(r => Number(r.planned_amount || 0) > 0);

  if (state.filters.chartCategory) {
    rows = rows.filter(r => r.category_id === state.filters.chartCategory);
  }

  return rows
    .sort((a, b) => Number(b.planned_amount || 0) - Number(a.planned_amount || 0))
    .slice(0, limit)
    .map(r => ({
      name: r.name,
      planned: Number(r.planned_amount || 0),
      actual: Number(r.actual_amount || 0),
      remaining: Number(r.remaining_amount || 0)
    }));
}

function shortMoney(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if (abs >= 10000) return `${fmtNumber(n / 10000, abs >= 100000 ? 0 : 1)}萬`;
  return fmtNumber(n, 0);
}

function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  return {
    text: css.getPropertyValue("--text").trim() || "#f8fafc",
    muted: css.getPropertyValue("--muted").trim() || "#94a3b8",
    grid: "rgba(148, 163, 184, 0.15)",
    blue: "rgba(10, 132, 255, 0.92)",
    green: "rgba(48, 209, 88, 0.88)",
    red: "rgba(255, 69, 58, 0.88)",
    purple: "rgba(94, 92, 230, 0.92)",
    orange: "rgba(255, 159, 10, 0.88)"
  };
}

function destroyCharts() {
  Object.keys(chartInstances).forEach(key => {
    try { chartInstances[key]?.destroy?.(); } catch (error) { console.warn(error); }
    delete chartInstances[key];
  });
}

function initCharts() {
  if (!window.Chart) return;
  if (!["overview", "reports"].includes(state.activeTab)) return;
  const theme = chartTheme();
  const moneyTick = value => shortMoney(value);
  const moneyTooltip = value => fmtMoney(value);

  Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Segoe UI", sans-serif';

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 240 },
    plugins: {
      legend: { labels: { color: theme.text, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8 } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset?.label || ctx.label}：${moneyTooltip(ctx.parsed.x ?? ctx.parsed.y ?? ctx.parsed)}` } }
    }
  };

  const makeDoughnut = id => {
    const el = document.getElementById(id);
    const chartData = getBudgetUsageChartData();
    if (!el || !chartData) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: { labels: chartData.labels, datasets: [{ data: chartData.data, backgroundColor: chartData.colors, borderWidth: 0, hoverOffset: 4 }] },
      options: {
        ...baseOptions,
        cutout: "70%",
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.label}：${moneyTooltip(ctx.parsed)}` } }
        }
      }
    });
  };

  const makeCategoryBar = id => {
    const el = document.getElementById(id);
    const rows = getCategoryNetExpenseRows(8);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{ label: "淨支出", data: rows.map(r => r.amount), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false }]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        plugins: { ...baseOptions.plugins, legend: { display: false } },
        scales: {
          x: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.text }, grid: { display: false } }
        }
      }
    });
  };

  const makeTrendLine = id => {
    const el = document.getElementById(id);
    const rows = getTrendRows();
    const hasData = rows.some(r => r.income || r.expense || r.net);
    if (!el || !hasData) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: "收入", data: rows.map(r => r.income), borderColor: theme.green, backgroundColor: "rgba(48, 209, 88, 0.12)", tension: 0.32, pointRadius: 2, fill: false },
          { label: "淨支出", data: rows.map(r => r.expense), borderColor: theme.red, backgroundColor: "rgba(255, 69, 58, 0.12)", tension: 0.32, pointRadius: 2, fill: false },
          { label: "淨現金流", data: rows.map(r => r.net), borderColor: theme.purple, backgroundColor: "rgba(94, 92, 230, 0.12)", tension: 0.32, pointRadius: 2, fill: false }
        ]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { ticks: { color: theme.muted, maxTicksLimit: state.filters.chartScope === "month" ? 8 : 12 }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } }
        }
      }
    });
  };

  const makeBudgetCompare = id => {
    const el = document.getElementById(id);
    const rows = getBudgetCompareRows(8);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [
          { label: "預算", data: rows.map(r => r.planned), backgroundColor: theme.green, borderRadius: 10, borderSkipped: false },
          { label: "實際", data: rows.map(r => r.actual), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false }
        ]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        scales: {
          x: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.text }, grid: { display: false } }
        }
      }
    });
  };


  const makeHealthDoughnut = id => {
    const el = document.getElementById(id);
    const rows = getHealthRows();
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{
          data: rows.map(r => Math.max(0, r.amount)),
          backgroundColor: [theme.green, theme.blue, theme.red, theme.purple, theme.orange],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        ...baseOptions,
        cutout: "68%",
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.label}：${moneyTooltip(ctx.parsed)}` } }
        }
      }
    });
  };

  const makeHealthTrend = id => {
    const el = document.getElementById(id);
    const rows = getHealthTrendRows();
    const hasData = rows.some(r => r.survival || r.quality || r.luxury || r.investment || r.other);
    if (!el || !hasData) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: "生存必要", data: rows.map(r => r.survival), borderColor: theme.green, tension: 0.3, pointRadius: 2 },
          { label: "生活品質", data: rows.map(r => r.quality), borderColor: theme.blue, tension: 0.3, pointRadius: 2 },
          { label: "奢侈娛樂", data: rows.map(r => r.luxury), borderColor: theme.red, tension: 0.3, pointRadius: 2 },
          { label: "自我投資", data: rows.map(r => r.investment), borderColor: theme.purple, tension: 0.3, pointRadius: 2 }
        ]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { ticks: { color: theme.muted }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } }
        }
      }
    });
  };

  const makeSavingsRate = id => {
    const el = document.getElementById(id);
    const rows = getMonthlyAnalyticsRows();
    const hasData = rows.some(r => r.income || r.expense);
    if (!el || !hasData) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: "儲蓄率 %", data: rows.map(r => r.savingsRate), borderColor: theme.purple, backgroundColor: "rgba(94, 92, 230, 0.12)", tension: 0.32, yAxisID: "y1", pointRadius: 2 },
          { label: "收入", data: rows.map(r => r.income), borderColor: theme.green, backgroundColor: "rgba(48, 209, 88, 0.10)", tension: 0.32, yAxisID: "y", pointRadius: 2 },
          { label: "淨支出", data: rows.map(r => r.expense), borderColor: theme.red, backgroundColor: "rgba(255, 69, 58, 0.10)", tension: 0.32, yAxisID: "y", pointRadius: 2 }
        ]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => ctx.dataset.yAxisID === "y1" ? `${ctx.dataset.label}：${fmtNumber(ctx.parsed.y, 1)}%` : `${ctx.dataset.label}：${moneyTooltip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted }, grid: { color: theme.grid } },
          y: { position: "left", ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y1: { position: "right", ticks: { color: theme.muted, callback: v => `${v}%` }, grid: { drawOnChartArea: false } }
        }
      }
    });
  };

  const makeNetWorth = id => {
    const el = document.getElementById(id);
    const rows = getNetWorthRows();
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [{ label: "帳面淨資產", data: rows.map(r => r.netWorth), borderColor: theme.green, backgroundColor: "rgba(48, 209, 88, 0.12)", tension: 0.32, pointRadius: 2, fill: false }]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { ticks: { color: theme.muted }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } }
        }
      }
    });
  };

  const makePareto = id => {
    const el = document.getElementById(id);
    const rows = getParetoRows(12);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [
          { label: "分類淨支出", data: rows.map(r => r.amount), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false, yAxisID: "y" },
          { label: "累積占比 %", data: rows.map(r => r.cumulativePct), type: "line", borderColor: theme.orange, backgroundColor: "rgba(255, 159, 10, 0.16)", tension: 0.25, yAxisID: "y1", pointRadius: 3 }
        ]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => ctx.dataset.yAxisID === "y1" ? `${ctx.dataset.label}：${fmtNumber(ctx.parsed.y, 1)}%` : `${ctx.dataset.label}：${moneyTooltip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted, maxRotation: 0, autoSkip: false }, grid: { display: false } },
          y: { position: "left", ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y1: { position: "right", min: 0, max: 100, ticks: { color: theme.muted, callback: v => `${v}%` }, grid: { drawOnChartArea: false } }
        }
      }
    });
  };

  ["overviewBudgetChart", "reportsBudgetChart"].forEach(makeDoughnut);
  ["overviewCategoryChart", "reportsCategoryChart"].forEach(makeCategoryBar);
  ["overviewMonthlyChart", "reportsMonthlyChart"].forEach(makeTrendLine);
  makeBudgetCompare("reportsBudgetCompareChart");
  makeHealthDoughnut("reportsHealthDoughnut");
  makeHealthTrend("reportsHealthTrend");
  makeSavingsRate("reportsSavingsRateChart");
  makeNetWorth("reportsNetWorthChart");
  makePareto("reportsParetoChart");
}


function field(label, html) {
  return `<div class="field"><label>${escapeHtml(label)}</label>${html}</div>`;
}

function selectOpts(values, selected) {
  return values.map(v => `<option value="${escapeHtml(v)}" ${String(v) === String(selected) ? "selected" : ""}>${escapeHtml(labelOf(v))}</option>`).join("");
}

function readForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach(k => {
    if (data[k] === "") data[k] = null;
  });
  return data;
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
}

function boolValue(value) {
  return value === "true" || value === true;
}

function formatSupabaseError(error) {
  if (!error) return "未知錯誤";
  return [
    error.message,
    error.details ? `細節：${error.details}` : "",
    error.hint ? `提示：${error.hint}` : "",
    error.code ? `代碼：${error.code}` : ""
  ].filter(Boolean).join("｜");
}

function assertSavedRow(table, data, action = "寫入") {
  if (!data) {
    throw new Error(`${action}失敗：資料庫沒有回傳資料。可能是權限、資料表規則、RLS 或前端欄位問題。表：${table}`);
  }
  if (!data.id) {
    throw new Error(`${action}失敗：資料庫有回應，但沒有回傳 id。表：${table}`);
  }
  return data;
}

function cleanPayload(payload) {
  const clean = { ...payload };
  Object.keys(clean).forEach(k => {
    if (clean[k] === undefined) delete clean[k];
  });
  return clean;
}

async function verifyRowExists(table, id, action = "寫入") {
  const { data, error } = await state.client
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`${action}驗證失敗：${formatSupabaseError(error)}`);
  if (!data || !data.id) {
    throw new Error(`${action}驗證失敗：資料庫查不到 id=${id}。表：${table}`);
  }
  return data;
}

function makeUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function normalizeForWrite(payload) {
  const clean = cleanPayload(payload);
  Object.keys(clean).forEach(k => {
    if (clean[k] === "") clean[k] = null;
  });
  return clean;
}

async function findExistingYearId(budgetYear) {
  if (!budgetYear) return null;
  const { data, error } = await state.client
    .from("years")
    .select("id,budget_year")
    .eq("budget_year", Number(budgetYear))
    .maybeSingle();

  if (error) throw new Error(`查詢既有年度失敗：${formatSupabaseError(error)}`);
  return data?.id || null;
}

async function writeRow(table, payload, options = {}) {
  const clean = normalizeForWrite(payload);
  let id = clean.id || null;
  let action = id ? "更新" : "新增";

  if (!id && table === "years" && clean.budget_year) {
    id = await findExistingYearId(clean.budget_year);
    if (id) {
      clean.id = id;
      action = "更新";
    }
  }

  let response;
  if (action === "更新") {
    const updatePayload = { ...clean };
    delete updatePayload.id;
    response = await state.client
      .from(table)
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
  } else {
    response = await state.client
      .from(table)
      .insert(clean)
      .select("*")
      .single();
  }

  if (response.error) {
    throw new Error(`${action}失敗：${formatSupabaseError(response.error)}｜表：${table}`);
  }

  const saved = assertSavedRow(table, response.data, action);

  if (options.expect) {
    for (const [key, expected] of Object.entries(options.expect)) {
      const actual = saved[key];
      if (String(actual ?? "") !== String(expected ?? "")) {
        throw new Error(`${action}驗證失敗：欄位 ${key} 沒有寫入成功。預期=${expected ?? "空"}，實際=${actual ?? "空"}。表：${table}`);
      }
    }
  }

  const verified = await verifyRowExists(table, saved.id, action);
  return verified;
}

async function upsert(table, payload, options = {}) {
  return await writeRow(table, payload, options);
}

async function insert(table, payload) {
  if (Array.isArray(payload)) {
    const rows = [];
    for (const row of payload) rows.push(await writeRow(table, row));
    return rows;
  }
  return await writeRow(table, payload);
}

async function removeRow(table, id) {
  if (!id) throw new Error("刪除失敗：缺少資料 id");

  const before = await state.client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (before.error) throw new Error(`刪除前檢查失敗：${formatSupabaseError(before.error)}｜表：${table}`);
  if (!before.data) throw new Error(`刪除失敗：資料不存在。表：${table}，id=${id}`);

  const response = await state.client
    .from(table)
    .delete()
    .eq("id", id);

  if (response.error) {
    throw new Error(`刪除失敗：${formatSupabaseError(response.error)}｜表：${table}`);
  }

  const verify = await state.client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (verify.error) {
    throw new Error(`刪除驗證失敗：${formatSupabaseError(verify.error)}｜表：${table}`);
  }
  if (verify.data) {
    throw new Error(`刪除驗證失敗：資料仍存在。表：${table}，id=${id}`);
  }

  return true;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formId = form.getAttribute("id") || "";
  try {
    let saved = null;
    switch (formId) {
      case "txForm":
        saved = await saveTransaction(form);
        break;
      case "yearForm":
        saved = await saveYear(form);
        break;
      case "budgetItemForm":
        saved = await saveBudgetItem(form);
        break;
      case "accountForm":
        saved = await saveAccount(form);
        break;
      case "categoryForm":
        saved = await saveCategory(form);
        break;
      case "tagForm":
        saved = await saveTag(form);
        break;
      case "recurringForm":
        throw new Error("訂閱表單不應進入通用儲存流程。請確認目前前端版本為 v14。");
      case "creditCardForm":
        saved = await saveCreditCard(form);
        break;
      case "loanForm":
        saved = await saveLoan(form);
        break;
      case "goalForm":
        saved = await saveGoal(form);
        break;
      case "quickTemplateForm":
        saved = await saveQuickTemplate(form);
        break;
      default:
        throw new Error(`未知表單：${formId || "無 id"}`);
    }

    await loadAll();
    clearEditing();
    render();
    showAlert(`v28 驗證通過：${tableLabel(formToTable(formId))} 已真正寫入資料庫｜id=${escapeHtml(saved?.id || "無")}`, "good");
  } catch (error) {
    showAlert(`儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}

function formToTable(formId) {
  return {
    txForm: "transactions",
    yearForm: "years",
    budgetItemForm: "budget_items",
    accountForm: "accounts",
    categoryForm: "categories",
    tagForm: "tags",
    recurringForm: "recurring_transactions",
    creditCardForm: "credit_cards",
    loanForm: "loans",
    goalForm: "goals",
    quickTemplateForm: "quick_templates"
  }[formId] || formId;
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const saved = await saveRecurring(form);
    const rows = await loadRecurringOnly();
    const found = rows.some(row => String(row.id) === String(saved.id));

    if (!found) {
      throw new Error(`v14 驗證失敗：寫入後重新讀取列表，找不到 id=${saved.id || "無"}。目前列表 ${rows.length} 筆。`);
    }

    state.editing.recurring = null;
    render();
    showAlert(`v28 驗證通過：訂閱已真正寫入資料庫｜${escapeHtml(saved.name)}｜目前列表 ${rows.length} 筆。`, "good");
  } catch (error) {
    showAlert(`訂閱儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}

async function saveTransaction(form) {
  const d = readForm(form);
  const type = d.type || state.draftTxType || "expense";
  if (!d.account_id) throw new Error(type === "income" ? "請選擇入帳帳戶" : type === "transfer" ? "請選擇轉出帳戶" : "請選擇帳戶");
  if (!Number(d.amount)) throw new Error("請輸入金額");
  if (type === "transfer" && !d.to_account_id) throw new Error("轉帳需要選擇轉入帳戶");
  if (type !== "transfer" && d.to_account_id) d.to_account_id = null;
  const payload = {
    id: d.id || undefined,
    transaction_date: d.transaction_date,
    type,
    account_id: d.account_id,
    to_account_id: type === "transfer" ? d.to_account_id : null,
    category_id: type === "transfer" ? null : d.category_id || null,
    budget_item_id: (type === "expense" || type === "refund") ? d.budget_item_id || null : null,
    related_transaction_id: type === "refund" ? d.related_transaction_id || null : null,
    amount: numberOrZero(d.amount),
    merchant: d.merchant,
    payment_method: d.payment_method,
    note: d.note,
    status: d.status || "cleared",
    necessity_level: d.necessity_level || defaultNecessityByType(type),
    cashflow_nature: d.cashflow_nature || defaultCashflowByType(type),
    control_level: d.control_level || "controllable"
  };
  return await upsert("transactions", payload, { expect: { type: payload.type, amount: payload.amount } });
}

async function saveYear(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    budget_year: Number(d.budget_year),
    name: d.name || `${d.budget_year} 年度預算`,
    annual_budget: numberOrZero(d.annual_budget),
    carryover_from_previous: numberOrZero(d.carryover_from_previous),
    note: d.note
  };
  const row = await upsert("years", payload, { expect: { budget_year: Number(d.budget_year) } });
  state.selectedYearId = row.id;
  state.selectedBudgetYear = row.budget_year;
  return row;
}

async function saveBudgetItem(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    year_id: state.selectedYearId,
    category_id: d.category_id || null,
    name: d.name,
    item_type: d.item_type || "expense",
    planned_amount: numberOrZero(d.planned_amount),
    period_type: d.period_type || "annual",
    rollover_mode: d.rollover_mode || "none",
    sort_order: Number(d.sort_order || 0),
    is_active: boolValue(d.is_active),
    note: d.note
  };
  return await upsert("budget_items", payload, { expect: { name: payload.name, planned_amount: payload.planned_amount } });
}

async function saveAccount(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type || "bank",
    initial_balance: numberOrZero(d.initial_balance),
    opening_date: d.opening_date,
    note: d.note,
    sort_order: Number(d.sort_order || 0),
    is_active: boolValue(d.is_active)
  };
  return await upsert("accounts", payload, { expect: { name: payload.name, type: payload.type } });
}

async function saveCategory(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type || "expense",
    color: d.color,
    sort_order: Number(d.sort_order || 0)
  };
  return await upsert("categories", payload, { expect: { name: payload.name, type: payload.type } });
}

async function saveTag(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    color: d.color,
    note: d.note
  };
  return await upsert("tags", payload, { expect: { name: payload.name } });
}

async function saveRecurring(form) {
  const d = readForm(form);
  if (!d.name) throw new Error("請輸入服務名稱");
  if (!d.account_id) throw new Error("請選擇付款帳戶");
  if (!Number(d.amount)) throw new Error("請輸入金額");
  if (!d.start_date) throw new Error("請選擇開始日");
  if (!d.next_due_date) throw new Error("請選擇下次扣款日");

  const payload = {
    name: d.name,
    type: "expense",
    account_id: d.account_id,
    to_account_id: null,
    category_id: d.category_id || null,
    budget_item_id: d.budget_item_id || null,
    amount: numberOrZero(d.amount),
    frequency: d.frequency || "monthly",
    interval_count: Number(d.interval_count || 1),
    start_date: d.start_date,
    end_date: d.end_date || null,
    next_due_date: d.next_due_date,
    merchant: d.merchant || null,
    payment_method: d.payment_method || null,
    note: d.note || null,
    is_active: boolValue(d.is_active)
  };

  const saved = await writeRow("recurring_transactions", { id: d.id || undefined, ...payload }, {
    expect: { name: payload.name, type: "expense", amount: payload.amount }
  });

  return saved;
}

async function saveCreditCard(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    account_id: d.account_id,
    issuer: d.issuer,
    card_name: d.card_name,
    statement_day: d.statement_day ? Number(d.statement_day) : null,
    payment_due_day: d.payment_due_day ? Number(d.payment_due_day) : null,
    credit_limit: numberOrZero(d.credit_limit)
  };
  return await upsert("credit_cards", payload, { expect: { account_id: payload.account_id, card_name: payload.card_name } });
}

async function saveLoan(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    loan_type: d.loan_type || "other",
    creditor: d.creditor,
    principal_amount: numberOrZero(d.principal_amount),
    remaining_principal: numberOrZero(d.remaining_principal),
    annual_interest_rate: numberOrZero(d.annual_interest_rate),
    monthly_payment: numberOrZero(d.monthly_payment),
    status: d.status || "active"
  };
  return await upsert("loans", payload, { expect: { name: payload.name } });
}

async function saveGoal(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    goal_type: d.goal_type || "saving",
    target_amount: numberOrZero(d.target_amount),
    current_amount: numberOrZero(d.current_amount),
    start_date: d.start_date,
    target_date: d.target_date,
    priority: Number(d.priority || 3),
    status: d.status || "active",
    note: d.note
  };
  return await upsert("goals", payload, { expect: { name: payload.name } });
}



function mapBuiltinTemplateToPayload(template, index = 0) {
  const category = findCategoryByNames(template.categoryNames || []);
  const budgetItem = findBudgetItemByNames(template.budgetNames || []);
  const account = findAccountByTypes(template.accountTypes || []);

  return {
    name: template.name || template.label || `模板 ${index + 1}`,
    type: template.type || "expense",
    account_id: account?.id || null,
    to_account_id: null,
    category_id: category?.id || null,
    budget_item_id: budgetItem?.budget_item_id || budgetItem?.id || null,
    merchant: template.merchant || template.name || "",
    payment_method: account?.type === "credit_card" ? "信用卡" : labelOf(account?.type || ""),
    necessity_level: template.necessity_level || template.necessity || "other",
    cashflow_nature: template.cashflow_nature || template.cashflow || "variable",
    note: "由預設模板匯入，可自行編輯或刪除",
    sort_order: index,
    is_active: true
  };
}

async function seedDefaultQuickTemplates() {
  if ((state.data.quickTemplates || []).length) {
    const ok = await confirmAction("匯入預設模板", "目前已經有自訂模板。仍要再匯入一組預設模板嗎？這會新增重複模板，但你可以之後自行刪除。");
    if (!ok) return [];
  }

  const payloads = fallbackQuickTemplates.map(mapBuiltinTemplateToPayload);
  const rows = [];
  for (const payload of payloads) {
    rows.push(await insert("quick_templates", payload));
  }
  await loadAll();
  render();
  showAlert(`已匯入 ${rows.length} 個預設模板，現在都可以編輯、停用或刪除。`, "good");
  return rows;
}

async function saveQuickTemplate(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type || "expense",
    account_id: d.account_id || null,
    to_account_id: d.type === "transfer" ? d.to_account_id || null : null,
    category_id: d.category_id || null,
    budget_item_id: d.budget_item_id || null,
    merchant: d.merchant,
    payment_method: d.payment_method,
    necessity_level: d.necessity_level || "other",
    cashflow_nature: d.cashflow_nature || "variable",
    note: d.note,
    sort_order: Number(d.sort_order || 0),
    is_active: boolValue(d.is_active)
  };
  return await upsert("quick_templates", payload, { expect: { name: payload.name, type: payload.type } });
}

function clearEditing() {
  Object.keys(state.editing).forEach(k => state.editing[k] = null);
}

function bindRenderedEvents() {
  $("#recurringForm")?.addEventListener("submit", handleRecurringSubmit);
  $$("form").filter(form => form.getAttribute("id") !== "recurringForm").forEach(form => form.addEventListener("submit", handleSubmit));

  $$("[data-tx-mode]").forEach(btn => btn.addEventListener("click", () => {
    state.draftTxType = btn.dataset.txMode || "expense";
    state.editing.transaction = null;
    render();
  }));

  $$("[data-tx-template]").forEach(btn => btn.addEventListener("click", () => applyQuickTxTemplate(btn.dataset.txTemplate)));

  $("#seedDefaultTemplatesBtn")?.addEventListener("click", async () => {
    try {
      await seedDefaultQuickTemplates();
    } catch (error) {
      showAlert(`匯入預設模板失敗：${escapeHtml(error.message)}`, "bad");
    }
  });

  $$("[data-chart-scope]").forEach(btn => btn.addEventListener("click", () => {
    state.filters.chartScope = btn.dataset.chartScope || "year";
    render();
  }));

  $("#chartCategoryFilter")?.addEventListener("change", e => {
    state.filters.chartCategory = e.target.value;
    render();
  });

  $$("[data-go]").forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.go)));

  $$("[data-cancel-edit]").forEach(btn => btn.addEventListener("click", () => {
    state.editing[btn.dataset.cancelEdit] = null;
    render();
  }));

  const txTypeInput = $("#txTypeInput");
  if (txTypeInput) {
    txTypeInput.addEventListener("change", e => {
      if (state.editing.transaction) state.editing.transaction.type = e.target.value;
      state.draftTxType = e.target.value;
      render();
    });
  }

  const recurringTypeInput = $("#recurringTypeInput");
  if (recurringTypeInput) {
    recurringTypeInput.addEventListener("change", e => {
      if (state.editing.recurring) state.editing.recurring.type = e.target.value;
      state.draftRecurringType = e.target.value;
      render();
    });
  }

  $("#refreshRecurringBtn")?.addEventListener("click", async () => {
    try {
      const rows = await loadRecurringOnly();
      render();
      showAlert(`已重新讀取訂閱列表：${rows.length} 筆。`, "good");
    } catch (error) {
      showAlert(`重新讀取訂閱失敗：${escapeHtml(error.message)}`, "bad");
    }
  });

  $("#filterTxSearch")?.addEventListener("input", e => { state.filters.txSearch = e.target.value; render(); });
  $("#filterTxType")?.addEventListener("change", e => { state.filters.txType = e.target.value; render(); });
  $("#filterTxCategory")?.addEventListener("change", e => { state.filters.txCategory = e.target.value; render(); });
  $("#filterTxAccount")?.addEventListener("change", e => { state.filters.txAccount = e.target.value; render(); });
  $("#filterTxStart")?.addEventListener("change", e => { state.filters.txStart = e.target.value; render(); });
  $("#filterTxEnd")?.addEventListener("change", e => { state.filters.txEnd = e.target.value; render(); });

  $$("[data-edit-tx]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.transaction = state.data.transactions.find(x => x.id === btn.dataset.editTx);
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));
  $$("[data-edit-budget]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.budgetItem = state.data.budgetItems.find(x => x.id === btn.dataset.editBudget);
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));
  $$("[data-edit-account]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.account = state.data.accounts.find(x => x.id === btn.dataset.editAccount);
    render();
  }));
  $$("[data-edit-category]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.category = state.data.categories.find(x => x.id === btn.dataset.editCategory);
    render();
  }));
  $$("[data-edit-tag]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.tag = state.data.tags.find(x => x.id === btn.dataset.editTag);
    render();
  }));
  $$("[data-edit-recurring]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.recurring = state.data.recurring.find(x => x.id === btn.dataset.editRecurring);
    render();
  }));
  $$("[data-edit-template]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.quickTemplate = state.data.quickTemplates.find(x => x.id === btn.dataset.editTemplate);
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));

  $$("[data-edit-card]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.creditCard = state.data.creditCards.find(x => x.id === btn.dataset.editCard);
    render();
  }));
  $$("[data-edit-loan]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.loan = state.data.loans.find(x => x.id === btn.dataset.editLoan);
    render();
  }));
  $$("[data-edit-goal]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.goal = state.data.goals.find(x => x.id === btn.dataset.editGoal);
    render();
  }));
  $$("[data-edit-year]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.year = state.data.years.find(x => x.id === btn.dataset.editYear);
    render();
  }));

  $$('[data-delete]').forEach(btn => btn.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();

    const raw = btn.getAttribute('data-delete') || '';
    const [table, id] = raw.split(':');

    if (!table || !id) {
      showAlert(`刪除失敗：刪除按鈕資料不完整。data-delete=${escapeHtml(raw)}`, 'bad');
      return;
    }

    const ok = await confirmAction('確認刪除', `確定要刪除「${tableLabel(table)}」這筆資料？刪除後無法從畫面復原。`);
    if (!ok) return;

    try {
      await removeRow(table, id);
      await loadAll();
      clearEditing();
      render();
      showAlert(`v28 驗證通過：${tableLabel(table)} 已真正從資料庫刪除。`, 'good');
    } catch (error) {
      showAlert(`刪除失敗：${escapeHtml(error.message)}`, 'bad');
    }
  }));

  $("#closeYearBtn")?.addEventListener("click", async () => {
    const ok = await confirmAction("年度結轉", `確定要關閉 ${state.selectedBudgetYear} 年，並把剩餘預算結轉到下一年？`);
    if (!ok) return;
    try {
      const { error } = await state.client.rpc("close_year_and_create_next", {
        p_budget_year: Number(state.selectedBudgetYear),
        p_create_next: true
      });
      if (error) throw new Error(error.message);
      await loadAll();
      render();
    } catch (error) {
      showAlert(`結轉失敗：${escapeHtml(error.message)}`, "bad");
    }
  });

  $("#exportCsvBtn")?.addEventListener("click", exportCurrentYearCsv);
  $("#downloadJsonBtn")?.addEventListener("click", downloadCacheJson);
}

function confirmAction(title, message) {
  const dialog = $('#confirmDialog');
  const titleEl = $('#confirmTitle');
  const messageEl = $('#confirmMessage');
  const cancelBtn = $('#confirmCancelBtn');
  const okBtn = $('#confirmOkBtn');

  if (!dialog || !titleEl || !messageEl || !cancelBtn || !okBtn || typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(`${title}

${message}`));
  }

  titleEl.textContent = title;
  messageEl.textContent = message;

  return new Promise(resolve => {
    let settled = false;
    const cleanup = () => {
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
    };
    const finish = value => {
      if (settled) return;
      settled = true;
      cleanup();
      if (dialog.open) dialog.close(value ? 'confirm' : 'cancel');
      resolve(value);
    };
    const onCancel = event => {
      event.preventDefault();
      finish(false);
    };
    const onOk = event => {
      event.preventDefault();
      finish(true);
    };
    const onClose = () => finish(dialog.returnValue === 'confirm');

    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
}

function downloadFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCurrentYearCsv() {
  const rows = applyTxFilters(transactionsForSelectedYear());
  downloadFile(`流水帳_${state.selectedBudgetYear}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

function downloadCacheJson() {
  downloadFile(`accounting_cache_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.data, null, 2), "application/json;charset=utf-8");
}

async function init() {
  if (!window.supabase || !window.APP_CONFIG) {
    setConnection(false, "前端套件未載入");
    showAlert("資料庫前端套件或設定檔未載入。請確認網路與檔案路徑。", "bad");
    return;
  }

  state.client = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

  $$(".nav-btn").forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.tab)));
  $("#refreshBtn").addEventListener("click", async () => {
    await loadAll();
    render();
  });

  $("#mobileQuickAdd")?.addEventListener("click", () => setPage("transactions"));
  $("#exportBtn").addEventListener("click", exportCurrentYearCsv);
  $("#yearSelect").addEventListener("change", e => {
    state.selectedYearId = e.target.value;
    const y = state.data.years.find(row => row.id === state.selectedYearId);
    state.selectedBudgetYear = y ? y.budget_year : new Date().getFullYear();
    clearEditing();
    render();
  });

  await loadAll();
  setPage("overview");
}

document.addEventListener("DOMContentLoaded", init);
