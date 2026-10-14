(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE = { tasks: "lifeos_tasks_v1", notes: "lifeos_notes_v1", focus: "lifeos_focus_v1", theme: "lifeos_theme_v1" };
  const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const safeLoad = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast("Browser tidak bisa menyimpan data. Coba kosongkan penyimpanan."); } };
  let tasks = safeLoad(STORAGE.tasks, []);
  let notes = safeLoad(STORAGE.notes, []);
  let focusData = safeLoad(STORAGE.focus, {});
  let currentMonth = new Date(); currentMonth.setDate(1);
  let timerInterval = null, timerRemaining = 25 * 60, selectedMinutes = 25, timerEndAt = null, running = false;
  let toastTimer = null;

  function toast(message, symbol = "✳") {
    const region = $("#toastRegion"); if (!region) return;
    const node = document.createElement("div"); node.className = "toast";
    const icon = document.createElement("span"); icon.textContent = symbol;
    const text = document.createElement("div"); text.textContent = message;
    node.append(icon, text); region.append(node);
    window.setTimeout(() => { node.style.opacity = "0"; node.style.transform = "translateY(8px)"; window.setTimeout(() => node.remove(), 260); }, 2800);
  }
  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  }
  function formatDate(dateString, options = { day:"numeric", month:"short" }) {
    if (!dateString) return "Tanpa tenggat";
    const date = new Date(`${dateString}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "Tanpa tenggat" : new Intl.DateTimeFormat("id-ID", options).format(date);
  }
  function todayFocus() { const key = todayKey(); if (!focusData[key]) focusData[key] = { sessions: 0, minutes: 0 }; return focusData[key]; }
  function getGreeting() {
    const hour = new Date().getHours();
    return hour < 11 ? "Good morning" : hour < 15 ? "Good afternoon" : hour < 19 ? "Good evening" : "Good night";
  }
  function updateDateLabels() {
    const now = new Date();
    $("#topDate").textContent = new Intl.DateTimeFormat("en-US", { weekday:"short", month:"short", day:"2-digit" }).format(now).toUpperCase();
    $("#heroDate").textContent = new Intl.DateTimeFormat("en-US", { weekday:"short", month:"long", day:"numeric" }).format(now).toUpperCase();
    $("#greetingTitle").innerHTML = `${getGreeting()}<span class="title-period">.</span>`;
    document.title = "LifeOS — " + new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"long" }).format(now);
  }

  function showPage(target) {
    const valid = ["overview", "tasks", "notes", "focus"].includes(target) ? target : "overview";
    $$(".page-section").forEach(section => section.classList.toggle("active-section", section.id === valid));
    $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.target === valid));
    $("#currentPageLabel").textContent = ({overview:"Overview",tasks:"Tasks",notes:"Quick notes",focus:"Focus room"})[valid];
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (valid === "tasks") renderTasks();
    if (valid === "notes") renderNotes();
    if (valid === "focus") updateFocusStats();
  }
  function taskMarkup(task, full = false) {
    const due = task.due ? formatDate(task.due) : "Tanpa tenggat";
    return `<article class="task-row ${task.done ? "is-complete" : ""}" data-task-id="${escapeText(task.id)}">
      <input class="task-check" type="checkbox" aria-label="Tandai tugas selesai" ${task.done ? "checked" : ""} data-action="toggle">
      <div class="task-copy"><strong>${escapeText(task.title)}</strong><small>${escapeText(task.category || "Personal")} · ${escapeText(due)}</small></div>
      <span class="category-tag">${escapeText(task.category || "Personal")}</span>
      ${full ? `<div class="task-row-actions"><button type="button" data-action="edit" aria-label="Edit tugas" title="Edit">✎</button><button type="button" data-action="delete" aria-label="Hapus tugas" title="Hapus">×</button></div>` : ""}
    </article>`;
  }
  function emptyState(title, subtitle, symbol = "✓") {
    return `<div class="empty-state"><span>${symbol}</span><strong>${escapeText(title)}</strong><br>${escapeText(subtitle)}</div>`;
  }
  function renderTasks() {
    const active = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    $("#navTaskCount").textContent = active.length;
    $("#completedStat").textContent = done.length;
    $("#totalStat").textContent = `/ ${tasks.length} tasks`;
    const pct = tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
    $("#taskProgressBar").style.width = pct + "%";
    $("#taskPercent").textContent = pct + "%";
    $("#taskProgressText").textContent = tasks.length ? `${active.length} tugas tersisa` : "Mulai dari satu tugas";
    $("#managerTaskCount").textContent = tasks.length;
    $("#activeBreakdown").textContent = active.length;
    $("#doneBreakdown").textContent = done.length;
    $("#bigProgressValue").textContent = pct + "%";
    $("#bigProgressRing").style.background = `conic-gradient(var(--cyan) ${pct*3.6}deg, #24415c ${pct*3.6}deg)`;
    const overview = $("#overviewTaskList");
    const priority = [...active, ...done].slice(0, 4);
    overview.innerHTML = priority.length ? priority.map(t => taskMarkup(t)).join("") : emptyState("Belum ada tugas", "Tambahkan tugas pertamamu untuk mulai.", "＋");
    const filter = $("#taskFilter")?.value || "all";
    const query = ($("#taskSearch")?.value || "").trim().toLowerCase();
    let filtered = tasks.filter(t => (filter === "all" || (filter === "active" && !t.done) || (filter === "completed" && t.done)) && `${t.title} ${t.category}`.toLowerCase().includes(query));
    filtered.sort((a,b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
    $("#fullTaskList").innerHTML = filtered.length ? filtered.map(t => taskMarkup(t, true)).join("") : emptyState(tasks.length ? "Tidak ada tugas yang cocok" : "Ruang tugas masih kosong", tasks.length ? "Coba ubah kata kunci atau filter." : "Gunakan tombol Tugas baru untuk menambahkan tugas.", "✓");
    renderCalendar(); renderStats();
  }
  function renderStats() {
    $("#notesStat").textContent = notes.length;
    $("#latestNotePreview").textContent = notes[0]?.title || "Ide bagus dimulai dari catatan kecil.";
    const data = todayFocus();
    $("#focusStat").textContent = data.sessions;
    $("#focusMinutesToday").textContent = `${data.minutes} min`;
    $("#focusSessionsToday").textContent = `${data.sessions} sesi`;
  }
  function renderCalendar() {
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    $("#calendarMonth").textContent = new Intl.DateTimeFormat("en-US", { month:"long", year:"numeric" }).format(currentMonth);
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayKey();
    const dueDates = new Set(tasks.filter(t => t.due && !t.done).map(t => t.due));
    const names = ["SU","MO","TU","WE","TH","FR","SA"];
    let html = names.map(n => `<div class="calendar-day-name">${n}</div>`).join("");
    for (let i=0; i<firstDay; i++) html += `<div class="calendar-day empty"></div>`;
    for (let day=1; day<=daysInMonth; day++) {
      const key = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const classes = ["calendar-day", key === today ? "today" : "", dueDates.has(key) ? "has-task" : ""].filter(Boolean).join(" ");
      html += `<div class="${classes}" title="${dueDates.has(key) ? "Ada tugas dengan tenggat" : ""}">${day}</div>`;
    }
    $("#calendarGrid").innerHTML = html;
  }
  function openTaskDialog(task = null) {
    $("#taskForm").reset();
    $("#taskIdInput").value = task?.id || "";
    $("#taskTitleInput").value = task?.title || "";
    $("#taskCategoryInput").value = task?.category || "Personal";
    $("#taskDueInput").value = task?.due || "";
    $("#taskDialogTitle").textContent = task ? "Edit tugas" : "Tambah tugas";
    const dialog = $("#taskDialog");
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    window.setTimeout(() => $("#taskTitleInput").focus(), 80);
  }
  function closeTaskDialog() {
    const dialog = $("#taskDialog");
    if (dialog.open && typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
  }
  function handleTaskSubmit(event) {
    event.preventDefault();
    const title = $("#taskTitleInput").value.trim();
    if (!title) { toast("Nama tugas tidak boleh kosong.", "!"); return; }
    const id = $("#taskIdInput").value;
    const values = { title, category: $("#taskCategoryInput").value, due: $("#taskDueInput").value };
    if (id) {
      const existing = tasks.find(t => t.id === id);
      if (existing) Object.assign(existing, values);
      toast("Tugas berhasil diperbarui.", "✓");
    } else {
      tasks.unshift({ id: cryptoId(), ...values, done: false, createdAt: Date.now() });
      toast("Tugas baru berhasil ditambahkan.", "＋");
    }
    save(STORAGE.tasks, tasks); closeTaskDialog(); renderTasks();
  }
  function cryptoId() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2,9)}`; }
  function handleTaskAction(event) {
    const row = event.target.closest("[data-task-id]"); if (!row) return;
    const task = tasks.find(t => t.id === row.dataset.taskId); if (!task) return;
    const action = event.target.dataset.action;
    if (event.target.matches('[data-action="toggle"]')) {
      task.done = event.target.checked;
      save(STORAGE.tasks, tasks); renderTasks();
      toast(task.done ? "Nice! Satu tugas selesai." : "Tugas dikembalikan ke daftar aktif.", task.done ? "✓" : "↺");
    } else if (action === "edit") openTaskDialog(task);
    else if (action === "delete") {
      tasks = tasks.filter(t => t.id !== task.id); save(STORAGE.tasks, tasks); renderTasks(); toast("Tugas dihapus.", "×");
    }
  }

  function renderNotes() {
    const query = ($("#noteSearch").value || "").trim().toLowerCase();
    const filtered = notes.filter(note => `${note.title} ${note.body}`.toLowerCase().includes(query));
    $("#notesCountPill").textContent = notes.length;
    $("#notesList").innerHTML = filtered.length ? filtered.map(note => `<article class="note-card" data-note-id="${escapeText(note.id)}"><div class="note-card-top"><span>${escapeText(formatDate(note.createdAtDate, {day:"numeric",month:"short",year:"numeric"}))}</span><div class="note-card-actions"><button data-note-action="edit" title="Edit catatan" aria-label="Edit catatan">✎</button><button data-note-action="delete" title="Hapus catatan" aria-label="Hapus catatan">×</button></div></div><h4>${escapeText(note.title)}</h4><p>${escapeText(note.body)}</p></article>`).join("") : emptyState(notes.length ? "Catatan tidak ditemukan" : "Belum ada catatan", notes.length ? "Coba kata kunci yang berbeda." : "Ide pertamamu bisa dimulai di panel sebelah.", "✎");
    renderStats();
  }
  function saveNote() {
    const title = $("#noteTitle").value.trim() || "Catatan tanpa judul";
    const body = $("#noteBody").value.trim();
    if (!body) { toast("Isi catatan masih kosong.", "!"); $("#noteBody").focus(); return; }
    notes.unshift({ id: cryptoId(), title, body, createdAt: Date.now(), createdAtDate: todayKey() });
    save(STORAGE.notes, notes); $("#noteTitle").value = ""; $("#noteBody").value = ""; $("#noteCharCount").textContent = "0 / 2000";
    renderNotes(); toast("Catatan tersimpan di browser ini.", "✓");
  }
  function handleNoteAction(event) {
    const button = event.target.closest("[data-note-action]"); if (!button) return;
    const card = button.closest("[data-note-id]"); const note = notes.find(n => n.id === card?.dataset.noteId); if (!note) return;
    if (button.dataset.noteAction === "delete") {
      notes = notes.filter(n => n.id !== note.id); save(STORAGE.notes, notes); renderNotes(); toast("Catatan dihapus.", "×");
    } else if (button.dataset.noteAction === "edit") {
      $("#noteTitle").value = note.title; $("#noteBody").value = note.body; $("#noteCharCount").textContent = `${note.body.length} / 2000`;
      notes = notes.filter(n => n.id !== note.id); save(STORAGE.notes, notes); renderNotes(); $("#noteTitle").focus(); toast("Catatan dimuat ke editor. Simpan setelah selesai mengedit.", "✎");
    }
  }

  function updateTimerDisplay() {
    const mins = Math.floor(Math.max(0, timerRemaining) / 60), secs = Math.max(0, timerRemaining) % 60;
    $("#timerDisplay").textContent = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    const ring = $(".focus-ring");
    const progress = 1 - timerRemaining / (selectedMinutes * 60);
    ring.style.background = `conic-gradient(from -90deg, #4aaeff ${progress*360}deg, #203a5c ${progress*360}deg 360deg)`;
    document.title = running ? `${$("#timerDisplay").textContent} — LifeOS Focus` : "LifeOS — Personal Dashboard";
  }
  function setTimerMode(minutes) {
    pauseTimer(false); selectedMinutes = minutes; timerRemaining = minutes * 60;
    $$(".preset").forEach(button => button.classList.toggle("active", Number(button.dataset.minutes) === minutes));
    $("#focusModeLabel").textContent = minutes === 25 ? "FOCUS SESSION" : minutes === 5 ? "SHORT BREAK" : "LONG BREAK";
    $("#timerStart").innerHTML = "<span>▶</span> Mulai " + (minutes === 25 ? "fokus" : "istirahat");
    $("#timerStatus").classList.remove("running"); $("#timerStatus").innerHTML = "<i></i> READY WHEN YOU ARE";
    updateTimerDisplay();
  }
  function startTimer() {
    if (running) { pauseTimer(); return; }
    if (timerRemaining <= 0) timerRemaining = selectedMinutes * 60;
    running = true; timerEndAt = Date.now() + timerRemaining * 1000;
    $("#timerStart").innerHTML = "<span>Ⅱ</span> Jeda timer";
    $("#timerStatus").classList.add("running"); $("#timerStatus").innerHTML = "<i></i> FOCUS IN PROGRESS";
    timerInterval = window.setInterval(tickTimer, 250); tickTimer();
  }
  function pauseTimer(showToast = true) {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null; running = false; timerEndAt = null;
    if ($("#timerStart")) $("#timerStart").innerHTML = "<span>▶</span> Mulai " + (selectedMinutes === 25 ? "fokus" : "istirahat");
    if ($("#timerStatus")) { $("#timerStatus").classList.remove("running"); $("#timerStatus").innerHTML = "<i></i> PAUSED / READY"; }
    if (showToast) toast("Timer dijeda.", "Ⅱ");
    updateTimerDisplay();
  }
  function tickTimer() {
    if (!running || !timerEndAt) return;
    timerRemaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    updateTimerDisplay();
    if (timerRemaining <= 0) {
      window.clearInterval(timerInterval); timerInterval = null; running = false; timerEndAt = null;
      if (selectedMinutes === 25) {
        const data = todayFocus(); data.sessions += 1; data.minutes += 25; save(STORAGE.focus, focusData);
        $("#focusNextTip").textContent = "Great work!";
      }
      $("#timerStart").innerHTML = "<span>▶</span> Mulai lagi";
      $("#timerStatus").classList.remove("running"); $("#timerStatus").innerHTML = "<i></i> SESSION COMPLETE";
      renderStats(); updateFocusStats(); toast(selectedMinutes === 25 ? "Sesi fokus selesai. Kerja bagus!" : "Waktu istirahat selesai.", "✳");
      if ("Notification" in window && Notification.permission === "granted") new Notification("LifeOS", { body: selectedMinutes === 25 ? "Sesi fokus selesai. Saatnya istirahat." : "Istirahat selesai. Siap fokus lagi?" });
      try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 660; gain.gain.value = .04; osc.start(); osc.stop(ctx.currentTime + .18); osc.onended = () => ctx.close(); } catch {}
    }
  }
  function updateFocusStats() {
    const data = todayFocus(); $("#focusMinutesToday").textContent = `${data.minutes} min`; $("#focusSessionsToday").textContent = `${data.sessions} sesi`;
    $("#focusNextTip").textContent = data.sessions >= 4 ? "Excellent streak!" : data.sessions ? "Keep it steady" : "Start your first";
  }

  function setTheme(light) {
    document.body.classList.toggle("light-mode", light);
    $("#themeButton").textContent = light ? "☾" : "☼";
    save(STORAGE.theme, light ? "light" : "dark");
  }
  function resetAll() {
    if (!window.confirm("Hapus semua tugas, catatan, dan statistik fokus dari browser ini?")) return;
    tasks = []; notes = []; focusData = {}; save(STORAGE.tasks, tasks); save(STORAGE.notes, notes); save(STORAGE.focus, focusData);
    renderTasks(); renderNotes(); updateFocusStats(); toast("Data LifeOS berhasil direset.", "↻");
  }

  $$(".nav-link").forEach(link => link.addEventListener("click", () => showPage(link.dataset.target)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.go)));
  $("#addTaskTop").addEventListener("click", () => openTaskDialog());
  $("#addTaskInline").addEventListener("click", () => openTaskDialog());
  $("#addTaskManager").addEventListener("click", () => openTaskDialog());
  $("#focusShortcut").addEventListener("click", () => showPage("focus"));
  $("#taskForm").addEventListener("submit", handleTaskSubmit);
  $("#closeTaskDialog").addEventListener("click", closeTaskDialog);
  $("#cancelTask").addEventListener("click", closeTaskDialog);
  $("#overviewTaskList").addEventListener("change", handleTaskAction);
  $("#fullTaskList").addEventListener("change", handleTaskAction);
  $("#fullTaskList").addEventListener("click", handleTaskAction);
  $("#taskFilter").addEventListener("change", renderTasks);
  $("#taskSearch").addEventListener("input", renderTasks);
  $("#prevMonth").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); });
  $("#nextMonth").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); });
  $("#saveNoteButton").addEventListener("click", saveNote);
  $("#noteBody").addEventListener("input", () => { $("#noteCharCount").textContent = `${$("#noteBody").value.length} / 2000`; });
  $("#noteSearch").addEventListener("input", renderNotes);
  $("#notesList").addEventListener("click", handleNoteAction);
  $$(".preset").forEach(button => button.addEventListener("click", () => setTimerMode(Number(button.dataset.minutes))));
  $("#timerStart").addEventListener("click", () => running ? pauseTimer() : startTimer());
  $("#timerReset").addEventListener("click", () => { pauseTimer(false); timerRemaining = selectedMinutes * 60; updateTimerDisplay(); $("#timerStatus").innerHTML = "<i></i> READY WHEN YOU ARE"; toast("Timer direset.", "↻"); });
  $("#themeButton").addEventListener("click", () => setTheme(!document.body.classList.contains("light-mode")));
  $("#greetingButton").addEventListener("click", () => toast(`${getGreeting()}! Siap bikin hari ini produktif?`, "✳"));
  $("#resetButton").addEventListener("click", resetAll);
  $("#taskDialog").addEventListener("click", event => { if (event.target === $("#taskDialog")) closeTaskDialog(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeTaskDialog();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); showPage("tasks"); $("#taskSearch").focus(); }
  });

  // Keep a local reminder option without requesting notification permission automatically.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running) tickTimer(); });
  updateDateLabels();
  setTheme(safeLoad(STORAGE.theme, "dark") === "light");
  renderTasks(); renderNotes(); updateFocusStats(); renderCalendar(); updateTimerDisplay();
})();