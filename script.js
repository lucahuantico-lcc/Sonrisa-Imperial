// Número de WhatsApp de la clínica: código de país + número, solo dígitos (Perú: 51 + 9 dígitos)
const WHATSAPP_NUMBER = "51925659628";

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

  const mensaje = [
    "Hola, quiero agendar una cita en Sonrisa Imperial.",
    "",
    `Nombre: ${data.nombre.trim()}`,
    `Teléfono: ${data.telefono.trim()}`,
    `Correo: ${data.email.trim()}`,
    `Motivo: ${data.motivo}`,
    `Fecha preferida: ${fecha}`,
    `Horario: ${data.horario}`,
  ].join("\n");

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
  whatsappLink.href = url;

  // Si el navegador bloquea la pestaña nueva, abrir en la misma
  if (!window.open(url, "_blank")) {
    window.location.href = url;
  }

  const nombre = data.nombre.trim().split(" ")[0];
  successText.textContent = `Gracias, ${nombre}. Abrimos WhatsApp con tu solicitud para el ${fecha}: solo presiona enviar y te confirmamos la cita.`;

  form.hidden = true;
  success.hidden = false;
});

document.getElementById("booking-reset").addEventListener("click", () => {
  form.reset();
  success.hidden = true;
  form.hidden = false;
});
