/* global supabase, APP_CONFIG */

const APP_VERSION = "v31";
const chartInstances = {};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  client: null,
  activeTab: "overview",
  loading: false,
  alertTimer: null,
  selectedYearId: null,
  selectedBudgetYear: new Date().getFullYear(),
  draftTxType: "expense",
  draftRecurringType: "expense",
  budgetOperationMode: "globalContribution",
  reportChartMode: "categoryExpense",
  reportTableMode: "pnl",
  reportAuditMode: "budgetReality",
  data: {
    years: [],
    accounts: [],
    categories: [],
    tags: [],
    budgetItems: [],
    budgetContributions: [],
    budgetMovements: [],
    transactionEntries: [],
    transactionSplits: [],
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
    budgetContribution: null,
    budgetMovement: null,
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
  loadErrors: [],
  dbStatus: {
    connected: false,
    connectionText: "尚未連線",
    lastReadAt: null,
    lastReadOk: null,
    lastReadError: "",
    lastWriteAt: null,
    lastWriteOk: null,
    lastWriteAction: "",
    lastWriteTable: "",
    lastWriteError: ""
  }
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

  annual_total: "年度總額",
  monthly_contribution: "月提撥",
  record_start: "記帳開始月",
  calendar_year: "1 月開始",

  none: "無",
  carryover: "餘額結轉",
  overspend_to_next: "超支帶入下期",
  manual: "手動",
  month_close: "月底關帳",

  cash: "現金",
  bank: "銀行",
  e_wallet: "電子支付",
  credit_card: "信用卡",
  loan: "貸款",
  asset: "資產",
  asset_adjustment: "資產調整",

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
  budget_contributions: "預算提撥",
  budget_movements: "預算移轉",
  transactions: "交易",
  transaction_entries: "分錄",
  transaction_splits: "拆帳",
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


function appPreference(key, fallback = "") {
  try { return localStorage.getItem(`accounting_${key}`) || fallback; } catch (error) { return fallback; }
}

function setAppPreference(key, value) {
  try { localStorage.setItem(`accounting_${key}`, value || ""); } catch (error) { console.warn(error); }
}


function accountCoverageMode(note = "") {
  const m = String(note || "").match(/\[coverage:(auto|cash|liability|exclude)\]/);
  return m ? m[1] : "auto";
}

function stripAccountCoverageMarker(note = "") {
  return String(note || "").replace(/\s*\[coverage:(auto|cash|liability|exclude)\]\s*/g, "").trim();
}

function applyAccountCoverageMarker(note = "", mode = "auto") {
  const cleaned = stripAccountCoverageMarker(note);
  if (!mode || mode === "auto") return cleaned;
  return `${cleaned}${cleaned ? "\n" : ""}[coverage:${mode}]`;
}

function accountCoverageLabel(mode = "auto") {
  const map = {
    auto: "自動判斷",
    cash: "列入現金覆蓋",
    liability: "列為負債扣項",
    exclude: "不列入"
  };
  return map[mode] || "自動判斷";
}

function accountCoverageSelect(selected = "auto") {
  return `
    <select class="input" name="coverage_mode">
      <option value="auto" ${selected === "auto" ? "selected" : ""}>自動判斷</option>
      <option value="cash" ${selected === "cash" ? "selected" : ""}>列入現金覆蓋</option>
      <option value="liability" ${selected === "liability" ? "selected" : ""}>列為負債扣項</option>
      <option value="exclude" ${selected === "exclude" ? "selected" : ""}>不列入</option>
    </select>
  `;
}

function defaultAccountIdFor(type = "expense") {
  return appPreference(`default_account_${type}`, appPreference("default_account_expense", ""));
}

function showAlert(message, type = "warn", options = {}) {
  const box = $("#alertBox");
  if (state.alertTimer) {
    clearTimeout(state.alertTimer);
    state.alertTimer = null;
  }

  box.className = `alert ${type === "bad" ? "bad" : type === "good" ? "good" : ""}`;
  box.innerHTML = message;

  if (!message) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");

  // 成功提示不要永久黏在頁面上；錯誤提示保留，避免漏看。
  if (type === "good" && options.sticky !== true) {
    state.alertTimer = setTimeout(() => {
      box.classList.add("hidden");
      box.innerHTML = "";
      state.alertTimer = null;
    }, options.timeout || 3500);
  }
}

function syncPageChrome() {
  const tab = pageMeta[state.activeTab] ? state.activeTab : "overview";
  state.activeTab = tab;
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  const [title, subtitle] = pageMeta[tab] || pageMeta.overview;
  $("#pageTitle").textContent = title;
  $("#pageSubtitle").textContent = subtitle;
}

function setConnection(ok, text) {
  state.dbStatus.connected = Boolean(ok);
  state.dbStatus.connectionText = text || (ok ? "已連線" : "未連線");

  const dot = $("#connectionDot");
  const status = $("#connectionStatus");
  if (!dot || !status) return;

  const write = state.dbStatus.lastWriteOk === true
    ? "｜最後寫入成功"
    : state.dbStatus.lastWriteOk === false
      ? "｜最後寫入失敗"
      : "";
  dot.className = `status-dot ${ok ? "ok" : "bad"}`;
  status.textContent = ok ? `資料庫：已連線${write}` : `資料庫：${text || "未連線"}`;
}

function shortDateTime(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function markReadStatus(ok, error = "") {
  state.dbStatus.lastReadAt = new Date().toISOString();
  state.dbStatus.lastReadOk = Boolean(ok);
  state.dbStatus.lastReadError = error || "";
  setConnection(Boolean(ok), ok ? "已連線" : "讀取失敗");
}

function markWriteStatus(ok, { action = "", table = "", error = "" } = {}) {
  state.dbStatus.lastWriteAt = new Date().toISOString();
  state.dbStatus.lastWriteOk = Boolean(ok);
  state.dbStatus.lastWriteAction = action || "";
  state.dbStatus.lastWriteTable = table || "";
  state.dbStatus.lastWriteError = error || "";
  setConnection(state.dbStatus.connected, state.dbStatus.connectionText || "已連線");
}

function renderDatabaseStatusCard() {
  const s = state.dbStatus;
  const connectedText = s.connected ? "已連線" : s.connectionText || "未連線";
  const readText = s.lastReadOk === true
    ? `成功｜${shortDateTime(s.lastReadAt)}`
    : s.lastReadOk === false
      ? `失敗｜${shortDateTime(s.lastReadAt)}`
      : "N/A";
  const writeText = s.lastWriteOk === true
    ? `成功｜${shortDateTime(s.lastWriteAt)}${s.lastWriteTable ? `｜${tableLabel(s.lastWriteTable)}` : ""}`
    : s.lastWriteOk === false
      ? `失敗｜${shortDateTime(s.lastWriteAt)}${s.lastWriteTable ? `｜${tableLabel(s.lastWriteTable)}` : ""}`
      : "N/A";

  return `
    <div class="card database-status-card">
      <div class="card-title-row">
        <h3>資料庫狀態</h3>
        <span class="badge ${s.connected ? "good" : "bad"}">${escapeHtml(connectedText)}</span>
      </div>
      <div class="grid cols-3">
        ${metricCard("連線", escapeHtml(connectedText), "資料庫連線狀態", s.connected ? "good" : "bad")}
        ${metricCard("最後讀取", escapeHtml(readText), s.lastReadError ? escapeHtml(s.lastReadError) : "讀取資料表 / 檢視表")}
        ${metricCard("最後寫入", escapeHtml(writeText), s.lastWriteError ? escapeHtml(s.lastWriteError) : "新增 / 修改 / 刪除驗證")}
      </div>
      <p class="metric-sub">已整合連線與寫入狀態；錯誤時才顯示資料表與錯誤細節。</p>
    </div>
  `;
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


function selectedYearFirstTransactionMonth() {
  const months = transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .map(t => Number(t.tx_month || 0))
    .filter(m => m >= 1 && m <= 12);
  return months.length ? Math.min(...months) : null;
}

function yearBudgetContributionCount(year = {}) {
  const budgetYear = Number(year.budget_year || state.selectedBudgetYear);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if ((year.budget_mode || "annual_total") !== "monthly_contribution") return 1;
  if (budgetYear > currentYear) return 0;

  const startMonth = selectedYearFirstTransactionMonth() || (budgetYear === currentYear ? currentMonth : 1);
  const endMonth = budgetYear === currentYear ? currentMonth : 12;

  return Math.max(0, endMonth - startMonth + 1);
}

function yearBudgetModeLabel(summary) {
  return `全局提撥 ${summary.contribution_count || 0} 筆｜提撥累積 ${fmtMoney(summary.current_period_budget || 0)}`;
}


function selectedYearRecord() {
  return state.data.years.find(y => y.id === state.selectedYearId)
    || state.data.years.find(y => Number(y.budget_year) === Number(state.selectedBudgetYear))
    || {};
}

function globalBudgetContributionRowsFromNote(note = "") {
  const match = String(note || "").match(/\[global_budget_contributions:([^\]]*)\]/);
  if (!match) return [];
  try {
    const rows = JSON.parse(decodeURIComponent(match[1]));
    if (!Array.isArray(rows)) return [];
    return rows
      .map(r => ({
        id: String(r.id || ""),
        contribution_date: String(r.contribution_date || ""),
        amount: Number(r.amount || 0),
        note: String(r.note || "")
      }))
      .filter(r => r.id && r.contribution_date && Number.isFinite(r.amount));
  } catch (error) {
    console.warn("global budget contributions parse failed", error);
    return [];
  }
}

function stripGlobalBudgetContributionsMarker(note = "") {
  return String(note || "").replace(/\s*\[global_budget_contributions:[^\]]*\]\s*/g, "").trim();
}

function applyGlobalBudgetContributionsMarker(note = "", rows = []) {
  const cleaned = stripGlobalBudgetContributionsMarker(note);
  const normalized = (rows || [])
    .map(r => ({
      id: String(r.id || ""),
      contribution_date: String(r.contribution_date || ""),
      amount: Number(r.amount || 0),
      note: String(r.note || "")
    }))
    .filter(r => r.id && r.contribution_date && Number.isFinite(r.amount));
  if (!normalized.length) return cleaned;
  const marker = `[global_budget_contributions:${encodeURIComponent(JSON.stringify(normalized))}]`;
  return `${cleaned}${cleaned ? "\n" : ""}${marker}`;
}

function globalBudgetContributionRowsForYear(year = selectedYearRecord()) {
  return globalBudgetContributionRowsFromNote(year?.note || "")
    .filter(r => contributionYear(r.contribution_date) === Number(year?.budget_year || state.selectedBudgetYear))
    .sort((a, b) => String(b.contribution_date || "").localeCompare(String(a.contribution_date || "")));
}

function globalBudgetContributionRowsForSelectedYear() {
  return globalBudgetContributionRowsForYear(selectedYearRecord());
}

function globalBudgetContributionTotalForYear(year = selectedYearRecord()) {
  return globalBudgetContributionRowsForYear(year).reduce((sum, r) => sum + Number(r.amount || 0), 0);
}

function globalBudgetContributionCountForYear(year = selectedYearRecord()) {
  return globalBudgetContributionRowsForYear(year).length;
}

function makeClientId(prefix = "gcontrib") {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function updateSelectedYearGlobalContributions(rows, userNote = null) {
  const year = selectedYearRecord();
  if (!year?.id) throw new Error("找不到目前年度，請先儲存年度設定。");
  const baseNote = userNote === null ? stripGlobalBudgetContributionsMarker(year.note || "") : userNote;
  const cleanRows = (rows || []).sort((a, b) => String(a.contribution_date || "").localeCompare(String(b.contribution_date || "")));
  const note = applyGlobalBudgetContributionsMarker(baseNote, cleanRows);
  const total = cleanRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const saved = await upsert("years", {
    ...year,
    budget_mode: "monthly_contribution",
    monthly_budget: 0,
    annual_budget: total,
    note
  }, { expect: { budget_year: Number(year.budget_year || state.selectedBudgetYear) } });
  return saved;
}

function getCurrentYearSummary() {
  const year = selectedYearRecord();
  const txRows = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  const actual_income = txRows.reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount || 0) : 0), 0);
  const gross_expense = txRows.reduce((sum, t) => sum + (t.type === "expense" ? Number(t.amount || 0) : 0), 0);
  const refund = txRows.reduce((sum, t) => sum + (t.type === "refund" ? Number(t.amount || 0) : 0), 0);
  const actual_expense = gross_expense - refund;

  // v50：全局年度預算改用實際提撥紀錄制，不再使用「每次提撥金額 × 次數」。
  const budget_mode = "monthly_contribution";
  const monthly_budget = 0;
  const contribution_count = globalBudgetContributionCountForYear(year);
  const annual_budget = globalBudgetContributionTotalForYear(year);
  const current_period_budget = annual_budget;

  const carryover_from_previous = Number(year.carryover_from_previous || 0);
  const available_budget = current_period_budget + carryover_from_previous;
  const remaining_budget = available_budget - actual_expense;

  return {
    year_id: year.id,
    budget_year: year.budget_year || state.selectedBudgetYear,
    name: year.name || `${state.selectedBudgetYear} 年度預算`,
    budget_mode,
    monthly_budget,
    contribution_count,
    annual_budget,
    current_period_budget,
    carryover_from_previous,
    available_budget,
    actual_income,
    actual_expense,
    net_cashflow: actual_income - actual_expense,
    remaining_budget,
    budget_used_pct: available_budget ? Math.round(actual_expense / available_budget * 10000) / 100 : 0,
    is_closed: year.is_closed,
    note: stripGlobalBudgetContributionsMarker(year.note || "")
  };
}

function budgetIsAnnualRolloverMode(item) {
  return item?.period_type === "annual" && item?.rollover_mode === "carryover";
}

function budgetIsContributionMode(item) {
  return item?.rollover_mode === "carryover" && ["monthly", "weekly", "custom"].includes(item?.period_type);
}

function budgetModeKind(item) {
  if (budgetIsAnnualRolloverMode(item)) return "annual_rollover";
  if (budgetIsContributionMode(item)) return "contribution";
  return "fixed";
}

function budgetModeName(item) {
  const kind = budgetModeKind(item);
  if (kind === "annual_rollover") return "年度結轉型";
  if (kind === "contribution") return "提撥型";
  return "固定型";
}

function budgetContributionEligible(item) {
  return budgetIsContributionMode(item) || budgetIsAnnualRolloverMode(item);
}

function budgetContributionCount(item) {
  const year = Number(state.selectedBudgetYear);
  const now = new Date();
  const currentYear = now.getFullYear();

  if (!budgetIsContributionMode(item)) return 1;
  if (year > currentYear) return 0;

  const period = item.period_type || "monthly";
  const startDate = item.start_date ? new Date(`${item.start_date}T00:00:00`) : new Date(year, 0, 1);
  const endDate = year === currentYear ? now : new Date(year, 11, 31);

  if (endDate < startDate) return 0;

  if (period === "monthly") {
    return Math.max(1, (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1);
  }

  if (period === "weekly") {
    const diffDays = Math.floor((endDate - startDate) / 86400000) + 1;
    return Math.max(1, Math.ceil(diffDays / 7));
  }

  return 1;
}


function contributionYear(dateValue) {
  return dateValue ? Number(String(dateValue).slice(0, 4)) : null;
}

function isBudgetClosureContribution(c) {
  return String(c?.note || "").startsWith("[CLOSE]");
}

function contributionsForBudgetItem(itemId) {
  return (state.data.budgetContributions || [])
    .filter(c => c.budget_item_id === itemId)
    .filter(c => contributionYear(c.contribution_date) === Number(state.selectedBudgetYear))
    .filter(c => !isBudgetClosureContribution(c));
}

function budgetClosureEventsForBudgetItem(itemId) {
  return (state.data.budgetContributions || [])
    .filter(c => c.budget_item_id === itemId)
    .filter(c => contributionYear(c.contribution_date) === Number(state.selectedBudgetYear))
    .filter(c => isBudgetClosureContribution(c))
    .sort((a, b) => String(a.contribution_date || "").localeCompare(String(b.contribution_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

function latestBudgetClosure(itemId) {
  const rows = budgetClosureEventsForBudgetItem(itemId);
  return rows.length ? rows[rows.length - 1] : null;
}

function isAfterBudgetClosure(dateValue, closure) {
  if (!closure) return true;
  if (!dateValue) return false;
  return String(dateValue) > String(closure.contribution_date || "");
}

function budgetClosureCarryAmount(closure) {
  return closure ? Number(closure.amount || 0) : 0;
}

function budgetContributionTotal(itemId) {
  return contributionsForBudgetItem(itemId).reduce((sum, c) => sum + Number(c.amount || 0), 0);
}

function budgetContributionCountActual(itemId) {
  return contributionsForBudgetItem(itemId).length;
}

function budgetCurrentAvailableAmount(item) {
  const movementNet = budgetMovementNet(item.id || item.budget_item_id);
  if (budgetIsContributionMode(item)) return budgetContributionTotal(item.id || item.budget_item_id) + movementNet;
  return Number(item?.planned_amount || 0) + movementNet;
}

function budgetFundingLabel(item) {
  const itemId = item.id || item.budget_item_id;
  if (budgetIsAnnualRolloverMode(item)) {
    return `年度新增 ${fmtMoney(item?.planned_amount || 0)} + 結轉/提撥 ${fmtMoney(budgetContributionTotal(itemId))}`;
  }
  if (budgetIsContributionMode(item)) {
    return `實際提撥 ${budgetContributionCountActual(itemId)} 筆，累積 ${fmtMoney(budgetContributionTotal(itemId))}`;
  }
  if (item?.period_type && item.period_type !== "annual") {
    return `${labelOf(item.period_type)} ${fmtMoney(item.planned_amount)}`;
  }
  return `固定預算 ${fmtMoney(item?.planned_amount || 0)}`;
}

function budgetAvailableLabel(item) {
  if (budgetIsAnnualRolloverMode(item)) return `年度可用 ${fmtMoney(item.current_budget_amount || 0)}`;
  if (budgetIsContributionMode(item)) return `累積提撥 ${fmtMoney(item.current_budget_amount || 0)}`;
  return `預算 ${fmtMoney(item.current_budget_amount || item.planned_amount || 0)}`;
}


function movementsForBudgetItem(itemId) {
  return (state.data.budgetMovements || [])
    .filter(m => contributionYear(m.movement_date) === Number(state.selectedBudgetYear))
    .filter(m => m.from_budget_item_id === itemId || m.to_budget_item_id === itemId);
}

function budgetMovementInTotal(itemId) {
  return movementsForBudgetItem(itemId)
    .filter(m => m.to_budget_item_id === itemId)
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);
}

function budgetMovementOutTotal(itemId) {
  return movementsForBudgetItem(itemId)
    .filter(m => m.from_budget_item_id === itemId)
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);
}

function budgetMovementNet(itemId) {
  return budgetMovementInTotal(itemId) - budgetMovementOutTotal(itemId);
}


function currentBudgetMonth() {
  const now = new Date();
  const selectedYear = Number(state.selectedBudgetYear);
  if (selectedYear === now.getFullYear()) return now.getMonth() + 1;

  const txMonths = transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .map(t => Number(t.tx_month || 0))
    .filter(m => m >= 1 && m <= 12);

  const contributionMonths = (state.data.budgetContributions || [])
    .filter(c => contributionYear(c.contribution_date) === selectedYear)
    .map(c => Number(String(c.contribution_date || "").slice(5, 7)))
    .filter(m => m >= 1 && m <= 12);

  const movementMonths = (state.data.budgetMovements || [])
    .filter(m => contributionYear(m.movement_date) === selectedYear)
    .map(m => Number(String(m.movement_date || "").slice(5, 7)))
    .filter(m => m >= 1 && m <= 12);

  const months = [...txMonths, ...contributionMonths, ...movementMonths];
  return months.length ? Math.max(...months) : 12;
}

function isCurrentBudgetMonth(dateValue) {
  if (!dateValue) return false;
  return contributionYear(dateValue) === Number(state.selectedBudgetYear)
    && Number(String(dateValue).slice(5, 7)) === currentBudgetMonth();
}

function txRowsForBudgetItem(itemId) {
  return transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .filter(t => t.budget_item_id === itemId);
}

function actualForBudgetItem(item, scope = "year", closure = null) {
  return txRowsForBudgetItem(item.id || item.budget_item_id).reduce((sum, t) => {
    if (scope === "month" && Number(t.tx_month || 0) !== currentBudgetMonth()) return sum;
    if (scope === "cycle" && !isAfterBudgetClosure(t.transaction_date, closure)) return sum;
    if (item.item_type === "expense" && t.type === "refund") return sum - Number(t.amount || 0);
    if (t.type === item.item_type) return sum + Number(t.amount || 0);
    return sum;
  }, 0);
}

function contributionsForBudgetItemInScope(itemId, scope = "year", closure = null) {
  return contributionsForBudgetItem(itemId)
    .filter(c => scope !== "month" || isCurrentBudgetMonth(c.contribution_date))
    .filter(c => scope !== "cycle" || isAfterBudgetClosure(c.contribution_date, closure));
}

function budgetContributionTotalInScope(itemId, scope = "year", closure = null) {
  return contributionsForBudgetItemInScope(itemId, scope, closure).reduce((sum, c) => sum + Number(c.amount || 0), 0);
}

function budgetContributionCountInScope(itemId, scope = "year", closure = null) {
  return contributionsForBudgetItemInScope(itemId, scope, closure).length;
}

function movementsForBudgetItemInScope(itemId, scope = "year", closure = null) {
  return movementsForBudgetItem(itemId)
    .filter(m => scope !== "month" || isCurrentBudgetMonth(m.movement_date))
    .filter(m => scope !== "cycle" || isAfterBudgetClosure(m.movement_date, closure));
}

function budgetMovementInTotalInScope(itemId, scope = "year", closure = null) {
  return movementsForBudgetItemInScope(itemId, scope, closure)
    .filter(m => m.to_budget_item_id === itemId)
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);
}

function budgetMovementOutTotalInScope(itemId, scope = "year", closure = null) {
  return movementsForBudgetItemInScope(itemId, scope, closure)
    .filter(m => m.from_budget_item_id === itemId)
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);
}

function budgetMovementNetInScope(itemId, scope = "year", closure = null) {
  return budgetMovementInTotalInScope(itemId, scope, closure) - budgetMovementOutTotalInScope(itemId, scope, closure);
}

function budgetAvailableForScope(item, scope = "year", closure = null) {
  const itemId = item.id || item.budget_item_id;
  const movementNet = budgetMovementNetInScope(itemId, scope, closure);

  if (scope === "cycle") {
    return budgetClosureCarryAmount(closure) + budgetContributionTotalInScope(itemId, scope, closure) + movementNet;
  }

  if (budgetIsAnnualRolloverMode(item)) {
    // 年度結轉型：今年新增預算 + 今年收到的前期結轉/加碼提撥 + 預算移轉 - 今年實際。
    // 實際花費由 selectedBudgetYear 控制，跨年後自然歸 0。
    return Number(item.planned_amount || 0) + budgetContributionTotalInScope(itemId, scope) + movementNet;
  }

  if (budgetIsContributionMode(item)) {
    return budgetContributionTotalInScope(itemId, scope) + movementNet;
  }

  if (scope === "month" && item.period_type === "monthly") {
    return Number(item.planned_amount || 0) + movementNet;
  }

  return Number(item.planned_amount || 0) + movementNet;
}

function budgetPrimaryScope(item, closure = null) {
  if (closure) return "cycle";
  return item?.period_type === "monthly" ? "month" : "year";
}

function budgetScopeLabel(scope) {
  if (scope === "month") return `${currentBudgetMonth()}月`;
  if (scope === "cycle") return "本週期";
  return "年度累積";
}

function budgetItemSummariesForSelectedYear() {
  return (state.data.budgetItems || [])
    .filter(i => i.year_id === state.selectedYearId)
    .map(i => {
      const category = state.data.categories.find(c => c.id === i.category_id) || {};
      const planned_amount = Number(i.planned_amount || 0);
      const is_contribution_mode = budgetIsContributionMode(i);
      const is_annual_rollover_mode = budgetIsAnnualRolloverMode(i);
      const mode_kind = budgetModeKind(i);
      const latest_closure = latestBudgetClosure(i.id);
      const primary_scope = budgetPrimaryScope(i, latest_closure);

      const year_contribution_count = budgetContributionEligible(i) ? budgetContributionCountInScope(i.id, "year") : budgetContributionCount(i);
      const month_contribution_count = budgetContributionEligible(i) ? budgetContributionCountInScope(i.id, "month") : 0;
      const year_contribution_total = budgetContributionEligible(i) ? budgetContributionTotalInScope(i.id, "year") : 0;
      const month_contribution_total = budgetContributionEligible(i) ? budgetContributionTotalInScope(i.id, "month") : 0;

      const year_movement_in = budgetMovementInTotalInScope(i.id, "year");
      const year_movement_out = budgetMovementOutTotalInScope(i.id, "year");
      const year_movement_net = year_movement_in - year_movement_out;
      const month_movement_in = budgetMovementInTotalInScope(i.id, "month");
      const month_movement_out = budgetMovementOutTotalInScope(i.id, "month");
      const month_movement_net = month_movement_in - month_movement_out;

      const cycle_contribution_count = latest_closure ? budgetContributionCountInScope(i.id, "cycle", latest_closure) : 0;
      const cycle_contribution_total = latest_closure ? budgetContributionTotalInScope(i.id, "cycle", latest_closure) : 0;
      const cycle_movement_in = latest_closure ? budgetMovementInTotalInScope(i.id, "cycle", latest_closure) : 0;
      const cycle_movement_out = latest_closure ? budgetMovementOutTotalInScope(i.id, "cycle", latest_closure) : 0;
      const cycle_movement_net = cycle_movement_in - cycle_movement_out;

      const year_budget_amount = budgetAvailableForScope(i, "year");
      const month_budget_amount = budgetAvailableForScope(i, "month");
      const cycle_budget_amount = latest_closure ? budgetAvailableForScope(i, "cycle", latest_closure) : 0;
      const year_actual_amount = actualForBudgetItem(i, "year");
      const month_actual_amount = actualForBudgetItem(i, "month");
      const cycle_actual_amount = latest_closure ? actualForBudgetItem(i, "cycle", latest_closure) : 0;
      const year_remaining_amount = year_budget_amount - year_actual_amount;
      const month_remaining_amount = month_budget_amount - month_actual_amount;
      const cycle_remaining_amount = cycle_budget_amount - cycle_actual_amount;

      const current_budget_amount = primary_scope === "cycle" ? cycle_budget_amount : primary_scope === "month" ? month_budget_amount : year_budget_amount;
      const actual_amount = primary_scope === "cycle" ? cycle_actual_amount : primary_scope === "month" ? month_actual_amount : year_actual_amount;
      const remaining_amount = current_budget_amount - actual_amount;

      return {
        ...i,
        budget_item_id: i.id,
        budget_year: state.selectedBudgetYear,
        category_name: category.name || "",
        category_type: category.type || "",
        planned_amount,
        primary_scope,
        scope_label: budgetScopeLabel(primary_scope),
        current_month: currentBudgetMonth(),

        contribution_count: primary_scope === "cycle" ? cycle_contribution_count : primary_scope === "month" ? month_contribution_count : year_contribution_count,
        contribution_total: primary_scope === "cycle" ? cycle_contribution_total : primary_scope === "month" ? month_contribution_total : year_contribution_total,
        year_contribution_count,
        month_contribution_count,
        cycle_contribution_count,
        year_contribution_total,
        month_contribution_total,
        cycle_contribution_total,
        latest_closure,
        closure_carry_amount: budgetClosureCarryAmount(latest_closure),

        movement_in: primary_scope === "cycle" ? cycle_movement_in : primary_scope === "month" ? month_movement_in : year_movement_in,
        movement_out: primary_scope === "cycle" ? cycle_movement_out : primary_scope === "month" ? month_movement_out : year_movement_out,
        movement_net: primary_scope === "cycle" ? cycle_movement_net : primary_scope === "month" ? month_movement_net : year_movement_net,
        year_movement_in,
        year_movement_out,
        year_movement_net,
        month_movement_in,
        month_movement_out,
        month_movement_net,
        cycle_movement_in,
        cycle_movement_out,
        cycle_movement_net,

        is_contribution_mode,
        is_annual_rollover_mode,
        mode_kind,
        mode_name: budgetModeName(i),
        current_budget_amount,
        actual_amount,
        remaining_amount,
        used_pct: current_budget_amount ? Math.round(actual_amount / current_budget_amount * 10000) / 100 : 0,

        month_budget_amount,
        month_actual_amount,
        month_remaining_amount,
        month_used_pct: month_budget_amount ? Math.round(month_actual_amount / month_budget_amount * 10000) / 100 : 0,

        cycle_budget_amount,
        cycle_actual_amount,
        cycle_remaining_amount,
        cycle_used_pct: cycle_budget_amount ? Math.round(cycle_actual_amount / cycle_budget_amount * 10000) / 100 : 0,

        year_budget_amount,
        year_actual_amount,
        year_remaining_amount,
        year_used_pct: year_budget_amount ? Math.round(year_actual_amount / year_budget_amount * 10000) / 100 : 0,

        funding_label: budgetFundingLabel({ ...i, planned_amount }),
        available_label: primary_scope === "month"
          ? `${currentBudgetMonth()}月可用 ${fmtMoney(month_budget_amount)}`
          : budgetAvailableLabel({ ...i, planned_amount, current_budget_amount: year_budget_amount })
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
    budgetContributions: queryTable("budget_contributions", { order: { column: "contribution_date", ascending: false } }),
    budgetMovements: queryTable("budget_movements", { order: { column: "movement_date", ascending: false } }),
    transactionEntries: queryTable("transaction_entries", { order: { column: "entry_date", ascending: false } }),
    transactionSplits: queryTable("transaction_splits", { order: { column: "created_at", ascending: true } }),
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
      markReadStatus(false, errors.slice(0, 3).join("；"));
      showAlert(`部分資料讀取失敗：${escapeHtml(errors.slice(0, 3).join("；"))}${errors.length > 3 ? "……" : ""}`, "warn");
    } else {
      markReadStatus(true);
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
  state.activeTab = pageMeta[tab] ? tab : "overview";
  showAlert("");
  syncPageChrome();
  render();
}

function render() {
  const app = $("#app");
  syncPageChrome();
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

  try {
    app.innerHTML = (renderers[state.activeTab] || renderOverview)();
    bindRenderedEvents();
    initCharts();
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <div class="card">
        <h3>頁面載入失敗</h3>
        <p class="metric-sub">目前頁面：${escapeHtml(pageMeta[state.activeTab]?.[0] || state.activeTab)}</p>
        <p class="metric-sub">錯誤：${escapeHtml(error.message || String(error))}</p>
        <div class="btn-row">
          <button class="btn secondary" type="button" data-go="overview">回總覽</button>
          <button class="btn secondary" type="button" id="refreshBtnInline">重新整理資料</button>
        </div>
      </div>
    `;
    $("#refreshBtnInline")?.addEventListener("click", async () => {
      await loadAll();
      render();
    });
    $$("[data-report-mode]").forEach(btn => btn.addEventListener("click", () => {
    const group = btn.dataset.reportGroup;
    const mode = btn.dataset.reportMode;
    if (!group || !mode) return;
    state[group] = mode;
    render();
  }));

  $$("[data-budget-operation]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.budgetOperationMode = btn.dataset.budgetOperation || "globalContribution";
    render();
  }));

  $$("[data-go]").forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.go)));
    showAlert(`頁面載入失敗：${escapeHtml(error.message || String(error))}`, "bad");
  }
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
    refund: ["退款", "退貨 / 退票"],
    asset_adjustment: ["資產調整", "校正 / 盤點"]
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
      ${["expense", "income", "transfer", "refund", "asset_adjustment"].map(t => txModeButton(t, current)).join("")}
    </div>
  `;
}

function renderTxPrimaryFields(type, edit = {}) {
  const accountLabel = type === "income" ? "入帳帳戶" : type === "transfer" ? "轉出帳戶" : type === "refund" ? "退款入帳帳戶" : type === "asset_adjustment" ? "調整帳戶" : "付款帳戶";
  const defaultAccount = edit?.account_id || defaultAccountIdFor(type);
  const merchantLabel = type === "income" ? "收入來源" : type === "transfer" ? "用途" : type === "refund" ? "退款來源" : type === "asset_adjustment" ? "調整原因" : "商家 / 對象";
  const merchantPlaceholder = type === "income" ? "例：打工薪資、股息、退稅" : type === "transfer" ? "例：信用卡繳款、投資轉帳" : type === "refund" ? "例：退票退款、退貨退款" : type === "asset_adjustment" ? "例：現金盤點、證券戶市值校正" : "例：早餐、威秀、Blue Note";
  const categoryLabel = type === "income" ? "收入分類" : "分類";

  const amountMin = type === "asset_adjustment" ? "" : 'min="0"';
  const amountPlaceholder = type === "asset_adjustment" ? "正數=帳戶增加，負數=帳戶減少" : "輸入金額";

  const fields = [
    field("日期", `<input class="input" type="date" name="transaction_date" value="${escapeHtml(edit?.transaction_date || today())}" required>`),
    field("金額", `<input class="input tx-amount-input" type="number" ${amountMin} step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required placeholder="${amountPlaceholder}">`),
    field(accountLabel, `<select class="input" name="account_id" required>${accountOptions(defaultAccount || "")}</select>`)
  ];

  if (type === "transfer") {
    fields.push(field("轉入帳戶", `<select class="input" name="to_account_id" required>${accountOptions(edit?.to_account_id || "")}</select>`));
    fields.push(field("用途", `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}" placeholder="${merchantPlaceholder}">`));
  } else if (type === "asset_adjustment") {
    fields.push(field("調整方向", `<select class="input" name="adjustment_direction">
      <option value="increase" ${edit?.adjustment_direction !== "decrease" ? "selected" : ""}>帳戶增加</option>
      <option value="decrease" ${edit?.adjustment_direction === "decrease" ? "selected" : ""}>帳戶減少</option>
    </select>`));
    fields.push(field(merchantLabel, `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}" placeholder="${merchantPlaceholder}">`));
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


function splitLinesForTransaction(transactionId) {
  if (!transactionId) return "";
  return (state.data.transactionSplits || [])
    .filter(s => s.transaction_id === transactionId)
    .map(s => {
      const cat = state.data.categories.find(c => c.id === s.category_id);
      const bi = state.data.budgetItems.find(b => b.id === s.budget_item_id);
      return [cat?.name || "", s.amount || "", bi?.name || ""].filter(Boolean).join(",");
    })
    .join("\n");
}

function parseSplitLines(text, type = "expense") {
  const lines = String(text || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const parts = line.split(",").map(x => x.trim());
    if (parts.length < 2) throw new Error(`拆帳第 ${index + 1} 行格式錯誤，請用：分類,金額,預算項目`);
    const [categoryName, amountText, budgetName] = parts;
    const category = state.data.categories.find(c => c.type === categoryTypeFor(type) && c.name === categoryName);
    if (!category) throw new Error(`找不到拆帳分類：${categoryName}`);
    const budget = budgetName ? state.data.budgetItems.find(b => b.year_id === state.selectedYearId && b.name === budgetName) : null;
    if (budgetName && !budget) throw new Error(`找不到拆帳預算項目：${budgetName}`);
    const amount = Number(String(amountText).replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`拆帳金額錯誤：${amountText}`);
    return {
      category_id: category.id,
      budget_item_id: budget?.id || null,
      amount,
      note: null
    };
  });
}

function renderTxAdvancedFields(type, edit = {}) {
  return `
    <details class="advanced-fields wide">
      <summary>進階欄位</summary>
      <div class="form-grid">
        ${type !== "transfer" && type !== "asset_adjustment" ? field("轉入帳戶", `<select class="input" name="to_account_id">${accountOptions(edit?.to_account_id || "")}</select>`) : ""}
        ${type !== "refund" && type !== "asset_adjustment" ? field("關聯原支出", `<select class="input" name="related_transaction_id">${expenseTransactionOptions(edit?.related_transaction_id || "")}</select>`) : ""}
        ${(type === "expense" || type === "refund") ? `<div class="field wide">
          <label>拆帳</label>
          <textarea class="input" name="split_lines" placeholder="每行一筆：分類,金額,預算項目（預算項目可省略）">${escapeHtml(splitLinesForTransaction(edit?.id))}</textarea>
        </div>` : ""}
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
  if (type === "income" || type === "transfer" || type === "asset_adjustment") return "other";
  if (type === "refund") return "other";
  return "quality";
}

function defaultCashflowByType(type) {
  if (type === "income") return "fixed";
  if (type === "transfer" || type === "asset_adjustment") return "one_time";
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

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>最近交易（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderTxFilters()}
        ${renderTxTable(rows)}
      </div>
    </details>
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



function budgetContributionOptions(selected = "") {
  const rows = budgetItemSummariesForSelectedYear()
    .filter(i => i.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
  return optionList(rows, selected, "name", "budget_item_id", "請選擇預算項目");
}

function enrichedBudgetContributionsForSelectedYear() {
  return (state.data.budgetContributions || [])
    .filter(c => contributionYear(c.contribution_date) === Number(state.selectedBudgetYear))
    .map(c => {
      const item = state.data.budgetItems.find(i => i.id === c.budget_item_id) || {};
      return {
        ...c,
        budget_item_name: item.name || "未命名項目",
        period_type: item.period_type || "",
        rollover_mode: item.rollover_mode || ""
      };
    })
    .sort((a, b) => String(b.contribution_date || "").localeCompare(String(a.contribution_date || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function renderBudgetContributionSection(items) {
  const edit = state.editing.budgetContribution;
  const rows = enrichedBudgetContributionsForSelectedYear();

  return `
    <div class="card">
      <div class="card-title-row">
        <h3>${edit ? "編輯預算提撥" : "新增預算提撥"}</h3>
        <span class="badge">手動提撥紀錄</span>
      </div>
      <p class="metric-sub">提撥型預算現在以「實際提撥紀錄」為準，不再用系統推估次數。適合出國、高端餐飲、大額購物等累積型預算。</p>
      <form id="budgetContributionForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("預算項目", `<select class="input" name="budget_item_id" required>${budgetContributionOptions(edit?.budget_item_id || "")}</select>`)}
        ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(edit?.contribution_date || today())}" required>`)}
        ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required placeholder="例：20000">`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="例：5 月旅行基金、加碼提撥">${escapeHtml(edit?.note || "")}</textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : "新增提撥"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetContribution">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderBudgetContributionTable(rows) {
  if (!rows.length) return `<div class="empty">尚無提撥紀錄。提撥型預算需要先新增提撥，才會產生可用額度。</div>`;

  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.slice(0, 80).map(r => `
        <div class="mobile-data-card">
          <div class="mobile-data-head">
            <div>
              <strong>${escapeHtml(r.budget_item_name)}</strong>
              <span>${escapeHtml(r.contribution_date || "")}</span>
            </div>
            <div class="mobile-amount">${fmtMoney(r.amount)}</div>
          </div>
          <div class="mobile-data-meta">
            ${r.note ? `<span>${escapeHtml(r.note)}</span>` : ""}
          </div>
          <div class="mobile-card-actions">
            <button class="btn small secondary" type="button" data-edit-contribution="${r.id}">編輯</button>
            <button type="button" class="btn small danger" data-delete="budget_contributions:${r.id}">刪除</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead><tr><th>日期</th><th>預算項目</th><th>金額</th><th>備註</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.slice(0, 120).map(r => `
            <tr>
              <td>${escapeHtml(r.contribution_date || "")}</td>
              <td>${escapeHtml(r.budget_item_name)}</td>
              <td class="mono good">${fmtMoney(r.amount)}</td>
              <td>${escapeHtml(r.note || "")}</td>
              <td class="actions">
                <button class="btn small secondary" type="button" data-edit-contribution="${r.id}">編輯</button>
                <button type="button" class="btn small danger" data-delete="budget_contributions:${r.id}">刪除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  return `${mobileCards}${tableView}`;
}


function enrichedBudgetMovementsForSelectedYear() {
  return (state.data.budgetMovements || [])
    .filter(m => contributionYear(m.movement_date) === Number(state.selectedBudgetYear))
    .map(m => {
      const fromItem = state.data.budgetItems.find(i => i.id === m.from_budget_item_id) || {};
      const toItem = state.data.budgetItems.find(i => i.id === m.to_budget_item_id) || {};
      return {
        ...m,
        from_name: fromItem.name || "未指定",
        to_name: toItem.name || "未指定"
      };
    })
    .sort((a, b) => String(b.movement_date || "").localeCompare(String(a.movement_date || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function renderBudgetMovementSection() {
  const edit = state.editing.budgetMovement;
  const rows = enrichedBudgetMovementsForSelectedYear();
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>${edit ? "編輯預算移轉" : "預算項目移轉"}</h3>
        <span class="badge">Envelope</span>
      </div>
      <p class="metric-sub">用來把一個 envelope 的餘額挪到另一個 envelope，例如「高端餐飲」轉 2,000 到「出國」。這不是收入，也不是支出。</p>
      <form id="budgetMovementForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("日期", `<input class="input" type="date" name="movement_date" value="${escapeHtml(edit?.movement_date || today())}" required>`)}
        ${field("從哪個預算扣", `<select class="input" name="from_budget_item_id" required>${budgetContributionOptions(edit?.from_budget_item_id || "")}</select>`)}
        ${field("移到哪個預算", `<select class="input" name="to_budget_item_id" required>${budgetContributionOptions(edit?.to_budget_item_id || "")}</select>`)}
        ${field("金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required>`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="例：月底補出國預算">${escapeHtml(edit?.note || "")}</textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : "新增移轉"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetMovement">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>預算移轉紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetMovementTable(rows)}
      </div>
    </details>
  `;
}

function renderBudgetMovementTable(rows) {
  if (!rows.length) return `<div class="empty">尚無預算移轉紀錄。</div>`;
  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.slice(0, 80).map(r => `
        <div class="mobile-data-card">
          <div class="mobile-data-head">
            <div>
              <strong>${escapeHtml(r.from_name)} → ${escapeHtml(r.to_name)}</strong>
              <span>${escapeHtml(r.movement_date || "")}</span>
            </div>
            <div class="mobile-amount">${fmtMoney(r.amount)}</div>
          </div>
          <div class="mobile-data-meta">${r.note ? `<span>${escapeHtml(r.note)}</span>` : ""}</div>
          <div class="mobile-card-actions">
            <button class="btn small secondary" type="button" data-edit-movement="${r.id}">編輯</button>
            <button type="button" class="btn small danger" data-delete="budget_movements:${r.id}">刪除</button>
          </div>
        </div>
      `).join("")}
    </div>`;
  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead><tr><th>日期</th><th>從</th><th>到</th><th>金額</th><th>備註</th><th>操作</th></tr></thead>
        <tbody>${rows.slice(0, 120).map(r => `
          <tr>
            <td>${escapeHtml(r.movement_date || "")}</td>
            <td>${escapeHtml(r.from_name)}</td>
            <td>${escapeHtml(r.to_name)}</td>
            <td class="mono">${fmtMoney(r.amount)}</td>
            <td>${escapeHtml(r.note || "")}</td>
            <td class="actions">
              <button class="btn small secondary" type="button" data-edit-movement="${r.id}">編輯</button>
              <button type="button" class="btn small danger" data-delete="budget_movements:${r.id}">刪除</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
  return `${mobileCards}${tableView}`;
}


function monthEndKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysLeftInMonth(date = new Date()) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return lastDay - date.getDate();
}

function isMonthEndWindow(date = new Date()) {
  // 不做背景推播；使用者在不會自動跳出、不會自動分類；你按按鈕後才會開始分配。
  return daysLeftInMonth(date) <= 2;
}

function monthCloseAlreadyAsked(date = new Date()) {
  return appPreference(`month_close_asked_${monthEndKey(date)}`, "") === "1";
}

function markMonthCloseAsked(date = new Date()) {
  setAppPreference(`month_close_asked_${monthEndKey(date)}`, "1");
}

function monthCloseSourceRows() {
  return budgetItemSummariesForSelectedYear()
    .filter(r => (r.period_type || "annual") === "monthly")
    .filter(r => Number(r.month_remaining_amount ?? r.remaining_amount ?? 0) > 0)
    .map(r => ({
      ...r,
      remaining_amount: Number(r.month_remaining_amount ?? r.remaining_amount ?? 0),
      current_budget_amount: Number(r.month_budget_amount ?? r.current_budget_amount ?? 0),
      actual_amount: Number(r.month_actual_amount ?? r.actual_amount ?? 0),
      primary_scope: "month",
      scope_label: `${currentBudgetMonth()}月`
    }))
    .sort((a, b) => Number(b.remaining_amount || 0) - Number(a.remaining_amount || 0));
}

function monthCloseTargetRows(sourceId = "") {
  return budgetItemSummariesForSelectedYear()
    .filter(r => r.budget_item_id !== sourceId)
    .filter(r => r.is_active !== false)
    .sort((a, b) => {
      // 提撥型優先當目標，其次照剩餘額度與名稱排序。
      if (a.is_contribution_mode !== b.is_contribution_mode) return a.is_contribution_mode ? -1 : 1;
      return (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name));
    });
}

function numberedPromptList(rows, labelFn) {
  return rows.map((r, idx) => `${idx + 1}. ${labelFn(r)}`).join("\n");
}

function pickByNumber(input, rows) {
  const n = Number(String(input || "").trim());
  if (!Number.isInteger(n) || n < 1 || n > rows.length) return null;
  return rows[n - 1];
}

async function createMonthCloseMovement(source, target, amount, note = "") {
  const payload = {
    movement_date: today(),
    from_budget_item_id: source.budget_item_id,
    to_budget_item_id: target.budget_item_id,
    amount: Math.max(0, Number(amount || 0)),
    movement_type: "manual",
    note: note || `手動分配結餘：${source.name} → ${target.name}`
  };
  if (!payload.amount) throw new Error("移轉金額不可為 0");
  return await upsert("budget_movements", payload, { expect: { amount: payload.amount, movement_type: "manual" } });
}

async function runMonthCloseSweepPrompt({ auto = false } = {}) {
  if (state.monthClosePromptRunning) return;
  state.monthClosePromptRunning = true;

  try {
    const sources = monthCloseSourceRows();
    if (!sources.length) {
      if (!auto) showAlert("沒有可掃出的固定型月預算結餘。", "warn");
      return;
    }

    const sourceInput = window.prompt(
      `手動分配結餘：選擇要從哪個每月預算項目分配 ${currentBudgetMonth()} 月結餘。\n\n${numberedPromptList(sources, r => `${r.name}｜剩餘 ${fmtMoney(r.remaining_amount)}`)}\n\n輸入編號；取消或空白 = 不處理`,
      "1"
    );
    if (!sourceInput) {
      if (auto) markMonthCloseAsked();
      return;
    }

    const source = pickByNumber(sourceInput, sources);
    if (!source) {
      showAlert("手動分配結餘取消：來源編號無效。", "bad");
      return;
    }

    const targets = monthCloseTargetRows(source.budget_item_id);
    if (!targets.length) {
      showAlert("沒有可移入的目標預算項目。", "bad");
      return;
    }

    const targetInput = window.prompt(
      `要把「${source.name}」剩餘 ${fmtMoney(source.remaining_amount)} 移到哪裡？\n\n${numberedPromptList(targets, r => `${r.name}${r.is_contribution_mode ? "｜提撥型" : "｜固定型"}｜目前可用 ${fmtMoney(r.current_budget_amount)}`)}\n\n輸入編號；取消或空白 = 不處理`,
      "1"
    );
    if (!targetInput) {
      if (auto) markMonthCloseAsked();
      return;
    }

    const target = pickByNumber(targetInput, targets);
    if (!target) {
      showAlert("手動分配結餘取消：目標編號無效。", "bad");
      return;
    }

    const amountInput = window.prompt(
      `要移轉多少？\n\n來源：${source.name}\n目標：${target.name}\n可移轉上限：${fmtMoney(source.remaining_amount)}\n\n用預設金額 = 把這個項目的 ${currentBudgetMonth()} 月剩餘額度清空。`,
      String(Math.round(Number(source.remaining_amount || 0)))
    );
    if (!amountInput) {
      if (auto) markMonthCloseAsked();
      return;
    }

    const amount = Number(String(amountInput).replaceAll(",", "").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      showAlert("手動分配結餘取消：金額無效。", "bad");
      return;
    }
    if (amount > Number(source.remaining_amount || 0)) {
      showAlert(`手動分配結餘取消：金額不可超過來源剩餘 ${fmtMoney(source.remaining_amount)}。`, "bad");
      return;
    }

    const ok = await confirmAction(
      "確認手動分配結餘",
      `確定要把 ${fmtMoney(amount)} 從「${source.name}」移到「${target.name}」？\n\n這會新增一筆預算移轉，不會新增收入或支出；若金額等於來源剩餘，來源額度會被清空。`
    );
    if (!ok) {
      if (auto) markMonthCloseAsked();
      return;
    }

    await createMonthCloseMovement(source, target, amount);
    markMonthCloseAsked();
    await loadAll();
    render();
    showAlert(`已完成手動分配結餘：${source.name} → ${target.name}，${fmtMoney(amount)}。`, "good", { timeout: 6000 });
  } catch (error) {
    showAlert(`手動分配結餘失敗：${escapeHtml(error.message)}`, "bad");
  } finally {
    state.monthClosePromptRunning = false;
  }
}

function maybeAutoAskMonthCloseSweep() {
  if (!isMonthEndWindow()) return;
  if (monthCloseAlreadyAsked()) return;
  if (!monthCloseSourceRows().length) return;

  // 避免初次載入時阻塞畫面，等 render 完再問。
  setTimeout(() => {
    if (!monthCloseAlreadyAsked()) runMonthCloseSweepPrompt({ auto: true });
  }, 800);
}

function renderMonthCloseSweepSuggestions() {
  const sources = monthCloseSourceRows().slice(0, 6);
  if (!sources.length) return `<p class="metric-sub">目前沒有可掃出的固定型月預算結餘。</p>`;
  return `
    <ul class="plain-list">
      ${sources.map(r => `<li>${escapeHtml(r.name)}：可掃出 ${fmtMoney(r.remaining_amount)}</li>`).join("")}
    </ul>
  `;
}


function annualRolloverRows() {
  return budgetItemSummariesForSelectedYear()
    .filter(r => r.is_annual_rollover_mode)
    .filter(r => Number(r.year_remaining_amount ?? r.remaining_amount ?? 0) > 0)
    .sort((a, b) => Number(b.year_remaining_amount ?? b.remaining_amount ?? 0) - Number(a.year_remaining_amount ?? a.remaining_amount ?? 0));
}

function annualRolloverDiagnostics() {
  const items = budgetItemSummariesForSelectedYear();
  const annualCarry = items.filter(r => r.is_annual_rollover_mode);
  const annualCarryNoRemaining = annualCarry.filter(r => Number(r.year_remaining_amount ?? r.remaining_amount ?? 0) <= 0);
  const notAnnualCarry = items.filter(r => !r.is_annual_rollover_mode);
  return {
    total: items.length,
    eligible: annualRolloverRows().length,
    annualCarry: annualCarry.length,
    annualCarryNoRemaining: annualCarryNoRemaining.length,
    notAnnualCarry: notAnnualCarry.length,
    notAnnualCarryNames: notAnnualCarry.slice(0, 8).map(r => `${r.name}（${labelOf(r.period_type)} + ${labelOf(r.rollover_mode)}）`)
  };
}

function budgetAllocationSummary() {
  const current = getCurrentYearSummary();
  const items = budgetItemSummariesForSelectedYear();
  const allocated = items.reduce((sum, i) => sum + Math.max(0, Number(i.current_budget_amount || 0)), 0);
  const unallocated = Number(current.available_budget || 0) - allocated;
  return { allocated, unallocated, current };
}

function renderBudgetAllocationCards() {
  const s = budgetAllocationSummary();
  return `
    <div class="grid cols-3">
      ${metricCard("預算項目已分配", fmtMoney(s.allocated), "各項目目前可用額度加總")}
      ${metricCard(s.unallocated >= 0 ? "尚未分配" : "超額分配", fmtMoney(s.unallocated), s.unallocated >= 0 ? "母池尚有空間" : "項目額度超過全局池", s.unallocated >= 0 ? "good" : "bad")}
      ${metricCard("年度結轉型項目", `${annualRolloverRows().length} 項`, "每年 + 餘額結轉")}
    </div>
  `;
}


function accountBalanceRowsMerged() {
  return (state.data.accountBalances || []).map(row => {
    const source = state.data.accounts.find(a => a.id === row.id) || {};
    return {
      ...source,
      ...row,
      current_balance: Number(row.current_balance ?? source.initial_balance ?? 0),
      note: source.note || row.note || ""
    };
  });
}

function isAutoCashCoverageAccount(account) {
  const type = account.type || "";
  const nameNote = `${account.name || ""} ${account.note || ""}`.toLowerCase();

  if (["cash", "bank", "e_wallet"].includes(type)) return true;

  // 自動模式仍保留：證券戶「現金」可列入；股票 / ETF / 基金市值不列入。
  if (type === "asset") {
    const hasBroker = /(證券|券商|broker|brokerage|schwab|ibkr|firstrade)/i.test(nameNote);
    const hasCash = /(現金|cash|money market|settlement|交割)/i.test(nameNote);
    return hasBroker && hasCash;
  }

  return false;
}

function isCashCoverageAccount(account) {
  const mode = accountCoverageMode(account.note || "");
  if (mode === "cash") return true;
  if (mode === "liability" || mode === "exclude") return false;
  return isAutoCashCoverageAccount(account);
}

function isBudgetLiabilityAccount(account) {
  const mode = accountCoverageMode(account.note || "");
  if (mode === "liability") return true;
  if (mode === "cash" || mode === "exclude") return false;
  return ["credit_card", "loan"].includes(account.type || "");
}

function budgetRealityCheckSummary() {
  const accounts = accountBalanceRowsMerged().filter(a => a.is_active !== false);
  const cashAccounts = accounts
    .filter(isCashCoverageAccount)
    .map(a => ({ ...a, coverage_amount: Math.max(0, Number(a.current_balance || 0)) }));

  const liabilityAccounts = accounts
    .filter(isBudgetLiabilityAccount)
    .map(a => ({ ...a, liability_amount: Math.max(0, -Number(a.current_balance || 0)) }));

  const excludedAccounts = accounts.filter(a => !isCashCoverageAccount(a) && !isBudgetLiabilityAccount(a));

  const cashCoverage = cashAccounts.reduce((sum, a) => sum + Number(a.coverage_amount || 0), 0);
  const liabilities = liabilityAccounts.reduce((sum, a) => sum + Number(a.liability_amount || 0), 0);
  const availableCashNet = cashCoverage - liabilities;

  const budgetRows = budgetItemSummariesForSelectedYear();
  const budgetRemaining = budgetRows.reduce((sum, r) => sum + Math.max(0, Number(r.remaining_amount || 0)), 0);
  const overspent = budgetRows.reduce((sum, r) => sum + Math.max(0, -Number(r.remaining_amount || 0)), 0);
  const safetyBuffer = availableCashNet - budgetRemaining;

  return {
    cashAccounts,
    liabilityAccounts,
    excludedAccounts,
    cashCoverage,
    liabilities,
    availableCashNet,
    budgetRemaining,
    overspent,
    safetyBuffer
  };
}

function renderBudgetRealityCheck() {
  const s = budgetRealityCheckSummary();
  const status = s.safetyBuffer >= 0 ? "good" : "bad";
  const statusText = s.safetyBuffer >= 0 ? "現金覆蓋足夠" : "現金覆蓋不足";
  const cashList = s.cashAccounts.length
    ? `<ul class="plain-list">${s.cashAccounts.map(a => `<li>${escapeHtml(a.name)}（${escapeHtml(labelOf(a.type))}｜${escapeHtml(accountCoverageLabel(accountCoverageMode(a.note || "")))}）：${fmtMoney(a.coverage_amount)}</li>`).join("")}</ul>`
    : `<p class="metric-sub">尚無列入覆蓋的現金類帳戶。可到「帳戶 → 編輯帳戶 → 預算驗算」手動指定。</p>`;

  const liabilityList = s.liabilityAccounts.length
    ? `<ul class="plain-list">${s.liabilityAccounts.map(a => `<li>${escapeHtml(a.name)}（${escapeHtml(labelOf(a.type))}｜${escapeHtml(accountCoverageLabel(accountCoverageMode(a.note || "")))}）：${fmtMoney(a.liability_amount)}</li>`).join("")}</ul>`
    : `<p class="metric-sub">尚無信用卡 / 貸款扣項，或目前餘額不是負債。</p>`;

  const excludedList = s.excludedAccounts.length
    ? `<ul class="plain-list">${s.excludedAccounts.slice(0, 8).map(a => `<li>${escapeHtml(a.name)}（${escapeHtml(labelOf(a.type))}｜${escapeHtml(accountCoverageLabel(accountCoverageMode(a.note || "")))}）：未列入</li>`).join("")}${s.excludedAccounts.length > 8 ? `<li>其餘 ${s.excludedAccounts.length - 8} 個帳戶未列入</li>` : ""}</ul>`
    : `<p class="metric-sub">沒有被排除的帳戶。</p>`;

  return `
    <div class="card budget-reality-card">
      <div class="card-title-row">
        <h3>預算真實性驗算</h3>
        <span class="badge ${status}">${escapeHtml(statusText)}</span>
      </div>
      <p class="metric-sub">公式：你指定列入的現金類帳戶 − 你指定的負債扣項 − 預算項目剩餘總額 = 預算安全墊。可在「帳戶 → 編輯帳戶 → 預算驗算」自行決定每個帳戶是否列入。</p>

      <div class="grid cols-4">
        ${metricCard("現金類資金", fmtMoney(s.cashCoverage), "現金 / 銀行 / 電支 / 證券戶現金", "good")}
        ${metricCard("信用卡 / 貸款扣項", fmtMoney(s.liabilities), "負債扣除", s.liabilities > 0 ? "bad" : "")}
        ${metricCard("預算剩餘銀彈", fmtMoney(s.budgetRemaining), "各預算項目剩餘加總")}
        ${metricCard("預算安全墊", fmtMoney(s.safetyBuffer), s.safetyBuffer >= 0 ? "現金足以覆蓋預算" : "預算超過現金支撐", status)}
      </div>

      <details class="subtle-details">
        <summary>查看驗算明細</summary>
        <div class="grid cols-3" style="margin-top:12px">
          <div>
            <h4>列入覆蓋</h4>
            ${cashList}
          </div>
          <div>
            <h4>扣項</h4>
            ${liabilityList}
          </div>
          <div>
            <h4>未列入</h4>
            ${excludedList}
          </div>
        </div>
        ${s.overspent > 0 ? `<p class="metric-sub">另有預算項目超支合計 ${fmtMoney(s.overspent)}；此數字不會拿來抵減剩餘銀彈，請另外補洞。</p>` : ""}
      </details>
    </div>
  `;
}


function renderGlobalBudgetContributionSection() {
  const rows = globalBudgetContributionRowsForSelectedYear();
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>新增全局預算提撥</h3>
        <span class="badge">年度母池</span>
      </div>
      <p class="metric-sub">全局年度預算現在以實際提撥紀錄為準。公式：目前可用預算 = 前期結轉 + 全局提撥紀錄合計。</p>
      <form id="globalBudgetContributionForm" class="form-grid">
        ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(today())}" required>`)}
        ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" required placeholder="例：25000">`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="例：5 月稅後收入扣掉儲蓄後可支配預算"></textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">新增全局提撥</button>
        </div>
      </form>
    </div>

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>全局提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderGlobalBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderGlobalBudgetContributionTable(rows) {
  if (!rows.length) return `<div class="empty">尚無全局提撥紀錄。</div>`;
  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.slice(0, 80).map(r => `
        <div class="mobile-data-card">
          <div class="mobile-data-head">
            <div>
              <strong>全局預算提撥</strong>
              <span>${escapeHtml(r.contribution_date || "")}</span>
            </div>
            <div class="mobile-amount">${fmtMoney(r.amount)}</div>
          </div>
          <div class="mobile-data-meta">${r.note ? `<span>${escapeHtml(r.note)}</span>` : ""}</div>
          <div class="mobile-card-actions">
            <button type="button" class="btn small danger" data-delete-global-contribution="${escapeHtml(r.id)}">刪除</button>
          </div>
        </div>
      `).join("")}
    </div>`;

  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead><tr><th>日期</th><th>金額</th><th>備註</th><th>操作</th></tr></thead>
        <tbody>${rows.slice(0, 120).map(r => `
          <tr>
            <td>${escapeHtml(r.contribution_date || "")}</td>
            <td class="mono good">${fmtMoney(r.amount)}</td>
            <td>${escapeHtml(r.note || "")}</td>
            <td class="actions">
              <button type="button" class="btn small danger" data-delete-global-contribution="${escapeHtml(r.id)}">刪除</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
  return `${mobileCards}${tableView}`;
}

async function saveGlobalBudgetContribution(form) {
  const d = readForm(form);
  if (!d.contribution_date) throw new Error("請選擇提撥日期");
  if (!Number(d.amount)) throw new Error("請輸入提撥金額");

  const rows = globalBudgetContributionRowsForSelectedYear();
  rows.push({
    id: makeClientId("global_budget_contribution"),
    contribution_date: d.contribution_date,
    amount: numberOrZero(d.amount),
    note: d.note || ""
  });

  return await updateSelectedYearGlobalContributions(rows);
}

async function deleteGlobalBudgetContribution(id) {
  const rows = globalBudgetContributionRowsForSelectedYear();
  const nextRows = rows.filter(r => r.id !== id);
  if (nextRows.length === rows.length) throw new Error("找不到這筆全局提撥紀錄。");
  return await updateSelectedYearGlobalContributions(nextRows);
}

async function ensureBudgetYearForNumber(yearNumber) {
  let row = state.data.years.find(y => Number(y.budget_year) === Number(yearNumber));
  if (row) return row;

  const currentYear = state.data.years.find(y => y.id === state.selectedYearId) || {};
  row = await upsert("years", {
    budget_year: Number(yearNumber),
    name: `${yearNumber} 年度預算`,
    budget_mode: currentYear.budget_mode || "annual_total",
    monthly_budget: Number(currentYear.monthly_budget || 0),
    budget_start_mode: "record_start",
    annual_budget: Number(currentYear.annual_budget || 0),
    carryover_from_previous: 0,
    note: "由年度結轉型預算項目自動建立"
  }, { expect: { budget_year: Number(yearNumber) } });

  state.data.years.push(row);
  return row;
}

async function getOrCreateNextBudgetItem(currentItem, nextYear) {
  const existing = (state.data.budgetItems || []).find(i =>
    i.year_id === nextYear.id
    && i.name === currentItem.name
    && i.item_type === currentItem.item_type
  );
  if (existing) return existing;

  const payload = {
    year_id: nextYear.id,
    category_id: currentItem.category_id || null,
    name: currentItem.name,
    item_type: currentItem.item_type || "expense",
    planned_amount: Number(currentItem.planned_amount || 0),
    period_type: "annual",
    rollover_mode: "carryover",
    sort_order: Number(currentItem.sort_order || 0),
    is_active: currentItem.is_active !== false,
    note: currentItem.note || "由年度結轉自動建立"
  };

  const row = await upsert("budget_items", payload, { expect: { name: payload.name, year_id: payload.year_id } });
  state.data.budgetItems.push(row);
  return row;
}

async function upsertRolloverContribution(nextItem, amount, fromYear) {
  const contributionDate = `${Number(fromYear) + 1}-01-01`;
  const marker = `${fromYear} 年度結轉`;
  const existing = (state.data.budgetContributions || []).find(c =>
    c.budget_item_id === nextItem.id
    && c.contribution_date === contributionDate
    && String(c.note || "").includes(marker)
  );

  const payload = {
    id: existing?.id || undefined,
    budget_item_id: nextItem.id,
    contribution_date: contributionDate,
    amount: Math.max(0, Math.round(Number(amount || 0))),
    note: marker
  };

  const row = await upsert("budget_contributions", payload, { expect: { budget_item_id: nextItem.id, amount: payload.amount } });

  if (existing) {
    state.data.budgetContributions = state.data.budgetContributions.map(c => c.id === existing.id ? row : c);
  } else {
    state.data.budgetContributions.push(row);
  }

  return row;
}

async function rolloverAnnualBudgetItemsToNextYear() {
  showAlert("正在檢查年度結轉型項目…", "warn");
  const rows = annualRolloverRows();
  const diag = annualRolloverDiagnostics();

  if (!rows.length) {
    const msg = [
      "沒有可結轉的年度結轉型預算項目。",
      "",
      "可結轉條件：",
      "1. 期間 = 每年",
      "2. 結轉模式 = 餘額結轉",
      "3. 今年剩餘額度 > 0",
      "",
      `目前：年度結轉型 ${diag.annualCarry} 項，其中剩餘 > 0 的有 ${diag.eligible} 項。`,
      diag.notAnnualCarryNames.length ? `非年度結轉型範例：${diag.notAnnualCarryNames.join("、")}` : ""
    ].filter(Boolean).join("\n");

    await confirmAction("不能結轉", msg);
    showAlert("沒有可結轉項目：請先把出國 / Live Music 等項目設成「每年 + 餘額結轉」，且今年剩餘要大於 0。", "warn", { sticky: true });
    return;
  }

  const nextYearNumber = Number(state.selectedBudgetYear) + 1;
  const summary = rows.map(r => `${r.name}：${fmtMoney(r.year_remaining_amount ?? r.remaining_amount)}`).join("\n");
  const ok = await confirmAction(
    "年度結轉型 Envelope",
    `確定要把以下項目的今年剩餘額度結轉到 ${nextYearNumber} 年？\n\n${summary}\n\n這會在下一年建立同名預算項目，並新增/更新一筆「${state.selectedBudgetYear} 年度結轉」提撥。下一年的實際花費會自然從 0 開始。`
  );
  if (!ok) {
    showAlert("已取消年度結轉。", "warn");
    return;
  }

  const nextYear = await ensureBudgetYearForNumber(nextYearNumber);
  let count = 0;

  for (const row of rows) {
    const sourceItem = state.data.budgetItems.find(i => i.id === row.budget_item_id);
    if (!sourceItem) continue;
    const nextItem = await getOrCreateNextBudgetItem(sourceItem, nextYear);
    await upsertRolloverContribution(nextItem, row.year_remaining_amount ?? row.remaining_amount, state.selectedBudgetYear);
    count += 1;
  }

  await loadAll();

  const refreshedNextYear = state.data.years.find(y => Number(y.budget_year) === nextYearNumber) || nextYear;
  if (refreshedNextYear?.id) {
    state.selectedYearId = refreshedNextYear.id;
    state.selectedBudgetYear = refreshedNextYear.budget_year;
  }

  render();
  showAlert(`已結轉 ${count} 個年度結轉型預算項目到 ${nextYearNumber} 年，並切換到 ${nextYearNumber} 年。`, "good", { timeout: 8000 });
}

function renderAnnualRolloverCard() {
  const rows = annualRolloverRows();
  const diag = annualRolloverDiagnostics();
  return `
    <div class="month-close-box annual-rollover-box">
      <div>
        <h4>年度結轉型 Envelope</h4>
        <p class="metric-sub">不用等到下一年。只要目前選的是 ${state.selectedBudgetYear}，按下後就會建立 / 更新 ${Number(state.selectedBudgetYear) + 1} 年的同名預算項目。可結轉條件：期間 = 每年、結轉模式 = 餘額結轉、今年剩餘 > 0。</p>
        <p class="metric-sub">目前符合條件：${diag.eligible} 項；年度結轉型總數：${diag.annualCarry} 項。</p>
        ${rows.length ? `<ul class="plain-list">${rows.slice(0, 8).map(r => `<li>${escapeHtml(r.name)}：今年剩餘 ${fmtMoney(r.year_remaining_amount ?? r.remaining_amount)}</li>`).join("")}</ul>` : `<p class="metric-sub warn-text">目前沒有可結轉項目。請先把出國 / Live Music / 單口喜劇 / 高端餐飲設成「每年 + 餘額結轉」，且今年剩餘要大於 0。</p>`}
      </div>
      <div class="btn-row">
        <button class="btn secondary" type="button" id="rolloverAnnualItemsBtn">結轉年度型項目到下一年</button>
      </div>
    </div>
  `;
}

function renderMonthCloseAdvisor() {
  const rows = budgetItemSummariesForSelectedYear();
  const overspent = rows.filter(r => Number(r.remaining_amount || 0) < 0).sort((a, b) => Number(a.remaining_amount) - Number(b.remaining_amount));
  const surplus = rows.filter(r => Number(r.remaining_amount || 0) > 0).sort((a, b) => Number(b.remaining_amount) - Number(a.remaining_amount)).slice(0, 6);
  const fixed = transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled" && t.type === "expense" && t.cashflow_nature === "fixed")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const variable = transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled" && t.type === "expense" && t.cashflow_nature === "variable")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const oneTime = transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled" && t.type === "expense" && t.cashflow_nature === "one_time")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  return `
    <div class="card">
      <div class="card-title-row">
        <h3>月底關帳檢查</h3>
        <span class="badge">Decision</span>
      </div>
      <div class="grid cols-3">
        ${metricCard("固定支出", fmtMoney(fixed), "fixed")}
        ${metricCard("變動支出", fmtMoney(variable), "variable")}
        ${metricCard("一次性支出", fmtMoney(oneTime), "one-time")}
      </div>
      <div class="grid cols-2">
        <div>
          <h4>需要補洞的預算</h4>
          ${overspent.length ? `<ul class="plain-list">${overspent.map(r => `<li>${escapeHtml(r.name)}：超支 ${fmtMoney(Math.abs(r.remaining_amount))}</li>`).join("")}</ul>` : `<p class="metric-sub">目前沒有超支 envelope。</p>`}
        </div>
        <div>
          <h4>可挪用的預算</h4>
          ${surplus.length ? `<ul class="plain-list">${surplus.map(r => `<li>${escapeHtml(r.name)}：剩餘 ${fmtMoney(r.remaining_amount)}</li>`).join("")}</ul>` : `<p class="metric-sub">目前沒有明顯可挪用 envelope。</p>`}
        </div>
      </div>

      <div class="month-close-box">
        <div>
          <h4>手動分配結餘</h4>
          <p class="metric-sub">不會自動跳出、不會自動分類；你按按鈕後才會開始分配。系統會把固定型月預算的未用結餘移到指定 envelope，不會新增收入或支出。</p>
          ${renderMonthCloseSweepSuggestions()}
        </div>
        <div class="btn-row">
          <button class="btn secondary" type="button" id="runMonthCloseSweepBtn">手動分配結餘</button>
        </div>
      </div>
    </div>
  `;
}


function activeBudgetOperationMode() {
  if (state.editing.budgetContribution) return "itemContribution";
  if (state.editing.budgetMovement) return "movement";
  if (state.editing.budgetItem) return "item";
  if (state.editing.year) return "year";
  return state.budgetOperationMode || "globalContribution";
}

function budgetOperationTab(mode, label) {
  const active = activeBudgetOperationMode() === mode ? "active" : "";
  return `<button class="seg-btn ${active}" type="button" data-budget-operation="${mode}">${escapeHtml(label)}</button>`;
}

function clearBudgetOperationEditing() {
  state.editing.year = null;
  state.editing.budgetItem = null;
  state.editing.budgetContribution = null;
  state.editing.budgetMovement = null;
}

function renderYearSettingsForm(editYear, current) {
  return `
    <form id="yearForm" class="form-grid two">
      <input type="hidden" name="id" value="${escapeHtml(editYear?.id || "")}">
      ${field("年度", `<input class="input" type="number" name="budget_year" min="2000" max="2100" value="${escapeHtml(editYear?.budget_year || state.selectedBudgetYear)}" required>`)}
      ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editYear?.name || "")}" placeholder="例：2026 年度預算">`)}
      ${field("預算模式", `<input class="input" value="提撥紀錄制" disabled><input type="hidden" name="budget_mode" value="monthly_contribution">`)}
      ${field("年度總預算", `<input class="input" value="${escapeHtml(fmtMoney(current.annual_budget || 0))}" disabled><input type="hidden" name="annual_budget" value="${escapeHtml(current.annual_budget || 0)}">`)}
      ${field("計算起點", `<input class="input" value="依全局提撥紀錄" disabled><input type="hidden" name="budget_start_mode" value="record_start">`)}
      ${field("前期結轉", `<input class="input" type="number" step="1" name="carryover_from_previous" value="${escapeHtml(editYear?.carryover_from_previous ?? current.carryover_from_previous ?? 0)}">`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note">${escapeHtml(stripGlobalBudgetContributionsMarker(editYear?.note || ""))}</textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">儲存年度</button>
        <button class="btn secondary" type="button" data-edit-year="${state.selectedYearId}">載入目前年度編輯</button>
        <button class="btn secondary" type="button" id="closeYearBtn">結轉到下一年</button>
        ${editYear ? `<button class="btn danger" type="button" data-delete="years:${editYear.id}">刪除年度</button>` : ""}
        ${editYear ? `<button class="btn secondary" type="button" data-cancel-edit="year">取消編輯</button>` : ""}
      </div>
    </form>
  `;
}

function renderBudgetItemForm(editItem) {
  return `
    <form id="budgetItemForm" class="form-grid two">
      <input type="hidden" name="id" value="${escapeHtml(editItem?.id || "")}">
      ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editItem?.name || "")}" required placeholder="例：日常餐飲">`)}
      ${field("類型", `<select class="input" name="item_type">${selectOpts(["expense","income","saving","other"], editItem?.item_type || "expense")}</select>`)}
      ${field("金額", `<input class="input" type="number" step="1" name="planned_amount" value="${escapeHtml(editItem?.planned_amount || "")}" required placeholder="固定預算，或參考額度">`)}
      ${field("分類", `<select class="input" name="category_id">${categoryOptions(editItem?.item_type || "expense", editItem?.category_id || "")}</select>`)}
      <details class="advanced-fields wide">
        <summary>進階欄位</summary>
        <div class="form-grid two">
          ${field("期間", `<select class="input" name="period_type">${selectOpts(["annual","monthly","weekly","custom"], editItem?.period_type || "annual")}</select>`)}
          ${field("結轉模式", `<select class="input" name="rollover_mode">${selectOpts(["none","carryover","overspend_to_next"], editItem?.rollover_mode || "none")}</select>`)}
          ${field("提撥起始日", `<input class="input" type="date" name="start_date" value="${escapeHtml(editItem?.start_date || "")}">`)}
          ${field("提撥結束日", `<input class="input" type="date" name="end_date" value="${escapeHtml(editItem?.end_date || "")}">`)}
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
  `;
}

function renderGlobalBudgetContributionForm() {
  return `
    <form id="globalBudgetContributionForm" class="form-grid">
      ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(today())}" required>`)}
      ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" required placeholder="例：25000">`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note" placeholder="例：5 月稅後收入扣掉儲蓄後可支配預算"></textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">新增全局提撥</button>
      </div>
    </form>
  `;
}

function renderBudgetContributionForm(edit) {
  return `
    <form id="budgetContributionForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
      ${field("預算項目", `<select class="input" name="budget_item_id" required>${budgetContributionOptions(edit?.budget_item_id || "")}</select>`)}
      ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(edit?.contribution_date || today())}" required>`)}
      ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required placeholder="例：20000">`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note" placeholder="例：出國基金、Live Music 加碼">${escapeHtml(edit?.note || "")}</textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">${edit ? "儲存修改" : "新增項目提撥"}</button>
        ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetContribution">取消編輯</button>` : ""}
      </div>
    </form>
  `;
}

function renderBudgetMovementForm(edit) {
  return `
    <form id="budgetMovementForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
      ${field("日期", `<input class="input" type="date" name="movement_date" value="${escapeHtml(edit?.movement_date || today())}" required>`)}
      ${field("從哪個預算扣", `<select class="input" name="from_budget_item_id" required>${budgetContributionOptions(edit?.from_budget_item_id || "")}</select>`)}
      ${field("移到哪個預算", `<select class="input" name="to_budget_item_id" required>${budgetContributionOptions(edit?.to_budget_item_id || "")}</select>`)}
      ${field("金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required>`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note" placeholder="例：月底把日常結餘移到出國">${escapeHtml(edit?.note || "")}</textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">${edit ? "儲存修改" : "新增移轉"}</button>
        ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetMovement">取消編輯</button>` : ""}
      </div>
    </form>
  `;
}

function renderBudgetOperationsCard(editYear, editItem, current) {
  const mode = activeBudgetOperationMode();
  const titles = {
    globalContribution: "新增全局預算提撥",
    itemContribution: state.editing.budgetContribution ? "編輯項目提撥" : "新增項目提撥",
    movement: state.editing.budgetMovement ? "編輯預算移轉" : "預算項目移轉",
    item: editItem ? "編輯預算項目" : "新增預算項目",
    year: "年度基本設定"
  };

  const desc = {
    globalContribution: "增加年度母池可用預算。公式：目前可用預算 = 前期結轉 + 全局提撥紀錄合計。",
    itemContribution: "增加某個 envelope 的額度，例如出國、Live Music、高端餐飲。",
    movement: "把一個 envelope 的剩餘額度移到另一個 envelope，不會新增收入或支出。",
    item: "建立或修改 envelope 本身，例如日常花費、出國、Live Music。",
    year: "低頻設定：年度、名稱、前期結轉、年度刪除與結轉到下一年。"
  };

  const body = {
    globalContribution: renderGlobalBudgetContributionForm(),
    itemContribution: renderBudgetContributionForm(state.editing.budgetContribution),
    movement: renderBudgetMovementForm(state.editing.budgetMovement),
    item: renderBudgetItemForm(editItem),
    year: renderYearSettingsForm(editYear, current)
  }[mode] || renderGlobalBudgetContributionForm();

  return `
    <div class="card budget-operation-card">
      <div class="card-title-row">
        <h3>預算操作</h3>
        <span class="badge">${escapeHtml(titles[mode] || "")}</span>
      </div>
      <div class="segmented budget-operation-tabs">
        ${budgetOperationTab("globalContribution", "全局提撥")}
        ${budgetOperationTab("itemContribution", "項目提撥")}
        ${budgetOperationTab("movement", "預算移轉")}
        ${budgetOperationTab("item", "預算項目")}
        ${budgetOperationTab("year", "年度設定")}
      </div>
      <p class="metric-sub">${escapeHtml(desc[mode] || "")}</p>
      ${body}
    </div>
  `;
}

function renderGlobalBudgetContributionRecords() {
  const rows = globalBudgetContributionRowsForSelectedYear();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>全局提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderGlobalBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderBudgetContributionRecords() {
  const rows = enrichedBudgetContributionsForSelectedYear();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>項目提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderBudgetMovementRecords() {
  const rows = enrichedBudgetMovementsForSelectedYear();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>預算移轉紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetMovementTable(rows)}
      </div>
    </details>
  `;
}

function renderBudget() {
  const editYear = state.editing.year;
  const editItem = state.editing.budgetItem;
  const current = getCurrentYearSummary();
  const items = budgetItemSummariesForSelectedYear();

  return `
    <div class="grid cols-4">
      ${metricCard("目前可用預算", fmtMoney(current.available_budget), yearBudgetModeLabel(current))}
      ${metricCard("年度總預算", fmtMoney(current.annual_budget), "全局提撥紀錄合計")}
      ${metricCard("已用預算", fmtMoney(current.actual_expense), `${fmtNumber(current.budget_used_pct, 1)}%`, "bad")}
      ${metricCard("剩餘可用預算", fmtMoney(current.remaining_budget), Number(current.remaining_budget || 0) >= 0 ? "預算內" : "超支", Number(current.remaining_budget || 0) >= 0 ? "good" : "bad")}
    </div>

    ${renderBudgetAllocationCards()}

    ${renderBudgetRealityCheck()}

    <div class="card budget-focus-card">
      <div class="card-title-row">
        <h3>預算項目</h3>
        <span class="badge">${items.length} 項</span>
      </div>
      <p class="metric-sub">每月項目主表看本月；每年 + 餘額結轉 = 年度結轉型。也可直接按「結帳」重開週期：主畫面實際歸 0、剩餘銀彈承接，累積資訊仍保留歷史。</p>
      ${renderBudgetItemTable(items)}
    </div>

    ${renderBudgetOperationsCard(editYear, editItem, current)}

    ${renderMonthCloseAdvisor()}

    ${renderAnnualRolloverCard()}

    ${renderGlobalBudgetContributionRecords()}

    ${renderBudgetContributionRecords()}

    ${renderBudgetMovementRecords()}
  `;
}

function renderBudgetItemTable(rows) {
  if (!rows.length) return `<div class="empty">尚無預算項目</div>`;

  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.map(i => {
        const pct = Number(i.used_pct || 0);
        const isMonth = i.primary_scope === "month";
        const isScoped = i.primary_scope !== "year";
        return `
          <div class="mobile-data-card">
            <div class="mobile-data-head">
              <div>
                <strong>${escapeHtml(i.name)}</strong>
                <span>${escapeHtml(labelOf(i.item_type))} · ${escapeHtml(i.category_name || "未分類")} · ${escapeHtml(i.scope_label)}</span>
              </div>
              <div class="mobile-amount">${fmtMoney(i.current_budget_amount)}</div>
            </div>
            <div class="${pct > 100 ? "progress danger" : "progress"}"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div>
            <div class="mobile-data-meta">
              <span>${escapeHtml(i.mode_name || (i.is_contribution_mode ? "提撥型" : "固定型"))}</span>
              <span>${escapeHtml(isMonth ? `${i.current_month}月視角` : "年度視角")}</span>
              <span>實際 ${fmtMoney(i.actual_amount)}</span>
              <span>${Number(i.remaining_amount || 0) >= 0 ? `剩餘 ${fmtMoney(i.remaining_amount)}` : `超支 ${fmtMoney(Math.abs(Number(i.remaining_amount || 0)))}`}</span>
              <span>${fmtNumber(pct, 1)}%</span>
              ${isScoped ? `<span>累積資訊：可用 ${fmtMoney(i.year_budget_amount)} / 實際 ${fmtMoney(i.year_actual_amount)} / 剩餘 ${fmtMoney(i.year_remaining_amount)}</span>` : ""}
            </div>
            <div class="mobile-card-actions">
              <button class="btn small secondary" type="button" data-edit-budget="${i.budget_item_id}">編輯</button>
              <button class="btn small secondary" type="button" data-close-budget="${i.budget_item_id}">結帳</button>
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
        <thead><tr><th>名稱</th><th>類型</th><th>分類</th><th>模式</th><th>視角</th><th>可用</th><th>實際</th><th>剩餘</th><th>使用率</th><th>累積資訊</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.map(i => {
            const pct = Number(i.used_pct || 0);
            const isMonth = i.primary_scope === "month";
        const isScoped = i.primary_scope !== "year";
            return `
              <tr>
                <td>${escapeHtml(i.name)}</td>
                <td><span class="badge">${escapeHtml(labelOf(i.item_type))}</span></td>
                <td>${escapeHtml(i.category_name || "")}</td>
                <td>
                  <span class="badge">${escapeHtml(i.mode_name || (i.is_contribution_mode ? "提撥型" : "固定型"))}</span>
                  <div class="muted">${escapeHtml(i.funding_label)}${i.movement_net ? `｜本視角移轉淨額 ${fmtMoney(i.movement_net)}` : ""}</div>
                </td>
                <td><span class="badge">${escapeHtml(i.scope_label)}</span></td>
                <td class="mono">${fmtMoney(i.current_budget_amount)}</td>
                <td class="mono bad">${fmtMoney(i.actual_amount)}</td>
                <td class="mono ${Number(i.remaining_amount || 0) >= 0 ? "good" : "bad"}">${fmtMoney(i.remaining_amount)}</td>
                <td>
                  <div class="${pct > 100 ? "progress danger" : "progress"}"><span style="width:${Math.min(100, Math.max(0, pct))}%"></span></div>
                  <span class="muted">${fmtNumber(pct, 1)}%</span>
                </td>
                <td class="muted">
                  ${isScoped ? `累積：可用 ${fmtMoney(i.year_budget_amount)}｜實際 ${fmtMoney(i.year_actual_amount)}｜剩餘 ${fmtMoney(i.year_remaining_amount)}` : "—"}
                </td>
                <td class="actions">
                  <button class="btn small secondary" data-edit-budget="${i.budget_item_id}">編輯</button>
                  <button class="btn small secondary" type="button" data-close-budget="${i.budget_item_id}">結帳</button>
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
        ${field("預算驗算", accountCoverageSelect(accountCoverageMode(edit?.note || "")))}
        <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(stripAccountCoverageMarker(edit?.note || ""))}</textarea></div>
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
        <thead><tr><th>名稱</th><th>類型</th><th>預算驗算</th><th>初始餘額</th><th>目前餘額</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.map(a => `
            <tr>
              <td>${escapeHtml(a.name)}</td>
              <td><span class="badge">${escapeHtml(labelOf(a.type))}</span></td>
              <td><span class="badge">${escapeHtml(accountCoverageLabel(accountCoverageMode(a.note || "")))}</span></td>
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


function renderCashflowStatementCard() {
  const rows = cashflowStatementRows();
  return `
    <div class="card">
      <div class="card-title-row"><h3>年度現金流量表</h3><span class="badge">Direct Method</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>區塊</th><th>項目</th><th>金額</th><th>比例</th><th>備註</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.section)}</td><td>${escapeHtml(r.item)}</td><td class="mono">${typeof r.amount === "number" ? fmtMoney(r.amount) : escapeHtml(r.amount)}</td><td>${escapeHtml(r.ratio)}</td><td>${escapeHtml(r.note)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderBudgetVarianceCard() {
  const rows = getBudgetCompareRows(999).sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining)).slice(0, 12);
  if (!rows.length) return `<div class="card"><h3>預算差異分析</h3><div class="empty">尚無預算資料。</div></div>`;
  return `
    <div class="card">
      <div class="card-title-row"><h3>預算差異分析</h3><span class="badge">Variance</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>項目</th><th>目前可用</th><th>實際</th><th>差異</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td class="mono">${fmtMoney(r.planned)}</td><td class="mono bad">${fmtMoney(r.actual)}</td><td class="mono ${r.remaining >= 0 ? "good" : "bad"}">${fmtMoney(r.remaining)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderBurnRateCard() {
  const nowMonth = new Date().getMonth() + 1;
  const rows = budgetItemSummariesForSelectedYear()
    .filter(r => Number(r.current_budget_amount || 0) > 0)
    .map(r => {
      const burn = Number(r.actual_amount || 0) / Math.max(1, nowMonth);
      const runway = burn > 0 ? Number(r.remaining_amount || 0) / burn : null;
      return { ...r, burn, runway };
    })
    .sort((a, b) => Number(a.runway ?? 9999) - Number(b.runway ?? 9999))
    .slice(0, 8);
  return `
    <div class="card">
      <div class="card-title-row"><h3>預算 Burn Rate</h3><span class="badge">Forecast</span></div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>項目</th><th>平均月花費</th><th>剩餘</th><th>估計還能撐</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td class="mono">${fmtMoney(r.burn)}</td><td class="mono">${fmtMoney(r.remaining_amount)}</td><td>${r.runway === null ? "N/A" : `${fmtNumber(r.runway, 1)} 個月`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">尚無資料。</div>`}
    </div>
  `;
}

function renderLongTermTrendCard() {
  const all = allTransactionsEnriched().filter(t => t.status !== "cancelled");
  const grouped = new Map();
  all.forEach(t => {
    const key = `${t.tx_year}-${String(t.tx_month).padStart(2, "0")}`;
    if (!grouped.has(key)) grouped.set(key, { month: key, income: 0, expense: 0, net: 0 });
    const row = grouped.get(key);
    if (t.type === "income") row.income += Number(t.amount || 0);
    if (t.type === "expense") row.expense += Number(t.amount || 0);
    if (t.type === "refund") row.expense -= Number(t.amount || 0);
    row.net = row.income - row.expense;
  });
  const rows = Array.from(grouped.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-24);
  return `
    <div class="card">
      <div class="card-title-row"><h3>長期趨勢</h3><span class="badge">近 24 個月</span></div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>月份</th><th>收入</th><th>淨支出</th><th>淨現金流</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.month)}</td><td class="mono good">${fmtMoney(r.income)}</td><td class="mono bad">${fmtMoney(r.expense)}</td><td class="mono ${r.net >= 0 ? "good" : "bad"}">${fmtMoney(r.net)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">尚無跨月資料。</div>`}
    </div>
  `;
}

function renderDecisionReports() {
  return `
    ${renderCashflowStatementCard()}
    <div class="grid cols-2">
      ${renderBudgetVarianceCard()}
      ${renderBurnRateCard()}
    </div>
    ${renderLongTermTrendCard()}
  `;
}


function reportTable(headers, rows, options = {}) {
  if (!rows.length) return `<div class="empty">${escapeHtml(options.empty || "尚無資料")}</div>`;
  return `
    <div class="table-wrap report-table-wrap">
      <table class="report-table">
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h.label)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>${headers.map(h => {
              const value = typeof h.value === "function" ? h.value(row) : row[h.key];
              const cls = h.className ? ` class="${h.className}"` : "";
              return `<td${cls}>${h.raw ? value : escapeHtml(value ?? "")}</td>`;
            }).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function selectedYearActiveTransactions() {
  return transactionsForSelectedYear().filter(t => t.status !== "cancelled");
}

function categoryExpenseReportRows() {
  const rows = new Map();
  const expenses = selectedYearActiveTransactions().filter(t => ["expense", "refund"].includes(t.type));
  expenses.forEach(t => {
    const key = t.category_name || "未分類";
    if (!rows.has(key)) rows.set(key, { category: key, amount: 0, count: 0, max: 0 });
    const row = rows.get(key);
    const amount = Number(t.amount || 0);
    if (t.type === "expense") {
      row.amount += amount;
      row.count += 1;
      row.max = Math.max(row.max, amount);
    } else if (t.type === "refund") {
      row.amount -= amount;
    }
  });
  const total = Array.from(rows.values()).reduce((sum, r) => sum + Math.max(0, r.amount), 0) || 1;
  return Array.from(rows.values())
    .filter(r => Math.abs(r.amount) > 0 || r.count > 0)
    .map(r => ({
      ...r,
      share: Math.max(0, r.amount) / total,
      avg: r.count ? r.amount / r.count : 0
    }))
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
}

function recurringAnnualizedAmount(r) {
  const amount = Number(r.amount || 0);
  const interval = Math.max(1, Number(r.interval_count || 1));
  const frequency = r.frequency || "monthly";
  if (frequency === "daily") return amount * 365 / interval;
  if (frequency === "weekly") return amount * 52 / interval;
  if (frequency === "monthly") return amount * 12 / interval;
  if (frequency === "quarterly") return amount * 4 / interval;
  if (frequency === "yearly" || frequency === "annual") return amount / interval;
  return amount;
}

function recurringMonthlyAmount(r) {
  return recurringAnnualizedAmount(r) / 12;
}

function recurringReportRows() {
  const accountMap = Object.fromEntries((state.data.accounts || []).map(a => [a.id, a.name]));
  const catMap = Object.fromEntries((state.data.categories || []).map(c => [c.id, c.name]));
  return (state.data.recurring || [])
    .map(r => ({
      name: r.name || "",
      amount: Number(r.amount || 0),
      account: accountMap[r.account_id] || "",
      category: catMap[r.category_id] || "",
      frequency: `${labelOf(r.frequency)} / ${r.interval_count || 1}`,
      monthly: recurringMonthlyAmount(r),
      annual: recurringAnnualizedAmount(r),
      next_due_date: r.next_due_date || "",
      status: r.is_active === false ? "已取消 / 停用" : "使用中",
      merchant: r.merchant || ""
    }))
    .sort((a, b) => Number(b.annual || 0) - Number(a.annual || 0));
}

function monthlyComparisonReportRows() {
  return getMonthlyAnalyticsRows().map(r => {
    const budgetUsed = Number(getCurrentYearSummary().available_budget || 0)
      ? Number(r.expense || 0) / Number(getCurrentYearSummary().available_budget || 1)
      : 0;
    return {
      month: r.label,
      income: r.income,
      expense: r.expense,
      net: r.income - r.expense,
      savingsRate: r.savingsRate === null ? "N/A" : `${fmtNumber(r.savingsRate, 1)}%`,
      budgetShare: `${fmtNumber(budgetUsed * 100, 1)}%`
    };
  });
}

function necessityReportRows() {
  const rows = getHealthRows();
  const total = rows.reduce((sum, r) => sum + Math.max(0, Number(r.amount || 0)), 0) || 1;
  const countMap = new Map();
  expenseRowsForSelectedYear().forEach(t => {
    const key = ["survival", "quality", "luxury", "investment"].includes(t.necessity_level) ? t.necessity_level : "other";
    if (t.type === "expense") countMap.set(key, Number(countMap.get(key) || 0) + 1);
  });
  return rows.map(r => ({
    ...r,
    share: Number(r.amount || 0) / total,
    count: Number(countMap.get(r.key) || 0)
  }));
}

function pnlStatementRows() {
  const tx = selectedYearActiveTransactions();
  const incomeMap = new Map();
  const expenseNatureMap = new Map([
    ["fixed", 0],
    ["variable", 0],
    ["one_time", 0],
    ["other", 0]
  ]);

  tx.forEach(t => {
    const amount = Number(t.amount || 0);
    if (t.type === "income") addAmount(incomeMap, t.category_name || "收入", amount);
    if (t.type === "expense") {
      const key = ["fixed", "variable", "one_time"].includes(t.cashflow_nature) ? t.cashflow_nature : "other";
      expenseNatureMap.set(key, Number(expenseNatureMap.get(key) || 0) + amount);
    }
    if (t.type === "refund") {
      const key = ["fixed", "variable", "one_time"].includes(t.cashflow_nature) ? t.cashflow_nature : "other";
      expenseNatureMap.set(key, Number(expenseNatureMap.get(key) || 0) - amount);
    }
  });

  const incomeRows = mapToSortedRows(incomeMap);
  const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount, 0);
  const fixed = Number(expenseNatureMap.get("fixed") || 0);
  const variable = Number(expenseNatureMap.get("variable") || 0);
  const oneTime = Number(expenseNatureMap.get("one_time") || 0);
  const other = Number(expenseNatureMap.get("other") || 0);
  const totalExpense = fixed + variable + oneTime + other;
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome ? net / totalIncome : null;

  const out = [];
  out.push({ section: "收入", item: "收入合計", amount: totalIncome, ratio: totalIncome ? "100%" : "N/A", note: "" });
  incomeRows.forEach(r => out.push({ section: "收入明細", item: r.name, amount: r.amount, ratio: totalIncome ? `${fmtNumber(r.amount / totalIncome * 100, 1)}%` : "N/A", note: "" }));
  out.push({ section: "支出", item: "固定支出", amount: -fixed, ratio: totalIncome ? `${fmtNumber(fixed / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "支出", item: "變動支出", amount: -variable, ratio: totalIncome ? `${fmtNumber(variable / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "支出", item: "一次性支出", amount: -oneTime, ratio: totalIncome ? `${fmtNumber(oneTime / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "支出", item: "其他 / 未標記", amount: -other, ratio: totalIncome ? `${fmtNumber(other / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "淨額", item: "淨收支", amount: net, ratio: totalIncome ? `${fmtNumber(net / totalIncome * 100, 1)}%` : "N/A", note: "" });
  out.push({ section: "淨額", item: "儲蓄率", amount: savingsRate === null ? "N/A" : `${fmtNumber(savingsRate * 100, 1)}%`, ratio: "", note: "(收入 − 淨支出) / 收入" });
  return out;
}

function balanceSheetReportRows() {
  const rows = accountBalanceRowsMerged ? accountBalanceRowsMerged() : (state.data.accountBalances || []);
  const assetTypes = ["cash", "bank", "e_wallet", "asset", "other"];
  const liabilityTypes = ["credit_card", "loan"];
  const out = [];

  rows.filter(a => a.is_active !== false).forEach(a => {
    const balance = Number(a.current_balance ?? a.initial_balance ?? 0);
    const type = a.type || "other";
    if (liabilityTypes.includes(type) || balance < 0) {
      out.push({
        section: "負債",
        account: a.name || "",
        type: labelOf(type),
        amount: -Math.abs(balance),
        note: type === "asset" ? "負值資產帳戶列為負債" : ""
      });
    } else if (assetTypes.includes(type)) {
      out.push({
        section: "資產",
        account: a.name || "",
        type: labelOf(type),
        amount: balance,
        note: type === "asset" ? "僅採 App 內維護的帳戶餘額；未納入外部股票 / ETF 即時市值" : ""
      });
    }
  });

  const assets = out.filter(r => r.section === "資產").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const liabilities = out.filter(r => r.section === "負債").reduce((sum, r) => sum + Math.abs(Number(r.amount || 0)), 0);
  out.push({ section: "摘要", account: "資產合計", type: "", amount: assets, note: "" });
  out.push({ section: "摘要", account: "負債合計", type: "", amount: -liabilities, note: "" });
  out.push({ section: "摘要", account: "淨資產", type: "", amount: assets - liabilities, note: "股票 / ETF 市值若不在本 App 管理，未納入" });
  return out;
}

function renderCategoryExpenseReport() {
  const rows = categoryExpenseReportRows();
  return `
    <details class="card collapsible-card" open>
      <summary class="collapsible-summary"><span>分類支出表</span><span class="badge">${rows.length} 類</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "分類", key: "category" },
          { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
          { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
          { label: "筆數", key: "count" },
          { label: "平均單筆", value: r => fmtMoney(r.avg), className: "mono" },
          { label: "最大單筆", value: r => fmtMoney(r.max), className: "mono" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderRecurringReport() {
  const rows = recurringReportRows();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary"><span>固定支出 / 訂閱表</span><span class="badge">${rows.length} 項</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "服務名稱", key: "name" },
          { label: "月化成本", value: r => fmtMoney(r.monthly), className: "mono" },
          { label: "年化成本", value: r => fmtMoney(r.annual), className: "mono" },
          { label: "付款帳戶", key: "account" },
          { label: "分類", key: "category" },
          { label: "週期", key: "frequency" },
          { label: "下次扣款", key: "next_due_date" },
          { label: "狀態", key: "status" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderMonthlyComparisonReport() {
  const rows = monthlyComparisonReportRows();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary"><span>月度比較表</span><span class="badge">${rows.length} 月</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "月份", key: "month" },
          { label: "收入", value: r => fmtMoney(r.income), className: "mono" },
          { label: "支出", value: r => fmtMoney(r.expense), className: "mono" },
          { label: "淨收支", value: r => fmtMoney(r.net), className: "mono" },
          { label: "儲蓄率", key: "savingsRate" },
          { label: "占目前可用預算", key: "budgetShare" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderNecessityReport() {
  const rows = necessityReportRows();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary"><span>必要程度分析</span><span class="badge">necessity_level</span></summary>
      <div class="collapsible-body">
        <p class="metric-sub">若大量交易停留在「其他」，這張表會失真；快速模板最好自動帶入必要程度。</p>
        ${reportTable([
          { label: "必要程度", key: "name" },
          { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
          { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
          { label: "筆數", key: "count" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderPnlReport() {
  const rows = pnlStatementRows();
  return `
    <details class="card collapsible-card" open>
      <summary class="collapsible-summary"><span>收支損益表 / 個人損益表</span><span class="badge">${state.selectedBudgetYear}</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "區塊", key: "section" },
          { label: "項目", key: "item" },
          { label: "金額", value: r => typeof r.amount === "number" ? fmtMoney(r.amount) : r.amount, className: "mono" },
          { label: "比例", key: "ratio" },
          { label: "備註", key: "note" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderBalanceSheetReport() {
  const rows = balanceSheetReportRows();
  return `
    <details class="card collapsible-card" open>
      <summary class="collapsible-summary"><span>資產負債表</span><span class="badge">App 內帳戶</span></summary>
      <div class="collapsible-body">
        <p class="metric-sub">只採本 App 內帳戶餘額；股票 / ETF 市值如果不在本 App 管理，這張表不會納入外部即時市值。</p>
        ${reportTable([
          { label: "區塊", key: "section" },
          { label: "帳戶 / 項目", key: "account" },
          { label: "類型", key: "type" },
          { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
          { label: "備註", key: "note" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderAddedStatementReports() {
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>新增表格式報表</h3>
        <span class="badge">v54</span>
      </div>
      <p class="metric-sub">這些是可讀、可匯出的表格式報表；比單純圖表更適合對帳與檢查口徑。v54 另外把分類支出表、固定支出 / 訂閱表、必要程度分析做成圖表。</p>
    </div>

    ${renderAdditionalReportCharts()}

    <div class="grid cols-2">
      ${renderPnlReport()}
      ${renderBalanceSheetReport()}
    </div>
    <div class="grid cols-2">
      ${renderCategoryExpenseReport()}
      ${renderRecurringReport()}
      ${renderMonthlyComparisonReport()}
      ${renderNecessityReport()}
    </div>
  `;
}


function renderAdditionalReportCharts() {
  return `
    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row">
          <h3>分類支出圖表</h3>
          <span class="badge">長條圖</span>
        </div>
        <div class="chart-canvas-wrap"><canvas id="reportsCategoryExpenseTableChart"></canvas></div>
        <p class="chart-note">依分類支出表繪製。看哪幾類最吃預算。</p>
      </div>

      <div class="card chart-card">
        <div class="card-title-row">
          <h3>固定支出 / 訂閱圖表</h3>
          <span class="badge">長條圖</span>
        </div>
        <div class="chart-canvas-wrap"><canvas id="reportsRecurringChart"></canvas></div>
        <p class="chart-note">依固定支出 / 訂閱表繪製，使用年化成本排序。小月費容易被低估，所以用年化看更清楚。</p>
      </div>

      <div class="card chart-card">
        <div class="card-title-row">
          <h3>必要程度分析圖表</h3>
          <span class="badge">圓環圖</span>
        </div>
        <div class="chart-canvas-wrap"><canvas id="reportsNecessityAnalysisChart"></canvas></div>
        <p class="chart-note">依必要程度分析表繪製。若很多交易是「其他」，這張圖會失真。</p>
      </div>
    </div>
  `;
}


function reportModeTab(group, mode, label) {
  const active = state[group] === mode ? "active" : "";
  return `<button class="seg-btn ${active}" type="button" data-report-group="${escapeHtml(group)}" data-report-mode="${escapeHtml(mode)}">${escapeHtml(label)}</button>`;
}

function reportTabs(group, tabs) {
  return `<div class="segmented report-mode-tabs">${tabs.map(t => reportModeTab(group, t.mode, t.label)).join("")}</div>`;
}

function renderSelectedChartReport() {
  const mode = state.reportChartMode || "categoryExpense";
  const map = {
    categoryExpense: {
      title: "分類支出圖表",
      badge: "長條圖",
      canvas: "reportsCategoryExpenseTableChart",
      note: "依分類支出表繪製。看哪幾類最吃預算。"
    },
    recurring: {
      title: "固定支出 / 訂閱圖表",
      badge: "長條圖",
      canvas: "reportsRecurringChart",
      note: "依固定支出 / 訂閱表繪製，使用年化成本排序。小月費容易被低估，所以用年化看更清楚。"
    },
    necessity: {
      title: "必要程度分析圖表",
      badge: "圓環圖",
      canvas: "reportsNecessityAnalysisChart",
      note: "依必要程度分析表繪製。若很多交易是「其他」，這張圖會失真。"
    },
    necessityTrend: {
      title: "必要程度月度趨勢",
      badge: "折線圖",
      canvas: "reportsHealthTrend",
      note: "看奢侈娛樂、生活品質、自我投資等必要程度是否逐月膨脹。"
    },
    monthly: {
      title: state.filters.chartScope === "month" ? "本月日度收支趨勢" : "月度收支趨勢",
      badge: "折線圖",
      canvas: "reportsMonthlyChart",
      note: `${chartScopeText()}。用來看收支節奏是否失控。`
    },
    savingsRate: {
      title: "儲蓄率",
      badge: "每月",
      canvas: "reportsSavingsRateChart",
      note: "公式：(收入 − 淨支出) / 收入。轉帳不計入收入或支出。"
    },
    netWorth: {
      title: "帳面淨資產",
      badge: "帳戶餘額",
      canvas: "reportsNetWorthChart",
      note: "依帳戶期初餘額 + 累積收支估算；不等於外部股票 / ETF 即時市值。"
    },
    pareto: {
      title: "帕累托分析：哪幾類吃掉大部分支出",
      badge: "80/20",
      canvas: "reportsParetoChart",
      note: renderParetoSummary(),
      rawNote: true,
      tall: true
    },
    budgetUsage: {
      title: "年度預算使用圖",
      badge: "圓環圖",
      canvas: "reportsBudgetChart",
      note: "看年度可用預算被使用掉多少。"
    },
    categoryNet: {
      title: "分類淨支出排行",
      badge: "長條圖",
      canvas: "reportsCategoryChart",
      note: `${chartScopeText()}。退款會從原分類扣回。`
    },
    budgetCompare: {
      title: "預算 vs 實際",
      badge: "橫向長條圖",
      canvas: "reportsBudgetCompareChart",
      note: "依預算項目比較目前可用額度與實際支出。"
    }
  };
  const c = map[mode] || map.categoryExpense;
  return `
    <div class="chart-report-body">
      <div class="card-title-row">
        <h3>${escapeHtml(c.title)}</h3>
        <span class="badge">${escapeHtml(c.badge)}</span>
      </div>
      <div class="chart-canvas-wrap ${c.tall ? "tall" : ""}"><canvas id="${escapeHtml(c.canvas)}"></canvas></div>
      ${c.rawNote ? c.note : `<p class="chart-note">${escapeHtml(c.note || "")}</p>`}
    </div>
  `;
}

function renderChartReportCenter() {
  return `
    <div class="card chart-card report-center-card">
      <div class="card-title-row">
        <h3>圖表報表</h3>
        <span class="badge">模式切換</span>
      </div>
      ${reportTabs("reportChartMode", [
        { mode: "categoryExpense", label: "分類支出" },
        { mode: "recurring", label: "固定支出 / 訂閱" },
        { mode: "necessity", label: "必要程度" },
        { mode: "necessityTrend", label: "必要程度趨勢" },
        { mode: "monthly", label: "月度比較" },
        { mode: "savingsRate", label: "儲蓄率" },
        { mode: "netWorth", label: "帳面淨資產" },
        { mode: "pareto", label: "帕累托" },
        { mode: "budgetUsage", label: "預算使用" },
        { mode: "categoryNet", label: "分類淨支出" },
        { mode: "budgetCompare", label: "預算 vs 實際" }
      ])}
      ${renderSelectedChartReport()}
    </div>
  `;
}

function renderSelectedTableReport() {
  const mode = state.reportTableMode || "pnl";

  if (mode === "cashflow") {
    return reportTable([
      { label: "區塊", key: "section" },
      { label: "項目", key: "item" },
      { label: "金額", value: r => typeof r.amount === "number" ? fmtMoney(r.amount) : r.amount, className: "mono" },
      { label: "比例", key: "ratio" },
      { label: "備註", key: "note" }
    ], cashflowStatementRows());
  }

  if (mode === "pnl") {
    return reportTable([
      { label: "區塊", key: "section" },
      { label: "項目", key: "item" },
      { label: "金額", value: r => typeof r.amount === "number" ? fmtMoney(r.amount) : r.amount, className: "mono" },
      { label: "比例", key: "ratio" },
      { label: "備註", key: "note" }
    ], pnlStatementRows());
  }

  if (mode === "balance") {
    return `
      <p class="metric-sub">只採本 App 內帳戶餘額；股票 / ETF 市值如果不在本 App 管理，這張表不會納入外部即時市值。</p>
      ${reportTable([
        { label: "區塊", key: "section" },
        { label: "帳戶 / 項目", key: "account" },
        { label: "類型", key: "type" },
        { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
        { label: "備註", key: "note" }
      ], balanceSheetReportRows())}
    `;
  }

  if (mode === "category") {
    return reportTable([
      { label: "分類", key: "category" },
      { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
      { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
      { label: "筆數", key: "count" },
      { label: "平均單筆", value: r => fmtMoney(r.avg), className: "mono" },
      { label: "最大單筆", value: r => fmtMoney(r.max), className: "mono" }
    ], categoryExpenseReportRows());
  }

  if (mode === "recurring") {
    return reportTable([
      { label: "服務名稱", key: "name" },
      { label: "月化成本", value: r => fmtMoney(r.monthly), className: "mono" },
      { label: "年化成本", value: r => fmtMoney(r.annual), className: "mono" },
      { label: "付款帳戶", key: "account" },
      { label: "分類", key: "category" },
      { label: "週期", key: "frequency" },
      { label: "下次扣款", key: "next_due_date" },
      { label: "狀態", key: "status" }
    ], recurringReportRows());
  }

  if (mode === "monthly") {
    return reportTable([
      { label: "月份", key: "month" },
      { label: "收入", value: r => fmtMoney(r.income), className: "mono" },
      { label: "支出", value: r => fmtMoney(r.expense), className: "mono" },
      { label: "淨收支", value: r => fmtMoney(r.net), className: "mono" },
      { label: "儲蓄率", key: "savingsRate" },
      { label: "占目前可用預算", key: "budgetShare" }
    ], monthlyComparisonReportRows());
  }

  if (mode === "necessity") {
    return `
      <p class="metric-sub">若大量交易停留在「其他」，這張表會失真；快速模板最好自動帶入必要程度。</p>
      ${reportTable([
        { label: "必要程度", key: "name" },
        { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
        { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
        { label: "筆數", key: "count" }
      ], necessityReportRows())}
    `;
  }

  return `<div class="empty">未知報表模式。</div>`;
}

function renderTableReportCenter() {
  const labels = {
    cashflow: "現金流量表",
    pnl: "個人損益表",
    balance: "資產負債表",
    category: "分類支出表",
    recurring: "固定支出 / 訂閱表",
    monthly: "月度比較表",
    necessity: "必要程度分析表"
  };
  return `
    <div class="card report-center-card">
      <div class="card-title-row">
        <h3>表格式報表</h3>
        <span class="badge">${escapeHtml(labels[state.reportTableMode] || labels.pnl)}</span>
      </div>
      ${reportTabs("reportTableMode", [
        { mode: "cashflow", label: "現金流量表" },
        { mode: "pnl", label: "個人損益表" },
        { mode: "balance", label: "資產負債表" },
        { mode: "category", label: "分類支出表" },
        { mode: "recurring", label: "固定支出 / 訂閱表" },
        { mode: "monthly", label: "月度比較表" },
        { mode: "necessity", label: "必要程度分析表" }
      ])}
      <div class="report-table-mode-body">
        ${renderSelectedTableReport()}
      </div>
    </div>
  `;
}

function renderSelectedAuditReport() {
  const mode = state.reportAuditMode || "budgetReality";

  if (mode === "budgetReality") {
    return renderBudgetRealityCheck();
  }

  if (mode === "budgetExecution") {
    const rows = budgetItemSummariesForSelectedYear();
    return `
      <div class="card inner-report-card">
        <div class="card-title-row">
          <h3>預算執行表</h3>
          <span class="badge">${rows.length} 項</span>
        </div>
        ${renderBudgetItemTable(rows)}
      </div>
    `;
  }

  if (mode === "tAccount") {
    return `
      <div class="card inner-report-card">
        <div class="card-title-row">
          <h3>T 字帳</h3>
          <span class="badge">依科目分組</span>
        </div>
        <p class="metric-sub">支出：借記費用、貸記資產；收入：借記資產、貸記收入；轉帳：借記轉入資產、貸記轉出資產。</p>
        ${renderTAccountCards()}
      </div>
    `;
  }

  if (mode === "entries") {
    return `
      <div class="card inner-report-card">
        <div class="card-title-row">
          <h3>分錄明細</h3>
          <span class="badge">雙分錄</span>
        </div>
        ${renderTAccountTable()}
      </div>
    `;
  }

  return `<div class="empty">未知驗算模式。</div>`;
}

function renderAuditReportCenter() {
  return `
    <div class="card report-center-card audit-report-card">
      <div class="card-title-row">
        <h3>會計 / 底層驗算</h3>
        <span class="badge">查帳用</span>
      </div>
      ${reportTabs("reportAuditMode", [
        { mode: "budgetReality", label: "預算真實性驗算" },
        { mode: "budgetExecution", label: "預算執行表" },
        { mode: "tAccount", label: "T 字帳" },
        { mode: "entries", label: "分錄明細" }
      ])}
      ${renderSelectedAuditReport()}
    </div>
  `;
}

function renderReports() {
  return `
    ${renderChartToolbar()}
    ${renderAnalyticsSummaryCards()}

    ${renderChartReportCenter()}

    ${renderTableReportCenter()}

    ${renderAuditReportCenter()}

    <details class="card wrapped-card">
      <summary class="collapsible-summary">
        <span>年度財務 Wrapped</span>
        <span class="badge">${state.selectedBudgetYear}</span>
      </summary>
      <div class="collapsible-body">
        ${renderFinancialWrapped()}
      </div>
    </details>
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
  const rows = activeMonthBuckets(month => ({
    label: `${month}月`,
    month,
    survival: 0,
    quality: 0,
    luxury: 0,
    investment: 0,
    other: 0
  }));
  const map = new Map(rows.map(r => [r.month, r]));
  expenseRowsForSelectedYear().forEach(t => {
    const month = Number(t.tx_month || 0);
    const row = map.get(month);
    if (!row) return;
    const key = ["survival", "quality", "luxury", "investment"].includes(t.necessity_level) ? t.necessity_level : "other";
    row[key] += t.type === "refund" ? -Number(t.amount || 0) : Number(t.amount || 0);
  });
  return rows;
}


function selectedYearTransactionMonths() {
  return transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .map(t => Number(t.tx_month || 0))
    .filter(m => m >= 1 && m <= 12);
}

function activeMonthRange() {
  const year = Number(state.selectedBudgetYear);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const months = selectedYearTransactionMonths();
  const firstTxMonth = months.length ? Math.min(...months) : (year === currentYear ? currentMonth : 1);
  const lastTxMonth = months.length ? Math.max(...months) : firstTxMonth;

  const endMonth = year === currentYear ? Math.max(currentMonth, lastTxMonth) : lastTxMonth;
  return {
    startMonth: firstTxMonth,
    endMonth: Math.min(12, Math.max(firstTxMonth, endMonth))
  };
}

function activeMonthBuckets(factory) {
  const { startMonth, endMonth } = activeMonthRange();
  const rows = [];
  for (let month = startMonth; month <= endMonth; month += 1) {
    rows.push(factory(month));
  }
  return rows;
}

function getMonthlyAnalyticsRows() {
  const rows = activeMonthBuckets(month => ({
    label: `${month}月`,
    month,
    income: 0,
    expense: 0,
    saving: 0,
    savingsRate: null
  }));

  const map = new Map(rows.map(r => [r.month, r]));
  transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .forEach(t => {
      const month = Number(t.tx_month || 0);
      const row = map.get(month);
      if (!row) return;
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
  const monthRows = activeMonthBuckets(month => ({ label: `${month}月`, month, netWorth: null }));

  return monthRows.map(row => {
    allTx
      .filter(t => Number(t.tx_year) === Number(state.selectedBudgetYear) && Number(t.tx_month) === row.month)
      .forEach(t => {
        if (t.type === "income") cumulative += Number(t.amount || 0);
        if (t.type === "expense") cumulative -= Number(t.amount || 0);
        if (t.type === "refund") cumulative += Number(t.amount || 0);
      });
    return { ...row, netWorth: initial + cumulative };
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
  const txById = new Map((state.data.transactions || []).map(t => [t.id, enrichTransaction(t)]));

  const addEntry = (name, side, entry, tx) => {
    if (!name) return;
    if (!ledger.has(name)) {
      ledger.set(name, { name, debit: [], credit: [], debitTotal: 0, creditTotal: 0 });
    }
    const row = ledger.get(name);
    const amount = Number(entry.amount || 0);
    const e = {
      date: entry.entry_date || tx?.transaction_date || "",
      amount,
      memo: entry.note || tx?.merchant || tx?.note || labelOf(tx?.type)
    };
    row[side].push(e);
    if (side === "debit") row.debitTotal += amount;
    if (side === "credit") row.creditTotal += amount;
  };

  (state.data.transactionEntries || [])
    .filter(e => {
      const year = e.entry_date ? Number(String(e.entry_date).slice(0, 4)) : null;
      const tx = txById.get(e.transaction_id);
      return year === Number(state.selectedBudgetYear) && (!tx || tx.status !== "cancelled");
    })
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .forEach(e => addEntry(e.label || "未命名分錄", e.side, e, txById.get(e.transaction_id)));

  return Array.from(ledger.values())
    .sort((a, b) => {
      const order = name => {
        if (name.includes("現金") || name.startsWith("銀行") || name.startsWith("信用卡") || name.startsWith("資產")) return 1;
        if (name.startsWith("費用")) return 2;
        if (name.startsWith("收入")) return 3;
        if (name.startsWith("資產調整")) return 4;
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
  const txById = new Map((state.data.transactions || []).map(t => [t.id, enrichTransaction(t)]));
  const rows = (state.data.transactionEntries || [])
    .filter(e => e.entry_date && Number(String(e.entry_date).slice(0, 4)) === Number(state.selectedBudgetYear))
    .map(e => ({ ...e, tx: txById.get(e.transaction_id) }))
    .filter(e => !e.tx || e.tx.status !== "cancelled")
    .sort((a, b) => String(b.entry_date || "").localeCompare(String(a.entry_date || "")))
    .slice(0, 160);

  if (!rows.length) return `<div class="empty">尚無分錄資料。請到設定執行「重建分錄」。</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>日期</th><th>借貸</th><th>科目</th><th>金額</th><th>來源交易</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${escapeHtml(r.entry_date)}</td>
          <td><span class="badge">${r.side === "debit" ? "借方" : "貸方"}</span></td>
          <td>${escapeHtml(r.label || "")}</td>
          <td class="mono">${fmtMoney(r.amount)}</td>
          <td>${escapeHtml(r.tx?.merchant || r.tx?.note || labelOf(r.tx?.type))}</td>
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
    ${renderDatabaseStatusCard()}

    <div class="grid cols-2">
      <div class="card">
        <h3>連線設定</h3>
        <p class="metric-sub">狀態已整合為「資料庫狀態」：連線、最後讀取、最後寫入。不要再分開看 Supabase / 後端 / 資料庫。</p>
        <p class="metric-sub">若讀不到資料，先確認：已在資料庫編輯器執行結構檔，且沒有直接開啟列層級安全規則導致缺少存取規則。</p>
      </div>
      <div class="card">
        <h3>資料匯出</h3>
        <p class="metric-sub">可匯出流水帳 CSV、現金流量表 CSV，或完整 Excel .xlsx 工作簿。</p>
        <div class="btn-row">
          <button class="btn secondary" id="exportCsvBtn">匯出流水帳 CSV</button>
          <button class="btn secondary" id="exportCashflowCsvBtn">匯出現金流量表 CSV</button>
          <button class="btn secondary" id="exportXlsxBtn">匯出 Excel .xlsx</button>
          <button class="btn secondary" id="rebuildEntriesBtn">重建分錄</button>
          <button class="btn secondary" id="downloadJsonBtn">下載暫存資料</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>預設常用帳戶</h3>
      <p class="metric-sub">手機快速記帳會優先帶入這些帳戶。設定存在本機瀏覽器，不會寫入資料庫。</p>
      <form id="preferencesForm" class="form-grid two">
        ${field("支出預設帳戶", `<select class="input" name="default_account_expense">${accountOptions(defaultAccountIdFor("expense"))}</select>`)}
        ${field("收入預設帳戶", `<select class="input" name="default_account_income">${accountOptions(defaultAccountIdFor("income"))}</select>`)}
        ${field("轉帳預設轉出帳戶", `<select class="input" name="default_account_transfer">${accountOptions(defaultAccountIdFor("transfer"))}</select>`)}
        ${field("退款預設帳戶", `<select class="input" name="default_account_refund">${accountOptions(defaultAccountIdFor("refund"))}</select>`)}
        <div class="wide btn-row">
          <button class="btn" type="submit">儲存偏好</button>
        </div>
      </form>
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

  const buckets = activeMonthBuckets(month => ({ label: `${month}月`, month, income: 0, expense: 0, net: 0 }));
  const map = new Map(buckets.map(b => [b.month, b]));
  rows.forEach(t => {
    const month = Number(t.tx_month || 0);
    const bucket = map.get(month);
    if (!bucket) return;
    if (t.type === "income") bucket.income += Number(t.amount || 0);
    if (t.type === "expense") bucket.expense += Number(t.amount || 0);
    if (t.type === "refund") bucket.expense -= Number(t.amount || 0);
  });
  buckets.forEach(b => { b.net = b.income - b.expense; });
  return buckets;
}

function getBudgetCompareRows(limit = 8) {
  let rows = budgetItemSummariesForSelectedYear()
    .filter(r => Number(r.current_budget_amount || r.planned_amount || 0) > 0);

  if (state.filters.chartCategory) {
    rows = rows.filter(r => r.category_id === state.filters.chartCategory);
  }

  return rows
    .sort((a, b) => Number(b.current_budget_amount || 0) - Number(a.current_budget_amount || 0))
    .slice(0, limit)
    .map(r => ({
      name: r.name,
      planned: Number(r.current_budget_amount || 0),
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

  const tooltipValue = ctx => {
    // v34：修正 line chart tooltip。
    // Chart.js 線圖 parsed.x 是資料點索引，不能拿來當金額；金額應取 parsed.y。
    if (ctx.chart?.config?.type === "line") return ctx.parsed?.y;
    if (ctx.chart?.config?.type === "bar") return ctx.parsed?.x ?? ctx.parsed?.y;
    if (typeof ctx.parsed === "number") return ctx.parsed;
    return ctx.parsed?.y ?? ctx.parsed?.x ?? 0;
  };

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 240 },
    plugins: {
      legend: { labels: { color: theme.text, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8 } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset?.label || ctx.label}：${moneyTooltip(tooltipValue(ctx))}` } }
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


  const makeCategoryExpenseReportBar = id => {
    const el = document.getElementById(id);
    const rows = categoryExpenseReportRows().slice(0, 10);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.category),
        datasets: [
          { label: "分類支出", data: rows.map(r => r.amount), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false }
        ]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.label}：${moneyTooltip(ctx.parsed.x)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted }, grid: { display: false } }
        }
      }
    });
  };

  const makeRecurringReportBar = id => {
    const el = document.getElementById(id);
    const rows = recurringReportRows().slice(0, 10);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [
          { label: "年化成本", data: rows.map(r => r.annual), backgroundColor: theme.purple, borderRadius: 10, borderSkipped: false },
          { label: "月化成本", data: rows.map(r => r.monthly), backgroundColor: "rgba(96, 165, 250, 0.35)", borderRadius: 10, borderSkipped: false }
        ]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}：${moneyTooltip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted, maxRotation: 0, autoSkip: false }, grid: { display: false } },
          y: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } }
        }
      }
    });
  };

  const makeNecessityAnalysisDoughnut = id => {
    const el = document.getElementById(id);
    const rows = necessityReportRows().filter(r => Number(r.amount || 0) > 0);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{
          data: rows.map(r => r.amount),
          backgroundColor: [theme.green, theme.blue, theme.orange, theme.purple, theme.red].slice(0, rows.length),
          borderWidth: 0
        }]
      },
      options: {
        ...baseOptions,
        cutout: "70%",
        plugins: {
          ...baseOptions.plugins,
          legend: { ...baseOptions.plugins.legend, position: "bottom" },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 1;
                const value = Number(ctx.parsed || 0);
                return `${ctx.label}：${moneyTooltip(value)}（${fmtNumber(value / total * 100, 1)}%）`;
              }
            }
          }
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
  makeCategoryExpenseReportBar("reportsCategoryExpenseTableChart");
  makeRecurringReportBar("reportsRecurringChart");
  makeNecessityAnalysisDoughnut("reportsNecessityAnalysisChart");
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
    const message = `${action}失敗：${formatSupabaseError(response.error)}｜表：${table}`;
    markWriteStatus(false, { action, table, error: formatSupabaseError(response.error) });
    throw new Error(message);
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
  markWriteStatus(true, { action, table });
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
    markWriteStatus(false, { action: "刪除", table, error: formatSupabaseError(response.error) });
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
    const message = `刪除驗證失敗：資料仍存在。表：${table}，id=${id}`;
    markWriteStatus(false, { action: "刪除", table, error: message });
    throw new Error(message);
  }

  markWriteStatus(true, { action: "刪除", table });
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
      case "budgetContributionForm":
        saved = await saveBudgetContribution(form);
        break;
      case "globalBudgetContributionForm":
        saved = await saveGlobalBudgetContribution(form);
        break;
      case "budgetMovementForm":
        saved = await saveBudgetMovement(form);
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
      case "preferencesForm":
        savePreferences(form);
        saved = { id: "local" };
        break;
      default:
        throw new Error(`未知表單：${formId || "無 id"}`);
    }

    await loadAll();
    clearEditing();
    render();
    showAlert(`v55 驗證通過：${tableLabel(formToTable(formId))} 已真正寫入資料庫｜id=${escapeHtml(saved?.id || "無")}`, "good");
  } catch (error) {
    showAlert(`儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}

function formToTable(formId) {
  return {
    txForm: "transactions",
    yearForm: "years",
    budgetItemForm: "budget_items",
    budgetContributionForm: "budget_contributions",
    budgetMovementForm: "budget_movements",
    accountForm: "accounts",
    categoryForm: "categories",
    tagForm: "tags",
    recurringForm: "recurring_transactions",
    creditCardForm: "credit_cards",
    loanForm: "loans",
    goalForm: "goals",
    quickTemplateForm: "quick_templates",
    preferencesForm: "本機偏好"
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
    showAlert(`v55 驗證通過：訂閱已真正寫入資料庫｜${escapeHtml(saved.name)}｜目前列表 ${rows.length} 筆。`, "good");
  } catch (error) {
    showAlert(`訂閱儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}


function savePreferences(form) {
  const d = readForm(form);
  setAppPreference("default_account_expense", d.default_account_expense);
  setAppPreference("default_account_income", d.default_account_income);
  setAppPreference("default_account_transfer", d.default_account_transfer);
  setAppPreference("default_account_refund", d.default_account_refund);
  return { id: "local" };
}


function accountLabel(accountId) {
  const acc = state.data.accounts.find(a => a.id === accountId) || {};
  return `${labelOf(acc.type || "asset")}：${acc.name || "未命名帳戶"}`;
}

function categoryLabel(categoryId, prefix = "分類") {
  const cat = state.data.categories.find(c => c.id === categoryId) || {};
  return `${prefix}：${cat.name || "未分類"}`;
}

function makeEntry(tx, side, payload = {}) {
  return {
    transaction_id: tx.id,
    entry_date: tx.transaction_date,
    side,
    entry_type: payload.entry_type || "account",
    account_id: payload.account_id || null,
    category_id: payload.category_id || null,
    budget_item_id: payload.budget_item_id || null,
    label: payload.label || "",
    amount: Math.abs(Number(payload.amount ?? tx.amount ?? 0)),
    note: payload.note || tx.note || null,
    sort_order: payload.sort_order || 0
  };
}

async function replaceTransactionSplits(transactionId, splitRows) {
  await state.client.from("transaction_splits").delete().eq("transaction_id", transactionId);
  if (!splitRows.length) return [];
  const rows = splitRows.map(s => ({ transaction_id: transactionId, ...s }));
  const { data, error } = await state.client.from("transaction_splits").insert(rows).select("*");
  if (error) throw new Error(`拆帳寫入失敗：${formatSupabaseError(error)}`);
  return data || [];
}

async function replaceTransactionEntries(transactionId, entries) {
  await state.client.from("transaction_entries").delete().eq("transaction_id", transactionId);
  if (!entries.length) return [];
  const { data, error } = await state.client.from("transaction_entries").insert(entries).select("*");
  if (error) throw new Error(`分錄寫入失敗：${formatSupabaseError(error)}`);
  return data || [];
}

function buildEntriesForTransaction(tx, splitRows = []) {
  const amount = Math.abs(Number(tx.amount || 0));
  const memo = tx.merchant || tx.note || labelOf(tx.type);
  const entries = [];
  const add = (side, payload) => entries.push(makeEntry(tx, side, { note: memo, ...payload }));

  if (tx.type === "expense") {
    const splits = splitRows.length ? splitRows : [{ category_id: tx.category_id, budget_item_id: tx.budget_item_id, amount }];
    splits.forEach((s, idx) => add("debit", {
      entry_type: "expense",
      category_id: s.category_id || null,
      budget_item_id: s.budget_item_id || null,
      label: categoryLabel(s.category_id, "費用"),
      amount: s.amount,
      sort_order: idx + 1
    }));
    add("credit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 99 });
  } else if (tx.type === "refund") {
    add("debit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 1 });
    const splits = splitRows.length ? splitRows : [{ category_id: tx.category_id, budget_item_id: tx.budget_item_id, amount }];
    splits.forEach((s, idx) => add("credit", {
      entry_type: "expense",
      category_id: s.category_id || null,
      budget_item_id: s.budget_item_id || null,
      label: categoryLabel(s.category_id, "費用退款"),
      amount: s.amount,
      sort_order: idx + 2
    }));
  } else if (tx.type === "income") {
    add("debit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 1 });
    add("credit", { entry_type: "income", category_id: tx.category_id || null, label: categoryLabel(tx.category_id, "收入"), amount, sort_order: 2 });
  } else if (tx.type === "transfer") {
    add("debit", { entry_type: "account", account_id: tx.to_account_id, label: accountLabel(tx.to_account_id), amount, sort_order: 1 });
    add("credit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 2 });
  } else if (tx.type === "asset_adjustment") {
    const direction = tx.adjustment_direction || "increase";
    if (direction === "decrease") {
      add("debit", { entry_type: "adjustment", label: "資產調整：減少", amount, sort_order: 1 });
      add("credit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 2 });
    } else {
      add("debit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 1 });
      add("credit", { entry_type: "adjustment", label: "資產調整：增加", amount, sort_order: 2 });
    }
  }

  const debit = entries.filter(e => e.side === "debit").reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const credit = entries.filter(e => e.side === "credit").reduce((sum, e) => sum + Number(e.amount || 0), 0);
  if (Math.round(debit) !== Math.round(credit)) {
    throw new Error(`借貸不平衡：借方 ${debit}，貸方 ${credit}`);
  }

  return entries;
}

async function rebuildEntriesForTransaction(tx) {
  const rawSplits = (state.data.transactionSplits || []).filter(s => s.transaction_id === tx.id);
  const splitRows = rawSplits.map(s => ({
    category_id: s.category_id,
    budget_item_id: s.budget_item_id,
    amount: Number(s.amount || 0),
    note: s.note || null
  }));
  const entries = buildEntriesForTransaction(tx, splitRows);
  return await replaceTransactionEntries(tx.id, entries);
}

async function rebuildAllTransactionEntries() {
  let count = 0;
  const txRows = state.data.transactions.filter(t => t.status !== "cancelled");
  for (const tx of txRows) {
    await rebuildEntriesForTransaction(tx);
    count += 1;
  }
  await loadAll();
  render();
  showAlert(`已重建 ${count} 筆交易的分錄。`, "good");
}

async function saveTransaction(form) {
  const d = readForm(form);
  const type = d.type || state.draftTxType || "expense";
  if (!d.account_id) throw new Error(type === "income" ? "請選擇入帳帳戶" : type === "transfer" ? "請選擇轉出帳戶" : "請選擇帳戶");
  if (!Number(d.amount)) throw new Error("請輸入金額");
  if (type === "transfer" && !d.to_account_id) throw new Error("轉帳需要選擇轉入帳戶");
  if (type !== "transfer" && d.to_account_id) d.to_account_id = null;

  const rawAmount = Number(d.amount);
  const amount = Math.abs(rawAmount);
  const adjustmentDirection = type === "asset_adjustment"
    ? (d.adjustment_direction || (rawAmount < 0 ? "decrease" : "increase"))
    : null;

  const splitRows = (type === "expense" || type === "refund") ? parseSplitLines(d.split_lines || "", type) : [];
  if (splitRows.length) {
    const splitTotal = splitRows.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    if (Math.round(splitTotal) !== Math.round(amount)) {
      throw new Error(`拆帳合計 ${fmtMoney(splitTotal)} 必須等於交易金額 ${fmtMoney(amount)}`);
    }
  }

  const payload = {
    id: d.id || undefined,
    transaction_date: d.transaction_date,
    type,
    account_id: d.account_id,
    to_account_id: type === "transfer" ? d.to_account_id : null,
    category_id: ["transfer","asset_adjustment"].includes(type) ? null : d.category_id || null,
    budget_item_id: (type === "expense" || type === "refund") ? d.budget_item_id || null : null,
    related_transaction_id: type === "refund" ? d.related_transaction_id || null : null,
    amount,
    adjustment_direction: adjustmentDirection,
    merchant: d.merchant,
    payment_method: d.payment_method,
    note: d.note,
    status: d.status || "cleared",
    necessity_level: d.necessity_level || defaultNecessityByType(type),
    cashflow_nature: d.cashflow_nature || defaultCashflowByType(type),
    control_level: d.control_level || "controllable"
  };

  const saved = await upsert("transactions", payload, { expect: { type: payload.type, amount: payload.amount } });
  await replaceTransactionSplits(saved.id, splitRows);
  await replaceTransactionEntries(saved.id, saved.status === "cancelled" ? [] : buildEntriesForTransaction(saved, splitRows));
  return saved;
}

async function saveYear(form) {
  const d = readForm(form);
  const yearBefore = d.id
    ? state.data.years.find(y => y.id === d.id)
    : state.data.years.find(y => Number(y.budget_year) === Number(d.budget_year)) || selectedYearRecord();
  const existingGlobalRows = globalBudgetContributionRowsFromNote(yearBefore?.note || "");
  const annualBudget = existingGlobalRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const payload = {
    id: d.id || undefined,
    budget_year: Number(d.budget_year),
    name: d.name || `${d.budget_year} 年度預算`,
    budget_mode: "monthly_contribution",
    monthly_budget: 0,
    budget_start_mode: "record_start",
    annual_budget: annualBudget,
    carryover_from_previous: numberOrZero(d.carryover_from_previous),
    note: applyGlobalBudgetContributionsMarker(d.note || "", existingGlobalRows)
  };
  const row = await upsert("years", payload, { expect: { budget_year: Number(d.budget_year) } });
  state.selectedYearId = row.id;
  state.selectedBudgetYear = row.budget_year;
  return row;
}



async function saveBudgetMovement(form) {
  const d = readForm(form);
  if (!d.from_budget_item_id) throw new Error("請選擇來源預算項目");
  if (!d.to_budget_item_id) throw new Error("請選擇目標預算項目");
  if (d.from_budget_item_id === d.to_budget_item_id) throw new Error("來源與目標不能相同");
  if (!d.movement_date) throw new Error("請選擇日期");
  if (!Number(d.amount)) throw new Error("請輸入金額");

  const payload = {
    id: d.id || undefined,
    movement_date: d.movement_date,
    from_budget_item_id: d.from_budget_item_id,
    to_budget_item_id: d.to_budget_item_id,
    amount: numberOrZero(d.amount),
    movement_type: "manual",
    note: d.note || null
  };

  return await upsert("budget_movements", payload, { expect: { amount: payload.amount, movement_type: "manual" } });
}

async function saveBudgetContribution(form) {
  const d = readForm(form);
  if (!d.budget_item_id) throw new Error("請選擇預算項目");
  if (!d.contribution_date) throw new Error("請選擇提撥日期");
  if (!Number(d.amount)) throw new Error("請輸入提撥金額");

  const payload = {
    id: d.id || undefined,
    budget_item_id: d.budget_item_id,
    contribution_date: d.contribution_date,
    amount: numberOrZero(d.amount),
    note: d.note || null
  };

  return await upsert("budget_contributions", payload, { expect: { budget_item_id: payload.budget_item_id, amount: payload.amount } });
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
    start_date: d.start_date || null,
    end_date: d.end_date || null,
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
    note: applyAccountCoverageMarker(d.note, d.coverage_mode || "auto"),
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



async function closeBudgetItemCycle(itemId) {
  const row = budgetItemSummariesForSelectedYear().find(r => r.budget_item_id === itemId);
  if (!row) {
    showAlert("結帳失敗：找不到預算項目。", "bad");
    return;
  }

  const carry = Math.round(Number(row.remaining_amount || 0));
  if (carry < 0) {
    showAlert(`不能結帳：${row.name} 目前超支 ${fmtMoney(Math.abs(carry))}。請先補洞或移轉預算。`, "bad");
    return;
  }

  const ok = await confirmAction(
    "預算項目結帳",
    `確定要結帳「${row.name}」？\n\n目前週期剩餘銀彈：${fmtMoney(carry)}\n結帳後主畫面會變成：\n可用 ${fmtMoney(carry)}\n實際 $0\n剩餘 ${fmtMoney(carry)}\n\n累積資訊仍會保留歷史可用 / 實際 / 剩餘。`
  );
  if (!ok) return;

  await insert("budget_contributions", {
    budget_item_id: row.budget_item_id,
    contribution_date: today(),
    amount: carry,
    note: `[CLOSE] ${today()} 結帳承接銀彈｜${row.name}`
  });

  await loadAll();
  render();
  showAlert(`已結帳「${row.name}」：新週期銀彈 ${fmtMoney(carry)}，實際歸 0。`, "good", { timeout: 7000 });
}

async function updateWhereIn(table, column, values, patch) {
  if (!values?.length) return;
  const { error } = await state.client.from(table).update(patch).in(column, values);
  if (error) throw new Error(`${table} 更新失敗：${formatSupabaseError(error)}`);
}

async function deleteWhereIn(table, column, values) {
  if (!values?.length) return;
  const { error } = await state.client.from(table).delete().in(column, values);
  if (error) throw new Error(`${table} 刪除失敗：${formatSupabaseError(error)}`);
}

async function deleteWhereOrBudgetMovement(itemIds) {
  if (!itemIds?.length) return;
  const { error } = await state.client
    .from("budget_movements")
    .delete()
    .or(`from_budget_item_id.in.(${itemIds.join(",")}),to_budget_item_id.in.(${itemIds.join(",")})`);
  if (error) throw new Error(`budget_movements 刪除失敗：${formatSupabaseError(error)}`);
}

async function removeYearCascade(yearId) {
  const year = state.data.years.find(y => y.id === yearId);
  const items = (state.data.budgetItems || []).filter(i => i.year_id === yearId);
  const itemIds = items.map(i => i.id);

  if (itemIds.length) {
    await updateWhereIn("transactions", "budget_item_id", itemIds, { budget_item_id: null });
    await updateWhereIn("transaction_entries", "budget_item_id", itemIds, { budget_item_id: null });
    await updateWhereIn("transaction_splits", "budget_item_id", itemIds, { budget_item_id: null });
    await deleteWhereIn("budget_contributions", "budget_item_id", itemIds);
    await deleteWhereOrBudgetMovement(itemIds);
    await deleteWhereIn("budget_items", "id", itemIds);
  }

  await removeRow("years", yearId);
  return { year, deletedItems: itemIds.length };
}

async function removeEntity(table, id) {
  if (table === "years") return await removeYearCascade(id);
  return await removeRow(table, id);
}

async function closeYearToNextYear() {
  const current = getCurrentYearSummary();
  const currentYear = selectedYearRecord();
  const nextYearNumber = Number(state.selectedBudgetYear) + 1;
  const existingNext = state.data.years.find(y => Number(y.budget_year) === nextYearNumber);
  const carryover = Math.round(Number(current.remaining_budget || 0));

  const ok = await confirmAction(
    "年度結轉",
    `確定要關閉 ${state.selectedBudgetYear} 年？\n\n${nextYearNumber} 年將使用：\n前期結轉：${fmtMoney(carryover)}\n年度總預算：先由下一年的全局提撥紀錄累積，不再填每次提撥金額。`
  );
  if (!ok) return;

  await upsert("years", {
    ...currentYear,
    is_closed: true,
    note: applyGlobalBudgetContributionsMarker(stripGlobalBudgetContributionsMarker(currentYear.note || ""), globalBudgetContributionRowsFromNote(currentYear.note || ""))
  }, { expect: { budget_year: Number(state.selectedBudgetYear) } });

  const next = await upsert("years", {
    id: existingNext?.id || undefined,
    budget_year: nextYearNumber,
    name: existingNext?.name || `${nextYearNumber} 年度預算`,
    budget_mode: "monthly_contribution",
    monthly_budget: 0,
    budget_start_mode: "record_start",
    annual_budget: globalBudgetContributionTotalForYear(existingNext || { budget_year: nextYearNumber, note: "" }),
    carryover_from_previous: carryover,
    note: existingNext?.note || ""
  }, { expect: { budget_year: nextYearNumber } });

  state.selectedYearId = next.id;
  state.selectedBudgetYear = next.budget_year;
  await loadAll();
  render();
  showAlert(`已結轉到 ${nextYearNumber} 年：前期結轉 ${fmtMoney(carryover)}。`, "good");
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

  $("#runMonthCloseSweepBtn")?.addEventListener("click", () => runMonthCloseSweepPrompt({ auto: false }));
  $("#rolloverAnnualItemsBtn")?.addEventListener("click", async () => {
    try {
      await rolloverAnnualBudgetItemsToNextYear();
    } catch (error) {
      showAlert(`年度結轉型項目結轉失敗：${escapeHtml(error.message)}`, "bad");
    }
  });

  $$("[data-report-mode]").forEach(btn => btn.addEventListener("click", () => {
    const group = btn.dataset.reportGroup;
    const mode = btn.dataset.reportMode;
    if (!group || !mode) return;
    state[group] = mode;
    render();
  }));

  $$("[data-budget-operation]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.budgetOperationMode = btn.dataset.budgetOperation || "globalContribution";
    render();
  }));

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
    clearBudgetOperationEditing();
    state.editing.budgetItem = state.data.budgetItems.find(x => x.id === btn.dataset.editBudget);
    state.budgetOperationMode = "item";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));
  $$("[data-close-budget]").forEach(btn => btn.addEventListener("click", async () => {
    try {
      await closeBudgetItemCycle(btn.dataset.closeBudget);
    } catch (error) {
      showAlert(`預算項目結帳失敗：${escapeHtml(error.message)}`, "bad");
    }
  }));
  $$("[data-edit-contribution]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.editing.budgetContribution = state.data.budgetContributions.find(x => x.id === btn.dataset.editContribution);
    state.budgetOperationMode = "itemContribution";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));
  $$("[data-edit-movement]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.editing.budgetMovement = state.data.budgetMovements.find(x => x.id === btn.dataset.editMovement);
    state.budgetOperationMode = "movement";
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
    clearBudgetOperationEditing();
    state.editing.year = state.data.years.find(x => x.id === btn.dataset.editYear);
    state.budgetOperationMode = "year";
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

    const deleteMessage = table === "years"
      ? "確定要刪除這個年度？系統會先清理該年度底下的預算項目、預算提撥、預算移轉，以及交易 / 分錄 / 拆帳對這些預算項目的引用。刪除後無法從畫面復原。"
      : `確定要刪除「${tableLabel(table)}」這筆資料？刪除後無法從畫面復原。`;
    const ok = await confirmAction('確認刪除', deleteMessage);
    if (!ok) return;

    try {
      await removeEntity(table, id);
      await loadAll();
      clearEditing();
      render();
      showAlert(`v55 驗證通過：${tableLabel(table)} 已真正從資料庫刪除。`, 'good');
    } catch (error) {
      showAlert(`刪除失敗：${escapeHtml(error.message)}`, 'bad');
    }
  }));

  $$("[data-delete-global-contribution]").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.dataset.deleteGlobalContribution;
    const ok = await confirmAction("刪除全局提撥", "確定要刪除這筆全局預算提撥？");
    if (!ok) return;
    try {
      await deleteGlobalBudgetContribution(id);
      await loadAll();
      render();
      showAlert("全局預算提撥已刪除。", "good");
    } catch (error) {
      showAlert(`刪除全局提撥失敗：${escapeHtml(error.message)}`, "bad");
    }
  }));

  $("#closeYearBtn")?.addEventListener("click", async () => {
    try {
      await closeYearToNextYear();
    } catch (error) {
      showAlert(`結轉失敗：${escapeHtml(error.message)}`, "bad");
    }
  });

  $("#exportCsvBtn")?.addEventListener("click", exportCurrentYearCsv);
  $("#exportCashflowCsvBtn")?.addEventListener("click", exportCashflowStatementCsv);
  $("#exportXlsxBtn")?.addEventListener("click", exportWorkbookXlsx);
  $("#rebuildEntriesBtn")?.addEventListener("click", async () => {
    try {
      await rebuildAllTransactionEntries();
    } catch (error) {
      showAlert(`重建分錄失敗：${escapeHtml(error.message)}`, "bad");
    }
  });
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

function excelSafeText(value) {
  const text = String(value ?? "");
  // 避免 Excel 把以 = + - @ 開頭的內容當成公式。
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function toCsv(rows, headers = null) {
  if (!rows.length) return "";
  const columns = headers || Object.keys(rows[0]).map(key => ({ key, label: key }));
  const escape = v => `"${excelSafeText(v).replaceAll('"', '""')}"`;
  const lines = [
    columns.map(c => escape(c.label)).join(","),
    ...rows.map(r => columns.map(c => escape(r[c.key])).join(","))
  ];
  return lines.join("\r\n");
}

function downloadFile(filename, content, mime = "text/plain;charset=utf-8", options = {}) {
  const finalContent = options.bom ? "\uFEFF" + content : content;
  const blob = new Blob([finalContent], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function transactionExportRows(rows) {
  return rows.map(t => ({
    date: t.transaction_date || "",
    type: labelOf(t.type),
    amount: Number(t.amount || 0),
    account: t.account_name || "",
    to_account: t.to_account_name || "",
    category: t.category_name || "",
    budget_item: t.budget_item_name || "",
    merchant: t.merchant || "",
    payment_method: t.payment_method || "",
    necessity_level: labelOf(t.necessity_level),
    cashflow_nature: labelOf(t.cashflow_nature),
    status: labelOf(t.status),
    note: t.note || "",
    tx_year: t.tx_year || "",
    tx_month: t.tx_month || "",
    created_at: t.created_at || "",
    updated_at: t.updated_at || ""
  }));
}

function exportCurrentYearCsv() {
  const rows = transactionExportRows(applyTxFilters(transactionsForSelectedYear()));
  const headers = [
    { key: "date", label: "日期" },
    { key: "type", label: "類型" },
    { key: "amount", label: "金額" },
    { key: "account", label: "帳戶" },
    { key: "to_account", label: "轉入帳戶" },
    { key: "category", label: "分類" },
    { key: "budget_item", label: "預算項目" },
    { key: "merchant", label: "商家 / 對象" },
    { key: "payment_method", label: "付款方式" },
    { key: "necessity_level", label: "必要程度" },
    { key: "cashflow_nature", label: "現金流性質" },
    { key: "status", label: "狀態" },
    { key: "note", label: "備註" },
    { key: "tx_year", label: "年度" },
    { key: "tx_month", label: "月份" },
    { key: "created_at", label: "建立時間" },
    { key: "updated_at", label: "更新時間" }
  ];
  downloadFile(`流水帳_${state.selectedBudgetYear}_Excel_UTF8.csv`, toCsv(rows, headers), "text/csv;charset=utf-8", { bom: true });
  showAlert("已匯出流水帳 CSV。中文亂碼已用 UTF-8 BOM 修正。", "good");
}

function addAmount(map, key, amount) {
  const safeKey = key || "未分類";
  map.set(safeKey, Number(map.get(safeKey) || 0) + Number(amount || 0));
}

function mapToSortedRows(map) {
  return Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount: Number(amount || 0) }))
    .filter(r => Math.abs(r.amount) > 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function cashflowStatementRows() {
  const rows = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  const incomeByCategory = new Map();
  const expenseByCategory = new Map();
  const transferByPurpose = new Map();

  rows.forEach(t => {
    const amount = Number(t.amount || 0);
    if (t.type === "income") {
      addAmount(incomeByCategory, t.category_name || "收入", amount);
    } else if (t.type === "expense") {
      addAmount(expenseByCategory, t.category_name || "未分類支出", amount);
    } else if (t.type === "refund") {
      // 退款抵減原支出，放在支出端用負數呈現。
      addAmount(expenseByCategory, t.category_name || "退款", -amount);
    } else if (t.type === "transfer") {
      const purpose = t.merchant || `${t.account_name || "轉出帳戶"} → ${t.to_account_name || "轉入帳戶"}`;
      addAmount(transferByPurpose, purpose, amount);
    }
  });

  const incomeRows = mapToSortedRows(incomeByCategory);
  const expenseRows = mapToSortedRows(expenseByCategory);
  const transferRows = mapToSortedRows(transferByPurpose);

  const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount, 0);
  const netExpense = expenseRows.reduce((sum, r) => sum + r.amount, 0);
  const netCashflow = totalIncome - netExpense;
  const savingsRate = totalIncome > 0 ? netCashflow / totalIncome : null;
  const totalTransfers = transferRows.reduce((sum, r) => sum + r.amount, 0);

  const out = [];
  const push = (section, item, amount = "", note = "", ratio = "") => {
    out.push({ section, item, amount, ratio, note });
  };
  const blank = () => push("", "", "", "", "");

  push("個人現金流量表", `${state.selectedBudgetYear} 年度`, "", "", "");
  push("產生時間", new Date().toLocaleString("zh-TW"), "", "", "");
  push("口徑說明", "收入與支出採直接法；轉帳只列備查，不影響收入、支出、儲蓄率。", "", "", "");
  blank();

  push("一、現金流入", "收入合計", totalIncome, "", totalIncome ? "100%" : "");
  incomeRows.forEach(r => push("收入明細", r.name, r.amount, "", totalIncome ? `${fmtNumber(r.amount / totalIncome * 100, 1)}%` : ""));
  blank();

  push("二、生活現金流出", "淨支出合計（支出 − 退款）", -netExpense, "現金流出以負數呈現", totalIncome ? `${fmtNumber(netExpense / totalIncome * 100, 1)}% of income` : "");
  expenseRows.forEach(r => {
    const amount = -r.amount;
    const note = r.amount < 0 ? "退款淨流入" : "";
    push("支出明細", r.name, amount, note, totalIncome ? `${fmtNumber(r.amount / totalIncome * 100, 1)}% of income` : "");
  });
  blank();

  push("三、自由現金流", "收入 − 淨支出", netCashflow, "", totalIncome ? `${fmtNumber(savingsRate * 100, 1)}%` : "N/A");
  push("三、自由現金流", "儲蓄率", savingsRate === null ? "N/A" : `${fmtNumber(savingsRate * 100, 1)}%`, "(收入 − 淨支出) / 收入", "");
  blank();

  push("四、轉帳 / 資金配置（備查）", "轉帳總額", totalTransfers, "銀行、信用卡、證券戶、電子支付之間的資金移動；不列入損益。", "");
  transferRows.forEach(r => push("轉帳明細", r.name, r.amount, "備查，不影響淨現金流", ""));
  blank();

  const current = getCurrentYearSummary();
  push("五、預算摘要", "年度可用預算", Number(current.available_budget || 0), "", "");
  push("五、預算摘要", "年度已用預算", -Number(current.actual_expense || 0), "", "");
  push("五、預算摘要", "年度剩餘預算", Number(current.remaining_budget || 0), "", "");
  push("五、預算摘要", "預算使用率", `${fmtNumber(current.budget_used_pct || 0, 1)}%`, "", "");
  return out;
}

function exportCashflowStatementCsv() {
  const rows = cashflowStatementRows();
  const headers = [
    { key: "section", label: "區塊" },
    { key: "item", label: "項目" },
    { key: "amount", label: "金額" },
    { key: "ratio", label: "比例" },
    { key: "note", label: "備註" }
  ];
  downloadFile(`現金流量表_${state.selectedBudgetYear}_Excel_UTF8.csv`, toCsv(rows, headers), "text/csv;charset=utf-8", { bom: true });
  showAlert("已匯出現金流量表 CSV。支出以負數呈現，轉帳只列備查，不影響儲蓄率。", "good");
}


function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const sheetData = rows.map((row, rIdx) => {
    const cells = row.map((value, cIdx) => {
      const cellRef = `${columnName(cIdx)}${rIdx + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${cellRef}"><v>${value}</v></c>`;
      }
      return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rIdx + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`;
}

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function writeUInt32LE(arr, value) {
  arr.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
}

function writeUInt16LE(arr, value) {
  arr.push(value & 255, (value >>> 8) & 255);
}

function makeXlsxZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach(file => {
    const nameBytes = utf8Bytes(file.name);
    const dataBytes = utf8Bytes(file.content);
    const crc = crc32(dataBytes);
    const local = [];
    writeUInt32LE(local, 0x04034b50);
    writeUInt16LE(local, 20); writeUInt16LE(local, 0); writeUInt16LE(local, 0);
    writeUInt16LE(local, 0); writeUInt16LE(local, 0);
    writeUInt32LE(local, crc);
    writeUInt32LE(local, dataBytes.length);
    writeUInt32LE(local, dataBytes.length);
    writeUInt16LE(local, nameBytes.length);
    writeUInt16LE(local, 0);
    chunks.push(new Uint8Array(local), nameBytes, dataBytes);

    const c = [];
    writeUInt32LE(c, 0x02014b50);
    writeUInt16LE(c, 20); writeUInt16LE(c, 20);
    writeUInt16LE(c, 0); writeUInt16LE(c, 0); writeUInt16LE(c, 0); writeUInt16LE(c, 0);
    writeUInt32LE(c, crc);
    writeUInt32LE(c, dataBytes.length);
    writeUInt32LE(c, dataBytes.length);
    writeUInt16LE(c, nameBytes.length);
    writeUInt16LE(c, 0); writeUInt16LE(c, 0); writeUInt16LE(c, 0); writeUInt16LE(c, 0);
    writeUInt32LE(c, 0); writeUInt32LE(c, offset);
    central.push(new Uint8Array(c), nameBytes);
    offset += local.length + nameBytes.length + dataBytes.length;
  });

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = [];
  writeUInt32LE(end, 0x06054b50);
  writeUInt16LE(end, 0); writeUInt16LE(end, 0);
  writeUInt16LE(end, files.length); writeUInt16LE(end, files.length);
  writeUInt32LE(end, centralSize);
  writeUInt32LE(end, offset);
  writeUInt16LE(end, 0);

  return new Blob([...chunks, ...central, new Uint8Array(end)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function exportWorkbookXlsx() {
  const txRows = transactionExportRows(transactionsForSelectedYear()).map(r => [
    r.date, r.type, r.amount, r.account, r.to_account, r.category, r.budget_item, r.merchant,
    r.payment_method, r.necessity_level, r.cashflow_nature, r.status, r.note
  ]);
  const budgetRows = budgetItemSummariesForSelectedYear().map(r => [
    r.name, labelOf(r.item_type), r.category_name, r.is_contribution_mode ? "提撥型" : "固定型",
    Number(r.current_budget_amount || 0), Number(r.actual_amount || 0), Number(r.remaining_amount || 0),
    Number(r.used_pct || 0), r.funding_label
  ]);
  const contributionRows = enrichedBudgetContributionsForSelectedYear().map(r => [
    r.contribution_date, r.budget_item_name, Number(r.amount || 0), r.note || ""
  ]);
  const movementRows = enrichedBudgetMovementsForSelectedYear().map(r => [
    r.movement_date, r.from_name, r.to_name, Number(r.amount || 0), r.note || ""
  ]);
  const entryRows = (state.data.transactionEntries || []).map(e => [
    e.entry_date, e.side === "debit" ? "借方" : "貸方", e.label || "", Number(e.amount || 0), e.note || ""
  ]);
  const cashflowRows = cashflowStatementRows().map(r => [r.section, r.item, r.amount, r.ratio, r.note]);
  const categoryExpenseRows = categoryExpenseReportRows().map(r => [r.category, Number(r.amount || 0), `${fmtNumber(r.share * 100, 1)}%`, Number(r.count || 0), Number(r.avg || 0), Number(r.max || 0)]);
  const recurringRows = recurringReportRows().map(r => [r.name, Number(r.monthly || 0), Number(r.annual || 0), r.account, r.category, r.frequency, r.next_due_date, r.status]);
  const monthlyRows = monthlyComparisonReportRows().map(r => [r.month, Number(r.income || 0), Number(r.expense || 0), Number(r.net || 0), r.savingsRate, r.budgetShare]);
  const necessityRows = necessityReportRows().map(r => [r.name, Number(r.amount || 0), `${fmtNumber(r.share * 100, 1)}%`, Number(r.count || 0)]);
  const pnlRows = pnlStatementRows().map(r => [r.section, r.item, r.amount, r.ratio, r.note]);
  const balanceRows = balanceSheetReportRows().map(r => [r.section, r.account, r.type, Number(r.amount || 0), r.note]);

  const sheets = [
    { name: "流水帳", rows: [["日期","類型","金額","帳戶","轉入帳戶","分類","預算項目","商家","付款方式","必要程度","現金流性質","狀態","備註"], ...txRows] },
    { name: "現金流量表", rows: [["區塊","項目","金額","比例","備註"], ...cashflowRows] },
    { name: "個人損益表", rows: [["區塊","項目","金額","比例","備註"], ...pnlRows] },
    { name: "資產負債表", rows: [["區塊","帳戶/項目","類型","金額","備註"], ...balanceRows] },
    { name: "分類支出表", rows: [["分類","金額","占比","筆數","平均單筆","最大單筆"], ...categoryExpenseRows] },
    { name: "固定支出訂閱表", rows: [["服務名稱","月化成本","年化成本","付款帳戶","分類","週期","下次扣款","狀態"], ...recurringRows] },
    { name: "月度比較表", rows: [["月份","收入","支出","淨收支","儲蓄率","占目前可用預算"], ...monthlyRows] },
    { name: "必要程度分析", rows: [["必要程度","金額","占比","筆數"], ...necessityRows] },
    { name: "預算項目", rows: [["名稱","類型","分類","模式","目前可用","實際","剩餘","使用率","計算方式"], ...budgetRows] },
    { name: "預算提撥", rows: [["日期","預算項目","金額","備註"], ...contributionRows] },
    { name: "預算移轉", rows: [["日期","從","到","金額","備註"], ...movementRows] },
    { name: "分錄", rows: [["日期","借貸","科目","金額","備註"], ...entryRows] }
  ];

  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s.rows) }))
  ];

  const blob = makeXlsxZip(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `個人財務_${state.selectedBudgetYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showAlert("已匯出 Excel .xlsx 工作簿。", "good");
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
