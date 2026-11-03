// Revisa a todos los suscritos y envía los avisos que tocan ahora.
// Lo llama el workflow de GitHub cada 5 minutos con la clave CRON_SECRET.
import { dueNotifications, localNow } from "./_avisos.js";
import { allRecordPaths, deleteRecord, isGone, readRecord, saveRecord, setupWebPush } from "./_store.js";

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const webpush = setupWebPush();
  const resumen = { revisados: 0, enviados: 0, borrados: 0, errores: 0 };

  for await (const pathname of allRecordPaths()) {
    resumen.revisados += 1;
    const record = await readRecord(pathname);
    if (!record?.plan) continue;

    const ahora = localNow(record.zona);
    const avisos = dueNotifications(record, ahora);
    if (avisos.length === 0) continue;

    const enviadosHoy = new Set(record.enviados?.[ahora.fecha] || []);
    let gone = false;

    for (const aviso of avisos) {
      try {
        await webpush.sendNotification(
          record.subscription,
          JSON.stringify({ title: aviso.title, body: aviso.body, tag: aviso.tag, url: aviso.url }),
          { TTL: 60 * 60, urgency: "normal" }
        );
        enviadosHoy.add(aviso.id);
        resumen.enviados += 1;
      } catch (error) {
        if (isGone(error)) {
          gone = true;
          break;
        }
        resumen.errores += 1;
      }
    }

    if (gone) {
      await deleteRecord(pathname);
      resumen.borrados += 1;
      continue;
    }

    // Solo se guarda el registro de hoy: lo de días anteriores ya no sirve
    record.enviados = { [ahora.fecha]: [...enviadosHoy] };
    await saveRecord(pathname, record);
  }

  return res.status(200).json(resumen);
}
