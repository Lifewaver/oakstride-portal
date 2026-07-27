// =============================================================
// Supabase Edge Function: dispatch-build
// Anropas av portalen efter att ett build_job skapats.
// Firar GitHub repository_dispatch mot oakstride-agent.
//
// Secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_PAT, AGENT_REPO
//   (AGENT_REPO t.ex. "Lifewaver/oakstride-agent")
// Deploy: supabase functions deploy dispatch-build
// =============================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GH_PAT = Deno.env.get("GITHUB_PAT")!;
  const AGENT_REPO = Deno.env.get("AGENT_REPO")!;

  let job_id: string;
  try { ({ job_id } = await req.json()); }
  catch { return new Response("Bad request", { status: 400 }); }
  if (!job_id) return new Response("job_id krävs", { status: 400 });

  // Hämta jobbet med service role
  const r = await fetch(`${SUPABASE_URL}/rest/v1/build_jobs?id=eq.${job_id}&select=id,slug`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const rows = await r.json();
  if (!rows?.length) return new Response("job not found", { status: 404 });

  // Fira GitHub repository_dispatch
  const gh = await fetch(`https://api.github.com/repos/${AGENT_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "oakstride-portal",
    },
    body: JSON.stringify({ event_type: "build-site", client_payload: { job_id } }),
  });

  if (!gh.ok) {
    const text = await gh.text();
    return new Response(`GitHub dispatch misslyckades: ${gh.status} ${text}`, { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true, job_id }), {
    headers: { "Content-Type": "application/json" },
  });
});
