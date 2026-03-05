/**
 * Parse biometric log CSV (.txt / .dat).
 * Columns: Department, Name, No., Date/Time, Location ID, ...
 * Per day: 2 logs = Time In, Time Out | 3 = Time In, Lunch Start, Time Out | 4 = Time In, Lunch Start, Lunch End, Time Out.
 */

function getLabel(idx, total) {
  if (total === 2) return idx === 0 ? 'Time In' : 'Time Out';
  if (total === 3) return idx === 0 ? 'Time In' : idx === 1 ? 'Lunch Start' : 'Time Out';
  return idx === 0 ? 'Time In' : idx === 1 ? 'Lunch Start' : idx === 2 ? 'Lunch End' : 'Time Out';
}

function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || c === '\r') {
      parts.push(current.trim());
      current = '';
    } else if (c !== '\n' || inQuotes) {
      current += c;
    }
  }
  parts.push(current.trim());
  return parts;
}

function parseDateTime(str) {
  // "01/01/2026 11:14 am" -> { dateKey: "2026-01-01", time: "11:14 am", sortKey: number }
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  const [, mo, day, year, h, min, ampm] = match;
  let hour = parseInt(h, 10);
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
  const dateKey = `${year}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const sortKey = hour * 60 + parseInt(min, 10);
  const timeStr = `${h}:${min} ${ampm.toLowerCase()}`;
  return { dateKey, timeStr, sortKey };
}

/** "11:14 am" -> minutes since midnight */
function timeStrToMinutes(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  if (m[3].toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (m[3].toLowerCase() === 'am' && hour === 12) hour = 0;
  return hour * 60 + parseInt(m[2], 10);
}

function formatMinutes(min) {
  if (min == null || min < 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function parseBiometricLog(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i]);
    if (parts.length < 5) continue;
    // Handle "Name" with comma: 9 parts -> name = parts[1] + ', ' + parts[2], no = parts[3], dateTime = parts[4]
    let department, name, no, dateTimeStr;
    if (parts.length >= 9) {
      department = parts[0];
      name = `${parts[1]}, ${parts[2]}`.trim();
      no = parts[3];
      dateTimeStr = parts[4];
    } else {
      department = parts[0];
      name = parts[1];
      no = parts[2];
      dateTimeStr = parts[3];
    }
    const dt = parseDateTime(dateTimeStr);
    if (!dt) continue;
    rows.push({
      department,
      name,
      no,
      dateKey: dt.dateKey,
      timeStr: dt.timeStr,
      sortKey: dt.sortKey,
    });
  }

  // Group by employee (department + name + no) and date
  const byEmployeeDate = new Map();
  for (const r of rows) {
    const key = `${r.department}|${r.name}|${r.no}`;
    if (!byEmployeeDate.has(key)) byEmployeeDate.set(key, new Map());
    const byDate = byEmployeeDate.get(key);
    if (!byDate.has(r.dateKey)) byDate.set(r.dateKey, []);
    byDate.get(r.dateKey).push(r);
  }

  // Build DTR rows: one row per (employee, date) with Time In, Lunch Start, Lunch End, Time Out
  const dtrRows = [];
  for (const [empKey, byDate] of byEmployeeDate) {
    const [department, name, no] = empKey.split('|');
    for (const [dateKey, logs] of byDate) {
      logs.sort((a, b) => a.sortKey - b.sortKey);
      const row = {
        department,
        name,
        no,
        date: dateKey,
        timeIn: '',
        lunchStart: '',
        lunchEnd: '',
        timeOut: '',
      };
      const n = logs.length;
      logs.forEach((log, idx) => {
        const label = getLabel(idx, n);
        if (label === 'Time In') row.timeIn = log.timeStr;
        else if (label === 'Lunch Start') row.lunchStart = log.timeStr;
        else if (label === 'Lunch End') row.lunchEnd = log.timeStr;
        else if (label === 'Time Out') row.timeOut = log.timeStr;
      });

      const inM = timeStrToMinutes(row.timeIn);
      const outM = timeStrToMinutes(row.timeOut);
      const lunchStartM = timeStrToMinutes(row.lunchStart);
      const lunchEndM = timeStrToMinutes(row.lunchEnd);

      let totalWorkingMinutes = null;
      let totalLunchMinutes = null;
      if (inM != null && outM != null) {
        let span = outM - inM;
        if (lunchStartM != null && lunchEndM != null) {
          totalLunchMinutes = lunchEndM - lunchStartM;
          totalWorkingMinutes = span - totalLunchMinutes;
        } else {
          totalWorkingMinutes = span;
        }
      }
      row.totalWorkingTime = formatMinutes(totalWorkingMinutes);
      row.totalLunchTime = formatMinutes(totalLunchMinutes);
      dtrRows.push(row);
    }
  }

  dtrRows.sort((a, b) => {
    const emp = `${a.department}|${a.name}|${a.no}`.localeCompare(`${b.department}|${b.name}|${b.no}`);
    if (emp !== 0) return emp;
    return a.date.localeCompare(b.date);
  });

  return dtrRows;
}
