/**
 * StudyQuest — Supabase Edge Function: send-push
 * ─────────────────────────────────────────────
 * Recebe { toUserId, title, body, data } e envia uma
 * notificação Web Push para todos os dispositivos subscritos
 * daquele usuário, usando as chaves VAPID configuradas via Secrets.
 *
 * Deploy (rodar no terminal):
 *   npx supabase functions deploy send-push --no-verify-jwt
 *
 * Secrets (rodar UMA VEZ antes do deploy):
 *   npx supabase secrets set VAPID_PUBLIC_KEY="SUA_CHAVE_PUBLICA"
 *   npx supabase secrets set VAPID_PRIVATE_KEY="SUA_CHAVE_PRIVADA"
 *   npx supabase secrets set VAPID_SUBJECT="mailto:admin@studyquestxp.com.br"
 *
 * Gerar par de chaves VAPID (rodar no terminal):
 *   npx web-push generate-vapid-keys
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
// deno-lint-ignore no-explicit-any
const webpush: any = (await import("npm:web-push@3.6.7")).default;

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT")     ?? "mailto:admin@studyquestxp.com.br";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.error("[send-push] VAPID keys nao configuradas!");
}

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID keys not configured on server" }, 503);
  }

  let reqBody: { toUserId?: string; title?: string; body?: string; data?: Record<string, unknown> };
  try { reqBody = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const { toUserId, title = "StudyQuest", body: msgBody = "", data = {} } = reqBody;
  if (!toUserId) return json({ error: "toUserId is required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: rows, error: dbErr } = await supabase
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("user_id", toUserId);

  if (dbErr) return json({ error: dbErr.message }, 500);
  if (!rows || rows.length === 0) return json({ error: "No subscriptions found", sent: 0 }, 404);

  const payload = JSON.stringify({
    title, body: msgBody,
    icon: "./icon.svg", badge: "./icon.svg",
    tag: (data as Record<string, string>).tag || "studyquest",
    renotify: true, data,
  });

  let sent = 0;
  const errors: string[] = [];
  const toDelete: string[] = [];

  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent++;
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      errors.push(err.message ?? "unknown");
      if (err.statusCode === 410 || err.statusCode === 404) toDelete.push(row.id);
    }
  }

  if (toDelete.length) {
    await supabase.from("push_subscriptions").delete().in("id", toDelete);
  }

  return json({ success: true, sent, total: rows.length, errors });
});
