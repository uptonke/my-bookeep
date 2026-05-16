/* global supabase, APP_CONFIG */

const APP_VERSION = "v9";

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
    txEnd: ""
  },
  loadErrors: []
};

const pageMeta = {
  overview: ["總覽", "年度預算、現金流與近期交易"],
  transactions: ["流水帳", "新增、編輯、刪除收入 / 支出 / 轉帳"],
  budget: ["年度預算", "年度預算項目、結轉與預算使用率"],
  accounts: ["帳戶", "現金、銀行、電子支付、信用卡與其他帳戶"],
  categories: ["分類 / 標籤", "收支分類與交易標籤管理"],
  recurring: ["訂閱管理", "管理訂閱、固定扣款、下次扣款日與取消狀態｜系統版本 v9"],
  creditLoans: ["信用卡 / 貸款", "信用卡帳單與債務追蹤"],
  goals: ["目標", "儲蓄、還債、旅遊與大額購買目標"],
  reports: ["報表", "月現金流、分類支出、借貸帳與表格匯出"],
  settings: ["設定", "連線狀態、資料匯出與操作提示"]
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
  const rows = state.data.transactionView
    .filter(t => Number(t.tx_year) === Number(state.selectedBudgetYear) && t.type === "expense" && t.status !== "cancelled")
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

function getCurrentYearSummary() {
  return state.data.yearSummary.find(y => y.year_id === state.selectedYearId)
    || state.data.yearSummary.find(y => Number(y.budget_year) === Number(state.selectedBudgetYear))
    || {};
}

function transactionsForSelectedYear() {
  return state.data.transactionView.filter(t => Number(t.tx_year) === Number(state.selectedBudgetYear));
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
    creditLoans: renderCreditLoans,
    goals: renderGoals,
    reports: renderReports,
    settings: renderSettings
  };
  app.innerHTML = (renderers[state.activeTab] || renderOverview)();
  bindRenderedEvents();
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

    <div class="card">
      <div class="card-title-row">
        <h3>年度預算進度</h3>
        <span class="badge">${fmtNumber(pct, 1)}%</span>
      </div>
      <div class="${progressClass}"><span style="width:${pct}%"></span></div>
      <p class="metric-sub">可用預算 = 年度預算 + 前年盈餘結轉。支出會扣除退款，只計入狀態不是「已取消」的交易。</p>
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

    <div class="grid cols-2">
      <div class="card">
        <h3>本年分類淨支出前 8 名</h3>
        ${renderCategoryChart("expense")}
      </div>
      <div class="card">
        <h3>月現金流</h3>
        ${renderMonthlyChart()}
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

function renderTransactions() {
  const edit = state.editing.transaction;
  const defaultDate = edit?.transaction_date || today();
  const type = edit?.type || state.draftTxType || "expense";
  const rows = applyTxFilters(transactionsForSelectedYear());

  return `
    <div class="card">
      <h3>${edit ? "編輯交易" : "新增交易"}</h3>
      <form id="txForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("日期", `<input class="input" type="date" name="transaction_date" value="${escapeHtml(defaultDate)}" required>`)}
        ${field("類型", `<select class="input" name="type" id="txTypeInput" required>
          <option value="expense" ${type === "expense" ? "selected" : ""}>支出</option>
          <option value="refund" ${type === "refund" ? "selected" : ""}>退款</option>
          <option value="income" ${type === "income" ? "selected" : ""}>收入</option>
          <option value="transfer" ${type === "transfer" ? "selected" : ""}>轉帳</option>
        </select>`)}
        ${field("金額", `<input class="input" type="number" min="0" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required>`)}
        ${field("帳戶", `<select class="input" name="account_id" required>${accountOptions(edit?.account_id || "")}</select>`)}
        ${field("轉入帳戶", `<select class="input" name="to_account_id">${accountOptions(edit?.to_account_id || "")}</select>`)}
        ${field("分類", `<select class="input" name="category_id">${categoryOptions(type, edit?.category_id || "")}</select>`)}
        ${field("預算項目", `<select class="input" name="budget_item_id">${budgetItemOptions(edit?.budget_item_id || "")}</select>`)}
        ${field("關聯原支出", `<select class="input" name="related_transaction_id">${expenseTransactionOptions(edit?.related_transaction_id || "")}</select>`)}
        ${field("商家 / 對象", `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}" placeholder="例：威秀、家樂福、薪資、退票退款">`)}
        ${field("付款方式", `<input class="input" name="payment_method" value="${escapeHtml(edit?.payment_method || "")}" placeholder="現金 / 信用卡 / 轉帳">`)}
        ${field("必要程度", `<select class="input" name="necessity_level">
          ${selectOpts(["survival","quality","luxury","investment","other"], edit?.necessity_level || "other")}
        </select>`)}
        ${field("現金流性質", `<select class="input" name="cashflow_nature">
          ${selectOpts(["fixed","variable","one_time"], edit?.cashflow_nature || "variable")}
        </select>`)}
        ${field("狀態", `<select class="input" name="status">
          ${selectOpts(["cleared","pending","cancelled"], edit?.status || "cleared")}
        </select>`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="備註，例如：退票、聚餐、帳單說明">${escapeHtml(edit?.note || "")}</textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : "新增交易"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="transaction">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3>流水帳</h3>
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
  return `
    <div class="table-wrap">
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
              <td><span class="badge">${escapeHtml(labelOf(t.status))}</span></td>
              <td class="actions">
                <button class="btn small secondary" data-edit-tx="${t.id}">編輯</button>
                <button class="btn small danger" data-delete="transactions:${t.id}">刪除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBudget() {
  const editYear = state.editing.year;
  const editItem = state.editing.budgetItem;
  const current = getCurrentYearSummary();
  const items = state.data.budgetSummary.filter(i => i.year_id === state.selectedYearId);
  return `
    <div class="grid cols-3">
      ${metricCard("年度預算", fmtMoney(current.annual_budget), `結轉 ${fmtMoney(current.carryover_from_previous)}`)}
      ${metricCard("已用預算", fmtMoney(current.actual_expense), `${fmtNumber(current.budget_used_pct, 1)}%`, "bad")}
      ${metricCard("剩餘預算", fmtMoney(current.remaining_budget), Number(current.remaining_budget || 0) >= 0 ? "預算內" : "超支", Number(current.remaining_budget || 0) >= 0 ? "good" : "bad")}
    </div>

    <div class="card">
      <h3>${editYear ? "編輯年度" : "新增 / 更新年度"}</h3>
      <form id="yearForm" class="form-grid">
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
          <button class="btn danger" type="button" data-delete="years:${state.selectedYearId}">刪除目前年度</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h3>${editItem ? "編輯預算項目" : "新增預算項目"}</h3>
      <form id="budgetItemForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(editItem?.id || "")}">
        ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editItem?.name || "")}" required placeholder="例：年度娛樂預算">`)}
        ${field("類型", `<select class="input" name="item_type">${selectOpts(["expense","income","saving","other"], editItem?.item_type || "expense")}</select>`)}
        ${field("金額", `<input class="input" type="number" step="1" name="planned_amount" value="${escapeHtml(editItem?.planned_amount || "")}" required>`)}
        ${field("分類", `<select class="input" name="category_id">${categoryOptions(editItem?.item_type || "expense", editItem?.category_id || "")}</select>`)}
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
        <div class="wide btn-row">
          <button class="btn" type="submit">${editItem ? "儲存修改" : "新增項目"}</button>
          ${editItem ? `<button class="btn secondary" type="button" data-cancel-edit="budgetItem">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-title-row"><h3>預算項目</h3><span class="badge">${items.length} 項</span></div>
      ${renderBudgetItemTable(items)}
    </div>
  `;
}

function renderBudgetItemTable(rows) {
  if (!rows.length) return `<div class="empty">尚無預算項目</div>`;
  return `
    <div class="table-wrap">
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
                  <button class="btn small danger" data-delete="budget_items:${i.budget_item_id}">刪除</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
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
                <button class="btn small danger" data-delete="accounts:${a.id}">刪除</button>
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
              <button class="btn small danger" data-delete="categories:${c.id}">刪除</button>
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
              <button class="btn small danger" data-delete="tags:${t.id}">刪除</button>
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
      <p class="metric-sub">目前前端版本：v9。如果你看不到 v9，代表 GitHub Pages 或瀏覽器還在用舊版。</p>
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
              <button class="btn small danger" data-delete="recurring_transactions:${r.id}">刪除</button>
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
            <button class="btn small danger" data-delete="credit_cards:${c.id}">刪除</button>
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
            <button class="btn small danger" data-delete="loans:${l.id}">刪除</button>
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
              <button class="btn small danger" data-delete="goals:${g.id}">刪除</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReports() {
  return `
    <div class="grid cols-2">
      <div class="card"><h3>分類淨支出</h3>${renderCategoryChart("expense", 14)}</div>
      <div class="card"><h3>月現金流</h3>${renderMonthlyChart(14)}</div>
    </div>
    <div class="card">
      <h3>借貸帳</h3>
      <p class="metric-sub">支出：借記費用、貸記資產；退款：借記資產、貸記費用退款；收入：借記資產、貸記收入；轉帳：借記轉入資產、貸記轉出資產。</p>
      ${renderTAccountTable()}
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

async function upsert(table, payload) {
  const clean = { ...payload };
  Object.keys(clean).forEach(k => clean[k] === undefined && delete clean[k]);

  const query = clean.id
    ? state.client.from(table).upsert(clean).select("*").single()
    : state.client.from(table).insert(clean).select("*").single();

  const { data, error } = await query;
  if (error) throw new Error(formatSupabaseError(error));
  return assertSavedRow(table, data, clean.id ? "更新" : "新增");
}

async function insert(table, payload) {
  const clean = Array.isArray(payload) ? payload : [payload];
  const { data, error } = await state.client.from(table).insert(clean).select("*");
  if (error) throw new Error(formatSupabaseError(error));
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`新增失敗：資料庫沒有回傳新增資料。表：${table}`);
  }
  data.forEach(row => assertSavedRow(table, row, "新增"));
  return Array.isArray(payload) ? data : data[0];
}

async function removeRow(table, id) {
  const { error } = await state.client.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    if (form.id === "txForm") await saveTransaction(form);
    if (form.id === "yearForm") await saveYear(form);
    if (form.id === "budgetItemForm") await saveBudgetItem(form);
    if (form.id === "accountForm") await saveAccount(form);
    if (form.id === "categoryForm") await saveCategory(form);
    if (form.id === "tagForm") await saveTag(form);
    if (form.id === "recurringForm") {
      throw new Error("訂閱表單不應進入通用儲存流程。請確認目前前端版本為 v9。");
    }
    if (form.id === "creditCardForm") await saveCreditCard(form);
    if (form.id === "loanForm") await saveLoan(form);
    if (form.id === "goalForm") await saveGoal(form);
    await loadAll();
    clearEditing();
    render();
    showAlert("v9 驗證通過：已寫入資料庫。", "good");
  } catch (error) {
    showAlert(`儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const saved = await saveRecurring(form);
    const rows = await loadRecurringOnly();
    const found = rows.some(row => String(row.id) === String(saved.id));

    if (!found) {
      throw new Error(`v9 驗證失敗：寫入後重新讀取列表，找不到 id=${saved.id || "無"}。目前列表 ${rows.length} 筆。`);
    }

    state.editing.recurring = null;
    render();
    showAlert(`v9 驗證通過：訂閱已真正寫入資料庫｜${escapeHtml(saved.name)}｜目前列表 ${rows.length} 筆。`, "good");
  } catch (error) {
    showAlert(`訂閱儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}

async function saveTransaction(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    transaction_date: d.transaction_date,
    type: d.type,
    account_id: d.account_id,
    to_account_id: d.type === "transfer" ? d.to_account_id : null,
    category_id: d.category_id || null,
    budget_item_id: d.budget_item_id || null,
    related_transaction_id: d.related_transaction_id || null,
    amount: numberOrZero(d.amount),
    merchant: d.merchant,
    payment_method: d.payment_method,
    note: d.note,
    status: d.status || "cleared",
    necessity_level: d.necessity_level || "other",
    cashflow_nature: d.cashflow_nature || "variable",
    control_level: d.control_level || "controllable"
  };
  await upsert("transactions", payload);
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
  const row = await upsert("years", payload);
  state.selectedYearId = row.id;
  state.selectedBudgetYear = row.budget_year;
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
  await upsert("budget_items", payload);
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
  await upsert("accounts", payload);
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
  await upsert("categories", payload);
}

async function saveTag(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    color: d.color,
    note: d.note
  };
  await upsert("tags", payload);
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

  let response;
  if (d.id) {
    response = await state.client
      .from("recurring_transactions")
      .update(payload)
      .eq("id", d.id)
      .select("*")
      .single();
  } else {
    response = await state.client
      .from("recurring_transactions")
      .insert(payload)
      .select("*")
      .single();
  }

  if (response.error) {
    throw new Error(`訂閱寫入失敗：${formatSupabaseError(response.error)}`);
  }

  const saved = assertSavedRow("recurring_transactions", response.data, d.id ? "訂閱更新" : "訂閱新增");

  const verify = await state.client
    .from("recurring_transactions")
    .select("*")
    .eq("id", saved.id)
    .maybeSingle();

  if (verify.error) {
    throw new Error(`訂閱驗證讀取失敗：${formatSupabaseError(verify.error)}`);
  }
  if (!verify.data || !verify.data.id) {
    throw new Error(`訂閱寫入後驗證失敗：找不到 id=${saved.id} 的資料。`);
  }

  return verify.data;
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
  await upsert("credit_cards", payload);
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
  await upsert("loans", payload);
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
  await upsert("goals", payload);
}

function clearEditing() {
  Object.keys(state.editing).forEach(k => state.editing[k] = null);
}

function bindRenderedEvents() {
  $("#recurringForm")?.addEventListener("submit", handleRecurringSubmit);
  $$("form").filter(form => form.id !== "recurringForm").forEach(form => form.addEventListener("submit", handleSubmit));

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

  $$("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
    const [table, id] = btn.dataset.delete.split(":");
    const ok = await confirmAction("確認刪除", `確定要刪除「${tableLabel(table)}」這筆資料？刪除後無法從畫面復原。`);
    if (!ok) return;
    try {
      await removeRow(table, id);
      await loadAll();
      clearEditing();
      render();
    } catch (error) {
      showAlert(`刪除失敗：${escapeHtml(error.message)}`, "bad");
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
  const dialog = $("#confirmDialog");
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
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
