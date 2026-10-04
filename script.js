/* =========================================================================
   EKO TRANSITCARE — APPLICATION LOGIC
   Complete, self-contained, verified against the current index.html
   ========================================================================= */
(function () {
  "use strict";

  /* =======================================================================
     01. CONFIGURATION
     ======================================================================= */
  const TRANSITCARE_CONFIG = {
    SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
    SUPABASE_ANON_KEY: "YOUR-PUBLIC-ANON-KEY",
    APP_VERSION: "1.0.0",
    GPS_UPDATE_INTERVAL_MS: 12000,
    GPS_STALE_THRESHOLD_MS: 60000,
    BOARDING_WINDOW_MINUTES: 10,
    WAITLIST_OFFER_MINUTES: 5,
    DEFAULT_MAP_CENTER: { lat: 6.5244, lng: 3.3792 },
    DEFAULT_MAP_ZOOM: 12
  };

  const IS_SUPABASE_CONFIGURED =
    !TRANSITCARE_CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
    !TRANSITCARE_CONFIG.SUPABASE_ANON_KEY.includes("YOUR-PUBLIC-ANON-KEY");

  /* =======================================================================
     02. EXTERNAL LIBRARIES
     ======================================================================= */
  const libraryCache = {};
  function loadExternalScript(url) {
    if (libraryCache[url]) return libraryCache[url];
    libraryCache[url] = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        existing.addEventListener("load", resolve);
        existing.addEventListener("error", function () { reject(new Error("Failed: " + url)); });
        return;
      }
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Failed: " + url)); };
      document.head.appendChild(s);
    });
    return libraryCache[url];
  }

  function loadStylesheet(url) {
    if (document.querySelector('link[href="' + url + '"]')) return Promise.resolve();
    return new Promise(function (resolve) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = url;
      l.onload = resolve;
      l.onerror = resolve;
      document.head.appendChild(l);
    });
  }

  const CDN = {
    QRCODE: "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
    LEAFLET_JS: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    LEAFLET_CSS: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  };

  /* =======================================================================
     03. SUPABASE INITIALIZATION
     ======================================================================= */
  let supabase = null;

  function initSupabase() {
    if (!IS_SUPABASE_CONFIGURED) {
      console.warn("[TransitCare] Supabase is not configured.");
      return null;
    }
    if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
      console.error("[TransitCare] Supabase library did not load from CDN.");
      return null;
    }
    try {
      supabase = window.supabase.createClient(
        TRANSITCARE_CONFIG.SUPABASE_URL,
        TRANSITCARE_CONFIG.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            lock: function (_name, acquire) { return acquire(); }
          },
          realtime: { params: { eventsPerSecond: 5 } }
        }
      );
      return supabase;
    } catch (e) {
      console.error("[TransitCare] Supabase init failed:", e);
      return null;
    }
  }

  /* =======================================================================
     04. APPLICATION STATE
     ======================================================================= */
  const AppState = {
    authUser: null,
    profile: null,
    role: null,
    currentView: "home",
    notifications: [],
    channels: { notifications: null, tripLocations: null },
    gpsWatchId: null,
    activeTrip: null
  };

  function resetState() {
    AppState.authUser = null;
    AppState.profile = null;
    AppState.role = null;
    AppState.currentView = "home";
    AppState.notifications = [];
    AppState.activeTrip = null;
    stopAllRealtime();
    stopGpsWatch();
  }

  /* =======================================================================
     05. UTILITIES
     ======================================================================= */
  function escapeHtml(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-NG", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function formatTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === "") return "—";
    const n = Number(amount);
    if (isNaN(n)) return "—";
    return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function formatRelativeTime(iso) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return "—";
    const s = Math.floor(diff / 1000);
    if (s < 10) return "just now";
    if (s < 60) return s + " seconds ago";
    const m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    const h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.floor(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  function getInitials(name) {
    if (!name) return "–";
    const p = String(name).trim().split(/\s+/).slice(0, 2);
    return p.map(function (x) { return x.charAt(0).toUpperCase(); }).join("") || "–";
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function humanizeStatus(s) {
    if (!s) return "—";
    return String(s).replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function generateTripCode() {
    return "TC-" + Math.floor(100 + Math.random() * 900);
  }

  function generateTicketCode() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "TKT-" + stamp + "-" + rand;
  }

  function nowIso() { return new Date().toISOString(); }

  /* =======================================================================
     06. TOAST
     ======================================================================= */
  const Toast = (function () {
    const container = document.getElementById("toast-container");
    const ICONS = { success: "✓", danger: "✕", warning: "⚠", info: "ℹ" };

    function show(title, message, type, duration) {
      if (!container) return;
      const t = document.createElement("div");
      t.className = "toast toast--" + (type || "info");
      t.setAttribute("role", "alert");
      t.innerHTML =
        '<span class="toast__icon" aria-hidden="true">' + (ICONS[type] || ICONS.info) + '</span>' +
        '<div class="toast__content">' +
          '<p class="toast__title">' + escapeHtml(title) + '</p>' +
          (message ? '<p class="toast__message">' + escapeHtml(message) + '</p>' : "") +
        '</div>' +
        '<button type="button" class="toast__close" aria-label="Dismiss">&times;</button>';

      const remove = function () {
        if (!t.isConnected) return;
        t.classList.add("is-leaving");
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
      };

      t.querySelector(".toast__close").addEventListener("click", remove);
      container.appendChild(t);
      if ((duration || 4800) > 0) setTimeout(remove, duration || 4800);
    }

    return {
      success: function (t, m) { show(t, m, "success"); },
      error:   function (t, m) { show(t, m, "danger", 7000); },
      warning: function (t, m) { show(t, m, "warning", 6000); },
      info:    function (t, m) { show(t, m, "info"); }
    };
  })();

  /* =======================================================================
     07. MODAL
     ======================================================================= */
  const Modal = (function () {
    const backdrop = document.getElementById("modal-backdrop");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    const footerEl = document.getElementById("modal-footer");
    const closeBtn = document.getElementById("modal-close-button");
    let lastFocused = null;
    let onCloseCb = null;

    function open(opts) {
      if (!backdrop) return;
      lastFocused = document.activeElement;
      onCloseCb = opts.onClose || null;
      titleEl.textContent = opts.title || "Dialog";
      bodyEl.innerHTML = opts.body || "";
      footerEl.innerHTML = opts.footer || "";
      backdrop.classList.remove("is-hidden");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";

      footerEl.querySelectorAll("[data-modal-action]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (typeof opts.onAction === "function") opts.onAction(b.getAttribute("data-modal-action"), b);
        });
      });

      const focus = bodyEl.querySelector("input,select,textarea,button,[href]");
      setTimeout(function () { (focus || closeBtn).focus(); }, 30);
    }

    function close() {
      if (!backdrop || backdrop.classList.contains("is-hidden")) return;
      backdrop.classList.add("is-hidden");
      backdrop.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      bodyEl.innerHTML = "";
      footerEl.innerHTML = "";
      if (typeof onCloseCb === "function") onCloseCb();
      onCloseCb = null;
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function confirm(opts) {
      return new Promise(function (resolve) {
        open({
          title: opts.title || "Please confirm",
          body: "<p>" + escapeHtml(opts.message || "Are you sure?") + "</p>",
          footer:
            '<button type="button" class="button button--ghost" data-modal-action="cancel">' +
              escapeHtml(opts.cancelLabel || "Cancel") + '</button>' +
            '<button type="button" class="button ' +
              (opts.danger ? "button--danger" : "button--primary") +
              '" data-modal-action="confirm">' +
              escapeHtml(opts.confirmLabel || "Confirm") + '</button>',
          onAction: function (a) { close(); resolve(a === "confirm"); },
          onClose: function () { resolve(false); }
        });
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && backdrop && !backdrop.classList.contains("is-hidden")) close();
    });

    return { open: open, close: close, confirm: confirm };
  })();

  /* =======================================================================
     08. LOADER
     ======================================================================= */
  const Loader = (function () {
    const overlay = document.getElementById("global-loader");
    const textEl = document.getElementById("global-loader-text");
    let count = 0;
    function show(msg) {
      count++;
      if (textEl) textEl.textContent = msg || "Working…";
      if (overlay) {
        overlay.classList.remove("is-hidden");
        overlay.setAttribute("aria-hidden", "false");
      }
    }
    function hide() {
      count = Math.max(0, count - 1);
      if (count === 0 && overlay) {
        overlay.classList.add("is-hidden");
        overlay.setAttribute("aria-hidden", "true");
      }
    }
    return { show: show, hide: hide };
  })();

  function renderLoading(container, msg) {
    if (!container) return;
    container.innerHTML =
      '<div class="loading-state">' +
        '<span class="spinner spinner--small" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(msg || "Loading…") + '</span>' +
      '</div>';
  }

  function renderEmpty(container, opts) {
    if (!container) return;
    container.innerHTML =
      '<div class="empty-state">' +
        '<span class="empty-state__icon" aria-hidden="true">' + escapeHtml(opts.icon || "📭") + '</span>' +
        '<p class="empty-state__title">' + escapeHtml(opts.title || "Nothing here yet") + '</p>' +
        '<p class="empty-state__message">' + escapeHtml(opts.message || "") + '</p>' +
        (opts.actionHtml ? '<div class="empty-state__actions">' + opts.actionHtml + '</div>' : "") +
      '</div>';
  }

  function renderError(container, msg, retry) {
    if (!container) return;
    container.innerHTML =
      '<div class="empty-state">' +
        '<span class="empty-state__icon" aria-hidden="true">⚠️</span>' +
        '<p class="empty-state__title">Something went wrong</p>' +
        '<p class="empty-state__message">' + escapeHtml(msg || "Please try again.") + '</p>' +
        (retry ? '<div class="empty-state__actions"><button type="button" class="button button--secondary" id="retry-button">Retry</button></div>' : "") +
      '</div>';
    if (retry) {
      const b = container.querySelector("#retry-button");
      if (b) b.addEventListener("click", retry);
    }
  }

  /* =======================================================================
     09. VALIDATORS
     ======================================================================= */
  const Validators = {
    required: function (v) { return v !== null && v !== undefined && String(v).trim().length > 0; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()); },
    phone: function (v) {
      const d = String(v).replace(/[^\d]/g, "");
      return d.length >= 7 && d.length <= 15;
    },
    passwordStrength: function (v) {
      const s = String(v || "");
      let score = 0;
      if (s.length >= 8) score++;
      if (/[a-z]/.test(s)) score++;
      if (/[A-Z]/.test(s)) score++;
      if (/\d/.test(s)) score++;
      if (/[^A-Za-z0-9]/.test(s)) score++;
      return score;
    }
  };

  function setFieldError(fieldId, msg) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    const wrapper = input.closest(".field");
    const err = document.querySelector('[data-error-for="' + fieldId + '"]');
    if (msg) {
      if (wrapper) wrapper.classList.add("has-error");
      if (err) err.textContent = msg;
      input.setAttribute("aria-invalid", "true");
    } else {
      if (wrapper) wrapper.classList.remove("has-error");
      if (err) err.textContent = "";
      input.removeAttribute("aria-invalid");
    }
  }

  function clearFormErrors(form) {
    if (!form) return;
    form.querySelectorAll(".field.has-error").forEach(function (f) { f.classList.remove("has-error"); });
    form.querySelectorAll(".field__error").forEach(function (e) { e.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(function (e) { e.removeAttribute("aria-invalid"); });
  }

  function setFormMessage(elId, type, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!msg) {
      el.className = "alert is-hidden";
      el.innerHTML = "";
      return;
    }
    el.className = "alert alert--" + type;
    el.innerHTML = escapeHtml(msg);
  }

  function bindPasswordMeter(inputId, barId, hintId) {
    const input = document.getElementById(inputId);
    const bar = document.getElementById(barId);
    const hint = document.getElementById(hintId);
    if (!input || !bar) return;

    input.addEventListener("input", function () {
      const score = Validators.passwordStrength(input.value);
      bar.style.width = ((score / 5) * 100) + "%";
      bar.classList.remove("is-weak", "is-fair", "is-good", "is-strong");
      let label = "Use 8+ characters with letters and numbers.";
      if (!input.value.length) { bar.style.width = "0%"; }
      else if (score <= 2) { bar.classList.add("is-weak"); label = "Weak — add more characters and variety."; }
      else if (score === 3) { bar.classList.add("is-fair"); label = "Fair — add a number or symbol."; }
      else if (score === 4) { bar.classList.add("is-good"); label = "Good — add a symbol for extra strength."; }
      else { bar.classList.add("is-strong"); label = "Strong password."; }
      if (hint) hint.textContent = label;
    });
  }

  /* =======================================================================
     10. AUTH
     ======================================================================= */
  const Auth = {
    async signUp(payload) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: {
            full_name: payload.fullName,
            phone: payload.phone || null,
            role: payload.role
          },
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
      return {
        needsVerification: data.session === null,
        user: data.user,
        session: data.session
      };
    },

    async signIn(email, password) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async resendVerification(email) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
    },

    async sendPasswordReset(email) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
    },

    async updatePassword(newPassword) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },

    async signOut() {
      if (supabase) {
        try { await supabase.auth.signOut(); } catch (e) { console.warn(e); }
      }
      resetState();
      showAuthScreen();
    },

    async getSession() {
      if (!supabase) return null;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return null;
        return data.session;
      } catch (e) { return null; }
    }
  };

  const Profile = {
    async fetch(userId) {
      if (!supabase || !userId) return null;
      const { data, error } = await supabase
        .from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) return null;
      return data;
    },
    async update(userId, patch) {
      if (!supabase || !userId) return null;
      const { data, error } = await supabase
        .from("profiles").update(patch).eq("id", userId).select().maybeSingle();
      if (error) throw error;
      return data;
    },
    resolveRole(profile, user) {
      if (profile && profile.role) return profile.role;
      if (user && user.user_metadata && user.user_metadata.role) return user.user_metadata.role;
      return "passenger";
    }
  };

  /* =======================================================================
     11. NAVIGATION
     ======================================================================= */
  const NAVIGATION = {
    passenger: [
      { group: "Travel" },
      { key: "home",          label: "Home",          icon: "🏠" },
      { key: "search",        label: "Find a bus",    icon: "🔍" },
      { key: "my-trips",      label: "My trips",      icon: "🧭" },
      { key: "tickets",       label: "Tickets",       icon: "🎫" },
      { group: "Account" },
      { key: "notifications", label: "Notifications", icon: "🔔", badgeKey: "unread" },
      { key: "profile",       label: "Profile",       icon: "👤" }
    ],
    driver: [
      { group: "Operations" },
      { key: "driver-dashboard",   label: "Dashboard",          icon: "📊" },
      { key: "make-bus-available", label: "Make bus available", icon: "🚌" },
      { key: "active-trip",        label: "Active trip",        icon: "📍" },
      { key: "driver-trips",       label: "My trips",           icon: "🧭" },
      { key: "scan-ticket",        label: "Scan ticket",        icon: "📷" },
      { group: "Account" },
      { key: "notifications",      label: "Notifications",      icon: "🔔", badgeKey: "unread" },
      { key: "profile",            label: "Profile",            icon: "👤" }
    ],
    operator: [
      { group: "Fleet" },
      { key: "operator-dashboard", label: "Dashboard", icon: "📊" },
      { key: "operator-fleet",     label: "Vehicles",  icon: "🚌" },
      { key: "operator-drivers",   label: "Drivers",   icon: "👨‍✈️" },
      { key: "operator-trips",     label: "Trips",     icon: "🧭" },
      { group: "Account" },
      { key: "notifications",      label: "Notifications", icon: "🔔", badgeKey: "unread" },
      { key: "profile",            label: "Profile",       icon: "👤" }
    ],
    admin: [
      { group: "Overview" },
      { key: "admin-dashboard", label: "Dashboard",       icon: "📊" },
      { key: "admin-users",     label: "Users",           icon: "👥" },
      { key: "admin-drivers",   label: "Driver approval", icon: "✅" },
      { key: "admin-operators", label: "Operators",       icon: "🏢" },
      { group: "Transport" },
      { key: "admin-terminals", label: "Terminals",       icon: "📍" },
      { key: "admin-routes",    label: "Routes",          icon: "🗺️" },
      { key: "admin-vehicles",  label: "Vehicles",        icon: "🚌" },
      { key: "admin-trips",     label: "Trips",           icon: "🧭" },
      { group: "Operations" },
      { key: "admin-tickets",   label: "Tickets",         icon: "🎫" },
      { key: "admin-feedback",  label: "Feedback",        icon: "⭐" },
      { key: "admin-reports",   label: "Reports",         icon: "📈" },
      { group: "Platform" },
      { key: "admin-settings",  label: "Settings",        icon: "⚙️" },
      { key: "notifications",   label: "Notifications",   icon: "🔔", badgeKey: "unread" },
      { key: "profile",         label: "Profile",         icon: "👤" }
    ]
  };

  const BOTTOM_NAV = {
    passenger: ["home", "search", "my-trips", "tickets", "notifications"],
    driver: ["driver-dashboard", "make-bus-available", "active-trip", "scan-ticket", "profile"],
    operator: ["operator-dashboard", "operator-fleet", "operator-drivers", "operator-trips", "profile"],
    admin: ["admin-dashboard", "admin-users", "admin-trips", "admin-reports", "profile"]
  };

  function countBadge(key) {
    if (key === "unread") {
      return AppState.notifications.filter(function (n) { return !n.is_read; }).length;
    }
    return 0;
  }

  function renderNavigation() {
    const sidebar = document.getElementById("app-nav");
    const bottomNav = document.getElementById("app-bottom-nav");
    const items = NAVIGATION[AppState.role] || NAVIGATION.passenger;

    if (sidebar) {
      sidebar.innerHTML = items.map(function (item) {
        if (item.group) return '<p class="app-nav__group-label">' + escapeHtml(item.group) + "</p>";
        const active = AppState.currentView === item.key;
        const count = item.badgeKey ? countBadge(item.badgeKey) : 0;
        return (
          '<button type="button" class="app-nav__item' + (active ? " is-active" : "") +
            '" data-nav-link data-view="' + escapeHtml(item.key) + '">' +
            '<span class="app-nav__icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>' +
            '<span class="app-nav__label">' + escapeHtml(item.label) + '</span>' +
            (count > 0 ? '<span class="app-nav__count">' + count + '</span>' : "") +
          '</button>'
        );
      }).join("");
    }

    if (bottomNav) {
      const keys = BOTTOM_NAV[AppState.role] || BOTTOM_NAV.passenger;
      const flat = items.filter(function (i) { return !i.group; });
      bottomNav.innerHTML = keys.map(function (key) {
        const item = flat.find(function (i) { return i.key === key; });
        if (!item) return "";
        const active = AppState.currentView === item.key;
        const count = item.badgeKey ? countBadge(item.badgeKey) : 0;
        return (
          '<button type="button" class="app-bottom-nav__item' + (active ? " is-active" : "") +
            '" data-nav-link data-view="' + escapeHtml(item.key) + '">' +
            '<span class="app-bottom-nav__icon" aria-hidden="true">' + escapeHtml(item.icon) +
              (count > 0 ? '<span class="icon-button__badge">' + count + '</span>' : "") +
            '</span>' +
            '<span class="app-bottom-nav__label">' + escapeHtml(item.label) + '</span>' +
          '</button>'
        );
      }).join("");
    }

    document.querySelectorAll("[data-nav-link]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        const v = el.getAttribute("data-view");
        if (v) Router.go(v);
        closeSidebar();
      });
    });
  }

  /* =======================================================================
     12. ROUTER
     ======================================================================= */
  const Router = {
    registry: {},
    register: function (key, def) { this.registry[key] = def; },
    go: async function (key, params) {
      const def = this.registry[key];
      const root = document.getElementById("view-root");
      if (!root) return;
      if (!def) {
        root.innerHTML = '<div class="empty-state"><p class="empty-state__title">View not found</p></div>';
        return;
      }
      AppState.currentView = key;
      renderNavigation();
      window.scrollTo({ top: 0 });

      const inner = document.createElement("div");
      inner.className = "app-main__inner";
      inner.innerHTML =
        '<header class="page-header">' +
          '<div class="page-header__titles">' +
            '<h1 class="page-header__title">' + escapeHtml(def.title || "") + '</h1>' +
            (def.subtitle ? '<p class="page-header__subtitle">' + escapeHtml(def.subtitle) + '</p>' : "") +
          '</div>' +
          (def.headerActions ? '<div class="page-header__actions">' + def.headerActions + '</div>' : "") +
        '</header>' +
        '<div id="view-content" class="view-stack"></div>';

      root.innerHTML = "";
      root.appendChild(inner);

      try {
        await def.render(document.getElementById("view-content"), params || {});
      } catch (e) {
        console.error("[TransitCare] View render failed:", key, e);
        renderError(document.getElementById("view-content"), e.message, function () { Router.go(key, params); });
      }
    }
  };

  /* =======================================================================
     13. SHARED DATA HELPERS
     ======================================================================= */
  const Data = {
    async getTerminals(activeOnly) {
      if (!supabase) return [];
      let q = supabase.from("terminals").select("*").order("name");
      if (activeOnly) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async getRoutes(activeOnly) {
      if (!supabase) return [];
      let q = supabase.from("routes").select("*").order("origin");
      if (activeOnly) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async getVehicles(operatorId) {
      if (!supabase) return [];
      let q = supabase.from("vehicles").select("*").order("registration_number");
      if (operatorId) q = q.eq("operator_id", operatorId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async getSeatStats(tripId, capacity) {
      if (!supabase || !tripId) return { capacity: capacity || 0, available: capacity || 0 };
      const { data, error } = await supabase.from("bookings").select("seat_number, status")
        .eq("trip_id", tripId).in("status", ["reserved", "boarded"]);
      if (error) throw error;
      const reserved = (data || []).filter(function (b) { return b.status === "reserved"; }).length;
      const boarded = (data || []).filter(function (b) { return b.status === "boarded"; }).length;
      const cap = capacity || 0;
      return { capacity: cap, reserved: reserved, boarded: boarded, available: Math.max(0, cap - reserved - boarded) };
    },
    async logAudit(action, type, id, details) {
      if (!supabase || !AppState.authUser) return;
      try {
        await supabase.from("audit_logs").insert({
          actor_id: AppState.authUser.id,
          action: action, entity_type: type || null,
          entity_id: id || null, details: details || null
        });
      } catch (e) { console.warn(e); }
    }
  };

  /* =======================================================================
     14. PASSENGER VIEWS
     ======================================================================= */
  Router.register("home", {
    title: "Welcome back",
    subtitle: "Know your ride before you leave.",
    render: async function (container) {
      const name = (AppState.profile && AppState.profile.full_name) || "Commuter";
      const first = String(name).split(" ")[0];
      container.innerHTML =
        '<section class="card"><div class="card__body">' +
          '<p class="eyebrow">Eko TransitCare</p>' +
          '<h2 style="margin-top:6px;font-size:22px;font-weight:800;letter-spacing:-0.02em;">Hello, ' + escapeHtml(first) + ' 👋</h2>' +
          '<p class="text-muted mt-2">Find a bus, reserve a seat and track your ride — all before you leave home.</p>' +
          '<div class="button-group mt-4">' +
            '<button type="button" class="button button--primary" data-nav-link data-view="search">🔍 Find a bus</button>' +
            '<button type="button" class="button button--secondary" data-nav-link data-view="tickets">🎫 My tickets</button>' +
          '</div>' +
        '</div></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Upcoming trips</h3></div>' +
        '<div class="card__body" id="home-upcoming"></div></section>';

      document.querySelectorAll("[data-nav-link]").forEach(function (el) {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          const v = el.getAttribute("data-view");
          if (v) Router.go(v);
        });
      });

      const upcoming = document.getElementById("home-upcoming");
      try {
        renderLoading(upcoming, "Loading your trips…");
        const { data, error } = await supabase
          .from("bookings")
          .select("*, trips(*, routes(origin, destination), vehicles(registration_number))")
          .eq("passenger_id", AppState.authUser.id)
          .in("status", ["reserved", "boarded"])
          .order("created_at", { ascending: false }).limit(3);
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(upcoming, { icon: "🧭", title: "No upcoming trips yet", message: "Search for a bus and reserve your seat." });
        } else {
          upcoming.innerHTML = '<div class="list">' + data.map(renderBookingRow).join("") + '</div>';
        }
      } catch (e) { renderError(upcoming, e.message); }
    }
  });

  function renderBookingRow(b) {
    const trip = b.trips || {};
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    return (
      '<div class="list__item"><div class="list__main">' +
        '<p class="list__title">' + escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</p>' +
        '<p class="list__meta">' + escapeHtml(trip.trip_code || "—") + ' · ' +
          escapeHtml(vehicle.registration_number || "—") + ' · Seat ' + escapeHtml(b.seat_number || "—") + '</p>' +
      '</div>' +
      '<span class="badge badge--' + escapeHtml(b.status || "reserved") + '">' + escapeHtml(humanizeStatus(b.status)) + '</span>' +
      '</div>'
    );
  }

  function renderNotificationRow(n) {
    return (
      '<div class="notification-item' + (n.is_read ? "" : " notification-item--unread") + '" data-notification-id="' + escapeHtml(n.id) + '">' +
        '<span class="notification-item__icon" aria-hidden="true">🔔</span>' +
        '<div class="notification-item__body">' +
          '<p class="notification-item__title">' + escapeHtml(n.title || "Notification") + '</p>' +
          '<p class="notification-item__message">' + escapeHtml(n.message || "") + '</p>' +
          '<p class="notification-item__time">' + escapeHtml(formatRelativeTime(n.created_at)) + '</p>' +
        '</div>' +
        (n.is_read ? "" : '<span class="notification-dot"></span>') +
      '</div>'
    );
  }

  Router.register("search", {
    title: "Find a bus",
    subtitle: "Select your origin and destination to see available buses.",
    render: async function (container) {
      container.innerHTML =
        '<section class="search-panel">' +
          '<h2 class="search-panel__title">Where are you going?</h2>' +
          '<p class="search-panel__subtitle">Search real trips from participating operators.</p>' +
          '<form class="search-panel__form" id="search-form">' +
            '<div class="search-panel__field"><label for="search-origin">From</label>' +
              '<select id="search-origin"><option value="">Loading…</option></select></div>' +
            '<div class="search-panel__field"><label for="search-destination">To</label>' +
              '<select id="search-destination"><option value="">Loading…</option></select></div>' +
            '<div class="search-panel__field"><label for="search-date">Date</label>' +
              '<input type="date" id="search-date" /></div>' +
            '<div class="search-panel__actions">' +
              '<button type="submit" class="button button--primary button--block" id="search-submit">Search</button>' +
            '</div>' +
          '</form>' +
        '</section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Available buses</h3></div>' +
        '<div class="card__body" id="search-results"></div></section>';

      const originSelect = document.getElementById("search-origin");
      const destSelect = document.getElementById("search-destination");
      try {
        const routes = await Data.getRoutes(true);
        const origins = Array.from(new Set(routes.map(function (r) { return r.origin; }).filter(Boolean))).sort();
        const dests = Array.from(new Set(routes.map(function (r) { return r.destination; }).filter(Boolean))).sort();
        originSelect.innerHTML = '<option value="">Any origin</option>' +
          origins.map(function (o) { return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>'; }).join("");
        destSelect.innerHTML = '<option value="">Any destination</option>' +
          dests.map(function (d) { return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>'; }).join("");
      } catch (e) {
        originSelect.innerHTML = '<option value="">Unable to load</option>';
        destSelect.innerHTML = '<option value="">Unable to load</option>';
      }

      const dateInput = document.getElementById("search-date");
      if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

      const form = document.getElementById("search-form");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        performSearch();
      });

      async function performSearch() {
        const resultsEl = document.getElementById("search-results");
        renderLoading(resultsEl, "Finding available buses…");
        const origin = originSelect.value;
        const dest = destSelect.value;
        const dateVal = dateInput.value;

        try {
          let from = null, to = null;
          if (dateVal) {
            from = new Date(dateVal + "T00:00:00").toISOString();
            to = new Date(dateVal + "T23:59:59").toISOString();
          }
          let q = supabase.from("trips")
            .select("*, routes(id, origin, destination, estimated_minutes, base_fare), vehicles(id, registration_number, capacity, vehicle_type)")
            .in("status", ["scheduled", "boarding", "in_transit"])
            .order("planned_departure");
          if (from) q = q.gte("planned_departure", from);
          if (to) q = q.lte("planned_departure", to);
          const { data, error } = await q;
          if (error) throw error;

          let filtered = data || [];
          if (origin) filtered = filtered.filter(function (t) { return t.routes && t.routes.origin === origin; });
          if (dest) filtered = filtered.filter(function (t) { return t.routes && t.routes.destination === dest; });

          const enriched = await Promise.all(filtered.map(async function (t) {
            const stats = await Data.getSeatStats(t.id, t.vehicles ? t.vehicles.capacity : 0);
            return Object.assign({}, t, { seatStats: stats });
          }));

          if (!enriched.length) {
            renderEmpty(resultsEl, {
              icon: "🚌", title: "No buses found",
              message: "No buses are currently available for this route."
            });
            return;
          }

          resultsEl.innerHTML = '<div class="trip-list">' + enriched.map(renderTripCard).join("") + '</div>';

          resultsEl.querySelectorAll("[data-book-trip]").forEach(function (b) {
            b.addEventListener("click", function () {
              const t = enriched.find(function (x) { return x.id === b.getAttribute("data-book-trip"); });
              if (t) openBookingModal(t);
            });
          });
          resultsEl.querySelectorAll("[data-track-trip]").forEach(function (b) {
            b.addEventListener("click", function () {
              Router.go("track-trip", { tripId: b.getAttribute("data-track-trip") });
            });
          });
        } catch (e) {
          renderError(resultsEl, e.message, performSearch);
        }
      }

      performSearch();
    }
  });

  function renderTripCard(trip) {
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    const stats = trip.seatStats || { available: 0 };
    const status = trip.status || "scheduled";
    const trackable = status === "in_transit" || status === "boarding";
    return (
      '<article class="trip-card trip-card--' + escapeHtml(status) + '">' +
        '<div class="trip-card__identity">' +
          '<p class="trip-card__code">' + escapeHtml(trip.trip_code || "TC-???") + '</p>' +
          '<p class="trip-card__vehicle">' + escapeHtml(vehicle.registration_number || "TBA") + '</p>' +
        '</div>' +
        '<div class="trip-card__route">' +
          '<p class="trip-card__cities">' + escapeHtml(route.origin || "?") +
            '<span class="trip-card__arrow">→</span>' + escapeHtml(route.destination || "?") + '</p>' +
          '<p class="trip-card__stops">' + escapeHtml(route.estimated_minutes ? route.estimated_minutes + " min journey" : "") + '</p>' +
        '</div>' +
        '<div class="trip-card__timing">' +
          '<p class="trip-card__time">' + escapeHtml(formatTime(trip.planned_departure)) + '</p>' +
          '<p class="trip-card__date">' + escapeHtml(formatDate(trip.planned_departure)) + '</p>' +
        '</div>' +
        '<div class="trip-card__seats">' +
          '<p class="trip-card__seats-value' + (stats.available <= 3 ? " trip-card__seats-value--low" : "") + '">' +
            stats.available + '</p><p class="trip-card__seats-label">seats free</p>' +
        '</div>' +
        '<div class="trip-card__fare">' +
          '<p class="trip-card__fare-value">' + escapeHtml(formatCurrency(route.base_fare)) + '</p>' +
          '<p class="trip-card__fare-label">per seat</p>' +
        '</div>' +
        '<div class="trip-card__actions">' +
          '<span class="badge badge--' + escapeHtml(status) + '">' + escapeHtml(humanizeStatus(status)) + '</span>' +
          (trackable ? '<button type="button" class="button button--small button--ghost" data-track-trip="' + escapeHtml(trip.id) + '">Track</button>' : "") +
          (stats.available > 0 && (status === "scheduled" || status === "boarding")
            ? '<button type="button" class="button button--small button--primary" data-book-trip="' + escapeHtml(trip.id) + '">Book</button>'
            : '<span class="badge badge--cancelled">Full</span>') +
        '</div>' +
      '</article>'
    );
  }

  async function openBookingModal(trip) {
    Modal.open({
      title: "Select your seat",
      body: '<div class="loading-state"><span class="spinner spinner--small"></span> Loading seats…</div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="confirm" id="modal-confirm-booking" disabled>Confirm booking</button>',
      onAction: async function (a) {
        if (a === "cancel") { Modal.close(); return; }
        if (a === "confirm") await completeBooking(trip);
      }
    });

    const body = document.getElementById("modal-body");
    try {
      const capacity = trip.vehicles ? trip.vehicles.capacity : 0;
      if (!capacity) { body.innerHTML = '<p class="text-muted">No capacity configured.</p>'; return; }

      const { data: existing } = await supabase.from("bookings").select("seat_number, status")
        .eq("trip_id", trip.id).in("status", ["reserved", "boarded"]);
      const taken = {};
      (existing || []).forEach(function (b) { taken[b.seat_number] = b.status; });

      let html = '<div class="seat-legend">' +
        '<span class="seat-legend__item"><span class="seat-legend__swatch seat-legend__swatch--available"></span> Available</span>' +
        '<span class="seat-legend__item"><span class="seat-legend__swatch seat-legend__swatch--reserved"></span> Reserved</span>' +
        '<span class="seat-legend__item"><span class="seat-legend__swatch seat-legend__swatch--boarded"></span> Boarded</span>' +
        '</div><div class="seat-grid">';

      for (let i = 1; i <= capacity; i++) {
        const st = taken[i];
        let cls = "seat--available", label = "Free";
        if (st === "reserved") { cls = "seat--reserved"; label = "Reserved"; }
        if (st === "boarded") { cls = "seat--boarded"; label = "Boarded"; }
        html += '<button type="button" class="seat ' + cls + '" data-seat="' + i + '"' + (st ? " disabled" : "") + '>' +
          '<span class="seat__number">' + i + '</span><span class="seat__state">' + label + '</span></button>';
      }
      html += '</div><p class="text-small text-muted mt-4" id="selected-seat-label">No seat selected.</p>';

      body.innerHTML =
        '<p class="text-muted mb-4">' + escapeHtml(trip.trip_code || "Trip") + ' · ' +
          escapeHtml(trip.routes ? trip.routes.origin + " → " + trip.routes.destination : "") + '</p>' + html;

      let selected = null;
      body.querySelectorAll(".seat--available").forEach(function (btn) {
        btn.addEventListener("click", function () {
          body.querySelectorAll(".seat--selected").forEach(function (x) { x.classList.remove("seat--selected"); });
          btn.classList.add("seat--selected");
          selected = Number(btn.getAttribute("data-seat"));
          const lbl = document.getElementById("selected-seat-label");
          if (lbl) lbl.textContent = "Selected seat: " + selected;
          document.getElementById("modal-confirm-booking").disabled = false;
          trip._selectedSeat = selected;
        });
      });
    } catch (e) {
      body.innerHTML = '<p class="text-muted">Unable to load seats.</p>';
    }
  }

  async function completeBooking(trip) {
    const seat = trip._selectedSeat;
    if (!seat) { Toast.warning("No seat selected"); return; }
    Loader.show("Processing booking…");
    try {
      const { data: conflict } = await supabase.from("bookings").select("id")
        .eq("trip_id", trip.id).eq("seat_number", seat).in("status", ["reserved", "boarded"]).maybeSingle();
      if (conflict) {
        Modal.close();
        Toast.error("Seat taken", "Please choose another.");
        return;
      }
      const { data: booking, error } = await supabase.from("bookings").insert({
        passenger_id: AppState.authUser.id,
        trip_id: trip.id,
        seat_number: seat,
        status: "reserved",
        fare: trip.routes ? trip.routes.base_fare : null
      }).select().single();
      if (error) throw error;

      await supabase.from("tickets").insert({
        booking_id: booking.id,
        ticket_code: generateTicketCode(),
        status: "valid"
      });

      await Data.logAudit("booking_created", "booking", booking.id, { seat: seat });
      Modal.close();
      Toast.success("Booking confirmed", "Seat " + seat + " reserved.");
      Router.go("tickets");
    } catch (e) {
      Toast.error("Booking failed", e.message);
    } finally {
      Loader.hide();
    }
  }

  Router.register("my-trips", {
    title: "My trips",
    subtitle: "Your recent and upcoming journeys.",
    render: async function (container) {
      container.innerHTML = '<div id="my-trips-list"></div>';
      const list = document.getElementById("my-trips-list");
      renderLoading(list, "Loading your trips…");
      try {
        const { data, error } = await supabase.from("bookings")
          .select("*, trips(*, routes(origin, destination), vehicles(registration_number))")
          .eq("passenger_id", AppState.authUser.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🧭", title: "No trips yet", message: "Once you book a bus, your journeys will appear here." });
          return;
        }
        list.innerHTML = '<div class="card"><div class="card__body card__body--flush"><div class="list">' +
          data.map(renderBookingRow).join("") + '</div></div></div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("tickets", {
    title: "My tickets",
    subtitle: "Show these at boarding.",
    render: async function (container) {
      container.innerHTML = '<div id="tickets-list"></div>';
      const list = document.getElementById("tickets-list");
      renderLoading(list, "Loading your tickets…");
      try {
        const { data, error } = await supabase.from("bookings")
          .select("*, trips(*, routes(origin, destination), vehicles(registration_number)), tickets(*)")
          .eq("passenger_id", AppState.authUser.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🎫", title: "No tickets yet", message: "Book a trip to receive a digital ticket." });
          return;
        }
        list.innerHTML = '<div class="card-grid">' + data.map(renderTicketCard).join("") + '</div>';
        data.forEach(function (b) {
          const t = b.tickets && b.tickets[0];
          if (t) renderQrForTicket(t.ticket_code, "qr-" + t.id);
        });
      } catch (e) { renderError(list, e.message); }
    }
  });

  function renderTicketCard(b) {
    const trip = b.trips || {};
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    const t = b.tickets && b.tickets[0];
    return (
      '<article class="ticket-card">' +
        '<header class="ticket-card__header">' +
          '<span class="ticket-card__brand">🚌 Eko TransitCare</span>' +
          '<span class="ticket-card__status">' + escapeHtml(humanizeStatus(b.status)) + '</span>' +
        '</header>' +
        '<div class="ticket-card__body">' +
          '<p class="ticket-card__route">' + escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</p>' +
          '<dl class="ticket-card__details">' +
            '<div class="ticket-card__detail"><dt>Ticket ID</dt><dd>' + escapeHtml(t ? t.ticket_code : "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Trip</dt><dd>' + escapeHtml(trip.trip_code || "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Vehicle</dt><dd>' + escapeHtml(vehicle.registration_number || "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Seat</dt><dd>' + escapeHtml(b.seat_number || "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Departure</dt><dd>' + escapeHtml(formatDateTime(trip.planned_departure)) + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Fare</dt><dd>' + escapeHtml(formatCurrency(b.fare)) + '</dd></div>' +
          '</dl>' +
          '<div class="ticket-card__qr"><div id="qr-' + escapeHtml(t ? t.id : "") + '"></div>' +
            '<p class="ticket-card__qr-caption">Show this QR code to the driver when boarding.</p></div>' +
        '</div>' +
      '</article>'
    );
  }

  async function renderQrForTicket(text, containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;
    try {
      await loadExternalScript(CDN.QRCODE);
      if (window.QRCode && window.QRCode.toCanvas) {
        const canvas = document.createElement("canvas");
        c.appendChild(canvas);
        window.QRCode.toCanvas(canvas, text, { width: 168, margin: 1 }, function () {});
      } else {
        c.innerHTML = '<p class="text-tiny text-muted">QR: ' + escapeHtml(text) + '</p>';
      }
    } catch (e) {
      c.innerHTML = '<p class="text-tiny text-muted">QR: ' + escapeHtml(text) + '</p>';
    }
  }

  Router.register("track-trip", {
    title: "Track your bus",
    subtitle: "Live location updates.",
    render: async function (container, params) {
      const tripId = params.tripId;
      if (!tripId) {
        renderEmpty(container, { icon: "🚌", title: "No trip selected", message: "Open tracking from a search result." });
        return;
      }
      container.innerHTML =
        '<section class="card"><div class="card__header">' +
          '<h3 class="card__title" id="track-title">Loading…</h3>' +
          '<span class="badge" id="track-status">—</span></div>' +
          '<div class="card__body card__body--flush">' +
            '<div class="map-container" id="track-map"><div class="map-placeholder">' +
              '<span class="map-placeholder__icon">🗺️</span>Loading map…</div></div>' +
          '</div>' +
          '<div class="card__footer" id="track-details"></div></section>';

      try {
        const { data: trip, error } = await supabase.from("trips")
          .select("*, routes(*), vehicles(*), profiles!trips_driver_id_fkey(full_name)")
          .eq("id", tripId).maybeSingle();
        if (error) throw error;
        if (!trip) {
          renderEmpty(container, { icon: "🚌", title: "Trip not found", message: "" });
          return;
        }

        setText("track-title", (trip.trip_code || "Trip") + " · " +
          (trip.routes ? trip.routes.origin + " → " + trip.routes.destination : ""));
        const s = document.getElementById("track-status");
        s.className = "badge badge--" + (trip.status || "scheduled");
        s.textContent = humanizeStatus(trip.status);

        const det = document.getElementById("track-details");
        det.innerHTML =
          '<dl class="detail-list">' +
            '<div><dt>Driver</dt><dd>' + escapeHtml(trip.profiles ? trip.profiles.full_name : "—") + '</dd></div>' +
            '<div><dt>Vehicle</dt><dd>' + escapeHtml(trip.vehicles ? trip.vehicles.registration_number : "—") + '</dd></div>' +
            '<div><dt>Planned departure</dt><dd>' + escapeHtml(formatDateTime(trip.planned_departure)) + '</dd></div>' +
            '<div><dt>Actual departure</dt><dd>' + escapeHtml(trip.actual_departure ? formatDateTime(trip.actual_departure) : "Not yet") + '</dd></div>' +
          '</dl>';

        await initTrackingMap(trip);
        subscribeToTripLocations(trip.id);
      } catch (e) { renderError(container, e.message); }
    }
  });

  let trackMap = null, trackMarker = null;

  async function initTrackingMap(trip) {
    const el = document.getElementById("track-map");
    if (!el) return;
    try {
      await loadStylesheet(CDN.LEAFLET_CSS);
      await loadExternalScript(CDN.LEAFLET_JS);
      if (!window.L) {
        el.innerHTML = '<div class="map-placeholder">Map unavailable.</div>';
        return;
      }
      el.innerHTML = "";
      const c = TRANSITCARE_CONFIG.DEFAULT_MAP_CENTER;
      trackMap = window.L.map(el).setView([c.lat, c.lng], TRANSITCARE_CONFIG.DEFAULT_MAP_ZOOM);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 19
      }).addTo(trackMap);

      const { data: locs } = await supabase.from("trip_locations").select("*")
        .eq("trip_id", trip.id).order("recorded_at", { ascending: false }).limit(1);
      if (locs && locs.length) {
        const l = locs[0];
        trackMarker = window.L.marker([l.latitude, l.longitude]).addTo(trackMap);
        trackMap.setView([l.latitude, l.longitude], 14);
      } else {
        el.insertAdjacentHTML("beforeend",
          '<div class="map-overlay"><span class="map-overlay__label">Awaiting GPS signal</span>' +
          '<span class="map-overlay__value">No location yet.</span></div>');
      }
    } catch (e) {
      el.innerHTML = '<div class="map-placeholder">Map unavailable.</div>';
    }
  }

  function subscribeToTripLocations(tripId) {
    if (!supabase) return;
    stopChannel("tripLocations");
    AppState.channels.tripLocations = supabase
      .channel("trip-loc-" + tripId)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "trip_locations", filter: "trip_id=eq." + tripId
      }, function (p) {
        const l = p.new;
        if (!l || !trackMap || !window.L) return;
        if (!trackMarker) trackMarker = window.L.marker([l.latitude, l.longitude]).addTo(trackMap);
        else trackMarker.setLatLng([l.latitude, l.longitude]);
        trackMap.setView([l.latitude, l.longitude], 14);
      })
      .subscribe();
  }

  Router.register("notifications", {
    title: "Notifications",
    subtitle: "Trip updates and reminders.",
    headerActions: '<button type="button" class="button button--ghost button--small" id="mark-all-read">Mark all read</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="notifications-list"></div></div>';
      const list = document.getElementById("notifications-list");
      renderLoading(list, "Loading…");

      const markAll = document.getElementById("mark-all-read");
      if (markAll) {
        markAll.addEventListener("click", async function () {
          try {
            await supabase.from("notifications").update({ is_read: true })
              .eq("recipient_id", AppState.authUser.id).eq("is_read", false);
            Toast.success("All marked as read");
            Router.go("notifications");
            refreshBadge();
          } catch (e) { Toast.error("Unable", e.message); }
        });
      }

      try {
        const list_data = await Notifications.fetch();
        if (!list_data || !list_data.length) {
          renderEmpty(list, { icon: "🔔", title: "No notifications yet", message: "Trip reminders will appear here." });
          return;
        }
        list.innerHTML = list_data.map(renderNotificationRow).join("");
        list.querySelectorAll(".notification-item--unread").forEach(function (item) {
          item.addEventListener("click", async function () {
            const id = item.getAttribute("data-notification-id");
            if (!id) return;
            try {
              await supabase.from("notifications").update({ is_read: true }).eq("id", id);
              item.classList.remove("notification-item--unread");
              const d = item.querySelector(".notification-dot");
              if (d) d.remove();
              refreshBadge();
            } catch (e) {}
          });
        });
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("profile", {
    title: "My profile",
    subtitle: "Your account details.",
    render: async function (container) {
      const p = AppState.profile || {};
      container.innerHTML =
        '<section class="card"><div class="card__body">' +
          '<div class="flex items-center gap-4">' +
            '<span class="avatar avatar--large">' + escapeHtml(getInitials(p.full_name)) + '</span>' +
            '<div>' +
              '<h2 style="font-size:18px;font-weight:800;">' + escapeHtml(p.full_name || "—") + '</h2>' +
              '<p class="text-muted text-small">' + escapeHtml(p.email || "") + '</p>' +
              '<span class="badge badge--' + escapeHtml(p.status || "active") + ' mt-2">' +
                escapeHtml(humanizeStatus(p.status || "active")) + '</span>' +
            '</div>' +
          '</div>' +
        '</div></section>' +

        '<section class="card"><div class="card__header"><h3 class="card__title">Account details</h3></div>' +
        '<div class="card__body">' +
          '<form id="profile-form">' +
            '<div class="field"><label for="profile-name">Full name</label>' +
              '<input type="text" id="profile-name" value="' + escapeHtml(p.full_name || "") + '" /></div>' +
            '<div class="field"><label for="profile-phone">Phone</label>' +
              '<input type="tel" id="profile-phone" value="' + escapeHtml(p.phone || "") + '" /></div>' +
            '<div class="field"><label for="profile-email">Email</label>' +
              '<input type="email" id="profile-email" value="' + escapeHtml(p.email || "") + '" disabled /></div>' +
            '<div class="form-actions"><button type="submit" class="button button--primary">Save changes</button></div>' +
          '</form>' +
        '</div></section>' +

        '<section class="card"><div class="card__header"><h3 class="card__title">Session</h3></div>' +
        '<div class="card__body"><button type="button" class="button button--danger" id="profile-signout">Sign out</button></div></section>';

      document.getElementById("profile-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const name = document.getElementById("profile-name").value.trim();
        const phone = document.getElementById("profile-phone").value.trim();
        if (!name) { Toast.warning("Name required"); return; }
        Loader.show("Saving…");
        try {
          const updated = await Profile.update(AppState.authUser.id, { full_name: name, phone: phone || null });
          AppState.profile = updated || AppState.profile;
          updateHeaderUser();
          Toast.success("Profile updated");
        } catch (e) { Toast.error("Unable to save", e.message); }
        finally { Loader.hide(); }
      });

      document.getElementById("profile-signout").addEventListener("click", function () { Auth.signOut(); });
    }
  });

  /* =======================================================================
     15. DRIVER VIEWS
     ======================================================================= */
  Router.register("driver-dashboard", {
    title: "Driver dashboard",
    subtitle: "Your assigned vehicle and trips.",
    render: async function (container) {
      const p = AppState.profile || {};
      const approved = p.status === "approved";
      container.innerHTML =
        (!approved ? '<div class="alert alert--warning"><strong>Account not approved.</strong>' +
          '<span>An administrator must approve your account. Current status: ' + escapeHtml(humanizeStatus(p.status)) + '.</span></div>' : "") +
        '<section class="stat-grid" id="driver-stats"></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Assigned vehicle</h3></div>' +
        '<div class="card__body" id="driver-vehicle">Loading…</div></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Recent trips</h3></div>' +
        '<div class="card__body card__body--flush" id="driver-recent-trips">Loading…</div></section>';

      try {
        const { data: trips } = await supabase.from("trips").select("status").eq("driver_id", AppState.authUser.id);
        const total = (trips || []).length;
        const active = (trips || []).filter(function (t) { return t.status === "in_transit"; }).length;
        const done = (trips || []).filter(function (t) { return t.status === "completed"; }).length;
        document.getElementById("driver-stats").innerHTML =
          statCard("🧭", total, "Total trips", "info") +
          statCard("🚌", active, "Active now", "success") +
          statCard("✅", done, "Completed", "success");
      } catch (e) {}

      const vEl = document.getElementById("driver-vehicle");
      try {
        const { data: vs } = await supabase.from("vehicles").select("*").eq("assigned_driver_id", AppState.authUser.id);
        if (!vs || !vs.length) {
          vEl.innerHTML = '<p class="text-muted">No vehicle assigned yet.</p>';
        } else {
          const v = vs[0];
          vEl.innerHTML = '<dl class="detail-list">' +
            '<div><dt>Registration</dt><dd>' + escapeHtml(v.registration_number || "—") + '</dd></div>' +
            '<div><dt>Type</dt><dd>' + escapeHtml(v.vehicle_type || "—") + '</dd></div>' +
            '<div><dt>Capacity</dt><dd>' + escapeHtml(v.capacity || "—") + ' seats</dd></div>' +
            '<div><dt>Status</dt><dd><span class="badge badge--' + escapeHtml(v.status || "active") + '">' +
              escapeHtml(humanizeStatus(v.status || "active")) + '</span></dd></div></dl>';
        }
      } catch (e) { vEl.innerHTML = '<p class="text-muted">Unable to load vehicle.</p>'; }

      const tEl = document.getElementById("driver-recent-trips");
      try {
        const { data: ts } = await supabase.from("trips")
          .select("*, routes(origin, destination), vehicles(registration_number)")
          .eq("driver_id", AppState.authUser.id).order("created_at", { ascending: false }).limit(5);
        if (!ts || !ts.length) {
          renderEmpty(tEl, { icon: "🧭", title: "No trips yet", message: "Create your first trip from Make Bus Available." });
        } else {
          tEl.innerHTML = '<div class="list">' + ts.map(renderDriverTripRow).join("") + '</div>';
        }
      } catch (e) { renderError(tEl, e.message); }
    }
  });

  function statCard(icon, value, label, variant) {
    return '<article class="stat-card"><span class="stat-card__icon stat-card__icon--' + (variant || "") +
      '" aria-hidden="true">' + icon + '</span><div class="stat-card__body">' +
      '<p class="stat-card__value">' + escapeHtml(value) + '</p>' +
      '<p class="stat-card__label">' + escapeHtml(label) + '</p></div></article>';
  }

  function renderDriverTripRow(trip) {
    const r = trip.routes || {};
    return '<div class="list__item"><div class="list__main">' +
      '<p class="list__title">' + escapeHtml(trip.trip_code || "—") + ' · ' +
        escapeHtml(r.origin || "?") + ' → ' + escapeHtml(r.destination || "?") + '</p>' +
      '<p class="list__meta">' + escapeHtml(formatDateTime(trip.planned_departure)) + '</p></div>' +
      '<span class="badge badge--' + escapeHtml(trip.status || "scheduled") + '">' +
        escapeHtml(humanizeStatus(trip.status)) + '</span></div>';
  }

  Router.register("make-bus-available", {
    title: "Make bus available",
    subtitle: "Publish a trip for passengers.",
    render: async function (container) {
      if (!AppState.profile || AppState.profile.status !== "approved") {
        renderEmpty(container, { icon: "🔒", title: "Account not approved", message: "You must be approved to publish trips." });
        return;
      }
      container.innerHTML =
        '<section class="card"><div class="card__header"><h3 class="card__title">Trip details</h3></div>' +
        '<div class="card__body"><form id="trip-form">' +
          '<div class="form-grid">' +
            '<div class="field"><label for="trip-vehicle">Vehicle</label>' +
              '<select id="trip-vehicle" required><option value="">Loading…</option></select></div>' +
            '<div class="field"><label for="trip-route">Route</label>' +
              '<select id="trip-route" required><option value="">Loading…</option></select></div>' +
            '<div class="field"><label for="trip-terminal">Terminal</label>' +
              '<select id="trip-terminal"><option value="">Loading…</option></select></div>' +
            '<div class="field"><label for="trip-departure">Planned departure</label>' +
              '<input type="datetime-local" id="trip-departure" required /></div>' +
          '</div>' +
          '<div class="form-actions"><button type="submit" class="button button--primary">Make bus available</button></div>' +
        '</form></div></section>';

      const vSel = document.getElementById("trip-vehicle");
      const rSel = document.getElementById("trip-route");
      const tSel = document.getElementById("trip-terminal");
      try {
        const [vehicles, routes, terminals] = await Promise.all([
          Data.getVehicles(),
          Data.getRoutes(true),
          Data.getTerminals(true)
        ]);
        const mine = vehicles.filter(function (v) { return v.assigned_driver_id === AppState.authUser.id; });
        vSel.innerHTML = '<option value="">Select a vehicle</option>' +
          (mine.map(function (v) { return '<option value="' + escapeHtml(v.id) + '">' + escapeHtml(v.registration_number) + ' (' + escapeHtml(v.capacity) + ' seats)</option>'; }).join("") ||
            '<option value="">No vehicle assigned</option>');
        rSel.innerHTML = '<option value="">Select a route</option>' +
          routes.map(function (r) { return '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.origin) + ' → ' + escapeHtml(r.destination) + '</option>'; }).join("");
        tSel.innerHTML = '<option value="">Select a terminal</option>' +
          terminals.map(function (t) { return '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + '</option>'; }).join("");
      } catch (e) { Toast.error("Unable to load form data", e.message); }

      const depInput = document.getElementById("trip-departure");
      if (depInput) {
        const d = new Date(Date.now() + 30 * 60000);
        depInput.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }

      document.getElementById("trip-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const vid = vSel.value, rid = rSel.value, tid = tSel.value, dep = depInput.value;
        if (!vid || !rid || !dep) { Toast.warning("Missing fields", "Please fill all required fields."); return; }
        Loader.show("Creating trip…");
        try {
          const { data, error } = await supabase.from("trips").insert({
            trip_code: generateTripCode(),
            driver_id: AppState.authUser.id,
            vehicle_id: vid,
            route_id: rid,
            terminal_id: tid || null,
            planned_departure: new Date(dep).toISOString(),
            status: "scheduled"
          }).select().single();
          if (error) throw error;
          await Data.logAudit("trip_created", "trip", data.id, { route_id: rid });
          Toast.success("Bus is now available");
          Router.go("driver-trips");
        } catch (e) { Toast.error("Unable to create trip", e.message); }
        finally { Loader.hide(); }
      });
    }
  });

  Router.register("active-trip", {
    title: "Active trip",
    subtitle: "Start, track and end your trip.",
    render: async function (container) {
      container.innerHTML = '<div id="active-trip-root"></div>';
      const root = document.getElementById("active-trip-root");
      renderLoading(root, "Loading active trip…");
      try {
        const { data: trips, error } = await supabase.from("trips")
          .select("*, routes(*), vehicles(*), terminals(name)")
          .eq("driver_id", AppState.authUser.id)
          .in("status", ["scheduled", "boarding", "in_transit"])
          .order("planned_departure").limit(1);
        if (error) throw error;
        if (!trips || !trips.length) {
          renderEmpty(root, { icon: "🚌", title: "No active trip", message: "Create a trip from Make Bus Available." });
          return;
        }
        renderActiveTrip(root, trips[0]);
      } catch (e) { renderError(root, e.message); }
    }
  });

  function renderActiveTrip(root, trip) {
    const r = trip.routes || {};
    const v = trip.vehicles || {};
    const t = trip.terminals || {};
    root.innerHTML =
      '<section class="card"><div class="card__header">' +
        '<h3 class="card__title">' + escapeHtml(trip.trip_code || "Trip") + '</h3>' +
        '<span class="badge badge--' + escapeHtml(trip.status) + '">' + escapeHtml(humanizeStatus(trip.status)) + '</span></div>' +
        '<div class="card__body"><dl class="detail-list">' +
          '<div><dt>Route</dt><dd>' + escapeHtml(r.origin || "?") + ' → ' + escapeHtml(r.destination || "?") + '</dd></div>' +
          '<div><dt>Vehicle</dt><dd>' + escapeHtml(v.registration_number || "—") + '</dd></div>' +
          '<div><dt>Terminal</dt><dd>' + escapeHtml(t.name || "—") + '</dd></div>' +
          '<div><dt>Planned departure</dt><dd>' + escapeHtml(formatDateTime(trip.planned_departure)) + '</dd></div>' +
          '<div><dt>Actual departure</dt><dd>' + escapeHtml(trip.actual_departure ? formatDateTime(trip.actual_departure) : "Not yet") + '</dd></div>' +
        '</dl></div>' +
        '<div class="card__footer"><div class="button-group" id="trip-actions"></div></div></section>' +
      '<section class="card" id="gps-card" style="display:none;">' +
        '<div class="card__header"><h3 class="card__title">GPS tracking</h3>' +
        '<span class="badge badge--in_transit" id="gps-status">Starting…</span></div>' +
        '<div class="card__body"><p class="text-muted" id="gps-message">Waiting…</p></div></section>';

    const a = document.getElementById("trip-actions");
    if (trip.status === "scheduled") {
      a.innerHTML = '<button type="button" class="button button--primary" id="start-trip-button">▶ Start trip</button>';
      document.getElementById("start-trip-button").addEventListener("click", function () { startTrip(trip); });
    } else if (trip.status === "boarding" || trip.status === "in_transit") {
      a.innerHTML = '<button type="button" class="button button--danger" id="end-trip-button">⏹ End trip</button>';
      document.getElementById("end-trip-button").addEventListener("click", function () { endTrip(trip); });
      if (trip.status === "in_transit") {
        document.getElementById("gps-card").style.display = "";
        startGpsWatch(trip);
      }
    }
  }

  async function startTrip(trip) {
    Loader.show("Starting trip…");
    try {
      const { error } = await supabase.from("trips").update({
        status: "in_transit", actual_departure: nowIso()
      }).eq("id", trip.id);
      if (error) throw error;
      await Data.logAudit("trip_started", "trip", trip.id, null);
      Toast.success("Trip started");
      Router.go("active-trip");
    } catch (e) { Toast.error("Unable to start trip", e.message); }
    finally { Loader.hide(); }
  }

  async function endTrip(trip) {
    const ok = await Modal.confirm({ title: "End trip?", message: "This marks the trip as completed.", confirmLabel: "End", danger: true });
    if (!ok) return;
    Loader.show("Ending trip…");
    try {
      const { error } = await supabase.from("trips").update({
        status: "completed", actual_arrival: nowIso()
      }).eq("id", trip.id);
      if (error) throw error;
      stopGpsWatch();
      await Data.logAudit("trip_ended", "trip", trip.id, null);
      Toast.success("Trip completed");
      Router.go("driver-trips");
    } catch (e) { Toast.error("Unable to end trip", e.message); }
    finally { Loader.hide(); }
  }

  Router.register("driver-trips", {
    title: "My trips",
    subtitle: "All trips you have created.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="driver-trips-list"></div></div>';
      const list = document.getElementById("driver-trips-list");
      renderLoading(list, "Loading trips…");
      try {
        const { data, error } = await supabase.from("trips")
          .select("*, routes(origin, destination), vehicles(registration_number)")
          .eq("driver_id", AppState.authUser.id).order("planned_departure", { ascending: false });
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🧭", title: "No trips yet", message: "Create your first trip from Make Bus Available." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(renderDriverTripRow).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("scan-ticket", {
    title: "Scan ticket",
    subtitle: "Validate a passenger's QR ticket.",
    render: async function (container) {
      container.innerHTML =
        '<section class="card"><div class="card__header"><h3 class="card__title">Ticket code</h3></div>' +
        '<div class="card__body"><div class="field">' +
          '<label for="ticket-code-input">Ticket code</label>' +
          '<input type="text" id="ticket-code-input" placeholder="TKT-XXXX-XXXX" autocomplete="off" /></div>' +
          '<button type="button" class="button button--primary" id="validate-ticket-button">Validate ticket</button>' +
        '</div></section><div id="scan-result"></div>';

      const input = document.getElementById("ticket-code-input");
      const btn = document.getElementById("validate-ticket-button");
      const resultEl = document.getElementById("scan-result");

      async function validate() {
        const code = input.value.trim().toUpperCase();
        if (!code) { Toast.warning("Enter a ticket code"); return; }
        renderLoading(resultEl, "Validating…");
        try {
          const { data: ticket, error } = await supabase.from("tickets")
            .select("*, bookings(*, trips(*, routes(origin, destination)))")
            .eq("ticket_code", code).maybeSingle();
          if (error) throw error;
          if (!ticket) {
            resultEl.innerHTML = scannerResult("invalid", "✕", "Invalid ticket", "No ticket with this code.");
            return;
          }
          const b = ticket.bookings || {};
          if (ticket.status === "used") {
            resultEl.innerHTML = scannerResult("used", "⚠", "Ticket already used", "Scanned at " + formatDateTime(ticket.used_at));
            return;
          }
          if (ticket.status === "cancelled") {
            resultEl.innerHTML = scannerResult("invalid", "✕", "Cancelled ticket", "");
            return;
          }
          await supabase.from("tickets").update({ status: "used", used_at: nowIso() }).eq("id", ticket.id);
          await supabase.from("bookings").update({ status: "boarded" }).eq("id", b.id);
          await Data.logAudit("ticket_scanned", "ticket", ticket.id, { booking_id: b.id });
          resultEl.innerHTML = scannerResult("valid", "✓", "Valid ticket",
            "Seat " + escapeHtml(b.seat_number || "—") + " · " +
            escapeHtml(b.trips ? b.trips.routes.origin + " → " + b.trips.routes.destination : ""));
          input.value = "";
        } catch (e) { Toast.error("Validation failed", e.message); }
      }

      btn.addEventListener("click", validate);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); validate(); } });
    }
  });

  function scannerResult(type, icon, title, msg) {
    return '<div class="scanner-result scanner-result--' + type + '">' +
      '<span class="scanner-result__icon" aria-hidden="true">' + icon + '</span>' +
      '<p class="scanner-result__title">' + escapeHtml(title) + '</p>' +
      '<p class="scanner-result__message">' + escapeHtml(msg) + '</p></div>';
  }

  /* =======================================================================
     16. OPERATOR VIEWS
     ======================================================================= */
  Router.register("operator-dashboard", {
    title: "Operator dashboard",
    subtitle: "Your fleet at a glance.",
    render: async function (container) {
      const oid = AppState.profile ? AppState.profile.operator_id : null;
      container.innerHTML = '<section class="stat-grid" id="operator-stats"></section>';
      try {
        const [v, d, t] = await Promise.all([
          supabase.from("vehicles").select("id").eq("operator_id", oid),
          supabase.from("profiles").select("id").eq("operator_id", oid).eq("role", "driver"),
          supabase.from("trips").select("id")
        ]);
        document.getElementById("operator-stats").innerHTML =
          statCard("🚌", (v.data || []).length, "Vehicles", "") +
          statCard("👨‍✈️", (d.data || []).length, "Drivers", "info") +
          statCard("🧭", (t.data || []).length, "Trips", "success");
      } catch (e) { renderError(container, e.message); }
    }
  });

  Router.register("operator-fleet", {
    title: "Fleet",
    subtitle: "Your vehicles.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="fleet-list"></div></div>';
      const list = document.getElementById("fleet-list");
      renderLoading(list, "Loading fleet…");
      try {
        const { data, error } = await supabase.from("vehicles").select("*")
          .eq("operator_id", AppState.profile.operator_id).order("registration_number");
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🚌", title: "No vehicles", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (v) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(v.registration_number) + '</p>' +
            '<p class="list__meta">' + escapeHtml(v.vehicle_type || "") + ' · ' + escapeHtml(v.capacity) + ' seats</p></div>' +
            '<span class="badge badge--' + escapeHtml(v.status || "active") + '">' +
              escapeHtml(humanizeStatus(v.status || "active")) + '</span></div>';
        }).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("operator-drivers", {
    title: "Drivers",
    subtitle: "Your drivers.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="op-drivers-list"></div></div>';
      const list = document.getElementById("op-drivers-list");
      renderLoading(list, "Loading…");
      try {
        const { data, error } = await supabase.from("profiles").select("*")
          .eq("operator_id", AppState.profile.operator_id).eq("role", "driver");
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "👨‍✈️", title: "No drivers", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (d) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(d.full_name || "—") + '</p>' +
            '<p class="list__meta">' + escapeHtml(d.email || "") + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(d.status || "pending") + '">' +
              escapeHtml(humanizeStatus(d.status || "pending")) + '</span></div>';
        }).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("operator-trips", {
    title: "Trips",
    subtitle: "Trips from your fleet.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="op-trips-list"></div></div>';
      const list = document.getElementById("op-trips-list");
      renderLoading(list, "Loading…");
      try {
        const { data, error } = await supabase.from("trips")
          .select("*, routes(origin, destination), vehicles(registration_number)")
          .order("planned_departure", { ascending: false }).limit(50);
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🧭", title: "No trips", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(renderDriverTripRow).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  /* =======================================================================
     17. ADMIN VIEWS
     ======================================================================= */
  Router.register("admin-dashboard", {
    title: "Admin dashboard",
    subtitle: "Platform overview.",
    render: async function (container) {
      container.innerHTML =
        '<section class="stat-grid" id="admin-stats"></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Recent audit activity</h3></div>' +
        '<div class="card__body" id="admin-audit"></div></section>';
      try {
        const [profiles, drivers, operators, vehicles, terminals, routes, trips, bookings] = await Promise.all([
          supabase.from("profiles").select("id"),
          supabase.from("profiles").select("id, status").eq("role", "driver"),
          supabase.from("operators").select("id"),
          supabase.from("vehicles").select("id"),
          supabase.from("terminals").select("id"),
          supabase.from("routes").select("id"),
          supabase.from("trips").select("id"),
          supabase.from("bookings").select("id")
        ]);
        const ds = drivers.data || [];
        const approved = ds.filter(function (d) { return d.status === "approved"; }).length;
        const pending = ds.filter(function (d) { return d.status !== "approved" && d.status !== "rejected"; }).length;
        document.getElementById("admin-stats").innerHTML =
          statCard("👥", (profiles.data || []).length, "Users", "info") +
          statCard("👨‍✈️", ds.length, "Drivers", "") +
          statCard("✅", approved, "Approved", "success") +
          statCard("⏳", pending, "Pending", "accent") +
          statCard("🏢", (operators.data || []).length, "Operators", "") +
          statCard("🚌", (vehicles.data || []).length, "Vehicles", "") +
          statCard("📍", (terminals.data || []).length, "Terminals", "") +
          statCard("🗺️", (routes.data || []).length, "Routes", "") +
          statCard("🧭", (trips.data || []).length, "Trips", "info") +
          statCard("🎫", (bookings.data || []).length, "Bookings", "success");
      } catch (e) { renderError(container, e.message); return; }

      const auditEl = document.getElementById("admin-audit");
      try {
        const { data: logs } = await supabase.from("audit_logs").select("*")
          .order("created_at", { ascending: false }).limit(10);
        if (!logs || !logs.length) {
          renderEmpty(auditEl, { icon: "📝", title: "No activity yet", message: "" });
        } else {
          auditEl.innerHTML = logs.map(function (l) {
            return '<div class="audit-entry">' +
              '<span class="audit-entry__time">' + escapeHtml(formatDateTime(l.created_at)) + '</span>' +
              '<span class="audit-entry__text">' + escapeHtml(l.action || "") +
                (l.entity_type ? ' · ' + escapeHtml(l.entity_type) : "") + '</span></div>';
          }).join("");
        }
      } catch (e) {}
    }
  });

  Router.register("admin-users", {
    title: "Users",
    subtitle: "All accounts.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="users-list"></div></div>';
      const list = document.getElementById("users-list");
      renderLoading(list, "Loading users…");
      try {
        const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "👥", title: "No users", message: "" });
          return;
        }
        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>' +
          data.map(function (u) {
            return '<tr><td>' + escapeHtml(u.full_name || "—") + '</td>' +
              '<td>' + escapeHtml(u.email || "—") + '</td>' +
              '<td><span class="badge">' + escapeHtml(humanizeStatus(u.role || "")) + '</span></td>' +
              '<td><span class="badge badge--' + escapeHtml(u.status || "active") + '">' +
                escapeHtml(humanizeStatus(u.status || "active")) + '</span></td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("admin-drivers", {
    title: "Driver approval",
    subtitle: "Approve or reject drivers.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="drivers-list"></div></div>';
      const list = document.getElementById("drivers-list");
      renderLoading(list, "Loading drivers…");
      try {
        const { data, error } = await supabase.from("profiles").select("*")
          .eq("role", "driver").order("created_at", { ascending: false });
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "👨‍✈️", title: "No drivers", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (d) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(d.full_name || "—") + '</p>' +
            '<p class="list__meta">' + escapeHtml(d.email || "") + ' · ' + escapeHtml(humanizeStatus(d.status || "pending")) + '</p></div>' +
            '<div class="list__actions">' +
              (d.status !== "approved" ? '<button type="button" class="button button--small button--success" data-approve="' + escapeHtml(d.id) + '">Approve</button>' : "") +
              (d.status !== "rejected" ? '<button type="button" class="button button--small button--danger" data-reject="' + escapeHtml(d.id) + '">Reject</button>' : "") +
            '</div></div>';
        }).join("") + '</div>';

        list.querySelectorAll("[data-approve]").forEach(function (b) {
          b.addEventListener("click", function () { updateDriverStatus(b.getAttribute("data-approve"), "approved"); });
        });
        list.querySelectorAll("[data-reject]").forEach(function (b) {
          b.addEventListener("click", function () { updateDriverStatus(b.getAttribute("data-reject"), "rejected"); });
        });
      } catch (e) { renderError(list, e.message); }
    }
  });

  async function updateDriverStatus(id, status) {
    Loader.show("Updating…");
    try {
      const { error } = await supabase.from("profiles").update({ status: status }).eq("id", id);
      if (error) throw error;
      await Data.logAudit("driver_" + status, "profile", id, null);
      Toast.success("Driver " + status);
      Router.go("admin-drivers");
    } catch (e) { Toast.error("Unable", e.message); }
    finally { Loader.hide(); }
  }

  Router.register("admin-operators", {
    title: "Operators",
    subtitle: "Transport companies.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-operator">+ Add operator</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="operators-list"></div></div>';
      const list = document.getElementById("operators-list");
      renderLoading(list, "Loading…");
      const add = document.getElementById("add-operator");
      if (add) add.addEventListener("click", openAddOperatorModal);
      try {
        const { data, error } = await supabase.from("operators").select("*").order("name");
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🏢", title: "No operators", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (o) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(o.name) + '</p>' +
            '<p class="list__meta">' + escapeHtml(o.contact_name || "") + ' · ' + escapeHtml(o.phone || "") + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(o.status || "active") + '">' +
              escapeHtml(humanizeStatus(o.status || "active")) + '</span></div>';
        }).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  function openAddOperatorModal() {
    Modal.open({
      title: "Add operator",
      body: '<div class="field"><label for="op-name">Name</label><input type="text" id="op-name" /></div>' +
        '<div class="field"><label for="op-contact">Contact</label><input type="text" id="op-contact" /></div>' +
        '<div class="field"><label for="op-phone">Phone</label><input type="tel" id="op-phone" /></div>' +
        '<div class="field"><label for="op-email">Email</label><input type="email" id="op-email" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (a) {
        if (a === "cancel") { Modal.close(); return; }
        const name = document.getElementById("op-name").value.trim();
        if (!name) { Toast.warning("Name required"); return; }
        Loader.show("Saving…");
        try {
          const { error } = await supabase.from("operators").insert({
            name: name,
            contact_name: document.getElementById("op-contact").value.trim() || null,
            phone: document.getElementById("op-phone").value.trim() || null,
            email: document.getElementById("op-email").value.trim() || null,
            status: "active"
          });
          if (error) throw error;
          Modal.close();
          Toast.success("Operator added");
          Router.go("admin-operators");
        } catch (e) { Toast.error("Unable", e.message); }
        finally { Loader.hide(); }
      }
    });
  }

  Router.register("admin-terminals", {
    title: "Terminals",
    subtitle: "Boarding points.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-terminal">+ Add terminal</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="terminals-list"></div></div>';
      const list = document.getElementById("terminals-list");
      renderLoading(list, "Loading…");
      const add = document.getElementById("add-terminal");
      if (add) add.addEventListener("click", openAddTerminalModal);
      try {
        const data = await Data.getTerminals();
        if (!data || !data.length) {
          renderEmpty(list, { icon: "📍", title: "No terminals", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (t) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(t.name) + '</p>' +
            '<p class="list__meta">' + escapeHtml(t.location || "") + ' · ' + escapeHtml(t.contact_info || "") + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(t.status || "active") + '">' +
              escapeHtml(humanizeStatus(t.status || "active")) + '</span></div>';
        }).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  function openAddTerminalModal() {
    Modal.open({
      title: "Add terminal",
      body: '<div class="field"><label for="term-name">Name</label><input type="text" id="term-name" /></div>' +
        '<div class="field"><label for="term-location">Location</label><input type="text" id="term-location" /></div>' +
        '<div class="field"><label for="term-desc">Description</label><textarea id="term-desc"></textarea></div>' +
        '<div class="field"><label for="term-contact">Contact</label><input type="text" id="term-contact" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (a) {
        if (a === "cancel") { Modal.close(); return; }
        const name = document.getElementById("term-name").value.trim();
        if (!name) { Toast.warning("Name required"); return; }
        Loader.show("Saving…");
        try {
          const { error } = await supabase.from("terminals").insert({
            name: name,
            location: document.getElementById("term-location").value.trim() || null,
            description: document.getElementById("term-desc").value.trim() || null,
            contact_info: document.getElementById("term-contact").value.trim() || null,
            status: "active"
          });
          if (error) throw error;
          Modal.close();
          Toast.success("Terminal added");
          Router.go("admin-terminals");
        } catch (e) { Toast.error("Unable", e.message); }
        finally { Loader.hide(); }
      }
    });
  }

  Router.register("admin-routes", {
    title: "Routes",
    subtitle: "Origins, destinations, fares.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-route">+ Add route</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="routes-list"></div></div>';
      const list = document.getElementById("routes-list");
      renderLoading(list, "Loading…");
      const add = document.getElementById("add-route");
      if (add) add.addEventListener("click", openAddRouteModal);
      try {
        const data = await Data.getRoutes();
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🗺️", title: "No routes", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (r) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(r.origin) + ' → ' + escapeHtml(r.destination) + '</p>' +
            '<p class="list__meta">' +
              escapeHtml(r.estimated_minutes ? r.estimated_minutes + " min" : "") +
              (r.base_fare ? ' · ' + formatCurrency(r.base_fare) : "") + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(r.status || "active") + '">' +
              escapeHtml(humanizeStatus(r.status || "active")) + '</span></div>';
        }).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  function openAddRouteModal() {
    Modal.open({
      title: "Add route",
      body: '<div class="field"><label for="route-origin">Origin</label><input type="text" id="route-origin" /></div>' +
        '<div class="field"><label for="route-destination">Destination</label><input type="text" id="route-destination" /></div>' +
        '<div class="field"><label for="route-fare">Base fare (₦)</label><input type="number" id="route-fare" min="0" step="50" /></div>' +
        '<div class="field"><label for="route-minutes">Estimated minutes</label><input type="number" id="route-minutes" min="1" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (a) {
        if (a === "cancel") { Modal.close(); return; }
        const o = document.getElementById("route-origin").value.trim();
        const d = document.getElementById("route-destination").value.trim();
        if (!o || !d) { Toast.warning("Origin and destination required"); return; }
        Loader.show("Saving…");
        try {
          const { error } = await supabase.from("routes").insert({
            origin: o, destination: d,
            base_fare: Number(document.getElementById("route-fare").value) || null,
            estimated_minutes: Number(document.getElementById("route-minutes").value) || null,
            status: "active"
          });
          if (error) throw error;
          Modal.close();
          Toast.success("Route added");
          Router.go("admin-routes");
        } catch (e) { Toast.error("Unable", e.message); }
        finally { Loader.hide(); }
      }
    });
  }

  Router.register("admin-vehicles", {
    title: "Vehicles",
    subtitle: "All registered vehicles.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-vehicle">+ Add vehicle</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="vehicles-list"></div></div>';
      const list = document.getElementById("vehicles-list");
      renderLoading(list, "Loading…");
      const add = document.getElementById("add-vehicle");
      if (add) add.addEventListener("click", openAddVehicleModal);
      try {
        const data = await Data.getVehicles();
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🚌", title: "No vehicles", message: "" });
          return;
        }
        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Reg</th><th>Type</th><th>Capacity</th><th>Status</th></tr></thead><tbody>' +
          data.map(function (v) {
            return '<tr><td>' + escapeHtml(v.registration_number) + '</td>' +
              '<td>' + escapeHtml(v.vehicle_type || "—") + '</td>' +
              '<td>' + escapeHtml(v.capacity || "—") + '</td>' +
              '<td><span class="badge badge--' + escapeHtml(v.status || "active") + '">' +
                escapeHtml(humanizeStatus(v.status || "active")) + '</span></td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  function openAddVehicleModal() {
    Modal.open({
      title: "Add vehicle",
      body: '<div class="field"><label for="veh-reg">Registration</label><input type="text" id="veh-reg" /></div>' +
        '<div class="field"><label for="veh-type">Type</label><input type="text" id="veh-type" placeholder="Bus, Danfo…" /></div>' +
        '<div class="field"><label for="veh-capacity">Capacity</label><input type="number" id="veh-capacity" min="1" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (a) {
        if (a === "cancel") { Modal.close(); return; }
        const r = document.getElementById("veh-reg").value.trim();
        const c = Number(document.getElementById("veh-capacity").value);
        if (!r || !c) { Toast.warning("Registration and capacity required"); return; }
        Loader.show("Saving…");
        try {
          const { error } = await supabase.from("vehicles").insert({
            registration_number: r,
            vehicle_type: document.getElementById("veh-type").value.trim() || null,
            capacity: c,
            status: "active",
            verification_status: "verified"
          });
          if (error) throw error;
          Modal.close();
          Toast.success("Vehicle added");
          Router.go("admin-vehicles");
        } catch (e) { Toast.error("Unable", e.message); }
        finally { Loader.hide(); }
      }
    });
  }

  Router.register("admin-trips", {
    title: "Trips",
    subtitle: "All trips.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="admin-trips-list"></div></div>';
      const list = document.getElementById("admin-trips-list");
      renderLoading(list, "Loading…");
      try {
        const { data, error } = await supabase.from("trips")
          .select("*, routes(origin, destination), vehicles(registration_number)")
          .order("planned_departure", { ascending: false }).limit(100);
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🧭", title: "No trips", message: "" });
          return;
        }
        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Code</th><th>Route</th><th>Vehicle</th><th>Departure</th><th>Status</th></tr></thead><tbody>' +
          data.map(function (t) {
            const r = t.routes || {};
            const v = t.vehicles || {};
            return '<tr><td>' + escapeHtml(t.trip_code || "—") + '</td>' +
              '<td>' + escapeHtml(r.origin || "?") + ' → ' + escapeHtml(r.destination || "?") + '</td>' +
              '<td>' + escapeHtml(v.registration_number || "—") + '</td>' +
              '<td>' + escapeHtml(formatDateTime(t.planned_departure)) + '</td>' +
              '<td><span class="badge badge--' + escapeHtml(t.status || "scheduled") + '">' +
                escapeHtml(humanizeStatus(t.status)) + '</span></td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("admin-tickets", {
    title: "Tickets",
    subtitle: "All issued tickets.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="admin-tickets-list"></div></div>';
      const list = document.getElementById("admin-tickets-list");
      renderLoading(list, "Loading…");
      try {
        const { data, error } = await supabase.from("tickets")
          .select("*, bookings(seat_number, trips(trip_code, routes(origin, destination)))")
          .order("issued_at", { ascending: false }).limit(100);
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "🎫", title: "No tickets", message: "" });
          return;
        }
        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Ticket</th><th>Trip</th><th>Seat</th><th>Status</th></tr></thead><tbody>' +
          data.map(function (t) {
            const b = t.bookings || {};
            const tr = b.trips || {};
            const r = tr.routes || {};
            return '<tr><td class="text-mono">' + escapeHtml(t.ticket_code) + '</td>' +
              '<td>' + escapeHtml(tr.trip_code || "—") + '<br /><span class="text-tiny text-muted">' +
                escapeHtml(r.origin || "?") + ' → ' + escapeHtml(r.destination || "?") + '</span></td>' +
              '<td>' + escapeHtml(b.seat_number || "—") + '</td>' +
              '<td><span class="badge badge--' + escapeHtml(t.status || "valid") + '">' +
                escapeHtml(humanizeStatus(t.status || "valid")) + '</span></td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("admin-feedback", {
    title: "Feedback",
    subtitle: "Passenger ratings.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="feedback-list"></div></div>';
      const list = document.getElementById("feedback-list");
      renderLoading(list, "Loading…");
      try {
        const { data, error } = await supabase.from("feedback")
          .select("*, trips(trip_code)").order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        if (!data || !data.length) {
          renderEmpty(list, { icon: "⭐", title: "No feedback yet", message: "" });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (f) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(f.overall_rating || "—") + '/5 · ' +
              escapeHtml(f.trips ? f.trips.trip_code : "—") + '</p>' +
            '<p class="list__meta">' + escapeHtml(f.comment || "No comment") + '</p></div>' +
            '<span class="text-tiny text-muted">' + escapeHtml(formatRelativeTime(f.created_at)) + '</span></div>';
        }).join("") + '</div>';
      } catch (e) { renderError(list, e.message); }
    }
  });

  Router.register("admin-reports", {
    title: "Reports",
    subtitle: "Operational analytics.",
    render: async function (container) {
      container.innerHTML = '<section class="card"><div class="card__header"><h3 class="card__title">Trips by status</h3></div>' +
        '<div class="card__body" id="trips-by-status"></div></section>';
      try {
        const { data: trips } = await supabase.from("trips").select("status");
        const counts = {};
        (trips || []).forEach(function (t) { counts[t.status] = (counts[t.status] || 0) + 1; });
        const el = document.getElementById("trips-by-status");
        if (!el) return;
        if (!Object.keys(counts).length) {
          renderEmpty(el, { icon: "📈", title: "No data", message: "Analytics will appear once trips are recorded." });
        } else {
          el.innerHTML = '<div class="stat-grid">' + Object.keys(counts).map(function (k) {
            return statCard("📊", counts[k], humanizeStatus(k), "");
          }).join("") + '</div>';
        }
      } catch (e) {}
    }
  });

  Router.register("admin-settings", {
    title: "Settings",
    subtitle: "Platform configuration.",
    render: async function (container) {
      container.innerHTML = '<section class="card"><div class="card__body">' +
        '<p class="text-muted">Platform settings live in the <code>settings</code> table.</p>' +
        '</div></section>';
    }
  });

  /* =======================================================================
     18. GPS
     ======================================================================= */
  function startGpsWatch(trip) {
    if (!navigator.geolocation) {
      Toast.warning("GPS unavailable");
      return;
    }
    if (AppState.gpsWatchId !== null) return;

    let last = 0;
    AppState.gpsWatchId = navigator.geolocation.watchPosition(
      async function (pos) {
        const now = Date.now();
        if (now - last < TRANSITCARE_CONFIG.GPS_UPDATE_INTERVAL_MS) return;
        last = now;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const s = document.getElementById("gps-status");
        const m = document.getElementById("gps-message");
        if (s) { s.className = "badge badge--in_transit"; s.textContent = "Live"; }
        if (m) m.textContent = "Lat " + lat.toFixed(5) + ", Lng " + lng.toFixed(5);
        try {
          await supabase.from("trip_locations").insert({
            trip_id: trip.id, latitude: lat, longitude: lng, recorded_at: nowIso()
          });
        } catch (e) {}
      },
      function (err) {
        const s = document.getElementById("gps-status");
        const m = document.getElementById("gps-message");
        if (s) { s.className = "badge badge--rejected"; s.textContent = "Unavailable"; }
        if (m) m.textContent = err.code === err.PERMISSION_DENIED ?
          "GPS permission was denied." : "GPS signal may be unavailable.";
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function stopGpsWatch() {
    if (AppState.gpsWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(AppState.gpsWatchId);
      AppState.gpsWatchId = null;
    }
  }

  /* =======================================================================
     19. NOTIFICATIONS
     ======================================================================= */
  const Notifications = {
    async fetch() {
      if (!supabase || !AppState.authUser) return [];
      const { data, error } = await supabase.from("notifications").select("*")
        .eq("recipient_id", AppState.authUser.id)
        .order("created_at", { ascending: false }).limit(80);
      if (error) throw error;
      AppState.notifications = data || [];
      return AppState.notifications;
    },
    async create(payload) {
      if (!supabase) return;
      try {
        await supabase.from("notifications").insert({
          recipient_id: payload.recipient_id,
          title: payload.title,
          message: payload.message,
          type: payload.type || "general",
          related_entity: payload.related_entity || null,
          is_read: false
        });
      } catch (e) {}
    }
  };

  async function refreshBadge() {
    try {
      const list = await Notifications.fetch();
      const unread = list.filter(function (n) { return !n.is_read; }).length;
      const b = document.getElementById("notification-badge");
      if (b) {
        b.textContent = unread;
        b.classList.toggle("is-hidden", unread === 0);
      }
      renderNavigation();
    } catch (e) {}
  }

  function subscribeToNotifications() {
    if (!supabase || !AppState.authUser) return;
    stopChannel("notifications");
    AppState.channels.notifications = supabase
      .channel("notif-" + AppState.authUser.id)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "notifications", filter: "recipient_id=eq." + AppState.authUser.id
      }, function (p) {
        if (!p.new) return;
        AppState.notifications.unshift(p.new);
        refreshBadge();
        Toast.info(p.new.title || "New notification", p.new.message || "");
      })
      .subscribe();
  }

  function stopChannel(name) {
    const c = AppState.channels[name];
    if (c && supabase) {
      try { supabase.removeChannel(c); } catch (e) {}
      AppState.channels[name] = null;
    }
  }

  function stopAllRealtime() {
    Object.keys(AppState.channels).forEach(stopChannel);
  }

  /* =======================================================================
     20. UI HELPERS
     ======================================================================= */
  function showAuthScreen() {
    document.getElementById("auth-screen").classList.remove("is-hidden");
    document.getElementById("app-shell").classList.add("is-hidden");
    document.body.style.overflow = "";
  }

  function showAppShell() {
    document.getElementById("auth-screen").classList.add("is-hidden");
    document.getElementById("app-shell").classList.remove("is-hidden");
  }

  function updateHeaderUser() {
    const p = AppState.profile || {};
    const name = p.full_name || "User";
    setText("header-user-name", name);
    setText("header-user-role", humanizeStatus(AppState.role || ""));
    const a = document.getElementById("header-avatar");
    if (a) a.textContent = getInitials(name);
  }

  function openSidebar() {
    document.getElementById("app-shell").classList.add("sidebar-open");
    const t = document.getElementById("sidebar-toggle");
    if (t) t.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    document.getElementById("app-shell").classList.remove("sidebar-open");
    const t = document.getElementById("sidebar-toggle");
    if (t) t.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    const s = document.getElementById("app-shell");
    if (s.classList.contains("sidebar-open")) closeSidebar();
    else openSidebar();
  }

  /* =======================================================================
     21. VERIFICATION NOTICE
     ======================================================================= */
  function showVerificationNotice(email, role) {
    const message = document.getElementById("auth-message");
    if (!message) return;
    const label = role === "driver" ? "Driver" : role === "operator" ? "Operator" : "Passenger";
    message.className = "alert alert--success";
    message.innerHTML =
      "<strong>Almost there — check your email.</strong>" +
      "<span>We sent a verification link to <code>" + escapeHtml(email) + "</code>. " +
      "Click the link to activate your " + escapeHtml(label.toLowerCase()) + " account.</span>" +
      '<div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" class="button button--ghost button--small" id="resend-verification">Resend verification email</button>' +
        '<button type="button" class="button button--ghost button--small" id="go-to-signin">Back to sign in</button>' +
      '</div>';

    const resend = document.getElementById("resend-verification");
    if (resend) {
      resend.addEventListener("click", async function () {
        resend.disabled = true;
        resend.textContent = "Sending…";
        try {
          await Auth.resendVerification(email);
          Toast.success("Verification email resent");
        } catch (e) { Toast.error("Unable", e.message); }
        finally { resend.disabled = false; resend.textContent = "Resend verification email"; }
      });
    }

    const back = document.getElementById("go-to-signin");
    if (back) {
      back.addEventListener("click", function () {
        const t = document.querySelector('[data-auth-mode="signin"]');
        if (t) t.click();
      });
    }
  }

  /* =======================================================================
     22. FORM BINDINGS
     ======================================================================= */
  function bindAuthForms() {
    const signinForm = document.getElementById("signin-form");
    const signupForm = document.getElementById("signup-form");
    const forgotForm = document.getElementById("forgot-form");
    const resetForm = document.getElementById("reset-form");

    function showAuthForm(mode) {
      [signinForm, signupForm, forgotForm, resetForm].forEach(function (f) {
        if (f) f.classList.add("is-hidden");
      });
      document.querySelectorAll(".auth-tab").forEach(function (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      if (mode === "signin" && signinForm) {
        signinForm.classList.remove("is-hidden");
        const t = document.getElementById("tab-signin");
        if (t) t.classList.add("is-active");
      } else if (mode === "signup" && signupForm) {
        signupForm.classList.remove("is-hidden");
        const t = document.getElementById("tab-signup");
        if (t) t.classList.add("is-active");
      } else if (mode === "forgot" && forgotForm) {
        forgotForm.classList.remove("is-hidden");
      } else if (mode === "reset" && resetForm) {
        resetForm.classList.remove("is-hidden");
      }
      setFormMessage("auth-message", null, "");
    }

    document.querySelectorAll("[data-auth-mode]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        showAuthForm(tab.getAttribute("data-auth-mode"));
      });
    });

    document.querySelectorAll("[data-toggle-password]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const input = document.getElementById(btn.getAttribute("data-toggle-password"));
        if (!input) return;
        const pw = input.type === "password";
        input.type = pw ? "text" : "password";
        btn.textContent = pw ? "Hide" : "Show";
      });
    });

    bindPasswordMeter("signup-password", "password-meter-bar", "password-hint");

    document.querySelectorAll('input[name="signup-role"]').forEach(function (r) {
      r.addEventListener("change", function () {
        const n = document.getElementById("driver-notice");
        if (!n) return;
        n.classList.toggle("is-hidden", r.value !== "driver" || !r.checked);
      });
    });

    if (signinForm) {
      signinForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearFormErrors(signinForm);
        setFormMessage("auth-message", null, "");
        const email = document.getElementById("signin-email").value.trim();
        const password = document.getElementById("signin-password").value;
        let ok = true;
        if (!Validators.email(email)) { setFieldError("signin-email", "Enter a valid email."); ok = false; }
        if (!Validators.required(password)) { setFieldError("signin-password", "Enter your password."); ok = false; }
        if (!ok) return;

        const btn = document.getElementById("signin-submit");
        btn.disabled = true;
        btn.innerHTML = '<span class="button__spinner"></span> Signing in…';
        try {
          await Auth.signIn(email, password);
        } catch (err) {
          const msg = (err && err.message) || "";
          if (/email not confirmed|not verified|confirm/i.test(msg)) {
            const c = document.getElementById("auth-message");
            c.className = "alert alert--warning";
            c.innerHTML = "<strong>Email not yet verified.</strong>" +
              "<span>Check your inbox for the verification link.</span>";
            const rb = document.createElement("button");
            rb.type = "button";
            rb.className = "button button--ghost button--small mt-3";
            rb.textContent = "Resend verification email";
            rb.addEventListener("click", async function () {
              rb.disabled = true;
              rb.textContent = "Sending…";
              try { await Auth.resendVerification(email); Toast.success("Resent"); }
              catch (e2) { Toast.error("Unable", e2.message); }
              finally { rb.disabled = false; rb.textContent = "Resend verification email"; }
            });
            c.appendChild(rb);
          } else {
            setFormMessage("auth-message", "danger", msg || "Unable to sign in.");
          }
        } finally {
          btn.disabled = false;
          btn.textContent = "Sign in";
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearFormErrors(signupForm);
        setFormMessage("auth-message", null, "");
        const fullName = document.getElementById("signup-fullname").value.trim();
        const email = document.getElementById("signup-email").value.trim();
        const phone = document.getElementById("signup-phone").value.trim();
        const password = document.getElementById("signup-password").value;
        const confirm = document.getElementById("signup-confirm").value;
        const terms = document.getElementById("signup-terms").checked;
        const role = document.querySelector('input[name="signup-role"]:checked').value;

        let ok = true;
        if (!Validators.required(fullName)) { setFieldError("signup-fullname", "Enter your full name."); ok = false; }
        if (!Validators.email(email)) { setFieldError("signup-email", "Enter a valid email."); ok = false; }
        if (phone && !Validators.phone(phone)) { setFieldError("signup-phone", "Enter a valid phone number."); ok = false; }
        if (Validators.passwordStrength(password) < 3) { setFieldError("signup-password", "Password is too weak."); ok = false; }
        if (password !== confirm) { setFieldError("signup-confirm", "Passwords do not match."); ok = false; }
        if (!terms) { setFieldError("signup-terms", "Please accept the terms."); ok = false; }
        if (!ok) return;

        const btn = document.getElementById("signup-submit");
        btn.disabled = true;
        btn.innerHTML = '<span class="button__spinner"></span> Creating account…';
        try {
          const result = await Auth.signUp({ fullName: fullName, email: email, phone: phone, password: password, role: role });
          signupForm.reset();
          if (result.needsVerification) {
            showVerificationNotice(email, role);
          } else {
            setFormMessage("auth-message", "success", "Account created. You are now signed in.");
          }
        } catch (err) {
          setFormMessage("auth-message", "danger", err.message || "Unable to create account.");
        } finally {
          btn.disabled = false;
          btn.textContent = "Create account";
        }
      });
    }

    const forgotButton = document.getElementById("forgot-password-button");
    if (forgotButton) forgotButton.addEventListener("click", function () { showAuthForm("forgot"); });
    const forgotBack = document.getElementById("forgot-back-button");
    if (forgotBack) forgotBack.addEventListener("click", function () { showAuthForm("signin"); });

    if (forgotForm) {
      forgotForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearFormErrors(forgotForm);
        const email = document.getElementById("forgot-email").value.trim();
        if (!Validators.email(email)) { setFieldError("forgot-email", "Enter a valid email."); return; }
        const btn = document.getElementById("forgot-submit");
        btn.disabled = true;
        btn.innerHTML = '<span class="button__spinner"></span> Sending…';
        try {
          await Auth.sendPasswordReset(email);
          setFormMessage("auth-message", "success", "Reset link sent. Check your email.");
          forgotForm.reset();
        } catch (err) {
          setFormMessage("auth-message", "danger", err.message || "Unable to send.");
        } finally {
          btn.disabled = false;
          btn.textContent = "Send reset link";
        }
      });
    }

    if (resetForm) {
      resetForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearFormErrors(resetForm);
        const password = document.getElementById("reset-password").value;
        const confirm = document.getElementById("reset-confirm").value;
        let ok = true;
        if (Validators.passwordStrength(password) < 3) { setFieldError("reset-password", "Password too weak."); ok = false; }
        if (password !== confirm) { setFieldError("reset-confirm", "Passwords do not match."); ok = false; }
        if (!ok) return;
        const btn = document.getElementById("reset-submit");
        btn.disabled = true;
        btn.innerHTML = '<span class="button__spinner"></span> Updating…';
        try {
          await Auth.updatePassword(password);
          setFormMessage("auth-message", "success", "Password updated. You can now sign in.");
          setTimeout(function () { showAuthForm("signin"); }, 1200);
        } catch (err) {
          setFormMessage("auth-message", "danger", err.message || "Unable to update.");
        } finally {
          btn.disabled = false;
          btn.textContent = "Update password";
        }
      });
    }
  }

  /* =======================================================================
     23. BOOTSTRAP
     ======================================================================= */
  async function handleSignedIn(session) {
    if (!session || !session.user) return;
    if (AppState.authUser && AppState.authUser.id === session.user.id && AppState.profile) return;

    AppState.authUser = session.user;

    let profile = await Profile.fetch(session.user.id);
    if (!profile && session.user.user_metadata) {
      const meta = session.user.user_metadata;
      try {
        await supabase.from("profiles").insert({
          id: session.user.id,
          full_name: meta.full_name || session.user.email,
          email: session.user.email,
          phone: meta.phone || null,
          role: meta.role || "passenger",
          status: meta.role === "driver" ? "email_verified" : "active"
        });
      } catch (e) {}
      profile = await Profile.fetch(session.user.id);
    }

    AppState.profile = profile;
    AppState.role = Profile.resolveRole(profile, session.user);

    showAppShell();
    updateHeaderUser();
    renderNavigation();
    await refreshBadge();
    subscribeToNotifications();

    const defaultView =
      AppState.role === "admin" ? "admin-dashboard" :
      AppState.role === "operator" ? "operator-dashboard" :
      AppState.role === "driver" ? "driver-dashboard" : "home";

    Router.go(defaultView);
  }

  function wireGlobalUi() {
    const toggle = document.getElementById("sidebar-toggle");
    if (toggle) toggle.addEventListener("click", toggleSidebar);

    const shell = document.getElementById("app-shell");
    if (shell) {
      shell.addEventListener("click", function (e) {
        if (!shell.classList.contains("sidebar-open")) return;
        if (e.target === shell) closeSidebar();
      });
    }

    const trigger = document.getElementById("user-menu-trigger");
    const dropdown = document.getElementById("user-menu-dropdown");
    if (trigger && dropdown) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = !dropdown.classList.contains("is-hidden");
        dropdown.classList.toggle("is-hidden", open);
        trigger.setAttribute("aria-expanded", String(!open));
      });
      document.addEventListener("click", function () {
        dropdown.classList.add("is-hidden");
        trigger.setAttribute("aria-expanded", "false");
      });
    }

    const signout = document.getElementById("signout-button");
    if (signout) signout.addEventListener("click", function () { Auth.signOut(); });

    const notif = document.getElementById("header-notifications-button");
    if (notif) notif.addEventListener("click", function () { Router.go("notifications"); });

    setText("app-version", "v" + TRANSITCARE_CONFIG.APP_VERSION);
  }

  async function bootstrap() {
    initSupabase();

    if (!IS_SUPABASE_CONFIGURED) {
      const w = document.getElementById("config-warning");
      if (w) w.classList.remove("is-hidden");
    }

    bindAuthForms();
    wireGlobalUi();

    if (!supabase) {
      showAuthScreen();
      return;
    }

    const hash = window.location.hash || "";
    if (hash.includes("type=recovery")) {
      showAuthScreen();
      document.querySelectorAll(".auth-form").forEach(function (f) { f.classList.add("is-hidden"); });
      const rf = document.getElementById("reset-form");
      if (rf) rf.classList.remove("is-hidden");
      return;
    }

    let handled = false;

    supabase.auth.onAuthStateChange(async function (event, session) {
      if (event === "PASSWORD_RECOVERY") {
        showAuthScreen();
        document.querySelectorAll(".auth-form").forEach(function (f) { f.classList.add("is-hidden"); });
        const rf = document.getElementById("reset-form");
        if (rf) rf.classList.remove("is-hidden");
        handled = true;
        return;
      }
      if (event === "SIGNED_OUT" || !session) {
        resetState();
        showAuthScreen();
        handled = true;
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        try {
          await handleSignedIn(session);
        } catch (e) { showAuthScreen(); }
        handled = true;
      }
    });

    try {
      const session = await Auth.getSession();
      if (session) {
        await handleSignedIn(session);
      } else if (!handled) {
        showAuthScreen();
      }
    } catch (e) {
      if (!handled) showAuthScreen();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

})();
