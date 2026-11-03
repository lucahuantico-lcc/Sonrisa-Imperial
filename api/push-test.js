// Envía una notificación de prueba al celular que la pide, para confirmar que todo funciona.
import { isGone, setupWebPush, validSubscription } from "./_store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { subscription } = req.body || {};
  if (!validSubscription(subscription)) {
    return res.status(400).json({ error: "Suscripción inválida" });
  }

  try {
    await setupWebPush().sendNotification(
      subscription,
      JSON.stringify({
        title: "¡Notificaciones activadas!",
        body: "Así te vamos a recordar tu cepillado y tus citas. Pocas veces al día, a la hora justa.",
        tag: "prueba",
        url: "/app/#plan",
      }),
      { TTL: 60 * 10 }
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(isGone(error) ? 410 : 502).json({ error: "No se pudo enviar la notificación" });
  }
}
