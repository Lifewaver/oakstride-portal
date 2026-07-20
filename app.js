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
  var DEFAULT_PRICING = { site_price: 3000, drift_month: 150, rate_setup: 1095, rate_change: 1095 };
  var pricing = { site_price: 3000, drift_month: 150, rate_setup: 1095, rate_change: 1095 };

  // Villkoren renderas från de aktuella priserna. Ändras ett pris blir det en ny version.
  function buildAgreement(p) {
    var site = fmtKr(p.site_price), drift = fmtKr(p.drift_month), setup = fmtKr(p.rate_setup), change = fmtKr(p.rate_change);
    return {
      version: "2026-07-21a-" + p.site_price + "-" + p.drift_month + "-" + p.rate_setup + "-" + p.rate_change,
      title: "OakStrides kundvillkor",
      html: [
        "<h3>1. Om avtalet</h3>",
        '<p>Dessa villkor gäller mellan OakStride AB ("OakStride") och dig som kund för design, byggnation och löpande omhändertagande av din webbplats. De kompletterar det kundavtal med bilagor som tecknats mellan parterna; vid motstridighet gäller det undertecknade avtalet.</p>',
        "<h3>2. Standardwebbplats</h3>",
        "<p>En Standardwebbplats levereras till fast pris och omfattar upp till fem (5) sidor, mallbaserad och mobilanpassad design med din logotyp och dina färger, grundläggande SEO, ett kontaktformulär, koppling av din domän och e-post, inläggning av innehåll som du levererar färdigt, tre (3) uppstartsmöten samt ett (1) korrekturvarv. Arbete utöver detta (t.ex. fler sidor, e-handel, inloggning, specialfunktioner, flerspråkighet eller formgivning från grunden) ingår inte och debiteras per timme.</p>",
        "<h3>3. Priser (exkl. moms)</h3>",
        "<ul><li><strong>Standardwebbplats:</strong> " + site + " kr som engångskostnad, faktureras vid beställning.</li>" +
        "<li><strong>Löpande drift:</strong> " + drift + " kr/mån — hosting, DNS- och domänskötsel, certifikat, säkerhet, säkerhetskopiering och tillgång till kundportalen. Inga ändringar ingår i driften.</li>" +
        "<li><strong>Uppsättningsarbete utöver standardsidan:</strong> " + setup + " kr/timme (t.ex. e-postuppsättning eller specialfunktioner under bygget), enligt godkänd uppskattning.</li>" +
        "<li><strong>Ändringar och löpande arbete efter lansering:</strong> " + change + " kr/timme, minsta debitering 30 minuter per ärende och därefter per påbörjad kvart.</li>" +
        "<li><strong>Akut arbete utanför kontorstid:</strong> 1 995 kr/timme (på din begäran).</li>" +
        "<li><strong>Tredjepartskostnader:</strong> domänavgift, e-post (t.ex. Microsoft 365) och andra externa tjänster ingår inte utan betalas av dig till självkostnad — du kan även teckna dem själv.</li></ul>",
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
  }
  var AGREEMENT = buildAgreement(pricing);
  var custAgreement = AGREEMENT; // kundens effektiva villkor (per-kund-priser); sätts i loadOnboarding

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

  // 5-stegsflödet. form: steg 1 klart via projektförfrågan. offer: steg 3 = godkänn
  // kravspec/offert + villkor + faktureringsuppgifter. site: steg 4 = godkänn sida & konfig.
  var ONBOARDING_STEPS = [
    { title: "Projektförfrågan", desc: "Du fyller i vår projektförfrågan med din verksamhet, dina mål och exempel på sajter du gillar. Det är starten på resan.", form: true },
    { title: "Uppstartsmöte", desc: "Vi bokar och håller ett uppstartsmöte där vi går igenom din verksamhet, dina mål, din målgrupp och vad sidan ska göra.", cta: "Uppstartsmötet är genomfört" },
    { title: "Godkänn kravspecifikation & offert", desc: "Här godkänner du kravspecifikationen och offerten (i panelen längre ned) samt våra villkor, och lämnar faktureringsuppgifter. Vill du ändra något — skicka en kommentar först, så uppdaterar vi och du godkänner sedan.", offer: true },
    { title: "Godkänn sida & konfiguration", desc: "Vi bygger sidan och sätter upp konfigurationen. Granska och godkänn. Kommer du på något extra kan du skicka in det — då uppdaterar vi kravspecen/offerten och du godkänner den igen.", site: true },
    { title: "Lansering", desc: "Vi lanserar sidan på din domän och lämnar över till löpande drift. Allt är klart — grattis, nu är ni live!", cta: "Bekräfta lansering" }
  ];

  function fmtKr(n) { return Number(n).toLocaleString("sv-SE"); }
  function addonPrice(a) { return fmtKr(a.price) + " kr" + (a.billing === "manad" ? "/mån" : " (engång)"); }

  // ---------- Kravspecifikation (standardformat, versionerad) ----------

  var SPEC_SECTIONS = [
    { key: "mal", title: "Mål & syfte" },
    { key: "malgrupp", title: "Målgrupp" },
    { key: "design", title: "Ton & design" },
    { key: "sidor", title: "Sidstruktur" },
    { key: "funktioner", title: "Funktioner" },
    { key: "innehall", title: "Innehåll" },
    { key: "drift", title: "Domän, e-post & drift" },
    { key: "fortydliganden", title: "Förtydliganden & ändringar" },
    { key: "ovrigt", title: "Övriga noteringar" }
  ];
  function specItem(text, extra) { return { text: text, tier: extra ? "extra" : "standard" }; }
  // Standardmall — det som ingår i en standardsida är förifyllt (standard).
  function blankSpec() {
    var s = {};
    SPEC_SECTIONS.forEach(function (sec) { s[sec.key] = []; });
    s.sidor = [specItem("Startsida"), specItem("Tjänster"), specItem("Om oss"), specItem("Kontakt")];
    s.funktioner = [specItem("Kontaktformulär"), specItem("Mobilanpassad design"), specItem("Grundläggande SEO")];
    s.drift = [specItem("Drift & hosting av sidan")];
    return { sections: s };
  }
  // Lägg in projektförfrågan direkt i mallen.
  function specFromBrief(brief) {
    var d = blankSpec();
    if (brief) {
      if (brief.description) d.sections.mal.push(specItem("Från projektförfrågan: " + brief.description));
      if (brief.example_sites) d.sections.design.push(specItem("Referenssajter: " + brief.example_sites));
    }
    return d;
  }
  function specSectionToText(items) {
    return (items || []).map(function (i) { return (i.tier === "extra" ? "* " : "") + i.text; }).join("\n");
  }
  function textToSpecItems(text) {
    return String(text || "").split("\n").map(function (l) { return l.replace(/\s+$/, ""); }).filter(function (l) { return l.trim(); })
      .map(function (l) {
        var t = l.trim();
        if (t.indexOf("*") === 0) return specItem(t.replace(/^\*\s*/, ""), true);
        return specItem(t);
      });
  }
  function tierBadge(tier) {
    return tier === "extra" ? '<span class="tier tier-extra">Extra</span>' : '<span class="tier tier-standard">Standard</span>';
  }
  var SPEC_KIND_LABELS = { spec: "Specifikation", tech: "Tekniskt krav", change: "Ändring" };
  // Sidstruktur: varje sida har ev. underdetaljer (spec/tekniskt krav/ändring).
  function sidorToText(items) {
    return (items || []).map(function (p) {
      var line = (p.tier === "extra" ? "* " : "") + p.text;
      var det = (p.details || []).map(function (d) {
        return "  - " + (d.tier === "extra" ? "* " : "") + (d.kind && d.kind !== "spec" ? d.kind + ": " : "") + d.text;
      }).join("\n");
      return det ? line + "\n" + det : line;
    }).join("\n");
  }
  function textToSidor(text) {
    var pages = [];
    String(text || "").split("\n").forEach(function (raw) {
      var t = raw.trim();
      if (!t) return;
      if (t.charAt(0) === "-") {
        if (!pages.length) return;
        t = t.replace(/^-\s*/, "");
        var extra = false;
        if (t.charAt(0) === "*") { extra = true; t = t.replace(/^\*\s*/, ""); }
        var kind = "spec";
        var m = t.match(/^(spec|tech|change)\s*:\s*/i);
        if (m) { kind = m[1].toLowerCase(); t = t.slice(m[0].length); }
        var pg = pages[pages.length - 1];
        (pg.details = pg.details || []).push({ text: t.trim(), tier: extra ? "extra" : "standard", kind: kind });
      } else {
        var ex = false;
        if (t.charAt(0) === "*") { ex = true; t = t.replace(/^\*\s*/, ""); }
        pages.push({ text: t.trim(), tier: ex ? "extra" : "standard", details: [] });
      }
    });
    return pages;
  }
  function renderSpecPage(p) {
    var details = p.details || [];
    var inner = details.length
      ? '<ul class="spec-list">' + details.map(function (d) {
          return '<li><span><span class="spec-kind spec-kind-' + (d.kind || "spec") + '">' + esc(SPEC_KIND_LABELS[d.kind] || "Specifikation") + "</span> " + esc(d.text) + "</span> " + tierBadge(d.tier) + "</li>";
        }).join("") + "</ul>"
      : '<p class="muted spec-empty">Inga specifikationer eller ändringar ännu.</p>';
    return '<details class="spec-page"><summary class="spec-page-sum"><span class="spec-page-name">' + esc(p.text) + "</span> " + tierBadge(p.tier) +
      '<span class="spec-page-chev" aria-hidden="true">▾</span></summary><div class="spec-page-body">' + inner + "</div></details>";
  }
  function fmtHours(n) { return Number(n || 0).toLocaleString("sv-SE"); }
  function periodSuffix(p) { return p === "manad" ? "/mån" : (p === "ar" ? "/år" : (p === "engang" ? " (engång)" : "")); }
  function parsePeriod(s) {
    s = String(s || "").trim().toLowerCase();
    if (s.indexOf("mån") === 0 || s === "manad" || s === "mån") return "manad";
    if (s.indexOf("år") === 0 || s === "ar" || s === "år") return "ar";
    if (s.indexOf("eng") === 0) return "engang";
    return "";
  }
  function extraHoursToText(arr) {
    return (arr || []).map(function (i) { return i.label + " | " + fmtHours(i.hours); }).join("\n");
  }
  function textToExtraHours(text) {
    return String(text || "").split("\n").filter(function (l) { return l.trim(); }).map(function (l) {
      var p = l.split("|");
      return { label: (p[0] || "").trim(), hours: parseFloat(String(p[1] || "").replace(",", ".").trim()) || 0 };
    }).filter(function (i) { return i.label; });
  }
  function recurringToText(arr) {
    return (arr || []).map(function (i) {
      var per = i.period === "manad" ? "mån" : (i.period === "ar" ? "år" : (i.period === "engang" ? "engång" : ""));
      return i.label + " | " + (i.amount == null ? "" : i.amount) + (per ? " | " + per : "");
    }).join("\n");
  }
  function textToRecurring(text) {
    return String(text || "").split("\n").filter(function (l) { return l.trim(); }).map(function (l) {
      var p = l.split("|");
      var amt = parseFloat(String(p[1] || "").replace(",", ".").replace(/\s/g, ""));
      return { label: (p[0] || "").trim(), amount: isNaN(amt) ? null : amt, period: parsePeriod(p[2]) };
    }).filter(function (i) { return i.label; });
  }
  function domainText(dom) {
    if (!dom) return "";
    if (dom.status === "egen") return "Egen domän" + (dom.name ? " (" + dom.name + ")" : "");
    if (dom.status === "behover") return "Behöver hjälp att införskaffa" + (dom.name ? " (önskad: " + dom.name + ")" : "");
    return dom.name || "";
  }
  // Kravspecen indelad i avsnitt.
  var SPEC_AVSNITT = [
    { n: 1, title: "Syfte & mål", keys: ["mal", "malgrupp"] },
    { n: 2, title: "Sidan & innehåll", keys: ["design", "sidor", "funktioner", "innehall", "fortydliganden", "ovrigt"], cost: "build" },
    { n: 3, title: "Drift", keys: ["drift"], domain: true, cost: "drift" }
  ];
  function specSecTitle(key) { for (var i = 0; i < SPEC_SECTIONS.length; i++) { if (SPEC_SECTIONS[i].key === key) return SPEC_SECTIONS[i].title; } return key; }
  function specSitePrice(d) { return d && d.pricing && d.pricing.site != null && d.pricing.site !== "" ? Number(d.pricing.site) : Number(pricing.site_price); }
  function specDriftPrice(d) { return d && d.pricing && d.pricing.drift != null && d.pricing.drift !== "" ? Number(d.pricing.drift) : Number(pricing.drift_month); }
  function specRateSetup(d) { return d && d.pricing && d.pricing.rate_setup != null && d.pricing.rate_setup !== "" ? Number(d.pricing.rate_setup) : Number(pricing.rate_setup); }
  function specRateChange(d) { return d && d.pricing && d.pricing.rate_change != null && d.pricing.rate_change !== "" ? Number(d.pricing.rate_change) : Number(pricing.rate_change); }
  // Effektiv prisbild per kund = kravspecens överskrivningar, annars standardpriserna.
  function effectivePricing(d) { return { site_price: specSitePrice(d), drift_month: specDriftPrice(d), rate_setup: specRateSetup(d), rate_change: specRateChange(d) }; }
  function specSecInner(key, sections) {
    var items = sections[key] || [];
    if (key === "sidor") return items.length ? '<div class="spec-pages">' + items.map(renderSpecPage).join("") + "</div>" : '<p class="muted spec-empty">Fylls i efter hand.</p>';
    return items.length ? '<ul class="spec-list">' + items.map(function (i) { return "<li><span>" + esc(i.text) + "</span> " + tierBadge(i.tier) + "</li>"; }).join("") + "</ul>" : '<p class="muted spec-empty">Fylls i efter hand.</p>';
  }
  // Läsvy av kravspecen, indelad i avsnitt (kund + admin-förhandsvisning).
  function renderSpecView(data, orderedAddons, versionLabel) {
    var sections = (data && data.sections) || {};
    var addons = orderedAddons || [];
    var html = '<div class="spec">';
    if (versionLabel) html += '<div class="spec-ver">' + versionLabel + "</div>";
    html += '<p class="spec-legend">' + tierBadge("standard") + " ingår i standardsidan · " + tierBadge("extra") + " är tillval utöver standard.</p>";
    SPEC_AVSNITT.forEach(function (av) {
      html += '<section class="spec-avsnitt"><h3 class="spec-avsnitt-h"><span class="spec-avsnitt-n">' + av.n + "</span>" + esc(av.title) + "</h3>";
      if (av.domain) {
        var dom = data && data.domain;
        html += '<div class="spec-sec"><h4>Domän</h4>' +
          ((dom && (dom.status || dom.name)) ? '<ul class="spec-list"><li><span>' + esc(domainText(dom)) + "</span></li></ul>" : '<p class="muted spec-empty">Fylls i efter hand.</p>') + "</div>";
      }
      av.keys.forEach(function (key) {
        html += '<div class="spec-sec"><h4>' + esc(specSecTitle(key)) + "</h4>" + specSecInner(key, sections) + "</div>";
      });
      if (av.cost === "build") {
        var sitePrice = specSitePrice(data);
        var rSetup = specRateSetup(data);
        var eh = (data && data.extra_hours) || [];
        var totalH = eh.reduce(function (s, i) { return s + (Number(i.hours) || 0); }, 0);
        var engAddons = addons.filter(function (a) { return a.billing !== "manad"; });
        var engSum = engAddons.reduce(function (s, a) { return s + Number(a.price || 0); }, 0);
        var totalEng = sitePrice + Math.round(totalH * rSetup) + engSum;
        html += '<div class="spec-cost-box"><h4>Kostnad — engång (exkl. moms)</h4><ul class="spec-cost-list">' +
          "<li><span>Standardsida</span><span>" + fmtKr(sitePrice) + " kr</span></li>" +
          eh.map(function (i) { return "<li><span>" + esc(i.label) + " (" + fmtHours(i.hours) + " tim)</span><span>" + fmtKr(Math.round((Number(i.hours) || 0) * rSetup)) + " kr</span></li>"; }).join("") +
          engAddons.map(function (a) { return "<li><span>" + esc(a.title) + "</span><span>" + fmtKr(a.price) + " kr</span></li>"; }).join("") +
          '<li class="spec-cost-sum"><span>Summa engång</span><span>' + fmtKr(totalEng) + " kr</span></li></ul>" +
          (eh.length ? '<p class="muted spec-note">Extra arbete debiteras per nedlagd timme à ' + fmtKr(rSetup) + " kr; beloppet ovan är en uppskattning.</p>" : "") + "</div>";
      } else if (av.cost === "drift") {
        var driftPrice = specDriftPrice(data);
        var manAddons = addons.filter(function (a) { return a.billing === "manad"; });
        var manSum = manAddons.reduce(function (s, a) { return s + Number(a.price || 0); }, 0);
        var rc = (data && data.recurring_costs) || [];
        html += '<div class="spec-cost-box"><h4>Löpande kostnad</h4><ul class="spec-cost-list">' +
          "<li><span>Drift &amp; hosting</span><span>" + fmtKr(driftPrice) + " kr/mån</span></li>" +
          manAddons.map(function (a) { return "<li><span>" + esc(a.title) + "</span><span>" + fmtKr(a.price) + " kr/mån</span></li>"; }).join("") +
          '<li class="spec-cost-sum"><span>OakStride löpande</span><span>' + fmtKr(driftPrice + manSum) + " kr/mån</span></li></ul>" +
          (rc.length
            ? '<h4 class="spec-cost-sub">Tredjepart (självkostnad)</h4><ul class="spec-cost-list">' +
              rc.map(function (i) { return "<li><span>" + esc(i.label) + "</span><span>" + (i.amount == null || i.amount === "" ? "" : fmtKr(i.amount) + " kr" + periodSuffix(i.period)) + "</span></li>"; }).join("") +
              '</ul><p class="muted spec-note">Vidarefaktureras till självkostnad.</p>'
            : "") +
          '<p class="muted spec-note">Ändringar och löpande arbete efter lansering debiteras ' + fmtKr(specRateChange(data)) + " kr/tim.</p></div>";
      }
      html += "</section>";
    });
    return html + "</div>";
  }

  // ---- Strukturerad kravspec-editor (admin) ----
  function seTierBtn(tier) {
    var t = tier === "extra" ? "extra" : "standard";
    return '<button type="button" class="se-tier se-tier-' + t + '" data-tier="' + t + '">' + (t === "extra" ? "Extra" : "Standard") + "</button>";
  }
  function seDel(title) { return '<button type="button" class="se-del" title="' + (title || "Ta bort") + '">&times;</button>'; }
  function seItemRow(text, tier) {
    return '<div class="se-row"><input type="text" class="se-text" value="' + esc(text || "") + '">' + seTierBtn(tier) + seDel() + "</div>";
  }
  function seDetailRow(d) {
    d = d || {};
    var kinds = [["spec", "Specifikation"], ["tech", "Tekniskt krav"], ["change", "Ändring"]];
    var opts = kinds.map(function (k) { return '<option value="' + k[0] + '"' + ((d.kind || "spec") === k[0] ? " selected" : "") + ">" + k[1] + "</option>"; }).join("");
    return '<div class="se-drow"><input type="text" class="se-dtext" value="' + esc(d.text || "") + '" placeholder="Specifikation / krav / ändring">' +
      '<select class="se-kind">' + opts + "</select>" + seTierBtn(d.tier) + seDel() + "</div>";
  }
  function sePage(p) {
    p = p || {};
    var details = (p.details || []).map(seDetailRow).join("");
    return '<div class="se-page"><div class="se-row se-pagehead"><input type="text" class="se-pagename" value="' + esc(p.text || "") + '" placeholder="Sidnamn">' +
      seTierBtn(p.tier) + seDel("Ta bort sida") + "</div>" +
      '<div class="se-details">' + details + "</div>" +
      '<button type="button" class="se-add-detail linklike">+ Lägg till detalj</button></div>';
  }
  function seExtraRow(i) {
    i = i || {};
    return '<div class="se-row"><input type="text" class="se-eh-label" value="' + esc(i.label || "") + '" placeholder="Beskrivning (t.ex. Uppsättning av e-post)">' +
      '<input type="text" class="se-eh-hours" value="' + esc(i.hours != null && i.hours !== "" ? fmtHours(i.hours) : "") + '" placeholder="tim">' + seDel() + "</div>";
  }
  function seRecRow(i) {
    i = i || {};
    var periods = [["", "—"], ["manad", "/mån"], ["ar", "/år"], ["engang", "engång"]];
    var opts = periods.map(function (p) { return '<option value="' + p[0] + '"' + ((i.period || "") === p[0] ? " selected" : "") + ">" + p[1] + "</option>"; }).join("");
    return '<div class="se-row"><input type="text" class="se-rc-label" value="' + esc(i.label || "") + '" placeholder="Beskrivning">' +
      '<input type="text" class="se-rc-amount" value="' + esc(i.amount != null && i.amount !== "" ? i.amount : "") + '" placeholder="kr">' +
      '<select class="se-rc-period">' + opts + "</select>" + seDel() + "</div>";
  }
  function specEditorHtml(d) {
    var sections = d.sections || {};
    var dom = d.domain || {};
    var html = '<div class="spec-ed">';
    SPEC_AVSNITT.forEach(function (av) {
      html += '<div class="se-avsnitt"><div class="se-avsnitt-h"><span class="spec-avsnitt-n">' + av.n + "</span>" + esc(av.title) + "</div>";
      if (av.domain) {
        html += '<div class="se-sec"><h4>Domän</h4><div class="addon-form-row">' +
          '<div><select id="spec-domain"><option value="">—</option>' +
          '<option value="egen"' + (dom.status === "egen" ? " selected" : "") + ">Egen domän</option>" +
          '<option value="behover"' + (dom.status === "behover" ? " selected" : "") + ">Behöver hjälp att införskaffa</option></select></div>" +
          '<div style="flex:2"><input type="text" id="spec-domain-name" placeholder="domännamn (t.ex. exempel.se)" value="' + esc(dom.name || "") + '"></div></div></div>';
      }
      av.keys.forEach(function (key) {
        html += '<div class="se-sec" data-key="' + key + '"><h4>' + esc(specSecTitle(key)) + "</h4>";
        if (key === "sidor") {
          html += '<div class="se-pages">' + (sections.sidor || []).map(sePage).join("") + "</div>" +
            '<button type="button" class="se-add-page btn btn-ghost btn-sm">+ Lägg till sida</button>';
        } else {
          html += '<div class="se-rows">' + (sections[key] || []).map(function (i) { return seItemRow(i.text, i.tier); }).join("") + "</div>" +
            '<button type="button" class="se-add-item btn btn-ghost btn-sm">+ Lägg till rad</button>';
        }
        html += "</div>";
      });
      if (av.cost === "build") {
        html += '<div class="se-price-row"><div class="se-sec"><h4>Grundpris standardsida (kr, engång)</h4><input type="text" id="spec-site-price" class="se-price" value="' + esc(specSitePrice(d)) + '"></div>' +
          '<div class="se-sec"><h4>Timpris uppsättning (kr/tim)</h4><input type="text" id="spec-rate-setup" class="se-price" value="' + esc(specRateSetup(d)) + '"></div></div>' +
          '<div class="se-sec" data-block="extra"><h4>Extra arbete (' + fmtKr(specRateSetup(d)) + ' kr/tim)</h4>' +
          '<div class="se-rows se-rows-extra">' + (d.extra_hours || []).map(seExtraRow).join("") + "</div>" +
          '<button type="button" class="se-add-extra btn btn-ghost btn-sm">+ Lägg till rad</button></div>';
      } else if (av.cost === "drift") {
        html += '<div class="se-price-row"><div class="se-sec"><h4>Driftavgift (kr/mån)</h4><input type="text" id="spec-drift-price" class="se-price" value="' + esc(specDriftPrice(d)) + '"></div>' +
          '<div class="se-sec"><h4>Timpris ändringar &amp; drift (kr/tim)</h4><input type="text" id="spec-rate-change" class="se-price" value="' + esc(specRateChange(d)) + '"></div></div>' +
          '<div class="se-sec" data-block="recurring"><h4>Löpande kostnader (självkostnad)</h4>' +
          '<div class="se-rows se-rows-rec">' + (d.recurring_costs || []).map(seRecRow).join("") + "</div>" +
          '<button type="button" class="se-add-recurring btn btn-ghost btn-sm">+ Lägg till rad</button></div>';
      }
      html += "</div>";
    });
    return html + "</div>";
  }
  function readSpecEditor(root) {
    var sections = {};
    SPEC_SECTIONS.forEach(function (sec) {
      var secEl = root.querySelector('.se-sec[data-key="' + sec.key + '"]');
      if (!secEl) { sections[sec.key] = []; return; }
      if (sec.key === "sidor") {
        sections.sidor = Array.prototype.map.call(secEl.querySelectorAll(".se-page"), function (pg) {
          var details = Array.prototype.map.call(pg.querySelectorAll(".se-drow"), function (dr) {
            return { text: dr.querySelector(".se-dtext").value.trim(), kind: dr.querySelector(".se-kind").value, tier: dr.querySelector(".se-tier").getAttribute("data-tier") };
          }).filter(function (x) { return x.text; });
          return { text: pg.querySelector(".se-pagename").value.trim(), tier: pg.querySelector(".se-pagehead .se-tier").getAttribute("data-tier"), details: details };
        }).filter(function (p) { return p.text; });
      } else {
        sections[sec.key] = Array.prototype.map.call(secEl.querySelectorAll(".se-row"), function (r) {
          return { text: r.querySelector(".se-text").value.trim(), tier: r.querySelector(".se-tier").getAttribute("data-tier") };
        }).filter(function (x) { return x.text; });
      }
    });
    var domStatus = root.querySelector("#spec-domain").value;
    var domName = root.querySelector("#spec-domain-name").value.trim();
    function priceOf(id) { var el = root.querySelector(id); if (!el || el.value.trim() === "") return null; var v = parseFloat(el.value.replace(",", ".").replace(/\s/g, "")); return isNaN(v) ? null : v; }
    var specPricing = { site: priceOf("#spec-site-price"), drift: priceOf("#spec-drift-price"), rate_setup: priceOf("#spec-rate-setup"), rate_change: priceOf("#spec-rate-change") };
    var extra = Array.prototype.map.call(root.querySelectorAll('[data-block="extra"] .se-row'), function (r) {
      return { label: r.querySelector(".se-eh-label").value.trim(), hours: parseFloat(String(r.querySelector(".se-eh-hours").value).replace(",", ".")) || 0 };
    }).filter(function (x) { return x.label; });
    var recurring = Array.prototype.map.call(root.querySelectorAll('[data-block="recurring"] .se-row'), function (r) {
      var amt = parseFloat(String(r.querySelector(".se-rc-amount").value).replace(",", ".").replace(/\s/g, ""));
      return { label: r.querySelector(".se-rc-label").value.trim(), amount: isNaN(amt) ? null : amt, period: r.querySelector(".se-rc-period").value };
    }).filter(function (x) { return x.label; });
    return {
      sections: sections,
      domain: (domStatus || domName) ? { status: domStatus || null, name: domName || null } : null,
      extra_hours: extra,
      recurring_costs: recurring,
      pricing: specPricing
    };
  }
  function wireSpecEditor(root) {
    var ed = root.querySelector(".spec-ed");
    if (!ed) return;
    ed.addEventListener("click", function (e) {
      var t = e.target;
      if (t.classList.contains("se-tier")) {
        var next = t.getAttribute("data-tier") === "extra" ? "standard" : "extra";
        t.setAttribute("data-tier", next);
        t.className = "se-tier se-tier-" + next;
        t.textContent = next === "extra" ? "Extra" : "Standard";
      } else if (t.classList.contains("se-del")) {
        var row = t.closest(".se-drow") || t.closest(".se-page") || t.closest(".se-row");
        if (row) row.parentNode.removeChild(row);
      } else if (t.classList.contains("se-add-item")) {
        t.previousElementSibling.insertAdjacentHTML("beforeend", seItemRow("", "standard"));
      } else if (t.classList.contains("se-add-page")) {
        t.previousElementSibling.insertAdjacentHTML("beforeend", sePage({}));
      } else if (t.classList.contains("se-add-detail")) {
        t.previousElementSibling.insertAdjacentHTML("beforeend", seDetailRow({}));
      } else if (t.classList.contains("se-add-extra")) {
        t.previousElementSibling.insertAdjacentHTML("beforeend", seExtraRow({}));
      } else if (t.classList.contains("se-add-recurring")) {
        t.previousElementSibling.insertAdjacentHTML("beforeend", seRecRow({}));
      }
    });
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
    loadPricing().then(loadProfileAndRoute);
  });

  function loadPricing() {
    return sb.from("pricing_settings").select("*").eq("id", 1).maybeSingle().then(function (r) {
      if (r && r.data) {
        pricing = { site_price: Number(r.data.site_price), drift_month: Number(r.data.drift_month), rate_setup: Number(r.data.rate_setup), rate_change: Number(r.data.rate_change) };
        AGREEMENT = buildAgreement(pricing);
      }
    }, function () {});
  }

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
      // Admin (och admin i "visa som kund"-läge) visar admin/kundvy direkt.
      if (profile.is_admin) { if (viewAsCustomer) renderCustomer(); else renderAdmin(); return; }
      // Kunder släpps in direkt; villkoren godkänns inuti uppstartsflödet (se loadOnboarding).
      renderCustomer();
    });
  }

  // ---------- Villkorsgodkännande (inuti flödet) ----------

  function acceptTerms(btn) {
    btn.disabled = true;
    sha256Hex(custAgreement.version + "\n" + custAgreement.html).then(function (hash) {
      sb.from("agreement_acceptances").insert({
        user_id: session.user.id,
        agreement_version: custAgreement.version,
        document_title: custAgreement.title,
        document_hash: hash,
        user_agent: navigator.userAgent
      }).then(function (res) {
        if (res.error && res.error.code !== "23505") {
          var n = document.getElementById("agree-status");
          if (n) { n.hidden = false; n.className = "status-note error"; n.textContent = "Kunde inte spara: " + res.error.message; }
          btn.disabled = false; return;
        }
        toast("Tack! Villkoren är godkända.");
        loadOnboarding();
      });
    });
  }

  function renderTermsView(back) {
    main.innerHTML =
      '<button class="back-link" id="btn-back">&larr; Tillbaka</button>' +
      '<div class="card"><h1>' + esc(custAgreement.title) + "</h1>" +
      '<p class="muted">Version ' + esc(custAgreement.version) + "</p>" +
      '<div class="agreement-box">' + custAgreement.html + "</div></div>";
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

  document.getElementById("btn-account").addEventListener("click", renderAccount);

  function renderAccount() {
    show("app");
    main.innerHTML = '<div class="spinner"></div>';
    sb.from("billing_details").select("*").eq("user_id", session.user.id).maybeSingle().then(function (res) {
      var b = (res && res.data) ? res.data : {};
      function f(id, label, val, ph, type) { return '<label for="' + id + '">' + esc(label) + '</label><input type="' + (type || "text") + '" id="' + id + '" value="' + esc(val || "") + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">"; }
      main.innerHTML =
        '<button class="back-link" id="btn-acc-back">&larr; Tillbaka</button>' +
        '<div class="card" style="max-width:600px"><h1>Mina uppgifter</h1>' +
        '<form id="form-account">' +
        '<h2>Kontouppgifter</h2>' +
        f("acc-name", "Namn", profile.full_name) +
        f("acc-company", "Företag", profile.company) +
        f("acc-email", "E-post (inloggning)", profile.email, "", "email") +
        '<p class="muted onb-hint-sm">Byter du e-post skickas en bekräftelselänk till den nya adressen — bytet sker först när du bekräftat där.</p>' +
        '<h2 style="margin-top:1.4rem">Faktureringsuppgifter</h2>' +
        f("bill-company", "Företagsnamn", b.company) +
        f("bill-org", "Org.nr", b.org_nr, "556000-0000") +
        f("bill-addr", "Fakturaadress", b.address) +
        f("bill-postcity", "Postnr & ort", b.postal_city) +
        f("bill-email", "Fakturamejl", b.invoice_email, "faktura@foretag.se") +
        f("bill-ref", "Er referens / inköpsordernr", b.reference) +
        '<button type="submit" class="btn btn-primary btn-inline">Spara</button>' +
        '<p id="acc-status" class="status-note" hidden></p></form></div>';
      document.getElementById("btn-acc-back").addEventListener("click", function () {
        if (profile.is_admin && !viewAsCustomer) renderAdmin(); else renderCustomer();
      });
      document.getElementById("form-account").addEventListener("submit", function (e) {
        e.preventDefault();
        var note = document.getElementById("acc-status");
        function v(id) { var el = document.getElementById(id); return el ? (el.value || "").trim() : ""; }
        var newName = v("acc-name") || null, newCompany = v("acc-company") || null, newEmail = v("acc-email");
        var bill = { user_id: session.user.id, company: v("bill-company") || null, org_nr: v("bill-org") || null, address: v("bill-addr") || null, postal_city: v("bill-postcity") || null, invoice_email: v("bill-email") || null, reference: v("bill-ref") || null, updated_at: new Date().toISOString() };
        Promise.all([
          sb.from("profiles").update({ full_name: newName, company: newCompany }).eq("id", session.user.id),
          sb.from("billing_details").upsert(bill)
        ]).then(function (rs) {
          var err = (rs[0] && rs[0].error) || (rs[1] && rs[1].error);
          if (err) { note.hidden = false; note.className = "status-note error"; note.textContent = "Kunde inte spara: " + err.message; return; }
          profile.full_name = newName; profile.company = newCompany;
          if (newEmail && newEmail !== profile.email) {
            sb.auth.updateUser({ email: newEmail }).then(function (er) {
              note.hidden = false;
              if (er.error) { note.className = "status-note error"; note.textContent = "Uppgifter sparade, men e-post kunde inte ändras: " + er.error.message; }
              else { note.className = "status-note"; note.textContent = "Sparat! En bekräftelselänk har skickats till " + newEmail + " — e-posten byts när du bekräftat."; }
            });
          } else {
            note.hidden = false; note.className = "status-note"; note.textContent = "Uppgifterna är sparade.";
          }
        });
      });
    });
  }

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
      '<div id="onboarding-box"></div>' +
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
      '<p><a href="mailto:info@oakstride.se">info@oakstride.se</a> &middot; <a href="tel:+46702371704">070-237 17 04</a></p></div>';
    document.getElementById("btn-new").addEventListener("click", renderNewRequestForm);
    document.getElementById("btn-new2").addEventListener("click", renderNewRequestForm);
    loadRequests(false);
    loadStats(site);
    loadOnboarding();
  }

  // Öppnar innehåll i ett eget fönster med portalens stilmall (kravspec, villkor).
  function openPopupDoc(title, heading, innerHtml) {
    var w = window.open("", "oakpopup", "width=640,height=860,scrollbars=yes");
    if (!w) { toast("Tillåt popup-fönster för att öppna.", true); return; }
    var css = location.origin + "/styles.css";
    w.document.open();
    w.document.write('<!doctype html><html lang="sv"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      "<title>" + esc(title) + "</title>" +
      '<link rel="stylesheet" href="' + css + '">' +
      "<style>body{background:#f4f6f4;margin:0;padding:1.2rem}.pvwrap{max-width:660px;margin:0 auto}h1{font-size:1.15rem;color:#1e3a2f;margin:0 0 1rem}</style></head>" +
      '<body><div class="pvwrap"><h1>' + esc(heading) + "</h1>" + innerHtml + "</div></body></html>");
    w.document.close();
  }
  function openSpecWindow(data, ordered, versionLabel) {
    openPopupDoc("Kravspecifikation & offert", "Din kravspecifikation & offert", '<div class="card spec-card">' + renderSpecView(data, ordered, versionLabel) + "</div>");
  }
  function openTermsWindow(ag) {
    openPopupDoc("OakStrides kundvillkor", esc(ag.title) + " (version " + esc(ag.version) + ")", '<div class="card"><div class="agreement-box">' + ag.html + "</div></div>");
  }

  function loadOnboarding() {
    var box = document.getElementById("onboarding-box");
    if (!box) return;
    Promise.all([
      sb.from("addons").select("*").eq("user_id", session.user.id).order("created_at"),
      sb.from("agreement_acceptances").select("agreement_version").eq("user_id", session.user.id),
      sb.from("onboarding_checkoffs").select("step_no, done_at").eq("user_id", session.user.id),
      sb.from("project_briefs").select("description, example_sites, created_at").eq("email", profile.email).order("created_at", { ascending: false }),
      sb.from("onboarding_content").select("step_no, body, link").eq("user_id", session.user.id),
      sb.from("requirement_specs").select("*").eq("user_id", session.user.id).order("version", { ascending: false }),
      sb.from("extra_work_approvals").select("spec_version").eq("user_id", session.user.id),
      sb.from("billing_details").select("*").eq("user_id", session.user.id).maybeSingle()
    ]).then(function (out) {
      if (!box.isConnected) return;
      var addons = out[0].error ? [] : (out[0].data || []);
      var checkoffs = out[2].error ? [] : (out[2].data || []);
      var briefs = out[3].error ? [] : (out[3].data || []);
      var brief = briefs[0] || null;
      var content = {}; (out[4].error ? [] : (out[4].data || [])).forEach(function (r) { content[r.step_no] = r; });
      var specs = out[5].error ? [] : (out[5].data || []);
      var spec = specs[0] || null;
      custAgreement = buildAgreement(effectivePricing(spec ? spec.data : null));
      var acceptVersions = (out[1].error ? [] : (out[1].data || [])).map(function (a) { return a.agreement_version; });
      var termsAccepted = acceptVersions.indexOf(custAgreement.version) !== -1;
      var approvals = out[6].error ? [] : (out[6].data || []);
      // Har kunden godkänt AKTUELL kravspec/offert-version?
      var offerCurrentApproved = !!(spec && approvals.some(function (a) { return a.spec_version === spec.version; }));
      var hasApprovedOffer = approvals.length > 0;      // godkänt någon offertversion (steg 3)
      var hasAcceptedTerms = acceptVersions.length > 0; // godkänt villkoren någon gång (steg 3)
      var billing = (out[7] && out[7].data) ? out[7].data : null;
      var billingComplete = !!(billing && billing.company && billing.org_nr && billing.invoice_email);
      var ordered = addons.filter(function (a) { return a.status === "ordered"; });
      var done = {}; checkoffs.forEach(function (r) { done[r.step_no] = r.done_at; });

      function utkastReady() { var c = content[5]; return !!(c && (c.link || c.body)); }
      function isDone(n) {
        if (n === 1) return !!brief;
        if (n === 3) return !!(spec && hasApprovedOffer && hasAcceptedTerms && billingComplete);
        if (n === 4) return !!(done[4] && offerCurrentApproved);
        return !!done[n];
      }
      var current = 0;
      for (var k = 1; k <= ONBOARDING_STEPS.length; k++) { if (!isDone(k)) { current = k; break; } }
      var allDone = current === 0;

      function clarFormHtml() {
        var pages = (((spec.data || {}).sections || {}).sidor || []).map(function (i) { return i.text; });
        var opts = '<option value="Hela siten">Hela siten</option>' + pages.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + "</option>"; }).join("");
        return '<div class="onb-clar"><label for="clar-scope">Skicka en kommentar eller ändring</label>' +
          '<div class="onb-clar-row"><span class="onb-clar-lbl">Gäller:</span><select id="clar-scope">' + opts + "</select></div>" +
          '<textarea id="clar-text" rows="3" placeholder="Beskriv vad du vill ändra eller lägga till..."></textarea>' +
          '<div class="onb-note-row"><button class="btn btn-ghost btn-sm" data-clar="1">Skicka</button>' +
          '<span class="muted onb-clar-hint">Dokumenteras i kravspecen som en ny version — du godkänner sedan den uppdaterade offerten.</span></div></div>';
      }
      function billingFormHtml(b) {
        b = b || {};
        function f(id, label, val, ph) { return '<label for="' + id + '">' + esc(label) + "</label><input type=\"text\" id=\"" + id + '" value="' + esc(val || "") + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">"; }
        return '<div class="onb-billing"><h4>Faktureringsuppgifter</h4>' +
          f("bill-company", "Företagsnamn *", b.company) +
          f("bill-org", "Org.nr *", b.org_nr, "556000-0000") +
          f("bill-addr", "Fakturaadress", b.address) +
          f("bill-postcity", "Postnr & ort", b.postal_city) +
          f("bill-email", "Fakturamejl *", b.invoice_email, "faktura@foretag.se") +
          f("bill-ref", "Er referens / inköpsordernr", b.reference) + "</div>";
      }

      var html = '<div class="card onb-card"><h2>Din resa mot en ny sida</h2>' +
        '<p class="muted">' + (allDone ? "Alla steg är klara — grattis!" : "Öppna varje steg för att se vad som gäller. Du kan alltid gå tillbaka och se vad du bockat av.") + "</p>" +
        '<div class="onb-acc">' + ONBOARDING_STEPS.map(function (s, i) {
          var n = i + 1, dn = isDone(n), cur = (n === current);
          var cls = dn ? "done" : (cur ? "current" : "upcoming");
          var meta = dn ? '<span class="onb-acc-meta">✓ klart</span>' : (cur ? '<span class="onb-acc-meta">Pågår</span>' : "");
          var body = '<div class="onb-step-desc">' + esc(s.desc) + "</div>";

          if (s.form) {
            body += brief
              ? '<div class="onb-content-block"><strong>Din projektförfrågan</strong>' +
                '<div class="detail-desc">' + esc(brief.description) + "</div>" +
                (brief.example_sites ? '<p style="margin:.5rem 0 .2rem"><strong>Exempelsajter:</strong></p><div class="detail-desc">' + esc(brief.example_sites) + "</div>" : "") + "</div>"
              : '<p class="muted">Vi hittar ingen projektförfrågan på din e-post ännu. Hör av dig till info@oakstride.se så hjälper vi dig.</p>';
          }

          if (s.offer) {
            var docBtns = '<div class="onb-docs"><button type="button" class="btn btn-ghost btn-sm js-open-spec">Öppna kravspecifikation &amp; offert &#8599;</button>' +
              '<button type="button" class="btn btn-ghost btn-sm js-open-terms">Öppna villkoren &#8599;</button></div>';
            if (!spec) {
              body += '<p class="muted">Kravspecifikationen och offerten sammanställs av OakStride efter uppstartsmötet. Du får ett mejl när den är redo att godkänna.</p>';
            } else if (dn) {
              body += '<p class="onb-verified">✓ Du har godkänt kravspecifikationen/offerten (v' + spec.version + ") och villkoren (v " + esc(custAgreement.version) + ").</p>" +
                docBtns +
                '<div class="onb-content-block"><strong>Faktureringsuppgifter</strong>' + esc(billing.company) +
                (billing.org_nr ? " · " + esc(billing.org_nr) : "") + (billing.invoice_email ? "<br>" + esc(billing.invoice_email) : "") + "</div>";
            } else if (cur) {
              if (content[3] && content[3].body) body += '<div class="onb-content-block"><strong>Sammanfattning från uppstartsmötet</strong>' + esc(content[3].body).replace(/\n/g, "<br>") + "</div>";
              body += '<p class="muted">Läs igenom kravspecifikationen/offerten och våra villkor nedan, och godkänn. Vill du ändra något — skicka en kommentar först.</p>' +
                docBtns +
                clarFormHtml() +
                '<label class="agree-check"><input type="checkbox" id="agree-cb"> <span>Jag har läst och godkänner kravspecifikationen/offerten (v' + spec.version + ") och OakStrides kundvillkor (version " + esc(custAgreement.version) + ").</span></label>" +
                billingFormHtml(billing) +
                '<button id="btn-approve-offer" class="btn btn-primary btn-inline" disabled>Godkänn offert &amp; villkor</button>';
            } else {
              body += '<p class="muted">Blir aktivt när föregående steg är klart.</p>';
            }
          }

          if (s.site) {
            if (!utkastReady()) {
              body += '<p class="muted">Sidan och konfigurationen byggs av OakStride. Du får ett mejl när det är dags att granska och godkänna.</p>';
            } else {
              var c5 = content[5];
              if (c5.body) body += '<div class="onb-content-block">' + esc(c5.body).replace(/\n/g, "<br>") + "</div>";
              if (c5.link) { var u = /^https?:\/\//.test(c5.link) ? c5.link : "https://" + c5.link; body += '<p><a class="btn btn-primary btn-sm btn-inline" href="' + esc(u) + '" target="_blank" rel="noopener">Öppna sidan &#8599;</a></p>'; }
              if (dn) {
                body += '<p class="onb-verified">✓ Sida & konfiguration godkänd ' + fmtDate(done[4]) + " (offert v" + spec.version + ").</p>";
              } else if (cur) {
                body += '<p class="muted">Kommer du på något extra? Skicka in det — då uppdaterar vi kravspecifikationen och offerten, och du godkänner den uppdaterade versionen här nedan innan vi bygger klart.</p>' +
                  clarFormHtml() +
                  '<div class="onb-offer4"><h4>Kravspecifikation & offert (version ' + spec.version + ")</h4>" +
                  '<div class="onb-docs"><button type="button" class="btn btn-ghost btn-sm js-open-spec">Öppna kravspecifikation &amp; offert &#8599;</button></div>' +
                  (offerCurrentApproved
                    ? '<p class="onb-verified">✓ Du har godkänt den här versionen av offerten.</p>'
                    : '<label class="onb-confirm"><input type="checkbox" data-approve-offer4="' + spec.version + '"> <span>Jag godkänner den uppdaterade kravspecifikationen och offerten (v' + spec.version + ")</span></label>") +
                  "</div>" +
                  '<label class="onb-confirm"><input type="checkbox" data-step="4"' + (offerCurrentApproved ? "" : " disabled") + "> <span>Jag godkänner sidan och konfigurationen</span></label>" +
                  (offerCurrentApproved ? "" : '<p class="muted onb-hint-sm">Godkänn den uppdaterade offerten ovan först.</p>');
              } else {
                body += '<p class="muted">Blir aktivt när föregående steg är klart.</p>';
              }
            }
          }

          if (n === 2 || n === 5) {
            if (dn) body += '<p class="onb-verified">✓ Klart ' + fmtDate(done[n]) + "</p>";
            else if (cur) body += '<label class="onb-confirm"><input type="checkbox" data-step="' + n + '"> <span>' + esc(s.cta) + "</span></label>";
            else body += '<p class="muted">Blir aktivt när föregående steg är klart.</p>';
          }

          return '<details class="onb-acc-item ' + cls + '"' + (cur ? " open" : "") + ">" +
            '<summary class="onb-acc-sum"><span class="onb-dot">' + (dn ? "✓" : n) + "</span>" +
            '<span class="onb-acc-title">' + esc(s.title) + "</span>" + meta +
            '<span class="onb-acc-chev" aria-hidden="true">▾</span></summary>' +
            '<div class="onb-acc-body">' + body + "</div></details>";
        }).join("") + "</div></div>";

      box.innerHTML = html;

      var specForView = spec ? spec.data : specFromBrief(brief);
      var specLabel = spec ? ("Version " + spec.version + " · " + fmtDate(spec.created_at) + (spec.source === "kund" ? " · er ändring" : "")) : "Förhandsvisning – ingen version fastställd ännu";
      Array.prototype.forEach.call(box.querySelectorAll(".js-open-spec"), function (b) { b.addEventListener("click", function () { openSpecWindow(specForView, ordered, specLabel); }); });
      Array.prototype.forEach.call(box.querySelectorAll(".js-open-terms"), function (b) { b.addEventListener("click", function () { openTermsWindow(custAgreement); }); });
      Array.prototype.forEach.call(box.querySelectorAll("[data-step]"), function (cb) {
        cb.addEventListener("change", function () { if (cb.checked && !cb.disabled) checkoffStep(Number(cb.getAttribute("data-step"))); });
      });
      var offer4 = box.querySelector("[data-approve-offer4]");
      if (offer4) offer4.addEventListener("change", function () {
        if (offer4.checked) approveUpdatedOffer(spec, ordered);
      });
      var clarBtn = box.querySelector("[data-clar]");
      if (clarBtn) clarBtn.addEventListener("click", function () {
        var text = document.getElementById("clar-text").value;
        if (!text.trim()) { toast("Skriv vad du vill ändra.", true); return; }
        saveSpecClarification(document.getElementById("clar-scope").value, text);
      });
      var agreeCb = document.getElementById("agree-cb"), approveOfferBtn = document.getElementById("btn-approve-offer");
      if (agreeCb && approveOfferBtn) {
        agreeCb.addEventListener("change", function () { approveOfferBtn.disabled = !agreeCb.checked; });
        approveOfferBtn.addEventListener("click", function () { approveOffer(spec, ordered, approveOfferBtn); });
      }
    });
  }

  // Steg 4: godkänn den uppdaterade kravspecen/offerten (faktureringsuppgifter finns redan).
  function approveUpdatedOffer(spec, ordered) {
    if (!spec) return;
    var summary = orderSummaryText(spec.data, ordered);
    sha256Hex(custAgreement.version + "\n" + custAgreement.html).then(function (hash) {
      sb.from("agreement_acceptances").insert({
        user_id: session.user.id, agreement_version: custAgreement.version, document_title: custAgreement.title,
        document_hash: hash, user_agent: navigator.userAgent, order_summary: summary
      }).then(function (r2) {
        if (r2.error && r2.error.code !== "23505") { toast("Kunde inte spara: " + r2.error.message, true); return; }
        sb.from("extra_work_approvals").insert({ user_id: session.user.id, spec_version: spec.version }).then(function () {
          toast("Tack! Den uppdaterade offerten är godkänd — en ny orderbekräftelse skickas.");
          loadOnboarding();
        });
      });
    });
  }

  function approveOffer(spec, ordered, btn) {
    if (!spec) return;
    function val(id) { var el = document.getElementById(id); return el ? (el.value || "").trim() : ""; }
    var b = { company: val("bill-company"), org_nr: val("bill-org"), address: val("bill-addr") || null, postal_city: val("bill-postcity") || null, invoice_email: val("bill-email"), reference: val("bill-ref") || null };
    if (!b.company || !b.org_nr || !b.invoice_email) { toast("Fyll i minst företagsnamn, org.nr och fakturamejl.", true); return; }
    btn.disabled = true;
    b.user_id = session.user.id; b.updated_at = new Date().toISOString();
    sb.from("billing_details").upsert(b).then(function (r1) {
      if (r1.error) { toast("Kunde inte spara faktureringsuppgifter: " + r1.error.message, true); btn.disabled = false; return; }
      var summary = orderSummaryText(spec.data, ordered);
      sha256Hex(custAgreement.version + "\n" + custAgreement.html).then(function (hash) {
        sb.from("agreement_acceptances").insert({
          user_id: session.user.id, agreement_version: custAgreement.version, document_title: custAgreement.title,
          document_hash: hash, user_agent: navigator.userAgent, order_summary: summary
        }).then(function (r2) {
          if (r2.error && r2.error.code !== "23505") { toast("Kunde inte spara godkännande: " + r2.error.message, true); btn.disabled = false; return; }
          sb.from("extra_work_approvals").insert({ user_id: session.user.id, spec_version: spec.version }).then(function () {
            toast("Tack! Offert och villkor godkända — en orderbekräftelse skickas till din e-post.");
            loadOnboarding();
          });
        });
      });
    });
  }

  function orderSummaryText(d, ord) {
    var ep = effectivePricing(d);
    var eh = (d && d.extra_hours) || [];
    var totalH = eh.reduce(function (s, i) { return s + (Number(i.hours) || 0); }, 0);
    var engAddons = (ord || []).filter(function (a) { return a.billing !== "manad"; });
    var manAddons = (ord || []).filter(function (a) { return a.billing === "manad"; });
    var totalEng = ep.site_price + Math.round(totalH * ep.rate_setup) + engAddons.reduce(function (s, a) { return s + Number(a.price || 0); }, 0);
    var totalMan = ep.drift_month + manAddons.reduce(function (s, a) { return s + Number(a.price || 0); }, 0);
    var L = ["ENGÅNGSKOSTNAD (exkl. moms):", "  Standardsida: " + fmtKr(ep.site_price) + " kr"];
    eh.forEach(function (i) { L.push("  " + i.label + " (" + fmtHours(i.hours) + " tim): " + fmtKr(Math.round((Number(i.hours) || 0) * ep.rate_setup)) + " kr"); });
    engAddons.forEach(function (a) { L.push("  " + a.title + ": " + fmtKr(a.price) + " kr"); });
    L.push("  Summa engång: " + fmtKr(totalEng) + " kr", "", "LÖPANDE:", "  Drift & hosting: " + fmtKr(ep.drift_month) + " kr/mån");
    manAddons.forEach(function (a) { L.push("  " + a.title + ": " + fmtKr(a.price) + " kr/mån"); });
    L.push("  Summa löpande: " + fmtKr(totalMan) + " kr/mån");
    var rc = (d && d.recurring_costs) || [];
    if (rc.length) {
      L.push("", "TREDJEPART (självkostnad, vidarefaktureras):");
      rc.forEach(function (i) { L.push("  " + i.label + ": " + (i.amount == null || i.amount === "" ? "" : fmtKr(i.amount) + " kr" + periodSuffix(i.period))); });
    }
    L.push("", "Ändringar & löpande arbete efter lansering: " + fmtKr(ep.rate_change) + " kr/tim.");
    return L.join("\n");
  }

  function checkoffStep(n) {
    sb.from("onboarding_checkoffs").insert({ user_id: session.user.id, step_no: n }).then(function (res) {
      if (res.error && res.error.code !== "23505") { toast("Kunde inte spara: " + res.error.message, true); return; }
      toast("Steg godkänt!");
      loadOnboarding();
    });
  }

  function saveExtraApproval(version) {
    sb.from("extra_work_approvals").insert({ user_id: session.user.id, spec_version: version }).then(function (res) {
      if (res.error && res.error.code !== "23505") { toast("Kunde inte spara: " + res.error.message, true); return; }
      toast("Tack! Det extra arbetet är godkänt.");
      loadOnboarding();
    });
  }

  // Kundens förtydligande (per sida eller hela siten) dokumenteras i kravspecen som ny version.
  function saveSpecClarification(scope, text) {
    sb.rpc("add_customer_spec_version", { p_complement: (text || "").trim(), p_scope: scope || null }).then(function (res) {
      if (res.error) { toast("Kunde inte spara: " + res.error.message, true); return; }
      if (!res.data) { toast("Kravbilden är inte redo för förtydliganden ännu.", true); return; }
      toast("Tack! Ditt förtydligande är dokumenterat i kravspecifikationen.");
      loadOnboarding();
    });
  }

  function addonRowHtml(a, actionable) {
    var actions = actionable
      ? '<div class="addon-actions"><button class="btn btn-primary btn-sm btn-inline" data-order="' + a.id + '">Beställ</button>' +
        '<button class="btn btn-ghost btn-sm" data-decline="' + a.id + '">Avböj</button></div>'
      : '<span class="chip chip-approved">Beställd</span>';
    return '<div class="addon"><div class="addon-main"><strong>' + esc(a.title) + "</strong> · " + esc(addonPrice(a)) +
      (a.description ? '<div class="muted addon-desc">' + esc(a.description) + "</div>" : "") + "</div>" + actions + "</div>";
  }

  function decideAddon(id, status) {
    sb.from("addons").update({ status: status }).eq("id", id).then(function (res) {
      if (res.error) { toast("Kunde inte spara: " + res.error.message, true); return; }
      toast(status === "ordered" ? "Tillägg beställt — tack!" : "Tillägg avböjt.");
      loadOnboarding();
    });
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
    if (adminTab === "briefs") return renderAdminBriefs();
    if (adminTab === "priser") return renderAdminPriser();
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

  function renderAdminPriser() {
    main.innerHTML = '<div class="spinner"></div>';
    sb.from("pricing_settings").select("*").eq("id", 1).maybeSingle().then(function (res) {
      var p = (res && res.data) ? res.data : DEFAULT_PRICING;
      function pf(id, label, val) { return '<label for="' + id + '">' + esc(label) + '</label><input type="text" id="' + id + '" class="se-price" value="' + esc(val) + '">'; }
      main.innerHTML =
        '<div class="card" style="max-width:560px"><h1>Standardpriser</h1>' +
        '<p class="muted">Det här är standardpriserna som förifylls för nya kunder. Per kund justerar du priserna i kravspecen (avsnitt 2 och 3), och <strong>varje kunds villkor visar den kundens priser</strong>. Ändrar du standardpriserna här gäller de för kunder som inte har egna priser.</p>' +
        '<form id="form-pricing">' +
        pf("p-site", "Standardwebbplats (kr, engång)", p.site_price) +
        pf("p-drift", "Löpande drift (kr/mån)", p.drift_month) +
        pf("p-setup", "Timpris — uppsättning (kr/tim)", p.rate_setup) +
        pf("p-change", "Timpris — ändringar & drift framöver (kr/tim)", p.rate_change) +
        '<button type="submit" class="btn btn-primary btn-inline">Spara priser</button></form>' +
        '<p class="muted" style="margin-top:1.2rem"><strong>Obs:</strong> avtalsmallarna (Word-dokumenten i OneDrive) uppdateras inte automatiskt — säg till så regenererar jag dem med de nya priserna.</p></div>';
      document.getElementById("form-pricing").addEventListener("submit", function (e) {
        e.preventDefault();
        function num(id) { var v = parseFloat(document.getElementById(id).value.replace(",", ".").replace(/\s/g, "")); return isNaN(v) ? null : v; }
        var row = { id: 1, site_price: num("p-site"), drift_month: num("p-drift"), rate_setup: num("p-setup"), rate_change: num("p-change"), updated_at: new Date().toISOString() };
        if (row.site_price == null || row.drift_month == null || row.rate_setup == null || row.rate_change == null) { toast("Fyll i alla priser med siffror.", true); return; }
        sb.from("pricing_settings").upsert(row).then(function (r) {
          if (r.error) { toast("Kunde inte spara: " + r.error.message, true); return; }
          pricing = { site_price: row.site_price, drift_month: row.drift_month, rate_setup: row.rate_setup, rate_change: row.rate_change };
          AGREEMENT = buildAgreement(pricing);
          toast("Priser sparade — villkoren uppdaterade.");
        });
      });
    });
  }

  var BRIEF_STATUS = { new: "Ny", contacted: "Kontaktad", converted: "Kund", archived: "Arkiverad" };

  function renderAdminBriefs() {
    main.innerHTML = "<h1>Projektförfrågningar</h1>" +
      '<p class="muted">Inkomna briefer från oakstride.se/studio. Varje förfrågan är även en ansökan om portalåtkomst.</p>' +
      '<div id="briefs-box"><div class="spinner"></div></div>';
    sb.from("project_briefs").select("*").order("created_at", { ascending: false }).then(function (res) {
      var box = document.getElementById("briefs-box");
      if (!box) return;
      if (res.error) { box.innerHTML = '<div class="empty">' + esc(res.error.message) + "</div>"; return; }
      var rows = res.data || [];
      if (!rows.length) { box.innerHTML = '<div class="empty">Inga förfrågningar ännu.</div>'; return; }
      box.innerHTML = rows.map(function (b) {
        return '<div class="card" style="margin-bottom:1rem"><div class="page-head">' +
          '<h2 style="margin:0">' + esc(b.name) + (b.company ? " · " + esc(b.company) : "") + "</h2>" +
          '<select data-bstatus="' + b.id + '">' + Object.keys(BRIEF_STATUS).map(function (s) {
            return '<option value="' + s + '"' + (b.status === s ? " selected" : "") + ">" + BRIEF_STATUS[s] + "</option>";
          }).join("") + "</select></div>" +
          '<div class="detail-meta"><span>' + fmtDate(b.created_at) + "</span>" +
          '<span><strong>E-post:</strong> <a href="mailto:' + esc(b.email) + '">' + esc(b.email) + "</a></span>" +
          (b.wants_portal ? '<span class="chip chip-new">Portalansökan</span>' : "") + "</div>" +
          '<div class="detail-desc">' + esc(b.description) + "</div>" +
          (b.example_sites ? '<p style="margin:.5rem 0 0"><strong>Exempelsajter:</strong></p><div class="detail-desc">' + esc(b.example_sites) + "</div>" : "") +
          "</div>";
      }).join("");
      Array.prototype.forEach.call(box.querySelectorAll("[data-bstatus]"), function (sel) {
        sel.addEventListener("change", function () {
          sb.from("project_briefs").update({ status: sel.value }).eq("id", Number(sel.getAttribute("data-bstatus"))).then(function (r) {
            if (r.error) toast("Kunde inte spara: " + r.error.message, true); else toast("Status uppdaterad.");
          });
        });
      });
    });
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
            (p.company ? "<br>" + esc(p.company) : "") +
            "<br><button class='linklike btn-manage' data-manage='" + esc(p.id) + "'>Uppstart &amp; tillägg &rarr;</button></td>" +
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
        var mng = tr.querySelector(".btn-manage");
        if (mng) mng.addEventListener("click", function () { renderAdminCustomerDetail(pid); });
      });
    });
  }

  // ---------- Admin: uppstart & tillägg per kund ----------

  function adminAddonList(addons) {
    if (!addons.length) return '<p class="muted">Inga tillägg föreslagna ännu.</p>';
    return addons.map(function (a) {
      var st = a.status === "ordered" ? '<span class="chip chip-approved">Beställd</span>'
        : (a.status === "declined" ? '<span class="chip chip-done">Avböjd</span>'
          : '<span class="chip chip-questions">Väntar på kund</span>');
      var del = a.status === "proposed" ? ' <button class="linklike" data-del="' + a.id + '">Ta bort</button>' : "";
      return '<div class="addon"><div class="addon-main"><strong>' + esc(a.title) + "</strong> · " + esc(addonPrice(a)) + " " + st +
        (a.description ? '<div class="muted addon-desc">' + esc(a.description) + "</div>" : "") + "</div>" + del + "</div>";
    }).join("");
  }

  var SERVICE_KINDS = { doman: "Domän", epost: "E-post", hosting: "Hosting", betalvaxel: "Betalväxel", ovrigt: "Övrigt" };

  function svcCost(s) {
    if (s.cost == null || s.cost === "") return "";
    var per = s.billing === "manad" ? "/mån" : (s.billing === "ar" ? "/år" : (s.billing === "engang" ? " (engång)" : ""));
    return " · " + fmtKr(s.cost) + " kr" + per;
  }
  function servicesList(services) {
    if (!services.length) return '<p class="muted">Inga tjänster registrerade ännu.</p>';
    return services.map(function (s) {
      return '<div class="addon"><div class="addon-main"><strong>' + esc(SERVICE_KINDS[s.kind] || s.kind) + ":</strong> " + esc(s.name) + esc(svcCost(s)) +
        (s.detail ? '<div class="muted addon-desc">' + esc(s.detail) + "</div>" : "") + "</div>" +
        '<button class="linklike" data-svcdel="' + s.id + '">Ta bort</button></div>';
    }).join("");
  }

  function renderAdminCustomerDetail(pid) {
    main.innerHTML = '<div class="spinner"></div>';
    sb.from("profiles").select("*").eq("id", pid).single().then(function (pres) {
      var p = pres.data;
      if (pres.error || !p) { toast("Kunde inte hämta kunden.", true); renderAdminCustomers(); return; }
      Promise.all([
        sb.from("addons").select("*").eq("user_id", pid).order("created_at"),
        sb.from("onboarding_checkoffs").select("step_no, done_at, with_extras").eq("user_id", pid),
        sb.from("requests").select("id, title, status, created_at").eq("user_id", pid).order("created_at", { ascending: false }),
        sb.from("customer_services").select("*").eq("user_id", pid).order("kind"),
        sb.from("project_briefs").select("description, example_sites, created_at").eq("email", p.email).order("created_at", { ascending: false }),
        sb.from("onboarding_content").select("step_no, body, link, transcript").eq("user_id", pid),
        sb.from("onboarding_notes").select("step_no, body, updated_at").eq("user_id", pid),
        sb.from("requirement_specs").select("*").eq("user_id", pid).order("version", { ascending: false }),
        sb.from("extra_work_approvals").select("spec_version, approved_at").eq("user_id", pid)
      ]).then(function (out) {
      var addons = out[0].data || [];
      var done = {}, doneExtras = {}; (out[1].data || []).forEach(function (r) { done[r.step_no] = r.done_at; doneExtras[r.step_no] = r.with_extras; });
      var requests = out[2].data || [], services = out[3].data || [];
      var briefs = out[4].error ? [] : (out[4].data || []);
      var brief = briefs[0] || null;
      var content = {}; (out[5].error ? [] : (out[5].data || [])).forEach(function (r) { content[r.step_no] = r; });
      var notes = {}; (out[6].error ? [] : (out[6].data || [])).forEach(function (r) { notes[r.step_no] = r; });
      var specs = out[7].error ? [] : (out[7].data || []);
      var latestSpec = specs[0] || null;
      var specData = latestSpec ? latestSpec.data : specFromBrief(brief);
      var extraApprovals = out[8].error ? [] : (out[8].data || []);
      var latestExtraApproved = !!(latestSpec && extraApprovals.some(function (a) { return a.spec_version === latestSpec.version; }));
      var dm = specData.domain || {};
      var ordered = addons.filter(function (a) { return a.status === "ordered"; });
      var step1Done = !!brief;
      var doneCount = (step1Done ? 1 : 0) + (latestExtraApproved ? 1 : 0) + [2, 4, 5].filter(function (n) { return !!done[n]; }).length;
      var newCount = requests.filter(function (r) { return r.status === "new"; }).length;
      var site = (p.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      var siteUrl = site ? "https://" + site : null;

      main.innerHTML =
        '<button class="back-link" id="btn-back">&larr; Tillbaka till kunder</button>' +
        '<div class="card"><h1>' + esc(p.full_name || p.email) + "</h1>" +
        '<p class="muted">' + esc(p.email) + (p.company ? " · " + esc(p.company) : "") + "</p>" +
        (siteUrl
          ? '<p><strong>Hemsida:</strong> <a href="' + esc(siteUrl) + '" target="_blank" rel="noopener">' + esc(site) + " &#8599;</a>" +
            (p.github_repo ? '  ·  <span class="muted">Repo: ' + esc(p.github_repo) + "</span>" : "") + "</p>"
          : '<p class="muted">Ingen hemsida kopplad ännu.</p>') + "</div>" +
        '<div class="card"><h2>Ärenden' + (newCount ? ' <span class="chip chip-new">' + newCount + " nya</span>" : "") + "</h2>" +
        (requests.length
          ? '<div class="req-list">' + requests.map(function (r) {
              return '<button class="req-item" data-req="' + r.id + '"><div class="req-item-top"><span class="req-title">' + esc(r.title) + "</span>" + chip(r.status, true) + "</div>" +
                '<div class="req-meta">#' + r.id + " · " + fmtDate(r.created_at) + "</div></button>";
            }).join("") + "</div>"
          : '<p class="muted">Inga ärenden ännu.</p>') + "</div>" +
        '<div class="card"><h2>Önskemål (projektförfrågan)</h2>' +
        (brief
          ? '<div class="detail-meta"><span>' + fmtDate(brief.created_at) + "</span></div>" +
            '<div class="detail-desc">' + esc(brief.description) + "</div>" +
            (brief.example_sites ? '<p style="margin:.5rem 0 0"><strong>Exempelsajter:</strong></p><div class="detail-desc">' + esc(brief.example_sites) + "</div>" : "")
          : '<p class="muted">Ingen projektförfrågan kopplad till denna e-post.</p>') + "</div>" +
        '<div class="card"><h2>Tjänster — domän, e-post m.m.</h2>' +
        '<div id="svc-list">' + servicesList(services) + "</div>" +
        '<form id="form-svc" style="margin-top:1rem">' +
        '<div class="addon-form-row">' +
        '<div><label for="s-kind">Typ</label><select id="s-kind">' + Object.keys(SERVICE_KINDS).map(function (k) { return '<option value="' + k + '">' + SERVICE_KINDS[k] + "</option>"; }).join("") + "</select></div>" +
        '<div style="flex:2"><label for="s-name">Namn/adress *</label><input type="text" id="s-name" required placeholder="t.ex. kundendomän.se eller Microsoft 365"></div>' +
        "</div>" +
        '<label for="s-detail">Detalj</label><input type="text" id="s-detail" placeholder="t.ex. leverantör, antal brevlådor, förnyelsedatum">' +
        '<div class="addon-form-row"><div><label for="s-cost">Kostnad (kr)</label><input type="text" id="s-cost" placeholder="t.ex. 250"></div>' +
        '<div><label for="s-billing">Period</label><select id="s-billing"><option value="">—</option><option value="ar">Per år</option><option value="manad">Per månad</option><option value="engang">Engång</option></select></div></div>' +
        '<button type="submit" class="btn btn-primary btn-inline">Lägg till tjänst</button></form></div>' +
        '<div class="card"><h2>Uppstartssteg — kundens framsteg (' + doneCount + "/" + ONBOARDING_STEPS.length + ")</h2>" +
        '<ol class="onb-steps admin-steps">' + ONBOARDING_STEPS.map(function (s, i) {
          var n = i + 1, isDone = n === 1 ? step1Done : (n === 3 ? latestExtraApproved : !!done[n]);
          var dateBit = n === 1
            ? (step1Done ? ' <span class="onb-step-date">' + fmtDate(brief.created_at) + '</span> <span class="muted">(via projektförfrågan)</span>' : "")
            : n === 3
              ? (isDone ? ' <span class="muted">(offert & villkor godkända av kund)</span>' : "")
              : (isDone ? ' <span class="onb-step-date">' + fmtDate(done[n]) + '</span> <button class="linklike" data-undo="' + n + '">Ångra</button>' : "");
          return '<li class="' + (isDone ? "done" : "upcoming") + '"><span class="onb-dot">' + (isDone ? "✓" : n) + "</span>" +
            '<div class="onb-step-main"><div class="onb-step-title">' + esc(s.title) + dateBit + "</div></div></li>";
        }).join("") + "</ol></div>" +
        '<div class="card"><h2>Material till kunden (steg 3 & 4)</h2>' +
        '<p class="muted">Steg 3: valfri mötessammanfattning i text + transkribering (internt) — själva offerten bor i kravspecen nedan. Steg 4: länk till den byggda sidan/utkastet + ev. kommentar.</p>' +
        '<form id="form-content">' +
        '<label for="c3">Steg 3 — sammanfattning av uppstartsmötet (valfri, visas för kunden)</label>' +
        '<textarea id="c3" rows="5" placeholder="Kort recap av mötet i löpande text...">' + esc(content[3] ? (content[3].body || "") : "") + "</textarea>" +
        '<label for="c3trans">Transkribering av uppstartsmötet (internt — visas ej för kunden)</label>' +
        '<textarea id="c3trans" rows="5" placeholder="Klistra in hela transkriberingen här som underlag...">' + esc(content[3] ? (content[3].transcript || "") : "") + "</textarea>" +
        '<label for="c5link">Steg 4 — länk till den byggda sidan / utkastet</label>' +
        '<input type="text" id="c5link" placeholder="https://..." value="' + esc(content[5] ? (content[5].link || "") : "") + '">' +
        '<label for="c5">Steg 4 — ev. kommentar (t.ex. vad kunden särskilt bör titta på)</label>' +
        '<textarea id="c5" rows="3" placeholder="Valfritt...">' + esc(content[5] ? (content[5].body || "") : "") + "</textarea>" +
        '<button type="submit" class="btn btn-primary btn-inline">Spara material</button></form></div>' +
        '<div class="card"><h2>Kravspecifikation' + (latestSpec ? " — v" + latestSpec.version : " — ingen version ännu") + "</h2>" +
        '<p class="muted">Redigera direkt i strukturen. Klicka på <strong>Standard/Extra</strong> för att växla, och lägg till rader med knapparna. Att spara skapar en ny version.</p>' +
        '<form id="form-spec">' +
        specEditorHtml(specData) +
        '<label for="spec-note" class="se-note-label">Ändringsnotering (vad ändras i denna version)</label>' +
        '<input type="text" id="spec-note" placeholder="t.ex. Kompletterat efter uppstartsmötet">' +
        '<div class="se-btn-row"><button type="button" id="btn-spec-preview" class="btn btn-ghost btn-inline">Förhandsvisa</button>' +
        '<button type="submit" class="btn btn-primary btn-inline">Spara som ny version</button></div></form>' +
        (latestSpec && (specData.extra_hours || []).length
          ? '<p class="' + (latestExtraApproved ? "onb-verified" : "status-note") + '">' +
            (latestExtraApproved ? "✓ Kunden har godkänt det extra arbetet (v" + latestSpec.version + ")." : "Kunden har ännu inte godkänt det extra arbetet (v" + latestSpec.version + ").") + "</p>"
          : "") +
        (specs.length
          ? '<h3 class="spec-hist-h">Versioner</h3><ul class="spec-history">' + specs.map(function (v) {
              var src = v.source === "kund" ? "kundens ändring" : (v.source === "baslinje" ? "baslinje" : "admin");
              return "<li><strong>v" + v.version + "</strong> · " + fmtDate(v.created_at) + " · " + esc(src) +
                (v.change_note ? " — " + esc(v.change_note) : "") + "</li>";
            }).join("") + "</ul>"
          : "") +
        "</div>" +
        '<div class="card"><h2>Föreslå tillägg</h2>' +
        '<p class="muted">Kunden får ett mejl och kan beställa eller avböja i portalen.</p>' +
        '<form id="form-addon">' +
        '<label for="a-title">Titel *</label><input type="text" id="a-title" required placeholder="t.ex. E-postlösning (Microsoft 365)">' +
        '<label for="a-desc">Beskrivning</label><textarea id="a-desc" placeholder="Vad ingår, ev. att priset är självkostnad, osv."></textarea>' +
        '<div class="addon-form-row">' +
        '<div><label for="a-price">Pris (kr, exkl. moms) *</label><input type="text" id="a-price" required placeholder="150"></div>' +
        '<div><label for="a-billing">Debitering</label><select id="a-billing"><option value="engang">Engång</option><option value="manad">Per månad</option></select></div>' +
        "</div>" +
        '<button type="submit" class="btn btn-primary btn-inline">Föreslå tillägg</button></form></div>' +
        '<div class="card"><h2>Tillägg för kunden</h2><div id="admin-addons">' + adminAddonList(addons) + "</div></div>";

      document.getElementById("btn-back").addEventListener("click", renderAdminCustomers);
      Array.prototype.forEach.call(document.querySelectorAll("[data-req]"), function (btn) {
        btn.addEventListener("click", function () { renderDetail(Number(btn.getAttribute("data-req")), true); });
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-undo]"), function (btn) {
        btn.addEventListener("click", function () {
          sb.from("onboarding_checkoffs").delete().eq("user_id", pid).eq("step_no", Number(btn.getAttribute("data-undo"))).then(function (r) {
            if (r.error) toast("Kunde inte ångra: " + r.error.message, true); else renderAdminCustomerDetail(pid);
          });
        });
      });
      document.getElementById("form-svc").addEventListener("submit", function (e) {
        e.preventDefault();
        var name = document.getElementById("s-name").value.trim();
        if (!name) { toast("Ange namn/adress.", true); return; }
        var costRaw = document.getElementById("s-cost").value.replace(",", ".").replace(/\s/g, "");
        var cost = costRaw ? parseFloat(costRaw) : null;
        if (costRaw && isNaN(cost)) { toast("Ogiltig kostnad.", true); return; }
        sb.from("customer_services").insert({
          user_id: pid,
          kind: document.getElementById("s-kind").value,
          name: name,
          detail: document.getElementById("s-detail").value.trim() || null,
          cost: cost,
          billing: document.getElementById("s-billing").value || null
        }).then(function (r) {
          if (r.error) { toast("Kunde inte spara: " + r.error.message, true); return; }
          toast("Tjänst tillagd.");
          renderAdminCustomerDetail(pid);
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-svcdel]"), function (btn) {
        btn.addEventListener("click", function () {
          sb.from("customer_services").delete().eq("id", Number(btn.getAttribute("data-svcdel"))).then(function (r) {
            if (r.error) toast("Kunde inte ta bort: " + r.error.message, true); else renderAdminCustomerDetail(pid);
          });
        });
      });
      document.getElementById("form-content").addEventListener("submit", function (e) {
        e.preventDefault();
        function v(id) { return document.getElementById(id).value.trim() || null; }
        var now = new Date().toISOString();
        var rows = [
          { user_id: pid, step_no: 3, body: v("c3"), link: null, transcript: v("c3trans"), updated_at: now },
          { user_id: pid, step_no: 5, body: v("c5"), link: v("c5link"), updated_at: now }
        ];
        sb.from("onboarding_content").upsert(rows, { onConflict: "user_id,step_no" }).then(function (r) {
          if (r.error) { toast("Kunde inte spara: " + r.error.message, true); return; }
          toast("Material sparat.");
          renderAdminCustomerDetail(pid);
        });
      });
      var specForm = document.getElementById("form-spec");
      wireSpecEditor(specForm);
      var previewBtn = document.getElementById("btn-spec-preview");
      if (previewBtn) previewBtn.addEventListener("click", function () {
        var inner = renderSpecView(readSpecEditor(specForm), ordered, latestSpec ? ("Utkast (baserat på v" + latestSpec.version + ")") : "Utkast");
        var w = window.open("", "specpreview", "width=560,height=820,scrollbars=yes");
        if (!w) { toast("Tillåt popup-fönster för att förhandsvisa.", true); return; }
        var css = location.origin + "/styles.css";
        w.document.open();
        w.document.write('<!doctype html><html lang="sv"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width, initial-scale=1">' +
          "<title>Förhandsvisning – kravspecifikation</title>" +
          '<link rel="stylesheet" href="' + css + '">' +
          "<style>body{background:#f4f6f4;margin:0;padding:1.2rem}.pvwrap{max-width:640px;margin:0 auto}h1{font-size:1.05rem;color:#1e3a2f;margin:0 0 1rem}</style></head>" +
          '<body><div class="pvwrap"><h1>Förhandsvisning — så här ser kunden kravspecen</h1>' +
          '<div class="card spec-card">' + inner + "</div></div></body></html>");
        w.document.close();
      });
      specForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var data = readSpecEditor(specForm);
        var nextVer = (latestSpec ? latestSpec.version : 0) + 1;
        sb.from("requirement_specs").insert({
          user_id: pid,
          version: nextVer,
          data: data,
          change_note: document.getElementById("spec-note").value.trim() || null,
          source: latestSpec ? "admin" : "baslinje"
        }).then(function (r) {
          if (r.error) { toast("Kunde inte spara: " + r.error.message, true); return; }
          toast("Kravspec sparad som version " + nextVer + ".");
          renderAdminCustomerDetail(pid);
        });
      });
      document.getElementById("form-addon").addEventListener("submit", function (e) {
        e.preventDefault();
        var price = parseFloat(document.getElementById("a-price").value.replace(",", ".").replace(/\s/g, ""));
        if (isNaN(price) || price < 0) { toast("Ange ett giltigt pris.", true); return; }
        sb.from("addons").insert({
          user_id: pid,
          title: document.getElementById("a-title").value.trim(),
          description: document.getElementById("a-desc").value.trim() || null,
          price: price,
          billing: document.getElementById("a-billing").value
        }).then(function (r) {
          if (r.error) { toast("Kunde inte spara: " + r.error.message, true); return; }
          toast("Tillägg föreslaget — kunden aviseras.");
          renderAdminCustomerDetail(pid);
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll("#admin-addons [data-del]"), function (btn) {
        btn.addEventListener("click", function () {
          sb.from("addons").delete().eq("id", Number(btn.getAttribute("data-del"))).then(function (r) {
            if (r.error) toast("Kunde inte ta bort: " + r.error.message, true); else renderAdminCustomerDetail(pid);
          });
        });
      });
      });
    });
  }
})();
