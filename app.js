/*
  Exir Calendar - Jalali calendar prototype v2

  Storage:
  - Local browser storage works immediately.
  - Optional GitHub sync writes calendar.json to your repository.
  - GitHub credentials are kept in sessionStorage only and are never hard-coded.

  IMPORTANT:
  A GitHub Pages site cannot securely hide a password/token in client-side JS.
  The GitHub token method below is intended for a single administrator.
  Use a fine-grained token restricted to this repository and Contents: Read/Write.
*/

const MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const WEEKDAYS = ["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"];
const COLORS = ["blue","green","orange","red","purple","teal","pink","indigo","yellow","gray"];
const COLOR_NAMES = {blue:"آبی",green:"سبز",orange:"نارنجی",red:"قرمز",purple:"بنفش",teal:"فیروزه‌ای",pink:"صورتی",indigo:"نیلی",yellow:"زرد",gray:"خاکستری"};

const STORAGE_KEY = "mahtab-calendar-data-v1";
const GITHUB_SESSION_KEY = "exir-calendar-github-session-v1";
const GITHUB_FILE = "calendar.json";
const TEHRAN_TZ = "Asia/Tehran";

let current = todayJalali();
let data = loadData();
let selectedJalaliDate = null;
let modalWasOffDay = false;
let toastTimer = null;

const $ = id => document.getElementById(id);

const monthTitle = $("monthTitle");
const weekdays = $("weekdays");
const calendarGrid = $("calendarGrid");
const eventModal = $("eventModal");
const eventForm = $("eventForm");
const eventId = $("eventId");
const eventTitle = $("eventTitle");
const eventPhone = $("eventPhone");
const eventDescription = $("eventDescription");
const eventStartTime = $("eventStartTime");
const eventEndTime = $("eventEndTime");
const eventColor = $("eventColor");
const colorPicker = $("colorPicker");
const offDay = $("offDay");
const eventFields = $("eventFields");
const selectedDateLabel = $("selectedDateLabel");
const modalTitle = $("modalTitle");
const deleteEventBtn = $("deleteEventBtn");
const toast = $("toast");

const syncModal = $("syncModal");
const githubOwner = $("githubOwner");
const githubRepo = $("githubRepo");
const githubBranch = $("githubBranch");
const githubToken = $("githubToken");
const syncStatus = $("syncStatus");

document.body.classList.add("view-mode");
init();

function init() {
  buildColorPicker();
  updateModeButton();
  render();
  loadPublicCalendar();

  $("prevMonthBtn").addEventListener("click", () => { current = addJalaliMonths(current, -1); render(); });
  $("nextMonthBtn").addEventListener("click", () => { current = addJalaliMonths(current, 1); render(); });
  $("todayBtn").addEventListener("click", () => { current = todayJalali(); render(); });
  $("printBtn").addEventListener("click", () => window.print());

  $("syncBtn").addEventListener("click", openSyncModal);
  $("closeModalBtn").addEventListener("click", closeModal);
  $("cancelBtn").addEventListener("click", closeModal);
  $("closeSyncBtn").addEventListener("click", closeSyncModal);
  $("cancelSyncBtn").addEventListener("click", closeSyncModal);
  $("saveGithubBtn").addEventListener("click", connectGithub);
  $("logoutBtn").addEventListener("click", logout);
  $("saveGithubManualBtn").addEventListener("click", manualSaveToGithub);
  $("closeAdminBtn").addEventListener("click", closeSyncModal);
  $("offDay").addEventListener("change", toggleOffDayFields);
  eventForm.addEventListener("submit", saveEvent);
  deleteEventBtn.addEventListener("click", deleteEvent);

  eventModal.addEventListener("click", e => { if (e.target === eventModal) closeModal(); });
  syncModal.addEventListener("click", e => { if (e.target === syncModal) closeSyncModal(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!eventModal.classList.contains("hidden")) closeModal();
      if (!syncModal.classList.contains("hidden")) closeSyncModal();
    }
  });
}

function loadData() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      events: Array.isArray(raw?.events) ? raw.events : [],
      offDays: Array.isArray(raw?.offDays) ? raw.offDays : []
    };
  } catch {
    return {events: [], offDays: []};
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function render() {
  weekdays.innerHTML = "";
  WEEKDAYS.forEach(day => {
    const el = document.createElement("div");
    el.className = "weekday";
    el.textContent = day;
    weekdays.appendChild(el);
  });

  monthTitle.textContent = `${MONTHS[current.month - 1]} ${toPersianDigits(current.year)}`;
  calendarGrid.innerHTML = "";

  const firstGregorian = jalaliToGregorian(current.year, current.month, 1);
  const firstSaturdayIndex = (firstGregorian.getDay() + 1) % 7;
  const lastDay = jalaliMonthLength(current.year, current.month);
  const today = todayJalali();

  for (let i = 0; i < firstSaturdayIndex; i++) {
    const empty = document.createElement("div");
    empty.className = "day-cell empty";
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= lastDay; day++) {
    const dateKey = makeDateKey(current.year, current.month, day);
    const cell = document.createElement("div");
    cell.className = "day-cell";

    const isToday = sameDate(today, {year:current.year, month:current.month, day});
    const isOff = data.offDays.includes(dateKey);

    if (isToday) cell.classList.add("today");
    if (isOff) cell.classList.add("off-day");

    const number = document.createElement("div");
    number.className = "day-number";
    number.textContent = toPersianDigits(day);
    cell.appendChild(number);

    const hint = document.createElement("div");
    hint.className = "add-hint";
    hint.textContent = "برای افزودن / ویرایش کلیک کنید";
    cell.appendChild(hint);

    const eventsContainer = document.createElement("div");
    eventsContainer.className = "events";

    data.events
      .filter(e => e.date === dateKey)
      .sort((a,b) => (a.startTime || "").localeCompare(b.startTime || ""))
      .forEach(ev => {
        const eventEl = document.createElement("div");
        eventEl.className = `event ${ev.color || "blue"}`;

        const titleEl = document.createElement("div");
        titleEl.className = "event-title";

        if (ev.startTime || ev.endTime) {
          const timeEl = document.createElement("span");
          timeEl.className = "event-time";
          timeEl.textContent = formatTimeRange(ev.startTime, ev.endTime);
          titleEl.appendChild(timeEl);
        }

        const text = document.createElement("span");
        text.textContent = ev.title;
        titleEl.appendChild(text);
        eventEl.appendChild(titleEl);

        eventEl.addEventListener("click", e => {
          e.stopPropagation();
          if (!document.body.classList.contains("view-mode")) {
            openEditModal(ev);
          } else {
            showEventDescription(ev);
          }
        });

        eventsContainer.appendChild(eventEl);
      });

    cell.appendChild(eventsContainer);

    cell.addEventListener("click", () => {
      if (!document.body.classList.contains("view-mode")) openDayModal(dateKey);
    });

    calendarGrid.appendChild(cell);
  }
}

function openDayModal(dateKey) {
  selectedJalaliDate = parseDateKey(dateKey);
  eventId.value = "";
  eventTitle.value = "";
  eventPhone.value = "";
  eventDescription.value = "";
  eventStartTime.value = "";
  eventEndTime.value = "";
  eventColor.value = "blue";
  selectColor("blue");

  const off = data.offDays.includes(dateKey);
  modalWasOffDay = off;
  offDay.checked = off;
  toggleOffDayFields();

  modalTitle.textContent = "مدیریت روز";
  selectedDateLabel.textContent = formatJalali(selectedJalaliDate);
  deleteEventBtn.classList.add("hidden");

  eventModal.classList.remove("hidden");
  setTimeout(() => eventTitle.focus(), 0);
}

function openEditModal(ev) {
  selectedJalaliDate = parseDateKey(ev.date);
  eventId.value = ev.id;
  eventTitle.value = ev.title;
  eventPhone.value = ev.phone || "";
  eventDescription.value = ev.description || "";
  eventStartTime.value = ev.startTime || "";
  eventEndTime.value = ev.endTime || "";
  eventColor.value = ev.color || "blue";
  selectColor(eventColor.value);

  modalWasOffDay = data.offDays.includes(ev.date);
  offDay.checked = modalWasOffDay;
  toggleOffDayFields();

  modalTitle.textContent = "ویرایش رویداد";
  selectedDateLabel.textContent = formatJalali(selectedJalaliDate);
  deleteEventBtn.classList.remove("hidden");

  eventModal.classList.remove("hidden");
  setTimeout(() => eventTitle.focus(), 0);
}

function toggleOffDayFields() {
  eventFields.classList.toggle("hidden", offDay.checked);
  // The title is validated manually so an existing off-day can be cleared without filling the form.
  eventTitle.required = false;
}

function closeModal() {
  eventModal.classList.add("hidden");
  eventForm.reset();
  selectedJalaliDate = null;
}

function saveEvent(e) {
  e.preventDefault();
  if (!selectedJalaliDate) return;

  const dateKey = makeDateKey(selectedJalaliDate.year, selectedJalaliDate.month, selectedJalaliDate.day);
  const id = eventId.value;
  const existing = data.events.findIndex(ev => ev.id === id);
  const title = eventTitle.value.trim();

  // Marking a day as off never requires any other field.
  if (offDay.checked) {
    if (!data.offDays.includes(dateKey)) data.offDays.push(dateKey);
    if (existing >= 0) data.events.splice(existing, 1);
    saveLocal();
    closeModal();
    render();
    showToast("روز به‌عنوان تعطیل ذخیره شد");
    return;
  }

  // If this day was already an off-day, unchecking the switch alone is enough to make it available again.
  if (modalWasOffDay && !title) {
    data.offDays = data.offDays.filter(d => d !== dateKey);
    saveLocal();
    closeModal();
    render();
    showToast("تعطیلی روز حذف شد");
    return;
  }

  if (!title) {
    showToast("لطفاً عنوان رویداد را وارد کنید");
    eventTitle.focus();
    return;
  }

  if (eventStartTime.value && eventEndTime.value && eventEndTime.value < eventStartTime.value) {
    showToast("زمان پایان نمی‌تواند قبل از زمان شروع باشد");
    return;
  }

  data.offDays = data.offDays.filter(d => d !== dateKey);

  const item = {
    id: id || crypto.randomUUID(),
    date: dateKey,
    title,
    phone: eventPhone.value.trim(),
    description: eventDescription.value.trim(),
    startTime: eventStartTime.value,
    endTime: eventEndTime.value,
    color: eventColor.value || "blue"
  };

  if (existing >= 0) data.events[existing] = item;
  else data.events.push(item);

  saveLocal();
  closeModal();
  render();
  showToast(id ? "رویداد ویرایش شد" : "رویداد اضافه شد");
}

function showEventDescription(ev) {
  const phone = (ev.phone || "").trim();
  const description = (ev.description || "").trim();

  if (phone && description) {
    showToast(`${ev.title}: ${phone} — ${description}`);
  } else if (phone) {
    showToast(`${ev.title}: ${phone}`);
  } else if (description) {
    showToast(`${ev.title}: ${description}`);
  } else {
    showToast("برای این رویداد شماره تلفن یا توضیحی ثبت نشده است");
  }
}

function deleteEvent() {
  const id = eventId.value;
  if (!id) return;
  if (!confirm("این رویداد حذف شود؟")) return;

  data.events = data.events.filter(ev => ev.id !== id);
  saveLocal();
  closeModal();
  render();
  showToast("رویداد حذف شد");
}

function buildColorPicker() {
  colorPicker.innerHTML = "";
  COLORS.forEach(color => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `color-choice ${color}`;
    button.title = COLOR_NAMES[color];
    button.setAttribute("aria-label", COLOR_NAMES[color]);
    button.addEventListener("click", () => selectColor(color));
    colorPicker.appendChild(button);
  });
}

function selectColor(color) {
  eventColor.value = color;
  document.querySelectorAll(".color-choice").forEach(el => {
    el.classList.toggle("selected", el.classList.contains(color));
  });
}

function formatTimeRange(start, end) {
  if (start && end) return `${toPersianDigits(start)}–${toPersianDigits(end)}`;
  return start ? toPersianDigits(start) : toPersianDigits(end);
}

/* ---------- Public shared calendar ---------- */

async function loadPublicCalendar() {
  // The repository is public, so visitors can read calendar.json without logging in.
  // This is what makes the same calendar appear on other phones/computers.
  const url = "https://raw.githubusercontent.com/zahrar87/mahtab_calendar/main/calendar.json";
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, {cache: "no-store"});
    if (!res.ok) return;
    const remote = normalizeData(await res.json());
    data = remote;
    saveLocal();
    render();
  } catch (err) {
    console.warn("Public calendar could not be loaded:", err);
  }
}

/* ---------- GitHub storage ---------- */

function getGithubSession() {
  try { return JSON.parse(sessionStorage.getItem(GITHUB_SESSION_KEY)); }
  catch { return null; }
}

function openSyncModal() {
  const s = getGithubSession();
  if (s) {
    enterAdminMode();
    showAdminPanel(s);
  } else {
    showLoginPanel();
  }
  syncModal.classList.remove("hidden");
  updateModeButton();
}

function showLoginPanel(){
  $("syncTitle").textContent="ورود مدیر";
  $("syncDescription").textContent="برای تغییر رویدادها ابتدا وارد حالت مدیریت شوید.";
  $("loginPanel").classList.remove("hidden");
  $("adminPanel").classList.add("hidden");
  githubOwner.value="zahrar87";
  githubRepo.value="mahtab_calendar";
  githubBranch.value="main";
  githubToken.value="";
  syncStatus.textContent="";
}

function showAdminPanel(s){
  $("syncTitle").textContent="مدیریت تقویم";
  $("syncDescription").textContent="شما وارد شده‌اید و حالت مدیریت فعال است.";
  $("loginPanel").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
  $("adminRepoLabel").textContent=`${s.owner}/${s.repo}`;
  $("adminSyncStatus").textContent="آماده";
  updateModeButton();
}

function closeSyncModal() {
  syncModal.classList.add("hidden");
}

function updateModeButton(){
  const loggedIn = !!getGithubSession();
  $("syncBtn").textContent = loggedIn ? "مدیریت" : "ورود مدیر";
}

function enterAdminMode(){
  if (!getGithubSession()) { showToast("ابتدا از «ورود مدیر» وارد شوید"); return; }
  document.body.classList.remove("view-mode");
  updateModeButton();
  showToast("حالت مدیریت فعال شد");
}

function enterViewMode(){
  document.body.classList.add("view-mode");
  updateModeButton();
  showToast("حالت نمایش فعال شد");
}

function logout(){
  sessionStorage.removeItem(GITHUB_SESSION_KEY);
  enterViewMode();
  closeSyncModal();
  updateModeButton();
  showToast("از حالت مدیریت خارج شدید");
}

async function connectGithub() {
  const owner = githubOwner.value.trim();
  const repo = githubRepo.value.trim();
  const branch = githubBranch.value.trim() || "main";
  const token = githubToken.value.trim();

  if (!owner || !repo || !token) {
    syncStatus.textContent = "نام کاربری، repository و token را وارد کنید.";
    return;
  }

  syncStatus.textContent = "در حال دریافت اطلاعات از GitHub...";

  try {
    const s = {owner, repo, branch, token};
    const remote = await githubGetFile(s);
    if (remote?.data) {
      data = normalizeData(remote.data);
      saveLocal();
      render();
      sessionStorage.setItem(GITHUB_SESSION_KEY, JSON.stringify(s));
      enterAdminMode();
      syncStatus.textContent = "تقویم از GitHub دریافت شد.";
      showAdminPanel(s);
    } else {
      sessionStorage.setItem(GITHUB_SESSION_KEY, JSON.stringify(s));
      enterAdminMode();
      syncStatus.textContent = "calendar.json هنوز در GitHub وجود ندارد. بعد از ورود، با «ذخیره در GitHub» آن را ایجاد کنید.";
      showAdminPanel(s);
    }
  } catch (err) {
    sessionStorage.removeItem(GITHUB_SESSION_KEY);
    updateModeButton();
    syncStatus.textContent = githubErrorMessage(err);
  }
}

let githubSaveInProgress = false;

async function manualSaveToGithub() {
  const s = getGithubSession();
  if (!s || githubSaveInProgress) return;

  const button = $("saveGithubManualBtn");
  const status = $("adminSyncStatus");
  const pill = $("saveStatusPill");

  githubSaveInProgress = true;
  button.disabled = true;
  button.textContent = "در حال ذخیره...";
  if (pill) pill.textContent = "در حال ذخیره...";
  if (status) status.textContent = "در حال ذخیره آخرین تغییرات در GitHub...";

  try {
    await githubPutFile(s, data, "Update calendar data");
    if (pill) pill.textContent = "همگام";
    if (status) status.textContent = "آخرین تغییرات با موفقیت در GitHub ذخیره شد.";
    showToast("در GitHub ذخیره شد");
  } catch (err) {
    if (pill) pill.textContent = "ذخیره نشد";
    if (status) status.textContent = githubErrorMessage(err);
    showToast("ذخیره در GitHub انجام نشد؛ تغییرات محلی شما باقی مانده‌اند");
  } finally {
    githubSaveInProgress = false;
    button.disabled = false;
    button.textContent = "ذخیره در GitHub";
  }
}

function githubErrorMessage(err) {
  const msg = String(err?.message || err);
  if (msg.includes("GitHub 401")) return "توکن GitHub معتبر نیست یا منقضی شده است.";
  if (msg.includes("GitHub 403")) return "GitHub دسترسی را رد کرد. دسترسی Contents روی همین repository را بررسی کنید.";
  if (msg.includes("GitHub 404")) return "repository یا branch پیدا نشد. نام repository و branch را بررسی کنید.";
  if (msg.includes("GitHub 409")) return "GitHub با تغییر همزمان مواجه شد. دوباره تلاش کنید.";
  return `خطا در GitHub: ${msg}`;
}

function clearGithubSession() {
  sessionStorage.removeItem(GITHUB_SESSION_KEY);
  githubToken.value = "";
  syncStatus.textContent = "اطلاعات ورود از این مرورگر پاک شد.";
  updateModeButton();
  showToast("ورود GitHub پاک شد");
}

async function githubGetFile(s) {
  const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${GITHUB_FILE}?ref=${encodeURIComponent(s.branch)}`;
  const res = await fetch(url, {headers: githubHeaders(s.token)});
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const json = await res.json();
  const decoded = decodeBase64Unicode(json.content.replace(/\n/g, ""));
  return {sha: json.sha, data: JSON.parse(decoded)};
}

async function githubPutFile(s, value, message) {
  const existing = await githubGetFile(s);
  const content = encodeBase64Unicode(JSON.stringify(normalizeData(value), null, 2));
  const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${GITHUB_FILE}`;

  const body = {
    message,
    content,
    branch: s.branch
  };
  if (existing?.sha) body.sha = existing.sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(s.token),
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 180)}`);
  }
  return res.json();
}

function githubHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

function encodeBase64Unicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function decodeBase64Unicode(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeData(value) {
  return {
    events: Array.isArray(value?.events) ? value.events : [],
    offDays: Array.isArray(value?.offDays) ? value.offDays : []
  };
}

/* ---------- Jalali calendar ---------- */

function todayJalali() {
  // Use the browser's built-in Persian calendar, but force the date/time zone to Tehran.
  // This avoids the old conversion routine's one-day offset.
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());

  const get = type => Number(parts.find(p => p.type === type).value);
  return {year: get("year"), month: get("month"), day: get("day")};
}

function gregorianToJalaliFromNumbers(gy, gm, gd) {
  const gdm = [0,31,59,90,120,151,181,212,243,273,304,334];
  const gy2 = gy + 1;
  let days = 355666 + 365 * gy + div(gy2,4) - div(gy2,100) + div(gy2,400) + gd + gdm[gm-1];

  let jy = -1595 + 33 * div(days,12053);
  days %= 12053;
  jy += 4 * div(days,1461);
  days %= 1461;

  if (days > 365) {
    jy += div(days - 1,365);
    days = (days - 1) % 365;
  }

  const jm = days < 186 ? 1 + div(days,31) : 7 + div(days - 186,30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return {year:jy, month:jm, day:jd};
}

function div(a,b) { return Math.floor(a/b); }

function jalaliToGregorian(jy,jm,jd) {
  jy += 1595;
  let days = -355668 + 365*jy + div(jy,33)*8 + div((jy%33)+3,4) + jd +
    (jm < 7 ? (jm-1)*31 : (jm-1)*30+6);

  let gy = 400 * div(days,146097);
  days %= 146097;

  if (days > 36524) {
    gy += 100 * div(--days,36524);
    days %= 36524;
    if (days >= 365) days++;
  }

  gy += 4 * div(days,1461);
  days %= 1461;

  if (days > 365) {
    gy += div(days-1,365);
    days = (days-1) % 365;
  }

  let gd = days + 1;
  const salA = [0,31,isGregorianLeap(gy)?29:28,31,30,31,30,31,31,30,31,30,31];
  let gm = 1;
  while (gm <= 12 && gd > salA[gm]) { gd -= salA[gm]; gm++; }
  return new Date(gy,gm-1,gd);
}

function isGregorianLeap(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function jalaliMonthLength(year,month) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeap(year) ? 30 : 29;
}

function isJalaliLeap(year) {
  const a = jalaliToGregorian(year,12,1);
  const b = jalaliToGregorian(year+1,1,1);
  return Math.round((b-a)/86400000) === 30;
}

function addJalaliMonths(date,amount) {
  let month = date.month + amount;
  let year = date.year;
  while (month > 12) { month -= 12; year++; }
  while (month < 1) { month += 12; year--; }
  return {year,month,day:Math.min(date.day,jalaliMonthLength(year,month))};
}

function makeDateKey(year,month,day) {
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function parseDateKey(key) {
  const [year,month,day] = key.split("-").map(Number);
  return {year,month,day};
}

function sameDate(a,b) {
  return a.year===b.year && a.month===b.month && a.day===b.day;
}

function formatJalali(date) {
  const weekday = WEEKDAYS[(jalaliToGregorian(date.year,date.month,date.day).getDay()+1)%7];
  return `${weekday}، ${toPersianDigits(date.day)} ${MONTHS[date.month-1]} ${toPersianDigits(date.year)}`;
}

function toPersianDigits(value) {
  return String(value).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2300);
}
