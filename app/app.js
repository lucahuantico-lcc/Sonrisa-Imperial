// App del paciente de Sonrisa Imperial.
// Todo se guarda solo en el celular del paciente (localStorage); no hay servidor.

const WHATSAPP_NUMBER = "51925659628";
const CLINICA = "Sonrisa Imperial, Villa María del Triunfo, Lima";
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Villa+Mar%C3%ADa+del+Triunfo%2C+Lima";

/* ---------- Guardado local ---------- */

function load(key, fallback) {
  try {
    const value = localStorage.getItem(`si-${key}`);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(`si-${key}`, JSON.stringify(value));
  } catch {
    // Sin almacenamiento (modo privado): la app funciona, pero no recuerda nada
  }
}

/* ---------- Fechas ---------- */

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const longDate = (d) => d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

function parseLocal(fecha, hora = "00:00") {
  const [y, m, d] = fecha.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

function daysUntil(date) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - start) / 86400000);
}

/* ---------- Calendario del celular ---------- */

// Hora "flotante" (sin zona): el calendario la toma en la hora local del celular
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsText = (s) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

function icsEvent({ id, title, details, start, minutes, rrule, alarms }) {
  const end = new Date(start.getTime() + minutes * 60000);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${id}@sonrisa-imperial-lima.vercel.app`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(details)}`,
    `LOCATION:${icsText(CLINICA)}`,
  ];
  if (rrule) lines.push(`RRULE:${rrule}`);
  alarms.forEach((trigger) => {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(title)}`, `TRIGGER:-${trigger}`, "END:VALARM");
  });
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function downloadIcs(filename, events) {
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sonrisa Imperial//App//ES", ...events, "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function googleCalendarUrl({ title, details, start, minutes, rrule }) {
  const end = new Date(start.getTime() + minutes * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details,
    location: CLINICA,
    dates: `${icsDate(start)}/${icsDate(end)}`,
  });
  if (rrule) params.set("recur", `RRULE:${rrule}`);
  return `https://calendar.google.com/calendar/render?${params}`;
}

const whatsappUrl = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

/* ---------- Rutina diaria ---------- */

const DEFAULT_ROUTINE = [
  { id: "manana", nombre: "Cepillado después del desayuno", hora: "08:00", activo: true },
  { id: "almuerzo", nombre: "Cepillado después del almuerzo", hora: "14:00", activo: true },
  { id: "noche", nombre: "Cepillado antes de dormir", hora: "21:30", activo: true },
  { id: "hilo", nombre: "Hilo dental", hora: "21:35", activo: true },
];

let routine = load("rutina", DEFAULT_ROUTINE);
let checks = load("checks", {});

const activeRoutine = () => routine.filter((item) => item.activo);

function dayComplete(key) {
  const done = checks[key] || [];
  const items = activeRoutine();
  return items.length > 0 && items.every((item) => done.includes(item.id));
}

// Días seguidos con la rutina completa; si hoy aún no se completa, se cuenta desde ayer
function streak() {
  let day = new Date();
  if (!dayComplete(dateKey(day))) day = addDays(day, -1);
  let count = 0;
  while (dayComplete(dateKey(day))) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

function renderChecklist() {
  const key = dateKey(new Date());
  const done = checks[key] || [];
  const list = document.getElementById("checklist");
  list.innerHTML = "";

  activeRoutine().forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<label><input type="checkbox"><span><strong></strong><small></small></span></label>`;
    const input = li.querySelector("input");
    input.checked = done.includes(item.id);
    li.querySelector("strong").textContent = item.nombre;
    li.querySelector("small").textContent = `A las ${item.hora}`;
    input.addEventListener("change", () => {
      const today = new Set(checks[key] || []);
      input.checked ? today.add(item.id) : today.delete(item.id);
      checks[key] = [...today];
      // Solo se guardan los últimos 60 días
      const oldest = dateKey(addDays(new Date(), -60));
      Object.keys(checks).forEach((k) => k < oldest && delete checks[k]);
      save("checks", checks);
      renderChecklist();
    });
    list.append(li);
  });

  document.getElementById("checklist-done").hidden = !dayComplete(key);
  const days = streak();
  document.getElementById("streak").textContent =
    days === 0 ? "Empieza tu racha hoy" : days === 1 ? "1 día seguido" : `${days} días seguidos`;
}

function routineEvent(item) {
  const [h, m] = item.hora.split(":").map(Number);
  const now = new Date();
  return {
    id: `rutina-${item.id}`,
    title: item.id === "hilo" ? "Usa el hilo dental" : "Hora de cepillarte los dientes",
    details: `${item.nombre}. Recordatorio de tu plan de cuidado de Sonrisa Imperial.`,
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m),
    minutes: 5,
    rrule: "FREQ=DAILY",
    alarms: ["PT0M"],
  };
}

function renderRoutine() {
  const box = document.getElementById("routine");
  box.innerHTML = "";

  routine.forEach((item) => {
    const row = document.createElement("div");
    row.innerHTML = `
      <label class="routine__item">
        <input type="checkbox">
        <span></span>
        <input type="time" step="300" aria-label="Hora">
      </label>
      <a class="link" target="_blank" rel="noopener">+ Google Calendar</a>`;
    const [check, time] = row.querySelectorAll("input");
    const google = row.querySelector("a");
    row.querySelector("span").textContent = item.nombre;
    check.checked = item.activo;
    time.value = item.hora;
    time.disabled = !item.activo;
    google.hidden = !item.activo;
    google.href = googleCalendarUrl(routineEvent(item));

    check.addEventListener("change", () => {
      item.activo = check.checked;
      save("rutina", routine);
      renderRoutine();
      renderChecklist();
    });
    time.addEventListener("change", () => {
      if (!time.value) return;
      item.hora = time.value;
      save("rutina", routine);
      google.href = googleCalendarUrl(routineEvent(item));
      renderChecklist();
    });
    box.append(row);
  });
}

document.getElementById("routine-ics").addEventListener("click", () => {
  const items = activeRoutine();
  if (items.length === 0) return;
  downloadIcs("rutina-sonrisa-imperial.ics", items.map((item) => icsEvent(routineEvent(item))));
});

/* ---------- Recordatorios de largo plazo ---------- */

function longTermEvents() {
  const at10 = (days) => {
    const d = addDays(new Date(), days);
    d.setHours(10, 0);
    return d;
  };
  return [
    {
      id: "cepillo",
      title: "Cambia tu cepillo de dientes",
      details: "Cada 3 meses, o antes si las cerdas están abiertas.",
      start: at10(90),
      minutes: 15,
      rrule: "FREQ=MONTHLY;INTERVAL=3",
      alarms: ["PT0M"],
    },
    {
      id: "limpieza",
      title: "Toca tu limpieza dental en Sonrisa Imperial",
      details: "Se recomienda una limpieza cada 6 meses. Agenda tu cita desde la app.",
      start: at10(180),
      minutes: 15,
      rrule: "FREQ=MONTHLY;INTERVAL=6",
      alarms: ["PT0M"],
    },
  ];
}

function renderLongTerm() {
  const list = document.getElementById("longterm");
  list.innerHTML = "";
  longTermEvents().forEach((event) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong></strong><span class="muted"></span>
      <span class="links"><a class="link" target="_blank" rel="noopener">+ Google Calendar</a><button type="button" class="link">+ Calendario del iPhone u otro</button></span>`;
    li.querySelector("strong").textContent = event.title;
    li.querySelector(".muted").textContent = `${event.details} Primer aviso: ${longDate(event.start)}.`;
    li.querySelector("a").href = googleCalendarUrl(event);
    li.querySelector("button").addEventListener("click", () => downloadIcs(`${event.id}-sonrisa-imperial.ics`, [icsEvent(event)]));
    list.append(li);
  });
}

/* ---------- Mi cita ---------- */

let cita = load("cita", null);

function upcomingCita() {
  if (!cita) return null;
  const start = parseLocal(cita.fecha, cita.hora);
  return daysUntil(start) >= 0 ? { ...cita, start } : null;
}

function citaEvent(c) {
  return {
    id: `cita-${c.fecha}-${c.hora.replace(":", "")}`,
    title: `Cita de ${c.tratamiento.toLowerCase()} en Sonrisa Imperial`,
    details: "Llega 10 minutos antes. Si necesitas cambiar la cita, escríbenos por WhatsApp.",
    start: c.start,
    minutes: 45,
    alarms: ["P1D", "PT2H"],
  };
}

function countdownText(start) {
  const days = daysUntil(start);
  if (days === 0) return `Hoy <small>a las ${start.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" })}</small>`;
  if (days === 1) return "Mañana";
  return `${days} <small>días</small>`;
}

function renderHomeAppointment() {
  const card = document.getElementById("home-appointment");
  const c = upcomingCita();
  if (c) {
    card.innerHTML = `
      <p class="label">Tu próxima cita</p>
      <p class="countdown">${countdownText(c.start)}</p>
      <h2></h2>
      <p class="muted"></p>
      <a href="#cita" class="btn btn--light">Ver mi cita</a>`;
    card.querySelector("h2").textContent = c.tratamiento;
    card.querySelector(".muted").textContent =
      `${longDate(c.start)}, ${c.hora}${c.estado === "pendiente" ? ". Pendiente de confirmar" : ""}`;
  } else {
    card.innerHTML = `
      <p class="label">Sin citas próximas</p>
      <h2>¿Ya te toca tu control?</h2>
      <p class="muted">Lo ideal es una limpieza y revisión cada 6 meses.</p>
      <a href="#cita" class="btn btn--light">Agendar una cita</a>`;
  }
}

function renderAppointment() {
  const view = document.getElementById("appointment-view");
  const form = document.getElementById("appointment-form");
  const c = upcomingCita();
  view.innerHTML = "";

  if (!c) {
    form.hidden = false;
    form.fecha.min = dateKey(new Date());
    return;
  }

  form.hidden = true;
  const card = document.createElement("article");
  card.className = "card card--appointment";
  card.innerHTML = `
    <p class="label"></p>
    <p class="countdown">${countdownText(c.start)}</p>
    <h2></h2>
    <p class="muted"></p>
    <a class="btn btn--light" target="_blank" rel="noopener" data-google>Agregar a Google Calendar</a>
    <button type="button" class="btn btn--on-dark" data-ics>Agregar al calendario del iPhone u otro</button>`;
  card.querySelector(".label").textContent = c.estado === "pendiente" ? "Pendiente de confirmar por la clínica" : "Cita confirmada";
  card.querySelector("h2").textContent = c.tratamiento;
  card.querySelector(".muted").textContent = `${longDate(c.start)}, a las ${c.hora}. Te avisaremos un día antes y 2 horas antes.`;
  card.querySelector("[data-google]").href = googleCalendarUrl(citaEvent(c));
  card.querySelector("[data-ics]").addEventListener("click", () => downloadIcs("cita-sonrisa-imperial.ics", [icsEvent(citaEvent(c))]));

  const actions = document.createElement("article");
  actions.className = "card";
  actions.innerHTML = `
    <h2>¿Necesitas algo?</h2>
    <div class="btn-row">
      <a class="btn btn--ghost" target="_blank" rel="noopener" data-cambio>Cambiar o cancelar</a>
      <a class="btn btn--ghost" target="_blank" rel="noopener" href="${MAPS_URL}">Cómo llegar</a>
    </div>
    ${c.estado === "pendiente" ? '<button type="button" class="link" data-confirmar>La clínica ya me confirmó</button>' : ""}
    <button type="button" class="link" data-borrar>Borrar esta cita de la app</button>`;
  actions.querySelector("[data-cambio]").href = whatsappUrl(
    `Hola, tengo una cita de ${c.tratamiento.toLowerCase()} el ${longDate(c.start)} a las ${c.hora} y necesito cambiarla.`
  );
  actions.querySelector("[data-confirmar]")?.addEventListener("click", () => {
    cita.estado = "confirmada";
    save("cita", cita);
    renderAll();
  });
  actions.querySelector("[data-borrar]").addEventListener("click", () => {
    if (!confirm("¿Borrar esta cita de la app? No se cancela en la clínica.")) return;
    cita = null;
    save("cita", null);
    renderAll();
  });

  view.append(card, actions);
}

document.getElementById("appointment-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const error = document.getElementById("appointment-error");
  if (!form.fecha.value || !form.hora.value) {
    error.hidden = false;
    return;
  }
  error.hidden = true;

  const pedir = e.submitter?.value === "pedir";
  cita = {
    tratamiento: form.tratamiento.value,
    fecha: form.fecha.value,
    hora: form.hora.value,
    estado: pedir ? "pendiente" : "confirmada",
  };
  save("cita", cita);

  if (pedir) {
    const start = parseLocal(cita.fecha, cita.hora);
    window.open(
      whatsappUrl(`Hola, soy paciente de Sonrisa Imperial. Quiero agendar una cita de ${cita.tratamiento.toLowerCase()} para el ${longDate(start)} a las ${cita.hora}.`),
      "_blank"
    );
  }
  form.reset();
  renderAll();
});

/* ---------- Consejos ---------- */

const TIPS = [
  ["¿Cuánto tiempo debo cepillarme?", "Dos minutos, dos o tres veces al día. Divide la boca en cuatro partes y dedica 30 segundos a cada una."],
  ["¿Me cepillo apenas termino de comer?", "Si comiste o tomaste algo ácido, como cítricos o gaseosa, espera unos 30 minutos para no desgastar el esmalte."],
  ["¿El hilo dental es necesario?", "Sí. El cepillo no llega entre los dientes, y ahí empiezan muchas caries. Úsalo una vez al día, de preferencia de noche."],
  ["¿Cada cuánto cambio mi cepillo?", "Cada 3 meses, o antes si las cerdas están abiertas. Después de una gripe, cámbialo también."],
  ["Me sangran las encías, ¿dejo de cepillarme?", "No. El sangrado suele ser por placa acumulada. Sigue cepillándote con suavidad y agenda una limpieza para revisarlo."],
  ["¿Qué hago si me duele una muela de noche?", "Enjuágate con agua tibia y sal, no pongas calor en la cara y escríbenos en la mañana para atenderte el mismo día."],
];

function renderTips() {
  const box = document.getElementById("tips");
  box.innerHTML = "";
  TIPS.forEach(([question, answer]) => {
    const details = document.createElement("details");
    details.innerHTML = "<summary></summary><p></p>";
    details.querySelector("summary").textContent = question;
    details.querySelector("p").textContent = answer;
    box.append(details);
  });

  // En "Hoy" se muestra un consejo distinto cada día
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const [question, answer] = TIPS[dayOfYear % TIPS.length];
  const tip = document.getElementById("daily-tip");
  tip.innerHTML = '<p class="label">Consejo del día</p><h2></h2><p class="muted"></p>';
  tip.querySelector("h2").textContent = question;
  tip.querySelector(".muted").textContent = answer;
}

/* ---------- Navegación por pestañas ---------- */

const VIEWS = ["hoy", "cita", "plan", "consejos"];

function showView() {
  const current = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "hoy";
  VIEWS.forEach((id) => (document.getElementById(id).hidden = id !== current));
  document.querySelectorAll(".tabs a").forEach((a) => {
    a.toggleAttribute("aria-current", a.dataset.tab === current);
    if (a.dataset.tab === current) a.setAttribute("aria-current", "page");
  });
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", showView);

/* ---------- Inicio ---------- */

function renderAll() {
  const now = new Date();
  const hour = now.getHours();
  document.getElementById("greeting").textContent = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  document.getElementById("today-label").textContent = longDate(now);
  renderHomeAppointment();
  renderAppointment();
  renderChecklist();
  renderRoutine();
  renderLongTerm();
}

renderTips();
renderAll();
showView();

// Al volver a la app otro día, se refresca la fecha y la lista
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") renderAll();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
