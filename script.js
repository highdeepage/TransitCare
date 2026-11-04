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
    WAITLIST_OFFER_MINUTES: 5,
    RESCHEDULE_CUTOFF_MINUTES: 15,
    SIGNIN_TIMEOUT_MS: 12000,

    // Authentication options
    EMAIL_OTP_LENGTH: 6,
    EMAIL_OTP_EXPIRY_SECONDS: 600,   // must match Supabase → Authentication → Emails → OTP expiry
    OTP_RESEND_SECONDS: 60,
    GOOGLE_AUTH_ENABLED: true,       // also switch Google on in Supabase → Authentication → Providers
    WHATSAPP_OTP_ENABLED: false,     // "Coming soon". Set true only after WhatsApp delivery is set up.

    DEFAULT_MAP_CENTER: { lat: 6.5244, lng: 3.3792 },
    DEFAULT_MAP_ZOOM: 12
  };

  const IS_SUPABASE_CONFIGURED =
    Boolean(TRANSITCARE_CONFIG.SUPABASE_URL) &&
    Boolean(TRANSITCARE_CONFIG.SUPABASE_ANON_KEY);


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
    // Bundled in the /vendor folder so tickets and scanning never depend on a CDN.
    QRCODE: "vendor/qrcode-generator.js?v=8",
    JSQR: "vendor/jsQR.min.js?v=8",
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
            storage: window.localStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
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
    channels: { notifications: null, tripLocations: null, tripStatus: null },
    gpsWatchId: null,
    activeTrip: null,
    isSigningIn: false,
    cache: { terminals: null, operators: null, routes: null, news: null },
    newsMessage: null
  };

    function resetState() {
    AppState.authUser = null;
    AppState.profile = null;
    AppState.role = null;
    AppState.currentView = "home";
    AppState.notifications = [];
    AppState.activeTrip = null;
    AppState.isSigningIn = false;
    AppState.cache = { terminals: null, operators: null, routes: null, news: null };
    AppState.newsMessage = null;
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
    // 6 characters from the clock + randomness; the database also enforces uniqueness.
    return "TC-" + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4)).toUpperCase();
  }

  function generateTicketCode() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "TKT-" + stamp + "-" + rand;
  }

  function nowIso() { return new Date().toISOString(); }

  // Returns an E.164 number (e.g. +2348030000000) or null if invalid.
  function normalizePhone(raw) {
    let v = String(raw || "").trim().replace(/[\s\-().]/g, "");
    if (v.indexOf("00") === 0) v = "+" + v.slice(2);
    if (v.charAt(0) === "+") return /^\+\d{8,15}$/.test(v) ? v : null;
    if (/^0\d{10}$/.test(v)) return "+234" + v.slice(1);
    if (/^234\d{10}$/.test(v)) return "+" + v;
    return null;
  }

  function clearSupabaseStorage() {
    try {
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf("sb-") === 0 || key.indexOf("supabase") === 0) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) { /* ignore */ }
  }


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
     07. MODAL SYSTEM (generic app modal + terms modal)
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

      if (titleEl) titleEl.textContent = options.title || "Dialog";
      if (bodyEl) bodyEl.innerHTML = options.body || "";
      if (footerEl) footerEl.innerHTML = options.footer || "";

      backdrop.classList.remove("is-hidden");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";

      if (footerEl) {
        footerEl.querySelectorAll("[data-modal-action]").forEach(function (button) {
          button.addEventListener("click", function () {
            if (typeof options.onAction === "function") {
              options.onAction(button.getAttribute("data-modal-action"), button);
            }
          });
        });
      }

      const focusTarget = bodyEl ? bodyEl.querySelector(
        "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])"
      ) : null;
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
      if (bodyEl) bodyEl.innerHTML = "";
      if (footerEl) footerEl.innerHTML = "";
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
            // Resolve first: close() triggers onClose, which resolves false.
            resolve(action === "confirm");
            close();
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

  /* ---- Terms modal (standalone in index.html) ---- */
  const TermsModal = (function () {
    const backdrop = document.getElementById("terms-backdrop");
    const closeBtn = document.getElementById("terms-close");
    const cancelBtn = document.getElementById("terms-cancel");
    const agreeBtn = document.getElementById("terms-agree");
    const openLink = document.getElementById("open-terms-button"); // ✅ correct id
    const termsCheckbox = document.getElementById("signup-terms");
    const phoneTermsCheckbox = document.getElementById("phone-terms");

    function open() {
      if (!backdrop) return;
      backdrop.classList.remove("is-hidden");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function close() {
      if (!backdrop) return;
      backdrop.classList.add("is-hidden");
      backdrop.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function agree() {
      [termsCheckbox, phoneTermsCheckbox].forEach(function (box) {
        if (!box) return;
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      });
      close();
    }

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (cancelBtn) cancelBtn.addEventListener("click", close);
    if (agreeBtn) agreeBtn.addEventListener("click", agree);
    if (openLink) openLink.addEventListener("click", function (e) { e.preventDefault(); open(); });
    document.querySelectorAll("[data-open-terms]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); open(); });
    });

    if (backdrop) {
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) close();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && backdrop && !backdrop.classList.contains("is-hidden")) close();
    });

    return { open: open, close: close };
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

      // An already-registered email comes back as a "user" with no identities and NO email is
      // sent. Without this check the person would wait on the code screen for a code that never comes.
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        const dup = new Error("An account with this email already exists. Please sign in, or use “Forgot password” if you cannot remember it.");
        dup.code = "EMAIL_EXISTS";
        throw dup;
      }

      const needsVerification = data.session === null;

      if (!needsVerification && data.user && data.user.id) {
        try {
          // upsert + ignoreDuplicates: never a second profile for the same auth user
          await supabase.from("profiles").upsert({
            id: data.user.id,
            full_name: payload.fullName,
            email: payload.email,
            phone: payload.phone || null,
            role: payload.role || "passenger",
            status: payload.role === "driver" ? "email_verified" : "active"
          }, { onConflict: "id", ignoreDuplicates: true });
        } catch (err) { console.warn("[TransitCare] Profile insert skipped:", err); }
      }

      return { needsVerification: needsVerification, user: data.user, session: data.session };
    },

    async signIn(email, password) {
      if (!supabase) throw new Error("Supabase is not configured.");

      const signInPromise = supabase.auth.signInWithPassword({ email, password })
        .then(function (result) {
          if (result.error) throw result.error;
          return result.data;
        });

      const timeoutPromise = new Promise(function (_, reject) {
        setTimeout(function () {
          const err = new Error("Sign-in is taking too long.");
          err.code = "SIGNIN_TIMEOUT";
          reject(err);
        }, TRANSITCARE_CONFIG.SIGNIN_TIMEOUT_MS);
      });

      return Promise.race([signInPromise, timeoutPromise]);
    },

    // ---- Phone / WhatsApp OTP (passengers) ----
    // options: { createUser: boolean, fullName: string }
    async sendPhoneOtp(phone, opts) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const o = opts || {};
      const options = { channel: "whatsapp", shouldCreateUser: !!o.createUser };
      if (o.createUser) {
        // Phone sign-up is for passengers only; role is fixed here.
        options.data = { full_name: o.fullName || "", phone: phone, role: "passenger" };
      }
      const { error } = await supabase.auth.signInWithOtp({ phone: phone, options: options });
      if (error) throw error;
    },

    async verifyPhoneOtp(phone, token) {
      if (!supabase) throw new Error("Supabase is not configured.");
      // WhatsApp codes are verified with type "sms" in supabase-js.
      const { data, error } = await supabase.auth.verifyOtp({ phone: phone, token: token, type: "sms" });
      if (error) throw error;
      return data;
    },

    // 6-digit code sent by email after sign-up (Supabase "Confirm signup" template uses {{ .Token }})
    async verifyEmailOtp(email, token) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.auth.verifyOtp({ email: email, token: token, type: "signup" });
      if (error) throw error;
      return data;
    },

    async signInWithGoogle() {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" }
        }
      });
      if (error) throw error;
      if (!data || !data.url) throw new Error("Google sign-in could not be started.");

      // Check the provider is switched on first, so people never land on a raw error page.
      try {
        const probe = await fetch(data.url, { redirect: "manual" });
        if (probe.type !== "opaqueredirect" && probe.status >= 400) {
          const e = new Error("Google sign-in is not enabled."); e.code = "GOOGLE_DISABLED"; throw e;
        }
      } catch (e) { if (e && e.code === "GOOGLE_DISABLED") throw e; /* offline/CORS: just try */ }
      window.location.assign(data.url);
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
        try {
          await Promise.race([
            supabase.auth.signOut(),
            new Promise(function (resolve) { setTimeout(resolve, 2500); })
          ]);
        } catch (err) {
          console.warn("[TransitCare] Sign-out error (ignored):", err);
        }
      }

      clearSupabaseStorage();
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
      { key: "operator-reports",   label: "Reports",      icon: "📈" },
      { group: "Account" },
      { key: "operator-company",   label: "Company",      icon: "🏢" },
      { key: "notifications",      label: "Notifications", icon: "🔔", badgeKey: "unreadNotifications" },
      { key: "profile",            label: "Profile",       icon: "👤" }
    ],
    admin: [
      { group: "Overview" },
      { key: "admin-dashboard", label: "Dashboard",       icon: "📊" },
      { key: "admin-users",     label: "Users",           icon: "👥" },
      { key: "admin-admins",    label: "Administrators",  icon: "🛡️" },
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
      { key: "admin-news",      label: "News updates",    icon: "📰" },
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
    operator: ["operator-dashboard", "operator-fleet", "operator-drivers", "operator-trips", "operator-reports"],
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
            '" data-nav-view="' + escapeHtml(item.key) + '">' +
            '<span class="app-nav__icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>' +
            '<span class="app-nav__label">' + escapeHtml(item.label) + '</span>' +
            (badgeCount > 0 ? '<span class="app-nav__count">' + badgeCount + '</span>' : "") +
          '</button>'
        );
      }).join("");

      sidebar.querySelectorAll("[data-nav-view]").forEach(function (el) {
        el.addEventListener("click", function (event) {
          event.preventDefault();
          const view = el.getAttribute("data-nav-view");
          if (view) Router.go(view);
          closeSidebar();
        });
      });
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
            '" data-bottom-view="' + escapeHtml(item.key) + '">' +
            '<span class="app-bottom-nav__icon" aria-hidden="true">' + escapeHtml(item.icon) +
              (badgeCount > 0 ? '<span class="icon-button__badge">' + badgeCount + '</span>' : "") +
            '</span>' +
            '<span class="app-bottom-nav__label">' + escapeHtml(item.label) + '</span>' +
          '</button>'
        );
      }).join("");

      bottomNav.querySelectorAll("[data-bottom-view]").forEach(function (el) {
        el.addEventListener("click", function (event) {
          event.preventDefault();
          const view = el.getAttribute("data-bottom-view");
          if (view) Router.go(view);
        });
      });
    }
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

      if (AppState.currentView === "track-trip" && key !== "track-trip" && typeof disposeTracking === "function") {
        disposeTracking();
      }
      if (key !== "scan-ticket" && typeof QrScanner !== "undefined") QrScanner.stop();
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

    /* route_id -> [terminal_id,...]. Returns null when the table is not installed yet (SQL 005 not run). */
    async getRouteTerminals() {
      if (!supabase) return null;
      const { data, error } = await supabase.from("route_terminals").select("route_id, terminal_id");
      if (error) return null;
      const map = {};
      (data || []).forEach(function (row) { (map[row.route_id] = map[row.route_id] || []).push(row.terminal_id); });
      return map;
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
              '<button type="button" class="button button--primary" data-home-view="search">🔍 Find a bus</button>' +
              '<button type="button" class="button button--secondary" data-home-view="tickets">🎫 My tickets</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="card card--live is-hidden" id="home-active-trip"></section>' +
        '<section class="card is-hidden" id="home-news-card">' +
          '<div class="card__header"><h3 class="card__title">📰 Service updates</h3></div>' +
          '<div class="card__body" id="home-news"></div>' +
        '</section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Upcoming trips</h3></div>' +
        '<div class="card__body" id="home-upcoming"></div></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Recent notifications</h3></div>' +
        '<div class="card__body card__body--flush" id="home-notifications"></div></section>';

      container.querySelectorAll("[data-home-view]").forEach(function (el) {
        el.addEventListener("click", function () {
          Router.go(el.getAttribute("data-home-view"));
        });
      });

      // ---- Active trip banner: bus the passenger booked is on its way ----
      (async function loadActiveTripBanner() {
        const banner = document.getElementById("home-active-trip");
        if (!banner || !supabase) return;
        try {
          const { data, error } = await supabase
            .from("bookings")
            .select("*, trips!inner(*, routes(origin, destination), vehicles(registration_number))")
            .eq("passenger_id", AppState.authUser.id)
            .in("status", ["reserved", "boarded"])
            .in("trips.status", ["boarding", "in_transit"])
            .order("created_at", { ascending: false })
            .limit(1);
          if (error) throw error;
          if (!data || data.length === 0) return;
          const b = data[0];
          const t = b.trips || {};
          const r = t.routes || {};
          const veh = t.vehicles || {};
          const boarding = t.status === "boarding";
          banner.innerHTML =
            '<div class="card__body live-banner">' +
              '<div class="live-banner__pulse" aria-hidden="true"></div>' +
              '<div class="live-banner__text">' +
                '<p class="eyebrow">' + (boarding ? "Your bus is boarding" : "Your bus is on the way") + '</p>' +
                '<p class="live-banner__route">' + escapeHtml(r.origin || "?") + ' → ' + escapeHtml(r.destination || "?") + '</p>' +
                '<p class="live-banner__meta">' + escapeHtml(t.trip_code || "—") + ' · ' + escapeHtml(veh.registration_number || "—") +
                  ' · Seat ' + escapeHtml(b.seat_number || "—") + '</p>' +
              '</div>' +
              '<button type="button" class="button button--primary" data-track-booking="' + escapeHtml(t.id || b.trip_id || "") + '">📍 Track bus</button>' +
            '</div>';
          banner.classList.remove("is-hidden");
        } catch (err) {
          console.warn("[TransitCare] Active trip banner skipped:", err && err.message);
        }
      })();

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

      // ---- Latest service news (hidden unless news exists) ----
      const newsCard = document.getElementById("home-news-card");
      const newsEl = document.getElementById("home-news");
      try {
        const { data: news, error: newsError } = await supabase
          .from("news_updates")
          .select("*")
          .eq("is_active", true)
          .in("audience", ["all", "passenger"])
          .order("created_at", { ascending: false })
          .limit(2);

        if (newsError) throw newsError;

        if (news && news.length > 0 && newsCard && newsEl) {
          newsCard.classList.remove("is-hidden");
          newsEl.innerHTML = news.map(function (n) {
            return '<div class="notification-item">' +
              '<span class="notification-item__icon" aria-hidden="true">📰</span>' +
              '<div class="notification-item__body">' +
                '<p class="notification-item__title">' + escapeHtml(n.title || "") + '</p>' +
                '<p class="notification-item__message">' + escapeHtml(n.message || "") + '</p>' +
                '<p class="notification-item__time">' + escapeHtml(formatRelativeTime(n.created_at)) + '</p>' +
              '</div>' +
            '</div>';
          }).join("");
        }
      } catch (err) {
        // News is optional — if the table doesn't exist or the query fails,
        // just skip it silently. Never block the home screen for this.
        console.warn("[TransitCare] News load skipped:", err && err.message);
      }
    }
  });

  // A booking can be tracked while the passenger still holds the seat
  // and the bus is actually on its way.
  function isBookingTrackable(booking) {
    const trip = (booking && booking.trips) || {};
    return (booking.status === "reserved" || booking.status === "boarded") &&
      (trip.status === "boarding" || trip.status === "in_transit");
  }

  function renderTrackBookingButton(booking, extraClass) {
    if (!isBookingTrackable(booking)) return "";
    return '<button type="button" class="button button--small button--primary ' + (extraClass || "") +
      '" data-track-booking="' + escapeHtml(booking.trip_id || (booking.trips && booking.trips.id) || "") + '">' +
      '📍 Track bus</button>';
  }

  function renderBookingRow(booking) {
    const trip = booking.trips || {};
    const route = trip.routes || {};
    const vehicle = trip.vehicles || {};
    const tripStatus = trip.status ? ' · Bus: ' + humanizeStatus(trip.status) : "";
    return (
      '<div class="list__item"><div class="list__main">' +
        '<p class="list__title">' + escapeHtml(route.origin || "?") + ' → ' + escapeHtml(route.destination || "?") + '</p>' +
        '<p class="list__meta">' + escapeHtml(trip.trip_code || "—") + ' · ' +
          escapeHtml(vehicle.registration_number || "—") + ' · Seat ' + escapeHtml(booking.seat_number || "—") +
          escapeHtml(tripStatus) + '</p>' +
      '</div>' +
      '<div class="list__actions">' +
        renderTrackBookingButton(booking) +
        '<span class="badge badge--' + escapeHtml(booking.status || "reserved") + '">' +
          escapeHtml(humanizeStatus(booking.status)) + '</span>' +
      '</div></div>'
    );
  }

  function renderNotificationRow(notification) {
    const trackId = notification.type === "trip_started" && notification.related_entity
      ? notification.related_entity : "";
    return (
      '<div class="notification-item' + (notification.is_read ? "" : " notification-item--unread") +
        (trackId ? " notification-item--link" : "") + '" data-notification-id="' + escapeHtml(notification.id) + '"' +
        (trackId ? ' data-track-trip-id="' + escapeHtml(trackId) + '" role="button" tabindex="0"' : "") + '>' +
        '<span class="notification-item__icon" aria-hidden="true">🔔</span>' +
        '<div class="notification-item__body">' +
          '<p class="notification-item__title">' + escapeHtml(notification.title || "Notification") + '</p>' +
          '<p class="notification-item__message">' + escapeHtml(notification.message || "") + '</p>' +
          (trackId ? '<p class="notification-item__cta">📍 Tap to track</p>' : "") +
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

      body.querySelectorAll(".seat--available").forEach(function (seatBtn) {
        seatBtn.addEventListener("click", function () {
          body.querySelectorAll(".seat--selected").forEach(function (el) { el.classList.remove("seat--selected"); });
          seatBtn.classList.add("seat--selected");
          const selectedSeat = Number(seatBtn.getAttribute("data-seat"));
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

      let ticketError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await supabase.from("tickets").insert({
          booking_id: booking.id,
          ticket_code: generateTicketCode(),
          status: "valid"
        });
        ticketError = res.error;
        if (!ticketError || ticketError.code !== "23505") break;   // retry only on a duplicate code
      }
      if (ticketError) {
        // Never leave a paid seat without a ticket: release it again.
        try { await supabase.from("bookings").delete().eq("id", booking.id); } catch (e) { /* best effort */ }
        throw ticketError;
      }

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
      if (err && err.code === "23505") {
        Modal.close();
        Toast.error("Seat taken", "That seat was just reserved by someone else. Please choose another.");
      } else {
        Toast.error("Booking failed", err.message || "Please try again.");
      }
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
            '<div id="qr-' + escapeHtml(ticket ? ticket.id : "none-" + booking.id) + '"></div>' +
            '<p class="ticket-card__qr-caption">Show this QR code to the driver when boarding. Tap it to enlarge. If it will not scan, read out the ticket number under it.</p>' +
          '</div>' +
          (isBookingTrackable(booking) ? '<div class="ticket-card__track">' + renderTrackBookingButton(booking, "button--block") + '</div>' : "") +
        '</div>' +
      '</article>'
    );
  }

  // Draws the QR code for a ticket with the ticket number printed UNDER it.
  // The QR library is bundled in /vendor, so this works even when the CDN is unreachable.
  function qrSvgFor(text) {
    if (typeof window.qrcode !== "function") throw new Error("QR library missing");
    const qr = window.qrcode(0, "M");
    qr.addData(String(text));
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  }

  async function renderQrForTicket(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const number = '<p class="ticket-card__qr-number">' + escapeHtml(text) + '</p>';
    try {
      await loadExternalScript(CDN.QRCODE);
      container.innerHTML =
        '<button type="button" class="qr-box" data-qr-enlarge="' + escapeHtml(text) + '" aria-label="Show a larger QR code for ticket ' + escapeHtml(text) + '">' +
          qrSvgFor(text) + '</button>' + number;
    } catch (err) {
      console.warn("[TransitCare] QR could not be drawn:", err && err.message);
      container.innerHTML =
        '<div class="qr-fallback">The QR code could not be drawn on this device.</div>' + number +
        '<p class="ticket-card__qr-caption">Give the driver this ticket number.</p>';
    }
  }

  async function openQrModal(text) {
    try { await loadExternalScript(CDN.QRCODE); } catch (e) { /* handled below */ }
    let svg = "";
    try { svg = qrSvgFor(text); } catch (e) { svg = ""; }
    Modal.open({
      title: "Your ticket",
      body:
        '<div class="qr-large">' + (svg ? '<div class="qr-box qr-box--large">' + svg + '</div>' : '<div class="qr-fallback">The QR code could not be drawn.</div>') +
        '<p class="ticket-card__qr-number">' + escapeHtml(text) + '</p>' +
        '<p class="ticket-card__qr-caption">Hold your phone steady and let the driver scan this code. Turn your screen brightness up if it will not scan.</p></div>',
      footer: '<button type="button" class="button button--primary" data-modal-action="close">Done</button>',
      onAction: function () { Modal.close(); }
    });
  }

  Router.register("track-trip", {
    title: "Track your bus",
    subtitle: "Live location updates from the driver's device.",
    render: async function (container, params) {
      const tripId = params.tripId;
      if (!tripId) {
        renderEmpty(container, { icon: "🚌", title: "No trip selected", message: "Open a trip from My trips or Tickets and tap Track bus." });
        return;
      }

      // Clean up any previous tracking session (map, marker, timers, live channels)
      disposeTracking();

      container.innerHTML =
        '<div><button type="button" class="button button--ghost button--small" id="track-back">← Back to my trips</button></div>' +
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
          '<div class="card__footer"><button type="button" class="button button--secondary" id="share-trip-button">🔗 Share my trip with a friend</button></div>' +
        '</section>';

      try {
        const { data: trip, error } = await supabase.from("trips")
          .select("*, routes(*), vehicles(*), profiles:driver_id(full_name)")
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

        const backBtn = document.getElementById("track-back");
        if (backBtn) backBtn.addEventListener("click", function () { Router.go("my-trips"); });

        const shareBtn = document.getElementById("share-trip-button");
        if (shareBtn) {
          const canShare = (AppState.role === "passenger" || AppState.role === "driver") &&
            trip.status !== "completed" && trip.status !== "cancelled";
          if (!canShare) shareBtn.parentElement.remove();
          else shareBtn.addEventListener("click", function () { openShareTripModal(trip); });
        }

        if (trip.status === "completed" || trip.status === "cancelled") {
          const mapEl = document.getElementById("track-map");
          if (mapEl) {
            mapEl.innerHTML = '<div class="map-placeholder"><span class="map-placeholder__icon">' +
              (trip.status === "completed" ? "✅" : "⚠️") + '</span>' +
              (trip.status === "completed" ? "This trip has ended. Thanks for riding with Eko TransitCare." : "This trip was cancelled.") + '</div>';
          }
          return;
        }

        await initTrackingMap(trip);
        subscribeToTripLocations(trip.id);
        subscribeToTripStatus(trip.id);
        trackFreshnessTimer = setInterval(refreshTrackFreshness, 15000);
      } catch (err) { renderError(container, err.message); }
    }
  });

  let trackMapInstance = null;
  let trackMarker = null;
  let trackLastRecordedAt = null;
  let trackFreshnessTimer = null;

  // Tear down everything a tracking session creates. Safe to call repeatedly.
  function disposeTracking() {
    if (trackFreshnessTimer) { clearInterval(trackFreshnessTimer); trackFreshnessTimer = null; }
    if (trackMapInstance) {
      try { trackMapInstance.remove(); } catch (err) { /* already gone */ }
    }
    trackMapInstance = null;
    trackMarker = null;
    trackLastRecordedAt = null;
    stopRealtimeChannel("tripLocations");
    stopRealtimeChannel("tripStatus");
  }

  // Re-evaluates "Last updated …" / stale state without waiting for a new GPS point.
  function refreshTrackFreshness() {
    if (trackLastRecordedAt && trackMarker) {
      const ll = trackMarker.getLatLng();
      renderTrackOverlay(trackLastRecordedAt, ll.lat, ll.lng, true);
    }
  }

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

  function renderTrackOverlay(recordedAt, lat, lng, skipView) {
    const mapEl = document.getElementById("track-map");
    if (!mapEl) return;
    const age = Date.now() - new Date(recordedAt).getTime();
    const stale = age > TRANSITCARE_CONFIG.GPS_STALE_THRESHOLD_MS;
    const overlayHtml = '<div class="map-overlay' + (stale ? " map-overlay--stale" : "") + '">' +
      '<span class="map-overlay__label">' + (stale ? "GPS signal may be unavailable" : "Live location") + '</span>' +
      '<span class="map-overlay__value">Last updated ' + escapeHtml(formatRelativeTime(recordedAt)) + '</span></div>';
    const overlay = mapEl.querySelector(".map-overlay");
    if (overlay) overlay.outerHTML = overlayHtml;
    else mapEl.insertAdjacentHTML("beforeend", overlayHtml);
  }

  function updateTrackMarker(lat, lng, recordedAt) {
    if (!trackMapInstance || !window.L) return;
    const latNum = Number(lat), lngNum = Number(lng);
    if (!isFinite(latNum) || !isFinite(lngNum)) return;

    if (!trackMarker) {
      trackMarker = window.L.marker([latNum, lngNum]).addTo(trackMapInstance);
      trackMapInstance.setView([latNum, lngNum], 15);
    } else {
      trackMarker.setLatLng([latNum, lngNum]);
      // Follow the bus, but keep the passenger's own zoom level.
      trackMapInstance.panTo([latNum, lngNum]);
    }
    trackLastRecordedAt = recordedAt;
    renderTrackOverlay(recordedAt, latNum, lngNum);
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

  // Updates the status badge live and tells the passenger when the trip ends.
  function subscribeToTripStatus(tripId) {
    if (!supabase) return;
    stopRealtimeChannel("tripStatus");
    AppState.channels.tripStatus = supabase
      .channel("trip-status-" + tripId)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public",
        table: "trips", filter: "id=eq." + tripId
      }, function (payload) {
        const t = payload.new;
        if (!t) return;
        const statusEl = document.getElementById("track-status");
        if (statusEl) {
          statusEl.className = "badge badge--" + (t.status || "scheduled");
          statusEl.textContent = humanizeStatus(t.status);
        }
        if (t.status === "completed" || t.status === "cancelled") {
          Toast.info(t.status === "completed" ? "Trip completed" : "Trip cancelled",
            t.status === "completed" ? "You have arrived. Thanks for riding with us." : "This trip was cancelled.");
          disposeTracking();
          const mapEl = document.getElementById("track-map");
          if (mapEl) {
            mapEl.innerHTML = '<div class="map-placeholder"><span class="map-placeholder__icon">' +
              (t.status === "completed" ? "✅" : "⚠️") + '</span>' +
              (t.status === "completed" ? "This trip has ended." : "This trip was cancelled.") + '</div>';
          }
        }
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
              '<select id="trip-terminal"><option value="">Loading…</option></select>' +
              '<p class="field__hint text-muted text-small" id="trip-terminal-hint"></p></div>' +
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

        const linkMap = await Data.getRouteTerminals();
        const hint = document.getElementById("trip-terminal-hint");
        function refreshTerminals() { fillTerminalSelect(terminalSelect, hint, terminals, linkMap, routeSelect.value, false); }
        routeSelect.addEventListener("change", refreshTerminals);
        refreshTerminals();
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
        if (terminalSelect.dataset.required === "1" && !terminalId) {
          Toast.warning("Select a terminal", "Choose the terminal this bus will leave from.");
          return;
        }

        Loader.show("Creating trip…");
        try {
          let data = null, error = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            const res = await supabase.from("trips").insert({
              trip_code: generateTripCode(),
              driver_id: AppState.authUser.id,
              vehicle_id: vehicleId,
              route_id: routeId,
              terminal_id: terminalId || null,
              planned_departure: new Date(departureLocal).toISOString(),
              status: "scheduled"
            }).select().single();
            data = res.data; error = res.error;
            if (!error || error.code !== "23505") break;   // retry only on a duplicate trip code
          }
          if (error) {
            if (error.code === "23514" || /does not serve/i.test(error.message || "")) throw new Error("That terminal does not serve the selected route. Please choose one from the list.");
            throw error;
          }

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

    const refreshActive = function () { Router.go("active-trip"); };
    if (trip.status === "scheduled") {
      actions.innerHTML =
        '<button type="button" class="button button--secondary" id="open-boarding-button">🚪 Open boarding</button>' +
        '<button type="button" class="button button--primary" id="start-trip-button">▶ Start trip</button>' +
        '<button type="button" class="button button--ghost" id="cancel-trip-button">Cancel trip</button>';
      document.getElementById("open-boarding-button").addEventListener("click", function () { openBoarding(trip); });
      document.getElementById("start-trip-button").addEventListener("click", function () { startTrip(trip); });
      document.getElementById("cancel-trip-button").addEventListener("click", function () { openCancelTripModal(trip, refreshActive); });
    } else if (trip.status === "boarding") {
      actions.innerHTML =
        '<button type="button" class="button button--secondary" id="scan-tickets-button">📷 Scan tickets</button>' +
        '<button type="button" class="button button--primary" id="start-trip-button">▶ Start trip</button>' +
        '<button type="button" class="button button--ghost" id="cancel-trip-button">Cancel trip</button>';
      document.getElementById("scan-tickets-button").addEventListener("click", function () { Router.go("scan-ticket"); });
      document.getElementById("start-trip-button").addEventListener("click", function () { startTrip(trip); });
      document.getElementById("cancel-trip-button").addEventListener("click", function () { openCancelTripModal(trip, refreshActive); });
    } else if (trip.status === "in_transit") {
      actions.innerHTML =
        '<button type="button" class="button button--secondary" id="scan-tickets-button">📷 Scan tickets</button>' +
        '<button type="button" class="button button--danger" id="end-trip-button">⏹ End trip</button>';
      document.getElementById("scan-tickets-button").addEventListener("click", function () { Router.go("scan-ticket"); });
      document.getElementById("end-trip-button").addEventListener("click", function () { endTrip(trip); });
      document.getElementById("gps-card").style.display = "";
      startGpsWatch(trip);
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
        .eq("trip_id", trip.id).in("status", ["reserved", "boarded"]);

      const rows = (bookings || []).filter(function (b) { return b.passenger_id; }).map(function (b) {
        return {
          recipient_id: b.passenger_id,
          title: "Trip started",
          message: "Bus " + (trip.trip_code || "") + " has departed. Track it live.",
          type: "trip_started",
          related_entity: trip.id,
          is_read: false
        };
      });
      if (rows.length) {
        const ins = await supabase.from("notifications").insert(rows);
        if (ins.error) console.warn("[TransitCare] Trip-start notifications failed:", ins.error.message);
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

  function scannerResult(type, icon, title, message) {
    return '<div class="scanner-result scanner-result--' + type + '">' +
      '<span class="scanner-result__icon" aria-hidden="true">' + icon + '</span>' +
      '<p class="scanner-result__title">' + escapeHtml(title) + '</p>' +
      '<p class="scanner-result__message">' + escapeHtml(message) + '</p></div>';
  }


  /* =======================================================================
     16. OPERATOR VIEWS
     ======================================================================= */

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
              '<button type="button" class="button button--small button--ghost" data-delete-driver="' + escapeHtml(d.id) + '">Delete</button>' +
            '</div></div>';
        }).join("") + '</div>';

        list.querySelectorAll("[data-approve]").forEach(function (btn) {
          btn.addEventListener("click", function () { updateDriverStatus(btn.getAttribute("data-approve"), "approved"); });
        });
        list.querySelectorAll("[data-reject]").forEach(function (btn) {
          btn.addEventListener("click", function () { updateDriverStatus(btn.getAttribute("data-reject"), "rejected"); });
        });
        list.querySelectorAll("[data-delete-driver]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const driver = drivers.find(function (x) { return x.id === btn.getAttribute("data-delete-driver"); });
            if (driver) openDeleteUserModal(driver, function () { Router.go("admin-drivers"); });
          });
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

  function isRpcMissing(err) { return err && err.code === "RPC_MISSING"; }

  Router.register("admin-terminals", {
    title: "Terminals",
    subtitle: "Boarding points across the network. Add, edit or delete them.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-terminal">+ Add terminal</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="terminals-list"></div></div>';
      const list = document.getElementById("terminals-list");
      renderLoading(list, "Loading terminals…");

      const addBtn = document.getElementById("add-terminal");
      if (addBtn) addBtn.addEventListener("click", function () { openTerminalModal(null); });

      try {
        const data = await Data.getTerminals();
        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "📍", title: "No terminals", message: "Add your first terminal." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (t) {
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(t.name) + '</p>' +
            '<p class="list__meta">' + escapeHtml([t.location, t.contact_info].filter(Boolean).join(" · ")) + '</p></div>' +
            '<span class="badge badge--' + escapeHtml(t.status || "active") + '">' + escapeHtml(humanizeStatus(t.status || "active")) + '</span>' +
            '<div class="list__actions">' +
              '<button type="button" class="button button--small button--ghost" data-edit-terminal="' + escapeHtml(t.id) + '">Edit</button> ' +
              '<button type="button" class="button button--small button--danger" data-delete-terminal="' + escapeHtml(t.id) + '">Delete</button>' +
            '</div></div>';
        }).join("") + '</div>';
        list.querySelectorAll("[data-edit-terminal]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            openTerminalModal(data.find(function (x) { return x.id === btn.getAttribute("data-edit-terminal"); }));
          });
        });
        list.querySelectorAll("[data-delete-terminal]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const t = data.find(function (x) { return x.id === btn.getAttribute("data-delete-terminal"); });
            if (t) openDeleteTerminalModal(t);
          });
        });
      } catch (err) { renderError(list, err.message); }
    }
  });

  function openTerminalModal(terminal) {
    const editing = !!terminal;
    const t = terminal || {};
    Modal.open({
      title: editing ? "Edit terminal" : "Add terminal",
      body: '<div class="field"><label for="term-name">Terminal name</label><input type="text" id="term-name" value="' + escapeHtml(t.name || "") + '" /></div>' +
        '<div class="field"><label for="term-location">Location</label><input type="text" id="term-location" value="' + escapeHtml(t.location || "") + '" /></div>' +
        '<div class="field"><label for="term-desc">Description</label><textarea id="term-desc">' + escapeHtml(t.description || "") + '</textarea></div>' +
        '<div class="field"><label for="term-contact">Contact information</label><input type="text" id="term-contact" value="' + escapeHtml(t.contact_info || "") + '" /></div>' +
        '<div class="field"><label for="term-status">Status</label><select id="term-status">' +
          '<option value="active"' + ((t.status || "active") === "active" ? " selected" : "") + '>Active (available to drivers)</option>' +
          '<option value="inactive"' + (t.status === "inactive" ? " selected" : "") + '>Inactive (hidden from new trips)</option></select></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const name = document.getElementById("term-name").value.trim();
        if (!name) { Toast.warning("Name required"); return; }
        const fields = {
          name: name,
          location: document.getElementById("term-location").value.trim() || null,
          description: document.getElementById("term-desc").value.trim() || null,
          contact_info: document.getElementById("term-contact").value.trim() || null,
          status: document.getElementById("term-status").value
        };
        Loader.show("Saving…");
        try {
          try {
            await callRpc("tc_admin_save_terminal", {
              p_id: editing ? t.id : null, p_name: fields.name, p_location: fields.location,
              p_description: fields.description, p_contact: fields.contact_info, p_status: fields.status
            });
          } catch (err) {
            if (!isRpcMissing(err)) throw err;
            // Database update 005 not installed yet: fall back to a plain save.
            const res = editing ? await supabase.from("terminals").update(fields).eq("id", t.id) : await supabase.from("terminals").insert(fields);
            if (res.error) throw res.error;
          }
          AppState.cache.terminals = null;
          Modal.close();
          Toast.success(editing ? "Terminal updated" : "Terminal added");
          Router.go("admin-terminals");
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  function openDeleteTerminalModal(terminal) {
    Modal.open({
      title: "Delete terminal",
      body: '<p>Delete <strong>' + escapeHtml(terminal.name) + '</strong>? This cannot be undone.</p>' +
        '<p class="text-muted text-small">If trips already use this terminal it cannot be deleted. Set it to Inactive instead.</p>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--danger" data-modal-action="delete">Delete terminal</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        Loader.show("Deleting…");
        try {
          await callRpc("tc_admin_delete_terminal", { p_id: terminal.id });
          AppState.cache.terminals = null;
          Modal.close();
          Toast.success("Terminal deleted");
          Router.go("admin-terminals");
        } catch (err) { Toast.error("Unable to delete", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  Router.register("admin-routes", {
    title: "Routes",
    subtitle: "Origins, destinations, fares and the terminals each route departs from.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-route">+ Add route</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="routes-list"></div></div>';
      const list = document.getElementById("routes-list");
      renderLoading(list, "Loading routes…");

      try {
        const results = await Promise.all([Data.getRoutes(), Data.getTerminals(), Data.getRouteTerminals()]);
        const data = results[0], terminals = results[1], linkMap = results[2];

        const addBtn = document.getElementById("add-route");
        if (addBtn) addBtn.addEventListener("click", function () { openRouteModal(null, terminals, linkMap); });

        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🗺️", title: "No routes", message: "Add your first route." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (r) {
          const names = ((linkMap && linkMap[r.id]) || []).map(function (id) {
            const t = terminals.find(function (x) { return x.id === id; }); return t ? t.name : null;
          }).filter(Boolean);
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(r.origin) + ' → ' + escapeHtml(r.destination) + '</p>' +
            '<p class="list__meta">' +
              escapeHtml([r.estimated_minutes ? r.estimated_minutes + " min" : "", r.base_fare ? formatCurrency(r.base_fare) : ""].filter(Boolean).join(" · ")) + '</p>' +
            (linkMap ? '<p class="list__meta">Departs from: ' + escapeHtml(names.length ? names.join(", ") : "not set") + '</p>' : "") + '</div>' +
            '<span class="badge badge--' + escapeHtml(r.status || "active") + '">' + escapeHtml(humanizeStatus(r.status || "active")) + '</span>' +
            '<div class="list__actions">' +
              '<button type="button" class="button button--small button--ghost" data-edit-route="' + escapeHtml(r.id) + '">Edit</button> ' +
              '<button type="button" class="button button--small button--danger" data-delete-route="' + escapeHtml(r.id) + '">Delete</button>' +
            '</div></div>';
        }).join("") + '</div>';
        list.querySelectorAll("[data-edit-route]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            openRouteModal(data.find(function (x) { return x.id === btn.getAttribute("data-edit-route"); }), terminals, linkMap);
          });
        });
        list.querySelectorAll("[data-delete-route]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const r = data.find(function (x) { return x.id === btn.getAttribute("data-delete-route"); });
            if (r) openDeleteRouteModal(r);
          });
        });
      } catch (err) { renderError(list, err.message); }
    }
  });

  function openRouteModal(route, terminals, linkMap) {
    const editing = !!route;
    const r = route || {};
    const chosen = (editing && linkMap && linkMap[r.id]) || [];
    const termBox = linkMap
      ? '<fieldset class="field"><legend>Departure terminals</legend>' +
          '<p class="text-muted text-small">Drivers will only be able to pick these terminals for this route. Tick every terminal where this route boards.</p>' +
          (terminals.length ? terminals.map(function (t) {
            return '<label class="checkbox-row"><input type="checkbox" data-route-terminal="' + escapeHtml(t.id) + '"' +
              (chosen.indexOf(t.id) !== -1 ? " checked" : "") + ' /> ' + escapeHtml(t.name) +
              (t.status === "inactive" ? ' <span class="text-muted">(inactive)</span>' : "") + '</label>';
          }).join("") : '<p class="text-muted">No terminals yet. Add terminals first.</p>') + '</fieldset>'
      : '<p class="text-muted text-small">Run database update 005 to choose departure terminals for each route.</p>';
    Modal.open({
      title: editing ? "Edit route" : "Add route",
      body: '<div class="field"><label for="route-origin">Origin</label><input type="text" id="route-origin" value="' + escapeHtml(r.origin || "") + '" /></div>' +
        '<div class="field"><label for="route-destination">Destination</label><input type="text" id="route-destination" value="' + escapeHtml(r.destination || "") + '" /></div>' +
        '<div class="field"><label for="route-fare">Base fare (₦)</label><input type="number" id="route-fare" min="0" step="50" value="' + escapeHtml(r.base_fare == null ? "" : r.base_fare) + '" /></div>' +
        '<div class="field"><label for="route-minutes">Estimated minutes</label><input type="number" id="route-minutes" min="1" value="' + escapeHtml(r.estimated_minutes == null ? "" : r.estimated_minutes) + '" /></div>' +
        '<div class="field"><label for="route-status">Status</label><select id="route-status">' +
          '<option value="active"' + ((r.status || "active") === "active" ? " selected" : "") + '>Active</option>' +
          '<option value="inactive"' + (r.status === "inactive" ? " selected" : "") + '>Inactive</option></select></div>' + termBox,
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const origin = document.getElementById("route-origin").value.trim();
        const destination = document.getElementById("route-destination").value.trim();
        if (!origin || !destination) { Toast.warning("Origin and destination required"); return; }
        const fareRaw = document.getElementById("route-fare").value;
        const minRaw = document.getElementById("route-minutes").value;
        const status = document.getElementById("route-status").value;
        const ids = Array.prototype.map.call(document.querySelectorAll("[data-route-terminal]:checked"), function (el) { return el.getAttribute("data-route-terminal"); });
        Loader.show("Saving…");
        try {
          try {
            await callRpc("tc_admin_save_route", {
              p_id: editing ? r.id : null, p_origin: origin, p_destination: destination,
              p_base_fare: fareRaw === "" ? null : Number(fareRaw), p_estimated_minutes: minRaw === "" ? null : Number(minRaw),
              p_status: status, p_terminal_ids: linkMap ? ids : null
            });
          } catch (err) {
            if (!isRpcMissing(err)) throw err;
            const fields = { origin: origin, destination: destination, base_fare: Number(fareRaw) || null, estimated_minutes: Number(minRaw) || null, status: status };
            const res = editing ? await supabase.from("routes").update(fields).eq("id", r.id) : await supabase.from("routes").insert(fields);
            if (res.error) throw res.error;
          }
          AppState.cache.routes = null;
          Modal.close();
          Toast.success(editing ? "Route updated" : "Route added");
          Router.go("admin-routes");
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  function openDeleteRouteModal(route) {
    Modal.open({
      title: "Delete route",
      body: '<p>Delete <strong>' + escapeHtml(route.origin + " → " + route.destination) + '</strong>? This cannot be undone.</p>' +
        '<p class="text-muted text-small">If trips already use this route it cannot be deleted. Set it to Inactive instead.</p>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--danger" data-modal-action="delete">Delete route</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        Loader.show("Deleting…");
        try {
          await callRpc("tc_admin_delete_route", { p_id: route.id });
          AppState.cache.routes = null;
          Modal.close();
          Toast.success("Route deleted");
          Router.go("admin-routes");
        } catch (err) { Toast.error("Unable to delete", err.message); }
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

    /* =======================================================================
     ADMIN — NEWS UPDATES
     Requires a `news_updates` table in Supabase, e.g.:
       id uuid pk default gen_random_uuid()
       title text not null
       message text not null
       audience text default 'all'   -- 'all' | 'passenger' | 'driver' | 'operator'
       is_active boolean default true
       created_by uuid references profiles(id)
       created_at timestamptz default now()
     ======================================================================= */
  Router.register("admin-news", {
    title: "News updates",
    subtitle: "Broadcast alerts shown on the passenger home screen.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-news">+ New update</button>',
    render: async function (container) {
      container.innerHTML =
        '<section class="card"><div class="card__header"><h3 class="card__title">Published updates</h3></div>' +
        '<div class="card__body card__body--flush" id="news-list"></div></section>';

      const list = document.getElementById("news-list");
      const addBtn = document.getElementById("add-news");
      if (addBtn) addBtn.addEventListener("click", openAddNewsModal);

      renderLoading(list, "Loading news updates…");

      try {
        const { data, error } = await supabase
          .from("news_updates")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;

        AppState.cache.news = data || [];

        if (!data || data.length === 0) {
          renderEmpty(list, {
            icon: "📰",
            title: "No news updates yet",
            message: "Create a broadcast to show passengers important service information."
          });
          return;
        }

        list.innerHTML = '<div class="list">' + data.map(function (n) {
          return '<div class="list__item">' +
            '<div class="list__main">' +
              '<p class="list__title">' + escapeHtml(n.title || "Untitled") + '</p>' +
              '<p class="list__meta">' + escapeHtml(n.message || "") + '</p>' +
              '<p class="list__meta text-tiny text-muted">' +
                escapeHtml(formatDateTime(n.created_at)) +
                ' · Audience: ' + escapeHtml(humanizeStatus(n.audience || "all")) +
              '</p>' +
            '</div>' +
            '<div class="list__actions">' +
              '<span class="badge badge--' + (n.is_active ? "active" : "cancelled") + '">' +
                (n.is_active ? "Active" : "Hidden") +
              '</span>' +
              '<button type="button" class="button button--small button--ghost" data-toggle-news="' +
                escapeHtml(n.id) + '" data-active="' + (n.is_active ? "true" : "false") + '">' +
                (n.is_active ? "Hide" : "Publish") +
              '</button>' +
              '<button type="button" class="button button--small button--danger" data-delete-news="' +
                escapeHtml(n.id) + '">Delete</button>' +
            '</div>' +
          '</div>';
        }).join("") + '</div>';

        list.querySelectorAll("[data-toggle-news]").forEach(function (btn) {
          btn.addEventListener("click", async function () {
            const id = btn.getAttribute("data-toggle-news");
            const nowActive = btn.getAttribute("data-active") === "true";
            Loader.show("Updating…");
            try {
              const { error } = await supabase.from("news_updates")
                .update({ is_active: !nowActive }).eq("id", id);
              if (error) throw error;
              Toast.success(nowActive ? "Update hidden" : "Update published");
              Router.go("admin-news");
            } catch (err) { Toast.error("Unable to update", err.message); }
            finally { Loader.hide(); }
          });
        });

        list.querySelectorAll("[data-delete-news]").forEach(function (btn) {
          btn.addEventListener("click", async function () {
            const id = btn.getAttribute("data-delete-news");
            const confirmed = await Modal.confirm({
              title: "Delete update?",
              message: "This news update will be permanently removed for all users.",
              confirmLabel: "Delete",
              danger: true
            });
            if (!confirmed) return;
            Loader.show("Deleting…");
            try {
              const { error } = await supabase.from("news_updates").delete().eq("id", id);
              if (error) throw error;
              Toast.success("Update deleted");
              Router.go("admin-news");
            } catch (err) { Toast.error("Unable to delete", err.message); }
            finally { Loader.hide(); }
          });
        });
      } catch (err) {
        renderError(list, err.message, function () { Router.go("admin-news"); });
      }
    }
  });

  function openAddNewsModal() {
    Modal.open({
      title: "New news update",
      body:
        '<div class="field"><label for="news-title">Title</label>' +
          '<input type="text" id="news-title" placeholder="e.g. Route diversion at Oshodi" /></div>' +
        '<div class="field"><label for="news-message">Message</label>' +
          '<textarea id="news-message" rows="4" placeholder="Tell passengers what is happening…"></textarea></div>' +
        '<div class="field"><label for="news-audience">Audience</label>' +
          '<select id="news-audience">' +
            '<option value="all">Everyone</option>' +
            '<option value="passenger">Passengers only</option>' +
            '<option value="driver">Drivers only</option>' +
            '<option value="operator">Operators only</option>' +
          '</select></div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="publish">Publish</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }

        const title = document.getElementById("news-title").value.trim();
        const message = document.getElementById("news-message").value.trim();
        const audience = document.getElementById("news-audience").value;

        if (!title || !message) {
          Toast.warning("Missing fields", "Title and message are required.");
          return;
        }

        Loader.show("Publishing…");
        try {
          const { error } = await supabase.from("news_updates").insert({
            title: title,
            message: message,
            audience: audience,
            is_active: true,
            created_by: AppState.authUser ? AppState.authUser.id : null
          });
          if (error) throw error;

          await Data.logAudit("news_published", "news_update", null, { title: title, audience: audience });

          Modal.close();
          Toast.success("News published", "The update is now visible to the selected audience.");
          Router.go("admin-news");
        } catch (err) {
          Toast.error("Unable to publish", err.message);
        } finally {
          Loader.hide();
        }
      }
    });
  }

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
     24. ERROR HANDLING & GLOBAL RESILIENCE
     ======================================================================= */
  window.addEventListener("error", function (event) {
    console.error("[TransitCare] Unhandled error:", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", function (event) {
    console.error("[TransitCare] Unhandled promise rejection:", event.reason);
  });


  /* =======================================================================
     UI HELPERS
     ======================================================================= */
  function showAuthScreen() {
    const authScreen = document.getElementById("auth-screen");
    const appShell = document.getElementById("app-shell");
    if (authScreen) authScreen.classList.remove("is-hidden");
    if (appShell) appShell.classList.add("is-hidden");
    document.body.style.overflow = "";
  }

  function showAppShell() {
    const authScreen = document.getElementById("auth-screen");
    const appShell = document.getElementById("app-shell");
    if (authScreen) authScreen.classList.add("is-hidden");
    if (appShell) appShell.classList.remove("is-hidden");
  }

  function updateHeaderUser() {
    const profile = AppState.profile || {};
    const meta = (AppState.authUser && AppState.authUser.user_metadata) || {};
    const name = profile.full_name || meta.full_name || "Commuter";
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
     FORM BINDINGS
     ======================================================================= */
  function bindAuthForms() {

    const signinForm = document.getElementById("signin-form");
    const signupForm = document.getElementById("signup-form");
    const forgotForm = document.getElementById("forgot-form");
    const resetForm = document.getElementById("reset-form");
    const phoneForm = document.getElementById("phone-form");
    const otpForm = document.getElementById("otp-form");

    function showAuthForm(mode) {
      [signinForm, signupForm, forgotForm, resetForm, phoneForm, otpForm].forEach(function (f) {
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
      } else if (mode === "phone" && phoneForm) {
        phoneForm.classList.remove("is-hidden");
      } else if (mode === "otp" && otpForm) {
        otpForm.classList.remove("is-hidden");
        const tab = document.getElementById("tab-signup");
        if (tab) tab.classList.add("is-active");
      }

      setFormMessage("auth-message", null, "");
    }
    AppState.showAuthForm = showAuthForm;
    bindEmailOtpForm();

    function showWhatsAppSoon() {
      showAuthForm(signupForm && !signupForm.classList.contains("is-hidden") ? "signup" : "signin");
      setFormMessage("auth-message", "info",
        "WhatsApp verification is coming soon. For now, please continue with email or Google.");
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

    // WhatsApp sign-up is offered to passengers only.
    function syncPhoneAltVisibility() {
      const checked = document.querySelector('input[name="signup-role"]:checked');
      const alt = document.getElementById("signup-method");
      if (alt) alt.style.display = (!checked || checked.value === "passenger") ? "" : "none";
    }
    document.querySelectorAll('input[name="signup-role"]').forEach(function (radio) {
      radio.addEventListener("change", syncPhoneAltVisibility);
    });
    syncPhoneAltVisibility();

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
        } catch (err) {
          if (err && err.code === "SIGNIN_TIMEOUT") {
            setFormMessage("auth-message", "warning", "Sign-in is taking longer than expected. Please retry.");
            return;
          }

          const msg = (err && err.message) ? err.message : "";
          if (/email not confirmed|email not verified/i.test(msg)) {
            // Send a fresh 6-digit code and take the user straight to the code screen.
            try { await Auth.resendVerification(email); } catch (e2) { /* the code screen has its own Resend */ }
            openEmailOtp(email);
            setFormMessage("auth-message", "warning", "Your email is not verified yet. Enter the 6-digit code we just sent, or ask an administrator to verify your account.");
          } else {
            setFormMessage("auth-message", "danger", msg || "Unable to sign in.");
          }
        } finally {
          submit.disabled = false;
          submit.textContent = "Sign in";
        }
      });
    }

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

    /* ---------------------------------------------------------------
       PHONE / WHATSAPP OTP (passengers)
       Step 1: enter number (+ name & terms when signing up) → code sent
       Step 2: enter code → verifyOtp → onAuthStateChange(SIGNED_IN)
       --------------------------------------------------------------- */
    const phoneState = { mode: "signup", phone: null, step: "details", cooldownTimer: null };

    function phoneStopCooldown() {
      if (phoneState.cooldownTimer) { clearInterval(phoneState.cooldownTimer); phoneState.cooldownTimer = null; }
    }

    function phoneStartCooldown(seconds) {
      const btn = document.getElementById("phone-resend");
      if (!btn) return;
      phoneStopCooldown();
      let left = seconds;
      btn.disabled = true;
      btn.textContent = "Resend code in " + left + "s";
      phoneState.cooldownTimer = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          phoneStopCooldown();
          btn.disabled = false;
          btn.textContent = "Resend code";
        } else {
          btn.textContent = "Resend code in " + left + "s";
        }
      }, 1000);
    }

    function phoneSetStep(step) {
      phoneState.step = step;
      const details = document.getElementById("phone-step-details");
      const otp = document.getElementById("phone-step-otp");
      const actions = document.getElementById("phone-otp-actions");
      const submit = document.getElementById("phone-submit");
      const isOtp = step === "otp";
      if (details) details.classList.toggle("is-hidden", isOtp);
      if (otp) otp.classList.toggle("is-hidden", !isOtp);
      if (actions) actions.style.display = isOtp ? "" : "none";
      if (submit) submit.textContent = isOtp ? "Verify and continue" : "Send code on WhatsApp";
      const hint = document.getElementById("phone-otp-hint");
      if (hint && isOtp) hint.textContent = "Enter the code we sent to WhatsApp on " + (phoneState.phone || "your number") + ".";
    }

    function openPhoneFlow(mode) {
      if (!TRANSITCARE_CONFIG.WHATSAPP_OTP_ENABLED) { showWhatsAppSoon(); return; }
      phoneState.mode = mode;
      phoneState.phone = null;
      phoneStopCooldown();
      showAuthForm("phone");
      if (!phoneForm) return;
      phoneForm.reset();
      clearFormErrors(phoneForm);
      phoneSetStep("details");

      const isSignup = mode === "signup";
      setText("phone-title", isSignup ? "Sign up with WhatsApp" : "Sign in with WhatsApp");
      setText("phone-subtitle", isSignup
        ? "Passenger accounts only. We will send a 6-digit code to your WhatsApp number to finish registration."
        : "Enter the WhatsApp number on your account and we will send you a sign-in code.");
      const nameField = document.getElementById("phone-name-field");
      const termsWrap = document.getElementById("phone-terms-wrap");
      if (nameField) nameField.style.display = isSignup ? "" : "none";
      if (termsWrap) termsWrap.style.display = isSignup ? "" : "none";
      const methodBox = document.getElementById("phone-method");
      const backBtn = document.getElementById("phone-back");
      if (methodBox) methodBox.style.display = isSignup ? "" : "none";
      if (backBtn) backBtn.style.display = isSignup ? "none" : "";

      document.querySelectorAll(".auth-tab").forEach(function (t) {
        const active = t.getAttribute("data-auth-mode") === (isSignup ? "signup" : "signin");
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    function phoneFriendlyError(err) {
      const msg = (err && err.message) ? err.message : "";
      if (/signups? not allowed|user not found|not found/i.test(msg)) {
        return "No account found for this number. Please create an account first.";
      }
      if (/rate limit|too many|only request this after|security purposes/i.test(msg)) {
        return "Please wait a moment before requesting another code.";
      }
      if (/provider|twilio|whatsapp|unsupported|disabled|sms/i.test(msg)) {
        return "WhatsApp codes are not available right now. Please use email instead.";
      }
      if (/invalid.*phone|phone.*invalid/i.test(msg)) {
        return "That phone number does not look valid.";
      }
      return msg || "Something went wrong. Please try again.";
    }

    async function phoneSendCode(isResend) {
      const number = normalizePhone(document.getElementById("phone-number").value);
      const isSignup = phoneState.mode === "signup";

      if (!isResend) {
        clearFormErrors(phoneForm);
        let valid = true;
        const fullName = document.getElementById("phone-fullname").value.trim();
        if (isSignup && !Validators.required(fullName)) { setFieldError("phone-fullname", "Enter your full name."); valid = false; }
        if (!number) { setFieldError("phone-number", "Enter a valid WhatsApp number."); valid = false; }
        if (isSignup && !document.getElementById("phone-terms").checked) {
          setFieldError("phone-terms", "Please accept the terms to continue.");
          valid = false;
        }
        if (!valid) return;
      }

      const submit = document.getElementById("phone-submit");
      const resend = document.getElementById("phone-resend");
      if (!isResend) { submit.disabled = true; submit.innerHTML = '<span class="button__spinner"></span> Sending code…'; }
      if (isResend && resend) resend.disabled = true;

      try {
        const target = isResend ? phoneState.phone : number;
        await Auth.sendPhoneOtp(target, {
          createUser: isSignup,
          fullName: document.getElementById("phone-fullname").value.trim()
        });
        phoneState.phone = target;
        phoneSetStep("otp");
        phoneStartCooldown(60);
        const otpInput = document.getElementById("phone-otp");
        if (otpInput) { otpInput.value = ""; otpInput.focus(); }
        Toast.success("Code sent", "Check WhatsApp on " + target + ".");
      } catch (err) {
        setFormMessage("auth-message", "danger", phoneFriendlyError(err));
        if (isResend && resend) resend.disabled = false;
        if (!isResend) { submit.textContent = "Send code on WhatsApp"; }
      } finally {
        submit.disabled = false;
        if (phoneState.step === "otp") submit.textContent = "Verify and continue";
        else submit.textContent = "Send code on WhatsApp";
      }
    }

    async function phoneVerifyCode() {
      clearFormErrors(phoneForm);
      setFormMessage("auth-message", null, "");
      const token = document.getElementById("phone-otp").value.replace(/\D/g, "");
      if (token.length < 6) { setFieldError("phone-otp", "Enter the 6-digit code."); return; }

      const submit = document.getElementById("phone-submit");
      submit.disabled = true;
      submit.innerHTML = '<span class="button__spinner"></span> Verifying…';

      try {
        await Auth.verifyPhoneOtp(phoneState.phone, token);
        phoneStopCooldown();
        setFormMessage("auth-message", "success",
          phoneState.mode === "signup" ? "Number verified. Setting up your account…" : "Signed in.");
        // handleSignedIn() runs from the SIGNED_IN auth event.
      } catch (err) {
        const msg = (err && err.message) ? err.message : "";
        setFieldError("phone-otp", /expired|invalid|token/i.test(msg)
          ? "That code is incorrect or has expired."
          : (msg || "Unable to verify the code."));
      } finally {
        submit.disabled = false;
        submit.textContent = "Verify and continue";
      }
    }

    // Email / Google / WhatsApp choice for passenger registration
    document.querySelectorAll("[data-method]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const method = btn.getAttribute("data-method");
        const inPhoneFlow = phoneForm && !phoneForm.classList.contains("is-hidden");
        if (method === "google") {
          startGoogleSignIn(btn);
        } else if (method === "whatsapp") {
          if (!TRANSITCARE_CONFIG.WHATSAPP_OTP_ENABLED) showWhatsAppSoon();
          else if (!inPhoneFlow) openPhoneFlow("signup");
        } else {
          phoneStopCooldown();
          showAuthForm("signup");
        }
      });
    });
    document.querySelectorAll("[data-google-signin]").forEach(function (btn) {
      btn.addEventListener("click", function () { startGoogleSignIn(btn); });
    });
    const useSigninPhone = document.getElementById("signin-use-phone");
    if (useSigninPhone) {
      if (TRANSITCARE_CONFIG.WHATSAPP_OTP_ENABLED) useSigninPhone.textContent = "💬 Sign in with a WhatsApp code instead";
      useSigninPhone.addEventListener("click", function () {
        if (!TRANSITCARE_CONFIG.WHATSAPP_OTP_ENABLED) { showWhatsAppSoon(); return; }
        openPhoneFlow("signin");
      });
    }

    if (phoneForm) {
      phoneForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (phoneState.step === "otp") phoneVerifyCode();
        else phoneSendCode(false);
      });

      const phoneResend = document.getElementById("phone-resend");
      if (phoneResend) phoneResend.addEventListener("click", function () { phoneSendCode(true); });

      const phoneChange = document.getElementById("phone-change");
      if (phoneChange) phoneChange.addEventListener("click", function () {
        phoneStopCooldown();
        clearFormErrors(phoneForm);
        setFormMessage("auth-message", null, "");
        phoneSetStep("details");
      });

      const phoneBack = document.getElementById("phone-back");
      if (phoneBack) phoneBack.addEventListener("click", function () {
        phoneStopCooldown();
        showAuthForm(phoneState.mode === "signup" ? "signup" : "signin");
      });
    }

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
     25. SIGNED-IN SESSION HANDLER
     ======================================================================= */
  async function handleSignedIn(session) {
    if (!session || !session.user) {
      showAuthScreen();
      return;
    }

    // 1. Immediately reveal the main app so the user never sees the login screen on reload
    showAppShell();

    if (AppState.isSigningIn) return;
    AppState.isSigningIn = true;

    try {
      // Only accept Google accounts whose email Google has verified.
      if (hasUnverifiedGoogleIdentity(session.user)) {
        AppState.isSigningIn = false;
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        resetState();
        showAuthScreen();
        setFormMessage("auth-message", "danger", "Your Google email address is not verified, so we could not sign you in.");
        return;
      }
      stopEmailOtpTimer();
      AppState.authUser = session.user;

      // 2. Fetch or restore profile
      let profile = null;
      try {
        profile = await Profile.fetch(session.user.id);
      } catch (err) {
        console.warn("[TransitCare] Profile fetch error:", err);
      }

      if (!profile && session.user.user_metadata) {
        const meta = session.user.user_metadata;
        // Only self-service roles may be created from client-side metadata.
        const allowedRoles = ["passenger", "driver", "operator"];
        const isPhoneUser = !session.user.email && !!session.user.phone;
        const provider = (session.user.app_metadata && session.user.app_metadata.provider) || "email";
        // Phone and Google sign-ups are passengers only; driver/operator need the email form.
        const safeRole = (isPhoneUser || provider === "google") ? "passenger"
          : (allowedRoles.indexOf(meta.role) !== -1 ? meta.role : "passenger");
        try {
          // upsert + ignoreDuplicates = "insert unless it already exists": never a second profile
          await supabase.from("profiles").upsert({
            id: session.user.id,
            full_name: meta.full_name || meta.name || session.user.email || session.user.phone,
            email: session.user.email || null,
            phone: meta.phone || session.user.phone || null,
            role: safeRole,
            status: safeRole === "driver" ? "email_verified" : "active"
          }, { onConflict: "id", ignoreDuplicates: true });
          profile = await Profile.fetch(session.user.id);
        } catch (err) {
          console.warn("[TransitCare] Profile auto-creation skipped:", err);
        }
      }

      // A suspended account is signed straight back out.
      if (profile && profile.status === "suspended") {
        AppState.isSigningIn = false;
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        resetState();
        showAuthScreen();
        setFormMessage("auth-message", "danger", "This account has been suspended. Please contact an administrator.");
        return;
      }

      AppState.profile = profile;
      AppState.role = Profile.resolveRole(profile, session.user);

      // Operators always get a company record so every operator screen works.
      if (AppState.role === "operator" && profile && !profile.operator_id) {
        try { await ensureOperatorLink(); }
        catch (err) { console.warn("[TransitCare] Operator company setup skipped:", err.message); }
      }

      // 3. Render authenticated UI
      updateHeaderUser();
      renderNavigation();

      try {
        await refreshNotificationBadge();
        subscribeToNotifications();
      } catch (e) {
        console.warn("[TransitCare] Notification setup skipped:", e);
      }

      // 4. Route to default view if not already navigated
      const defaultView =
        AppState.role === "admin" ? "admin-dashboard" :
        AppState.role === "operator" ? "operator-dashboard" :
        AppState.role === "driver" ? "driver-dashboard" : "home";

      if (!AppState.currentView || AppState.currentView === "home") {
        Router.go(defaultView);
      }
    } catch (err) {
      console.error("[TransitCare] Error during handleSignedIn:", err);
    } finally {
      AppState.isSigningIn = false;
    }
  }


  /* =======================================================================
     26. GLOBAL UI WIRING
     ======================================================================= */
  // One delegated listener so every screen's Track button / tappable
  // notification works without per-render wiring.
  function wireTrackingShortcuts() {
    document.addEventListener("click", function (event) {
      const qrBtn = event.target.closest && event.target.closest("[data-qr-enlarge]");
      if (qrBtn) { openQrModal(qrBtn.getAttribute("data-qr-enlarge")); return; }
      const btn = event.target.closest && event.target.closest("[data-track-booking]");
      if (btn) {
        const id = btn.getAttribute("data-track-booking");
        if (id) Router.go("track-trip", { tripId: id });
        return;
      }
      const note = event.target.closest && event.target.closest("[data-track-trip-id]");
      if (note) {
        const id = note.getAttribute("data-track-trip-id");
        if (id) Router.go("track-trip", { tripId: id });
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const note = event.target.closest && event.target.closest("[data-track-trip-id]");
      if (note) { event.preventDefault(); note.click(); }
    });
  }

  function wireGlobalUi() {
    wireTrackingShortcuts();
    const toggle = document.getElementById("sidebar-toggle");
    if (toggle) toggle.addEventListener("click", toggleSidebar);

    const shell = document.getElementById("app-shell");
    if (shell) {
      shell.addEventListener("click", function (event) {
        if (!shell.classList.contains("sidebar-open")) return;
        if (event.target === shell) closeSidebar();
      });
    }

    const brand = document.querySelector(".app-header__brand");
    if (brand) {
      brand.addEventListener("click", function (e) {
        e.preventDefault();
        const defaultView =
          AppState.role === "admin" ? "admin-dashboard" :
          AppState.role === "operator" ? "operator-dashboard" :
          AppState.role === "driver" ? "driver-dashboard" : "home";
        Router.go(defaultView);
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

    const dropdownProfile = document.querySelector('#user-menu-dropdown [data-view="profile"]');
    if (dropdownProfile) {
      dropdownProfile.addEventListener("click", function (e) {
        e.preventDefault();
        Router.go("profile");
        dropdown.classList.add("is-hidden");
      });
    }

    const dropdownNotif = document.querySelector('#user-menu-dropdown [data-view="notifications"]');
    if (dropdownNotif) {
      dropdownNotif.addEventListener("click", function (e) {
        e.preventDefault();
        Router.go("notifications");
        dropdown.classList.add("is-hidden");
      });
    }

    const signoutButton = document.getElementById("signout-button");
    if (signoutButton) signoutButton.addEventListener("click", function () { Auth.signOut(); });

    const notifButton = document.getElementById("header-notifications-button");
    if (notifButton) notifButton.addEventListener("click", function () { Router.go("notifications"); });

    setText("app-version", "v" + TRANSITCARE_CONFIG.APP_VERSION);
  }


  /* =======================================================================
     27. BOOTSTRAP
     ======================================================================= */
  // Fills the hero news ticker with active public updates (silent on failure).
  async function loadAuthNews() {
    const ticker = document.getElementById("news-ticker");
    const messageEl = document.getElementById("news-ticker-message");
    if (!supabase || !ticker || !messageEl) return;
    try {
      const { data, error } = await supabase
        .from("news_updates")
        .select("title, message")
        .eq("is_active", true)
        .in("audience", ["all", "passenger"])
        .order("created_at", { ascending: false })
        .limit(3);
      if (error || !data || data.length === 0) return;
      messageEl.textContent = data.map(function (n) {
        return (n.title ? n.title + ": " : "") + (n.message || "");
      }).join("   •   ");
      ticker.style.display = "";
    } catch (err) {
      console.warn("[TransitCare] Auth news skipped:", err && err.message);
    }
  }

  async function bootstrap() {
    initSupabase();

    // A friend's shared link (?track=CODE) opens the public tracker only.
    const sharedCode = new URLSearchParams(window.location.search).get("track");
    if (sharedCode !== null) {
      PublicTrack.start(sharedCode);
      return;
    }

    bindAuthForms();
    wireGlobalUi();

    const redirectError = readAuthRedirectError();
    if (redirectError) {
      showAuthScreen();
      setFormMessage("auth-message", "warning", redirectError);
    }

    if (!supabase) {
      showAuthScreen();
      return;
    }

    loadAuthNews();

    const hash = window.location.hash || "";
    if (hash.includes("type=recovery")) {
      showAuthScreen();
      document.querySelectorAll(".auth-form").forEach(function (f) { f.classList.add("is-hidden"); });
      const resetForm = document.getElementById("reset-form");
      if (resetForm) resetForm.classList.remove("is-hidden");
      return;
    }

    // 1. Immediately read existing session from localStorage on startup
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session && session.user) {
        await handleSignedIn(session);
      } else {
        showAuthScreen();
      }
    } catch (err) {
      console.warn("[TransitCare] getSession failed on bootstrap:", err);
      showAuthScreen();
    }

    // 2. Listen for future auth changes (login, logout, token refresh)
    supabase.auth.onAuthStateChange(async function (event, session) {
      console.log("[TransitCare] Auth event:", event);

      if (event === "SIGNED_OUT") {
        resetState();
        showAuthScreen();
      } else if (event === "SIGNED_IN") {
        if (session && session.user) {
          await handleSignedIn(session);
        }
      } else if (event === "PASSWORD_RECOVERY") {
        showAuthScreen();
        document.querySelectorAll(".auth-form").forEach(function (f) { f.classList.add("is-hidden"); });
        const resetForm = document.getElementById("reset-form");
        if (resetForm) resetForm.classList.remove("is-hidden");
      }
    });
  }

  /* =======================================================================
     27. DATABASE FUNCTION CALLS (RPC)
     ======================================================================= */
  /* Fill a terminal <select> with ONLY the terminals that serve the chosen route. */
  function fillTerminalSelect(select, hint, terminals, linkMap, routeId, allowEmpty) {
    if (!select) return;
    const noneLabel = allowEmpty ? "— None —" : "Select a terminal";
    function setHint(text) { if (hint) hint.textContent = text || ""; }
    select.dataset.required = "";
    if (!routeId) {
      select.innerHTML = '<option value="">Select a route first</option>';
      select.disabled = true; setHint("Choose a route and its departure terminals will appear here."); return;
    }
    let list = terminals;
    if (linkMap) {
      const ids = linkMap[routeId] || [];
      list = ids.length ? terminals.filter(function (t) { return ids.indexOf(t.id) !== -1; }) : [];
      if (!ids.length) {
        // Route has no terminals configured: nothing to filter by, so keep every terminal available.
        list = terminals;
        setHint("No departure terminal is set for this route yet, so all terminals are shown.");
      } else if (!list.length) {
        select.innerHTML = '<option value="">No active terminal for this route</option>';
        select.disabled = true; setHint("Every terminal linked to this route is inactive. Ask an administrator."); return;
      } else {
        select.dataset.required = "1";
        setHint(list.length === 1 ? "This route departs from this terminal only." : "Showing only terminals that serve this route.");
      }
    } else { setHint(""); }
    select.disabled = false;
    select.innerHTML = (list.length === 1 && linkMap && (linkMap[routeId] || []).length ? "" : '<option value="">' + noneLabel + '</option>') +
      list.map(function (t) { return '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + '</option>'; }).join("");
  }

  function friendlyRpcError(error) {
    const msg = (error && error.message) || "Something went wrong.";
    let out;
    if ((error && error.code === "PGRST202") || /could not find the function|schema cache/i.test(msg)) {
      out = new Error("This feature needs the latest database update. In Supabase (SQL Editor) run the files in the sql folder in order: 001, 002, 003, 004, 005. Then try again.");
      out.code = "RPC_MISSING";
    } else {
      out = new Error(msg);
      out.code = error && error.code;
    }
    return out;
  }

  async function callRpc(name, args) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.rpc(name, args || {});
    if (result.error) throw friendlyRpcError(result.error);
    return result.data;
  }

  function moneyOrDash(value) {
    return formatCurrency(Number(value) || 0);
  }

  function csvEscape(value) {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(filename, rows) {
    const text = rows.map(function (row) { return row.map(csvEscape).join(","); }).join("\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }


  /* =======================================================================
     28. QR SCANNER (driver)
     Uses the phone's built-in QR detector when available and falls back
     to the jsQR library, so it works on iPhones and older Androids too.
     ======================================================================= */
  const QrScanner = (function () {
    let stream = null, rafId = null, video = null, active = false, detector = null;
    let canvas = null, ctx = null, lastTick = 0, onResult = null;

    async function ensureJsQr() {
      if (window.jsQR) return;
      await loadExternalScript(CDN.JSQR);
      if (!window.jsQR) throw new Error("The QR reader could not be loaded. Type the ticket number instead.");
    }

    function stop() {
      active = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (video) { try { video.pause(); video.srcObject = null; } catch (e) { /* gone */ } }
    }

    function loop() {
      if (!active) return;
      rafId = requestAnimationFrame(async function (ts) {
        if (!active) return;
        if (ts - lastTick < 140 || !video || video.readyState < 2) { loop(); return; }
        lastTick = ts;
        let text = null;
        try {
          if (detector) {
            const found = await detector.detect(video);
            if (found && found.length) text = found[0].rawValue;
          } else {
            const w = video.videoWidth, h = video.videoHeight;
            if (w && h) {
              canvas.width = w; canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const res = window.jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (res && res.data) text = res.data;
            }
          }
        } catch (e) { /* keep scanning */ }
        if (text) {
          const cb = onResult;
          stop();
          if (cb) cb(text);
          return;
        }
        loop();
      });
    }

    async function start(videoEl, callback) {
      stop();
      onResult = callback;
      video = videoEl;
      if (!window.isSecureContext) throw new Error("The camera only works on a secure (https) page.");
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("This browser cannot open the camera. Type the ticket number instead.");
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (err) {
        if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
          throw new Error("Camera permission was denied. Allow the camera in your browser settings, or type the ticket number.");
        }
        if (err && err.name === "NotFoundError") throw new Error("No camera was found on this device.");
        throw new Error("The camera could not be started. Type the ticket number instead.");
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      try { await video.play(); } catch (e) { /* autoplay quirks */ }

      detector = null;
      if ("BarcodeDetector" in window) {
        try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; }
      }
      if (!detector) await ensureJsQr();
      canvas = document.createElement("canvas");
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      active = true;
      loop();
    }

    // Reads a QR code from a photo (works even when live camera is blocked).
    async function decodeFile(file) {
      await ensureJsQr();
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * scale));
      c.height = Math.max(1, Math.round(bmp.height * scale));
      const cx = c.getContext("2d", { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0, c.width, c.height);
      const img = cx.getImageData(0, 0, c.width, c.height);
      const res = window.jsQR(img.data, c.width, c.height);
      return res && res.data ? res.data : null;
    }

    return { start: start, stop: stop, decodeFile: decodeFile, isRunning: function () { return active; } };
  })();

  // Pulls a ticket number out of whatever the QR contained.
  function extractTicketCode(raw) {
    const text = String(raw || "").trim().toUpperCase();
    const m = text.match(/TKT-[A-Z0-9]+-[A-Z0-9]+/);
    if (m) return m[0];
    return text.split(/\s+/)[0] || "";
  }

  Router.register("scan-ticket", {
    title: "Scan ticket",
    subtitle: "Scan the passenger's QR code or type the ticket number.",
    render: async function (container) {
      QrScanner.stop();
      container.innerHTML =
        '<section class="card"><div class="card__header"><h3 class="card__title">Check a ticket</h3></div>' +
        '<div class="card__body">' +
          '<div class="scan-actions">' +
            '<button type="button" class="button button--primary" id="scan-start-button">📷 Scan QR code</button>' +
            '<button type="button" class="button button--ghost is-hidden" id="scan-stop-button">Stop camera</button>' +
            '<label class="button button--ghost" for="scan-photo-input">🖼️ Scan from photo</label>' +
            '<input type="file" id="scan-photo-input" accept="image/*" capture="environment" class="is-hidden" />' +
          '</div>' +
          '<div class="scan-viewport is-hidden" id="scan-viewport">' +
            '<video id="scan-video" muted playsinline></video><div class="scan-viewport__frame" aria-hidden="true"></div>' +
          '</div>' +
          '<p class="field__hint" id="scan-hint" role="status"></p>' +
          '<p class="scan-divider">Or type the ticket number</p>' +
          '<div class="field"><label for="ticket-code-input">Ticket number</label>' +
            '<input type="text" id="ticket-code-input" placeholder="TKT-XXXX-XXXX" autocomplete="off" autocapitalize="characters" /></div>' +
          '<button type="button" class="button button--secondary" id="validate-ticket-button">Check ticket</button>' +
        '</div></section><div id="scan-result" aria-live="polite"></div>';

      const startBtn = document.getElementById("scan-start-button");
      const stopBtn = document.getElementById("scan-stop-button");
      const viewport = document.getElementById("scan-viewport");
      const videoEl = document.getElementById("scan-video");
      const hint = document.getElementById("scan-hint");
      const input = document.getElementById("ticket-code-input");
      const checkBtn = document.getElementById("validate-ticket-button");
      const photoInput = document.getElementById("scan-photo-input");
      const resultEl = document.getElementById("scan-result");
      let busy = false;

      function cameraUi(on) {
        viewport.classList.toggle("is-hidden", !on);
        stopBtn.classList.toggle("is-hidden", !on);
        startBtn.classList.toggle("is-hidden", on);
      }

      function stopCamera() { QrScanner.stop(); cameraUi(false); }

      async function startCamera() {
        resultEl.innerHTML = "";
        hint.textContent = "Starting camera…";
        try {
          cameraUi(true);
          await QrScanner.start(videoEl, handleCode);
          hint.textContent = "Point the camera at the passenger's QR code.";
        } catch (err) {
          cameraUi(false);
          hint.textContent = "";
          Toast.warning("Camera unavailable", err.message);
        }
      }

      function resultCard(type, icon, title, message, extra) {
        return scannerResult(type, icon, title, message) + (extra || "");
      }

      async function check(code, confirm) {
        if (busy) return;
        busy = true;
        renderLoading(resultEl, confirm ? "Confirming boarding…" : "Checking ticket…");
        try {
          const res = await callRpc("tc_validate_ticket", { p_code: code, p_confirm: !!confirm });
          if (navigator.vibrate) navigator.vibrate(res.result === "valid" || res.result === "boarded" ? 60 : [80, 60, 80]);
          showResult(res, code);
        } catch (err) {
          resultEl.innerHTML = scannerResult("invalid", "✕", "Could not check ticket", err.message);
        } finally { busy = false; }
      }

      function showResult(res, code) {
        const again = '<button type="button" class="button button--ghost" id="scan-next-button">Scan next ticket</button>';
        const details =
          '<dl class="detail-list scan-details">' +
            '<div><dt>Passenger</dt><dd>' + escapeHtml(res.passenger || "—") + '</dd></div>' +
            '<div><dt>Seat</dt><dd>' + escapeHtml(res.seat || "—") + '</dd></div>' +
            '<div><dt>Route</dt><dd>' + escapeHtml(res.route || "—") + '</dd></div>' +
            '<div><dt>Trip</dt><dd>' + escapeHtml(res.trip_code || "—") + '</dd></div>' +
          '</dl>';

        if (res.result === "valid") {
          resultEl.innerHTML = '<div class="scanner-result scanner-result--valid">' +
            '<span class="scanner-result__icon" aria-hidden="true">✓</span>' +
            '<p class="scanner-result__title">Valid ticket</p>' + details +
            '<div class="scan-result-actions">' +
              '<button type="button" class="button button--primary" id="scan-confirm-button">Confirm boarding</button>' +
              again + '</div></div>';
          document.getElementById("scan-confirm-button").addEventListener("click", function () { check(code, true); });
        } else if (res.result === "boarded") {
          resultEl.innerHTML = '<div class="scanner-result scanner-result--valid">' +
            '<span class="scanner-result__icon" aria-hidden="true">✓</span>' +
            '<p class="scanner-result__title">Boarded</p>' + details +
            '<div class="scan-result-actions">' + again + '</div></div>';
        } else if (res.result === "used") {
          resultEl.innerHTML = '<div class="scanner-result scanner-result--used">' +
            '<span class="scanner-result__icon" aria-hidden="true">⚠</span>' +
            '<p class="scanner-result__title">Ticket already used</p>' +
            '<p class="scanner-result__message">' + escapeHtml(res.used_at ? "Scanned on " + formatDateTime(res.used_at) + "." : (res.message || "")) + '</p>' +
            '<div class="scan-result-actions">' + again + '</div></div>';
        } else {
          const titles = { wrong_trip: "Not for this trip", cancelled: "Ticket cancelled", trip_ended: "Trip has ended", invalid: "Invalid ticket" };
          resultEl.innerHTML = '<div class="scanner-result scanner-result--invalid">' +
            '<span class="scanner-result__icon" aria-hidden="true">✕</span>' +
            '<p class="scanner-result__title">' + escapeHtml(titles[res.result] || "Invalid ticket") + '</p>' +
            '<p class="scanner-result__message">' + escapeHtml(res.message || "") + '</p>' +
            '<div class="scan-result-actions">' + again + '</div></div>';
        }
        const next = document.getElementById("scan-next-button");
        if (next) next.addEventListener("click", function () {
          resultEl.innerHTML = ""; input.value = "";
          if (QrScanner.isRunning()) return;
          if (!viewport.classList.contains("is-hidden")) startCamera();
        });
      }

      function handleCode(raw) {
        const code = extractTicketCode(raw);
        if (!code) { Toast.warning("Unreadable code", "That QR code is not a TransitCare ticket."); return; }
        input.value = code;
        hint.textContent = "";
        check(code, false);
      }

      startBtn.addEventListener("click", startCamera);
      stopBtn.addEventListener("click", stopCamera);
      checkBtn.addEventListener("click", function () {
        const code = extractTicketCode(input.value);
        if (!code) { Toast.warning("Enter a ticket number"); return; }
        stopCamera();
        check(code, false);
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); checkBtn.click(); }
      });
      photoInput.addEventListener("change", async function () {
        const file = photoInput.files && photoInput.files[0];
        photoInput.value = "";
        if (!file) return;
        hint.textContent = "Reading photo…";
        try {
          const text = await QrScanner.decodeFile(file);
          hint.textContent = "";
          if (!text) { Toast.warning("No QR code found", "Try a clearer photo, or type the ticket number."); return; }
          stopCamera();
          handleCode(text);
        } catch (err) {
          hint.textContent = "";
          Toast.error("Could not read photo", err.message);
        }
      });
    }
  });


  /* =======================================================================
     29. DRIVER: BOARDING + CANCEL TRIP
     ======================================================================= */
  async function openBoarding(trip) {
    Loader.show("Opening boarding…");
    try {
      const { error } = await supabase.from("trips").update({ status: "boarding" }).eq("id", trip.id);
      if (error) throw error;
      await Data.logAudit("boarding_opened", "trip", trip.id, null);

      const { data: bookings } = await supabase.from("bookings").select("passenger_id")
        .eq("trip_id", trip.id).eq("status", "reserved");
      const rows = (bookings || []).filter(function (b) { return b.passenger_id; }).map(function (b) {
        return {
          recipient_id: b.passenger_id,
          title: "Boarding now",
          message: "Bus " + (trip.trip_code || "") + " is now boarding. Show your ticket QR code to the driver.",
          type: "boarding_open", related_entity: trip.id, is_read: false
        };
      });
      if (rows.length) {
        const ins = await supabase.from("notifications").insert(rows);
        if (ins.error) console.warn("[TransitCare] Boarding notifications failed:", ins.error.message);
      }
      Toast.success("Boarding is open", "Scan passengers' tickets as they get on.");
      Router.go("active-trip");
    } catch (err) { Toast.error("Unable to open boarding", err.message); }
    finally { Loader.hide(); }
  }

  // Shared by drivers (their trip) and operators (their fleet's trips).
  function openCancelTripModal(trip, onDone) {
    Modal.open({
      title: "Cancel trip " + (trip.trip_code || ""),
      body:
        '<p class="text-muted mb-4">Passengers who booked this trip will be notified and their tickets cancelled. This cannot be undone.</p>' +
        '<div class="field"><label for="cancel-reason">Reason (optional)</label>' +
        '<input type="text" id="cancel-reason" maxlength="120" placeholder="e.g. Vehicle breakdown" /></div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Keep trip</button>' +
        '<button type="button" class="button button--danger" data-modal-action="confirm">Cancel trip</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const reasonEl = document.getElementById("cancel-reason");
        const reason = reasonEl ? reasonEl.value.trim() : "";
        Loader.show("Cancelling trip…");
        try {
          const res = await callRpc("tc_cancel_trip", { p_trip_id: trip.id, p_reason: reason || null });
          Modal.close();
          Toast.success("Trip cancelled", (res && res.passengers_notified ? res.passengers_notified + " passenger(s) notified." : "No passengers had booked."));
          if (typeof onDone === "function") onDone();
        } catch (err) { Toast.error("Unable to cancel trip", err.message); }
        finally { Loader.hide(); }
      }
    });
  }


  /* =======================================================================
     30. TRIP SHARING (passenger → friend)
     ======================================================================= */
  function buildShareUrl(code) {
    return window.location.origin + window.location.pathname + "?track=" + encodeURIComponent(code);
  }

  async function openShareTripModal(trip) {
    Loader.show("Creating your link…");
    let code;
    try {
      code = await callRpc("tc_create_trip_share", { p_trip_id: trip.id });
    } catch (err) {
      Toast.error("Unable to share trip", err.message);
      return;
    } finally { Loader.hide(); }

    const route = trip.routes ? (trip.routes.origin + " → " + trip.routes.destination) : "my bus";
    const url = buildShareUrl(code);
    const text = "Follow my bus (" + route + ") live on Eko TransitCare: " + url;
    const canNativeShare = typeof navigator.share === "function";

    Modal.open({
      title: "Share your trip",
      body:
        '<p class="text-muted mb-4">Anyone with this link can watch your bus on a map, without signing in. ' +
        'They cannot see your name, seat or ticket. The link stops working when the trip ends or after 24 hours.</p>' +
        '<div class="field"><label for="share-link-input">Tracking link</label>' +
        '<input type="text" id="share-link-input" class="share-link" readonly value="' + escapeHtml(url) + '" /></div>' +
        '<div class="share-actions">' +
          '<button type="button" class="button button--primary button--small" id="share-copy-button">Copy link</button>' +
          '<a class="button button--secondary button--small" id="share-whatsapp-link" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent(text) + '">Send on WhatsApp</a>' +
          (canNativeShare ? '<button type="button" class="button button--secondary button--small" id="share-native-button">More…</button>' : "") +
        '</div>',
      footer:
        '<button type="button" class="button button--danger" data-modal-action="stop">Stop sharing</button>' +
        '<button type="button" class="button button--ghost" data-modal-action="close">Done</button>',
      onAction: async function (action) {
        if (action === "close") { Modal.close(); return; }
        Loader.show("Stopping…");
        try {
          await callRpc("tc_revoke_trip_share", { p_trip_id: trip.id });
          Modal.close();
          Toast.success("Sharing stopped", "The old link no longer works.");
        } catch (err) { Toast.error("Unable to stop sharing", err.message); }
        finally { Loader.hide(); }
      }
    });

    const copyBtn = document.getElementById("share-copy-button");
    if (copyBtn) copyBtn.addEventListener("click", async function () {
      const input = document.getElementById("share-link-input");
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
        else { input.focus(); input.select(); document.execCommand("copy"); }
        Toast.success("Link copied");
      } catch (e) { if (input) { input.focus(); input.select(); } Toast.info("Press Ctrl+C to copy the selected link"); }
    });
    const nativeBtn = document.getElementById("share-native-button");
    if (nativeBtn) nativeBtn.addEventListener("click", function () {
      navigator.share({ title: "Follow my bus", text: "Follow my bus (" + route + ") live:", url: url }).catch(function () { /* cancelled */ });
    });
  }


  /* =======================================================================
     31. PUBLIC TRACKER (friend opens ?track=CODE — no login)
     ======================================================================= */
  const PublicTrack = (function () {
    let map = null, marker = null, timer = null, code = null, stopped = false, hasData = false;
    const STATUS_TEXT = {
      scheduled: "Not departed yet", boarding: "Boarding", in_transit: "On the way",
      completed: "Arrived", cancelled: "Cancelled"
    };

    function el(id) { return document.getElementById(id); }
    function setNote(text) { const n = el("public-track-note"); if (n) n.textContent = text || ""; }

    function unavailable(message) {
      stopPolling();
      setText("public-track-title", "Link unavailable");
      setText("public-track-sub", "");
      setNote(message);
      const mapEl = el("public-track-map");
      if (mapEl) mapEl.style.display = "none";
      const details = el("public-track-details");
      if (details) details.innerHTML = "";
      const badge = el("public-track-status");
      if (badge) { badge.className = "badge badge--cancelled"; badge.textContent = "Unavailable"; }
    }

    function stopPolling() {
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
    }

    async function ensureMap() {
      if (map) return true;
      const mapEl = el("public-track-map");
      if (!mapEl) return false;
      try {
        await loadStylesheet(CDN.LEAFLET_CSS);
        await loadExternalScript(CDN.LEAFLET_JS);
        if (!window.L) throw new Error("Map library unavailable.");
        mapEl.innerHTML = "";
        const c = TRANSITCARE_CONFIG.DEFAULT_MAP_CENTER;
        map = window.L.map(mapEl).setView([c.lat, c.lng], TRANSITCARE_CONFIG.DEFAULT_MAP_ZOOM);
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors", maxZoom: 19
        }).addTo(map);
        return true;
      } catch (err) {
        mapEl.innerHTML = '<div class="map-placeholder"><span class="map-placeholder__icon">🗺️</span>Map unavailable right now.</div>';
        return false;
      }
    }

    function overlay(label, value, stale) {
      const mapEl = el("public-track-map");
      if (!mapEl) return;
      const html = '<div class="map-overlay' + (stale ? " map-overlay--stale" : "") + '">' +
        '<span class="map-overlay__label">' + escapeHtml(label) + '</span>' +
        '<span class="map-overlay__value">' + escapeHtml(value) + '</span></div>';
      const old = mapEl.querySelector(".map-overlay");
      if (old) old.outerHTML = html; else mapEl.insertAdjacentHTML("beforeend", html);
    }

    async function render(info) {
      hasData = true;
      setText("public-track-title", (info.origin || "?") + " → " + (info.destination || "?"));
      setText("public-track-sub",
        "Trip " + (info.trip_code || "—") + (info.vehicle ? " · " + info.vehicle : "") +
        (info.driver_first_name ? " · Driver " + info.driver_first_name : ""));
      const badge = el("public-track-status");
      if (badge) { badge.className = "badge badge--" + (info.status || "scheduled"); badge.textContent = STATUS_TEXT[info.status] || humanizeStatus(info.status); }

      const rows = [["Planned departure", formatDateTime(info.planned_departure)]];
      if (info.actual_departure) rows.push(["Departed", formatDateTime(info.actual_departure)]);
      if (info.actual_arrival) rows.push(["Arrived", formatDateTime(info.actual_arrival)]);
      rows.push(["Link valid until", formatDateTime(info.expires_at)]);
      el("public-track-details").innerHTML = rows.map(function (r) {
        return '<div><dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd></div>';
      }).join("");

      const ended = info.status === "completed" || info.status === "cancelled";
      const mapOk = await ensureMap();

      if (info.location && mapOk && window.L) {
        const lat = Number(info.location.lat), lng = Number(info.location.lng);
        if (isFinite(lat) && isFinite(lng)) {
          if (!marker) { marker = window.L.marker([lat, lng]).addTo(map); map.setView([lat, lng], 15); }
          else { marker.setLatLng([lat, lng]); map.panTo([lat, lng]); }
          const stale = Date.now() - new Date(info.location.recorded_at).getTime() > TRANSITCARE_CONFIG.GPS_STALE_THRESHOLD_MS;
          overlay(stale ? "Location may be out of date" : "Live location", "Last updated " + formatRelativeTime(info.location.recorded_at), stale);
        }
      } else if (mapOk) {
        overlay("Waiting for location", info.status === "in_transit" || info.status === "boarding"
          ? "The bus has not shared its position yet." : "Location appears once the trip starts.", false);
      }

      if (info.status === "completed") setNote("This trip has arrived. Thanks for following along.");
      else if (info.status === "cancelled") setNote("This trip was cancelled.");
      else if (info.status === "in_transit") setNote("The bus is on its way.");
      else if (info.status === "boarding") setNote("Passengers are boarding.");
      else setNote("The bus has not left yet.");

      if (ended) stopPolling();
    }

    async function refresh() {
      if (stopped) return;
      try {
        const info = await callRpc("tc_get_trip_share", { p_code: code });
        if (!info) { unavailable("This link has expired or the sender stopped sharing."); return; }
        await render(info);
      } catch (err) {
        if (err && err.code === "RPC_MISSING") { unavailable("Trip sharing is not set up yet."); return; }
        if (hasData) setNote("Reconnecting…");
        else unavailable("We could not load this trip. Check your connection and try again.");
      }
    }

    function start(shareCode) {
      document.documentElement.classList.add("is-public-track");
      const meta = document.createElement("meta");
      meta.name = "robots"; meta.content = "noindex,nofollow";
      document.head.appendChild(meta);
      const root = el("public-track");
      if (root) root.classList.remove("is-hidden");
      document.body.style.overflow = "";

      if (!/^[a-f0-9]{64}$/i.test(shareCode || "")) { unavailable("This tracking link is not valid."); return; }
      if (!supabase) { unavailable("Tracking is not available right now."); return; }
      code = shareCode;
      refresh();
      timer = setInterval(function () { if (!document.hidden) refresh(); }, 8000);
      document.addEventListener("visibilitychange", function () { if (!document.hidden && !stopped) refresh(); });
    }

    return { start: start };
  })();


  /* =======================================================================
     32. EMAIL VERIFICATION BY 6-DIGIT CODE
     ======================================================================= */
  const EmailOtp = { email: null, expiresAt: 0, resendAt: 0, timer: null, wrong: 0, lockedUntil: 0 };

  function stopEmailOtpTimer() {
    if (EmailOtp.timer) { clearInterval(EmailOtp.timer); EmailOtp.timer = null; }
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  function otpTick() {
    const now = Date.now();
    const timerEl = document.getElementById("otp-timer");
    const submit = document.getElementById("otp-submit");
    const resend = document.getElementById("otp-resend");
    const expired = now >= EmailOtp.expiresAt;
    const locked = now < EmailOtp.lockedUntil;

    if (timerEl) {
      if (expired) timerEl.textContent = "This code has expired. Tap Resend code to get a new one.";
      else if (locked) timerEl.textContent = "Too many wrong attempts. Try again in " + formatCountdown(EmailOtp.lockedUntil - now) + ".";
      else timerEl.textContent = "Code expires in " + formatCountdown(EmailOtp.expiresAt - now);
    }
    if (submit && !submit.dataset.busy) submit.disabled = expired || locked;
    if (resend && !resend.dataset.busy) {
      const left = Math.ceil((EmailOtp.resendAt - now) / 1000);
      if (left > 0) { resend.disabled = true; resend.textContent = "Resend code in " + left + "s"; }
      else { resend.disabled = false; resend.textContent = "Resend code"; }
    }
  }

  function startOtpClocks() {
    EmailOtp.expiresAt = Date.now() + TRANSITCARE_CONFIG.EMAIL_OTP_EXPIRY_SECONDS * 1000;
    EmailOtp.resendAt = Date.now() + TRANSITCARE_CONFIG.OTP_RESEND_SECONDS * 1000;
    EmailOtp.wrong = 0;
    EmailOtp.lockedUntil = 0;
    stopEmailOtpTimer();
    otpTick();
    EmailOtp.timer = setInterval(otpTick, 1000);
  }

  function openEmailOtp(email) {
    EmailOtp.email = email;
    if (typeof AppState.showAuthForm === "function") AppState.showAuthForm("otp");
    const subtitle = document.getElementById("otp-subtitle");
    if (subtitle) subtitle.innerHTML = "We emailed <strong>" + escapeHtml(email) + "</strong> a <strong>confirmation email with a 6-digit code</strong>. Enter the code to activate your account.";
    const input = document.getElementById("otp-code");
    if (input) { input.value = ""; setTimeout(function () { input.focus(); }, 50); }
    const form = document.getElementById("otp-form");
    if (form) clearFormErrors(form);
    startOtpClocks();
  }

  // Kept under its old name: called after sign-up.
  function showVerificationNotice(email) { openEmailOtp(email); }

  function bindEmailOtpForm() {
    const form = document.getElementById("otp-form");
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "true";
    const input = document.getElementById("otp-code");
    const submit = document.getElementById("otp-submit");
    const resend = document.getElementById("otp-resend");

    input.addEventListener("input", function () {
      input.value = input.value.replace(/\D/g, "").slice(0, 6);
      if (input.value.length === 6 && !submit.disabled) form.requestSubmit ? form.requestSubmit() : submit.click();
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearFormErrors(form);
      setFormMessage("auth-message", null, "");
      if (Date.now() >= EmailOtp.expiresAt) { setFieldError("otp-code", "This code has expired. Request a new one."); return; }
      if (Date.now() < EmailOtp.lockedUntil) return;
      const token = input.value.replace(/\D/g, "");
      if (token.length !== 6) { setFieldError("otp-code", "Enter the 6-digit code from your email."); return; }

      submit.dataset.busy = "1"; submit.disabled = true;
      submit.innerHTML = '<span class="button__spinner"></span> Verifying…';
      try {
        await Auth.verifyEmailOtp(EmailOtp.email, token);
        stopEmailOtpTimer();
        setFormMessage("auth-message", "success", "Email verified. Signing you in…");
      } catch (err) {
        const msg = (err && err.message) || "";
        EmailOtp.wrong += 1;
        // Supabase answers "Token has expired or is invalid" for BOTH a wrong and an expired
        // code, so only say "expired" when our own countdown has really run out.
        if (/rate|too many|security purposes/i.test(msg)) setFieldError("otp-code", "Too many attempts. Please wait a moment and try again.");
        else if (Date.now() >= EmailOtp.expiresAt) setFieldError("otp-code", "This code has expired. Tap Resend code.");
        else setFieldError("otp-code", "That code is incorrect, or it has just expired. Check the latest email, or tap Resend code.");
        if (EmailOtp.wrong >= 5) { EmailOtp.lockedUntil = Date.now() + 30000; EmailOtp.wrong = 0; }
        input.value = ""; input.focus();
      } finally {
        delete submit.dataset.busy;
        submit.textContent = "Verify and continue";
        otpTick();
      }
    });

    resend.addEventListener("click", async function () {
      resend.dataset.busy = "1"; resend.disabled = true;
      resend.textContent = "Sending…";
      try {
        await Auth.resendVerification(EmailOtp.email);
        Toast.success("New code sent", "Check your inbox (and spam folder).");
        startOtpClocks();
      } catch (err) {
        const msg = (err && err.message) || "";
        Toast.error("Unable to resend", /rate|too many|security purposes/i.test(msg) ? "Please wait a minute before asking for another code." : (msg || "Please try again later."));
      } finally { delete resend.dataset.busy; otpTick(); }
    });

    document.getElementById("otp-signin").addEventListener("click", function () {
      stopEmailOtpTimer();
      clearFormErrors(form);
      if (typeof AppState.showAuthForm === "function") AppState.showAuthForm("signin");
      const em = document.getElementById("signin-email");
      if (em && EmailOtp.email) em.value = EmailOtp.email;
      setFormMessage("auth-message", "info", "Enter your password to sign in. If it says your email is not verified, ask an administrator to verify it.");
    });

    document.getElementById("otp-change").addEventListener("click", function () {
      stopEmailOtpTimer();
      clearFormErrors(form);
      if (typeof AppState.showAuthForm === "function") AppState.showAuthForm("signup");
    });
  }


  /* =======================================================================
     33. GOOGLE SIGN-IN
     ======================================================================= */
  async function startGoogleSignIn(button) {
    if (!TRANSITCARE_CONFIG.GOOGLE_AUTH_ENABLED) {
      setFormMessage("auth-message", "info", "Google sign-in is not available yet. Please use email.");
      return;
    }
    const original = button ? button.innerHTML : "";
    if (button) { button.disabled = true; button.innerHTML = '<span class="button__spinner"></span> Opening Google…'; }
    setFormMessage("auth-message", null, "");
    try {
      await Auth.signInWithGoogle();
      // The browser is now leaving for Google; keep the button disabled.
    } catch (err) {
      if (button) { button.disabled = false; button.innerHTML = original; }
      setFormMessage("auth-message", "danger", err.code === "GOOGLE_DISABLED"
        ? "Google sign-in is not available yet. The site owner still needs to finish setting it up. Please sign up or sign in with your email for now."
        : (err.message || "Google sign-in could not be started."));
    }
  }

  // After Google (or any redirect login) sends the browser back with an error.
  function readAuthRedirectError() {
    const params = new URLSearchParams(
      (window.location.hash || "").replace(/^#/, "") + "&" + (window.location.search || "").replace(/^\?/, ""));
    const error = params.get("error"), errorCode = params.get("error_code"), description = params.get("error_description");
    if (!error && !errorCode) return null;
    try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* ignore */ }
    if (error === "access_denied" || /cancel|denied/i.test(description || "")) {
      return "Google sign-in was cancelled. You can try again or continue with email.";
    }
    return (description ? description.replace(/\+/g, " ") : "") || "Sign-in failed. Please try again.";
  }

  // Only trust a Google identity whose email Google itself has verified.
  function hasUnverifiedGoogleIdentity(user) {
    const identities = (user && user.identities) || [];
    return identities.some(function (i) {
      // Strict: a Google identity counts only when Google says the email is verified.
      return i.provider === "google" && !(i.identity_data && i.identity_data.email_verified === true);
    });
  }


  /* =======================================================================
     34. ADMIN: DELETE USER ACCOUNTS
     ======================================================================= */
  function openDeleteUserModal(user, onDone, options) {
    const rpcName = (options && options.rpc) || "tc_admin_delete_user";
    const role = user.role || "user";
    const consequences = {
      admin: "They lose all access immediately. Things they created stay in the system without their name.",
      passenger: "Their tickets and seats on upcoming trips are removed. Past trips stay in the operator's records without their name.",
      driver: "Upcoming trips are cancelled and booked passengers are notified. Past trips are kept without a driver name.",
      operator: "Only this login is removed. The company record, vehicles and trips are kept."
    };
    const label = user.full_name || user.email || user.phone || "this account";

    Modal.open({
      title: "Delete " + role + " account",
      body:
        '<div class="delete-warning">This permanently deletes <strong>' + escapeHtml(label) + '</strong> and their sign-in. It cannot be undone.</div>' +
        '<p class="text-muted mb-4">' + escapeHtml(consequences[role] || "Their sign-in and personal records are removed.") + '</p>' +
        '<div class="field"><label for="delete-confirm-input">Type <strong>DELETE</strong> to confirm</label>' +
        '<input type="text" id="delete-confirm-input" autocomplete="off" autocapitalize="characters" /></div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--danger" data-modal-action="delete" id="delete-user-confirm" disabled>Delete account</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const typed = document.getElementById("delete-confirm-input");
        if (!typed || typed.value.trim().toUpperCase() !== "DELETE") return;
        Loader.show("Deleting account…");
        try {
          await callRpc(rpcName, rpcName === "tc_admin_delete_admin" ? { p_id: user.id } : { p_user_id: user.id });
          Modal.close();
          Toast.success("Account deleted", label + " was removed.");
          if (typeof onDone === "function") onDone();
        } catch (err) { Toast.error("Unable to delete account", err.message); }
        finally { Loader.hide(); }
      }
    });

    const typed = document.getElementById("delete-confirm-input");
    const confirmBtn = document.getElementById("delete-user-confirm");
    if (typed && confirmBtn) {
      typed.addEventListener("input", function () {
        confirmBtn.disabled = typed.value.trim().toUpperCase() !== "DELETE";
      });
    }
  }

  Router.register("admin-users", {
    title: "Users",
    subtitle: "All accounts. Add users, verify emails that did not arrive, or delete passenger, driver and operator accounts.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-user-button">+ Add user</button>',
    render: async function (container) {
      container.innerHTML =
        '<div class="toolbar">' +
          '<div class="field"><label for="users-search">Search</label>' +
            '<input type="search" id="users-search" placeholder="Name, email or phone" autocomplete="off" /></div>' +
          '<div class="field"><label for="users-role-filter">Role</label>' +
            '<select id="users-role-filter"><option value="">All roles</option><option value="passenger">Passengers</option>' +
            '<option value="driver">Drivers</option><option value="operator">Operators</option><option value="admin">Admins</option></select></div>' +
        '</div>' +
        '<div class="card"><div class="card__body card__body--flush" id="users-list"></div></div>';
      const list = document.getElementById("users-list");
      renderLoading(list, "Loading users…");

      let users = [], hasVerifyInfo = true;
      try {
        try {
          users = (await callRpc("tc_admin_list_users")) || [];
        } catch (err) {
          if (!isRpcMissing(err)) throw err;
          hasVerifyInfo = false;   // database update 005 not run yet: plain list, no verify column
          const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
          if (error) throw error;
          users = data || [];
        }
      } catch (err) { renderError(list, err.message); return; }
      const addUserBtn = document.getElementById("add-user-button");
      if (addUserBtn) addUserBtn.addEventListener("click", function () { openAddUserModal(function () { Router.go("admin-users"); }); });

      const me = AppState.authUser ? AppState.authUser.id : null;

      function draw() {
        const q = document.getElementById("users-search").value.trim().toLowerCase();
        const role = document.getElementById("users-role-filter").value;
        const rows = users.filter(function (u) {
          if (role && u.role !== role) return false;
          if (!q) return true;
          return [u.full_name, u.email, u.phone].some(function (v) { return String(v || "").toLowerCase().indexOf(q) !== -1; });
        });
        if (!rows.length) {
          renderEmpty(list, { icon: "👥", title: "No users found", message: users.length ? "Try a different search or filter." : "No accounts registered yet." });
          return;
        }
        list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Name</th><th>Email / phone</th><th>Role</th><th>Status</th>' + (hasVerifyInfo ? '<th>Email</th>' : '') + '<th></th></tr></thead><tbody>' +
          rows.map(function (u) {
            const canDelete = u.role !== "admin" && u.id !== me;
            const needsVerify = hasVerifyInfo && u.email && !u.email_confirmed_at;
            const verifyCell = hasVerifyInfo
              ? '<td>' + (!u.email ? '<span class="text-muted text-small">—</span>'
                  : (needsVerify ? '<span class="badge badge--pending">Not verified</span>' : '<span class="badge badge--active">Verified</span>')) + '</td>'
              : '';
            return '<tr><td>' + escapeHtml(u.full_name || "—") + '</td>' +
              '<td>' + escapeHtml(u.email || u.phone || "—") + '</td>' +
              '<td><span class="badge">' + escapeHtml(humanizeStatus(u.role || "—")) + '</span></td>' +
              '<td><span class="badge badge--' + escapeHtml(u.status || "active") + '">' + escapeHtml(humanizeStatus(u.status || "active")) + '</span></td>' + verifyCell +
              '<td class="list__actions">' + (needsVerify
                ? '<button type="button" class="button button--small button--primary" data-verify-user="' + escapeHtml(u.id) + '">Verify</button> ' : '') + (canDelete
                ? '<button type="button" class="button button--small button--danger" data-delete-user="' + escapeHtml(u.id) + '">Delete</button>'
                : '<span class="text-muted text-small">' + (u.id === me ? "You" : (u.role === "admin" ? "See Administrators" : "Protected")) + '</span>') + '</td></tr>';
          }).join("") + '</tbody></table></div>';
        list.querySelectorAll("[data-verify-user]").forEach(function (btn) {
          btn.addEventListener("click", async function () {
            const user = users.find(function (x) { return x.id === btn.getAttribute("data-verify-user"); });
            if (!user) return;
            btn.disabled = true;
            Loader.show("Verifying…");
            try {
              await callRpc("tc_admin_verify_user", { p_user_id: user.id });
              user.email_confirmed_at = new Date().toISOString();
              Toast.success("Account verified", (user.full_name || user.email) + " can sign in now.");
              draw();
            } catch (err) { btn.disabled = false; Toast.error("Unable to verify", err.message); }
            finally { Loader.hide(); }
          });
        });
        list.querySelectorAll("[data-delete-user]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const user = users.find(function (x) { return x.id === btn.getAttribute("data-delete-user"); });
            if (user) openDeleteUserModal(user, function () { Router.go("admin-users"); });
          });
        });
      }

      document.getElementById("users-search").addEventListener("input", draw);
      document.getElementById("users-role-filter").addEventListener("change", draw);
      draw();
    }
  });

  /* ---------- Admin: create a passenger / driver / operator account that works at once ---------- */
  function generatePassword() {
    const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", digits = "23456789";
    const pick = function (set) {
      const buf = new Uint32Array(1);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      return set.charAt(buf[0] % set.length);
    };
    let out = "";
    for (let i = 0; i < 8; i++) out += pick(letters);
    for (let i = 0; i < 3; i++) out += pick(digits);
    return out;
  }

  async function createUserAsAdmin(f) {
    // 1) Preferred: the admin-create-user Edge Function (instant, no email involved).
    let edgeFailed = false;
    try {
      const res = await supabase.functions.invoke("admin-create-user", { body: f });
      if (!res.error && res.data && res.data.ok) return res.data;
      const data = res.data || (res.error && res.error.context && typeof res.error.context.json === "function"
        ? await res.error.context.json().catch(function () { return null; }) : null);
      if (data && data.error) throw new Error(data.error);
      edgeFailed = true;
    } catch (err) {
      if (err && !/Failed to send|not found|404|FunctionsFetchError|FunctionsRelayError|fetch/i.test(String(err.message || err.name))) throw err;
      edgeFailed = true;
    }
    // 2) Fallback (function not deployed yet): sign the person up on a throw-away client, then verify them.
    if (!edgeFailed) throw new Error("Could not create the account.");
    const temp = window.supabase.createClient(TRANSITCARE_CONFIG.SUPABASE_URL, TRANSITCARE_CONFIG.SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "tc-admin-temp" } });
    const su = await temp.auth.signUp({ email: f.email, password: f.password,
      options: { data: { full_name: f.full_name, phone: f.phone || null, role: f.role } } });
    if (su.error) throw su.error;
    const user = su.data && su.data.user;
    if (!user || !user.id || (user.identities && user.identities.length === 0)) throw new Error("An account with this email already exists.");
    await callRpc("tc_admin_verify_user", { p_user_id: user.id });
    const status = f.role === "driver" ? (f.approve ? "approved" : "email_verified") : "active";
    const up = await supabase.from("profiles").update({ full_name: f.full_name, phone: f.phone || null, role: f.role, status: status }).eq("id", user.id);
    if (up.error) throw up.error;
    return { ok: true, id: user.id, email: f.email, role: f.role, status: status };
  }

  function openAddUserModal(onDone) {
    Modal.open({
      title: "Add user",
      body:
        '<p class="text-muted text-small">The account is ready to use straight away. No email verification is needed.</p>' +
        '<div class="field"><label for="adduser-role">Account type</label><select id="adduser-role">' +
          '<option value="passenger">Passenger</option><option value="driver">Driver</option><option value="operator">Operator</option></select></div>' +
        '<div class="field"><label for="adduser-name">Full name</label><input type="text" id="adduser-name" autocomplete="off" /></div>' +
        '<div class="field"><label for="adduser-email">Email</label><input type="email" id="adduser-email" autocomplete="off" /></div>' +
        '<div class="field"><label for="adduser-phone">Phone (optional)</label><input type="tel" id="adduser-phone" autocomplete="off" /></div>' +
        '<div class="field"><label for="adduser-password">Temporary password</label>' +
          '<div class="input-row"><input type="text" id="adduser-password" autocomplete="off" />' +
          '<button type="button" class="button button--ghost button--small" id="adduser-generate">Generate</button></div>' +
          '<p class="text-muted text-small">At least 8 characters with letters and numbers. Share it with the person.</p></div>' +
        '<label class="checkbox-row" id="adduser-approve-row" hidden><input type="checkbox" id="adduser-approve" checked /> Approve this driver now</label>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="create">Create account</button>',
      onAction: function (action) { return addUserAction(action); }
    });
    async function addUserAction(action) {
        if (action === "cancel" || action === "done") { Modal.close(); if (action === "done" && onDone) onDone(); return; }
        if (action === "copy") {
          const txt = document.getElementById("adduser-result-text");
          try { await navigator.clipboard.writeText(txt.textContent); Toast.success("Copied"); } catch (e) { Toast.info("Select the text and copy it"); }
          return;
        }
        const f = {
          role: document.getElementById("adduser-role").value,
          full_name: document.getElementById("adduser-name").value.trim(),
          email: document.getElementById("adduser-email").value.trim().toLowerCase(),
          phone: document.getElementById("adduser-phone").value.trim(),
          password: document.getElementById("adduser-password").value,
          approve: document.getElementById("adduser-approve").checked
        };
        if (f.full_name.length < 2) { Toast.warning("Enter the full name"); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { Toast.warning("Enter a valid email"); return; }
        if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) {
          Toast.warning("Weak password", "Use at least 8 characters with letters and numbers."); return;
        }
        Loader.show("Creating account…");
        try {
          const out = await createUserAsAdmin(f);
          const body = document.getElementById("modal-body");
          body.innerHTML =
            '<p><strong>Account created.</strong> ' + escapeHtml(f.full_name) + ' can sign in now.</p>' +
            '<pre id="adduser-result-text" class="code-block">Email: ' + escapeHtml(f.email) + '\nPassword: ' + escapeHtml(f.password) +
              '\nRole: ' + escapeHtml(humanizeStatus(out.role || f.role)) + '</pre>' +
            '<p class="text-muted text-small">This password is shown only once. Ask the person to change it after signing in.</p>';
          const footer = document.getElementById("modal-footer");
          footer.innerHTML = '<button type="button" class="button button--ghost" data-modal-action="copy">Copy details</button>' +
            '<button type="button" class="button button--primary" data-modal-action="done">Done</button>';
          footer.querySelectorAll("[data-modal-action]").forEach(function (b) {
            b.addEventListener("click", function () { addUserAction(b.getAttribute("data-modal-action")); });
          });
        } catch (err) { Toast.error("Unable to create account", err.message); }
        finally { Loader.hide(); }
    }
    const role = document.getElementById("adduser-role");
    const row = document.getElementById("adduser-approve-row");
    role.addEventListener("change", function () { row.hidden = role.value !== "driver"; });
    document.getElementById("adduser-generate").addEventListener("click", function () {
      document.getElementById("adduser-password").value = generatePassword();
    });
    document.getElementById("adduser-password").value = generatePassword();
  }

  /* =======================================================================
     34b. ADMIN: MANAGE ADMINISTRATORS (add, view, edit, suspend, demote, delete)
     ======================================================================= */
  Router.register("admin-admins", {
    title: "Administrators",
    subtitle: "People who can manage the whole platform. You can add, edit, suspend, demote or delete administrators.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-admin-button">+ Add admin</button>',
    render: async function (container) {
      container.innerHTML =
        '<div class="alert alert--info"><span>To add an administrator, the person first creates a normal account and verifies it. ' +
        'Then press <strong>+ Add admin</strong> and enter their email or phone number.</span></div>' +
        '<div class="card"><div class="card__body card__body--flush" id="admins-list"></div></div>';
      const list = document.getElementById("admins-list");
      renderLoading(list, "Loading administrators…");

      function reload() { Router.go("admin-admins"); }
      const addBtn = document.getElementById("add-admin-button");
      if (addBtn) addBtn.addEventListener("click", function () { openAddAdminModal(reload); });

      const me = AppState.authUser ? AppState.authUser.id : null;
      let admins = [];
      try { admins = (await callRpc("tc_admin_list_admins")) || []; }
      catch (err) { renderError(list, err.message); return; }

      if (!admins.length) {
        renderEmpty(list, { icon: "🛡️", title: "No administrators", message: "Add the first one with + Add admin." });
        return;
      }

      list.innerHTML = '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Name</th><th>Email / phone</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
        admins.map(function (a) {
          const isSelf = a.id === me;
          return '<tr><td>' + escapeHtml(a.full_name || "—") + (isSelf ? ' <span class="badge badge--active">You</span>' : "") + '</td>' +
            '<td>' + escapeHtml(a.email || a.phone || "—") + '</td>' +
            '<td><span class="badge badge--' + escapeHtml(a.status || "active") + '">' + escapeHtml(humanizeStatus(a.status || "active")) + '</span></td>' +
            '<td>' + escapeHtml(a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : "Never") + '</td>' +
            '<td class="list__actions">' +
              '<button type="button" class="button button--small button--secondary" data-admin-edit="' + escapeHtml(a.id) + '">Edit</button>' +
              (isSelf ? "" :
                '<button type="button" class="button button--small button--ghost" data-admin-demote="' + escapeHtml(a.id) + '">Remove admin access</button>' +
                '<button type="button" class="button button--small button--danger" data-admin-delete="' + escapeHtml(a.id) + '">Delete</button>') +
            '</td></tr>';
        }).join("") + '</tbody></table></div>';

      function find(attr, btn) {
        const id = btn.getAttribute(attr);
        return admins.find(function (x) { return x.id === id; });
      }
      list.querySelectorAll("[data-admin-edit]").forEach(function (btn) {
        btn.addEventListener("click", function () { const a = find("data-admin-edit", btn); if (a) openEditAdminModal(a, a.id === me, reload); });
      });
      list.querySelectorAll("[data-admin-demote]").forEach(function (btn) {
        btn.addEventListener("click", function () { const a = find("data-admin-demote", btn); if (a) openDemoteAdminModal(a, reload); });
      });
      list.querySelectorAll("[data-admin-delete]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const a = find("data-admin-delete", btn);
          if (a) openDeleteUserModal({ id: a.id, role: "admin", full_name: a.full_name, email: a.email, phone: a.phone }, reload, { rpc: "tc_admin_delete_admin" });
        });
      });
    }
  });

  function openAddAdminModal(onDone) {
    Modal.open({
      title: "Add administrator",
      body:
        '<p class="text-muted mb-4">Enter the email address or phone number of an <strong>existing, verified</strong> account. ' +
        'It becomes an administrator straight away. They should sign out and back in to see the admin menu.</p>' +
        '<div class="field"><label for="admin-add-identifier">Email or phone number</label>' +
        '<input type="text" id="admin-add-identifier" autocomplete="off" placeholder="name@example.com or 0803 000 0000" /></div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Make administrator</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const value = document.getElementById("admin-add-identifier").value.trim();
        if (!value) { Toast.warning("Enter an email or phone number"); return; }
        Loader.show("Adding administrator…");
        try {
          const res = await callRpc("tc_admin_promote", { p_identifier: value });
          Modal.close();
          Toast.success("Administrator added", ((res && (res.full_name || res.email)) || "The account") + " is now an administrator.");
          if (typeof onDone === "function") onDone();
        } catch (err) { Toast.error("Unable to add administrator", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  function openEditAdminModal(admin, isSelf, onDone) {
    Modal.open({
      title: "Edit administrator",
      body:
        '<div class="field"><label for="admin-edit-name">Full name</label>' +
          '<input type="text" id="admin-edit-name" value="' + escapeHtml(admin.full_name || "") + '" /></div>' +
        '<div class="field"><label for="admin-edit-phone">Phone number</label>' +
          '<input type="tel" id="admin-edit-phone" value="' + escapeHtml(admin.phone || "") + '" /></div>' +
        '<div class="field"><label for="admin-edit-status">Status</label>' +
          '<select id="admin-edit-status"' + (isSelf ? " disabled" : "") + '>' +
            '<option value="active"' + (admin.status !== "suspended" ? " selected" : "") + '>Active</option>' +
            '<option value="suspended"' + (admin.status === "suspended" ? " selected" : "") + '>Suspended (cannot sign in)</option>' +
          '</select>' +
          (isSelf ? '<p class="field__hint">You cannot suspend your own account.</p>'
                  : '<p class="field__hint">A suspended administrator is signed out and loses all access until reactivated.</p>') +
        '</div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save changes</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const name = document.getElementById("admin-edit-name").value.trim();
        if (!name) { Toast.warning("Name required"); return; }
        Loader.show("Saving…");
        try {
          await callRpc("tc_admin_update_admin", {
            p_id: admin.id,
            p_full_name: name,
            p_phone: document.getElementById("admin-edit-phone").value.trim(),
            p_status: document.getElementById("admin-edit-status").value
          });
          if (isSelf && AppState.profile) { AppState.profile.full_name = name; updateHeaderUser(); }
          Modal.close();
          Toast.success("Administrator updated");
          if (typeof onDone === "function") onDone();
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  function openDemoteAdminModal(admin, onDone) {
    Modal.open({
      title: "Remove administrator access",
      body:
        '<p class="text-muted mb-4"><strong>' + escapeHtml(admin.full_name || admin.email || "This person") + '</strong> keeps their account ' +
        'but is no longer an administrator. Choose the role they should have instead.</p>' +
        '<div class="field"><label for="admin-demote-role">New role</label>' +
        '<select id="admin-demote-role"><option value="passenger">Passenger</option>' +
        '<option value="driver">Driver (needs approval again)</option><option value="operator">Operator</option></select></div>',
      footer:
        '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--danger" data-modal-action="save">Remove admin access</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        Loader.show("Updating…");
        try {
          await callRpc("tc_admin_demote", { p_id: admin.id, p_role: document.getElementById("admin-demote-role").value });
          Modal.close();
          Toast.success("Administrator access removed");
          if (typeof onDone === "function") onDone();
        } catch (err) { Toast.error("Unable to update", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  // Admin: link operator logins to operator companies.
  Router.register("admin-operators", {
    title: "Operators",
    subtitle: "Transport companies on the platform and the accounts that manage them.",
    headerActions: '<button type="button" class="button button--primary button--small" id="add-operator">+ Add operator</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="operators-list"></div></div>';
      const list = document.getElementById("operators-list");
      renderLoading(list, "Loading operators…");

      const addBtn = document.getElementById("add-operator");
      if (addBtn) addBtn.addEventListener("click", openAddOperatorModal);

      try {
        const [data, accountsRes] = await Promise.all([
          Data.getOperators(),
          supabase.from("profiles").select("id, full_name, email, operator_id").eq("role", "operator")
        ]);
        const accounts = (accountsRes && accountsRes.data) || [];
        if (!data || data.length === 0) {
          renderEmpty(list, { icon: "🏢", title: "No operators", message: "Add your first transport operator." });
          return;
        }
        list.innerHTML = '<div class="list">' + data.map(function (o) {
          const linked = accounts.filter(function (a) { return a.operator_id === o.id; });
          const who = linked.length
            ? linked.map(function (a) { return escapeHtml(a.full_name || a.email || "Account"); }).join(", ")
            : "No login linked";
          return '<div class="list__item"><div class="list__main">' +
            '<p class="list__title">' + escapeHtml(o.name) + '</p>' +
            '<p class="list__meta">' + escapeHtml(o.contact_name || "") + (o.phone ? ' · ' + escapeHtml(o.phone) : "") + ' · ' + who + '</p></div>' +
            '<div class="list__actions">' +
              '<button type="button" class="button button--small button--secondary" data-link-operator="' + escapeHtml(o.id) + '">Link account</button>' +
              '<span class="badge badge--' + escapeHtml(o.status || "active") + '">' + escapeHtml(humanizeStatus(o.status || "active")) + '</span>' +
            '</div></div>';
        }).join("") + '</div>';

        list.querySelectorAll("[data-link-operator]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const op = data.find(function (x) { return String(x.id) === btn.getAttribute("data-link-operator"); });
            if (op) openLinkOperatorModal(op, accounts);
          });
        });
      } catch (err) { renderError(list, err.message); }
    }
  });

  function openLinkOperatorModal(operator, accounts) {
    if (!accounts.length) { Toast.info("No operator accounts yet", "An operator must register first (Create account → Operator)."); return; }
    const options = accounts.map(function (a) {
      const taken = a.operator_id && String(a.operator_id) !== String(operator.id);
      return '<option value="' + escapeHtml(a.id) + '"' + (String(a.operator_id) === String(operator.id) ? " selected" : "") + '>' +
        escapeHtml((a.full_name || "Operator") + " · " + (a.email || "no email") + (taken ? " (linked to another company)" : "")) + '</option>';
    }).join("");
    Modal.open({
      title: "Link account to " + operator.name,
      body: '<p class="text-muted mb-4">The chosen operator login will manage this company\'s vehicles, drivers and trips.</p>' +
        '<div class="field"><label for="link-operator-select">Operator account</label><select id="link-operator-select">' + options + '</select></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Link account</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const id = document.getElementById("link-operator-select").value;
        Loader.show("Linking…");
        try {
          const { error } = await supabase.from("profiles").update({ operator_id: operator.id }).eq("id", id);
          if (error) throw error;
          await Data.logAudit("operator_linked", "operator", operator.id, { profile_id: id });
          Modal.close();
          Toast.success("Account linked");
          Router.go("admin-operators");
        } catch (err) { Toast.error("Unable to link account", err.message); }
        finally { Loader.hide(); }
      }
    });
  }


  /* =======================================================================
     35. OPERATOR VIEWS
     ======================================================================= */
  async function ensureOperatorLink() {
    if (AppState.role !== "operator" || !AppState.profile) return AppState.profile ? AppState.profile.operator_id : null;
    if (AppState.profile.operator_id) return AppState.profile.operator_id;
    const id = await callRpc("tc_ensure_operator_account");
    if (id) AppState.profile.operator_id = id;
    return id;
  }

  function operatorGuard(container) {
    return ensureOperatorLink().then(function (id) {
      if (!id) {
        renderEmpty(container, { icon: "🏢", title: "No company linked", message: "Ask an administrator to link your login to your operator company." });
        return false;
      }
      return true;
    }).catch(function (err) { renderError(container, err.message); return false; });
  }

  Router.register("operator-dashboard", {
    title: "Operator dashboard",
    subtitle: "Your fleet, trips and earnings at a glance.",
    render: async function (container) {
      container.innerHTML =
        '<section class="stat-grid" id="operator-stats"></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Quick actions</h3></div>' +
          '<div class="card__body"><div class="button-group">' +
            '<button type="button" class="button button--primary" data-op-go="operator-trips">➕ Schedule a trip</button>' +
            '<button type="button" class="button button--secondary" data-op-go="operator-fleet">🚌 Manage vehicles</button>' +
            '<button type="button" class="button button--secondary" data-op-go="operator-drivers">👨‍✈️ Manage drivers</button>' +
            '<button type="button" class="button button--secondary" data-op-go="operator-reports">📈 View reports</button>' +
          '</div></div></section>' +
        '<section class="card"><div class="card__header"><h3 class="card__title">Next trips</h3></div>' +
          '<div class="card__body card__body--flush" id="operator-next-trips"></div></section>';

      container.querySelectorAll("[data-op-go]").forEach(function (b) {
        b.addEventListener("click", function () { Router.go(b.getAttribute("data-op-go")); });
      });
      const stats = document.getElementById("operator-stats");
      if (!(await operatorGuard(stats))) return;

      try {
        const d = await callRpc("tc_operator_dashboard");
        stats.innerHTML =
          statCard("🚌", d.vehicles, "Vehicles", "") +
          statCard("👨‍✈️", d.drivers, "Drivers", "info") +
          statCard("📅", d.trips_today, "Trips today", "accent") +
          statCard("⏳", d.trips_upcoming, "Upcoming trips", "info") +
          statCard("📍", d.trips_active, "On the road now", "success") +
          statCard("🎫", d.bookings_total, "Seats booked", "success") +
          statCard("💰", moneyOrDash(d.revenue_month), "Revenue this month", "success") +
          statCard("🏦", moneyOrDash(d.revenue_total), "Total revenue", "");
      } catch (err) { renderError(stats, err.message); return; }

      const next = document.getElementById("operator-next-trips");
      try {
        const trips = await callRpc("tc_operator_trips", { p_limit: 100 });
        const upcoming = (trips || []).filter(function (t) { return ["scheduled", "boarding", "in_transit"].indexOf(t.status) !== -1; })
          .sort(function (a, b) { return new Date(a.planned_departure) - new Date(b.planned_departure); }).slice(0, 5);
        if (!upcoming.length) {
          renderEmpty(next, { icon: "🧭", title: "No upcoming trips", message: "Schedule a trip so passengers can book seats." });
        } else {
          next.innerHTML = '<div class="list">' + upcoming.map(function (t) {
            return '<div class="list__item"><div class="list__main">' +
              '<p class="list__title">' + escapeHtml(t.trip_code || "—") + ' · ' + escapeHtml(t.origin || "?") + ' → ' + escapeHtml(t.destination || "?") + '</p>' +
              '<p class="list__meta">' + escapeHtml(formatDateTime(t.planned_departure)) + ' · ' + escapeHtml(t.registration_number || "—") +
                ' · ' + escapeHtml(t.booked) + '/' + escapeHtml(t.capacity) + ' seats</p></div>' +
              '<span class="badge badge--' + escapeHtml(t.status) + '">' + escapeHtml(humanizeStatus(t.status)) + '</span></div>';
          }).join("") + '</div>';
        }
      } catch (err) { renderError(next, err.message); }
    }
  });

  /* ---------- Vehicles ---------- */
  Router.register("operator-fleet", {
    title: "Vehicles",
    subtitle: "Add buses, set their status and assign drivers.",
    headerActions: '<button type="button" class="button button--primary button--small" id="op-add-vehicle">+ Add vehicle</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="fleet-list"></div></div>';
      const list = document.getElementById("fleet-list");
      renderLoading(list, "Loading vehicles…");
      if (!(await operatorGuard(list))) return;

      let vehicles = [], drivers = [];
      try {
        const res = await Promise.all([callRpc("tc_operator_vehicles"), callRpc("tc_operator_drivers")]);
        vehicles = res[0] || []; drivers = res[1] || [];
      } catch (err) { renderError(list, err.message); return; }

      const refresh = function () { Router.go("operator-fleet"); };
      document.getElementById("op-add-vehicle").addEventListener("click", function () { openVehicleModal(null, refresh); });

      if (!vehicles.length) {
        renderEmpty(list, { icon: "🚌", title: "No vehicles yet", message: "Add your first vehicle to start scheduling trips." });
        return;
      }
      list.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Registration</th><th>Type</th><th class="num">Seats</th><th>Driver</th><th>Status</th><th></th></tr></thead><tbody>' +
        vehicles.map(function (v) {
          return '<tr><td><strong>' + escapeHtml(v.registration_number) + '</strong></td>' +
            '<td>' + escapeHtml(v.vehicle_type || "—") + '</td>' +
            '<td class="num">' + escapeHtml(v.capacity) + '</td>' +
            '<td>' + (v.driver_name ? escapeHtml(v.driver_name) : '<span class="text-muted">Unassigned</span>') + '</td>' +
            '<td><span class="badge badge--' + escapeHtml(v.status || "active") + '">' + escapeHtml(humanizeStatus(v.status || "active")) + '</span></td>' +
            '<td><div class="list__actions">' +
              '<button type="button" class="button button--small button--secondary" data-veh-driver="' + escapeHtml(v.id) + '">Driver</button>' +
              '<button type="button" class="button button--small button--ghost" data-veh-edit="' + escapeHtml(v.id) + '">Edit</button>' +
              '<button type="button" class="button button--small button--danger" data-veh-delete="' + escapeHtml(v.id) + '">Remove</button>' +
            '</div></td></tr>';
        }).join("") + '</tbody></table></div>';

      const byId = function (id) { return vehicles.find(function (x) { return String(x.id) === id; }); };
      list.querySelectorAll("[data-veh-edit]").forEach(function (b) {
        b.addEventListener("click", function () { openVehicleModal(byId(b.getAttribute("data-veh-edit")), refresh); });
      });
      list.querySelectorAll("[data-veh-driver]").forEach(function (b) {
        b.addEventListener("click", function () { openAssignDriverModal(byId(b.getAttribute("data-veh-driver")), drivers, vehicles, refresh); });
      });
      list.querySelectorAll("[data-veh-delete]").forEach(function (b) {
        b.addEventListener("click", async function () {
          const v = byId(b.getAttribute("data-veh-delete"));
          const ok = await Modal.confirm({
            title: "Remove " + v.registration_number + "?",
            message: "If this vehicle has past trips it is switched to inactive instead of being erased, so your reports stay correct.",
            confirmLabel: "Remove vehicle", danger: true
          });
          if (!ok) return;
          Loader.show("Removing…");
          try {
            const res = await callRpc("tc_operator_delete_vehicle", { p_id: v.id });
            Toast.success(res && res.archived ? "Vehicle set to inactive" : "Vehicle removed");
            refresh();
          } catch (err) { Toast.error("Unable to remove vehicle", err.message); }
          finally { Loader.hide(); }
        });
      });
    }
  });

  function openVehicleModal(vehicle, onDone) {
    const v = vehicle || {};
    Modal.open({
      title: vehicle ? "Edit vehicle" : "Add vehicle",
      body:
        '<div class="field"><label for="opveh-reg">Registration number</label>' +
          '<input type="text" id="opveh-reg" maxlength="20" autocapitalize="characters" value="' + escapeHtml(v.registration_number || "") + '" placeholder="e.g. LSD 123 XY" /></div>' +
        '<div class="field"><label for="opveh-type">Vehicle type</label>' +
          '<input type="text" id="opveh-type" list="opveh-type-list" value="' + escapeHtml(v.vehicle_type || "") + '" placeholder="e.g. Bus, Danfo, Coaster" />' +
          '<datalist id="opveh-type-list"><option value="Bus"><option value="Mini bus"><option value="Danfo"><option value="Coaster"><option value="Sienna"></datalist></div>' +
        '<div class="field"><label for="opveh-capacity">Seats (1–100)</label>' +
          '<input type="number" id="opveh-capacity" min="1" max="100" value="' + escapeHtml(v.capacity || "") + '" /></div>' +
        '<div class="field"><label for="opveh-status">Status</label><select id="opveh-status">' +
          ["active", "maintenance", "inactive"].map(function (s) {
            return '<option value="' + s + '"' + ((v.status || "active") === s ? " selected" : "") + '>' + humanizeStatus(s) + '</option>';
          }).join("") + '</select></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Save vehicle</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const reg = document.getElementById("opveh-reg").value.trim();
        const capacity = parseInt(document.getElementById("opveh-capacity").value, 10);
        if (!reg) { Toast.warning("Registration number required"); return; }
        if (!capacity || capacity < 1 || capacity > 100) { Toast.warning("Seats must be between 1 and 100"); return; }
        Loader.show("Saving…");
        try {
          await callRpc("tc_operator_save_vehicle", {
            p_id: vehicle ? vehicle.id : null, p_registration: reg,
            p_type: document.getElementById("opveh-type").value.trim() || null,
            p_capacity: capacity, p_status: document.getElementById("opveh-status").value
          });
          Modal.close();
          Toast.success(vehicle ? "Vehicle updated" : "Vehicle added");
          if (onDone) onDone();
        } catch (err) { Toast.error("Unable to save vehicle", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  function openAssignDriverModal(vehicle, drivers, vehicles, onDone) {
    const onVehicle = {};
    vehicles.forEach(function (x) { if (x.assigned_driver_id) onVehicle[x.assigned_driver_id] = x.registration_number; });
    const options = drivers.map(function (d) {
      const other = onVehicle[d.id] && String(d.id) !== String(vehicle.assigned_driver_id);
      return '<option value="' + escapeHtml(d.id) + '"' + (String(d.id) === String(vehicle.assigned_driver_id) ? " selected" : "") + '>' +
        escapeHtml((d.full_name || "Driver") + (d.status !== "approved" ? " (not approved yet)" : "") + (other ? " — currently on " + onVehicle[d.id] : "")) + '</option>';
    }).join("");
    Modal.open({
      title: "Driver for " + vehicle.registration_number,
      body: drivers.length
        ? '<p class="text-muted mb-4">A driver can drive one vehicle at a time. Choosing a driver who is on another bus moves them here. Only approved drivers can run trips.</p>' +
          '<div class="field"><label for="opveh-driver-select">Driver</label><select id="opveh-driver-select"><option value="">— No driver —</option>' + options + '</select></div>'
        : '<p class="text-muted">You have no drivers yet. Add drivers first (Drivers → Add driver).</p>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        (drivers.length ? '<button type="button" class="button button--primary" data-modal-action="save">Save</button>' : ""),
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        Loader.show("Saving…");
        try {
          await callRpc("tc_operator_assign_vehicle", {
            p_vehicle_id: vehicle.id, p_driver_id: document.getElementById("opveh-driver-select").value || null
          });
          Modal.close();
          Toast.success("Driver assignment saved");
          if (onDone) onDone();
        } catch (err) { Toast.error("Unable to assign driver", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  /* ---------- Drivers ---------- */
  Router.register("operator-drivers", {
    title: "Drivers",
    subtitle: "Drivers who work for your company. Administrators approve new drivers.",
    headerActions: '<button type="button" class="button button--primary button--small" id="op-add-driver">+ Add driver</button>',
    render: async function (container) {
      container.innerHTML = '<div class="card"><div class="card__body card__body--flush" id="op-drivers-list"></div></div>';
      const list = document.getElementById("op-drivers-list");
      renderLoading(list, "Loading drivers…");
      if (!(await operatorGuard(list))) return;

      let drivers = [];
      try { drivers = (await callRpc("tc_operator_drivers")) || []; }
      catch (err) { renderError(list, err.message); return; }

      const refresh = function () { Router.go("operator-drivers"); };
      document.getElementById("op-add-driver").addEventListener("click", function () { openAddDriverModal(refresh); });

      if (!drivers.length) {
        renderEmpty(list, { icon: "👨‍✈️", title: "No drivers yet", message: "Drivers register themselves (Create account → Driver). Then add them here with their email or phone number." });
        return;
      }
      list.innerHTML = '<div class="list">' + drivers.map(function (d) {
        return '<div class="list__item"><div class="list__main">' +
          '<p class="list__title">' + escapeHtml(d.full_name || "—") + '</p>' +
          '<p class="list__meta">' + escapeHtml(d.email || d.phone || "") + ' · ' +
            (d.vehicle ? 'Vehicle ' + escapeHtml(d.vehicle) : 'No vehicle assigned') + '</p></div>' +
          '<div class="list__actions">' +
            '<span class="badge badge--' + escapeHtml(d.status || "pending") + '">' + escapeHtml(humanizeStatus(d.status || "pending")) + '</span>' +
            '<button type="button" class="button button--small button--ghost" data-drv-remove="' + escapeHtml(d.id) + '">Remove</button>' +
          '</div></div>';
      }).join("") + '</div>';

      list.querySelectorAll("[data-drv-remove]").forEach(function (b) {
        b.addEventListener("click", async function () {
          const d = drivers.find(function (x) { return String(x.id) === b.getAttribute("data-drv-remove"); });
          const ok = await Modal.confirm({
            title: "Remove " + (d.full_name || "driver") + "?",
            message: "They stay registered on TransitCare but no longer work for your company, and are taken off any vehicle.",
            confirmLabel: "Remove driver", danger: true
          });
          if (!ok) return;
          Loader.show("Removing…");
          try { await callRpc("tc_operator_remove_driver", { p_driver_id: d.id }); Toast.success("Driver removed"); refresh(); }
          catch (err) { Toast.error("Unable to remove driver", err.message); }
          finally { Loader.hide(); }
        });
      });
    }
  });

  function openAddDriverModal(onDone) {
    Modal.open({
      title: "Add a driver",
      body: '<p class="text-muted mb-4">The driver must already have a TransitCare driver account. Enter the email or phone number they registered with.</p>' +
        '<div class="field"><label for="opdrv-identifier">Driver\'s email or phone</label>' +
        '<input type="text" id="opdrv-identifier" autocomplete="off" placeholder="driver@email.com or 0803 000 0000" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Add driver</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const id = document.getElementById("opdrv-identifier").value.trim();
        if (!id) { Toast.warning("Enter the driver's email or phone"); return; }
        Loader.show("Adding…");
        try {
          const res = await callRpc("tc_operator_add_driver", { p_identifier: id });
          Modal.close();
          Toast.success("Driver added", (res && res.name ? res.name : "Driver") + " now works for your company.");
          if (onDone) onDone();
        } catch (err) { Toast.error("Unable to add driver", err.message); }
        finally { Loader.hide(); }
      }
    });
  }

  /* ---------- Trips ---------- */
  Router.register("operator-trips", {
    title: "Trips",
    subtitle: "Schedule trips, see who booked and cancel when needed.",
    headerActions: '<button type="button" class="button button--primary button--small" id="op-add-trip">+ Schedule trip</button>',
    render: async function (container) {
      container.innerHTML =
        '<div class="toolbar"><div class="field"><label for="optrips-filter">Show</label>' +
        '<select id="optrips-filter"><option value="">All trips</option><option value="open">Upcoming &amp; active</option>' +
        '<option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div></div>' +
        '<div class="card"><div class="card__body card__body--flush" id="op-trips-list"></div></div>';
      const list = document.getElementById("op-trips-list");
      renderLoading(list, "Loading trips…");
      if (!(await operatorGuard(list))) return;

      let trips = [];
      try { trips = (await callRpc("tc_operator_trips", { p_limit: 200 })) || []; }
      catch (err) { renderError(list, err.message); return; }

      const refresh = function () { Router.go("operator-trips"); };
      document.getElementById("op-add-trip").addEventListener("click", function () { openScheduleTripModal(refresh); });

      function draw() {
        const f = document.getElementById("optrips-filter").value;
        const rows = trips.filter(function (t) {
          if (f === "open") return ["scheduled", "boarding", "in_transit"].indexOf(t.status) !== -1;
          if (f) return t.status === f;
          return true;
        });
        if (!rows.length) {
          renderEmpty(list, { icon: "🧭", title: "No trips", message: trips.length ? "No trips match this filter." : "Schedule your first trip so passengers can book seats." });
          return;
        }
        list.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>Trip</th><th>Route</th><th>Vehicle · driver</th><th>Departure</th><th class="num">Seats</th><th class="num">Revenue</th><th>Status</th><th></th></tr></thead><tbody>' +
          rows.map(function (t) {
            const canCancel = t.status === "scheduled" || t.status === "boarding";
            return '<tr><td><strong>' + escapeHtml(t.trip_code || "—") + '</strong></td>' +
              '<td>' + escapeHtml(t.origin || "?") + ' → ' + escapeHtml(t.destination || "?") + '</td>' +
              '<td>' + escapeHtml(t.registration_number || "—") + '<br><span class="text-muted text-small">' + escapeHtml(t.driver_name || "No driver") + '</span></td>' +
              '<td>' + escapeHtml(formatDateTime(t.planned_departure)) + '</td>' +
              '<td class="num">' + escapeHtml(t.booked) + '/' + escapeHtml(t.capacity) + '</td>' +
              '<td class="num">' + escapeHtml(moneyOrDash(t.revenue)) + '</td>' +
              '<td><span class="badge badge--' + escapeHtml(t.status || "scheduled") + '">' + escapeHtml(humanizeStatus(t.status)) + '</span></td>' +
              '<td><div class="list__actions">' +
                '<button type="button" class="button button--small button--secondary" data-trip-pax="' + escapeHtml(t.id) + '">Passengers</button>' +
                (canCancel ? '<button type="button" class="button button--small button--danger" data-trip-cancel="' + escapeHtml(t.id) + '">Cancel</button>' : "") +
              '</div></td></tr>';
          }).join("") + '</tbody></table></div>';

        list.querySelectorAll("[data-trip-pax]").forEach(function (b) {
          b.addEventListener("click", function () {
            const t = trips.find(function (x) { return String(x.id) === b.getAttribute("data-trip-pax"); });
            openPassengersModal(t);
          });
        });
        list.querySelectorAll("[data-trip-cancel]").forEach(function (b) {
          b.addEventListener("click", function () {
            const t = trips.find(function (x) { return String(x.id) === b.getAttribute("data-trip-cancel"); });
            openCancelTripModal(t, refresh);
          });
        });
      }
      document.getElementById("optrips-filter").addEventListener("change", draw);
      draw();
    }
  });

  async function openPassengersModal(trip) {
    Modal.open({
      title: "Passengers · " + (trip.trip_code || ""),
      body: '<div id="op-pax-body"><p class="text-muted">Loading…</p></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="close">Close</button>',
      onAction: function () { Modal.close(); }
    });
    const body = document.getElementById("op-pax-body");
    try {
      const rows = (await callRpc("tc_operator_trip_passengers", { p_trip_id: trip.id })) || [];
      if (!body) return;
      if (!rows.length) { body.innerHTML = '<p class="text-muted">No seats booked on this trip yet.</p>'; return; }
      body.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr><th>Seat</th><th>Passenger</th><th>Phone</th><th>Status</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + escapeHtml(r.seat_number || "—") + '</td><td>' + escapeHtml(r.passenger || "—") + '</td>' +
            '<td>' + escapeHtml(r.phone || "—") + '</td>' +
            '<td><span class="badge badge--' + escapeHtml(r.status || "reserved") + '">' + escapeHtml(humanizeStatus(r.status)) + '</span></td></tr>';
        }).join("") + '</tbody></table></div>';
    } catch (err) { if (body) body.innerHTML = '<p class="text-danger">' + escapeHtml(err.message) + '</p>'; }
  }

  async function openScheduleTripModal(onDone) {
    let vehicles = [], routes = [], terminals = [];
    try {
      const res = await Promise.all([callRpc("tc_operator_vehicles"), Data.getRoutes(true), Data.getTerminals(true)]);
      vehicles = res[0] || []; routes = res[1] || []; terminals = res[2] || [];
    } catch (err) { Toast.error("Unable to load form", err.message); return; }

    const usable = vehicles.filter(function (v) { return (v.status || "active") === "active"; });
    if (!usable.length) { Toast.warning("No active vehicles", "Add a vehicle and assign an approved driver first."); return; }
    if (!routes.length) { Toast.warning("No routes available", "An administrator must add routes first."); return; }

    const d = new Date(Date.now() + 2 * 3600000);
    const defaultDeparture = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    Modal.open({
      title: "Schedule a trip",
      body:
        '<div class="field"><label for="optrip-vehicle">Vehicle</label><select id="optrip-vehicle">' +
          usable.map(function (v) {
            return '<option value="' + escapeHtml(v.id) + '">' + escapeHtml(v.registration_number + " · " + v.capacity + " seats · " + (v.driver_name || "NO DRIVER")) + '</option>';
          }).join("") + '</select></div>' +
        '<div class="field"><label for="optrip-route">Route</label><select id="optrip-route">' +
          routes.map(function (r) { return '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.origin + " → " + r.destination) + '</option>'; }).join("") + '</select></div>' +
        '<div class="field"><label for="optrip-terminal">Terminal</label><select id="optrip-terminal"><option value="">— None —</option></select>' +
          '<p class="field__hint text-muted text-small" id="optrip-terminal-hint"></p></div>' +
        '<div class="field"><label for="optrip-departure">Departure</label><input type="datetime-local" id="optrip-departure" value="' + defaultDeparture + '" /></div>',
      footer: '<button type="button" class="button button--ghost" data-modal-action="cancel">Cancel</button>' +
        '<button type="button" class="button button--primary" data-modal-action="save">Schedule trip</button>',
      onAction: async function (action) {
        if (action === "cancel") { Modal.close(); return; }
        const dep = document.getElementById("optrip-departure").value;
        const termSel = document.getElementById("optrip-terminal");
        if (termSel && termSel.dataset.required === "1" && !termSel.value) { Toast.warning("Select a terminal", "Choose the terminal this trip leaves from."); return; }
        if (!dep) { Toast.warning("Choose a departure time"); return; }
        Loader.show("Scheduling…");
        try {
          const res = await callRpc("tc_operator_schedule_trip", {
            p_vehicle_id: document.getElementById("optrip-vehicle").value,
            p_route_id: document.getElementById("optrip-route").value,
            p_terminal_id: document.getElementById("optrip-terminal").value || null,
            p_departure: new Date(dep).toISOString()
          });
          Modal.close();
          Toast.success("Trip scheduled", "Trip " + (res && res.trip_code ? res.trip_code : "") + " is open for booking.");
          if (onDone) onDone();
        } catch (err) { Toast.error("Unable to schedule trip", err.message); }
        finally { Loader.hide(); }
      }
    });

    const oRoute = document.getElementById("optrip-route"), oTerm = document.getElementById("optrip-terminal");
    const oHint = document.getElementById("optrip-terminal-hint");
    Data.getRouteTerminals().then(function (linkMap) {
      function refresh() { fillTerminalSelect(oTerm, oHint, terminals, linkMap, oRoute.value, false); }
      oRoute.addEventListener("change", refresh);
      refresh();
    });
  }

  /* ---------- Reports ---------- */
  Router.register("operator-reports", {
    title: "Reports",
    subtitle: "Bookings and revenue for your fleet.",
    render: async function (container) {
      const today = new Date();
      const iso = function (dt) { return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
      const monthAgo = new Date(today.getTime() - 29 * 86400000);

      container.innerHTML =
        '<div class="toolbar">' +
          '<div class="field"><label for="oprev-from">From</label><input type="date" id="oprev-from" value="' + iso(monthAgo) + '" /></div>' +
          '<div class="field"><label for="oprev-to">To</label><input type="date" id="oprev-to" value="' + iso(today) + '" /></div>' +
          '<button type="button" class="button button--primary" id="oprev-apply">Show report</button>' +
          '<button type="button" class="button button--ghost" id="oprev-csv" disabled>Download CSV</button>' +
        '</div><div id="oprev-body"></div>';
      const body = document.getElementById("oprev-body");
      if (!(await operatorGuard(body))) return;

      let current = null;

      function table(title, rows, labelHead) {
        if (!rows.length) return "";
        return '<section class="card"><div class="card__header"><h3 class="card__title">' + escapeHtml(title) + '</h3></div>' +
          '<div class="card__body card__body--flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>' + escapeHtml(labelHead) +
          '</th><th class="num">Seats booked</th><th class="num">Revenue</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td>' + escapeHtml(r.label || (r.day ? formatDate(r.day) : "—")) + '</td><td class="num">' + escapeHtml(r.bookings) +
              '</td><td class="num">' + escapeHtml(moneyOrDash(r.revenue)) + '</td></tr>';
          }).join("") + '</tbody></table></div></div></section>';
      }

      async function load() {
        renderLoading(body, "Building report…");
        document.getElementById("oprev-csv").disabled = true;
        try {
          const r = await callRpc("tc_operator_revenue", {
            p_from: document.getElementById("oprev-from").value || null,
            p_to: document.getElementById("oprev-to").value || null
          });
          current = r;
          body.innerHTML =
            '<section class="stat-grid">' +
              statCard("🧭", r.trips, "Trips", "info") + statCard("🎫", r.bookings, "Seats booked", "success") +
              statCard("💰", moneyOrDash(r.revenue), "Revenue", "success") + '</section>' +
            table("By route", r.by_route || [], "Route") + table("By vehicle", r.by_vehicle || [], "Vehicle") + table("By day", r.by_day || [], "Day");
          if (!r.trips) body.insertAdjacentHTML("beforeend", '<p class="text-muted">No trips in this period.</p>');
          document.getElementById("oprev-csv").disabled = !r.trips;
        } catch (err) { renderError(body, err.message); }
      }

      document.getElementById("oprev-apply").addEventListener("click", load);
      document.getElementById("oprev-csv").addEventListener("click", function () {
        if (!current) return;
        const rows = [["Section", "Name", "Seats booked", "Revenue (NGN)"]];
        (current.by_route || []).forEach(function (x) { rows.push(["Route", x.label, x.bookings, x.revenue]); });
        (current.by_vehicle || []).forEach(function (x) { rows.push(["Vehicle", x.label, x.bookings, x.revenue]); });
        (current.by_day || []).forEach(function (x) { rows.push(["Day", x.day, x.bookings, x.revenue]); });
        downloadCsv("transitcare-report-" + current.from + "-to-" + current.to + ".csv", rows);
      });
      load();
    }
  });

  /* ---------- Company ---------- */
  Router.register("operator-company", {
    title: "Company",
    subtitle: "Your transport company details.",
    render: async function (container) {
      container.innerHTML = '<div id="op-company-root"></div>';
      const root = document.getElementById("op-company-root");
      renderLoading(root, "Loading…");
      if (!(await operatorGuard(root))) return;
      let c;
      try { c = await callRpc("tc_operator_company"); } catch (err) { renderError(root, err.message); return; }
      if (!c) { renderEmpty(root, { icon: "🏢", title: "No company linked", message: "Ask an administrator to link your login to your company." }); return; }

      root.innerHTML =
        '<section class="card"><div class="card__header"><h3 class="card__title">Company details</h3>' +
          '<span class="badge badge--' + escapeHtml(c.status || "active") + '">' + escapeHtml(humanizeStatus(c.status || "active")) + '</span></div>' +
        '<div class="card__body"><form id="company-form" novalidate>' +
          '<div class="field"><label for="opco-name">Company name</label><input type="text" id="opco-name" maxlength="80" value="' + escapeHtml(c.name || "") + '" /></div>' +
          '<div class="field"><label for="opco-contact">Contact person</label><input type="text" id="opco-contact" maxlength="80" value="' + escapeHtml(c.contact_name || "") + '" /></div>' +
          '<div class="field"><label for="opco-phone">Phone</label><input type="tel" id="opco-phone" value="' + escapeHtml(c.phone || "") + '" /></div>' +
          '<div class="field"><label for="opco-email">Email</label><input type="email" id="opco-email" value="' + escapeHtml(c.email || "") + '" /></div>' +
          '<div class="form-actions"><button type="submit" class="button button--primary">Save changes</button></div>' +
        '</form></div></section>';

      document.getElementById("company-form").addEventListener("submit", async function (event) {
        event.preventDefault();
        const name = document.getElementById("opco-name").value.trim();
        const email = document.getElementById("opco-email").value.trim();
        if (!name) { Toast.warning("Company name required"); return; }
        if (email && !Validators.email(email)) { Toast.warning("Enter a valid email address"); return; }
        Loader.show("Saving…");
        try {
          await callRpc("tc_operator_update_company", {
            p_name: name, p_contact: document.getElementById("opco-contact").value.trim(),
            p_phone: document.getElementById("opco-phone").value.trim(), p_email: email
          });
          Toast.success("Company details saved");
        } catch (err) { Toast.error("Unable to save", err.message); }
        finally { Loader.hide(); }
      });
    }
  });


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

    /* =======================================================================
     HERO LOTTIE ANIMATION
     - Loads from /assets/transitcare-hero.json
     - Plays only while the container is on screen
     - Fades in once the first frame is rendered
     ======================================================================= */
  (function initHeroLottie() {
    const container = document.getElementById("hero-lottie");
    if (!container) return;
    if (container.dataset.lottieLoaded === "true") return;   // ← ADD THIS LINE
    container.dataset.lottieLoaded = "true";                  // ← AND THIS ONE

    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Lottie library may load after script.js — wait for it.
    function waitForLottie(cb, tries) {
      tries = tries || 0;
      if (window.lottie) return cb(window.lottie);
      if (tries > 40) return; // ~4s timeout, silently skip
      setTimeout(function () { waitForLottie(cb, tries + 1); }, 100);
    }

    waitForLottie(function (lottie) {
      let anim;
      try {
        anim = lottie.loadAnimation({
          container: container,
          renderer: "svg",
          loop: true,
          autoplay: false, // we control visibility manually
          path: "assets/transitcare-hero.json"
        });
      } catch (err) {
        console.warn("[TransitCare] Lottie failed to load:", err);
        container.remove();
        return;
      }

      // Fade in once the first frame is ready
      anim.addEventListener("DOMLoaded", function () {
        container.classList.add("is-ready");
      });

      // If the JSON fails to load, remove the empty box
      anim.addEventListener("data_failed", function () {
        container.remove();
      });

      // Reduced motion: show a single frame, don't play
      if (prefersReducedMotion) {
        anim.addEventListener("DOMLoaded", function () {
          anim.goToAndStop(0, true);
        });
        return;
      }

      // Play only when visible
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) anim.play();
              else anim.pause();
            });
          },
          { threshold: 0.15 }
        );
        observer.observe(container);
      } else {
        // Fallback for very old browsers — just play it
        anim.play();
      }

      // Pause when the tab is hidden (saves battery, avoids audio glitches)
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) anim.pause();
        else if (isElementInViewport(container)) anim.play();
      });
    });

    function isElementInViewport(el) {
      const rect = el.getBoundingClientRect();
      return (
        rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
        rect.bottom > 0
      );
    }
  })();

})();
