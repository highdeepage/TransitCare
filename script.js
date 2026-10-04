/* =========================================================================
   EKO TRANSITCARE — APPLICATION LOGIC
   "Know Your Ride Before You Leave."
   Powered by Ajigbeda Girls Digital Queens
   ========================================================================= */

(function () {
  "use strict";

  /* =======================================================================
     01. CONFIGURATION
     ======================================================================= */
  const TRANSITCARE_CONFIG = {
    SUPABASE_URL: "https://wjxldmgnglrrthzkzots.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_Z4EiH6YUo-ThIDN-mKQYOg_u-JjPbD3",

    APP_NAME: "Eko TransitCare",
    APP_VERSION: "1.0.0",

    GPS_UPDATE_INTERVAL_MS: 12000,
    GPS_STALE_THRESHOLD_MS: 60000,
    BOARDING_WINDOW_MINUTES: 10,

    DEFAULT_MAP_CENTER: { lat: 6.5244, lng: 3.3792 },
    DEFAULT_MAP_ZOOM: 12
  };


  /* =======================================================================
     02. EXTERNAL LIBRARY LOADER
     ======================================================================= */
  const libraryCache = {};

  function loadExternalScript(url) {
    if (libraryCache[url]) return libraryCache[url];
    libraryCache[url] = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", function () { reject(new Error("Failed to load " + url)); });
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Failed to load " + url)); };
      document.head.appendChild(script);
    });
    return libraryCache[url];
  }

  function loadStylesheet(url) {
    if (document.querySelector('link[href="' + url + '"]')) return Promise.resolve();
    return new Promise(function (resolve) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = function () { resolve(); };
      link.onerror = function () { resolve(); };
      document.head.appendChild(link);
    });
  }

  const CDN = {
    QRCODE: "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
    LEAFLET_JS: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    LEAFLET_CSS: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  };


  /* =======================================================================
     03. SUPABASE INITIALIZATION
     Simple lock override — the version that works.
     ======================================================================= */
  let supabase = null;

  function initSupabase() {
    if (!TRANSITCARE_CONFIG.SUPABASE_URL || !TRANSITCARE_CONFIG.SUPABASE_ANON_KEY) {
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
            lock: function (_name, acquire) {
              return acquire();
            }
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
    activeTrip: null,
    cache: { terminals: null, operators: null, routes: null }
  };

  function resetState() {
    AppState.authUser = null;
    AppState.profile = null;
    AppState.role = null;
    AppState.currentView = "home";
    AppState.notifications = [];
    AppState.activeTrip = null;
    AppState.cache = { terminals: null, operators: null, routes: null };
    stopAllRealtime();
    stopGpsWatch();
  }


  /* =======================================================================
     05. UTILITIES
     ======================================================================= */
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
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
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "—";
    const diff = Date.now() - then;
    const s = Math.floor(diff / 1000);
    if (s < 10) return "just now";
    if (s < 60) return s + " seconds ago";
    const m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    const h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.floor(h / 24);
    if (d < 30) return d + (d === 1 ? " day ago" : " days ago");
    return formatDate(iso);
  }

  function getInitials(name) {
    if (!name) return "–";
    const parts = String(name).trim().split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join("") || "–";
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function humanizeStatus(status) {
    if (!status) return "—";
    return String(status)
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
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
     06. TOAST SYSTEM
     ======================================================================= */
  const Toast = (function () {
    const container = document.getElementById("toast-container");
    const ICONS = { success: "✓", danger: "✕", warning: "⚠", info: "ℹ" };

    function show(title, message, type, durationMs) {
      if (!container) return;
      const toast = document.createElement("div");
      toast.className = "toast toast--" + (type || "info");
      toast.setAttribute("role", "alert");
      toast.innerHTML =
        '<span class="toast__icon" aria-hidden="true">' + (ICONS[type] || ICONS.info) + '</span>' +
        '<div class="toast__content">' +
          '<p class="toast__title">' + escapeHtml(title) + '</p>' +
          (message ? '<p class="toast__message">' + escapeHtml(message) + '</p>' : "") +
        '</div>' +
        '<button type="button" class="toast__close" aria-label="Dismiss">&times;</button>';

      const remove = function () {
        if (!toast.isConnected) return;
        toast.classList.add("is-leaving");
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 220);
      };

      toast.querySelector(".toast__close").addEventListener("click", remove);
      container.appendChild(toast);

      const lifetime = typeof durationMs === "number" ? durationMs : 4800;
      if (lifetime > 0) setTimeout(remove, lifetime);
    }

    return {
      success: function (t, m) { show(t, m, "success"); },
      error:   function (t, m) { show(t, m, "danger", 7000); },
      warning: function (t, m) { show(t, m, "warning", 6000); },
      info:    function (t, m) { show(t, m, "info"); }
    };
  })();


  /* =======================================================================
     07. MODAL SYSTEM
     ======================================================================= */
  const Modal = (function () {
    const backdrop = document.getElementById("modal-backdrop");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    const footerEl = document.getElementById("modal-footer");
    const closeButton = document.getElementById("modal-close-button");

    let lastFocused = null;
    let onCloseCallback = null;

    function open(options) {
      if (!backdrop) return;
      lastFocused = document.activeElement;
      onCloseCallback = options.onClose || null;

      titleEl.textContent = options.title || "Dialog";
      bodyEl.innerHTML = options.body || "";
      footerEl.innerHTML = options.footer || "";

      backdrop.classList.remove("is-hidden");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";

      footerEl.querySelectorAll("[data-modal-action]").forEach(function (button) {
        button.addEventListener("click", function () {
          if (typeof options.onAction === "function") {
            options.onAction(button.getAttribute("data-modal-action"), button);
          }
        });
      });

      const focusTarget = bodyEl.querySelector(
        "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])"
      );
      setTimeout(function () {
        if (focusTarget) focusTarget.focus();
        else if (closeButton) closeButton.focus();
      }, 30);
    }

    function close() {
      if (!backdrop || backdrop.classList.contains("is-hidden")) return;
      backdrop.classList.add("is-hidden");
      backdrop.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      bodyEl.innerHTML = "";
      footerEl.innerHTML = "";
      if (typeof onCloseCallback === "function") onCloseCallback();
      onCloseCallback = null;
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function confirm(options) {
      return new Promise(function (resolve) {
        open({
          title: options.title || "Please confirm",
          body: "<p>" + escapeHtml(options.message || "Are you sure?") + "</p>",
          footer:
            '<button type="button" class="button button--ghost" data-modal-action="cancel">' +
              escapeHtml(options.cancelLabel || "Cancel") +
            '</button>' +
            '<button type="button" class="button ' +
              (options.danger ? "button--danger" : "button--primary") +
              '" data-modal-action="confirm">' +
              escapeHtml(options.confirmLabel || "Confirm") +
            '</button>',
          onAction: function (action) {
            close();
            resolve(action === "confirm");
          },
          onClose: function () { resolve(false); }
        });
      });
    }

    if (closeButton) closeButton.addEventListener("click", close);
    if (backdrop) {
      backdrop.addEventListener("click", function (event) {
        if (event.target === backdrop) close();
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && backdrop && !backdrop.classList.contains("is-hidden")) {
        close();
      }
    });

    return { open: open, close: close, confirm: confirm };
  })();


  /* =======================================================================
     08. GLOBAL LOADER
     ======================================================================= */
  const Loader = (function () {
    const overlay = document.getElementById("global-loader");
    const textEl = document.getElementById("global-loader-text");
    let counter = 0;

    function show(message) {
      counter += 1;
      if (textEl) textEl.textContent = message || "Working…";
      if (overlay) {
        overlay.classList.remove("is-hidden");
        overlay.setAttribute("aria-hidden", "false");
      }
    }

    function hide() {
      counter = Math.max(0, counter - 1);
      if (counter === 0 && overlay) {
        overlay.classList.add("is-hidden");
        overlay.setAttribute("aria-hidden", "true");
      }
    }

    return { show: show, hide: hide };
  })();

  function renderLoading(container, message) {
    if (!container) return;
    container.innerHTML =
      '<div class="loading-state">' +
        '<span class="spinner spinner--small" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(message || "Loading…") + '</span>' +
      '</div>';
  }

  function renderEmpty(container, options) {
    if (!container) return;
    container.innerHTML =
      '<div class="empty-state">' +
        '<span class="empty-state__icon" aria-hidden="true">' + escapeHtml(options.icon || "📭") + '</span>' +
        '<p class="empty-state__title">' + escapeHtml(options.title || "Nothing here yet") + '</p>' +
        '<p class="empty-state__message">' + escapeHtml(options.message || "") + '</p>' +
        (options.actionHtml ? '<div class="empty-state__actions">' + options.actionHtml + '</div>' : "") +
      '</div>';
  }

  function renderError(container, message, retryFn) {
    if (!container) return;
    container.innerHTML =
      '<div class="empty-state">' +
        '<span class="empty-state__icon" aria-hidden="true">⚠️</span>' +
        '<p class="empty-state__title">Something went wrong</p>' +
        '<p class="empty-state__message">' + escapeHtml(message || "Please try again.") + '</p>' +
        (retryFn ? '<div class="empty-state__actions"><button type="button" class="button button--secondary" id="retry-button">Retry</button></div>' : "") +
      '</div>';
    if (retryFn) {
      const retry = container.querySelector("#retry-button");
      if (retry) retry.addEventListener("click", retryFn);
    }
  }


  /* =======================================================================
     09. FORM VALIDATION
     ======================================================================= */
  const Validators = {
    required: function (value) {
      return value !== null && value !== undefined && String(value).trim().length > 0;
    },
    email: function (value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
    },
    phone: function (value) {
      const digits = String(value).replace(/[^\d]/g, "");
      return digits.length >= 7 && digits.length <= 15;
    },
    passwordStrength: function (value) {
      const v = String(value || "");
      let score = 0;
      if (v.length >= 8) score++;
      if (/[a-z]/.test(v)) score++;
      if (/[A-Z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      return score;
    }
  };

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    const wrapper = input.closest(".field");
    const errorEl = document.querySelector('[data-error-for="' + fieldId + '"]');

    if (message) {
      if (wrapper) wrapper.classList.add("has-error");
      if (errorEl) errorEl.textContent = message;
      input.setAttribute("aria-invalid", "true");
    } else {
      if (wrapper) wrapper.classList.remove("has-error");
      if (errorEl) errorEl.textContent = "";
      input.removeAttribute("aria-invalid");
    }
  }

  function clearFormErrors(form) {
    if (!form) return;
    form.querySelectorAll(".field.has-error").forEach(function (field) {
      field.classList.remove("has-error");
    });
    form.querySelectorAll(".field__error").forEach(function (el) {
      el.textContent = "";
    });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
    });
  }

  function setFormMessage(elementId, type, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!message) {
      el.className = "alert is-hidden";
      el.innerHTML = "";
      return;
    }
    el.className = "alert alert--" + type;
    el.innerHTML = escapeHtml(message);
  }

  function bindPasswordMeter(inputId, barId, hintId) {
    const input = document.getElementById(inputId);
    const bar = document.getElementById(barId);
    const hint = document.getElementById(hintId);
    if (!input || !bar) return;

    input.addEventListener("input", function () {
      const score = Validators.passwordStrength(input.value);
      const percentage = (score / 5) * 100;
      bar.style.width = percentage + "%";
      bar.classList.remove("is-weak", "is-fair", "is-good", "is-strong");

      let label = "Use 8+ characters with letters and numbers.";
      if (input.value.length === 0) {
        bar.style.width = "0%";
      } else if (score <= 2) {
        bar.classList.add("is-weak");
        label = "Weak — add more characters and variety.";
      } else if (score === 3) {
        bar.classList.add("is-fair");
        label = "Fair — add a number or symbol to strengthen it.";
      } else if (score === 4) {
        bar.classList.add("is-good");
        label = "Good — add a symbol for extra strength.";
      } else {
        bar.classList.add("is-strong");
        label = "Strong password.";
      }
      if (hint) hint.textContent = label;
    });
  }


  /* =======================================================================
     10. AUTHENTICATION
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

      const needsVerification = data.session === null;

      if (!needsVerification && data.user && data.user.id) {
        try {
          await supabase.from("profiles").insert({
            id: data.user.id,
            full_name: payload.fullName,
            email: payload.email,
            phone: payload.phone || null,
            role: payload.role || "passenger",
            status: payload.role === "driver" ? "email_verified" : "active"
          });
        } catch (err) { console.warn("[TransitCare] Profile insert skipped:", err); }
      }

      return { needsVerification: needsVerification, user: data.user, session: data.session };
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
      stopAllRealtime();
      if (supabase) {
        try { await supabase.auth.signOut(); } catch (err) { console.warn(err); }
      }
      resetState();
      showAuthScreen();
    },

    async getSession() {
      if (!supabase) return null;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("[TransitCare] getSession error:", error.message);
          return null;
        }
        return data.session;
      } catch (err) {
        console.warn("[TransitCare] getSession failed:", err);
        return null;
      }
    }
  };


  /* =======================================================================
     11. SESSION & PROFILE
     ======================================================================= */
  const Profile = {

    async fetch(userId) {
      if (!supabase || !userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        console.warn("[TransitCare] Profile fetch error:", error.message);
        return null;
      }
      return data;
    },

    async update(userId, patch) {
      if (!supabase || !userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    resolveRole(profile, authUser) {
      if (profile && profile.role) return profile.role;
      if (authUser && authUser.user_metadata && authUser.user_metadata.role) {
        return authUser.user_metadata.role;
      }
      return "passenger";
    }
  };


  /* =======================================================================
     12. ROLE-BASED NAVIGATION
     ======================================================================= */
  const NAVIGATION = {
    passenger: [
      { group: "Travel" },
      { key: "home",          label: "Home",          icon: "🏠" },
      { key: "search",        label: "Find a bus",    icon: "🔍" },
      { key: "my-trips",      label: "My trips",      icon: "🧭" },
      { key: "tickets",       label: "Tickets",       icon: "🎫" },
      { group: "Account" },
      { key: "notifications", label: "Notifications", icon: "🔔", badgeKey: "unreadNotifications" },
      { key: "profile",       label: "Profile",       icon: "👤" }
    ],
    driver: [
      { group: "Operations" },
      { key: "driver-dashboard",   label: "Dashboard",           icon: "📊" },
      { key: "make-bus-available", label: "Make bus available",  icon: "🚌" },
      { key: "active-trip",        label: "Active trip",         icon: "📍" },
      { key: "driver-trips",       label: "My trips",            icon: "🧭" },
      { key: "scan-ticket",        label: "Scan ticket",         icon: "📷" },
      { group: "Account" },
      { key: "notifications",      label: "Notifications",       icon: "🔔", badgeKey: "unreadNotifications" },
      { key: "profile",            label: "Profile",             icon: "👤" }
    ],
    operator: [
      { group: "Fleet" },
      { key: "operator-dashboard", label: "Dashboard",    icon: "📊" },
      { key: "operator-fleet",     label: "Vehicles",     icon: "🚌" },
      { key: "operator-drivers",   label: "Drivers",      icon: "👨‍✈️" },
      { key: "operator-trips",     label: "Trips",        icon: "🧭" },
      { group: "Account" },
      { key: "notifications",      label: "Notifications", icon: "🔔", badgeKey: "unreadNotifications" },
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
      { key: "notifications",   label: "Notifications",   icon: "🔔", badgeKey: "unreadNotifications" },
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
    if (key === "unreadNotifications") {
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
        if (item.group) {
          return '<p class="app-nav__group-label">' + escapeHtml(item.group) + "</p>";
        }
        const isActive = AppState.currentView === item.key;
        const badgeCount = item.badgeKey ? countBadge(item.badgeKey) : 0;
        return (
          '<button type="button" class="app-nav__item' + (isActive ? " is-active" : "") +
            '" data-nav-link data-view="' + escapeHtml(item.key) + '">' +
            '<span class="app-nav__icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>' +
            '<span class="app-nav__label">' + escapeHtml(item.label) + '</span>' +
            (badgeCount > 0 ? '<span class="app-nav__count">' + badgeCount + '</span>' : "") +
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
        const isActive = AppState.currentView === item.key;
        const badgeCount = item.badgeKey ? countBadge(item.badgeKey) : 0;
        return (
          '<button type="button" class="app-bottom-nav__item' + (isActive ? " is-active" : "") +
            '" data-nav-link data-view="' + escapeHtml(item.key) + '">' +
            '<span class="app-bottom-nav__icon" aria-hidden="true">' + escapeHtml(item.icon) +
              (badgeCount > 0 ? '<span class="icon-button__badge">' + badgeCount + '</span>' : "") +
            '</span>' +
            '<span class="app-bottom-nav__label">' + escapeHtml(item.label) + '</span>' +
          '</button>'
        );
      }).join("");
    }

    document.querySelectorAll("[data-nav-link]").forEach(function (el) {
      el.addEventListener("click", function (event) {
        event.preventDefault();
        const view = el.getAttribute("data-view");
        if (view) Router.go(view);
        closeSidebar();
      });
    });
  }


  /* =======================================================================
     13. VIEW ROUTER
     ======================================================================= */
  const Router = {
    registry: {},
    register: function (key, definition) { this.registry[key] = definition; },
    go: async function (key, params) {
      const definition = this.registry[key];
      const root = document.getElementById("view-root");
      if (!root) return;

      if (!definition) {
        root.innerHTML = '<div class="empty-state"><p class="empty-state__title">View not found</p></div>';
        return;
      }

      AppState.currentView = key;
      renderNavigation();
      window.scrollTo({ top: 0, behavior: "auto" });

      const inner = document.createElement("div");
      inner.className = "app-main__inner";
      inner.innerHTML =
        '<header class="page-header">' +
          '<div class="page-header__titles">' +
            '<h1 class="page-header__title">' + escapeHtml(definition.title || "") + '</h1>' +
            (definition.subtitle
              ? '<p class="page-header__subtitle">' + escapeHtml(definition.subtitle) + '</p>'
              : "") +
          '</div>' +
          (definition.headerActions ? '<div class="page-header__actions">' + definition.headerActions + '</div>' : "") +
        '</header>' +
        '<div id="view-content" class="view-stack"></div>';

      root.innerHTML = "";
      root.appendChild(inner);

      try {
        await definition.render(document.getElementById("view-content"), params || {});
      } catch (error) {
        console.error("[TransitCare] View render failed:", key, error);
        renderError(
          document.getElementById("view-content"),
          error && error.message ? error.message : "Unable to load this view.",
          function () { Router.go(key, params); }
        );
      }
    }
  };


  /* =======================================================================
     SHARED DATA HELPERS
     ======================================================================= */
  const Data = {

    async getTerminals(activeOnly) {
      if (!supabase) return [];
      let query = supabase.from("terminals").select("*").order("name", { ascending: true });
      if (activeOnly) query = query.eq("status", "active");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async getOperators(activeOnly) {
      if (!supabase) return [];
      let query = supabase.from("operators").select("*").order("name", { ascending: true });
      if (activeOnly) query = query.eq("status", "active");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async getRoutes(activeOnly) {
      if (!supabase) return [];
      let query = supabase.from("routes").select("*").order("origin", { ascending: true });
      if (activeOnly) query = query.eq("status", "active");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async getVehicles(operatorId) {
      if (!supabase) return [];
      let query = supabase.from("vehicles").select("*").order("registration_number", { ascending: true });
      if (operatorId) query = query.eq("operator_id", operatorId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async getSeatStats(tripId, capacity) {
      if (!supabase || !tripId) return { capacity: capacity || 0, reserved: 0, boarded: 0, available: capacity || 0 };
      const { data, error } = await supabase
        .from("bookings")
        .select("seat_number, status")
        .eq("trip_id", tripId)
        .in("status", ["reserved", "boarded"]);
      if (error) throw error;

      const reserved = (data || []).filter(function (b) { return b.status === "reserved"; }).length;
      const boarded = (data || []).filter(function (b) { return b.status === "boarded"; }).length;
      const cap = capacity || 0;
      return {
        capacity: cap,
        reserved: reserved,
        boarded: boarded,
        available: Math.max(0, cap - reserved - boarded)
      };
    },

    async logAudit(action, entityType, entityId, details) {
      if (!supabase || !AppState.authUser) return;
      try {
        await supabase.from("audit_logs").insert({
          actor_id: AppState.authUser.id,
          action: action,
          entity_type: entityType || null,
          entity_id: entityId || null,
          details: details || null
        });
      } catch (err) { console.warn("[TransitCare] Audit log failed:", err); }
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
      const firstName = String(name).split(" ")[0];

      container.innerHTML =
        '<section class="card">' +
          '<div class="card__body">' +
            '<p class="eyebrow">Eko TransitCare</p>' +
            '<h2 style="margin-top:6px;font-size:22px;font-weight:800;letter-spacing:-0.02em;">Hello, ' + escapeHtml(firstName) + ' 👋</h2>' +
            '<p class="text-muted mt-2">Find a bus, reserve a seat and track your ride — all before you leave home.</p>' +
            '<div class="button-group mt-4">' +
              '<button type="button" class="button button--primary" data-nav-link data-view="search">🔍 Find a bus</button>' +
              '<button type="button" class="button button--secondary" data-nav-link data-view="tickets">🎫 My tickets</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Upcoming trips</h3></div>' +
        '<div class="card__body" id="home-upcoming"></div></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Recent notifications</h3></div>' +
        '<div class="card__body card__body--flush" id="home-notifications"></div></section>';

      document.querySelectorAll("[data-nav-link]").forEach(function (el) {
        el.addEventListener("click", function (event) {
          event.preventDefault();
          const view = el.getAttribute("data-view");
          if (view) Router.go(view);
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
          .order("created_at", { ascending: false })
          .limit(3);
        if (error) throw error;
        if (!data || data.length === 0) {
          renderEmpty(upcoming, {
            icon: "🧭", title: "No upcoming trips yet",
            message: "Search for a bus and reserve your seat — your trips will appear here."
          });
        } else {
          upcoming.innerHTML = '<div class="list">' + data.map(renderBookingRow).join("") + '</div>';
        }
      } catch (err) { renderError(upcoming, err.message); }

      const notif = document.getElementById("home-notifications");
      try {
        renderLoading(notif, "Loading notifications…");
        const { data, error } = await supabase
          .from("notifications").select("*")
          .eq("recipient_id", AppState.authUser.id)
          .order("created_at", { ascending: false })
          .limit(4);
        if (error) throw error;
        if (!data || data.length === 0) {
          renderEmpty(notif, { icon: "🔔", title: "No notifications yet", message: "Trip reminders and ticket updates will appear here." });
        } else {
          notif.innerHTML = data.map(renderNotificationRow).join("");
        }
      } catch (err) { renderError(notif, err.message); }
    }
  });

  function renderBookingRow(booking) {
    const trip = booking.trips || {};
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    return (
      '<div class="list__item"><div class="list__main">' +
        '<p class="list__title">' + escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</p>' +
        '<p class="list__meta">' + escapeHtml(trip.trip_code || "—") + ' · ' +
          escapeHtml(vehicle.registration_number || "—") + ' · Seat ' + escapeHtml(booking.seat_number || "—") + '</p>' +
      '</div>' +
      '<span class="badge badge--' + escapeHtml(booking.status || "reserved") + '">' +
        escapeHtml(humanizeStatus(booking.status)) + '</span></div>'
    );
  }

  function renderNotificationRow(notification) {
    return (
      '<div class="notification-item' + (notification.is_read ? "" : " notification-item--unread") + '" data-notification-id="' + escapeHtml(notification.id) + '">' +
        '<span class="notification-item__icon" aria-hidden="true">🔔</span>' +
        '<div class="notification-item__body">' +
          '<p class="notification-item__title">' + escapeHtml(notification.title || "Notification") + '</p>' +
          '<p class="notification-item__message">' + escapeHtml(notification.message || "") + '</p>' +
          '<p class="notification-item__time">' + escapeHtml(formatRelativeTime(notification.created_at)) + '</p>' +
        '</div>' +
        (notification.is_read ? "" : '<span class="notification-dot" aria-label="Unread"></span>') +
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
        const destinations = Array.from(new Set(routes.map(function (r) { return r.destination; }).filter(Boolean))).sort();

        originSelect.innerHTML = '<option value="">Any origin</option>' +
          origins.map(function (o) { return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>'; }).join("");
        destSelect.innerHTML = '<option value="">Any destination</option>' +
          destinations.map(function (d) { return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>'; }).join("");
      } catch (err) {
        originSelect.innerHTML = '<option value="">Unable to load routes</option>';
        destSelect.innerHTML = '<option value="">Unable to load routes</option>';
      }

      const dateInput = document.getElementById("search-date");
      if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

      const form = document.getElementById("search-form");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        performSearch();
      });

      async function performSearch() {
        const resultsEl = document.getElementById("search-results");
        renderLoading(resultsEl, "Finding available buses…");

        const origin = originSelect.value;
        const destination = destSelect.value;
        const dateValue = dateInput.value;

        try {
          let dateFrom = null, dateTo = null;
          if (dateValue) {
            dateFrom = new Date(dateValue + "T00:00:00").toISOString();
            dateTo = new Date(dateValue + "T23:59:59").toISOString();
          }

          let query = supabase
            .from("trips")
            .select("*, routes(id, origin, destination, estimated_minutes, base_fare), vehicles(id, registration_number, capacity, vehicle_type)")
            .in("status", ["scheduled", "boarding", "in_transit"])
            .order("planned_departure", { ascending: true });

          if (dateFrom) query = query.gte("planned_departure", dateFrom);
          if (dateTo) query = query.lte("planned_departure", dateTo);

          const { data, error } = await query;
          if (error) throw error;

          let filtered = data || [];
          if (origin) filtered = filtered.filter(function (t) { return t.routes && t.routes.origin === origin; });
          if (destination) filtered = filtered.filter(function (t) { return t.routes && t.routes.destination === destination; });

          const enriched = await Promise.all(filtered.map(async function (trip) {
            const stats = await Data.getSeatStats(trip.id, trip.vehicles ? trip.vehicles.capacity : 0);
            return Object.assign({}, trip, { seatStats: stats });
          }));

          if (enriched.length === 0) {
            renderEmpty(resultsEl, {
              icon: "🚌", title: "No buses found",
              message: "No buses are currently available for this route. Try a different date or destination."
            });
            return;
          }

          resultsEl.innerHTML = '<div class="trip-list">' + enriched.map(renderTripCard).join("") + '</div>';

          resultsEl.querySelectorAll("[data-book-trip]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              const tripId = btn.getAttribute("data-book-trip");
              const trip = enriched.find(function (t) { return t.id === tripId; });
              if (trip) openBookingModal(trip);
            });
          });

          resultsEl.querySelectorAll("[data-track-trip]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              Router.go("track-trip", { tripId: btn.getAttribute("data-track-trip") });
            });
          });
        } catch (err) { renderError(resultsEl, err.message, performSearch); }
      }

      performSearch();
    }
  });

  function renderTripCard(trip) {
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    const stats = trip.seatStats || { available: 0 };
    const status = trip.status || "scheduled";
    const seatsLow = stats.available <= 3;
    const isTrackable = status === "in_transit" || status === "boarding";

    return (
      '<article class="trip-card trip-card--' + escapeHtml(status) + '">' +
        '<div class="trip-card__identity">' +
          '<p class="trip-card__code">' + escapeHtml(trip.trip_code || "TC-???") + '</p>' +
          '<p class="trip-card__vehicle">' + escapeHtml(vehicle.registration_number || "Vehicle TBA") + '</p>' +
        '</div>' +
        '<div class="trip-card__route">' +
          '<p class="trip-card__cities">' + escapeHtml(route.origin || "?") +
            '<span class="trip-card__arrow" aria-hidden="true">→</span>' + escapeHtml(route.destination || "?") + '</p>' +
          '<p class="trip-card__stops">' + escapeHtml(route.estimated_minutes ? route.estimated_minutes + " min journey" : "") + '</p>' +
        '</div>' +
        '<div class="trip-card__timing">' +
          '<p class="trip-card__time">' + escapeHtml(formatTime(trip.planned_departure)) + '</p>' +
          '<p class="trip-card__date">' + escapeHtml(formatDate(trip.planned_departure)) + '</p>' +
        '</div>' +
        '<div class="trip-card__seats">' +
          '<p class="trip-card__seats-value' + (seatsLow ? " trip-card__seats-value--low" : "") + '">' + stats.available + '</p>' +
          '<p class="trip-card__seats-label">seats free</p>' +
        '</div>' +
        '<div class="trip-card__fare">' +
          '<p class="trip-card__fare-value">' + escapeHtml(formatCurrency(route.base_fare)) + '</p>' +
          '<p class="trip-card__fare-label">per seat</p>' +
        '</div>' +
        '<div class="trip-card__actions">' +
          '<span class="badge badge--' + escapeHtml(status) + '">' + escapeHtml(humanizeStatus(status)) + '</span>' +
          (isTrackable ? '<button type="button" class="button button--small button--ghost" data-track-trip="' + escapeHtml(trip.id) + '">Track</button>' : "") +
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
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        if (action === "confirm") await completeBooking(trip);
      }
    });

    const body = document.getElementById("modal-body");
    try {
      const stats = await Data.getSeatStats(trip.id, trip.vehicles ? trip.vehicles.capacity : 0);
      const capacity = stats.capacity || 0;

      if (capacity === 0) {
        body.innerHTML = '<p class="text-muted">Vehicle capacity is not configured.</p>';
        return;
      }

      const { data: existing } = await supabase
        .from("bookings").select("seat_number, status")
        .eq("trip_id", trip.id).in("status", ["reserved", "boarded"]);

      const takenSeats = {};
      (existing || []).forEach(function (b) { takenSeats[b.seat_number] = b.status; });

      let seatsHtml = '<div class="seat-legend">' +
        '<span class="seat-legend__item"><span class="seat-legend__swatch seat-legend__swatch--available"></span> Available</span>' +
        '<span class="seat-legend__item"><span class="seat-legend__swatch seat-legend__swatch--reserved"></span> Reserved</span>' +
        '<span class="seat-legend__item"><span class="seat-legend__swatch seat-legend__swatch--boarded"></span> Boarded</span>' +
        '</div><div class="seat-grid" id="modal-seat-grid">';

      for (let i = 1; i <= capacity; i++) {
        const status = takenSeats[i];
        let cls = "seat--available", stateLabel = "Free";
        if (status === "reserved") { cls = "seat--reserved"; stateLabel = "Reserved"; }
        if (status === "boarded") { cls = "seat--boarded"; stateLabel = "Boarded"; }
        seatsHtml += '<button type="button" class="seat ' + cls + '" data-seat="' + i + '"' +
          (status ? " disabled" : "") + '>' +
          '<span class="seat__number">' + i + '</span>' +
          '<span class="seat__state">' + stateLabel + '</span></button>';
      }
      seatsHtml += '</div>';

      body.innerHTML =
        '<p class="text-muted mb-4">' + escapeHtml(trip.trip_code || "Trip") + ' · ' +
          escapeHtml(trip.routes ? trip.routes.origin + " → " + trip.routes.destination : "") + '</p>' +
        seatsHtml +
        '<p class="text-small text-muted mt-4" id="selected-seat-label">No seat selected.</p>';

      let selectedSeat = null;

      body.querySelectorAll(".seat--available").forEach(function (seatBtn) {
        seatBtn.addEventListener("click", function () {
          body.querySelectorAll(".seat--selected").forEach(function (el) { el.classList.remove("seat--selected"); });
          seatBtn.classList.add("seat--selected");
          selectedSeat = Number(seatBtn.getAttribute("data-seat"));
          const label = document.getElementById("selected-seat-label");
          if (label) label.textContent = "Selected seat: " + selectedSeat;
          const confirmBtn = document.getElementById("modal-confirm-booking");
          if (confirmBtn) confirmBtn.disabled = false;
          trip._selectedSeat = selectedSeat;
        });
      });
    } catch (err) {
      body.innerHTML = '<p class="text-muted">Unable to load seats: ' + escapeHtml(err.message) + '</p>';
    }
  }

  async function completeBooking(trip) {
    const seat = trip._selectedSeat;
    if (!seat) { Toast.warning("No seat selected", "Please choose a seat before confirming."); return; }

    Loader.show("Processing booking…");
    try {
      const { data: conflict } = await supabase
        .from("bookings").select("id")
        .eq("trip_id", trip.id).eq("seat_number", seat)
        .in("status", ["reserved", "boarded"]).maybeSingle();

      if (conflict) {
        Modal.close();
        Toast.error("Seat taken", "That seat was just reserved by someone else. Please choose another.");
        return;
      }

      const { data: booking, error: bookingError } = await supabase
        .from("bookings").insert({
          passenger_id: AppState.authUser.id,
          trip_id: trip.id,
          seat_number: seat,
          status: "reserved",
          fare: trip.routes ? trip.routes.base_fare : null
        }).select().single();
      if (bookingError) throw bookingError;

      const { error: ticketError } = await supabase.from("tickets").insert({
        booking_id: booking.id,
        ticket_code: generateTicketCode(),
        status: "valid"
      });
      if (ticketError) throw ticketError;

      await Notifications.create({
        recipient_id: AppState.authUser.id,
        title: "Ticket confirmed",
        message: "Your seat " + seat + " on " + (trip.trip_code || "the trip") + " is reserved.",
        type: "ticket_confirmed",
        related_entity: booking.id
      });

      await Data.logAudit("booking_created", "booking", booking.id, { trip_id: trip.id, seat: seat });

      Modal.close();
      Toast.success("Booking confirmed", "Seat " + seat + " is reserved. View your ticket in the Tickets tab.");
      Router.go("tickets");
    } catch (err) {
      console.error("[TransitCare] Booking failed:", err);
      Toast.error("Booking failed", err.message || "Please try again.");
    } finally { Loader.hide(); }
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

        if (!data || data.length === 0) {
          renderEmpty(list, {
            icon: "🧭", title: "No trips yet",
            message: "Once you book a bus, your journeys will show up here."
          });
          return;
        }

        list.innerHTML = '<div class="card"><div class="card__body card__body--flush"><div class="list">' +
          data.map(renderBookingRow).join("") + '</div></div></div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("tickets", {
    title: "My tickets",
    subtitle: "Show these at boarding. Each ticket can only be used once.",
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

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🎫", title: "No tickets yet", message: "Book a trip to receive a digital ticket with a QR code." });
          return;
        }

        list.innerHTML = '<div class="card-grid">' + data.map(renderTicketCard).join("") + '</div>';

        data.forEach(function (booking) {
          const ticket = booking.tickets && booking.tickets[0];
          if (ticket) renderQrForTicket(ticket.ticket_code, "qr-" + ticket.id);
        });
      } catch (err) { renderError(list, err.message); }
    }
  });

  function renderTicketCard(booking) {
    const trip = booking.trips || {};
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    const ticket = booking.tickets && booking.tickets[0];

    return (
      '<article class="ticket-card">' +
        '<header class="ticket-card__header">' +
          '<span class="ticket-card__brand">🚌 Eko TransitCare</span>' +
          '<span class="ticket-card__status">' + escapeHtml(humanizeStatus(booking.status)) + '</span>' +
        '</header>' +
        '<div class="ticket-card__body">' +
          '<p class="ticket-card__route">' + escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</p>' +
          '<dl class="ticket-card__details">' +
            '<div class="ticket-card__detail"><dt>Ticket ID</dt><dd>' + escapeHtml(ticket ? ticket.ticket_code : "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Trip</dt><dd>' + escapeHtml(trip.trip_code || "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Vehicle</dt><dd>' + escapeHtml(vehicle.registration_number || "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Seat</dt><dd>' + escapeHtml(booking.seat_number || "—") + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Departure</dt><dd>' + escapeHtml(formatDateTime(trip.planned_departure)) + '</dd></div>' +
            '<div class="ticket-card__detail"><dt>Fare</dt><dd>' + escapeHtml(formatCurrency(booking.fare)) + '</dd></div>' +
          '</dl>' +
          '<div class="ticket-card__qr">' +
            '<div id="qr-' + escapeHtml(ticket ? ticket.id : "") + '"></div>' +
            '<p class="ticket-card__qr-caption">Show this QR code to the driver when boarding.</p>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  async function renderQrForTicket(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      await loadExternalScript(CDN.QRCODE);
      if (window.QRCode && window.QRCode.toCanvas) {
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);
        window.QRCode.toCanvas(canvas, text, { width: 168, margin: 1 }, function () {});
      } else {
        container.innerHTML = '<p class="text-tiny text-muted">QR code: ' + escapeHtml(text) + '</p>';
      }
    } catch (err) {
      container.innerHTML = '<p class="text-tiny text-muted">QR code: ' + escapeHtml(text) + '</p>';
    }
  }

  Router.register("track-trip", {
    title: "Track your bus",
    subtitle: "Live location updates from the driver's device.",
    render: async function (container, params) {
      const tripId = params.tripId;
      if (!tripId) {
        renderEmpty(container, { icon: "🚌", title: "No trip selected", message: "Open tracking from a search result." });
        return;
      }

      container.innerHTML =
        '<section class="card">' +
          '<div class="card__header">' +
            '<h3 class="card__title" id="track-title">Loading trip…</h3>' +
            '<span class="badge" id="track-status">—</span>' +
          '</div>' +
          '<div class="card__body card__body--flush">' +
            '<div class="map-container" id="track-map">' +
              '<div class="map-placeholder"><span class="map-placeholder__icon">🗺️</span>Loading map…</div>' +
            '</div>' +
          '</div>' +
          '<div class="card__footer" id="track-details"></div>' +
        '</section>';

      try {
        const { data: trip, error } = await supabase.from("trips")
          .select("*, routes(*), vehicles(*), profiles!trips_driver_id_fkey(full_name)")
          .eq("id", tripId).maybeSingle();
        if (error) throw error;
        if (!trip) {
          renderEmpty(container, { icon: "🚌", title: "Trip not found", message: "This trip may have been removed." });
          return;
        }

        setText("track-title", (trip.trip_code || "Trip") + " · " +
          (trip.routes ? trip.routes.origin + " → " + trip.routes.destination : ""));
        const statusEl = document.getElementById("track-status");
        statusEl.className = "badge badge--" + (trip.status || "scheduled");
        statusEl.textContent = humanizeStatus(trip.status);

        const detailsEl = document.getElementById("track-details");
        detailsEl.innerHTML = '<dl class="detail-list">' +
          '<div><dt>Driver</dt><dd>' + escapeHtml(trip.profiles ? trip.profiles.full_name : "—") + '</dd></div>' +
          '<div><dt>Vehicle</dt><dd>' + escapeHtml(trip.vehicles ? trip.vehicles.registration_number : "—") + '</dd></div>' +
          '<div><dt>Planned departure</dt><dd>' + escapeHtml(formatDateTime(trip.planned_departure)) + '</dd></div>' +
          '<div><dt>Actual departure</dt><dd>' + escapeHtml(trip.actual_departure ? formatDateTime(trip.actual_departure) : "Not yet") + '</dd></div>' +
        '</dl>';

        await initTrackingMap(trip);
        subscribeToTripLocations(trip.id);
      } catch (err) { renderError(container, err.message); }
    }
  });

  let trackMapInstance = null;
  let trackMarker = null;

  async function initTrackingMap(trip) {
    const mapEl = document.getElementById("track-map");
    if (!mapEl) return;

    try {
      await loadStylesheet(CDN.LEAFLET_CSS);
      await loadExternalScript(CDN.LEAFLET_JS);

      if (!window.L) {
        mapEl.innerHTML = '<div class="map-placeholder"><span class="map-placeholder__icon">🗺️</span>Map library unavailable.</div>';
        return;
      }

      mapEl.innerHTML = "";
      const center = TRANSITCARE_CONFIG.DEFAULT_MAP_CENTER;
      trackMapInstance = window.L.map(mapEl).setView([center.lat, center.lng], TRANSITCARE_CONFIG.DEFAULT_MAP_ZOOM);

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19
      }).addTo(trackMapInstance);

      const { data: locations } = await supabase.from("trip_locations").select("*")
        .eq("trip_id", trip.id).order("recorded_at", { ascending: false }).limit(1);

      if (locations && locations.length > 0) {
        const loc = locations[0];
        updateTrackMarker(loc.latitude, loc.longitude, loc.recorded_at);
      } else {
        mapEl.insertAdjacentHTML("beforeend",
          '<div class="map-overlay"><span class="map-overlay__label">Awaiting GPS signal</span>' +
          '<span class="map-overlay__value">The driver has not started sharing location yet.</span></div>');
      }
    } catch (err) {
      mapEl.innerHTML = '<div class="map-placeholder"><span class="map-placeholder__icon">🗺️</span>Map unavailable. ' + escapeHtml(err.message) + '</div>';
    }
  }

  function updateTrackMarker(lat, lng, recordedAt) {
    if (!trackMapInstance || !window.L) return;
    if (!trackMarker) {
      trackMarker = window.L.marker([lat, lng]).addTo(trackMapInstance);
    } else {
      trackMarker.setLatLng([lat, lng]);
    }
    trackMapInstance.setView([lat, lng], trackMapInstance.getZoom() || 14);

    const mapEl = document.getElementById("track-map");
    if (mapEl) {
      let overlay = mapEl.querySelector(".map-overlay");
      const age = Date.now() - new Date(recordedAt).getTime();
      const stale = age > TRANSITCARE_CONFIG.GPS_STALE_THRESHOLD_MS;
      const ageText = formatRelativeTime(recordedAt);

      const overlayHtml = '<div class="map-overlay' + (stale ? " map-overlay--stale" : "") + '">' +
        '<span class="map-overlay__label">' + (stale ? "GPS signal may be unavailable" : "Live location") + '</span>' +
        '<span class="map-overlay__value">Last updated ' + escapeHtml(ageText) + '</span></div>';

      if (overlay) overlay.outerHTML = overlayHtml;
      else mapEl.insertAdjacentHTML("beforeend", overlayHtml);
    }
  }

  function subscribeToTripLocations(tripId) {
    if (!supabase) return;
    stopRealtimeChannel("tripLocations");
    AppState.channels.tripLocations = supabase
      .channel("trip-locations-" + tripId)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "trip_locations", filter: "trip_id=eq." + tripId
      }, function (payload) {
        const loc = payload.new;
        if (loc) updateTrackMarker(loc.latitude, loc.longitude, loc.recorded_at);
      })
      .subscribe();
  }

  Router.register("notifications", {
    title: "Notifications",
    subtitle: "Trip reminders, ticket updates and seat releases.",
    headerActions: '<button type="button" class="button button--ghost button--small" id="mark-all-read">Mark all as read</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="notifications-list"></div></div>';
      const list = document.getElementById("notifications-list");
      renderLoading(list, "Loading notifications…");

      const markAll = document.getElementById("mark-all-read");
      if (markAll) {
        markAll.addEventListener("click", async function () {
          try {
            await supabase.from("notifications").update({ is_read: true })
              .eq("recipient_id", AppState.authUser.id).eq("is_read", false);
            Toast.success("All notifications marked as read");
            Router.go("notifications");
            refreshNotificationBadge();
          } catch (err) { Toast.error("Unable to mark as read", err.message); }
        });
      }

      try {
        const notifications = await Notifications.fetch();
        if (!notifications || notifications.length === 0) {
          renderEmpty(list, {
            icon: "🔔", title: "No notifications yet",
            message: "You will be notified when a bus is available, your ticket is confirmed, or a seat is released."
          });
          return;
        }
        list.innerHTML = notifications.map(renderNotificationRow).join("");

        list.querySelectorAll(".notification-item--unread").forEach(function (item) {
          item.addEventListener("click", async function () {
            const id = item.getAttribute("data-notification-id");
            if (!id) return;
            try {
              await supabase.from("notifications").update({ is_read: true }).eq("id", id);
              item.classList.remove("notification-item--unread");
              const dot = item.querySelector(".notification-dot");
              if (dot) dot.remove();
              refreshNotificationBadge();
            } catch (err) { /* silent */ }
          });
        });
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("profile", {
    title: "My profile",
    subtitle: "Your account details and preferences.",
    render: async function (container) {
      const profile = AppState.profile || {};
      container.innerHTML =
        '<section class="card">' +
          '<div class="card__body">' +
            '<div class="flex items-center gap-4">' +
              '<span class="avatar avatar--large">' + escapeHtml(getInitials(profile.full_name)) + '</span>' +
              '<div>' +
                '<h2 style="font-size:18px;font-weight:800;">' + escapeHtml(profile.full_name || "—") + '</h2>' +
                '<p class="text-muted text-small">' + escapeHtml(profile.email || "") + '</p>' +
                '<span class="badge badge--' + escapeHtml(profile.status || "active") + ' mt-2">' +
                  escapeHtml(humanizeStatus(profile.status || "active")) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Account details</h3></div>' +
        '<div class="card__body"><form id="profile-form">' +
          '<div class="field"><label for="profile-name">Full name</label>' +
            '<input type="text" id="profile-name" value="' + escapeHtml(profile.full_name || "") + '" /></div>' +
          '<div class="field"><label for="profile-phone">Phone number</label>' +
            '<input type="tel" id="profile-phone" value="' + escapeHtml(profile.phone || "") + '" /></div>' +
          '<div class="field"><label for="profile-email">Email address</label>' +
            '<input type="email" id="profile-email" value="' + escapeHtml(profile.email || "") + '" disabled />' +
            '<p class="field__hint">Email changes require verification.</p></div>' +
          '<div class="form-actions"><button type="submit" class="button button--primary">Save changes</button></div>' +
        '</form></div></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Session</h3></div>' +
        '<div class="card__body"><button type="button" class="button button--danger" id="profile-signout">Sign out</button></div></section>';

      document.getElementById("profile-form").addEventListener("submit", async function (event) {
        event.preventDefault();
        const name = document.getElementById("profile-name").value.trim();
        const phone = document.getElementById("profile-phone").value.trim();
        if (!name) { Toast.warning("Name required"); return; }

        Loader.show("Saving…");
        try {
          const updated = await Profile.update(AppState.authUser.id, { full_name: name, phone: phone || null });
          AppState.profile = updated || AppState.profile;
          updateHeaderUser();
          Toast.success("Profile updated");
        } catch (err) { Toast.error("Unable to save", err.message); }
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
    subtitle: "Your assigned vehicle, terminal and upcoming trips.",
    render: async function (container) {
      const profile = AppState.profile || {};
      const approved = profile.status === "approved";

      container.innerHTML =
        (!approved
          ? '<div class="alert alert--warning">' +
              '<strong>Account not yet approved.</strong>' +
              '<span>An administrator must approve your account before you can operate trips. ' +
              'Current status: ' + escapeHtml(humanizeStatus(profile.status)) + '.</span>' +
            '</div>'
          : "") +
        '<section class="stat-grid" id="driver-stats"></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Assigned vehicle</h3></div>' +
        '<div class="card__body" id="driver-vehicle">Loading…</div></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Your recent trips</h3></div>' +
        '<div class="card__body card__body--flush" id="driver-recent-trips">Loading…</div></section>';

      try {
        const { data: trips } = await supabase.from("trips").select("status").eq("driver_id", AppState.authUser.id);
        const total = (trips || []).length;
        const active = (trips || []).filter(function (t) { return t.status === "in_transit"; }).length;
        const completed = (trips || []).filter(function (t) { return t.status === "completed"; }).length;
        document.getElementById("driver-stats").innerHTML =
          statCard("🧭", total, "Total trips", "info") +
          statCard("🚌", active, "Active now", "success") +
          statCard("✅", completed, "Completed", "success");
      } catch (err) { /* ignore */ }

      const vehicleEl = document.getElementById("driver-vehicle");
      try {
        const { data: vehicles } = await supabase.from("vehicles").select("*").eq("assigned_driver_id", AppState.authUser.id);
        if (!vehicles || vehicles.length === 0) {
          vehicleEl.innerHTML = '<p class="text-muted">No vehicle assigned yet. Please contact an administrator.</p>';
        } else {
          const v = vehicles[0];
          vehicleEl.innerHTML = '<dl class="detail-list">' +
            '<div><dt>Registration</dt><dd>' + escapeHtml(v.registration_number || "—") + '</dd></div>' +
            '<div><dt>Type</dt><dd>' + escapeHtml(v.vehicle_type || "—") + '</dd></div>' +
            '<div><dt>Capacity</dt><dd>' + escapeHtml(v.capacity || "—") + ' seats</dd></div>' +
            '<div><dt>Status</dt><dd><span class="badge badge--' + escapeHtml(v.status || "active") + '">' +
              escapeHtml(humanizeStatus(v.status || "active")) + '</span></dd></div>' +
          '</dl>';
        }
      } catch (err) { vehicleEl.innerHTML = '<p class="text-muted">Unable to load vehicle.</p>'; }

      const tripsEl = document.getElementById("driver-recent-trips");
      try {
        const { data: trips } = await supabase.from("trips")
          .select("*, routes(origin, destination), vehicles(registration_number)")
          .eq("driver_id", AppState.authUser.id)
          .order("created_at", { ascending: false }).limit(5);
        if (!trips || trips.length === 0) {
          renderEmpty(tripsEl, { icon: "🧭", title: "No trips yet", message: "Create your first trip from Make Bus Available." });
        } else {
          tripsEl.innerHTML = '<div class="list">' + trips.map(renderDriverTripRow).join("") + '</div>';
        }
      } catch (err) { renderError(tripsEl, err.message); }
    }
  });

  function statCard(icon, value, label, variant) {
    return '<article class="stat-card">' +
      '<span class="stat-card__icon stat-card__icon--' + (variant || "") + '" aria-hidden="true">' + icon + '</span>' +
      '<div class="stat-card__body">' +
        '<p class="stat-card__value">' + escapeHtml(value) + '</p>' +
        '<p class="stat-card__label">' + escapeHtml(label) + '</p>' +
      '</div></article>';
  }

  function renderDriverTripRow(trip) {
    const route = trip.routes || {};
    return '<div class="list__item"><div class="list__main">' +
      '<p class="list__title">' + escapeHtml(trip.trip_code || "—") + ' · ' +
        escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</p>' +
      '<p class="list__meta">' + escapeHtml(formatDateTime(trip.planned_departure)) + '</p></div>' +
      '<span class="badge badge--' + escapeHtml(trip.status || "scheduled") + '">' +
        escapeHtml(humanizeStatus(trip.status)) + '</span></div>';
  }

  Router.register("make-bus-available", {
    title: "Make bus available",
    subtitle: "Publish a trip so passengers can see and book it.",
    render: async function (container) {
      if (!AppState.profile || AppState.profile.status !== "approved") {
        renderEmpty(container, { icon: "🔒", title: "Account not approved", message: "You must be an approved driver to publish trips." });
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

      const vehicleSelect = document.getElementById("trip-vehicle");
      const routeSelect = document.getElementById("trip-route");
      const terminalSelect = document.getElementById("trip-terminal");

      try {
        const [vehicles, routes, terminals] = await Promise.all([
          Data.getVehicles(), Data.getRoutes(true), Data.getTerminals(true)
        ]);

        const myVehicles = vehicles.filter(function (v) { return v.assigned_driver_id === AppState.authUser.id; });

        vehicleSelect.innerHTML = '<option value="">Select a vehicle</option>' +
          (myVehicles.map(function (v) {
            return '<option value="' + escapeHtml(v.id) + '">' + escapeHtml(v.registration_number) + ' (' + escapeHtml(v.capacity) + ' seats)</option>';
          }).join("") || '<option value="">No vehicle assigned</option>');

        routeSelect.innerHTML = '<option value="">Select a route</option>' +
          routes.map(function (r) {
            return '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.origin) + ' → ' + escapeHtml(r.destination) + '</option>';
          }).join("");

        terminalSelect.innerHTML = '<option value="">Select a terminal</option>' +
          terminals.map(function (t) { return '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + '</option>'; }).join("");
      } catch (err) { Toast.error("Unable to load form data", err.message); }

      const depInput = document.getElementById("trip-departure");
      if (depInput) {
        const d = new Date(Date.now() + 30 * 60000);
        depInput.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }

      document.getElementById("trip-form").addEventListener("submit", async function (event) {
        event.preventDefault();
        const vehicleId = vehicleSelect.value;
        const routeId = routeSelect.value;
        const terminalId = terminalSelect.value;
        const departureLocal = depInput.value;

        if (!vehicleId || !routeId || !departureLocal) {
          Toast.warning("Missing fields", "Please select a vehicle, route and departure time.");
          return;
        }

        Loader.show("Creating trip…");
        try {
          const { data, error } = await supabase.from("trips").insert({
            trip_code: generateTripCode(),
            driver_id: AppState.authUser.id,
            vehicle_id: vehicleId,
            route_id: routeId,
            terminal_id: terminalId || null,
            planned_departure: new Date(departureLocal).toISOString(),
            status: "scheduled"
          }).select().single();
          if (error) throw error;

          await Data.logAudit("trip_created", "trip", data.id, { route_id: routeId });
          Toast.success("Bus is now available", "Passengers can now see and book this trip.");
          Router.go("driver-trips");
        } catch (err) { Toast.error("Unable to create trip", err.message); }
        finally { Loader.hide(); }
      });
    }
  });

  Router.register("active-trip", {
    title: "Active trip",
    subtitle: "Start, track and end your current trip.",
    render: async function (container) {
      container.innerHTML = '<div id="active-trip-root"></div>';
      const root = document.getElementById("active-trip-root");
      renderLoading(root, "Loading active trip…");

      try {
        const { data: trips, error } = await supabase.from("trips")
          .select("*, routes(*), vehicles(*), terminals(name)")
          .eq("driver_id", AppState.authUser.id)
          .in("status", ["scheduled", "boarding", "in_transit"])
          .order("planned_departure", { ascending: true }).limit(1);
        if (error) throw error;

        if (!trips || trips.length === 0) {
          renderEmpty(root, { icon: "🚌", title: "No active trip", message: "Create a trip from Make Bus Available to get started." });
          return;
        }

        const trip = trips[0];
        AppState.activeTrip = trip;
        renderActiveTrip(root, trip);
      } catch (err) { renderError(root, err.message); }
    }
  });

  function renderActiveTrip(root, trip) {
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    const terminal = trip.terminals || {};

    root.innerHTML =
      '<section class="card">' +
        '<div class="card__header">' +
          '<h3 class="card__title">' + escapeHtml(trip.trip_code || "Trip") + '</h3>' +
          '<span class="badge badge--' + escapeHtml(trip.status) + '">' + escapeHtml(humanizeStatus(trip.status)) + '</span>' +
        '</div>' +
        '<div class="card__body"><dl class="detail-list">' +
          '<div><dt>Route</dt><dd>' + escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</dd></div>' +
          '<div><dt>Vehicle</dt><dd>' + escapeHtml(vehicle.registration_number || "—") + '</dd></div>' +
          '<div><dt>Terminal</dt><dd>' + escapeHtml(terminal.name || "—") + '</dd></div>' +
          '<div><dt>Planned departure</dt><dd>' + escapeHtml(formatDateTime(trip.planned_departure)) + '</dd></div>' +
          '<div><dt>Actual departure</dt><dd>' + escapeHtml(trip.actual_departure ? formatDateTime(trip.actual_departure) : "Not yet") + '</dd></div>' +
        '</dl></div>' +
        '<div class="card__footer"><div class="button-group" id="trip-actions"></div></div>' +
      '</section>' +
      '<section class="card" id="gps-card" style="display:none;">' +
        '<div class="card__header"><h3 class="card__title">GPS tracking</h3>' +
          '<span class="badge badge--in_transit" id="gps-status">Starting…</span></div>' +
        '<div class="card__body"><p class="text-muted" id="gps-message">Waiting for location…</p></div>' +
      '</section>';

    const actions = document.getElementById("trip-actions");

    if (trip.status === "scheduled") {
      actions.innerHTML = '<button type="button" class="button button--primary" id="start-trip-button">▶ Start trip</button>';
      document.getElementById("start-trip-button").addEventListener("click", function () { startTrip(trip); });
    } else if (trip.status === "boarding" || trip.status === "in_transit") {
      actions.innerHTML = '<button type="button" class="button button--danger" id="end-trip-button">⏹ End trip</button>';
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

      const { data: bookings } = await supabase.from("bookings").select("passenger_id")
        .eq("trip_id", trip.id).eq("status", "reserved");

      if (bookings && bookings.length) {
        for (const b of bookings) {
          await Notifications.create({
            recipient_id: b.passenger_id,
            title: "Trip started",
            message: "Bus " + (trip.trip_code || "") + " has departed. Track it live.",
            type: "trip_started",
            related_entity: trip.id
          });
        }
      }

      Toast.success("Trip started", "GPS tracking will begin shortly.");
      Router.go("active-trip");
    } catch (err) { Toast.error("Unable to start trip", err.message); }
    finally { Loader.hide(); }
  }

  async function endTrip(trip) {
    const confirmed = await Modal.confirm({
      title: "End trip?",
      message: "This will mark the trip as completed and stop GPS tracking.",
      confirmLabel: "End trip", danger: true
    });
    if (!confirmed) return;

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
    } catch (err) { Toast.error("Unable to end trip", err.message); }
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
          .eq("driver_id", AppState.authUser.id)
          .order("planned_departure", { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🧭", title: "No trips yet", message: "Create your first trip from Make Bus Available." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(renderDriverTripRow).join("") + '</div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("scan-ticket", {
    title: "Scan ticket",
    subtitle: "Validate a passenger's QR ticket against the database.",
    render: async function (container) {
      container.innerHTML =
        '<section class="card"><div class="card__header"><h3 class="card__title">Ticket code</h3></div>' +
        '<div class="card__body">' +
          '<div class="field"><label for="ticket-code-input">Enter or scan the ticket code</label>' +
            '<input type="text" id="ticket-code-input" placeholder="TKT-XXXX-XXXX" autocomplete="off" /></div>' +
          '<button type="button" class="button button--primary" id="validate-ticket-button">Validate ticket</button>' +
        '</div></section><div id="scan-result"></div>';

      const input = document.getElementById("ticket-code-input");
      const button = document.getElementById("validate-ticket-button");
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
            resultEl.innerHTML = scannerResult("invalid", "✕", "Invalid ticket", "No ticket with this code exists.");
            return;
          }

          const booking = ticket.bookings || {};

          if (ticket.status === "used") {
            resultEl.innerHTML = scannerResult("used", "⚠", "Ticket already used", "Scanned on " + formatDateTime(ticket.used_at) + ".");
            return;
          }

          if (ticket.status === "cancelled") {
            resultEl.innerHTML = scannerResult("invalid", "✕", "Ticket cancelled", "This ticket has been cancelled.");
            return;
          }

          const { error: updateError } = await supabase.from("tickets")
            .update({ status: "used", used_at: nowIso() }).eq("id", ticket.id);
          if (updateError) throw updateError;

          await supabase.from("bookings").update({ status: "boarded" }).eq("id", booking.id);
          await Data.logAudit("ticket_scanned", "ticket", ticket.id, { booking_id: booking.id });

          resultEl.innerHTML = scannerResult("valid", "✓", "Valid ticket",
            "Seat " + escapeHtml(booking.seat_number || "—") + " · " +
            escapeHtml(booking.trips ? booking.trips.routes.origin + " → " + booking.trips.routes.destination : ""));
          input.value = "";
        } catch (err) {
          Toast.error("Validation failed", err.message);
          resultEl.innerHTML = "";
        }
      }

      button.addEventListener("click", validate);
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); validate(); }
      });
    }
  });

  function scannerResult(type, icon, title, message) {
    return '<div class="scanner-result scanner-result--' + type + '">' +
      '<span class="scanner-result__icon" aria-hidden="true">' + icon + '</span>' +
      '<p class="scanner-result__title">' + escapeHtml(title) + '</p>' +
      '<p class="scanner-result__message">' + escapeHtml(message) + '</p></div>';
  }


  /* =======================================================================
     16. OPERATOR VIEWS
     ======================================================================= */

  Router.register("operator-dashboard", {
    title: "Operator dashboard",
    subtitle: "Your fleet at a glance.",
    render: async function (container) {
      const operatorId = AppState.profile ? AppState.profile.operator_id : null;
      container.innerHTML = '<section class="stat-grid" id="operator-stats"></section>';

      try {
        const [vehicles, drivers, trips] = await Promise.all([
          supabase.from("vehicles").select("id").eq("operator_id", operatorId),
          supabase.from("profiles").select("id").eq("operator_id", operatorId).eq("role", "driver"),
          supabase.from("trips").select("id")
        ]);

        document.getElementById("operator-stats").innerHTML =
          statCard("🚌", (vehicles.data || []).length, "Vehicles", "") +
          statCard("👨‍✈️", (drivers.data || []).length, "Drivers", "info") +
          statCard("🧭", (trips.data || []).length, "Trips", "success");
      } catch (err) { renderError(container, err.message); }
    }
  });

  Router.register("operator-fleet", {
    title: "Fleet",
    subtitle: "Vehicles registered under your operator account.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="fleet-list"></div></div>';
      const list = document.getElementById("fleet-list");
      renderLoading(list, "Loading fleet…");

      try {
        const { data, error } = await supabase.from("vehicles").select("*")
          .eq("operator_id", AppState.profile.operator_id)
          .order("registration_number", { ascending: true });
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🚌", title: "No vehicles", message: "No vehicles are registered under your operator." });
          return;
        }

        list.innerHTML = '<div class="list">' + data.map(function (v) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(v.registration_number) + '</p>' +
            '<p class="list__meta">' + escapeHtml(v.vehicle_type || "") + ' · ' + escapeHtml(v.capacity) + ' seats</p></div>' +
            '<span class="badge badge--' + escapeHtml(v.status || "active") + '">' +
              escapeHtml(humanizeStatus(v.status || "active")) + '</span></div>';
        }).join("") + '</div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("operator-drivers", {
    title: "Drivers",
    subtitle: "Drivers registered under your operator.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="op-drivers-list"></div></div>';
      const list = document.getElementById("op-drivers-list");
      renderLoading(list, "Loading drivers…");

      try {
        const { data, error } = await supabase.from("profiles").select("*")
          .eq("operator_id", AppState.profile.operator_id).eq("role", "driver");
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "👨‍✈️", title: "No drivers", message: "No drivers are associated with your operator." });
          return;
        }

        list.innerHTML = '<div class="list">' + data.map(function (d) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(d.full_name || "—") + '</p>' +
            '<p class="list__meta">' + escapeHtml(d.email || "") + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(d.status || "pending") + '">' +
              escapeHtml(humanizeStatus(d.status || "pending")) + '</span></div>';
        }).join("") + '</div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("operator-trips", {
    title: "Trips",
    subtitle: "Trips operated by your fleet.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="op-trips-list"></div></div>';
      const list = document.getElementById("op-trips-list");
      renderLoading(list, "Loading trips…");

      try {
        const { data, error } = await supabase.from("trips")
          .select("*, routes(origin, destination), vehicles(registration_number)")
          .order("planned_departure", { ascending: false }).limit(50);
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🧭", title: "No trips", message: "No trips recorded yet." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(renderDriverTripRow).join("") + '</div>';
      } catch (err) { renderError(list, err.message); }
    }
  });


  /* =======================================================================
     17. ADMIN VIEWS
     ======================================================================= */

  Router.register("admin-dashboard", {
    title: "Admin dashboard",
    subtitle: "Platform overview.",
    render: async function (container) {
      container.innerHTML = '<section class="stat-grid" id="admin-stats"></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Recent audit activity</h3></div>' +
        '<div class="card__body" id="admin-audit"></div></section>';

      try {
        const [profilesRes, driversRes, operatorsRes, vehiclesRes, terminalsRes, routesRes, tripsRes, bookingsRes] = await Promise.all([
          supabase.from("profiles").select("id, role"),
          supabase.from("profiles").select("id, status").eq("role", "driver"),
          supabase.from("operators").select("id"),
          supabase.from("vehicles").select("id"),
          supabase.from("terminals").select("id"),
          supabase.from("routes").select("id"),
          supabase.from("trips").select("id, status"),
          supabase.from("bookings").select("id")
        ]);

        const drivers = driversRes.data || [];
        const approved = drivers.filter(function (d) { return d.status === "approved"; }).length;
        const pending = drivers.filter(function (d) { return d.status !== "approved" && d.status !== "rejected"; }).length;

        document.getElementById("admin-stats").innerHTML =
          statCard("👥", (profilesRes.data || []).length, "Total users", "info") +
          statCard("👨‍✈️", drivers.length, "Drivers", "") +
          statCard("✅", approved, "Approved drivers", "success") +
          statCard("⏳", pending, "Pending approval", "accent") +
          statCard("🏢", (operatorsRes.data || []).length, "Operators", "") +
          statCard("🚌", (vehiclesRes.data || []).length, "Vehicles", "") +
          statCard("📍", (terminalsRes.data || []).length, "Terminals", "") +
          statCard("🗺️", (routesRes.data || []).length, "Routes", "") +
          statCard("🧭", (tripsRes.data || []).length, "Trips", "info") +
          statCard("🎫", (bookingsRes.data || []).length, "Bookings", "success");
      } catch (err) { renderError(container, err.message); return; }

      const auditEl = document.getElementById("admin-audit");
      try {
        const { data: logs } = await supabase.from("audit_logs").select("*")
          .order("created_at", { ascending: false }).limit(10);
        if (!logs || logs.length === 0) {
          renderEmpty(auditEl, { icon: "📝", title: "No activity yet", message: "Admin actions will be logged here." });
        } else {
          auditEl.innerHTML = logs.map(function (log) {
            return '<div class="audit-entry">' +
              '<span class="audit-entry__time">' + escapeHtml(formatDateTime(log.created_at)) + '</span>' +
              '<span class="audit-entry__text">' + escapeHtml(log.action || "action") +
                (log.entity_type ? ' · ' + escapeHtml(log.entity_type) : "") + '</span></div>';
          }).join("");
        }
      } catch (err) { /* silent */ }
    }
  });

  Router.register("admin-users", {
    title: "Users",
    subtitle: "All registered accounts.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="users-list"></div></div>';
      const list = document.getElementById("users-list");
      renderLoading(list, "Loading users…");

      try {
        const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "👥", title: "No users", message: "No accounts registered yet." });
          return;
        }

        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>' +
          data.map(function (u) {
            return '<tr><td>' + escapeHtml(u.full_name || "—") + '</td>' +
              '<td>' + escapeHtml(u.email || "—") + '</td>' +
              '<td><span class="badge">' + escapeHtml(humanizeStatus(u.role || "—")) + '</span></td>' +
              '<td><span class="badge badge--' + escapeHtml(u.status || "active") + '">' +
                escapeHtml(humanizeStatus(u.status || "active")) + '</span></td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("admin-drivers", {
    title: "Driver approval",
    subtitle: "Approve drivers and assign vehicles.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="drivers-list"></div></div>';
      const list = document.getElementById("drivers-list");
      renderLoading(list, "Loading drivers…");

      try {
        const [driversRes, vehiclesRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("role", "driver").order("created_at", { ascending: false }),
          supabase.from("vehicles").select("*").order("registration_number", { ascending: true })
        ]);
        if (driversRes.error) throw driversRes.error;
        if (vehiclesRes.error) throw vehiclesRes.error;

        const drivers = driversRes.data || [];
        const vehicles = vehiclesRes.data || [];

        if (!drivers.length) {
          renderEmpty(list, { icon: "👨‍✈️", title: "No drivers", message: "No driver accounts have been registered." });
          return;
        }

        const vehicleByDriver = {};
        vehicles.forEach(function (v) {
          if (v.assigned_driver_id) vehicleByDriver[v.assigned_driver_id] = v;
        });

        list.innerHTML = '<div class="list">' + drivers.map(function (d) {
          const vehicle = vehicleByDriver[d.id];
          const vehicleLine = vehicle
            ? '<span class="badge badge--in_transit" style="margin-left:6px;">🚌 ' + escapeHtml(vehicle.registration_number) + '</span>'
            : '<span class="badge badge--pending" style="margin-left:6px;">No vehicle</span>';

          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(d.full_name || "—") + ' ' + vehicleLine + '</p>' +
            '<p class="list__meta">' + escapeHtml(d.email || "") + ' · ' +
              escapeHtml(humanizeStatus(d.status || "pending")) +
              (vehicle ? ' · ' + escapeHtml(vehicle.capacity) + ' seats' : "") + '</p></div>' +
            '<div class="list__actions">' +
              '<button type="button" class="button button--small button--secondary" data-assign="' + escapeHtml(d.id) + '">' +
                (vehicle ? 'Change vehicle' : 'Assign vehicle') + '</button>' +
              (d.status !== "approved"
                ? '<button type="button" class="button button--small button--success" data-approve="' + escapeHtml(d.id) + '">Approve</button>'
                : "") +
              (d.status !== "rejected"
                ? '<button type="button" class="button button--small button--danger" data-reject="' + escapeHtml(d.id) + '">Reject</button>'
                : "") +
            '</div></div>';
        }).join("") + '</div>';

        list.querySelectorAll("[data-approve]").forEach(function (btn) {
          btn.addEventListener("click", function () { updateDriverStatus(btn.getAttribute("data-approve"), "approved"); });
        });
        list.querySelectorAll("[data-reject]").forEach(function (btn) {
          btn.addEventListener("click", function () { updateDriverStatus(btn.getAttribute("data-reject"), "rejected"); });
        });
        list.querySelectorAll("[data-assign]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const driverId = btn.getAttribute("data-assign");
            const driver = drivers.find(function (x) { return x.id === driverId; });
            if (driver) openAssignVehicleModal(driver, vehicles, vehicleByDriver);
          });
        });
      } catch (err) { renderError(list, err.message); }
    }
  });

  function openAssignVehicleModal(driver, vehicles, vehicleByDriver) {
    const currentVehicle = vehicleByDriver[driver.id];

    const options = vehicles.map(function (v) {
      const ownerId = v.assigned_driver_id;
      const isMine = ownerId === driver.id;
      const isSomeoneElses = ownerId && ownerId !== driver.id;

      let label = v.registration_number + " · " + v.capacity + " seats" +
        (v.vehicle_type ? " · " + v.vehicle_type : "");

      if (isMine) label += " — currently assigned to this driver";
      else if (isSomeoneElses) label += " — already assigned to another driver";
      else label += " — available";

      return '<option value="' + escapeHtml(v.id) + '"' +
        (isMine ? ' selected' : '') +
        (isSomeoneElses ? ' disabled' : '') +
      '>' + escapeHtml(label) + '</option>';
    }).join("");

    Modal.open({
      title: "Assign vehicle to " + (driver.full_name || "driver"),
      body:
        '<p class="text-muted mb-4">Choose the vehicle this driver will operate. ' +
        'A driver can only have one vehicle at a time.</p>' +
        '<div class="field">' +
          '<label for="assign-vehicle-select">Vehicle</label>' +
          '<select id="assign-vehicle-select">' +
            '<option value="">— No vehicle —</option>' + options +
          '</select>' +
        '</div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save assignment</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }

        const select = document.getElementById("assign-vehicle-select");
        const newVehicleId = select.value;

        Loader.show("Saving assignment…");
        try {
          if (currentVehicle && currentVehicle.id !== newVehicleId) {
            await supabase.from("vehicles")
              .update({ assigned_driver_id: null })
              .eq("id", currentVehicle.id);
          }

          if (newVehicleId) {
            const { error } = await supabase.from("vehicles")
              .update({ assigned_driver_id: driver.id })
              .eq("id", newVehicleId);
            if (error) throw error;
          }

          await Data.logAudit("vehicle_assigned", "vehicle", newVehicleId || null,
            { driver_id: driver.id, driver_name: driver.full_name });

          Modal.close();
          Toast.success("Vehicle assignment saved",
            newVehicleId ? "The driver can now publish trips using this vehicle."
                         : "The driver no longer has a vehicle assigned.");
          Router.go("admin-drivers");
        } catch (err) {
          Toast.error("Unable to assign vehicle", err.message);
        } finally { Loader.hide(); }
      }
    });
  }

  async function updateDriverStatus(driverId, status) {
    Loader.show("Updating…");
    try {
      const { error } = await supabase.from("profiles").update({ status: status }).eq("id", driverId);
      if (error) throw error;

      await Data.logAudit("driver_" + status, "profile", driverId, null);

      await Notifications.create({
        recipient_id: driverId,
        title: "Account " + status,
        message: "Your driver account has been " + status + ".",
        type: "driver_status",
        related_entity: driverId
      });

      Toast.success("Driver " + status);
      Router.go("admin-drivers");
    } catch (err) { Toast.error("Unable to update driver", err.message); }
    finally { Loader.hide(); }
  }

  Router.register("admin-operators", {
    title: "Operators",
    subtitle: "Transport companies on the platform.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-operator">+ Add operator</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="operators-list"></div></div>';
      const list = document.getElementById("operators-list");
      renderLoading(list, "Loading operators…");

      const addBtn = document.getElementById("add-operator");
      if (addBtn) addBtn.addEventListener("click", openAddOperatorModal);

      try {
        const data = await Data.getOperators();
        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🏢", title: "No operators", message: "Add your first transport operator." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (o) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(o.name) + '</p>' +
            '<p class="list__meta">' + escapeHtml(o.contact_name || "") + ' · ' + escapeHtml(o.phone || "") + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(o.status || "active") + '">' +
              escapeHtml(humanizeStatus(o.status || "active")) + '</span></div>';
        }).join("") + '</div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  function openAddOperatorModal() {
    Modal.open({
      title: "Add operator",
      body: '<div class="field"><label for="op-name">Operator name</label><input type="text" id="op-name" /></div>' +
        '<div class="field"><label for="op-contact">Contact name</label><input type="text" id="op-contact" /></div>' +
        '<div class="field"><label for="op-phone">Phone</label><input type="tel" id="op-phone" /></div>' +
        '<div class="field"><label for="op-email">Email</label><input type="email" id="op-email" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
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
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      }
    });
  }


  /* =======================================================================
     18. TERMINAL MANAGEMENT
     ======================================================================= */
  Router.register("admin-terminals", {
    title: "Terminals",
    subtitle: "Boarding points across the network.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-terminal">+ Add terminal</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="terminals-list"></div></div>';
      const list = document.getElementById("terminals-list");
      renderLoading(list, "Loading terminals…");

      const addBtn = document.getElementById("add-terminal");
      if (addBtn) addBtn.addEventListener("click", openAddTerminalModal);

      try {
        const data = await Data.getTerminals();
        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "📍", title: "No terminals", message: "Add your first terminal." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (t) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(t.name) + '</p>' +
            '<p class="list__meta">' + escapeHtml(t.location || "") + ' · ' + escapeHtml(t.contact_info || "") + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(t.status || "active") + '">' +
              escapeHtml(humanizeStatus(t.status || "active")) + '</span></div>';
        }).join("") + '</div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  function openAddTerminalModal() {
    Modal.open({
      title: "Add terminal",
      body: '<div class="field"><label for="term-name">Terminal name</label><input type="text" id="term-name" /></div>' +
        '<div class="field"><label for="term-location">Location</label><input type="text" id="term-location" /></div>' +
        '<div class="field"><label for="term-desc">Description</label><textarea id="term-desc"></textarea></div>' +
        '<div class="field"><label for="term-contact">Contact information</label><input type="text" id="term-contact" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
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
          AppState.cache.terminals = null;
          Modal.close();
          Toast.success("Terminal added");
          Router.go("admin-terminals");
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      }
    });
  }


  /* =======================================================================
     19. ROUTE MANAGEMENT
     ======================================================================= */
  Router.register("admin-routes", {
    title: "Routes",
    subtitle: "Origins, destinations and fares.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-route">+ Add route</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="routes-list"></div></div>';
      const list = document.getElementById("routes-list");
      renderLoading(list, "Loading routes…");

      const addBtn = document.getElementById("add-route");
      if (addBtn) addBtn.addEventListener("click", openAddRouteModal);

      try {
        const data = await Data.getRoutes();
        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🗺️", title: "No routes", message: "Add your first route." });
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
      } catch (err) { renderError(list, err.message); }
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
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const origin = document.getElementById("route-origin").value.trim();
        const destination = document.getElementById("route-destination").value.trim();
        if (!origin || !destination) { Toast.warning("Origin and destination required"); return; }
        Loader.show("Saving…");
        try {
          const { error } = await supabase.from("routes").insert({
            origin: origin, destination: destination,
            base_fare: Number(document.getElementById("route-fare").value) || null,
            estimated_minutes: Number(document.getElementById("route-minutes").value) || null,
            status: "active"
          });
          if (error) throw error;
          AppState.cache.routes = null;
          Modal.close();
          Toast.success("Route added");
          Router.go("admin-routes");
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      }
    });
  }


  /* =======================================================================
     20. VEHICLE MANAGEMENT
     ======================================================================= */
  Router.register("admin-vehicles", {
    title: "Vehicles",
    subtitle: "All registered vehicles.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-vehicle">+ Add vehicle</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="vehicles-list"></div></div>';
      const list = document.getElementById("vehicles-list");
      renderLoading(list, "Loading vehicles…");

      const addBtn = document.getElementById("add-vehicle");
      if (addBtn) addBtn.addEventListener("click", openAddVehicleModal);

      try {
        const [vehiclesRes, driversRes] = await Promise.all([
          supabase.from("vehicles").select("*").order("registration_number", { ascending: true }),
          supabase.from("profiles").select("id, full_name").eq("role", "driver")
        ]);
        if (vehiclesRes.error) throw vehiclesRes.error;
        if (driversRes.error) throw driversRes.error;

        const data = vehiclesRes.data || [];
        const driversById = {};
        (driversRes.data || []).forEach(function (d) { driversById[d.id] = d.full_name; });

        if (!data.length) {
          renderEmpty(list, { icon: "🚌", title: "No vehicles", message: "Add your first vehicle." });
          return;
        }

        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Registration</th><th>Type</th><th>Capacity</th><th>Assigned to</th><th>Status</th></tr></thead><tbody>' +
          data.map(function (v) {
            const driverName = v.assigned_driver_id
              ? (driversById[v.assigned_driver_id] || "Unknown driver")
              : '<span class="text-muted">Unassigned</span>';
            return '<tr><td>' + escapeHtml(v.registration_number) + '</td>' +
              '<td>' + escapeHtml(v.vehicle_type || "—") + '</td>' +
              '<td>' + escapeHtml(v.capacity || "—") + '</td>' +
              '<td>' + driverName + '</td>' +
              '<td><span class="badge badge--' + escapeHtml(v.status || "active") + '">' +
                escapeHtml(humanizeStatus(v.status || "active")) + '</span></td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  function openAddVehicleModal() {
    Modal.open({
      title: "Add vehicle",
      body: '<div class="field"><label for="veh-reg">Registration number</label><input type="text" id="veh-reg" /></div>' +
        '<div class="field"><label for="veh-type">Vehicle type</label><input type="text" id="veh-type" placeholder="e.g. Bus, Danfo" /></div>' +
        '<div class="field"><label for="veh-capacity">Capacity</label><input type="number" id="veh-capacity" min="1" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const reg = document.getElementById("veh-reg").value.trim();
        const capacity = Number(document.getElementById("veh-capacity").value);
        if (!reg || !capacity) { Toast.warning("Registration and capacity required"); return; }
        Loader.show("Saving…");
        try {
          const { error } = await supabase.from("vehicles").insert({
            registration_number: reg,
            vehicle_type: document.getElementById("veh-type").value.trim() || null,
            capacity: capacity,
            status: "active",
            verification_status: "verified"
          });
          if (error) throw error;
          Modal.close();
          Toast.success("Vehicle added");
          Router.go("admin-vehicles");
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      }
    });
  }


  /* =======================================================================
     21. TRIP MANAGEMENT (ADMIN)
     ======================================================================= */
  Router.register("admin-trips", {
    title: "Trips",
    subtitle: "All trips on the platform.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="admin-trips-list"></div></div>';
      const list = document.getElementById("admin-trips-list");
      renderLoading(list, "Loading trips…");

      try {
        const { data, error } = await supabase.from("trips")
          .select("*, routes(origin, destination), vehicles(registration_number)")
          .order("planned_departure", { ascending: false }).limit(100);
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🧭", title: "No trips", message: "No trips recorded yet." });
          return;
        }

        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Code</th><th>Route</th><th>Vehicle</th><th>Departure</th><th>Status</th></tr></thead><tbody>' +
          data.map(function (t) {
            const route = t.routes || {};
            const vehicle = t.vehicles || {};
            return '<tr><td>' + escapeHtml(t.trip_code || "—") + '</td>' +
              '<td>' + escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</td>' +
              '<td>' + escapeHtml(vehicle.registration_number || "—") + '</td>' +
              '<td>' + escapeHtml(formatDateTime(t.planned_departure)) + '</td>' +
              '<td><span class="badge badge--' + escapeHtml(t.status || "scheduled") + '">' +
                escapeHtml(humanizeStatus(t.status)) + '</span></td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("admin-tickets", {
    title: "Tickets",
    subtitle: "All issued tickets.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="admin-tickets-list"></div></div>';
      const list = document.getElementById("admin-tickets-list");
      renderLoading(list, "Loading tickets…");

      try {
        const { data, error } = await supabase.from("tickets")
          .select("*, bookings(seat_number, passenger_id, trips(trip_code, routes(origin, destination)))")
          .order("issued_at", { ascending: false }).limit(100);
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🎫", title: "No tickets", message: "No tickets have been issued yet." });
          return;
        }

        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Ticket</th><th>Trip</th><th>Seat</th><th>Status</th><th>Issued</th></tr></thead><tbody>' +
          data.map(function (t) {
            const booking = t.bookings || {};
            const trip = booking.trips || {};
            const route = trip.routes || {};
            return '<tr><td class="text-mono">' + escapeHtml(t.ticket_code) + '</td>' +
              '<td>' + escapeHtml(trip.trip_code || "—") + '<br /><span class="text-tiny text-muted">' +
                escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</span></td>' +
              '<td>' + escapeHtml(booking.seat_number || "—") + '</td>' +
              '<td><span class="badge badge--' + escapeHtml(t.status || "valid") + '">' +
                escapeHtml(humanizeStatus(t.status || "valid")) + '</span></td>' +
              '<td>' + escapeHtml(formatDateTime(t.issued_at)) + '</td></tr>';
          }).join("") + '</tbody></table></div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("admin-feedback", {
    title: "Feedback",
    subtitle: "Passenger ratings and comments.",
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="feedback-list"></div></div>';
      const list = document.getElementById("feedback-list");
      renderLoading(list, "Loading feedback…");

      try {
        const { data, error } = await supabase.from("feedback")
          .select("*, trips(trip_code)").order("created_at", { ascending: false }).limit(50);
        if (error) throw error;

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "⭐", title: "No feedback yet", message: "Passenger feedback will appear here." });
          return;
        }

        list.innerHTML = '<div class="list">' + data.map(function (f) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(f.overall_rating || "—") + '/5 · ' +
              escapeHtml(f.trips ? f.trips.trip_code : "—") + '</p>' +
            '<p class="list__meta">' + escapeHtml(f.comment || "No comment") + '</p></div>' +
            '<span class="text-tiny text-muted">' + escapeHtml(formatRelativeTime(f.created_at)) + '</span></div>';
        }).join("") + '</div>';
      } catch (err) { renderError(list, err.message); }
    }
  });

  Router.register("admin-reports", {
    title: "Reports",
    subtitle: "Operational analytics from real data.",
    render: async function (container) {
      container.innerHTML = '<section class="card"><div class="card__header"><h3 class="card__title">Trips by status</h3></div>' +
        '<div class="card__body" id="trips-by-status"></div></section>';

      try {
        const { data: trips } = await supabase.from("trips").select("status");
        const counts = {};
        (trips || []).forEach(function (t) { counts[t.status] = (counts[t.status] || 0) + 1; });
        const el = document.getElementById("trips-by-status");
        if (!el) return;
        if (Object.keys(counts).length === 0) {
          renderEmpty(el, { icon: "📈", title: "No data", message: "Analytics will appear once trips are recorded." });
        } else {
          el.innerHTML = '<div class="stat-grid">' + Object.keys(counts).map(function (k) {
            return statCard("📊", counts[k], humanizeStatus(k), "");
          }).join("") + '</div>';
        }
      } catch (err) { /* silent */ }
    }
  });

  Router.register("admin-settings", {
    title: "Settings",
    subtitle: "Platform configuration.",
    render: async function (container) {
      container.innerHTML = '<section class="card"><div class="card__body">' +
        '<p class="text-muted">Platform settings will be managed through the <code>settings</code> table. ' +
        'This view is reserved for future configuration options.</p></div></section>';
    }
  });


  /* =======================================================================
     22. GPS TRACKING
     ======================================================================= */
  function startGpsWatch(trip) {
    if (!navigator.geolocation) {
      Toast.warning("GPS unavailable", "This device does not support geolocation.");
      return;
    }
    if (AppState.gpsWatchId !== null) return;

    let lastUpdate = 0;

    AppState.gpsWatchId = navigator.geolocation.watchPosition(
      async function (position) {
        const now = Date.now();
        if (now - lastUpdate < TRANSITCARE_CONFIG.GPS_UPDATE_INTERVAL_MS) return;
        lastUpdate = now;

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const gpsStatus = document.getElementById("gps-status");
        const gpsMessage = document.getElementById("gps-message");

        if (gpsStatus) { gpsStatus.className = "badge badge--in_transit"; gpsStatus.textContent = "Live"; }
        if (gpsMessage) gpsMessage.textContent = "Lat " + lat.toFixed(5) + ", Lng " + lng.toFixed(5);

        try {
          await supabase.from("trip_locations").insert({
            trip_id: trip.id, latitude: lat, longitude: lng, recorded_at: nowIso()
          });
        } catch (err) { console.warn("[TransitCare] GPS insert failed:", err); }
      },
      function (error) {
        const gpsStatus = document.getElementById("gps-status");
        const gpsMessage = document.getElementById("gps-message");
        if (gpsStatus) { gpsStatus.className = "badge badge--rejected"; gpsStatus.textContent = "Unavailable"; }
        if (gpsMessage) {
          gpsMessage.textContent = error.code === error.PERMISSION_DENIED
            ? "GPS permission was denied. Please enable location access."
            : "GPS signal may be unavailable.";
        }
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
     23. NOTIFICATIONS
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
      if (!supabase) return null;
      try {
        const { error } = await supabase.from("notifications").insert({
          recipient_id: payload.recipient_id,
          title: payload.title,
          message: payload.message,
          type: payload.type || "general",
          related_entity: payload.related_entity || null,
          is_read: false
        });
        if (error) throw error;
      } catch (err) { console.warn("[TransitCare] Notification insert failed:", err); }
    }
  };

  async function refreshNotificationBadge() {
    try {
      const notifications = await Notifications.fetch();
      const unread = notifications.filter(function (n) { return !n.is_read; }).length;
      const badge = document.getElementById("notification-badge");
      if (badge) {
        badge.textContent = unread;
        badge.classList.toggle("is-hidden", unread === 0);
      }
      renderNavigation();
    } catch (err) { /* silent */ }
  }

  function subscribeToNotifications() {
    if (!supabase || !AppState.authUser) return;
    stopRealtimeChannel("notifications");

    AppState.channels.notifications = supabase
      .channel("notifications-" + AppState.authUser.id)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "notifications", filter: "recipient_id=eq." + AppState.authUser.id
      }, function (payload) {
        const notification = payload.new;
        if (!notification) return;
        AppState.notifications.unshift(notification);
        refreshNotificationBadge();
        Toast.info(notification.title || "New notification", notification.message || "");
      })
      .subscribe();
  }

  function stopRealtimeChannel(name) {
    const channel = AppState.channels[name];
    if (channel && supabase) {
      try { supabase.removeChannel(channel); } catch (err) { /* silent */ }
      AppState.channels[name] = null;
    }
  }

  function stopAllRealtime() {
    Object.keys(AppState.channels).forEach(function (key) { stopRealtimeChannel(key); });
  }


  /* =======================================================================
     UI HELPERS
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
    const profile = AppState.profile || {};
    const name = profile.full_name || "User";
    setText("header-user-name", name);
    setText("header-user-role", humanizeStatus(AppState.role || ""));
    const avatar = document.getElementById("header-avatar");
    if (avatar) avatar.textContent = getInitials(name);
  }

  function openSidebar() {
    document.getElementById("app-shell").classList.add("sidebar-open");
    const toggle = document.getElementById("sidebar-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    document.getElementById("app-shell").classList.remove("sidebar-open");
    const toggle = document.getElementById("sidebar-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    const shell = document.getElementById("app-shell");
    if (shell.classList.contains("sidebar-open")) closeSidebar();
    else openSidebar();
  }


  /* =======================================================================
     VERIFICATION NOTICE HELPER
     ======================================================================= */
  function showVerificationNotice(email, role) {
    const message = document.getElementById("auth-message");
    if (!message) return;

    const roleLabel = role === "driver" ? "Driver" : role === "operator" ? "Operator" : "Passenger";

    message.className = "alert alert--success";
    message.innerHTML =
      "<strong>Almost there — check your email.</strong>" +
      "<span>We sent a verification link to <code>" + escapeHtml(email) + "</code>. " +
      "Click the link to activate your " + escapeHtml(roleLabel.toLowerCase()) + " account.</span>" +
      '<div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" class="button button--ghost button--small" id="resend-verification">Resend verification email</button>' +
        '<button type="button" class="button button--ghost button--small" id="go-to-signin">Back to sign in</button>' +
      '</div>';

    const resend = document.getElementById("resend-verification");
    if (resend) {
      resend.addEventListener("click", async function () {
        resend.disabled = true;
        resend.innerHTML = '<span class="button__spinner"></span> Sending…';
        try {
          await Auth.resendVerification(email);
          Toast.success("Verification email resent", "Check your inbox in a moment.");
        } catch (err) { Toast.error("Unable to resend", err.message || "Please try again later."); }
        finally { resend.disabled = false; resend.textContent = "Resend verification email"; }
      });
    }

    const back = document.getElementById("go-to-signin");
    if (back) {
      back.addEventListener("click", function () {
        const signinTab = document.querySelector('[data-auth-mode="signin"]');
        if (signinTab) signinTab.click();
      });
    }
  }


  /* =======================================================================
     FORM BINDINGS
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
        const tab = document.getElementById("tab-signin");
        if (tab) tab.classList.add("is-active");
      } else if (mode === "signup" && signupForm) {
        signupForm.classList.remove("is-hidden");
        const tab = document.getElementById("tab-signup");
        if (tab) tab.classList.add("is-active");
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
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        btn.textContent = isPassword ? "Hide" : "Show";
        btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
      });
    });

    bindPasswordMeter("signup-password", "password-meter-bar", "password-hint");

    document.querySelectorAll('input[name="signup-role"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        const notice = document.getElementById("driver-notice");
        if (!notice) return;
        notice.classList.toggle("is-hidden", radio.value !== "driver" || !radio.checked);
      });
    });

    /* ----- Sign in ----- */
    if (signinForm) {
      signinForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormErrors(signinForm);
        setFormMessage("auth-message", null, "");

        const email = document.getElementById("signin-email").value.trim();
        const password = document.getElementById("signin-password").value;

        let valid = true;
        if (!Validators.email(email)) { setFieldError("signin-email", "Enter a valid email address."); valid = false; }
        if (!Validators.required(password)) { setFieldError("signin-password", "Enter your password."); valid = false; }
        if (!valid) return;

        const submit = document.getElementById("signin-submit");
        submit.disabled = true;
        submit.innerHTML = '<span class="button__spinner"></span> Signing in…';

        try {
          await Auth.signIn(email, password);
          /* The onAuthStateChange listener will route us into the app */
        } catch (err) {
          const msg = (err && err.message) ? err.message : "";
          if (/email not confirmed|email not verified|confirm/i.test(msg)) {
            const container = document.getElementById("auth-message");
            container.className = "alert alert--warning";
            container.innerHTML =
              "<strong>Your email is not yet verified.</strong>" +
              "<span>Please check your inbox for the verification link we sent to <code>" +
                escapeHtml(email) + "</code>.</span>";

            const resendBtn = document.createElement("button");
            resendBtn.type = "button";
            resendBtn.className = "button button--ghost button--small mt-3";
            resendBtn.textContent = "Resend verification email";
            resendBtn.addEventListener("click", async function () {
              resendBtn.disabled = true;
              resendBtn.textContent = "Sending…";
              try {
                await Auth.resendVerification(email);
                Toast.success("Verification email resent");
              } catch (e2) { Toast.error("Unable to resend", e2.message); }
              finally { resendBtn.disabled = false; resendBtn.textContent = "Resend verification email"; }
            });
            container.appendChild(resendBtn);
          } else {
            setFormMessage("auth-message", "danger", msg || "Unable to sign in.");
          }
        } finally {
          submit.disabled = false;
          submit.textContent = "Sign in";
        }
      });
    }

    /* ----- Sign up ----- */
    if (signupForm) {
      signupForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormErrors(signupForm);
        setFormMessage("auth-message", null, "");

        const fullName = document.getElementById("signup-fullname").value.trim();
        const email = document.getElementById("signup-email").value.trim();
        const phone = document.getElementById("signup-phone").value.trim();
        const password = document.getElementById("signup-password").value;
        const confirm = document.getElementById("signup-confirm").value;
        const terms = document.getElementById("signup-terms").checked;
        const role = document.querySelector('input[name="signup-role"]:checked').value;

        let valid = true;
        if (!Validators.required(fullName)) { setFieldError("signup-fullname", "Enter your full name."); valid = false; }
        if (!Validators.email(email)) { setFieldError("signup-email", "Enter a valid email address."); valid = false; }
        if (phone && !Validators.phone(phone)) { setFieldError("signup-phone", "Enter a valid phone number."); valid = false; }
        if (Validators.passwordStrength(password) < 3) {
          setFieldError("signup-password", "Password is too weak. Use 8+ characters with letters and numbers.");
          valid = false;
        }
        if (password !== confirm) { setFieldError("signup-confirm", "Passwords do not match."); valid = false; }
        if (!terms) { setFieldError("signup-terms", "Please accept the terms to continue."); valid = false; }
        if (!valid) return;

        const submit = document.getElementById("signup-submit");
        submit.disabled = true;
        submit.innerHTML = '<span class="button__spinner"></span> Creating account…';

        try {
          const result = await Auth.signUp({
            fullName: fullName, email: email, phone: phone, password: password, role: role
          });
          signupForm.reset();

          if (result.needsVerification) {
            showVerificationNotice(email, role);
          } else {
            setFormMessage("auth-message", "success", "Account created. You are now signed in.");
          }
        } catch (err) {
          setFormMessage("auth-message", "danger", err.message || "Unable to create account.");
        } finally {
          submit.disabled = false;
          submit.textContent = "Create account";
        }
      });
    }

    /* ----- Forgot password ----- */
    const forgotButton = document.getElementById("forgot-password-button");
    if (forgotButton) forgotButton.addEventListener("click", function () { showAuthForm("forgot"); });

    const forgotBack = document.getElementById("forgot-back-button");
    if (forgotBack) forgotBack.addEventListener("click", function () { showAuthForm("signin"); });

    if (forgotForm) {
      forgotForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormErrors(forgotForm);
        setFormMessage("auth-message", null, "");

        const email = document.getElementById("forgot-email").value.trim();
        if (!Validators.email(email)) { setFieldError("forgot-email", "Enter a valid email address."); return; }

        const submit = document.getElementById("forgot-submit");
        submit.disabled = true;
        submit.innerHTML = '<span class="button__spinner"></span> Sending…';

        try {
          await Auth.sendPasswordReset(email);
          setFormMessage("auth-message", "success", "Reset link sent. Check your email.");
          forgotForm.reset();
        } catch (err) {
          setFormMessage("auth-message", "danger", err.message || "Unable to send reset link.");
        } finally {
          submit.disabled = false;
          submit.textContent = "Send reset link";
        }
      });
    }

    /* ----- Reset password ----- */
    if (resetForm) {
      resetForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFormErrors(resetForm);
        setFormMessage("auth-message", null, "");

        const password = document.getElementById("reset-password").value;
        const confirm = document.getElementById("reset-confirm").value;

        let valid = true;
        if (Validators.passwordStrength(password) < 3) { setFieldError("reset-password", "Password is too weak."); valid = false; }
        if (password !== confirm) { setFieldError("reset-confirm", "Passwords do not match."); valid = false; }
        if (!valid) return;

        const submit = document.getElementById("reset-submit");
        submit.disabled = true;
        submit.innerHTML = '<span class="button__spinner"></span> Updating…';

        try {
          await Auth.updatePassword(password);
          setFormMessage("auth-message", "success", "Password updated. You can now sign in.");
          setTimeout(function () { showAuthForm("signin"); }, 1200);
        } catch (err) {
          setFormMessage("auth-message", "danger", err.message || "Unable to update password.");
        } finally {
          submit.disabled = false;
          submit.textContent = "Update password";
        }
      });
    }
  }


  /* =======================================================================
     24. BOOTSTRAP
     -----------------------------------------------------------------------
     ROBUST SESSION RESTORE

     The problem: Supabase fires INITIAL_SESSION with `null` on page load
     BEFORE it has finished reading localStorage. If we react to that first
     null, we log the user out on every refresh.

     The fix: ignore the auth events during page load. Wait for the session
     directly from getSession(), with retries. Only show the login screen
     if getSession() also returns nothing after several attempts.
     ======================================================================= */
  async function handleSignedIn(session) {
    if (!session || !session.user) return;

    if (AppState.authUser && AppState.authUser.id === session.user.id && AppState.profile) {
      return;
    }

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
      } catch (err) { console.warn("[TransitCare] Auto profile insert failed:", err); }
      profile = await Profile.fetch(session.user.id);
    }

    AppState.profile = profile;
    AppState.role = Profile.resolveRole(profile, session.user);

    showAppShell();
    updateHeaderUser();
    renderNavigation();

    await refreshNotificationBadge();
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
      shell.addEventListener("click", function (event) {
        if (!shell.classList.contains("sidebar-open")) return;
        if (event.target === shell) closeSidebar();
      });
    }

    const trigger = document.getElementById("user-menu-trigger");
    const dropdown = document.getElementById("user-menu-dropdown");
    if (trigger && dropdown) {
      trigger.addEventListener("click", function (event) {
        event.stopPropagation();
        const isOpen = !dropdown.classList.contains("is-hidden");
        dropdown.classList.toggle("is-hidden", isOpen);
        trigger.setAttribute("aria-expanded", String(!isOpen));
      });
      document.addEventListener("click", function () {
        dropdown.classList.add("is-hidden");
        trigger.setAttribute("aria-expanded", "false");
      });
    }

    const signoutButton = document.getElementById("signout-button");
    if (signoutButton) signoutButton.addEventListener("click", function () { Auth.signOut(); });

    const notifButton = document.getElementById("header-notifications-button");
    if (notifButton) notifButton.addEventListener("click", function () { Router.go("notifications"); });

    setText("app-version", "v" + TRANSITCARE_CONFIG.APP_VERSION);
  }

  async function bootstrap() {
    initSupabase();

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
      const resetForm = document.getElementById("reset-form");
      if (resetForm) resetForm.classList.remove("is-hidden");
      return;
    }

    /* ---------------------------------------------------------------------
       Step 1 — Register the auth listener for LIVE events only.
       We deliberately do NOT react to INITIAL_SESSION here because it can
       fire with `null` before localStorage has been read.
       --------------------------------------------------------------------- */
    supabase.auth.onAuthStateChange(async function (event, session) {
      console.log("[TransitCare] Auth event:", event, session ? "(session)" : "(no session)");

      if (event === "PASSWORD_RECOVERY") {
        showAuthScreen();
        document.querySelectorAll(".auth-form").forEach(function (f) { f.classList.add("is-hidden"); });
        const resetForm = document.getElementById("reset-form");
        if (resetForm) resetForm.classList.remove("is-hidden");
        return;
      }

      if (event === "SIGNED_OUT") {
        resetState();
        showAuthScreen();
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        if (session && session.user) {
          if (!AppState.authUser || AppState.authUser.id !== session.user.id) {
            try {
              await handleSignedIn(session);
            } catch (err) {
              console.error("[TransitCare] handleSignedIn failed:", err);
            }
          }
        }
        return;
      }
    });

    /* ---------------------------------------------------------------------
       Step 2 — Wait for the session to be restorable.
       We retry getSession() up to 5 times with 250ms gaps. On any device,
       Supabase finishes reading localStorage well within that window.
       --------------------------------------------------------------------- */
    let session = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        session = await Auth.getSession();
        if (session && session.user) break;
      } catch (err) {
        console.warn("[TransitCare] getSession attempt " + (attempt + 1) + " failed:", err);
      }
      if (attempt < 4) {
        await new Promise(function (resolve) { setTimeout(resolve, 250); });
      }
    }

    /* ---------------------------------------------------------------------
       Step 3 — Take action based on the final result.
       --------------------------------------------------------------------- */
    if (session && session.user) {
      try {
        await handleSignedIn(session);
      } catch (err) {
        console.error("[TransitCare] handleSignedIn failed:", err);
        showAuthScreen();
      }
    } else {
      showAuthScreen();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

})();
