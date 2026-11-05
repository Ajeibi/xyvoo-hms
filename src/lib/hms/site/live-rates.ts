/*
 * A hotel's live website uses the template's own booking pages, but its rooms, prices and bookings
 * come from the hotel's HMS, not the template's sample text. The route serves the template's script
 * with the hotel's currency and the hand-over below, then this code on the end. It
 *   - asks /api/public/rates for the stay on the form (rooms left, rate plans with taxes, deposit,
 *     cancellation terms, add-ons, nearby dates when sold out) and rebuilds the form from the answer;
 *   - books for real through /api/public/book (or sends a request when the hotel prefers to approve
 *     each booking), showing the real confirmation on the confirmation page;
 *   - runs the "manage your booking" page: look up, change dates, cancel;
 *   - tells the hotel once a visitor has typed an email, so one reminder can be sent if they leave.
 * The prices are the ones the front desk would charge. The server prices again on every booking.
 */

/** The template's money formatter is built for one currency; this swaps in the hotel's. */
export function withHotelCurrency(templateScript: string, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "NGN";
  return templateScript.replace(/new Intl\.NumberFormat\("en-GB", \{ style: "currency", currency: "GBP" \}\)/, `new Intl.NumberFormat("en-GB", { style: "currency", currency: "${code}", maximumFractionDigits: 0 })`);
}

/**
 * The template's booking form calls submitBooking(form, status) once the fields are valid. On a
 * hotel's site, the live script gets the first go: it returns true when it has taken the booking.
 */
export function withHotelBooking(templateScript: string): string {
  return templateScript
    .replace(/submitBooking\(form, status\);/, "if (!(window.__xyvooBook && window.__xyvooBook(form, status, bookingState()))) { submitBooking(form, status); }")
    .replace(/company: get\("company"\),/, 'company: get("company"), visit: window.__xyvooVisit || "",');
}

export const LIVE_RATES_SCRIPT = String.raw`
;(function () {
  function rand() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
    return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  var visit = "";
  try { visit = sessionStorage.getItem("xyvooVisit") || ""; if (!visit) { visit = rand(); sessionStorage.setItem("xyvooVisit", visit); } } catch (e) { visit = rand(); }
  window.__xyvooVisit = visit;

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function pretty(s) { var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!p) return s || ""; return new Date(+p[1], +p[2] - 1, +p[3]).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  function moneyFor(cur) { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 }); } catch (e) { return { format: function (n) { return String(Math.round(n)); } }; } }
  function send(method, url, body) {
    return fetch(url, { method: method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }
  function announce(text) { var a = document.getElementById("announcer"); if (a) a.textContent = text; }

  var style = document.createElement("style");
  style.textContent = ".xy-bar{display:none}"
    + "@media (max-width:860px){.xy-bar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:50;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid rgba(0,0,0,.15);box-shadow:0 -4px 16px rgba(0,0,0,.08)}.xy-bar strong{font-size:18px}.xy-bar small{display:block;font-size:12px;opacity:.75}body.xy-has-bar{padding-bottom:84px}}"
    + ".xy-alt{margin:8px 0;padding:12px;border:1px solid rgba(0,0,0,.15);border-radius:10px}.xy-alt button{margin:6px 8px 0 0}"
    + ".xy-low{font-weight:600}.xy-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.xy-change{margin-top:12px;padding:12px;border:1px solid rgba(0,0,0,.15);border-radius:10px}";
  document.head.appendChild(style);

  /* ------------------------------------------------------------------ booking page */
  var form = document.querySelector("[data-booking-form]");
  if (form) (function () {
    var roomSel = form.querySelector('[name="room"]');
    var cards = form.querySelector(".radio-cards");
    var inEl = form.querySelector("[data-checkin]");
    var outEl = form.querySelector("[data-checkout]");
    if (!roomSel || !cards || !inEl || !outEl) return;
    var submit = form.querySelector('button[type="submit"]');
    var status = form.querySelector(".form-status");
    var firstExtra = form.querySelector('input[name="extras"]');
    var extrasFs = firstExtra ? firstExtra.closest("fieldset") : null;
    var policyPanel = submit && submit.closest("section") ? submit.closest("section").querySelector(".panel") : null;

    var data = null, money = moneyFor("NGN"), timer = null, seq = 0, wantPlan = "", wantAddons = {}, pendingKey = null, busy = false;
    window.__xyvooRequestMode = false;

    function field(name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value : ""; }
    function fmt(n) { return money.format(n); }
    function fire() { form.dispatchEvent(new Event("change", { bubbles: true })); }
    function perNight(p) { return data && data.nights ? p.grandTotal / data.nights : p.grandTotal; }
    function dates() {
      var a = inEl.value, b = outEl.value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && b > a) return { a: a, b: b, real: true };
      var t = new Date(); t.setUTCDate(t.getUTCDate() + 1); var u = new Date(t); u.setUTCDate(u.getUTCDate() + 1);
      return { a: iso(t), b: iso(u), real: false };
    }
    function room() { return data ? data.roomTypes.filter(function (t) { return t.id === roomSel.value; })[0] : null; }
    function cheapest(type) { var best = null; type.plans.forEach(function (p) { if (p.bookable && (!best || p.grandTotal < best.grandTotal)) best = p; }); return best; }
    function chosenPlan() {
      var r = room(); var picked = form.querySelector('input[name="rate"]:checked');
      if (!r || !picked) return null;
      return r.plans.filter(function (p) { return p.code === picked.value; })[0] || null;
    }
    function chosenAddons() {
      var out = [];
      form.querySelectorAll('input[name="extras"]:checked').forEach(function (x) { if (x.getAttribute("data-id")) out.push({ id: x.getAttribute("data-id"), name: x.value, amount: parseFloat(x.getAttribute("data-price")) || 0 }); });
      return out;
    }
    function expectedTotal() {
      var p = chosenPlan(); if (!p) return null;
      return Math.round((p.totalAllRooms + chosenAddons().reduce(function (s, a) { return s + a.amount; }, 0)) * 100) / 100;
    }

    function note(text, bad) {
      var el = form.querySelector("[data-live-rates-note]");
      if (!el) {
        el = document.createElement("p");
        el.setAttribute("data-live-rates-note", "");
        el.setAttribute("role", "status");
        el.style.cssText = "margin:8px 0;font-size:14px";
        cards.parentNode.insertBefore(el, cards);
      }
      el.textContent = text;
      el.style.fontWeight = bad ? "600" : "400";
    }
    function altBox() {
      var el = form.querySelector("[data-xy-alt]");
      if (!el) { el = document.createElement("div"); el.className = "xy-alt"; el.setAttribute("data-xy-alt", ""); el.hidden = true; cards.parentNode.insertBefore(el, cards); }
      return el;
    }
    function showAlternatives(r) {
      var box = altBox();
      if (!r || r.open || !r.alternatives || !r.alternatives.length) { box.hidden = true; box.innerHTML = ""; return; }
      var html = "<strong>" + esc(r.name) + " is sold out for these dates.</strong> Free on:<br>";
      r.alternatives.forEach(function (a, i) { html += '<button type="button" class="btn btn--outline btn--sm" data-alt="' + i + '">' + esc(pretty(a.checkIn)) + " to " + esc(pretty(a.checkOut)) + "</button>"; });
      box.innerHTML = html; box.hidden = false;
      box.querySelectorAll("[data-alt]").forEach(function (b) {
        b.addEventListener("click", function () {
          var a = r.alternatives[+b.getAttribute("data-alt")];
          inEl.value = a.checkIn; outEl.value = a.checkOut;
          inEl.dispatchEvent(new Event("change", { bubbles: true })); outEl.dispatchEvent(new Event("change", { bubbles: true }));
          load();
        });
      });
    }

    function renderRooms() {
      var keep = roomSel.value;
      roomSel.innerHTML = "";
      data.roomTypes.forEach(function (t) {
        var base = cheapest(t);
        var o = document.createElement("option");
        o.value = t.id; o.setAttribute("data-name", t.name);
        o.setAttribute("data-rate", base ? String(perNight(base)) : "0");
        var ok = base && t.open && !t.fitsProblem;
        o.disabled = !ok;
        o.textContent = t.name + (ok ? " (from " + fmt(perNight(base)) + " a night" + (t.left <= 3 ? ", " + t.left + " left" : "") + ")" : t.fitsProblem ? " (too many guests for this room)" : !t.open ? " (sold out for these dates)" : " (not available for these dates)");
        roomSel.appendChild(o);
      });
      var still = Array.prototype.some.call(roomSel.options, function (o) { return o.value === keep && !o.disabled; });
      if (still) roomSel.value = keep;
      else { var first = Array.prototype.filter.call(roomSel.options, function (o) { return !o.disabled; })[0]; if (first) roomSel.value = first.value; }
    }

    function renderPlans() {
      var r = room();
      var chosen = form.querySelector('input[name="rate"]:checked');
      if (chosen) wantPlan = chosen.value;
      cards.innerHTML = "";
      cards.setAttribute("aria-busy", "false");
      if (!r) return;
      var base = cheapest(r), firstOpen = null;
      r.plans.forEach(function (p) {
        var add = base && p.bookable ? Math.max(0, perNight(p) - perNight(base)) : 0;
        var label = document.createElement("label");
        label.className = "radio-card";
        var terms = [p.boardBasis, p.refundable ? "Free cancellation (see terms)" : "Non-refundable", p.prepayRequired ? "Pay when you book" : "", p.deposit.required > 0 ? "Deposit " + fmt(p.deposit.required) : ""].filter(Boolean).join(" · ");
        var noteText = p.bookable ? terms : p.reasons.join(" ");
        label.innerHTML = '<input type="radio" name="rate" value="' + esc(p.code) + '" data-add="' + add + '" data-name="' + esc(p.name) + '"' + (p.bookable ? "" : " disabled") + ">"
          + "<span><strong>" + esc(p.name) + "</strong><small>" + esc(noteText) + "</small></span>"
          + "<span>" + (!p.bookable ? "Not available" : add > 0 ? "+" + fmt(add) + " a night" : "Included") + "</span>";
        cards.appendChild(label);
        if (p.bookable && !firstOpen) firstOpen = label.firstChild;
      });
      var want = wantPlan ? cards.querySelector('input[value="' + wantPlan.replace(/"/g, "") + '"]:not([disabled])') : null;
      var pick = want || firstOpen;
      if (pick) pick.checked = true;
      showAlternatives(r);
    }

    function renderAddons() {
      if (!extrasFs) return;
      extrasFs.querySelectorAll("label.extra").forEach(function (l) { l.parentNode.removeChild(l); });
      var list = data.addons || [];
      extrasFs.hidden = list.length === 0;
      var heading = extrasFs.parentNode ? extrasFs.parentNode.querySelector(".step-title, h2") : null;
      list.forEach(function (a) {
        var label = document.createElement("label");
        label.className = "check check--top extra";
        label.innerHTML = '<input type="checkbox" name="extras" value="' + esc(a.name) + '" data-id="' + esc(a.id) + '" data-price="' + a.amount + '" data-per="stay"' + (wantAddons[a.id] ? " checked" : "") + ">"
          + "<span><strong>" + esc(a.name) + '</strong> <span class="muted">' + fmt(a.amount) + " for this stay</span>" + (a.description ? '<br><span class="hint">' + esc(a.description) + "</span>" : "") + "</span>";
        extrasFs.appendChild(label);
      });
      void heading;
    }

    function renderPolicy() {
      if (!policyPanel) return;
      var r = room(), p = chosenPlan();
      if (!r) return;
      var lines = (r.cancellation || []).slice();
      if (p && !p.refundable) lines = ["This rate is non-refundable: it can't be changed or cancelled online."].concat(lines);
      var html = "<h3>Cancellation and payment</h3>" + lines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("");
      if (p && p.deposit.required > 0) {
        html += "<p><strong>Deposit:</strong> the hotel asks for " + esc(fmt(p.deposit.required)) + (p.deposit.dueDate ? " by " + esc(pretty(p.deposit.dueDate)) : "") + ". Your booking is confirmed now; nothing is charged online.</p>";
        if (data.paymentNote) html += '<p style="white-space:pre-line">' + esc(data.paymentNote) + "</p>";
      } else {
        html += "<p>Nothing is charged online. You pay the hotel when you stay.</p>";
      }
      policyPanel.innerHTML = html;
    }

    function fixTexts() {
      var instant = data && data.bookingMode !== "request";
      window.__xyvooRequestMode = !instant;
      if (submit) submit.textContent = instant ? "Confirm booking" : "Send booking request";
      var h = document.getElementById("step-confirm");
      if (h && h.lastChild && h.lastChild.nodeType === 3) h.lastChild.textContent = instant ? "Confirm your booking" : "Send your request";
      var sum = document.querySelector("[data-booking-summary]");
      if (sum) {
        Array.prototype.forEach.call(sum.querySelectorAll("*"), function (el) {
          if (el.children.length === 0 && /^Prices include VAT/i.test(el.textContent)) el.textContent = "Prices include taxes and service charge. Nothing is charged online.";
          if (el.children.length === 0 && /^Estimated total/i.test(el.textContent)) el.textContent = "Total";
        });
      }
      var intro = document.querySelector("main .lead");
      if (intro && /request/i.test(intro.textContent) && instant) intro.textContent = "Choose your room and confirm. You will get your booking confirmation by email straight away.";
    }

    var bar = document.createElement("div");
    bar.className = "xy-bar"; bar.setAttribute("aria-live", "polite");
    bar.innerHTML = '<div><strong data-xy-total>Choose dates</strong><small data-xy-sub></small></div><button type="button" class="btn btn--primary btn--sm" data-xy-go>Book</button>';
    document.body.appendChild(bar); document.body.classList.add("xy-has-bar");
    bar.querySelector("[data-xy-go]").addEventListener("click", function () { if (submit) { submit.scrollIntoView({ behavior: "smooth", block: "center" }); } });
    function renderBar() {
      var t = expectedTotal(), p = chosenPlan();
      bar.querySelector("[data-xy-total]").textContent = t == null ? "Choose dates" : fmt(t);
      bar.querySelector("[data-xy-sub]").textContent = t == null ? "" : (data.nights + (data.nights === 1 ? " night" : " nights") + (p ? " · taxes included" : ""));
    }
    form.addEventListener("change", function (e) {
      if (e.target && e.target.name === "extras") wantAddons[e.target.getAttribute("data-id")] = e.target.checked;
      pendingKey = null; renderBar(); renderPolicy();
    });

    function load() {
      var d = dates(); var mine = ++seq;
      cards.setAttribute("aria-busy", "true");
      note("Checking rooms and prices…");
      var q = "checkin=" + d.a + "&checkout=" + d.b + "&adults=" + encodeURIComponent(field("adults") || "2") + "&children=" + encodeURIComponent(field("children") || "0") + "&rooms=" + encodeURIComponent(field("rooms") || "1") + "&visit=" + encodeURIComponent(visit);
      send("GET", "/api/public/rates?" + q).then(function (r) {
        if (mine !== seq) return;
        if (!r.ok) { cards.setAttribute("aria-busy", "false"); note(r.body && r.body.error ? r.body.error : "We couldn't load the prices.", true); return; }
        data = r.body; money = moneyFor(data.currency);
        renderRooms(); renderPlans(); renderAddons(); fixTexts(); renderPolicy();
        var anyOpen = data.roomTypes.some(function (t) { return t.open && !t.fitsProblem; });
        var text = !anyOpen ? "Nothing is available for these dates. Try different dates." : d.real ? "Prices for your dates, with taxes and service charge, as the hotel charges them." : "Prices shown are for tomorrow night. Choose your dates to see the price for your stay.";
        note(text, !anyOpen); announce(text);
        if (!anyOpen) showAlternatives((data.roomTypes.filter(function (t) { return t.alternatives && t.alternatives.length; })[0]) || null);
        fire(); renderBar();
      }).catch(function () { if (mine === seq) { cards.setAttribute("aria-busy", "false"); note("We couldn't load the prices. Please check your connection and try again.", true); } });
    }
    function later() { clearTimeout(timer); timer = setTimeout(load, 250); }
    ["checkin", "checkout", "adults", "children", "rooms"].forEach(function (n) { var el = form.querySelector('[name="' + n + '"]'); if (el) el.addEventListener("change", later); });
    inEl.addEventListener("input", later); outEl.addEventListener("input", later);
    roomSel.addEventListener("change", function () { if (data) { renderPlans(); renderPolicy(); fire(); renderBar(); } });
    form.addEventListener("submit", function (e) {
      var chosen = form.querySelector('input[name="rate"]:checked');
      if (!chosen || !roomSel.value) { e.preventDefault(); e.stopImmediatePropagation(); note("Choose a room and a rate that is available for your dates.", true); }
    }, true);

    /* Email typed: remember the stay so one reminder can go out if the visitor leaves. */
    var emailEl = form.querySelector('[name="email"]');
    function remember() {
      if (!emailEl || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailEl.value.trim())) return;
      var d = dates();
      fetch("/api/public/web-session", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visit: visit, email: emailEl.value.trim(), firstName: field("first-name"), checkIn: d.real ? d.a : undefined, checkOut: d.real ? d.b : undefined, adults: parseInt(field("adults"), 10) || undefined, children: parseInt(field("children"), 10) || 0, rooms: parseInt(field("rooms"), 10) || 1, roomType: roomSel.value, ratePlan: wantPlan }) }).catch(function () {});
    }
    if (emailEl) emailEl.addEventListener("blur", remember);

    /* Called by the template's submit handler once the fields are valid. */
    window.__xyvooBook = function (f, st, s) {
      if (window.__xyvooRequestMode || !data) return false;
      var p = chosenPlan(); if (!p) return false;
      if (busy) return true;
      busy = true;
      var get = function (n) { var el = f.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ""; };
      var d = dates();
      if (!pendingKey) pendingKey = rand();
      var total = expectedTotal();
      var addons = chosenAddons();
      var body = { claimKey: pendingKey, visit: visit, roomTypeCode: roomSel.value, ratePlan: p.code, checkIn: d.a, checkOut: d.b, adults: s.adults, children: s.children, rooms: s.rooms,
        addons: addons.map(function (a) { return a.id; }), expectedTotal: total,
        guest: { firstName: get("first-name"), lastName: get("last-name"), email: get("email"), phone: get("phone") },
        arrivalTime: get("arrival"), requests: get("requests"), marketingOptIn: !!(f.querySelector('[name="marketing"]') || {}).checked, company: get("company") };
      if (submit) { submit.disabled = true; submit.setAttribute("aria-busy", "true"); }
      if (st) { st.className = "form-status"; st.textContent = "Confirming your booking…"; }
      function done(ok) { busy = false; if (submit) { submit.disabled = false; submit.removeAttribute("aria-busy"); } if (!ok) return; }
      send("POST", "/api/public/book", body).then(function (r) {
        var b = r.body || {};
        if (r.ok && b.ok) {
          try {
            sessionStorage.setItem("xyvooBooking", JSON.stringify(b));
            sessionStorage.setItem("hotelBooking", JSON.stringify({ name: get("first-name"), room: s.room + (s.rooms > 1 ? " × " + s.rooms : ""), dates: pretty(d.a) + " to " + pretty(d.b), guests: s.adults + (s.adults === 1 ? " adult" : " adults") + (s.children ? ", " + s.children + (s.children === 1 ? " child" : " children") : ""), rate: s.rate, extras: addons.length ? addons.map(function (a) { return a.name; }).join(", ") : "None", total: fmt(b.total), reference: (b.bookings || []).map(function (x) { return x.code; }).join(", ") }));
          } catch (e) {}
          window.location.href = f.dataset.redirect || "booking-confirmation.html";
          return;
        }
        pendingKey = b.code === "busy" ? pendingKey : null;
        if (b.mode === "request") { window.__xyvooRequestMode = true; done(false); if (st) { st.className = "form-status"; st.textContent = "This hotel confirms each booking itself. Press the button once more to send your request."; } if (submit) submit.textContent = "Send booking request"; return; }
        var msg = b.error || "We couldn't make your booking.";
        if (b.code === "price_changed") msg = msg + " The new total is " + fmt(b.total) + ". Press Confirm booking again to accept it.";
        if (st) { st.className = "form-status is-error"; st.textContent = msg + (r.status >= 500 ? " If it keeps happening, please call us." : ""); }
        announce(msg);
        done(false);
        if (b.code === "unavailable" || b.code === "price_changed" || b.code === "restricted") load();
      }).catch(function () {
        /* The same key is kept, so pressing again can't make a second booking. */
        if (st) { st.className = "form-status is-error"; st.textContent = "We couldn't reach the hotel. Check your connection and press the button again: you won't be booked twice."; }
        done(false);
      });
      return true;
    };
    load();
  })();

  /* ------------------------------------------------------------------ confirmation page */
  var conf = document.querySelector("[data-booking-confirmation]");
  if (conf) (function () {
    var b = null;
    try { b = JSON.parse(sessionStorage.getItem("xyvooBooking") || "null"); } catch (e) { b = null; }
    if (!b || !b.ok) return;
    var money = moneyFor(b.currency);
    var codes = (b.bookings || []).map(function (x) { return x.code; });
    var first = codes[0] || "";
    function setText(sel, text) { var el = conf.querySelector(sel); if (el) el.textContent = text; }
    setText('[data-conf="reference"]', codes.join(", "));
    var h1 = conf.querySelector("h1"); if (h1) h1.textContent = "Your booking is confirmed.";
    setText(".lead", "We have emailed your confirmation to " + b.guestEmail + ". Keep your booking number: " + first + ".");
    var secure = document.querySelector(".secure-note"); if (secure && secure.lastChild) secure.lastChild.textContent = "Booking confirmed · nothing charged online";
    var steps = conf.querySelector("ol.next-steps");
    if (steps) {
      var li = function (t, d) { return "<li><span><strong>" + esc(t) + "</strong> " + esc(d) + "</span></li>"; };
      var html = li("Check your email.", "Your confirmation and cancellation terms are on their way.");
      if (b.deposit && b.deposit.required > 0) html += li("Pay your deposit.", "The hotel asks for " + money.format(b.deposit.required) + (b.deposit.dueDate ? " by " + pretty(b.deposit.dueDate) : "") + ". " + (b.paymentNote || "The hotel will contact you about how to pay."));
      html += li("Pay the rest at the hotel.", "Nothing else is charged online.");
      steps.innerHTML = html;
    }
    var next = conf.querySelector("#next-title"); if (next) next.textContent = "What happens next";
    var help = conf.querySelector("#help-title"); if (help && help.parentNode) {
      var link = help.parentNode.querySelector("a[href^='manage-booking']");
      if (link) link.setAttribute("href", "manage-booking.html?ref=" + encodeURIComponent(first));
    }
    var sumH = conf.querySelector("#conf-summary-title"); if (sumH) sumH.textContent = "Your booking";
    var dl = conf.querySelector(".summary dl");
    if (dl) {
      var dtTotal = dl.querySelector("dt.total"); if (dtTotal) dtTotal.textContent = "Total (taxes included)";
      var set = function (k, v) { var el = dl.querySelector('[data-conf="' + k + '"]'); if (el) el.textContent = v; };
      set("room", b.roomName + (codes.length > 1 ? " × " + codes.length : "")); set("dates", pretty(b.checkIn) + " to " + pretty(b.checkOut) + " (" + b.nights + (b.nights === 1 ? " night" : " nights") + ")");
      set("rate", b.planName); set("total", money.format(b.total));
      set("extras", (b.addons || []).length ? b.addons.map(function (a) { return a.name; }).join(", ") : "None");
    }
    var muted = conf.querySelector(".summary .muted");
    if (muted) muted.textContent = (b.cancellation || []).join(" ");
  })();

  /* ------------------------------------------------------------------ manage your booking */
  var mform = document.querySelector('form[data-reveal="booking-found"]');
  if (mform) (function () {
    var panel = document.getElementById("booking-found");
    if (!panel) return;
    var refEl = mform.querySelector('[name="ref"]'), emailEl = mform.querySelector('[name="email"]');
    var params = new URLSearchParams(window.location.search);
    if (refEl && params.get("ref")) refEl.value = params.get("ref");
    var hint = document.getElementById("mb-ref-hint"); if (hint) hint.textContent = "It's in your confirmation email and starts with XYV.";
    var cur = null;

    function say(text, bad) { var el = panel.querySelector("[data-mb-msg]"); if (el) { el.textContent = text; el.style.fontWeight = bad ? "600" : "400"; } announce(text); }
    function render(b, message) {
      cur = b; var money = moneyFor(b.currency);
      var cancelled = b.status === "cancelled";
      var html = '<div class="panel__head"><h2 id="found-title">Booking ' + esc(b.code) + '</h2><span class="status">' + (cancelled ? "Cancelled" : b.status === "checked_in" ? "Staying now" : "Confirmed") + "</span></div>"
        + '<dl class="spec"><dt>Guest</dt><dd>' + esc(b.guestName) + "</dd><dt>Room</dt><dd>" + esc(b.roomName) + "</dd><dt>Dates</dt><dd>" + esc(pretty(b.checkIn)) + " to " + esc(pretty(b.checkOut)) + " (" + b.nights + (b.nights === 1 ? " night" : " nights") + ")</dd>"
        + "<dt>Guests</dt><dd>" + b.adults + (b.adults === 1 ? " adult" : " adults") + (b.children ? ", " + b.children + (b.children === 1 ? " child" : " children") : "") + "</dd>"
        + (b.planName ? "<dt>Rate</dt><dd>" + esc(b.planName) + "</dd>" : "")
        + (b.addons.length ? "<dt>Add-ons</dt><dd>" + esc(b.addons.map(function (a) { return a.name; }).join(", ")) + "</dd>" : "")
        + "<dt>Total</dt><dd>" + money.format(b.total) + " (taxes included)</dd>"
        + (b.deposit.required > 0 ? "<dt>Deposit</dt><dd>" + money.format(b.deposit.required) + (b.deposit.paid > 0 ? ", received " + money.format(b.deposit.paid) : b.deposit.dueDate ? ", due " + esc(pretty(b.deposit.dueDate)) : "") + "</dd>" : "")
        + "</dl>";
      if (b.cancellation.length && !cancelled) html += "<p>" + esc(b.cancellation.join(" ")) + "</p>";
      if (cancelled && b.cancellationFee > 0) html += "<p>Cancellation fee under the hotel's policy: " + money.format(b.cancellationFee) + ".</p>";
      html += '<p role="status" data-mb-msg tabindex="-1">' + esc(message || b.blocked || "") + "</p>";
      if (b.canChange) html += '<div class="xy-actions"><button type="button" class="btn btn--outline btn--sm" data-mb-change>Change dates</button><button type="button" class="btn btn--outline btn--sm" data-mb-cancel>Cancel this booking</button></div><div data-mb-area></div>';
      panel.innerHTML = html; panel.hidden = false; panel.focus();
      var area = panel.querySelector("[data-mb-area]");
      var changeBtn = panel.querySelector("[data-mb-change]"), cancelBtn = panel.querySelector("[data-mb-cancel]");
      if (changeBtn) changeBtn.addEventListener("click", function () {
        area.innerHTML = '<div class="xy-change"><div class="field"><label for="mb-in">New check-in</label><input class="input" id="mb-in" type="date" value="' + b.checkIn + '" min="' + iso(new Date()) + '"></div><div class="field"><label for="mb-out">New check-out</label><input class="input" id="mb-out" type="date" value="' + b.checkOut + '"></div>'
          + '<div class="xy-actions"><button type="button" class="btn btn--outline btn--sm" data-mb-price>See the new price</button><button type="button" class="btn btn--primary btn--sm" data-mb-apply disabled>Confirm the change</button></div></div>';
        var inn = area.querySelector("#mb-in"), out = area.querySelector("#mb-out"), apply = area.querySelector("[data-mb-apply]");
        function invalidate() { apply.disabled = true; }
        inn.addEventListener("change", invalidate); out.addEventListener("change", invalidate);
        area.querySelector("[data-mb-price]").addEventListener("click", function () {
          say("Checking those dates…");
          send("POST", "/api/public/manage", { action: "preview", code: b.code, email: emailEl.value.trim(), checkIn: inn.value, checkOut: out.value }).then(function (r) {
            var p = r.body || {};
            if (!r.ok || !p.ok) { say(p.error || "Those dates can't be booked.", true); apply.disabled = true; return; }
            if (p.restrictions && p.restrictions.length) { say(p.restrictions.join(" "), true); apply.disabled = true; return; }
            var diff = p.difference;
            say("New total " + money.format(p.newTotal) + " for " + p.nights + (p.nights === 1 ? " night" : " nights") + (diff === 0 ? ", the same as now." : diff > 0 ? ", " + money.format(diff) + " more than now." : ", " + money.format(-diff) + " less than now.") + " Press Confirm the change to keep these dates.");
            apply.disabled = false;
          }).catch(function () { say("We couldn't check those dates. Please try again.", true); });
        });
        apply.addEventListener("click", function () {
          apply.disabled = true; say("Changing your booking…");
          send("POST", "/api/public/manage", { action: "change", code: b.code, email: emailEl.value.trim(), checkIn: inn.value, checkOut: out.value }).then(function (r) {
            var p = r.body || {};
            if (r.ok && p.ok && p.booking) { render(p.booking, p.message); return; }
            say(p.error || "We couldn't change your booking.", true);
          }).catch(function () { say("We couldn't change your booking. Please try again.", true); });
        });
      });
      if (cancelBtn) cancelBtn.addEventListener("click", function () {
        var fee = b.cancelNow ? b.cancelNow.fee : 0;
        area.innerHTML = '<div class="xy-change"><p><strong>' + (fee > 0 ? "Cancelling now costs " + esc(money.format(fee)) + "." : "Cancelling now is free.") + "</strong> " + esc(b.cancelNow ? b.cancelNow.summary : "") + "</p>"
          + '<div class="xy-actions"><button type="button" class="btn btn--primary btn--sm" data-mb-yes>Yes, cancel my booking</button><button type="button" class="btn btn--outline btn--sm" data-mb-no>Keep my booking</button></div></div>';
        area.querySelector("[data-mb-no]").addEventListener("click", function () { area.innerHTML = ""; });
        area.querySelector("[data-mb-yes]").addEventListener("click", function (ev) {
          ev.target.disabled = true; say("Cancelling…");
          send("POST", "/api/public/manage", { action: "cancel", code: b.code, email: emailEl.value.trim() }).then(function (r) {
            var p = r.body || {};
            if (r.ok && p.ok && p.booking) { render(p.booking, p.message); return; }
            say(p.error || "We couldn't cancel your booking.", true); ev.target.disabled = false;
          }).catch(function () { say("We couldn't cancel your booking. Please try again.", true); ev.target.disabled = false; });
        });
      });
    }

    mform.addEventListener("submit", function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      var code = (refEl.value || "").trim(), email = (emailEl.value || "").trim();
      if (!code || !email) { panel.hidden = false; panel.innerHTML = '<p role="status">Enter your booking number and the email on the booking.</p>'; return; }
      panel.hidden = false; panel.innerHTML = '<p role="status">Finding your booking…</p>';
      send("POST", "/api/public/manage", { action: "lookup", code: code, email: email }).then(function (r) {
        if (r.ok && r.body && r.body.booking) { render(r.body.booking); return; }
        panel.innerHTML = '<p role="status" style="font-weight:600">' + esc((r.body && r.body.error) || "We couldn't find that booking.") + "</p>";
      }).catch(function () { panel.innerHTML = '<p role="status" style="font-weight:600">We couldn\'t reach the hotel. Please try again.</p>'; });
    }, true);
  })();
})();
`;
