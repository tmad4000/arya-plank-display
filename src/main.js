const monthTitle = document.querySelector("#month-title");
const calendarGrid = document.querySelector("#calendar-grid");
const dayHeadings = document.querySelector("#day-headings");
const currentStreakEl = document.querySelector("#current-streak");
const longestStreakEl = document.querySelector("#longest-streak");
const totalPlanksEl = document.querySelector("#total-planks");
const updatedAtEl = document.querySelector("#updated-at");
const prevMonthButton = document.querySelector("#prev-month");
const nextMonthButton = document.querySelector("#next-month");

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayShort = ["S", "M", "T", "W", "T", "F", "S"];
const monthLabels = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

let data = null;
let monthOffset = 0;
let activeTooltip = null;

init();

async function init() {
  renderHeadings();
  initTabs();
  document.addEventListener("click", dismissTooltip);

  try {
    const response = await fetch("/plank-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load plank-data.json (" + response.status + ")");
    data = await response.json();
    renderSummary(data.summary);
    renderUpdatedAt(data.generatedAt);
    renderCalendar();
    renderPet();
    bindNavigation();
  } catch (error) {
    monthTitle.textContent = "Could not load data";
    calendarGrid.innerHTML = "<p class=\"error\">" + error.message + "</p>";
  }
}

/* ---- Tabs ---- */
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + tab).classList.add("active");
    });
  });
}

/* ---- Navigation ---- */
function bindNavigation() {
  prevMonthButton.addEventListener("click", function() { monthOffset -= 1; renderCalendar(); });
  nextMonthButton.addEventListener("click", function() { monthOffset += 1; renderCalendar(); });

  var touchStartX = 0;
  var calendarWrap = document.querySelector(".calendar-wrap");
  calendarWrap.addEventListener("touchstart", function(e) { touchStartX = e.touches[0].clientX; }, { passive: true });
  calendarWrap.addEventListener("touchend", function(e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60) { monthOffset += dx < 0 ? 1 : -1; renderCalendar(); }
  }, { passive: true });
}

/* ---- Headings ---- */
function renderHeadings() {
  var isMobile = window.innerWidth < 500;
  var labels = isMobile ? weekdayShort : weekdayLabels;
  dayHeadings.innerHTML = labels.map(function(day) { return "<div class=\"day-heading\">" + day + "</div>"; }).join("");
}

window.addEventListener("resize", renderHeadings);

/* ---- Summary stats ---- */
function renderSummary(summary) {
  currentStreakEl.textContent = String(summary.currentStreak);
  longestStreakEl.textContent = String(summary.longestStreak);
  totalPlanksEl.textContent = String(summary.totalPlanks);
}

function renderUpdatedAt(isoTime) {
  var dt = new Date(isoTime);
  var label = dt.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  updatedAtEl.textContent = "Updated " + label;
}

/* ---- Calendar ---- */
function renderCalendar() {
  if (!data) return;
  var lookup = new Map(data.days.map(function(day) { return [day.date, day]; }));
  var today = new Date();
  var todayIso = toIsoDate(today);
  var visibleDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  var visibleYear = visibleDate.getUTCFullYear();
  var visibleMonth = visibleDate.getUTCMonth();
  monthTitle.textContent = monthLabels[visibleMonth] + " " + visibleYear;
  var firstWeekday = new Date(Date.UTC(visibleYear, visibleMonth, 1)).getUTCDay();
  var daysInMonth = new Date(Date.UTC(visibleYear, visibleMonth + 1, 0)).getUTCDate();
  var cells = [];
  for (var i = 0; i < firstWeekday; i += 1) cells.push("<div class=\"day-cell empty\"></div>");
  for (var dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    var iso = visibleYear + "-" + pad(visibleMonth + 1) + "-" + pad(dayNumber);
    var entry = lookup.get(iso);
    var isFuture = iso > todayIso;
    var isToday = iso === todayIso;
    var status = (entry && entry.status) ? entry.status : (isFuture ? "future" : "missed");
    var marker = statusMarker(status);
    var todayClass = isToday ? " is-today" : "";
    var tipText = statusTitle(status, iso);
    cells.push("<article class=\"day-cell status-" + status + todayClass + "\" data-tip=\"" + tipText + "\"><p class=\"day-number\">" + (isToday ? "Today" : dayNumber) + "</p><p class=\"day-mark\">" + marker + "</p></article>");
  }
  calendarGrid.innerHTML = cells.join("");
  calendarGrid.querySelectorAll(".day-cell[data-tip]").forEach(function(cell) {
    cell.addEventListener("click", function(e) { e.stopPropagation(); showTooltip(cell); });
  });
}

/* ---- Tooltips ---- */
function showTooltip(cell) {
  dismissTooltip();
  var tip = cell.dataset.tip;
  if (!tip) return;
  var el = document.createElement("div");
  el.className = "tooltip-bubble";
  el.textContent = tip;
  cell.appendChild(el);
  activeTooltip = el;
  setTimeout(function() { if (activeTooltip === el) dismissTooltip(); }, 2500);
}

function dismissTooltip() {
  if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
}

/* ---- Status helpers ---- */
function statusMarker(status) {
  if (status === "done") return "\u2705";
  if (status === "rest") return "\ud83c\udf3f";
  if (status === "pending") return "\ud83d\udfe8";
  if (status === "future") return "\u00b7";
  return "\u00b7";
}

function statusTitle(status, date) {
  var labels = { done: "Done", missed: "Missed", rest: "Rest day", pending: "Not confirmed yet", future: "Future" };
  return date + ": " + (labels[status] || "Unknown");
}

/* ---- Pet Tab ---- */
function renderPet() {
  if (!data) return;

  var strength = calculateStrength(data.days);
  var strengthPct = Math.min(100, Math.max(0, Math.round(strength)));

  // Avatar expression based on strength
  var avatarEl = document.getElementById("pet-avatar");
  var moodEl = document.getElementById("pet-mood");
  var strengthBar = document.getElementById("pet-strength-bar");
  var strengthVal = document.getElementById("pet-strength-val");
  var strengthDesc = document.getElementById("pet-strength-desc");
  var petLog = document.getElementById("pet-log");

  if (strengthPct >= 70) {
    avatarEl.textContent = "\ud83d\udcaa\ud83d\ude3a";
    moodEl.textContent = "Feeling strong and energized!";
  } else if (strengthPct >= 40) {
    avatarEl.textContent = "\ud83d\ude3a";
    moodEl.textContent = "Doing well! Keep training.";
  } else if (strengthPct >= 15) {
    avatarEl.textContent = "\ud83d\ude40";
    moodEl.textContent = "Getting a bit rusty\u2026 time to plank!";
  } else {
    avatarEl.textContent = "\ud83d\ude3f";
    moodEl.textContent = "Needs training! Strength is fading\u2026";
  }

  strengthBar.style.width = strengthPct + "%";
  strengthVal.textContent = strengthPct;

  // Color the bar based on level
  if (strengthPct >= 70) {
    strengthBar.style.background = "linear-gradient(90deg, #48c980, #34d399)";
  } else if (strengthPct >= 40) {
    strengthBar.style.background = "linear-gradient(90deg, #fbbf24, #f59e0b)";
  } else {
    strengthBar.style.background = "linear-gradient(90deg, #f87171, #ef4444)";
  }

  // Strength description with decay info
  var daysSincePlank = getDaysSinceLastPlank(data.days);
  if (daysSincePlank === 0) {
    strengthDesc.textContent = "Trained today! Strength is at peak.";
  } else if (daysSincePlank === 1) {
    strengthDesc.textContent = "Last plank was yesterday. Staying strong!";
  } else if (daysSincePlank <= 3) {
    strengthDesc.textContent = "Last plank was " + daysSincePlank + " days ago. Slight decline starting.";
  } else if (daysSincePlank <= 7) {
    strengthDesc.textContent = "Last plank was " + daysSincePlank + " days ago. Noticeable atrophy setting in.";
  } else {
    strengthDesc.textContent = "Last plank was " + daysSincePlank + " days ago. Significant atrophy!";
  }

  // Training log - recent plank events
  var recentDays = data.days.filter(function(d) { return d.didPlank; }).slice(-5).reverse();
  if (recentDays.length === 0) {
    petLog.innerHTML = "<p class=\"pet-log-empty\">No training sessions yet. Do a plank!</p>";
  } else {
    petLog.innerHTML = recentDays.map(function(d) {
      var dt = new Date(d.date + "T12:00:00");
      var label = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return "<div class=\"pet-log-entry\"><span class=\"pet-log-icon\">\u2705</span><span class=\"pet-log-text\">" + label + (d.note ? " \u2014 " + d.note : "") + "</span></div>";
    }).join("");
  }
}

/**
 * Strength model: exponential decay with 14-day half-life.
 * Each plank contributes a base amount that decays over time.
 * Result is 0-100 scale.
 */
function calculateStrength(days) {
  var HALF_LIFE = 14; // days
  var DECAY = Math.LN2 / HALF_LIFE;
  var BASE_PER_PLANK = 15; // each plank adds this much (before decay)
  var MAX_STRENGTH = 100;

  var today = new Date();
  var todayMs = today.getTime();
  var totalStrength = 0;

  for (var i = 0; i < days.length; i++) {
    if (!days[i].didPlank) continue;
    var plankDate = new Date(days[i].date + "T12:00:00");
    var daysSince = Math.max(0, (todayMs - plankDate.getTime()) / (1000 * 60 * 60 * 24));
    var contribution = BASE_PER_PLANK * Math.exp(-DECAY * daysSince);
    totalStrength += contribution;
  }

  return Math.min(MAX_STRENGTH, totalStrength);
}

function getDaysSinceLastPlank(days) {
  var today = new Date();
  var todayMs = today.getTime();
  var lastPlank = null;

  for (var i = days.length - 1; i >= 0; i--) {
    if (days[i].didPlank) {
      lastPlank = new Date(days[i].date + "T12:00:00");
      break;
    }
  }

  if (!lastPlank) return 999;
  return Math.floor((todayMs - lastPlank.getTime()) / (1000 * 60 * 60 * 24));
}

/* ---- Utilities ---- */
function pad(value) { return String(value).padStart(2, "0"); }
function toIsoDate(date) { return date.toISOString().slice(0, 10); }
