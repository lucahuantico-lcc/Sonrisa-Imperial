// Guardado de suscripciones en Vercel Blob (privado). Un archivo por celular.
import { createHash } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";
import webpush from "web-push";

const PREFIX = "avisos/";

export const pathFor = (endpoint) => `${PREFIX}${createHash("sha256").update(endpoint).digest("hex")}.json`;

export async function readRecord(pathname) {
  const result = await get(pathname, { access: "private", useCache: false }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text());
}

export function saveRecord(pathname, record) {
  return put(pathname, JSON.stringify(record), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export const deleteRecord = (pathname) => del(pathname).catch(() => {});

export async function* allRecordPaths() {
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) yield blob.pathname;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

export function setupWebPush() {
  webpush.setVapidDetails(
    "https://sonrisa-imperial-lima.vercel.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return webpush;
}

// El celular ya no existe o desinstaló la app: hay que borrar la suscripción
export const isGone = (error) => error?.statusCode === 404 || error?.statusCode === 410;

export function validSubscription(sub) {
  return (
    sub &&
    typeof sub.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    typeof sub.keys?.p256dh === "string" &&
    typeof sub.keys?.auth === "string"
  );
}
