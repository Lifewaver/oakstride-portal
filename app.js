/* OakStride Portal — kundportal för ändringsförfrågningar.
   Statisk SPA mot Supabase (auth + Postgres med RLS). */
(function () {
  "use strict";

  var cfg = window.PORTAL_CONFIG || {};
  var views = {
    loading: document.getElementById("view-loading"),
    config: document.getElementById("view-config"),
    login: document.getElementById("view-login"),
    pending: document.getElementById("view-pending"),
    setpass: document.getElementById("view-setpass"),
    app: document.getElementById("view-app")
  };
  var main = document.getElementById("app-main");

  var STATUS_LABELS = {
    new: "Ny",
    in_progress: "Pågående",
    questions: "Frågor till dig",
    draft_ready: "Förslag klart — granska",
    approved: "Godkänt",
    waiting_customer: "Väntar på dig",
    done: "Klar"
  };
  var STATUS_LABELS_ADMIN = {
    new: "Ny",
    in_progress: "Pågående",
    questions: "Väntar på kundsvar",
    draft_ready: "Förslag klart",
    approved: "Godkänt av kund",
    waiting_customer: "Väntar på kund",
    done: "Klar"
  };
  var PRIO_LABELS = { low: "Låg", normal: "Normal", high: "Hög" };

  // Kundvillkor som visas och godkänns i portalen. Bumpa "version" när texten ändras
  // → alla kunder får godkänna på nytt. Hash av (version + text) loggas som bevis.
  var AGREEMENT = {
    version: "2026-07-20",
    title: "OakStrides kundvillkor",
    html: [
      "<h3>1. Om avtalet</h3>",
      '<p>Dessa villkor gäller mellan OakStride AB ("OakStride") och dig som kund för design, byggnation och löpande omhändertagande av din webbplats. De kompletterar det kundavtal med bilagor som tecknats mellan parterna; vid motstridighet gäller det undertecknade avtalet.</p>',
      "<h3>2. Standardwebbplats</h3>",
      "<p>En Standardwebbplats levereras till fast pris och omfattar upp till fem (5) sidor, mallbaserad och mobilanpassad design med din logotyp och dina färger, grundläggande SEO, ett kontaktformulär, koppling av din domän och e-post, inläggning av innehåll som du levererar färdigt, tre (3) uppstartsmöten samt ett (1) korrekturvarv. Arbete utöver detta (t.ex. fler sidor, e-handel, inloggning, specialfunktioner, flerspråkighet eller formgivning från grunden) ingår inte och debiteras per timme.</p>",
      "<h3>3. Priser (exkl. moms)</h3>",
      "<ul><li><strong>Standardwebbplats:</strong> 3 000 kr som engångskostnad, faktureras vid beställning.</li>" +
      "<li><strong>Löpande drift:</strong> 150 kr/mån — hosting, domän, certifikat, säkerhet, säkerhetskopiering och tillgång till kundportalen. Inga ändringar ingår i driften.</li>" +
      "<li><strong>Ändringar och utveckling efter lansering:</strong> 1 095 kr/timme, minsta debitering 30 minuter per ärende och därefter per påbörjad kvart.</li>" +
      "<li><strong>Akut arbete utanför kontorstid:</strong> 1 995 kr/timme (på din begäran).</li></ul>",
      "<h3>4. Så beställer du ändringar</h3>",
      "<p>Ändringsönskemål lämnas i den här kundportalen. Du får en tidsuppskattning och, efter ditt godkännande, ett utkast med förhandsvisning. Ingenting publiceras utan ditt godkännande. Nedlagd tid debiteras enligt punkt 3.</p>",
      "<h3>5. Betalning</h3>",
      "<p>Betalningsvillkor 20 dagar netto. Månadsavgiften för drift faktureras i förskott. Vid försenad betalning utgår dröjsmålsränta enligt räntelagen samt lagstadgad påminnelseavgift.</p>",
      "<h3>6. Avtalstid och uppsägning</h3>",
      "<p>Driften löper tills vidare med en (1) månads ömsesidig uppsägningstid. Uppstartsprojektet avslutas vid godkänd leverans.</p>",
      "<h3>7. Du äger din sajt</h3>",
      "<p>Efter full betalning äger du ditt innehåll och har obegränsad nyttjanderätt till den levererade webbplatsen. Vid uppsägning lämnar OakStride utan extra kostnad över en komplett kopia av webbplatsens filer och innehåll samt domänen — du är aldrig inlåst.</p>",
      "<h3>8. Användning av AI</h3>",
      "<p>OakStride använder AI-verktyg som stöd i arbetet. Alla utkast granskas av en människa innan publicering, och ditt material används inte för att träna AI-modeller.</p>",
      "<h3>9. Personuppgifter</h3>",
      "<p>Vardera parten ansvarar för sin egen behandling av personuppgifter. Behandlar OakStride personuppgifter för din räkning upprättas ett personuppgiftsbiträdesavtal.</p>",
      "<h3>10. Ansvar</h3>",
      "<p>OakStride utför tjänsterna fackmässigt. OakStride ansvarar inte för indirekt skada, och det sammanlagda ansvaret per tolvmånadersperiod är begränsat till de avgifter du betalat under samma period. Begränsningen gäller inte vid uppsåt eller grov vårdslöshet.</p>",
      "<h3>11. Tvist</h3>",
      "<p>Svensk rätt tillämpas. Tvist avgörs av svensk allmän domstol med Stockholms tingsrätt som första instans.</p>",
      '<p class="fineprint">Genom att godkänna bekräftar du att du har behörighet att ingå avtalet för kundens räkning och att du läst och accepterat dessa villkor. Godkännandet loggas med tidpunkt och en kontrollsumma av villkorstexten, och en bekräftelse skickas till din e-post.</p>'
    ].join("")
  };

  function sha256Hex(str) {
    try {
      var buf = new TextEncoder().encode(str);
      return crypto.subtle.digest("SHA-256", buf).then(function (h) {
        return Array.prototype.map.call(new Uint8Array(h), function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
      });
    } catch (e) {
      return Promise.resolve("nohash-" + str.length);
    }
  }

  var sb = null;
  var session = null;
  var profile = null;
  var adminTab = "arenden";
  var viewAsCustomer = false;

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(msg, isError) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " error" : "");
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString("sv-SE") + " " + d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }

  function chip(status, admin) {
    var labels = admin ? STATUS_LABELS_ADMIN : STATUS_LABELS;
    return '<span class="chip chip-' + esc(status) + '">' + esc(labels[status] || status) + "</span>";
  }

  function prioChip(p) {
    if (p === "normal") return "";
    return '<span class="chip chip-prio-' + esc(p) + '">' + esc(PRIO_LABELS[p] || p) + "</span>";
  }

  // ---------- Init ----------

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    show("config");
    return;
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  sb.auth.onAuthStateChange(function (event, s) {
    var had = !!session;
    session = s;
    if (event === "PASSWORD_RECOVERY") { show("setpass"); return; }
    if (!s && had) show("login");
  });

  sb.auth.getSession().then(function (res) {
    session = res.data.session;
    if (!session) { show("login"); return; }
    loadProfileAndRoute();
  });

  function loadProfileAndRoute() {
    sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle().then(function (res) {
      if (res.error) { toast("Kunde inte hämta din profil: " + res.error.message, true); show("login"); return; }
      profile = res.data;
      if (!profile) {
        // Trigger hann inte skapa profilen ännu — försök igen strax.
        setTimeout(loadProfileAndRoute, 1200);
        return;
      }
      // Första inloggningen: föreslå att sätta ett eget lösenord
      if (!localStorage.getItem("oak_pw_" + session.user.id)) {
        show("setpass");
        return;
      }
      if (!profile.approved && !profile.is_admin) {
        document.getElementById("pending-name").value = profile.full_name || "";
        document.getElementById("pending-company").value = profile.company || "";
        show("pending");
        return;
      }
      document.getElementById("user-email").textContent = profile.email;
      document.getElementById("admin-nav").hidden = !profile.is_admin;
      document.getElementById("btn-viewas").hidden = !profile.is_admin;
      show("app");
      // Admin (och admin i "visa som kund"-läge) hoppar över godkännandegrinden.
      if (profile.is_admin) { if (viewAsCustomer) renderCustomer(); else renderAdmin(); return; }
      requireAgreement(renderCustomer);
    });
  }

  // ---------- Avtalsgodkännande ----------

  function requireAgreement(next) {
    sb.from("agreement_acceptances").select("id")
      .eq("user_id", session.user.id).eq("agreement_version", AGREEMENT.version)
      .maybeSingle().then(function (res) {
        if (res.data) { next(); return; }        // redan godkänt aktuell version
        renderAgreementGate(next);
      });
  }

  function renderAgreementGate(next) {
    main.innerHTML =
      '<div class="card agreement-card">' +
      "<h1>Innan vi sätter igång</h1>" +
      '<p class="muted">För att använda portalen behöver du godkänna OakStrides kundvillkor. Läs igenom dem nedan.</p>' +
      '<div class="agreement-box">' + AGREEMENT.html + "</div>" +
      '<label class="agree-check"><input type="checkbox" id="agree-cb"> <span>Jag har läst och godkänner OakStrides kundvillkor (version ' + esc(AGREEMENT.version) + ").</span></label>" +
      '<button id="btn-agree" class="btn btn-primary" disabled>Godkänn avtal</button>' +
      '<p id="agree-status" class="status-note" hidden></p></div>';
    var cbEl = document.getElementById("agree-cb");
    var btn = document.getElementById("btn-agree");
    cbEl.addEventListener("change", function () { btn.disabled = !cbEl.checked; });
    btn.addEventListener("click", function () {
      btn.disabled = true;
      sha256Hex(AGREEMENT.version + "\n" + AGREEMENT.html).then(function (hash) {
        sb.from("agreement_acceptances").insert({
          user_id: session.user.id,
          agreement_version: AGREEMENT.version,
          document_title: AGREEMENT.title,
          document_hash: hash,
          user_agent: navigator.userAgent
        }).then(function (res) {
          if (res.error) {
            if (res.error.code === "23505") { next(); return; } // redan godkänt → släpp in
            var n = document.getElementById("agree-status");
            n.hidden = false; n.className = "status-note error";
            n.textContent = "Kunde inte spara godkännandet: " + res.error.message;
            btn.disabled = false; return;
          }
          toast("Tack! Avtalet är godkänt.");
          next();
        });
      });
    });
  }

  function renderTermsView(back) {
    main.innerHTML =
      '<button class="back-link" id="btn-back">&larr; Tillbaka</button>' +
      '<div class="card"><h1>' + esc(AGREEMENT.title) + "</h1>" +
      '<p class="muted">Version ' + esc(AGREEMENT.version) + "</p>" +
      '<div class="agreement-box">' + AGREEMENT.html + "</div></div>";
    document.getElementById("btn-back").addEventListener("click", back);
  }

  // ---------- Login ----------

  document.getElementById("btn-google").addEventListener("click", function () {
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname }
    }).then(function (res) {
      if (res.error) toast("Google-inloggning misslyckades: " + res.error.message, true);
    });
  });

  document.getElementById("form-password").addEventListener("submit", function (e) {
    e.preventDefault();
    var note = document.getElementById("magic-status");
    var btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    sb.auth.signInWithPassword({
      email: document.getElementById("login-email").value.trim(),
      password: document.getElementById("login-pass").value
    }).then(function (res) {
      btn.disabled = false;
      if (res.error) {
        note.hidden = false;
        note.className = "status-note error";
        note.textContent = "Inloggningen misslyckades. Har du inget lösenord ännu? Använd \"Glömt lösenordet?\" eller engångslänken nedan.";
        return;
      }
      show("loading");
      loadProfileAndRoute();
    });
  });

  document.getElementById("btn-forgot").addEventListener("click", function () {
    var email = document.getElementById("login-email").value.trim();
    var note = document.getElementById("magic-status");
    note.hidden = false;
    if (!email) {
      note.className = "status-note error";
      note.textContent = "Fyll i din e-postadress ovan först, klicka sedan på Glömt lösenordet igen.";
      return;
    }
    sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    }).then(function (res) {
      note.className = res.error ? "status-note error" : "status-note";
      note.textContent = res.error
        ? "Kunde inte skicka: " + res.error.message
        : "Klart! Kolla din inkorg (" + email + ") — länken låter dig välja ett nytt lösenord.";
    });
  });

  document.getElementById("btn-magic-mode").addEventListener("click", function () {
    var f = document.getElementById("form-magic");
    f.hidden = !f.hidden;
    if (!f.hidden) document.getElementById("magic-email").value = document.getElementById("login-email").value;
  });

  document.getElementById("form-magic").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("magic-email").value.trim();
    var note = document.getElementById("magic-status");
    var btn = e.target.querySelector("button");
    if (!email) return;
    btn.disabled = true;
    sb.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    }).then(function (res) {
      btn.disabled = false;
      note.hidden = false;
      if (res.error) {
        note.className = "status-note error";
        note.textContent = "Kunde inte skicka länken: " + res.error.message;
      } else {
        note.className = "status-note";
        note.textContent = "Klart! Kolla din inkorg (" + email + ") och klicka på inloggningslänken.";
      }
    });
  });

  document.getElementById("btn-viewas").addEventListener("click", function () {
    viewAsCustomer = !viewAsCustomer;
    this.textContent = viewAsCustomer ? "Tillbaka till admin" : "Visa som kund";
    document.getElementById("admin-nav").hidden = viewAsCustomer || !profile.is_admin;
    if (viewAsCustomer) renderCustomer(); else renderAdmin();
  });

  document.getElementById("form-setpass").addEventListener("submit", function (e) {
    e.preventDefault();
    var p1 = document.getElementById("setpass-1").value;
    var p2 = document.getElementById("setpass-2").value;
    var note = document.getElementById("setpass-status");
    note.hidden = false;
    if (p1 !== p2) {
      note.className = "status-note error";
      note.textContent = "Lösenorden matchar inte.";
      return;
    }
    sb.auth.updateUser({ password: p1 }).then(function (res) {
      if (res.error) {
        note.className = "status-note error";
        note.textContent = "Kunde inte spara: " + res.error.message;
        return;
      }
      if (session) localStorage.setItem("oak_pw_" + session.user.id, "1");
      note.className = "status-note";
      note.textContent = "Lösenordet är sparat!";
      show("loading");
      loadProfileAndRoute();
    });
  });

  document.getElementById("btn-setpass-back").addEventListener("click", function () {
    if (session) {
      localStorage.setItem("oak_pw_" + session.user.id, "1");
      show("loading");
      loadProfileAndRoute();
    } else {
      show("login");
    }
  });

  document.getElementById("btn-passwd").addEventListener("click", function () {
    document.getElementById("setpass-status").hidden = true;
    show("setpass");
  });

  document.getElementById("btn-logout").addEventListener("click", signOut);
  document.getElementById("btn-logout-pending").addEventListener("click", signOut);
  function signOut() { sb.auth.signOut().then(function () { window.location.reload(); }); }

  // ---------- Väntar på godkännande ----------

  document.getElementById("btn-pending-save").addEventListener("click", function () {
    var note = document.getElementById("pending-status");
    sb.from("profiles").update({
      full_name: document.getElementById("pending-name").value.trim() || null,
      company: document.getElementById("pending-company").value.trim() || null
    }).eq("id", session.user.id).then(function (res) {
      note.hidden = false;
      if (res.error) {
        note.className = "status-note error";
        note.textContent = "Kunde inte spara: " + res.error.message;
      } else {
        note.className = "status-note";
        note.textContent = "Sparat — tack!";
      }
    });
  });

  // ---------- Kundvy ----------

  function renderCustomer() {
    var site = (profile.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    var siteUrl = site ? "https://" + site : null;
    var firstName = (profile.full_name || "").split(" ")[0];
    main.innerHTML =
      '<h1 class="dash-title">' + (firstName ? "Hej " + esc(firstName) + "!" : "Välkommen!") + "</h1>" +
      '<div class="dash-grid">' +
        '<div class="card dash-site"><h2>Din hemsida</h2>' +
        (siteUrl
          ? '<div class="site-thumb"><iframe src="' + esc(siteUrl) + '" scrolling="no" tabindex="-1" loading="lazy" title="Förhandsvisning av din hemsida"></iframe></div>' +
            '<div class="site-row"><span class="site-domain">' + esc(site) + '</span>' +
            '<a class="linklike" href="' + esc(siteUrl) + '" target="_blank" rel="noopener">Besök sajten &rarr;</a></div>'
          : '<p class="muted">Din hemsida kopplas till kontot av OakStride — hör av dig om den inte syns här inom kort.</p>') +
        '<button id="btn-new" class="btn btn-primary btn-big">✏️ Uppdatera min hemsida</button>' +
        "</div>" +
        '<div class="card dash-stats"><h2>Besökare</h2><div id="stats-box"><div class="spinner"></div></div></div>' +
      "</div>" +
      '<div class="card dash-reqs"><div class="page-head"><h2>Dina ärenden</h2>' +
      '<button id="btn-new2" class="btn btn-google btn-inline btn-sm">+ Nytt ärende</button></div>' +
      '<div id="req-list" class="req-list"><div class="spinner"></div></div></div>' +
      '<div class="card dash-contact"><h2>Behöver du hjälp?</h2>' +
      '<p class="muted">Vi finns ett mejl eller ett samtal bort — inga växlar, inga köer.</p>' +
      '<p><a href="mailto:info@oakstride.se">info@oakstride.se</a> &middot; <a href="tel:+46702371704">070-237 17 04</a></p>' +
      '<p class="fineprint">Du har godkänt OakStrides kundvillkor (version ' + esc(AGREEMENT.version) + "). " +
      '<button class="linklike" id="btn-terms">Läs villkoren</button></p></div>';
    document.getElementById("btn-new").addEventListener("click", renderNewRequestForm);
    document.getElementById("btn-new2").addEventListener("click", renderNewRequestForm);
    document.getElementById("btn-terms").addEventListener("click", function () { renderTermsView(renderCustomer); });
    loadRequests(false);
    loadStats(site);
  }

  function loadStats(site) {
    var box = document.getElementById("stats-box");
    if (!site) { box.innerHTML = '<p class="muted">Statistiken aktiveras när din hemsida är kopplad till kontot.</p>'; return; }
    sb.rpc("site_stats", { p_site: site }).then(function (res) {
      if (!box.isConnected) return;
      var s = res.data;
      if (res.error || !s) {
        box.innerHTML = '<p class="muted">Besöksstatistik aktiveras för din hemsida inom kort.</p>';
        return;
      }
      var daily = s.daily || [];
      var max = 1;
      daily.forEach(function (d) { if (d.c > max) max = d.c; });
      var bars = daily.map(function (d) {
        return '<div class="bar" style="height:' + Math.max(6, Math.round(100 * d.c / max)) + '%" title="' + esc(d.d) + ": " + d.c + ' besök"></div>';
      }).join("");
      box.innerHTML =
        '<div class="stat-row">' +
        '<div class="stat"><div class="stat-num">' + (s.total_7 || 0) + '</div><div class="stat-label">besök, 7 dagar</div></div>' +
        '<div class="stat"><div class="stat-num">' + (s.total_30 || 0) + '</div><div class="stat-label">besök, 30 dagar</div></div>' +
        (s.uniq_30 ? '<div class="stat"><div class="stat-num">' + s.uniq_30 + '</div><div class="stat-label">unika, 30 dagar</div></div>' : "") +
        "</div>" +
        '<div class="bars" aria-label="Besök per dag, senaste 14 dagarna">' + bars + "</div>" +
        ((s.top_pages && s.top_pages.length)
          ? '<div class="top-pages"><strong>Mest besökta sidor</strong>' +
            s.top_pages.map(function (p) {
              return '<div class="top-page"><span>' + esc(p.path) + "</span><span>" + p.c + "</span></div>";
            }).join("") + "</div>"
          : '<p class="muted">Inga besök registrerade ännu — statistiken börjar samlas nu.</p>');
    });
  }

  function loadRequests(isAdmin) {
    var q = sb.from("requests")
      .select("*" + (isAdmin ? ", owner:profiles!requests_user_id_fkey(full_name,email,company,website)" : ""))
      .order("created_at", { ascending: false });
    // Kundvyn visar bara egna ärenden — även för admin i "visa som kund"-läget
    if (!isAdmin) q = q.eq("user_id", session.user.id);
    q.then(function (res) {
      var box = document.getElementById("req-list");
      if (!box) return;
      if (res.error) { box.innerHTML = '<div class="empty">Kunde inte hämta ärenden: ' + esc(res.error.message) + "</div>"; return; }
      var rows = res.data || [];
      var filter = document.getElementById("status-filter");
      if (filter && filter.value) rows = rows.filter(function (r) { return r.status === filter.value; });
      if (!rows.length) {
        box.innerHTML = '<div class="empty">' + (isAdmin ? "Inga ärenden matchar filtret." :
          "Du har inga ärenden ännu. Klicka på <strong>+ Nytt ärende</strong> för att skicka din första förfrågan.") + "</div>";
        return;
      }
      box.innerHTML = rows.map(function (r) {
        var who = isAdmin && r.owner ? esc(r.owner.full_name || r.owner.email) + (r.owner.company ? " · " + esc(r.owner.company) : "") + " · " : "";
        return '<button class="req-item" data-id="' + r.id + '">' +
          '<div class="req-item-top"><span class="req-title">' + esc(r.title) + "</span>" +
          prioChip(r.priority) + chip(r.status, isAdmin) + "</div>" +
          '<div class="req-meta">' + who + "#" + r.id + " · " + fmtDate(r.created_at) + "</div></button>";
      }).join("");
      Array.prototype.forEach.call(box.querySelectorAll(".req-item"), function (el) {
        el.addEventListener("click", function () { renderDetail(Number(el.getAttribute("data-id")), isAdmin); });
      });
    });
  }

  function renderNewRequestForm() {
    main.innerHTML =
      '<button class="back-link" id="btn-back">&larr; Tillbaka till dina ärenden</button>' +
      '<div class="card"><h1>Nytt ärende</h1>' +
      '<p class="muted">Beskriv vad du vill ändra på din hemsida så återkommer vi med tidsuppskattning eller följdfrågor.</p>' +
      '<form id="form-req">' +
      '<label for="f-title">Rubrik *</label>' +
      '<input type="text" id="f-title" required maxlength="140" placeholder="t.ex. Byt bild på startsidan">' +
      '<label for="f-url">Vilken sida gäller det? (frivilligt)</label>' +
      '<input type="text" id="f-url" placeholder="t.ex. dinsajt.se/kontakt">' +
      '<label for="f-prio">Hur bråttom är det?</label>' +
      '<select id="f-prio"><option value="low">Låg — när ni hinner</option>' +
      '<option value="normal" selected>Normal</option>' +
      '<option value="high">Hög — så snart som möjligt</option></select>' +
      '<label for="f-desc">Beskrivning *</label>' +
      '<textarea id="f-desc" required placeholder="Beskriv ändringen så tydligt du kan. Länka gärna till bilder eller texter."></textarea>' +
      '<button type="submit" class="btn btn-primary">Skicka förfrågan</button>' +
      "</form></div>";
    document.getElementById("btn-back").addEventListener("click", renderCustomer);
    document.getElementById("form-req").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      sb.from("requests").insert({
        user_id: session.user.id,
        title: document.getElementById("f-title").value.trim(),
        page_url: document.getElementById("f-url").value.trim() || null,
        priority: document.getElementById("f-prio").value,
        description: document.getElementById("f-desc").value.trim()
      }).then(function (res) {
        btn.disabled = false;
        if (res.error) { toast("Kunde inte skicka: " + res.error.message, true); return; }
        toast("Tack! Din förfrågan är skickad.");
        renderCustomer();
      });
    });
  }

  // ---------- Detaljvy (kund + admin) ----------

  function renderDetail(id, isAdmin) {
    main.innerHTML = '<div class="spinner"></div>';
    Promise.all([
      sb.from("requests").select("*, owner:profiles!requests_user_id_fkey(full_name,email,company,website)").eq("id", id).single(),
      sb.from("request_comments").select("*, author:profiles!request_comments_author_id_fkey(full_name,email,is_admin)").eq("request_id", id).order("created_at")
    ]).then(function (out) {
      var r = out[0].data, comments = out[1].data || [];
      if (out[0].error || !r) { toast("Kunde inte hämta ärendet.", true); isAdmin ? renderAdmin() : renderCustomer(); return; }
      var labels = isAdmin ? STATUS_LABELS_ADMIN : STATUS_LABELS;
      var statusControl = isAdmin
        ? '<select id="d-status">' + Object.keys(labels).map(function (k) {
            return '<option value="' + k + '"' + (r.status === k ? " selected" : "") + ">" + labels[k] + "</option>";
          }).join("") + "</select>"
        : chip(r.status, false);
      var ownerLine = isAdmin && r.owner
        ? '<span><strong>Kund:</strong> ' + esc(r.owner.full_name || r.owner.email) +
          (r.owner.company ? " (" + esc(r.owner.company) + ")" : "") + "</span>"
        : "";
      var previewBlock = "";
      if (r.preview_url) {
        previewBlock = '<div class="preview-box"><strong>Förhandsvisning:</strong> ' +
          '<a href="' + esc(r.preview_url) + '" target="_blank" rel="noopener">' + esc(r.preview_url) + "</a></div>";
      }
      var approveBlock = "";
      if (!isAdmin && r.status === "draft_ready") {
        approveBlock =
          '<div class="approve-box"><p><strong>Ditt förslag är klart!</strong> Titta på förhandsvisningen ovan. ' +
          "Nöjd? Godkänn så publicerar vi. Vill du justera något — skriv i dialogen nedan så tar vi ett varv till.</p>" +
          '<button id="btn-approve" class="btn btn-primary btn-inline">Godkänn förslaget</button></div>';
      }
      var agentBlock = "";
      if (isAdmin && ["new", "in_progress", "waiting_customer"].indexOf(r.status) !== -1) {
        agentBlock = '<button id="btn-agent" class="btn btn-primary btn-inline">🤖 Skicka till Claude</button>';
      }
      main.innerHTML =
        '<button class="back-link" id="btn-back">&larr; Tillbaka</button>' +
        '<div class="card detail-card">' +
        '<div class="page-head"><h1>' + esc(r.title) + "</h1>" + statusControl + "</div>" +
        '<div class="detail-meta"><span>#' + r.id + "</span><span>" + fmtDate(r.created_at) + "</span>" +
        '<span><strong>Prioritet:</strong> ' + esc(PRIO_LABELS[r.priority] || r.priority) + "</span>" +
        (r.page_url ? '<span><strong>Sida:</strong> ' + esc(r.page_url) + "</span>" : "") +
        ownerLine + "</div>" +
        '<div class="detail-desc">' + esc(r.description) + "</div>" +
        previewBlock + approveBlock + agentBlock +
        "</div>" +
        '<div class="card"><h2>Dialog</h2><div id="comments">' +
        (comments.length ? comments.map(function (c) {
          var isClaude = !c.author_id;
          var who = isClaude ? (c.author_label || "Claude") : (c.author ? (c.author.full_name || c.author.email) : "Okänd");
          var cls = isClaude ? " claude" : (c.author && c.author.is_admin ? " admin" : "");
          return '<div class="comment' + cls + '">' +
            '<div class="comment-head"><span class="who">' + esc(who) + "</span> · " + fmtDate(c.created_at) + "</div>" +
            '<div class="comment-body">' + esc(c.body) + "</div></div>";
        }).join("") : '<p class="muted">Inga meddelanden ännu.</p>') +
        "</div>" +
        '<form id="form-comment"><label for="c-body">Skriv ett meddelande</label>' +
        '<textarea id="c-body" required placeholder="Ställ en fråga eller lämna mer information…"></textarea>' +
        '<button type="submit" class="btn btn-primary btn-inline">Skicka</button></form></div>';

      document.getElementById("btn-back").addEventListener("click", function () { isAdmin ? renderAdmin() : renderCustomer(); });

      var btnApprove = document.getElementById("btn-approve");
      if (btnApprove) {
        btnApprove.addEventListener("click", function () {
          btnApprove.disabled = true;
          sb.from("requests").update({ status: "approved" }).eq("id", id).then(function (res) {
            if (res.error) { toast("Kunde inte godkänna: " + res.error.message, true); btnApprove.disabled = false; return; }
            toast("Tack! Förslaget är godkänt — vi publicerar inom kort.");
            renderDetail(id, isAdmin);
          });
        });
      }

      var btnAgent = document.getElementById("btn-agent");
      if (btnAgent) {
        btnAgent.addEventListener("click", function () {
          btnAgent.disabled = true;
          sb.from("agent_jobs").insert({ request_id: id, reason: "draft" }).then(function (res) {
            if (res.error) { toast("Kunde inte starta Claude: " + res.error.message, true); btnAgent.disabled = false; return; }
            sb.from("requests").update({ status: "in_progress" }).eq("id", id).then(function () {
              toast("Skickat till Claude — utkast eller frågor dyker upp i dialogen.");
              renderDetail(id, isAdmin);
            });
          });
        });
      }

      if (isAdmin) {
        document.getElementById("d-status").addEventListener("change", function (e) {
          sb.from("requests").update({ status: e.target.value }).eq("id", id).then(function (res) {
            if (res.error) toast("Kunde inte uppdatera status: " + res.error.message, true);
            else toast("Status uppdaterad.");
          });
        });
      }

      document.getElementById("form-comment").addEventListener("submit", function (e) {
        e.preventDefault();
        var body = document.getElementById("c-body").value.trim();
        if (!body) return;
        sb.from("request_comments").insert({ request_id: id, author_id: session.user.id, body: body }).then(function (res) {
          if (res.error) { toast("Kunde inte skicka: " + res.error.message, true); return; }
          renderDetail(id, isAdmin);
        });
      });
    });
  }

  // ---------- Adminvy ----------

  document.querySelectorAll("#admin-nav .tab").forEach(function (t) {
    t.addEventListener("click", function () {
      adminTab = t.getAttribute("data-tab");
      document.querySelectorAll("#admin-nav .tab").forEach(function (x) { x.classList.toggle("active", x === t); });
      renderAdmin();
    });
  });

  function renderAdmin() {
    if (adminTab === "kunder") return renderAdminCustomers();
    main.innerHTML =
      '<div class="page-head"><h1>Alla ärenden</h1>' +
      '<div class="filter-row"><select id="status-filter">' +
      '<option value="">Alla statusar</option>' +
      Object.keys(STATUS_LABELS_ADMIN).map(function (k) { return '<option value="' + k + '">' + STATUS_LABELS_ADMIN[k] + "</option>"; }).join("") +
      "</select></div></div>" +
      '<div id="req-list" class="req-list"><div class="spinner"></div></div>';
    document.getElementById("status-filter").addEventListener("change", function () { loadRequests(true); });
    loadRequests(true);
  }

  function renderAdminCustomers() {
    main.innerHTML = '<h1>Kunder</h1><p class="muted">Godkänn nya konton och koppla dem till rätt hemsida.</p><div id="cust-box"><div class="spinner"></div></div>';
    sb.from("profiles").select("*").order("created_at", { ascending: false }).then(function (res) {
      var box = document.getElementById("cust-box");
      if (res.error) { box.innerHTML = '<div class="empty">' + esc(res.error.message) + "</div>"; return; }
      var rows = (res.data || []).filter(function (p) { return !p.is_admin; });
      if (!rows.length) { box.innerHTML = '<div class="empty">Inga kundkonton ännu.</div>'; return; }
      box.innerHTML = '<table class="table"><thead><tr><th>Kund</th><th>Hemsida</th><th>GitHub-repo</th><th>Registrerad</th><th>Status</th></tr></thead><tbody>' +
        rows.map(function (p) {
          return "<tr data-id='" + esc(p.id) + "'>" +
            "<td><strong>" + esc(p.full_name || "—") + "</strong><br><span class='user-email'>" + esc(p.email) + "</span>" +
            (p.company ? "<br>" + esc(p.company) : "") + "</td>" +
            '<td><input type="text" class="inp-site" value="' + esc(p.website || "") + '" placeholder="dinsajt.se"></td>' +
            '<td><input type="text" class="inp-repo" value="' + esc(p.github_repo || "") + '" placeholder="ägare/repo"></td>' +
            "<td>" + fmtDate(p.created_at) + "</td>" +
            '<td><button class="btn btn-sm btn-inline ' + (p.approved ? "btn-google" : "btn-primary") + ' btn-approve">' +
            (p.approved ? "Stäng av" : "Godkänn") + "</button></td></tr>";
        }).join("") + "</tbody></table>";
      Array.prototype.forEach.call(box.querySelectorAll("tr[data-id]"), function (tr) {
        var pid = tr.getAttribute("data-id");
        var current = rows.find(function (p) { return p.id === pid; });
        tr.querySelector(".btn-approve").addEventListener("click", function () {
          sb.from("profiles").update({ approved: !current.approved }).eq("id", pid).then(function (res2) {
            if (res2.error) toast("Kunde inte uppdatera: " + res2.error.message, true);
            else { toast(current.approved ? "Kontot avstängt." : "Kontot godkänt."); renderAdminCustomers(); }
          });
        });
        tr.querySelector(".inp-site").addEventListener("change", function (e) {
          sb.from("profiles").update({ website: e.target.value.trim() || null }).eq("id", pid).then(function (res2) {
            if (res2.error) toast("Kunde inte spara hemsida: " + res2.error.message, true);
            else toast("Hemsida sparad.");
          });
        });
        tr.querySelector(".inp-repo").addEventListener("change", function (e) {
          sb.from("profiles").update({ github_repo: e.target.value.trim() || null }).eq("id", pid).then(function (res2) {
            if (res2.error) toast("Kunde inte spara repo: " + res2.error.message, true);
            else toast("GitHub-repo sparat.");
          });
        });
      });
    });
  }
})();
