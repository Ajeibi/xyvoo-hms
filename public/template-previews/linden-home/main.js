/* Linden Home storefront template: progressive enhancement.
   Every page works without this file; it adds the mobile menu, dropdowns,
   search panel, review carousel controls and form feedback. */
(function () {
  "use strict";

  var desktop = window.matchMedia("(min-width: 1024px)");
  var announcer = document.getElementById("announcer");

  function announce(message) {
    if (!announcer) return;
    announcer.textContent = "";
    window.setTimeout(function () { announcer.textContent = message; }, 50);
  }

  /* ---------- Disclosure helper ---------- */
  function setExpanded(button, panel, open) {
    button.setAttribute("aria-expanded", String(open));
    if (panel) panel.classList.toggle("is-open", open);
  }

  /* ---------- Mobile menu ---------- */
  var menuBtn = document.querySelector("[data-menu-toggle]");
  var nav = document.getElementById("site-nav");

  function closeMenu(returnFocus) {
    if (!menuBtn || menuBtn.getAttribute("aria-expanded") !== "true") return;
    setExpanded(menuBtn, nav, false);
    menuBtn.setAttribute("aria-label", "Open menu");
    if (returnFocus) menuBtn.focus();
  }

  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = menuBtn.getAttribute("aria-expanded") !== "true";
      setExpanded(menuBtn, nav, open);
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (open) closeSearch(false);
    });
    desktop.addEventListener("change", function (e) { if (e.matches) closeMenu(false); });
  }

  /* ---------- Sub-menus (disclosure navigation) ---------- */
  var toggles = Array.prototype.slice.call(document.querySelectorAll(".nav-toggle"));

  function closeSubmenus(except) {
    toggles.forEach(function (t) { if (t !== except) t.setAttribute("aria-expanded", "false"); });
  }

  toggles.forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") !== "true";
      closeSubmenus(toggle);
      toggle.setAttribute("aria-expanded", String(open));
    });
  });

  document.addEventListener("click", function (e) {
    if (desktop.matches && !e.target.closest(".nav-list")) closeSubmenus(null);
  });

  /* Close a desktop sub-menu when focus leaves it */
  document.addEventListener("focusin", function (e) {
    if (!desktop.matches) return;
    toggles.forEach(function (t) {
      if (t.getAttribute("aria-expanded") === "true" && !t.parentElement.contains(e.target)) {
        t.setAttribute("aria-expanded", "false");
      }
    });
  });

  /* ---------- Search panel ---------- */
  var searchBtn = document.querySelector("[data-search-toggle]");
  var search = document.getElementById("site-search");

  function closeSearch(returnFocus) {
    if (!searchBtn || searchBtn.getAttribute("aria-expanded") !== "true") return;
    setExpanded(searchBtn, search, false);
    if (returnFocus) searchBtn.focus();
  }

  if (searchBtn && search) {
    searchBtn.addEventListener("click", function () {
      var open = searchBtn.getAttribute("aria-expanded") !== "true";
      setExpanded(searchBtn, search, open);
      if (open) {
        closeMenu(false);
        var input = search.querySelector("input");
        if (input) input.focus();
      }
    });
  }

  /* ---------- Escape closes whatever is open ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var openToggle = toggles.filter(function (t) { return t.getAttribute("aria-expanded") === "true"; })[0];
    if (openToggle) { openToggle.setAttribute("aria-expanded", "false"); openToggle.focus(); return; }
    if (search && search.classList.contains("is-open")) { closeSearch(true); return; }
    closeMenu(true);
  });

  /* ---------- Review carousel ---------- */
  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var track = root.querySelector(".carousel");
    var prev = root.querySelector("[data-prev]");
    var next = root.querySelector("[data-next]");
    if (!track || !prev || !next) return;

    function update() {
      var max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    }
    function step(dir) {
      var item = track.querySelector("li");
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      track.scrollBy({ left: dir * (item ? item.offsetWidth + gap : track.clientWidth) });
    }
    prev.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  });

  /* ---------- Wishlist ---------- */
  document.querySelectorAll("[data-wishlist]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      announce((on ? "Saved " : "Removed ") + btn.dataset.wishlist + (on ? " to" : " from") + " your wishlist");
    });
  });

  /* ---------- Add to basket (demo) ---------- */
  var badge = document.querySelector("[data-basket-count]");
  var basketLink = document.querySelector("[data-basket-link]");
  document.querySelectorAll("[data-add-to-basket]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!badge) return;
      var count = (parseInt(badge.textContent, 10) || 0) + 1;
      badge.textContent = String(count);
      if (basketLink) basketLink.setAttribute("aria-label", "Basket, " + count + (count === 1 ? " item" : " items"));
      announce(btn.dataset.addToBasket + " added to your basket");
    });
  });

  /* ---------- Forms: inline validation + demo success ---------- */
  function fieldError(field) {
    var id = field.id + "-error";
    var msg = document.getElementById(id);
    var custom = "";
    /* Browsers only apply minlength to typed input, so check it explicitly
       (covers autofill and password managers too). */
    if (field.minLength > 0 && field.value && field.value.length < field.minLength) {
      custom = field.dataset.invalid || "This is too short.";
    }
    /* Check-out must be after check-in. */
    if (field.hasAttribute("data-checkout") && field.value && field.form) {
      var checkin = field.form.querySelector("[data-checkin]");
      if (checkin && checkin.value && field.value <= checkin.value) custom = field.dataset.invalid || "Check-out must be after check-in.";
    }
    field.setCustomValidity(custom);
    if (field.validity.valid) {
      field.removeAttribute("aria-invalid");
      if (msg) msg.hidden = true;
      return;
    }
    field.setAttribute("aria-invalid", "true");
    if (msg) {
      msg.hidden = false;
      msg.textContent = field.validity.valueMissing
        ? field.dataset.required || "Please fill in this field."
        : field.validity.rangeUnderflow && !field.hasAttribute("data-checkout")
          ? "Choose a date from today onwards."
          : field.dataset.invalid || "Please check this field.";
    }
  }

  /* Returns the first invalid field (and shows every error), or null. */
  function validateForm(form) {
    var fields = Array.prototype.slice.call(form.querySelectorAll("input, select, textarea"));
    fields.forEach(fieldError);
    return fields.filter(function (f) { return !f.validity.valid; })[0] || null;
  }

  document.querySelectorAll("form[data-demo-form]").forEach(function (form) {
    var status = form.querySelector(".form-status");

    form.setAttribute("novalidate", "");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = validateForm(form);
      if (firstBad) {
        firstBad.focus();
        if (status) { status.className = "form-status"; status.textContent = ""; }
        return;
      }
      if (form.hasAttribute("data-booking-form")) {
        submitBooking(form, status);
        return;
      }
      /* Replace with a real submission (fetch to your endpoint). */
      if (form.dataset.redirect) {
        window.location.href = form.dataset.redirect;
        return;
      }
      if (form.dataset.reveal) {
        var target = document.getElementById(form.dataset.reveal);
        if (target) {
          target.hidden = false;
          target.focus();
        }
        return;
      }
      if (status) {
        status.className = "form-status is-success";
        status.textContent = form.dataset.success || "Thank you.";
      }
      form.reset();
    });
    form.querySelectorAll("input, select, textarea").forEach(function (f) {
      f.addEventListener("blur", function () { if (f.getAttribute("aria-invalid") === "true") fieldError(f); });
    });
  });

  /* ---------- Money ---------- */
  var money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  /* ---------- Shop filters (mobile disclosure) ---------- */
  var filtersBtn = document.querySelector("[data-filters-toggle]");
  var filters = document.getElementById("filters");
  if (filtersBtn && filters) {
    filtersBtn.addEventListener("click", function () {
      setExpanded(filtersBtn, filters, filtersBtn.getAttribute("aria-expanded") !== "true");
    });
  }

  /* ---------- Product gallery ---------- */
  var mainImage = document.querySelector("[data-gallery-main]");
  var thumbs = Array.prototype.slice.call(document.querySelectorAll("[data-thumb]"));
  thumbs.forEach(function (thumb) {
    thumb.addEventListener("click", function () {
      thumbs.forEach(function (t) { t.setAttribute("aria-pressed", String(t === thumb)); });
      if (mainImage) {
        mainImage.className = "media gallery-main " + (thumb.dataset.tone || "");
        var label = mainImage.querySelector(".media__label");
        if (label) label.lastChild.textContent = thumb.dataset.thumb;
      }
    });
  });

  /* ---------- Selected option labels (e.g. "Colour: Oat") ---------- */
  document.querySelectorAll("[data-option-output]").forEach(function (out) {
    var group = document.querySelectorAll('input[name="' + out.dataset.optionOutput + '"]');
    group.forEach(function (input) {
      input.addEventListener("change", function () { out.textContent = input.value; });
    });
  });

  /* ---------- Quantity steppers ---------- */
  document.querySelectorAll("[data-qty]").forEach(function (qty) {
    var input = qty.querySelector("input");
    qty.querySelectorAll("[data-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var min = parseInt(input.min, 10) || 1;
        var max = parseInt(input.max, 10) || 99;
        var next = Math.min(max, Math.max(min, (parseInt(input.value, 10) || min) + parseInt(btn.dataset.step, 10)));
        input.value = String(next);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  });

  /* ---------- Basket ---------- */
  var cart = document.querySelector("[data-cart]");
  if (cart) {
    var freeOver = parseFloat(cart.dataset.freeOver) || 0;
    var deliveryCost = parseFloat(cart.dataset.delivery) || 0;

    function recalc() {
      var lines = cart.querySelectorAll("[data-line]");
      var subtotal = 0;
      var items = 0;
      lines.forEach(function (line) {
        var qty = parseInt(line.querySelector("input").value, 10) || 1;
        var price = parseFloat(line.dataset.price);
        subtotal += qty * price;
        items += qty;
        line.querySelector("[data-line-total]").textContent = money.format(qty * price);
      });
      var delivery = subtotal === 0 || subtotal >= freeOver ? 0 : deliveryCost;
      cart.querySelector("[data-subtotal]").textContent = money.format(subtotal);
      cart.querySelector("[data-delivery-cost]").textContent = delivery === 0 ? "Free" : money.format(delivery);
      cart.querySelector("[data-total]").textContent = money.format(subtotal + delivery);
      var countEl = cart.querySelector("[data-item-count]");
      if (countEl) countEl.textContent = items + (items === 1 ? " item" : " items");
      if (badge) badge.textContent = String(items);
      if (basketLink) basketLink.setAttribute("aria-label", "Basket, " + items + (items === 1 ? " item" : " items"));
      if (lines.length === 0) {
        cart.querySelector("[data-cart-full]").hidden = true;
        var empty = cart.querySelector("[data-cart-empty]");
        empty.hidden = false;
        empty.querySelector("h2").focus();
      }
    }

    cart.addEventListener("change", function (e) { if (e.target.matches("[data-line] input")) recalc(); });
    cart.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var line = btn.closest("[data-line]");
        var name = line.dataset.name;
        var next = line.nextElementSibling || line.previousElementSibling;
        line.remove();
        recalc();
        announce(name + " removed from your basket");
        if (next) { var focusable = next.querySelector("a"); if (focusable) focusable.focus(); }
      });
    });
    recalc();
  }

  /* ---------- Checkout delivery method updates the summary ---------- */
  var checkoutSummary = document.querySelector("[data-checkout-summary]");
  if (checkoutSummary) {
    var sub = parseFloat(checkoutSummary.dataset.subtotal) || 0;
    document.querySelectorAll('input[name="delivery"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        var cost = parseFloat(radio.dataset.cost) || 0;
        checkoutSummary.querySelector("[data-delivery-cost]").textContent = cost === 0 ? "Free" : money.format(cost);
        checkoutSummary.querySelector("[data-total]").textContent = money.format(sub + cost);
      });
    });
  }

  /* ---------- Show / hide a section from a checkbox ---------- */
  document.querySelectorAll("[data-toggle-section]").forEach(function (box) {
    var section = document.getElementById(box.dataset.toggleSection);
    function sync() {
      var show = box.dataset.showWhen === "unchecked" ? !box.checked : box.checked;
      section.hidden = !show;
      section.querySelectorAll("input, select, textarea").forEach(function (f) { f.disabled = !show; });
    }
    box.addEventListener("change", sync);
    sync();
  });

  /* ---------- Password show / hide ---------- */
  document.querySelectorAll("[data-password-toggle]").forEach(function (btn) {
    var input = document.getElementById(btn.getAttribute("aria-controls"));
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.firstChild.nodeValue = show ? "Hide" : "Show";
      announce(show ? "Password shown" : "Password hidden");
    });
  });

  /* ---------- Countdowns ----------
     Counts down to a fixed end date (data-countdown="2026-10-31T23:59:00Z") and then
     says the offer has ended. It never resets: fake urgency is unlawful in the UK
     (Digital Markets, Competition and Consumers Act 2024). Screen readers get the
     end date as static text instead of a ticking clock. */
  var countdowns = document.querySelectorAll("[data-countdown]");
  if (countdowns.length) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var tick = function () {
      var now = Date.now();
      countdowns.forEach(function (el) {
        var left = Math.max(0, new Date(el.dataset.countdown).getTime() - now);
        if (left === 0) {
          el.classList.add("is-ended");
          var ended = el.querySelector("[data-countdown-ended]");
          if (ended) ended.hidden = false;
          return;
        }
        var s = Math.floor(left / 1000);
        var parts = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
        Object.keys(parts).forEach(function (k) {
          var unit = el.querySelector('[data-unit="' + k + '"]');
          if (unit) unit.textContent = pad(parts[k]);
        });
      });
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /* ---------- Tabs (WAI-ARIA tabs pattern, automatic activation) ---------- */
  document.querySelectorAll("[data-tabs]").forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(tab, false); });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") next = tabs[0];
        if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
  });

  /* ---------- Moving ribbon: pause control (WCAG 2.2.2) ---------- */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll("[data-ribbon]").forEach(function (ribbon) {
    var svg = ribbon.querySelector("svg");
    var btn = ribbon.querySelector("[data-ribbon-toggle]");
    if (!svg || !svg.pauseAnimations) return;
    function setPaused(paused) {
      if (paused) svg.pauseAnimations(); else svg.unpauseAnimations();
      if (btn) {
        btn.setAttribute("aria-pressed", String(paused));
        btn.setAttribute("aria-label", paused ? "Play the moving banner" : "Pause the moving banner");
        btn.querySelector("use").setAttribute("href", "icons.svg#" + (paused ? "play" : "pause"));
      }
    }
    if (btn) btn.addEventListener("click", function () { setPaused(btn.getAttribute("aria-pressed") !== "true"); });
    setPaused(reduceMotion.matches);
  });

  /* ==========================================================================
     Hotel booking flow (hotel templates only; everything below is inert elsewhere)
     Search -> availability -> book (request) -> confirmation. No payment.
     ========================================================================== */
  function isoDate(d) {
    return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
  }
  function parseIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function addDays(d, n) { var c = new Date(d.getTime()); c.setDate(c.getDate() + n); return c; }
  function nightsBetween(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000); }
  function prettyDate(s) {
    var d = parseIso(s);
    return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function guestsText(adults, children) {
    return plural(adults, "adult", "adults") + (children > 0 ? ", " + plural(children, "child", "children") : "");
  }

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var params = new URLSearchParams(window.location.search);
  var bookingForm = document.querySelector("[data-booking-form]");
  var needsDefaults = document.querySelector("[data-availability]") || bookingForm;

  /* Current stay, from the URL, falling back to sensible defaults on booking pages */
  var stay = {
    checkin: params.get("checkin") || "",
    checkout: params.get("checkout") || "",
    adults: params.get("adults") || "",
    children: params.get("children") || "",
    rooms: params.get("rooms") || "",
    room: params.get("room") || "",
    rate: params.get("rate") || "",
  };
  if (needsDefaults && !parseIso(stay.checkin)) {
    stay.checkin = isoDate(addDays(today, 14));
    stay.checkout = isoDate(addDays(today, 17));
  }

  /* Date inputs: no past dates, check-out after check-in, prefill from the stay */
  document.querySelectorAll("form").forEach(function (form) {
    var inEl = form.querySelector("[data-checkin]");
    var outEl = form.querySelector("[data-checkout]");
    if (!inEl) return;
    inEl.min = isoDate(today);
    if (stay.checkin && !inEl.value) inEl.value = stay.checkin;
    if (outEl) {
      if (stay.checkout && !outEl.value) outEl.value = stay.checkout;
      var syncOut = function () {
        var d = parseIso(inEl.value);
        if (!d) return;
        outEl.min = isoDate(addDays(d, 1));
        if (!outEl.value || outEl.value <= inEl.value) outEl.value = isoDate(addDays(d, 1));
      };
      inEl.addEventListener("change", syncOut);
      syncOut();
    }
    ["adults", "children", "rooms", "room"].forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (el && stay[name] && el.tagName === "SELECT") el.value = stay[name];
    });
    if (stay.rate) {
      var r = form.querySelector('input[name="rate"][value="' + stay.rate + '"]');
      if (r) r.checked = true;
    }
  });

  /* Stay-search forms submit normally (GET) but validate first */
  document.querySelectorAll("form[data-stay-search]").forEach(function (form) {
    form.setAttribute("novalidate", "");
    form.addEventListener("submit", function (e) {
      var bad = validateForm(form);
      if (bad) { e.preventDefault(); bad.focus(); }
    });
  });

  /* Links that carry the chosen dates and guests to the next step */
  function stayQuery() {
    var q = new URLSearchParams();
    ["checkin", "checkout", "adults", "children", "rooms"].forEach(function (k) { if (stay[k]) q.set(k, stay[k]); });
    return q;
  }
  document.querySelectorAll("a[data-carry-stay]").forEach(function (a) {
    var url = new URL(a.getAttribute("href"), window.location.href);
    stayQuery().forEach(function (v, k) { if (!url.searchParams.has(k)) url.searchParams.set(k, v); });
    a.setAttribute("href", url.pathname.split("/").pop() + url.search);
  });

  /* Availability page: describe the stay and show totals */
  var stayText = document.querySelector("[data-stay-text]");
  if (stayText && parseIso(stay.checkin) && parseIso(stay.checkout)) {
    var n = nightsBetween(stay.checkin, stay.checkout);
    stayText.textContent = prettyDate(stay.checkin) + " to " + prettyDate(stay.checkout) + " · " + plural(n, "night", "nights") + " · " + guestsText(+stay.adults || 2, +stay.children || 0);
    document.querySelectorAll("[data-stay-total]").forEach(function (el) {
      el.textContent = money.format(parseFloat(el.dataset.stayTotal) * n) + " for " + plural(n, "night", "nights");
    });
  }

  /* Booking form: live summary */
  var summary = document.querySelector("[data-booking-summary]");
  function bookingState() {
    var f = bookingForm;
    var roomSel = f.querySelector('[name="room"]');
    var opt = roomSel.options[roomSel.selectedIndex];
    var rate = f.querySelector('input[name="rate"]:checked');
    var checkin = f.querySelector("[data-checkin]").value;
    var checkout = f.querySelector("[data-checkout]").value;
    var nights = parseIso(checkin) && parseIso(checkout) ? Math.max(0, nightsBetween(checkin, checkout)) : 0;
    var rooms = parseInt(f.querySelector('[name="rooms"]').value, 10) || 1;
    var adults = parseInt(f.querySelector('[name="adults"]').value, 10) || 1;
    var children = parseInt(f.querySelector('[name="children"]').value, 10) || 0;
    var nightly = parseFloat(opt.dataset.rate) + (rate ? parseFloat(rate.dataset.add) : 0);
    var stayCost = nightly * nights * rooms;
    var extras = [];
    var extrasCost = 0;
    f.querySelectorAll('input[name="extras"]:checked').forEach(function (x) {
      var price = parseFloat(x.dataset.price) * (x.dataset.per === "night" ? Math.max(nights, 1) : 1);
      extras.push(x.value);
      extrasCost += price;
    });
    return {
      room: opt.dataset.name, roomSlug: opt.value, rooms: rooms,
      rate: rate ? rate.dataset.name : "", rateId: rate ? rate.value : "",
      checkin: checkin, checkout: checkout, nights: nights, adults: adults, children: children,
      nightly: nightly, stayCost: stayCost, extras: extras, extrasCost: extrasCost, total: stayCost + extrasCost,
    };
  }
  function renderSummary() {
    if (!summary) return;
    var s = bookingState();
    var set = function (k, v) { var el = summary.querySelector('[data-sum="' + k + '"]'); if (el) el.textContent = v; };
    set("room", s.room + (s.rooms > 1 ? " × " + s.rooms : ""));
    set("dates", s.nights ? prettyDate(s.checkin) + " to " + prettyDate(s.checkout) : "Choose your dates");
    set("guests", guestsText(s.adults, s.children));
    set("rate", s.rate + " · " + money.format(s.nightly) + " a night");
    var label = summary.querySelector('[data-sum-label="stay"]');
    if (label) label.textContent = s.nights ? plural(s.nights, "night", "nights") + (s.rooms > 1 ? " × " + s.rooms : "") : "Stay";
    set("stay", s.nights ? money.format(s.stayCost) : "None yet");
    set("extras", s.extras.length ? money.format(s.extrasCost) : "None");
    set("total", s.nights ? money.format(s.total) : "None yet");
  }
  if (bookingForm && summary) {
    bookingForm.addEventListener("change", renderSummary);
    bookingForm.addEventListener("input", renderSummary);
    renderSummary();
  }

  function saveBooking(data) {
    try { window.sessionStorage.setItem("hotelBooking", JSON.stringify(data)); } catch (e) { /* storage unavailable: the confirmation page shows placeholders */ }
  }

  function submitBooking(form, status) {
    var s = bookingState();
    var get = function (name) { var el = form.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ""; };
    var payload = {
      hotelSlug: form.dataset.hotel || "",
      room: s.room, ratePlan: s.rate, checkIn: s.checkin, checkOut: s.checkout,
      adults: s.adults, children: s.children, rooms: s.rooms, extras: s.extras,
      estimatedTotal: money.format(s.total),
      guest: { firstName: get("first-name"), lastName: get("last-name"), email: get("email"), phone: get("phone") },
      arrivalTime: get("arrival"), requests: get("requests"),
      marketingOptIn: !!(form.querySelector('[name="marketing"]') || {}).checked,
      company: get("company"),
    };
    var record = {
      name: payload.guest.firstName, room: s.room + (s.rooms > 1 ? " × " + s.rooms : ""),
      dates: prettyDate(s.checkin) + " to " + prettyDate(s.checkout) + " (" + plural(s.nights, "night", "nights") + ")",
      guests: guestsText(s.adults, s.children), rate: s.rate,
      extras: s.extras.length ? s.extras.join(", ") : "None", total: money.format(s.total),
    };
    var button = form.querySelector('button[type="submit"]');
    var done = function (reference) {
      record.reference = reference;
      saveBooking(record);
      window.location.href = form.dataset.redirect;
    };

    if (!form.dataset.endpoint) {
      /* Demo (template previews): nothing is sent anywhere. */
      var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      var ref = "REQ-";
      for (var i = 0; i < 6; i++) ref += alphabet[Math.floor(Math.random() * alphabet.length)];
      done(ref);
      return;
    }

    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    if (status) { status.className = "form-status"; status.textContent = "Sending your request…"; }
    fetch(form.dataset.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (r.ok && r.body && r.body.ok) { done(r.body.reference); return; }
        throw new Error((r.body && r.body.error) || "We couldn't send your request.");
      })
      .catch(function (err) {
        if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
        if (status) { status.className = "form-status is-error"; status.textContent = err.message + " If it keeps happening, please call us."; }
      });
  }

  /* Confirmation page: show what was requested */
  var confirmation = document.querySelector("[data-booking-confirmation]");
  if (confirmation) {
    var saved = null;
    try { saved = JSON.parse(window.sessionStorage.getItem("hotelBooking") || "null"); } catch (e) { saved = null; }
    if (saved) {
      Object.keys(saved).forEach(function (k) {
        var el = confirmation.querySelector('[data-conf="' + k + '"]');
        if (!el) return;
        el.textContent = k === "name" ? (saved.name ? ", " + saved.name : "") : saved[k];
      });
    }
  }
})();
