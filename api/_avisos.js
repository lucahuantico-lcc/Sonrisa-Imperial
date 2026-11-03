// Lógica compartida de los avisos: qué notificación toca enviar y cuándo.
// El archivo empieza con "_" para que Vercel no lo publique como función.

export const ESPERA_MINUTOS = 30; // después de comer, igual que en la app
export const VENTANA_MINUTOS = 45; // si el aviso se atrasa más que esto, ya no se envía
const WEEK_FLOSS_DAYS = [1, 3, 5]; // lunes, miércoles y viernes

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const toMinutes = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

// Valida lo que manda el celular; devuelve null si algo no cuadra
export function cleanPlan(plan) {
  if (!plan || !["desayuno", "almuerzo", "cena"].every((k) => HORA.test(plan[k]))) return null;
  if (!["normal", "tranquilo", "minimo"].includes(plan.intensidad)) return null;
  if (!["diario", "interdiario", "semana"].includes(plan.hilo)) return null;
  return {
    desayuno: plan.desayuno,
    almuerzo: plan.almuerzo,
    cena: plan.cena,
    intensidad: plan.intensidad,
    hilo: plan.hilo,
    inicio: FECHA.test(plan.inicio) ? plan.inicio : null,
  };
}

export function cleanCita(cita) {
  if (!cita || !FECHA.test(cita.fecha) || !HORA.test(cita.hora)) return null;
  return {
    fecha: cita.fecha,
    hora: cita.hora,
    tratamiento: String(cita.tratamiento || "tu cita").slice(0, 60),
  };
}

export function cleanZona(zona) {
  try {
    new Intl.DateTimeFormat("es-PE", { timeZone: zona });
    return zona;
  } catch {
    return "America/Lima";
  }
}

// Fecha y hora actuales en la zona horaria del paciente
export function localNow(zona, date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const fecha = `${parts.year}-${parts.month}-${parts.day}`;
  const [y, m, d] = fecha.split("-").map(Number);
  return {
    fecha,
    minutos: Number(parts.hour) * 60 + Number(parts.minute),
    diaSemana: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
    diaNumero: Math.floor(Date.UTC(y, m - 1, d) / 86400000),
  };
}

const dayNumber = (fecha) => {
  const [y, m, d] = fecha.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

function isFlossDay(plan, ahora) {
  if (plan.hilo === "diario") return true;
  if (plan.hilo === "semana") return WEEK_FLOSS_DAYS.includes(ahora.diaSemana);
  const inicio = plan.inicio ? dayNumber(plan.inicio) : ahora.diaNumero;
  return (ahora.diaNumero - inicio) % 2 === 0;
}

// Mensajes que se van alternando por día, para que no sea siempre el mismo texto
const MENSAJES = {
  desayuno: [
    "Buen día. Dos minutos de cepillado y sales con la sonrisa lista.",
    "Ya desayunaste: es buen momento para cepillarte.",
    "Tu cepillado de la mañana. Sin apuro, dos minutos.",
  ],
  almuerzo: [
    "¿Ya almorzaste? Es buen momento para cepillarte.",
    "Un cepillado después del almuerzo y sigues tu día tranquilo.",
    "Hora del cepillado de mediodía.",
  ],
  noche: [
    "Antes de dormir, cepíllate. Es el cepillado más importante del día.",
    "Último cepillado del día. Mientras duermes, tus dientes quedan protegidos.",
    "Cepíllate antes de dormir y mañana despiertas con la boca fresca.",
  ],
  nocheHilo: [
    "Antes de dormir: cepillado e hilo dental. Hoy toca.",
    "Hoy toca hilo dental. Úsalo junto con tu cepillado de la noche.",
    "Cepillado y hilo dental antes de dormir. Tus encías te lo agradecen.",
  ],
};

const pick = (lista, ahora) => lista[ahora.diaNumero % lista.length];

function brushSlots(plan) {
  const slot = (id, comida) => ({ id, minutos: toMinutes(plan[comida]) + ESPERA_MINUTOS });
  const noche = slot("noche", "cena");
  if (plan.intensidad === "minimo") return [noche];
  if (plan.intensidad === "tranquilo") return [slot("desayuno", "desayuno"), noche];
  return [slot("desayuno", "desayuno"), slot("almuerzo", "almuerzo"), noche];
}

const enVentana = (ahora, minutos) => ahora.minutos >= minutos && ahora.minutos < minutos + VENTANA_MINUTOS;

// Lista de notificaciones que toca enviar en este momento a un paciente
export function dueNotifications(record, ahora) {
  const enviados = new Set(record.enviados?.[ahora.fecha] || []);
  const avisos = [];

  for (const slot of brushSlots(record.plan)) {
    // La noche pasa de medianoche si cenan tarde: se compara en minutos del día
    const minutos = slot.minutos % (24 * 60);
    if (!enVentana(ahora, minutos)) continue;
    const conHilo = slot.id === "noche" && isFlossDay(record.plan, ahora);
    avisos.push({
      id: slot.id,
      title: conHilo ? "Cepillado e hilo dental" : "Hora de cepillarte",
      body: pick(MENSAJES[conHilo ? "nocheHilo" : slot.id], ahora),
      tag: `rutina-${slot.id}`,
      url: "/app/#hoy",
    });
  }

  // Cita: un aviso la noche anterior (7 p. m.) y otro 2 horas antes
  const cita = record.cita;
  if (cita) {
    const diaCita = dayNumber(cita.fecha);
    const minutosCita = toMinutes(cita.hora);
    const tratamiento = cita.tratamiento.toLowerCase();
    if (diaCita - ahora.diaNumero === 1 && enVentana(ahora, 19 * 60)) {
      avisos.push({
        id: `cita-manana-${cita.fecha}`,
        title: "Mañana tienes tu cita",
        body: `Cita de ${tratamiento} a las ${cita.hora} en Sonrisa Imperial. Si no puedes ir, avísanos.`,
        tag: "cita",
        url: "/app/#cita",
      });
    }
    if (diaCita === ahora.diaNumero && enVentana(ahora, Math.max(minutosCita - 120, 0))) {
      avisos.push({
        id: `cita-hoy-${cita.fecha}`,
        title: "Tu cita es en 2 horas",
        body: `Te esperamos a las ${cita.hora} para tu ${tratamiento}. Llega 10 minutos antes.`,
        tag: "cita",
        url: "/app/#cita",
      });
    }
  }

  return avisos.filter((aviso) => !enviados.has(aviso.id));
}
