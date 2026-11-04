/*
 * A hotel's live website uses the template's own booking page, but its rooms and prices come from the
 * hotel's rate book, not the template's sample text. The route serves the template's script with the
 * hotel's currency, then this code on the end: it asks /api/public/rates for the stay on the form and
 * rebuilds the room list and the rate choices from the answer. The template's own summary then adds
 * up the nightly price × nights × rooms, so what the guest sees is what the front desk would charge
 * (room price, before taxes), and the request that is sent names the same room and plan.
 */

/** The template's money formatter is built for one currency; this swaps in the hotel's. */
export function withHotelCurrency(templateScript: string, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "NGN";
  return templateScript.replace(/new Intl\.NumberFormat\("en-GB", \{ style: "currency", currency: "GBP" \}\)/, `new Intl.NumberFormat("en-GB", { style: "currency", currency: "${code}", maximumFractionDigits: 0 })`);
}

export const LIVE_RATES_SCRIPT = `
;(function () {
  var form = document.querySelector("[data-booking-form]");
  if (!form) return;
  var roomSel = form.querySelector('[name="room"]');
  var cards = form.querySelector(".radio-cards");
  var inEl = form.querySelector("[data-checkin]");
  var outEl = form.querySelector("[data-checkout]");
  if (!roomSel || !cards || !inEl || !outEl) return;

  var data = null;
  var money = null;
  var timer = null;
  var seq = 0;
  var wantPlan = "";

  function iso(d) { return d.toISOString().slice(0, 10); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function fmt(n) { return money ? money.format(n) : String(Math.round(n)); }
  function field(name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value : ""; }
  function fire() { form.dispatchEvent(new Event("change", { bubbles: true })); }

  function dates() {
    var a = inEl.value, b = outEl.value;
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(a) && /^\\d{4}-\\d{2}-\\d{2}$/.test(b) && b > a) return { a: a, b: b, real: true };
    var t = new Date(); t.setUTCDate(t.getUTCDate() + 1);
    var u = new Date(t); u.setUTCDate(u.getUTCDate() + 1);
    return { a: iso(t), b: iso(u), real: false };
  }

  function cheapest(type) {
    var best = null;
    type.plans.forEach(function (p) { if (p.bookable && (!best || p.averageRate < best.averageRate)) best = p; });
    return best;
  }

  function renderRooms() {
    var keep = roomSel.value;
    roomSel.innerHTML = "";
    data.roomTypes.forEach(function (t) {
      var base = cheapest(t);
      var o = document.createElement("option");
      o.value = t.id;
      o.setAttribute("data-name", t.name);
      o.setAttribute("data-rate", base ? String(base.averageRate) : "0");
      var open = base && t.available > 0;
      o.disabled = !open;
      o.textContent = t.name + (open ? " (from " + fmt(base.averageRate) + " a night)" : " (not available for these dates)");
      roomSel.appendChild(o);
    });
    var still = Array.prototype.some.call(roomSel.options, function (o) { return o.value === keep && !o.disabled; });
    if (still) roomSel.value = keep;
    else {
      var first = Array.prototype.find.call(roomSel.options, function (o) { return !o.disabled; });
      if (first) roomSel.value = first.value;
    }
  }

  function renderPlans() {
    var type = data.roomTypes.filter(function (t) { return t.id === roomSel.value; })[0];
    var chosen = form.querySelector('input[name="rate"]:checked');
    if (chosen) wantPlan = chosen.value;
    cards.innerHTML = "";
    if (!type) return;
    var base = cheapest(type);
    var firstOpen = null;
    type.plans.forEach(function (p) {
      var add = base && p.bookable ? Math.max(0, p.averageRate - base.averageRate) : 0;
      var label = document.createElement("label");
      label.className = "radio-card";
      var terms = [p.boardBasis, p.refundable ? "Free cancellation" : "Non-refundable", p.prepayRequired ? "Pay when you book" : ""].filter(Boolean).join(" · ");
      var note = p.bookable ? terms : p.reasons.join(" ");
      label.innerHTML = '<input type="radio" name="rate" value="' + esc(p.code) + '" data-add="' + add + '" data-name="' + esc(p.name) + '"' + (p.bookable ? "" : " disabled") + '>'
        + "<span><strong>" + esc(p.name) + "</strong><small>" + esc(note) + "</small></span>"
        + "<span>" + (!p.bookable ? "Not available" : add > 0 ? "+" + fmt(add) + " a night" : "Included") + "</span>";
      cards.appendChild(label);
      if (p.bookable && !firstOpen) firstOpen = label.firstChild;
    });
    var want = cards.querySelector('input[value="' + wantPlan.replace(/"/g, "") + '"]:not([disabled])');
    var pick = want || firstOpen;
    if (pick) pick.checked = true;
  }

  function note(text) {
    var el = form.querySelector("[data-live-rates-note]");
    if (!el) {
      el = document.createElement("p");
      el.setAttribute("data-live-rates-note", "");
      el.setAttribute("role", "status");
      el.style.cssText = "margin:8px 0;font-size:14px";
      cards.parentNode.insertBefore(el, cards);
    }
    el.textContent = text;
  }

  /* The template says its sample prices include VAT; the hotel's room prices are before taxes and service charge. */
  function fixTaxText() {
    var sum = document.querySelector("[data-booking-summary]");
    if (!sum) return;
    Array.prototype.forEach.call(sum.querySelectorAll("*"), function (el) {
      if (el.children.length === 0 && /^Prices include VAT/i.test(el.textContent)) {
        el.textContent = "Room prices, before taxes and service charge, which the hotel adds. You pay at the hotel. Nothing is charged online.";
      }
    });
  }

  function load() {
    var d = dates();
    var mine = ++seq;
    var q = "checkin=" + d.a + "&checkout=" + d.b + "&adults=" + encodeURIComponent(field("adults") || "2") + "&children=" + encodeURIComponent(field("children") || "0");
    fetch("/api/public/rates?" + q, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (mine !== seq) return;
        if (!r.ok) { note(r.body && r.body.error ? r.body.error : "We couldn't load the prices."); return; }
        data = r.body;
        try { money = new Intl.NumberFormat("en-GB", { style: "currency", currency: data.currency, maximumFractionDigits: 0 }); } catch (e) { money = null; }
        renderRooms();
        renderPlans();
        note(d.real ? "Prices for your dates, as the hotel charges them. Taxes are added at the hotel." : "Prices shown are for tomorrow night. Choose your dates to see the price for your stay.");
        fire();
        fixTaxText();
      })
      .catch(function () { if (mine === seq) note("We couldn't load the prices. Please try again or contact the hotel."); });
  }

  function later() { clearTimeout(timer); timer = setTimeout(load, 250); }
  ["checkin", "checkout", "adults", "children"].forEach(function (n) {
    var el = form.querySelector('[name="' + n + '"]');
    if (el) el.addEventListener("change", later);
  });
  inEl.addEventListener("input", later);
  outEl.addEventListener("input", later);
  roomSel.addEventListener("change", function () { if (data) { renderPlans(); fire(); } });
  form.addEventListener("submit", function (e) {
    var chosen = form.querySelector('input[name="rate"]:checked');
    if (!chosen || !roomSel.value) { e.preventDefault(); e.stopImmediatePropagation(); note("Choose a room and a rate that is available for your dates."); }
  }, true);
  load();
})();
`;
