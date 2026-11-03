// Guarda (POST) o borra (DELETE) la suscripción de un celular junto con su plan y su cita.
import { cleanCita, cleanPlan, cleanZona } from "./_avisos.js";
import { deleteRecord, pathFor, readRecord, saveRecord, validSubscription } from "./_store.js";

export default async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { subscription, plan, cita, zona } = req.body || {};
  if (!validSubscription(subscription)) {
    return res.status(400).json({ error: "Suscripción inválida" });
  }

  const pathname = pathFor(subscription.endpoint);

  if (req.method === "DELETE") {
    await deleteRecord(pathname);
    return res.status(204).end();
  }

  const cleanedPlan = cleanPlan(plan);
  if (!cleanedPlan) {
    return res.status(400).json({ error: "Plan inválido" });
  }

  // Se conserva lo ya enviado hoy, para no repetir un aviso si el paciente cambia su plan
  const previous = await readRecord(pathname);
  await saveRecord(pathname, {
    subscription: { endpoint: subscription.endpoint, keys: subscription.keys },
    plan: cleanedPlan,
    cita: cleanCita(cita),
    zona: cleanZona(zona),
    enviados: previous?.enviados || {},
    actualizado: new Date().toISOString(),
  });

  return res.status(200).json({ ok: true });
}
