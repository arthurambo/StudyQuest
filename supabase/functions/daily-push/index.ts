/**
 * StudyQuest — Edge Function: daily-push
 * Roda via cron (pg_cron no Supabase) 2x por dia:
 *   - 08:00 BRT → lembrete matinal do cronograma
 *   - 20:00 BRT → alerta de streak em risco
 *
 * Configurar no Supabase Dashboard → Database → Extensions → pg_cron:
 *   SELECT cron.schedule('sq-push-morning', '0 11 * * *', $$SELECT net.http_post(url:='https://gwenrlqhxzcnwlmvwszj.supabase.co/functions/v1/daily-push', headers:='{"Authorization":"Bearer <ANON_KEY>","Content-Type":"application/json"}'::jsonb, body:='{"type":"morning"}'::jsonb)$$);
 *   SELECT cron.schedule('sq-push-evening', '0 23 * * *', $$SELECT net.http_post(url:='https://gwenrlqhxzcnwlmvwszj.supabase.co/functions/v1/daily-push', headers:='{"Authorization":"Bearer <ANON_KEY>","Content-Type":"application/json"}'::jsonb, body:='{"type":"evening"}'::jsonb)$$);
 *
 * Deploy:
 *   npx supabase functions deploy daily-push --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
// deno-lint-ignore no-explicit-any
const webpush: any = (await import("npm:web-push@3.6.7")).default;

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT")     ?? "mailto:dracoforgegm@gmail.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
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

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID keys not configured" }, 503);
  }

  let type = "evening";
  try {
    const body = await req.json();
    type = body.type ?? "evening";
  } catch { /* cron pode chamar sem body */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Busca todos os usuários com push subscription ativa
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription");

  if (error || !subs?.length) return json({ sent: 0, error: error?.message });

  // Para alerta de streak: busca quem tem streak > 0 e não estudou hoje
  // Para lembrete matinal: manda para todos com subscription
  let targets: { user_id: string; subscription: unknown }[] = subs;

  if (type === "evening") {
    // Filtra usuários com streak ativo que não estudaram hoje
    const today = new Date().toISOString().slice(0, 10);
    const { data: users } = await supabase
      .from("users")
      .select("id, data")
      .in("id", subs.map((s: { user_id: string }) => s.user_id));

    const atRisk = new Set<string>();
    for (const u of users ?? []) {
      try {
        const d = typeof u.data === "string" ? JSON.parse(u.data) : u.data;
        const streak      = d?.streak ?? 0;
        const lastStudy   = d?.lastStudyDate ?? "";
        const studiedToday = lastStudy === today;
        if (streak > 0 && !studiedToday) atRisk.add(u.id);
      } catch { /* ignora usuários com data corrompida */ }
    }
    targets = subs.filter((s: { user_id: string }) => atRisk.has(s.user_id));
  }

  let sent = 0;
  const toDelete: string[] = [];

  for (const sub of targets) {
    const payload = JSON.stringify(
      type === "morning"
        ? {
            title: "📚 Bom dia, herói!",
            body: "Hora de estudar! Abra o StudyQuest e avance na sua missão.",
            icon: "/icon.svg",
            badge: "/icon.svg",
            tag: "sq-morning",
            renotify: false,
            data: { page: "study" },
          }
        : {
            title: "🔥 Não perca sua sequência!",
            body: "Você ainda não estudou hoje. Alguns minutinhos salvam seu streak!",
            icon: "/icon.svg",
            badge: "/icon.svg",
            tag: "sq-streak-risk",
            renotify: false,
            data: { page: "dashboard" },
          }
    );

    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err.statusCode === 410 || err.statusCode === 404) toDelete.push(sub.user_id);
    }
  }

  if (toDelete.length) {
    await supabase.from("push_subscriptions").delete().in("user_id", toDelete);
  }

  return json({ success: true, type, sent, total: targets.length });
});
