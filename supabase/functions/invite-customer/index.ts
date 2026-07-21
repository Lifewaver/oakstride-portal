// OakStride Portal — edge function: bjud in en kund till portalen.
// Anropas från admin-vyn (Förfrågningar). Verifierar att anroparen är admin,
// skapar/inbjuder auth-användaren via service-nyckeln, berikar profilen med
// namn/företag, aktiverar kontot (approved) och markerar briefen som "Kund".
//
// Deploy: supabase functions deploy invite-customer  (eller via MCP).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY injiceras automatiskt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "Endast POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // 1) Verifiera att anroparen är en inloggad admin
    const authHeader = req.headers.get("Authorization") || "";
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json(401, { ok: false, error: "Ej inloggad." });

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: prof } = await admin
      .from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
    if (!prof?.is_admin) return json(403, { ok: false, error: "Endast admin får bjuda in kunder." });

    // 2) Läs indata
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const email = String(body.email ?? "").trim().toLowerCase();
    const full_name = String(body.full_name ?? "").trim() || null;
    const company = String(body.company ?? "").trim() || null;
    const brief_id = body.brief_id ?? null;
    const redirectTo = String(body.redirect_to ?? "https://portal.oakstride.se");
    if (!email || !email.includes("@")) return json(200, { ok: false, error: "Ogiltig e-postadress." });

    // 3) Skapa + bjud in användaren (skickar inbjudningsmejl via konfigurerad SMTP/Resend)
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: full_name ? { full_name } : {},
      redirectTo,
    });

    if (invErr) {
      const msg = String(invErr.message || invErr);
      if (/already|registered|exists/i.test(msg)) {
        // Användaren finns redan — försök ändå aktivera + berika befintlig profil
        const { data: existing } = await admin
          .from("profiles").select("id").eq("email", email).maybeSingle();
        if (existing?.id) {
          await admin.from("profiles")
            .update(buildPatch(full_name, company)).eq("id", existing.id);
        }
        return json(200, {
          ok: true, already: true,
          message: "Kontot fanns redan — det är nu aktiverat. Be kunden logga in (Glömt lösenordet vid behov).",
        });
      }
      return json(200, { ok: false, error: msg });
    }

    // 4) Berika + aktivera den nyskapade profilen (triggern skapade raden)
    const newUserId = inv?.user?.id;
    if (newUserId) {
      await admin.from("profiles").update(buildPatch(full_name, company)).eq("id", newUserId);
    }

    // 5) Markera briefen som konverterad till kund
    if (brief_id != null) {
      await admin.from("project_briefs").update({ status: "converted" }).eq("id", Number(brief_id));
    }

    return json(200, {
      ok: true,
      message: "Inbjudan skickad till " + email + " — kontot är aktiverat.",
    });
  } catch (e) {
    return json(500, { ok: false, error: String((e as Error)?.message || e) });
  }
});

function buildPatch(full_name: string | null, company: string | null) {
  const patch: Record<string, unknown> = { approved: true };
  if (full_name) patch.full_name = full_name;
  if (company) patch.company = company;
  return patch;
}
