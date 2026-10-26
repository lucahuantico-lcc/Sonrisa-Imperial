// Número de WhatsApp de la clínica: código de país + número, solo dígitos (Perú: 51 + 9 dígitos)
const WHATSAPP_NUMBER = "51925659628";

/* ---------- Odontograma ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const chart = document.getElementById("odontograma");
const picked = document.getElementById("chart-picked");
const formTeeth = document.getElementById("form-teeth");
const formTeethText = document.getElementById("form-teeth-text");

// Del centro hacia atrás: nombre, ancho y profundidad de cada diente (unidades del SVG)
const TEETH = [
  { name: "Incisivo central", w: 25, d: 20 },
  { name: "Incisivo lateral", w: 21, d: 20 },
  { name: "Colmillo", w: 22, d: 23 },
  { name: "Primer premolar", w: 23, d: 24 },
  { name: "Segundo premolar", w: 23, d: 24 },
  { name: "Primera muela", w: 32, d: 28 },
  { name: "Segunda muela", w: 31, d: 28 },
  { name: "Muela del juicio", w: 29, d: 26 },
];
const GAP = 2;
const ARCH = { cx: 160, rx: 100, ry: 140, upperCy: 158, lowerCy: 280 };

// Se dibuja desde la vista del paciente: su lado izquierdo queda a la izquierda.
// Cuadrantes FDI: 1 arriba derecha, 2 arriba izquierda, 3 abajo izquierda, 4 abajo derecha
const QUADRANTS = [
  { q: 2, upper: true, side: -1, where: "arriba a la izquierda" },
  { q: 1, upper: true, side: 1, where: "arriba a la derecha" },
  { q: 3, upper: false, side: -1, where: "abajo a la izquierda" },
  { q: 4, upper: false, side: 1, where: "abajo a la derecha" },
];

const selected = new Map(); // pieza FDI -> descripción

// Ángulo de la elipse que queda a cierta distancia (a lo largo del arco) desde el centro de la boca
function angleAt(distance) {
  const step = 0.002;
  let t = Math.PI / 2;
  let walked = 0;
  while (walked < distance) {
    walked += step * Math.hypot(ARCH.rx * Math.sin(t), ARCH.ry * Math.cos(t));
    t += step;
  }
  return t;
}

function buildChart() {
  QUADRANTS.forEach(({ q, upper, side, where }) => {
    let pos = GAP / 2;
    TEETH.forEach((tooth, i) => {
      const center = pos + tooth.w / 2;
      pos += tooth.w + GAP;

      const t = angleAt(center);
      const cy = upper ? ARCH.upperCy : ARCH.lowerCy;
      const dx = ARCH.rx * Math.cos(t);
      const px = side < 0 ? ARCH.cx + dx : ARCH.cx - dx;
      const py = upper ? cy - ARCH.ry * Math.sin(t) : cy + ARCH.ry * Math.sin(t);
      const rotation = (Math.atan2(py - cy, px - ARCH.cx) * 180) / Math.PI + 90;

      const code = `${q}${i + 1}`;
      const label = `${tooth.name}, ${where} (pieza ${code})`;

      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "tooth");
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-pressed", "false");
      g.setAttribute("aria-label", label);
      g.dataset.code = code;
      g.dataset.label = label;
      g.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rotation.toFixed(1)})`);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = label;

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", -tooth.w / 2);
      rect.setAttribute("y", -tooth.d / 2);
      rect.setAttribute("width", tooth.w);
      rect.setAttribute("height", tooth.d);
      rect.setAttribute("rx", Math.min(tooth.w, tooth.d) * 0.32);

      g.append(title, rect);
      chart.append(g);
    });
  });

  [["Arriba", 125], ["Abajo", 325]].forEach(([text, y]) => {
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "chart__label");
    label.setAttribute("x", ARCH.cx);
    label.setAttribute("y", y);
    label.setAttribute("aria-hidden", "true");
    label.textContent = text;
    chart.append(label);
  });
}

function toggleTooth(g) {
  const { code, label } = g.dataset;
  if (selected.has(code)) {
    selected.delete(code);
    g.setAttribute("aria-pressed", "false");
  } else {
    selected.set(code, label);
    g.setAttribute("aria-pressed", "true");
  }
  renderPicked();
}

function clearTeeth() {
  selected.clear();
  chart.querySelectorAll(".tooth").forEach((g) => g.setAttribute("aria-pressed", "false"));
  renderPicked();
}

function renderPicked() {
  const labels = [...selected.values()];

  if (labels.length === 0) {
    picked.innerHTML = '<p class="chart__empty">No has marcado ninguno. También puedes agendar sin marcar.</p>';
    formTeeth.hidden = true;
    return;
  }

  const items = labels.map((l) => `<li>${l}</li>`).join("");
  picked.innerHTML = `
    <p>${labels.length === 1 ? "Marcaste este diente:" : `Marcaste ${labels.length} dientes:`}</p>
    <ul class="picked__list">${items}</ul>
    <div class="picked__actions">
      <a href="#agendar" class="btn btn--primary">Agendar con ${labels.length === 1 ? "este diente" : "estos dientes"}</a>
      <button type="button" class="link-btn" id="clear-teeth">Borrar</button>
    </div>`;
  picked.querySelector("#clear-teeth").addEventListener("click", clearTeeth);

  formTeeth.hidden = false;
  formTeethText.textContent = `Dientes marcados: ${labels.join("; ")}`;
}

buildChart();

chart.addEventListener("click", (e) => {
  const g = e.target.closest(".tooth");
  if (g) toggleTooth(g);
});

chart.addEventListener("keydown", (e) => {
  const g = e.target.closest(".tooth");
  if (g && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    toggleTooth(g);
  }
});

/* ---------- Selector de tratamientos ---------- */

const chooser = document.querySelector(".chooser");
const chooserTabs = chooser.querySelector(".chooser__tabs");
const tabs = [...chooser.querySelectorAll('[role="tab"]')];
const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let current = 0;
let stoppedByUser = false;

function showTab(index) {
  tabs.forEach((tab, i) => {
    const active = i === index;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    panels[i].classList.toggle("is-active", active);
    panels[i].hidden = !active;
  });
  current = index;

  // En celular las pestañas se desplazan de lado: mantener visible la activa
  if (chooserTabs.scrollWidth > chooserTabs.clientWidth) {
    chooserTabs.scrollTo({ left: tabs[index].offsetLeft - 16, behavior: "smooth" });
  }
}

function stopAutoplay() {
  stoppedByUser = true;
  chooser.classList.remove("is-playing");
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => {
    stopAutoplay();
    showTab(i);
  });
});

chooserTabs.addEventListener("keydown", (e) => {
  const moves = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  let next = null;
  if (e.key in moves) next = (current + moves[e.key] + tabs.length) % tabs.length;
  if (e.key === "Home") next = 0;
  if (e.key === "End") next = tabs.length - 1;
  if (next === null) return;
  e.preventDefault();
  stopAutoplay();
  showTab(next);
  tabs[next].focus();
});

// Avanza solo cuando termina de llenarse la barra de la pestaña activa
chooser.addEventListener("animationend", (e) => {
  if (e.animationName === "progress" && chooser.classList.contains("is-playing")) {
    showTab((current + 1) % tabs.length);
  }
});

// Solo avanza mientras el selector está en pantalla
if (!reduceMotion) {
  new IntersectionObserver(([entry]) => {
    chooser.classList.toggle("is-playing", entry.isIntersecting && !stoppedByUser);
  }, { threshold: 0.4 }).observe(chooser);
}

/* ---------- Cifras: cuentan desde cero cuando aparecen en pantalla ---------- */

const counters = document.querySelectorAll("[data-count]");

if (!reduceMotion) {
  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      countObserver.unobserve(target);
      const end = Number(target.dataset.count);
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / 1400, 1);
        target.textContent = Math.round(end * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });

  counters.forEach((el) => countObserver.observe(el));
}

/* ---------- Antes y después: la línea sigue al deslizador ---------- */

document.querySelectorAll(".compare").forEach((compare) => {
  const range = compare.querySelector(".compare__range");
  range.addEventListener("input", () => {
    compare.style.setProperty("--pos", `${range.value}%`);
  });
});

/* ---------- Casos de antes y después: flechas y botones ---------- */

const results = document.querySelector(".results");
const caseCompares = [...results.querySelectorAll(".compare")];
const caseCopies = [...results.querySelectorAll(".results__case")];
const casePills = [...results.querySelectorAll(".results__pills button")];
const caseCount = results.querySelector(".results__count span");
let currentCase = 0;

function showCase(index) {
  currentCase = (index + caseCompares.length) % caseCompares.length;
  caseCompares.forEach((el, i) => {
    el.hidden = i !== currentCase;
    // Cada caso empieza con la línea al medio
    if (i === currentCase) {
      el.querySelector(".compare__range").value = 50;
      el.style.setProperty("--pos", "50%");
    }
  });
  caseCopies.forEach((el, i) => (el.hidden = i !== currentCase));
  casePills.forEach((el, i) => el.setAttribute("aria-pressed", String(i === currentCase)));
  caseCount.textContent = currentCase + 1;
}

results.querySelector(".results__arrow--prev").addEventListener("click", () => showCase(currentCase - 1));
results.querySelector(".results__arrow--next").addEventListener("click", () => showCase(currentCase + 1));
casePills.forEach((pill, i) => pill.addEventListener("click", () => showCase(i)));

/* ---------- Botones con motivo: preseleccionan el formulario ---------- */

const motivo = document.getElementById("motivo");

document.querySelectorAll("a[data-motivo]").forEach((link) => {
  link.addEventListener("click", () => {
    motivo.value = link.dataset.motivo;
    motivo.closest(".field").classList.remove("is-invalid");
  });
});

/* ---------- Formulario ---------- */

const form = document.getElementById("booking-form");
const whatsappLink = document.getElementById("whatsapp-link");
const success = document.getElementById("booking-success");
const successText = document.getElementById("success-text");
const errorMsg = document.getElementById("form-error");
const dateInput = document.getElementById("fecha");

// No permitir fechas pasadas
const today = new Date();
today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
dateInput.min = today.toISOString().split("T")[0];

function validate() {
  let valid = true;
  form.querySelectorAll("input, select").forEach((el) => {
    const ok = el.checkValidity() && el.value.trim() !== "";
    el.closest(".field").classList.toggle("is-invalid", !ok);
    if (!ok) valid = false;
  });
  return valid;
}

form.addEventListener("input", (e) => {
  e.target.closest(".field")?.classList.remove("is-invalid");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!validate()) {
    errorMsg.hidden = false;
    form.querySelector(".is-invalid input, .is-invalid select")?.focus();
    return;
  }
  errorMsg.hidden = true;

  const data = Object.fromEntries(new FormData(form));

  const fecha = new Date(data.fecha + "T00:00:00").toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const lineas = [
    "Hola, quiero agendar una cita en Sonrisa Imperial.",
    "",
    `Nombre: ${data.nombre.trim()}`,
    `Teléfono: ${data.telefono.trim()}`,
    `Correo: ${data.email.trim()}`,
    `Motivo: ${data.motivo}`,
  ];
  if (selected.size > 0) {
    lineas.push(`Dientes que me molestan: ${[...selected.values()].join("; ")}`);
  }
  lineas.push(`Fecha preferida: ${fecha}`, `Horario: ${data.horario}`);

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lineas.join("\n"))}`;
  whatsappLink.href = url;

  // Si el navegador bloquea la pestaña nueva, abrir en la misma
  if (!window.open(url, "_blank")) {
    window.location.href = url;
  }

  const nombre = data.nombre.trim().split(" ")[0];
  successText.textContent = `Gracias, ${nombre}. Abrimos WhatsApp con tu solicitud para el ${fecha}. Solo presiona enviar y te confirmamos la cita.`;

  form.hidden = true;
  success.hidden = false;
});

document.getElementById("booking-reset").addEventListener("click", () => {
  form.reset();
  clearTeeth();
  success.hidden = true;
  form.hidden = false;
});
