// App del paciente de Sonrisa Imperial.
// Todo se guarda solo en el celular del paciente (localStorage); no hay servidor.

const WHATSAPP_NUMBER = "51925659628";
const CLINICA = "Sonrisa Imperial, Villa María del Triunfo, Lima";
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Villa+Mar%C3%ADa+del+Triunfo%2C+Lima";

// Minutos después de comer para cepillarse: el esmalte se recupera de los ácidos
const ESPERA_MINUTOS = 30;

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
const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);

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

function addMinutes(hora, minutes) {
  const [h, m] = hora.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
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

/* ---------- Plan de cuidado ---------- */

const DEFAULT_PLAN = { desayuno: "07:30", almuerzo: "13:00", cena: "20:00", intensidad: "normal", hilo: "diario" };
const WEEK_FLOSS_DAYS = [1, 3, 5]; // lunes, miércoles y viernes

let plan = load("plan", null);
let checks = load("checks", {});

// Cepillados que se avisan, según cuántos avisos eligió el paciente
function brushSlots(p) {
  const slots = {
    desayuno: { id: "desayuno", nombre: "Cepillado después del desayuno", hora: addMinutes(p.desayuno, ESPERA_MINUTOS) },
    almuerzo: { id: "almuerzo", nombre: "Cepillado después del almuerzo", hora: addMinutes(p.almuerzo, ESPERA_MINUTOS) },
    noche: { id: "noche", nombre: "Cepillado de la noche", hora: addMinutes(p.cena, ESPERA_MINUTOS) },
  };
  if (p.intensidad === "minimo") return [slots.noche];
  if (p.intensidad === "tranquilo") return [slots.desayuno, slots.noche];
  return [slots.desayuno, slots.almuerzo, slots.noche];
}

function isFlossDay(p, date) {
  if (p.hilo === "diario") return true;
  if (p.hilo === "semana") return WEEK_FLOSS_DAYS.includes(date.getDay());
  const start = parseLocal(p.inicio || dateKey(new Date()));
  return Math.round((addDays(date, 0) - start) / 86400000) % 2 === 0;
}

// Lo que hay que marcar ese día: los cepillados y, si toca, el hilo dental
function routineFor(p, date) {
  const items = brushSlots(p);
  if (isFlossDay(p, date)) {
    items.push({ id: "hilo", nombre: "Hilo dental", hora: items[items.length - 1].hora });
  }
  return items;
}

const FLOSS_LABEL = {
  diario: "todos los días",
  interdiario: "día por medio",
  semana: "lunes, miércoles y viernes",
};

// Avisos del calendario: como máximo uno por cepillado; el hilo va en el aviso de la noche
function reminderEvents(p) {
  const today = new Date();
  const at = (date, hora) => {
    const [h, m] = hora.split(":").map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  };
  const base = { minutes: 5, alarms: ["PT0M"] };
  const events = [];

  brushSlots(p).forEach((slot) => {
    if (slot.id !== "noche") {
      events.push({
        ...base,
        id: `rutina-${slot.id}`,
        title: "Hora de cepillarte los dientes",
        details: `${slot.nombre}. Dos minutos, sin apuro. Tu plan de Sonrisa Imperial.`,
        start: at(today, slot.hora),
        rrule: "FREQ=DAILY",
        hora: slot.hora,
        cuando: "Todos los días",
      });
      return;
    }

    const conHilo = {
      ...base,
      id: "rutina-noche-hilo",
      title: "Cepíllate y usa hilo dental",
      details: "El cepillado de la noche es el más importante. Hoy toca también hilo dental.",
      hora: slot.hora,
    };
    const sinHilo = {
      ...base,
      id: "rutina-noche",
      title: "Cepíllate antes de dormir",
      details: "El cepillado de la noche es el más importante: mientras duermes hay menos saliva para proteger tus dientes.",
      hora: slot.hora,
    };

    if (p.hilo === "diario") {
      events.push({ ...conHilo, start: at(today, slot.hora), rrule: "FREQ=DAILY", cuando: "Todos los días" });
    } else if (p.hilo === "semana") {
      const next = (days) => {
        let d = today;
        while (!days.includes(d.getDay())) d = addDays(d, 1);
        return d;
      };
      events.push({ ...conHilo, start: at(next(WEEK_FLOSS_DAYS), slot.hora), rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR", cuando: "Lunes, miércoles y viernes" });
      events.push({ ...sinHilo, start: at(next([0, 2, 4, 6]), slot.hora), rrule: "FREQ=WEEKLY;BYDAY=TU,TH,SA,SU", cuando: "Los demás días" });
    } else {
      const flossToday = isFlossDay(p, today);
      events.push({ ...conHilo, start: at(flossToday ? today : addDays(today, 1), slot.hora), rrule: "FREQ=DAILY;INTERVAL=2", cuando: "Día por medio" });
      events.push({ ...sinHilo, start: at(flossToday ? addDays(today, 1) : today, slot.hora), rrule: "FREQ=DAILY;INTERVAL=2", cuando: "Los otros días" });
    }
  });

  return events;
}

function renderSchedule(container, p) {
  const perDay = brushSlots(p).length;
  container.innerHTML = `
    <p class="label">Como máximo ${perDay} ${perDay === 1 ? "aviso" : "avisos"} al día</p>
    <ul class="schedule"></ul>
    <div class="push" data-push></div>
    <details class="calendar-alt">
      <summary>Prefiero usar mi calendario</summary>
      <p class="hint">Elige una sola opción, notificaciones o calendario, para no recibir avisos repetidos.</p>
      <button type="button" class="btn btn--ghost" data-ics>Agregar todos a mi calendario</button>
      <ul class="calendar-alt__links"></ul>
      <div class="calendar-alt__help">
        <p><strong>Para que el calendario te avise:</strong> en iPhone el aviso ya viene incluido. En Google Calendar abre cada evento, toca el lápiz para editar, luego «Agregar notificación» y elige «Al momento del evento».</p>
        <p><strong>Si algún día dejas de usar la app:</strong> los eventos se quedan en tu calendario, porque la app no puede borrarlos. Abre uno, toca Eliminar y elige «Todos los eventos». Hazlo con cada recordatorio.</p>
        <p><strong>Si cambias tus horarios:</strong> borra los anteriores de la misma forma y vuelve a agregarlos.</p>
      </div>
    </details>`;

  const list = container.querySelector(".schedule");
  const links = container.querySelector(".calendar-alt__links");
  reminderEvents(p).forEach((event) => {
    const li = document.createElement("li");
    li.innerHTML = `<time></time><strong></strong><small></small>`;
    li.querySelector("time").textContent = event.hora;
    li.querySelector("strong").textContent = event.title;
    li.querySelector("small").textContent = event.cuando;
    list.append(li);

    const link = document.createElement("li");
    link.innerHTML = `<a class="link" target="_blank" rel="noopener"></a>`;
    link.querySelector("a").textContent = `Google Calendar: ${event.hora}, ${event.title.toLowerCase()}`;
    link.querySelector("a").href = googleCalendarUrl(event);
    links.append(link);
  });

  const note = document.createElement("li");
  note.innerHTML = `<time>🪥</time><strong>Hilo dental</strong><small></small>`;
  note.querySelector("small").textContent = `${FLOSS_LABEL[p.hilo][0].toUpperCase()}${FLOSS_LABEL[p.hilo].slice(1)}, dentro del aviso de la noche`;
  list.append(note);

  container.querySelector("[data-ics]").addEventListener("click", () => {
    downloadIcs("avisos-sonrisa-imperial.ics", reminderEvents(p).map(icsEvent));
  });

  renderPush(container.querySelector("[data-push]"), p);
}

/* ---------- Notificaciones push ---------- */

const VAPID_PUBLIC_KEY = "BOAmTngshpLdAkRzxJZ-ug7vw2qPxFziRW_9xLTlO_h4015Dqol6d1AQ6Sz3ijOitHMmM-xvTXMVIwDdK13tkFo";
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let pushOn = false;

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  if (!pushSupported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

const postJson = (url, body, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Le cuenta al servidor el plan y la cita actuales, para que avise a la hora correcta
async function syncPush(p = plan) {
  const subscription = await currentSubscription();
  if (!subscription || !p) return;
  const c = upcomingCita();
  const response = await postJson("/api/push-subscribe", {
    subscription: subscription.toJSON(),
    plan: p,
    cita: c ? { fecha: c.fecha, hora: c.hora, tratamiento: c.tratamiento } : null,
    zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (!response.ok) throw new Error("No se pudo guardar");
}

async function enablePush(p) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  await syncPush(p);
  pushOn = true;
  // Una notificación de prueba al instante, para que el paciente vea que funciona
  await postJson("/api/push-test", { subscription: subscription.toJSON() }).catch(() => {});
  return "granted";
}

async function disablePush() {
  const subscription = await currentSubscription();
  if (subscription) {
    await postJson("/api/push-subscribe", { subscription: subscription.toJSON() }, "DELETE").catch(() => {});
    await subscription.unsubscribe();
  }
  pushOn = false;
}

function renderPush(box, p) {
  box.innerHTML = "";
  const message = (text) => {
    const el = document.createElement("p");
    el.className = "push__note";
    el.textContent = text;
    box.append(el);
  };

  if (!pushSupported) {
    message(
      isIos && !isInstalled
        ? "Para recibir notificaciones en iPhone, primero instala la app: en Safari toca Compartir y luego «Agregar a inicio»."
        : "Este navegador no permite notificaciones. Puedes usar la opción del calendario, más abajo."
    );
    return;
  }

  if (Notification.permission === "denied") {
    message("Bloqueaste las notificaciones de esta app. Para activarlas, entra a los ajustes del celular, busca la app y permite las notificaciones.");
    return;
  }

  if (pushOn) {
    box.innerHTML = `
      <p class="push__on">Notificaciones activadas</p>
      <div class="btn-row">
        <button type="button" class="btn btn--ghost" data-test>Enviar una de prueba</button>
        <button type="button" class="btn btn--ghost" data-off>Desactivar</button>
      </div>`;
    box.querySelector("[data-test]").addEventListener("click", async (e) => {
      e.target.disabled = true;
      const subscription = await currentSubscription();
      const response = subscription && (await postJson("/api/push-test", { subscription: subscription.toJSON() }).catch(() => null));
      e.target.textContent = response?.ok ? "Enviada" : "No se pudo enviar";
    });
    box.querySelector("[data-off]").addEventListener("click", async () => {
      await disablePush();
      renderPush(box, p);
      renderLongTerm();
      renderAppointment();
    });
    return;
  }

  box.innerHTML = `
    <button type="button" class="btn btn--primary" data-on>Activar notificaciones</button>
    <p class="push__note">Te llegan como cualquier notificación del celular, aunque la app esté cerrada. Puedes desactivarlas cuando quieras.</p>`;
  box.querySelector("[data-on]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Activando…";
    try {
      await enablePush(p);
    } catch {
      e.target.disabled = false;
      e.target.textContent = "Activar notificaciones";
      message("No se pudo activar. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    renderPush(box, p);
    renderLongTerm();
    renderAppointment();
  });
}

/* ---------- Bienvenida (configurar el plan) ---------- */

const setupForm = document.getElementById("setup-form");
const steps = [...setupForm.querySelectorAll("fieldset")];
let setupOpen = false;
let step = 0;

function formPlan() {
  const data = new FormData(setupForm);
  return {
    desayuno: data.get("desayuno") || DEFAULT_PLAN.desayuno,
    almuerzo: data.get("almuerzo") || DEFAULT_PLAN.almuerzo,
    cena: data.get("cena") || DEFAULT_PLAN.cena,
    intensidad: data.get("intensidad"),
    hilo: data.get("hilo"),
    inicio: plan?.inicio || dateKey(new Date()),
  };
}

function goToStep(n) {
  step = n;
  steps.forEach((fs, i) => (fs.hidden = i !== n));
  setupForm.querySelectorAll(".setup__progress li").forEach((li, i) => li.classList.toggle("is-done", i <= n));
  if (n === 2) renderSchedule(document.getElementById("setup-summary"), formPlan());
  window.scrollTo(0, 0);
}

function openSetup() {
  const p = plan || DEFAULT_PLAN;
  ["desayuno", "almuerzo", "cena"].forEach((name) => (setupForm[name].value = p[name]));
  setupForm.querySelector(`[name="intensidad"][value="${p.intensidad}"]`).checked = true;
  setupForm.querySelector(`[name="hilo"][value="${p.hilo}"]`).checked = true;
  setupOpen = true;
  goToStep(0);
  showView();
}

setupForm.addEventListener("click", (e) => {
  if (e.target.closest("[data-next]")) {
    if (step === 0 && ![...steps[0].querySelectorAll("input")].every((i) => i.value)) return;
    goToStep(step + 1);
  }
  if (e.target.closest("[data-back]")) goToStep(step - 1);
});

setupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  plan = formPlan();
  save("plan", plan);
  if (pushOn) syncPush().catch(() => {});
  setupOpen = false;
  location.hash = "#hoy";
  renderAll();
  showView();
});

document.getElementById("plan-edit").addEventListener("click", openSetup);

/* ---------- Cuidado de hoy ---------- */

function dayComplete(key) {
  const done = checks[key] || [];
  const items = routineFor(plan || DEFAULT_PLAN, parseLocal(key));
  return items.every((item) => done.includes(item.id));
}

// Días seguidos con la rutina completa; si hoy aún no se completa, se cuenta desde ayer
function streak() {
  let day = new Date();
  if (!dayComplete(dateKey(day))) day = addDays(day, -1);
  let count = 0;
  while (dayComplete(dateKey(day)) && count < 365) {
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

  routineFor(plan || DEFAULT_PLAN, new Date()).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<label><input type="checkbox"><span><strong></strong><small></small></span></label>`;
    const input = li.querySelector("input");
    input.checked = done.includes(item.id);
    li.querySelector("strong").textContent = item.nombre;
    li.querySelector("small").textContent = item.id === "hilo" ? "Hoy toca, junto con el cepillado de la noche" : `A partir de las ${item.hora}`;
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

function renderPlanSummary() {
  const card = document.getElementById("plan-summary");
  if (!plan) {
    card.innerHTML = '<p class="muted">Aún no armas tu plan.</p>';
    return;
  }
  renderSchedule(card, plan);
  const meals = document.createElement("p");
  meals.className = "muted";
  meals.textContent = `Tus comidas: desayuno ${plan.desayuno}, almuerzo ${plan.almuerzo} y cena ${plan.cena}. Te avisamos ${ESPERA_MINUTOS} minutos después.`;
  card.prepend(meals);
}

/* ---------- Recordatorios de largo plazo ---------- */

// Mismo cálculo que el servidor: cada 90 días el cepillo y cada 180 la limpieza, contando desde el inicio del plan
function nextEvery(days) {
  const start = parseLocal((plan && plan.inicio) || dateKey(new Date()));
  const passed = Math.max(0, Math.round((parseLocal(dateKey(new Date())) - start) / 86400000));
  const next = addDays(start, (Math.floor(passed / days) + 1) * days);
  next.setHours(10, 0);
  return next;
}

function longTermEvents() {
  return [
    {
      id: "cepillo",
      title: "Cambia tu cepillo de dientes",
      details: "Cada 3 meses, o antes si las cerdas están abiertas.",
      start: nextEvery(90),
      minutes: 15,
      rrule: "FREQ=MONTHLY;INTERVAL=3",
      alarms: ["PT0M"],
    },
    {
      id: "limpieza",
      title: "Toca tu limpieza dental en Sonrisa Imperial",
      details: "Se recomienda una limpieza cada 6 meses. Agenda tu cita desde la app.",
      start: nextEvery(180),
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
    li.querySelector(".muted").textContent = `${event.details} Próximo aviso: ${longDate(event.start)}${
      pushOn ? ", te llegará como notificación." : "."
    }`;
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
  card.querySelector(".muted").textContent = `${longDate(c.start)}, a las ${c.hora}. ${
    pushOn
      ? "Te avisaremos con una notificación la noche anterior y 2 horas antes."
      : "Activa las notificaciones en «Mi plan» o agrégala a tu calendario."
  }`;
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
    citaChanged();
    renderAll();
  });
  actions.querySelector("[data-borrar]").addEventListener("click", () => {
    if (!confirm("¿Borrar esta cita de la app? No se cancela en la clínica.")) return;
    cita = null;
    save("cita", null);
    citaChanged();
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
  citaChanged();

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

/* ---------- Consejos y pregunta del día ---------- */

const TIPS = [
  ["¿Cuánto tiempo debo cepillarme?", "Dos minutos. Divide la boca en cuatro partes y dedica 30 segundos a cada una."],
  ["¿Me cepillo apenas termino de comer?", "Mejor espera unos 30 minutos, sobre todo si comiste algo ácido como cítricos o gaseosa. Así no desgastas el esmalte."],
  ["¿El hilo dental es necesario?", "Sí. El cepillo no llega entre los dientes, y ahí empiezan muchas caries. Lo ideal es una vez al día, de noche."],
  ["¿Cada cuánto cambio mi cepillo?", "Cada 3 meses, o antes si las cerdas están abiertas. Después de una gripe, cámbialo también."],
  ["Me sangran las encías, ¿dejo de cepillarme?", "No. El sangrado suele ser por placa acumulada. Sigue cepillándote con suavidad y agenda una limpieza para revisarlo."],
  ["¿Qué hago si me duele una muela de noche?", "Enjuágate con agua tibia y sal, no pongas calor en la cara y escríbenos en la mañana para atenderte el mismo día."],
  ["No enjuagues con agua después de cepillarte", "Solo escupe la pasta. Si te enjuagas, te llevas el flúor que protege tus dientes."],
  ["Cepíllate también la lengua", "Ahí se acumulan bacterias que causan mal aliento. Basta con pasar el cepillo suavemente de atrás hacia adelante."],
  ["Cerdas suaves, no duras", "Un cepillo duro o cepillarse con fuerza desgasta el esmalte y retrae las encías. Movimientos suaves y cortos."],
  ["¿Cuánta pasta dental uso?", "Un poco, del tamaño de una arveja en adultos. En niños menores de 3 años, del tamaño de un grano de arroz."],
  ["El agua es tu mejor bebida", "Tomar agua entre comidas ayuda a limpiar restos y equilibra la acidez de la boca."],
  ["Cuidado con picar todo el día", "Cada vez que comes algo dulce, la boca pasa unos 20 minutos en modo ácido. Mejor dulces junto con las comidas que a cada rato."],
  ["Chicle sin azúcar, un buen aliado", "Masticar chicle sin azúcar después de comer produce más saliva, que protege tus dientes cuando no puedes cepillarte."],
  ["¿Los dientes sensibles tienen solución?", "Sí. Una pasta para dientes sensibles ayuda, pero si molesta mucho al tomar frío o caliente, conviene revisarlo."],
  ["No uses tus dientes como herramienta", "Abrir botellas o romper bolsas con los dientes puede partirlos. Usa tijeras o un destapador."],
  ["Si fumas, tus encías lo sienten", "Fumar mancha los dientes y esconde el sangrado de encías, así que los problemas se notan tarde. Haz tus controles a tiempo."],
  ["El primer diente de leche, la primera visita", "Lleva a tus hijos al dentista cuando les salga el primer diente o antes del primer año."],
  ["¿Café o té? Un vaso de agua después", "Tomar agua después ayuda a que no se manchen tanto los dientes."],
  ["¿Rechinas los dientes de noche?", "Si te despiertas con la mandíbula cansada o dolor de cabeza, puede ser bruxismo. Hay protectores que se hacen a medida."],
  ["El enjuague no reemplaza al cepillo", "Es un complemento. Sin cepillo ni hilo dental, la placa sigue ahí."],
];

const QUIZ = [
  { q: "¿Cuánto tiempo debería durar tu cepillado?", options: ["30 segundos", "2 minutos", "5 minutos"], answer: 1, why: "Dos minutos alcanzan para limpiar todas las caras de los dientes sin desgastarlos." },
  { q: "Después de cepillarte, ¿qué es mejor?", options: ["Enjuagar con mucha agua", "Solo escupir la pasta", "Comer algo enseguida"], answer: 1, why: "Si no te enjuagas, el flúor de la pasta sigue protegiendo tus dientes." },
  { q: "¿Cada cuánto conviene cambiar el cepillo?", options: ["Cada año", "Cada 3 meses", "Cuando se rompa"], answer: 1, why: "Después de 3 meses las cerdas se abren y limpian mucho menos." },
  { q: "¿Cuál es el cepillado más importante del día?", options: ["El de la mañana", "El de después del almuerzo", "El de la noche"], answer: 2, why: "De noche hay menos saliva, así que la placa que queda ataca más tiempo." },
  { q: "Te sangran las encías al cepillarte. ¿Qué haces?", options: ["Dejo de cepillar esa zona", "Sigo con suavidad y agendo una limpieza", "Uso un cepillo más duro"], answer: 1, why: "El sangrado suele ser por placa. Dejar de cepillar lo empeora." },
  { q: "¿Qué cepillo es mejor para la mayoría?", options: ["Cerdas duras", "Cerdas medias", "Cerdas suaves"], answer: 2, why: "Las cerdas suaves limpian bien sin desgastar el esmalte ni las encías." },
  { q: "¿Cuánta pasta necesita un adulto?", options: ["Todo el largo del cepillo", "El tamaño de una arveja", "No importa"], answer: 1, why: "Con el tamaño de una arveja basta para tener el flúor necesario." },
  { q: "¿Qué daña más los dientes?", options: ["Un postre con el almuerzo", "Galletas a cada rato durante el día", "Las dos por igual"], answer: 1, why: "Picar seguido mantiene la boca ácida todo el día; el postre con la comida es un solo momento ácido." },
  { q: "¿Cada cuánto se recomienda una limpieza en la clínica?", options: ["Cada 6 meses", "Cada 2 años", "Solo si duele"], answer: 0, why: "Cada 6 meses se quita el sarro que el cepillo no saca y se detectan problemas a tiempo." },
  { q: "¿Para qué sirve el hilo dental?", options: ["Para blanquear", "Para limpiar entre los dientes", "Para el aliento"], answer: 1, why: "Entre los dientes el cepillo no llega, y ahí empiezan muchas caries." },
  { q: "Comiste una naranja. ¿Cuándo te cepillas?", options: ["Enseguida", "Unos 30 minutos después", "No hace falta"], answer: 1, why: "El ácido ablanda el esmalte un rato; si esperas, el cepillo no lo desgasta." },
  { q: "¿Cuándo debe ir un bebé al dentista por primera vez?", options: ["Cuando le salga el primer diente", "A los 6 años", "Cuando le duela"], answer: 0, why: "Una visita temprana previene caries y acostumbra al niño sin miedo." },
];

let quizAnswers = load("quiz", {});

function renderQuiz() {
  const card = document.getElementById("quiz");
  const key = dateKey(new Date());
  const item = QUIZ[dayOfYear(new Date()) % QUIZ.length];
  const chosen = quizAnswers[key];

  card.innerHTML = `<p class="label">Pregunta del día</p><h2></h2><div class="quiz__options"></div>`;
  card.querySelector("h2").textContent = item.q;
  const box = card.querySelector(".quiz__options");

  item.options.forEach((text, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (chosen !== undefined) {
      button.disabled = true;
      if (i === item.answer) button.classList.add("is-right");
      else if (i === chosen) button.classList.add("is-wrong");
    }
    button.addEventListener("click", () => {
      quizAnswers = { [key]: i };
      save("quiz", quizAnswers);
      renderQuiz();
    });
    box.append(button);
  });

  if (chosen !== undefined) {
    const right = chosen === item.answer;
    const result = document.createElement("p");
    result.className = `quiz__result${right ? " is-right" : ""}`;
    result.textContent = right ? "¡Correcto!" : "Casi. La respuesta es la marcada en verde.";
    const why = document.createElement("p");
    why.className = "muted";
    why.textContent = `${item.why} Mañana tienes otra pregunta.`;
    card.append(result, why);
  }
}

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
  const [question, answer] = TIPS[dayOfYear(new Date()) % TIPS.length];
  const tip = document.getElementById("daily-tip");
  tip.innerHTML = '<p class="label">Consejo del día</p><h2></h2><p class="muted"></p>';
  tip.querySelector("h2").textContent = question;
  tip.querySelector(".muted").textContent = answer;
}

/* ---------- Navegación por pestañas ---------- */

const VIEWS = ["hoy", "cita", "plan", "consejos"];

function showView() {
  // La primera vez, o al editar el plan, se muestra la bienvenida en lugar de las pestañas
  const setup = setupOpen || !plan;
  document.body.classList.toggle("is-setup", setup);
  document.getElementById("bienvenida").hidden = !setup;
  if (setup && !setupOpen) {
    setupOpen = true;
    goToStep(0);
  }

  const current = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "hoy";
  VIEWS.forEach((id) => (document.getElementById(id).hidden = setup || id !== current));
  document.querySelectorAll(".tabs a").forEach((a) => {
    if (a.dataset.tab === current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
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
  renderPlanSummary();
  renderLongTerm();
  renderQuiz();
  renderTips();
}

// La cita cambia en varios lugares: después de cada cambio se avisa al servidor
function citaChanged() {
  if (pushOn) syncPush().catch(() => {});
}

renderAll();
showView();

// Al volver a la app otro día, se refresca la fecha, la lista y el consejo
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !setupOpen) renderAll();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Al abrir la app: ver si ya tiene notificaciones activadas y refrescar sus datos en el servidor
if (pushSupported && Notification.permission === "granted") {
  currentSubscription().then((subscription) => {
    if (!subscription) return;
    pushOn = true;
    renderPlanSummary();
    renderLongTerm();
    renderAppointment();
    syncPush().catch(() => {});
  });
}
