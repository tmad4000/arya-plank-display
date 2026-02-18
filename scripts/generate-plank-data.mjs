import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const inputDir = resolveInputDir();
const logPath = path.join(inputDir, 'plank-log.md');
const statusPath = path.join(inputDir, 'plank-status.json');
const outputPath = path.join(rootDir, 'public', 'plank-data.json');

const today = toDateOnly(new Date());

const logContent = fs.existsSync(logPath)
  ? fs.readFileSync(logPath, 'utf8')
  : '# Plank Log\n';

const statusContent = fs.existsSync(statusPath)
  ? fs.readFileSync(statusPath, 'utf8')
  : JSON.stringify({ date: today, confirmed: false }, null, 2);

let currentStatus = { date: today, confirmed: false };
try {
  currentStatus = JSON.parse(statusContent);
} catch {
  currentStatus = { date: today, confirmed: false };
}

const entries = parseLogEntries(logContent);
const statusEntry = inferEntryFromStatus(currentStatus);
if (statusEntry) {
  entries.set(statusEntry.date, mergeEntries(entries.get(statusEntry.date), statusEntry));
}

const allDates = [...entries.keys()];
const startDate = allDates.length ? minDate(allDates) : today;
const endDate = maxDate([today, ...allDates]);

const days = buildDayRange(startDate, endDate, entries, today);
const summary = computeSummary(days, today);

// Read SRS items
const srsPath = path.join(inputDir, 'srs-items.json');
const srsItems = fs.existsSync(srsPath)
  ? JSON.parse(fs.readFileSync(srsPath, 'utf8'))
  : [];

// Read health checkups
const healthPath = path.join(inputDir, 'health-checkups.json');
const healthCheckups = fs.existsSync(healthPath)
  ? JSON.parse(fs.readFileSync(healthPath, 'utf8'))
  : [];

// Read sleep log
const sleepPath = path.join(inputDir, 'sleep-log.json');
const sleepEntries = fs.existsSync(sleepPath)
  ? JSON.parse(fs.readFileSync(sleepPath, 'utf8'))
  : [];

// Read play log
const playPath = path.join(inputDir, 'play-log.json');
const playEntries = fs.existsSync(playPath)
  ? JSON.parse(fs.readFileSync(playPath, 'utf8'))
  : [];

// Compute SRS and health data
const srs = computeSrsRetention(srsItems, today);
const health = computeHealthUrgency(healthCheckups, today);
const sleep = computeSleepScore(sleepEntries, today);
const play = computePlayScore(playEntries, today);

const payload = {
  generatedAt: new Date().toISOString(),
  currentStatus,
  dateRange: { start: startDate, end: endDate },
  summary,
  days,
  srs,
  health,
  sleep,
  play
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`Wrote ${outputPath}`);

/* ---- SRS Retention ---- */
function computeSrsRetention(items, todayDate) {
  if (!items.length) {
    return { items: [], aggregateRetention: 0 };
  }

  const computed = items.map(function (item) {
    let retention = 0;

    if (item.lastReview) {
      const elapsed = daysBetween(item.lastReview, todayDate);
      // Forgetting curve: retention = e^(-t/S)
      retention = Math.exp(-elapsed / item.stability);
    }
    // If never reviewed, retention stays 0

    return {
      ...item,
      retention: Math.round(retention * 1000) / 1000
    };
  });

  const totalRetention = computed.reduce(function (sum, item) {
    return sum + item.retention;
  }, 0);
  const aggregateRetention = Math.round((totalRetention / computed.length) * 100);

  return {
    items: computed,
    aggregateRetention
  };
}

/* ---- Health Urgency ---- */
function computeHealthUrgency(checkups, todayDate) {
  if (!checkups.length) {
    return { checkups: [], aggregateScore: 0 };
  }

  const computed = checkups.map(function (checkup) {
    let urgency = 1.0; // Default: fully urgent if never completed

    if (checkup.lastCompleted) {
      const elapsed = daysBetween(checkup.lastCompleted, todayDate);
      const k = checkup.steepness || 6;
      // Sigmoid urgency: 1 / (1 + e^(-k * (elapsed/interval - 1)))
      urgency = 1 / (1 + Math.exp(-k * (elapsed / checkup.intervalDays - 1)));
    }

    return {
      ...checkup,
      urgency: Math.round(urgency * 1000) / 1000
    };
  });

  const totalUrgency = computed.reduce(function (sum, item) {
    return sum + item.urgency;
  }, 0);
  const avgUrgency = totalUrgency / computed.length;
  const aggregateScore = Math.round((1 - avgUrgency) * 100);

  return {
    checkups: computed,
    aggregateScore
  };
}

/* ---- Sleep Score ---- */
function computeSleepScore(entries, todayDate) {
  if (!entries.length) {
    return { entries: [], aggregateScore: 0, avgHours: 0, loggedDays: 0 };
  }

  const TARGET_HOURS = 8;
  const WINDOW_DAYS = 7;

  // Get last 7 days
  const windowStart = new Date(`${todayDate}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS + 1);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  const recent = entries.filter(function (e) {
    return e.date >= windowStartStr && e.date <= todayDate;
  });

  const totalHours = recent.reduce(function (sum, e) { return sum + (e.hours || 0); }, 0);
  const avgHours = recent.length > 0 ? totalHours / recent.length : 0;

  // Score each logged day: how close to target (8h)
  const dayScores = recent.map(function (e) {
    var deviation = Math.abs((e.hours || 0) - TARGET_HOURS) / TARGET_HOURS;
    return Math.max(0, 1 - deviation);
  });

  // Penalize missing days in window
  var totalScore = dayScores.reduce(function (sum, s) { return sum + s; }, 0);
  var aggregateScore = Math.round((totalScore / WINDOW_DAYS) * 100);

  return {
    entries: recent,
    aggregateScore: aggregateScore,
    avgHours: Math.round(avgHours * 10) / 10,
    loggedDays: recent.length
  };
}

/* ---- Play Score ---- */
function computePlayScore(entries, todayDate) {
  if (!entries.length) {
    return { entries: [], aggregateScore: 0, totalMinutes: 0, activeDays: 0 };
  }

  const WINDOW_DAYS = 7;
  const TARGET_MINUTES_PER_WEEK = 150; // WHO recommendation

  const windowStart = new Date(`${todayDate}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS + 1);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  const recent = entries.filter(function (e) {
    return e.date >= windowStartStr && e.date <= todayDate;
  });

  const totalMinutes = recent.reduce(function (sum, e) { return sum + (e.minutes || 0); }, 0);
  const uniqueDays = new Set(recent.map(function (e) { return e.date; })).size;

  // Score: minutes logged / target, capped at 100
  var aggregateScore = Math.min(100, Math.round((totalMinutes / TARGET_MINUTES_PER_WEEK) * 100));

  return {
    entries: recent,
    aggregateScore: aggregateScore,
    totalMinutes: totalMinutes,
    activeDays: uniqueDays
  };
}

/* ---- Utility ---- */
function daysBetween(dateA, dateB) {
  const a = new Date(`${dateA}T00:00:00Z`);
  const b = new Date(`${dateB}T00:00:00Z`);
  return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

function resolveInputDir() {
  const candidates = [
    process.env.PLANK_SOURCE_DIR,
    path.resolve(rootDir, '../openclaw-arya'),
    path.resolve(rootDir, '../../openclaw-arya')
  ].filter(Boolean);

  for (const candidate of candidates) {
    const log = path.join(candidate, 'plank-log.md');
    const status = path.join(candidate, 'plank-status.json');
    if (fs.existsSync(log) && fs.existsSync(status)) {
      return candidate;
    }
  }

  throw new Error(
    [
      'Could not find plank data source directory.',
      'Set PLANK_SOURCE_DIR to a folder containing plank-log.md and plank-status.json.',
      `Tried: ${candidates.join(', ')}`
    ].join(' ')
  );
}

function parseLogEntries(markdown) {
  const entries = new Map();
  const sectionRegex = /^##\s+(\d{4}-\d{2}-\d{2})\s*$([\s\S]*?)(?=^##\s+\d{4}-\d{2}-\d{2}\s*$|\Z)/gm;

  for (const match of markdown.matchAll(sectionRegex)) {
    const date = match[1];
    const body = match[2] || '';
    const statusLine = /\*\*Status:\*\*\s*(.+)$/im.exec(body)?.[1] ?? '';
    const noteLine = /\*\*Notes:\*\*\s*(.+)$/im.exec(body)?.[1] ?? '';

    const normalized = normalizeStatus(statusLine || body);
    entries.set(date, {
      date,
      status: normalized.status,
      didPlank: normalized.didPlank,
      keepsStreak: normalized.keepsStreak,
      source: 'log',
      note: noteLine.trim() || null
    });
  }

  return entries;
}

function normalizeStatus(rawStatus) {
  const value = rawStatus.trim().toLowerCase();

  if (!value) {
    return { status: 'unknown', didPlank: false, keepsStreak: false };
  }

  if (value.includes('rest day')) {
    return { status: 'rest', didPlank: false, keepsStreak: true };
  }

  if (value.includes('done') || value.includes('completed') || value.includes('yes')) {
    return { status: 'done', didPlank: true, keepsStreak: true };
  }

  if (value.includes('missed') || value.includes('no response')) {
    return { status: 'missed', didPlank: false, keepsStreak: false };
  }

  return { status: 'unknown', didPlank: false, keepsStreak: false };
}

function inferEntryFromStatus(statusJson) {
  const date = isDate(statusJson?.date) ? statusJson.date : null;
  if (!date) {
    return null;
  }

  if (statusJson.confirmed === true) {
    const timeText = String(statusJson.time || '').toLowerCase();
    const isRest = timeText.includes('rest day');
    return {
      date,
      status: isRest ? 'rest' : 'done',
      didPlank: !isRest,
      keepsStreak: true,
      source: 'status',
      note: null
    };
  }

  return {
    date,
    status: date === toDateOnly(new Date()) ? 'pending' : 'missed',
    didPlank: false,
    keepsStreak: false,
    source: 'status',
    note: null
  };
}

function mergeEntries(existing, incoming) {
  if (!existing) {
    return incoming;
  }

  if (incoming.status === 'done' || incoming.status === 'rest') {
    return incoming;
  }

  return existing;
}

function buildDayRange(startDate, endDate, entries, todayDate) {
  const days = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const limit = new Date(`${endDate}T00:00:00Z`);

  while (cursor <= limit) {
    const date = cursor.toISOString().slice(0, 10);
    const entry = entries.get(date);

    if (entry) {
      days.push({
        date,
        status: entry.status,
        didPlank: entry.didPlank,
        keepsStreak: entry.keepsStreak,
        isFuture: date > todayDate,
        note: entry.note,
        source: entry.source
      });
    } else if (date > todayDate) {
      days.push({
        date,
        status: 'future',
        didPlank: false,
        keepsStreak: true,
        isFuture: true,
        note: null,
        source: 'derived'
      });
    } else {
      days.push({
        date,
        status: 'missed',
        didPlank: false,
        keepsStreak: false,
        isFuture: false,
        note: null,
        source: 'derived'
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function computeSummary(days, todayDate) {
  const totalPlanks = days.filter((day) => day.status === 'done').length;

  let longestStreak = 0;
  let streakCounter = 0;

  for (const day of days) {
    if (day.date > todayDate) {
      continue;
    }

    if (day.status === 'done') {
      streakCounter += 1;
      longestStreak = Math.max(longestStreak, streakCounter);
      continue;
    }

    if (day.status === 'rest' || day.status === 'pending') {
      continue;
    }

    streakCounter = 0;
  }

  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];

    if (day.date > todayDate) {
      continue;
    }

    if (day.status === 'pending' || day.status === 'rest') {
      continue;
    }

    if (day.status === 'done') {
      currentStreak += 1;
      continue;
    }

    break;
  }

  return {
    currentStreak,
    longestStreak,
    totalPlanks,
    trackedDays: days.filter((day) => day.date <= todayDate).length
  };
}

function minDate(dates) {
  return dates.reduce((min, date) => (date < min ? date : min));
}

function maxDate(dates) {
  return dates.reduce((max, date) => (date > max ? date : max));
}

function toDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
