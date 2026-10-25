// Número de WhatsApp de la clínica: código de país + número, solo dígitos (ej. Perú: 51 + 9 dígitos)
const WHATSAPP_NUMBER = "[WHATSAPP]";

// Mientras no haya número real, wa.me sin número deja elegir el contacto en WhatsApp
const WHATSAPP_BASE = /^\d+$/.test(WHATSAPP_NUMBER)
  ? `https://wa.me/${WHATSAPP_NUMBER}`
  : "https://wa.me/";

/* ---------- Selector "¿Qué quieres consentir hoy?" ---------- */

const chips = document.querySelectorAll(".chip");
const pickerCount = document.getElementById("picker-count");
const formPicked = document.getElementById("form-picked");

function pickedZones() {
  return [...chips]
    .filter((chip) => chip.getAttribute("aria-pressed") === "true")
    .map((chip) => chip.textContent.replace(/^\S+\s/, ""));
}

function renderPicked() {
  const zones = pickedZones();

  if (zones.length === 0) {
    pickerCount.textContent = "Aún no eliges nada. También puedes reservar sin elegir.";
    formPicked.hidden = true;
    return;
  }

  pickerCount.textContent =
    zones.length === 1 ? "¡Anotado! 1 cosa en tu lista." : `¡Anotado! ${zones.length} cosas en tu lista.`;
  formPicked.textContent = `Te interesa: ${zones.join(", ")}`;
  formPicked.hidden = false;
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const pressed = chip.getAttribute("aria-pressed") === "true";
    chip.setAttribute("aria-pressed", String(!pressed));
    renderPicked();
  });
});

/* ---------- Tratamientos: preseleccionan el motivo ---------- */

const motivo = document.getElementById("motivo");

document.querySelectorAll("[data-motivo]").forEach((link) => {
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

  const fecha = new Date(data.fecha + "T00:00:00").toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const lineas = [
    "¡Hola! Quiero reservar una cita en Clínica Superficial.",
    "",
    `Nombre: ${data.nombre.trim()}`,
    `Celular: ${data.telefono.trim()}`,
    `Me interesa: ${data.motivo}`,
  ];
  const zones = pickedZones();
  if (zones.length > 0) {
    lineas.push(`También quiero consentir: ${zones.join(", ")}`);
  }
  lineas.push(`Día preferido: ${fecha}`, `Horario: ${data.horario}`);

  const url = `${WHATSAPP_BASE}?text=${encodeURIComponent(lineas.join("\n"))}`;
  whatsappLink.href = url;

  // Si el navegador bloquea la pestaña nueva, abrir en la misma
  if (!window.open(url, "_blank")) {
    window.location.href = url;
  }

  const nombre = data.nombre.trim().split(" ")[0];
  successText.textContent = `¡Gracias, ${nombre}! Abrimos WhatsApp con tu reserva para el ${fecha}. Solo presiona enviar y te confirmamos.`;

  form.hidden = true;
  success.hidden = false;
});

document.getElementById("booking-reset").addEventListener("click", () => {
  form.reset();
  chips.forEach((chip) => chip.setAttribute("aria-pressed", "false"));
  renderPicked();
  success.hidden = true;
  form.hidden = false;
});
