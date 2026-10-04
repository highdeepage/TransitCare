/* =========================================================================
   EKO TRANSITCARE — STYLESHEET (Light & Warm)
   -------------------------------------------------------------------------
   01. Tokens
   02. Reset & base
   03. Utilities
   04. Typography
   05. Buttons
   06. Form controls
   07. Alerts
   08. Badges / chips
   09. Cards & lists
   10. Tables
   11. Empty / loading states
   12. Modal
   13. Toasts
   14. Loader & spinner
   15. Auth screen — light hero + thick-bordered card
   16. App shell
   17. User menu
   18. Widgets
   19. Responsive
   20. Motion preferences
   ========================================================================= */

/* =========================================================================
   01. TOKENS
   ========================================================================= */
:root {
  /* Brand — Indigo (softened) */
  --brand-900: #3A2E8C;
  --brand-800: #4A3BA8;
  --brand-700: #5B4AC4;
  --brand-600: #6D5FFA;
  --brand-500: #8B7BFF;
  --brand-400: #A89BFF;
  --brand-200: #D5CEFF;
  --brand-100: #EAE5FF;
  --brand-050: #F5F2FF;

  /* Accent — Warm Ember */
  --accent-700: #B45309;
  --accent-600: #EA580C;
  --accent-500: #FB8A3D;
  --accent-400: #FCA968;
  --accent-100: #FFEDD5;

  /* Status */
  --danger-700: #9F1239;
  --danger-600: #E11D48;
  --danger-500: #F43F5E;
  --danger-100: #FFE4EA;

  --warning-700: #92400E;
  --warning-600: #B45309;
  --warning-500: #F59E0B;
  --warning-100: #FEF3C7;

  --success-700: #0F766E;
  --success-600: #0D9488;
  --success-500: #14B8A6;
  --success-100: #CCFBF1;

  --info-700: #1E40AF;
  --info-600: #2563EB;
  --info-500: #3B82F6;
  --info-100: #DBEAFE;

  /* Neutrals */
  --ink-900: #1A1730;
  --ink-800: #2B2645;
  --ink-700: #41395E;
  --ink-600: #5B5280;
  --ink-500: #7A7295;
  --ink-400: #A39BB8;
  --ink-300: #C9C2DA;
  --ink-200: #E4DFF0;
  --ink-100: #F0ECFA;
  --ink-050: #FAF8FE;
  --white: #FFFFFF;

  /* Surfaces — light & warm */
  --surface-page: #FAF7FF;
  --surface-card: #FFFFFF;
  --surface-sunken: var(--ink-100);
  --border-subtle: #E8E2F5;
  --border-strong: #C9C2DA;

  /* Text */
  --text-primary: var(--ink-900);
  --text-secondary: var(--ink-600);
  --text-muted: var(--ink-500);
  --text-inverse: var(--white);
  --text-link: var(--brand-700);

  /* Radii */
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --radius-pill: 999px;

  /* Shadows */
  --shadow-xs: 0 1px 2px rgba(58, 46, 140, 0.06);
  --shadow-sm: 0 2px 8px rgba(58, 46, 140, 0.08), 0 1px 2px rgba(58, 46, 140, 0.04);
  --shadow-md: 0 10px 24px rgba(58, 46, 140, 0.10), 0 2px 6px rgba(58, 46, 140, 0.05);
  --shadow-lg: 0 24px 56px rgba(58, 46, 140, 0.16), 0 8px 18px rgba(58, 46, 140, 0.08);
  --shadow-glow: 0 10px 32px rgba(109, 95, 250, 0.35);
  --shadow-focus: 0 0 0 4px rgba(109, 95, 250, 0.22);

  /* Motion */
  --ease-standard: cubic-bezier(0.2, 0, 0.2, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 140ms;
  --duration-base: 240ms;
  --duration-slow: 400ms;

  /* Layout */
  --header-height: 68px;
  --sidebar-width: 264px;
  --bottom-nav-height: 64px;
  --content-max-width: 1240px;

  /* Z-index */
  --z-bg: 0;
  --z-content: 1;
  --z-sidebar: 40;
  --z-header: 50;
  --z-bottom-nav: 45;
  --z-backdrop: 60;
  --z-modal: 70;
  --z-toast: 90;
  --z-loader: 100;

  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --font-display: "Space Grotesk", "Inter", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;

  /* Signature thick border */
  --border-thick: 4px;
  --border-input: 3px;
  --border-color-strong: #6D5FFA;
}

/* =========================================================================
   02. RESET & BASE
   ========================================================================= */
*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }

body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  color: var(--text-primary);
  background-color: var(--surface-page);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  position: relative;
  overflow-x: hidden;
}

h1, h2, h3, h4, h5, h6, p, figure, blockquote, dl, dd { margin: 0; }
ul, ol { margin: 0; padding: 0; list-style: none; }
img, svg, video, canvas { display: block; max-width: 100%; }
a { color: var(--text-link); text-decoration: none; }
a:hover { text-decoration: underline; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: none; padding: 0; }
button:disabled { cursor: not-allowed; }
hr { border: none; border-top: 1px solid var(--border-subtle); margin: 0; }
code, pre { font-family: var(--font-mono); font-size: 0.875em; }
code { background: var(--ink-100); padding: 2px 6px; border-radius: var(--radius-xs); color: var(--ink-800); }

:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-radius: var(--radius-sm);
}

/* =========================================================================
   03. UTILITIES
   ========================================================================= */
.is-hidden { display: none !important; }
.visually-hidden {
  position: absolute !important;
  width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-muted { color: var(--text-muted); }
.text-small { font-size: 13px; }
.text-tiny { font-size: 12px; }
.text-bold { font-weight: 600; }
.text-mono { font-family: var(--font-mono); }
.mt-0 { margin-top: 0; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 20px; }
.mt-6 { margin-top: 24px; }
.mb-2 { margin-bottom: 8px; }
.mb-3 { margin-bottom: 12px; }
.mb-4 { margin-bottom: 16px; }
.mb-5 { margin-bottom: 20px; }
.mb-6 { margin-bottom: 24px; }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.justify-center { justify-content: center; }
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.gap-5 { gap: 20px; }
.grow { flex: 1 1 auto; }
.wrap-grow { flex: 1 1 220px; }

/* =========================================================================
   04. TYPOGRAPHY
   ========================================================================= */
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.page-header__title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.page-header__subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 14px;
}
.section-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.eyebrow {
  display: inline-block;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--brand-600);
}

/* =========================================================================
   05. BUTTONS
   ========================================================================= */
.button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 22px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  border: 2px solid transparent;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-base) var(--ease-standard);
  white-space: nowrap;
  text-decoration: none;
  overflow: hidden;
}
.button::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%);
  transform: translateX(-100%);
  transition: transform var(--duration-slow) var(--ease-out);
}
.button:hover::after { transform: translateX(100%); }
.button:active:not(:disabled) { transform: translateY(1px) scale(0.99); }
.button:disabled { opacity: 0.55; box-shadow: none; }

.button--primary {
  background: linear-gradient(135deg, var(--brand-600), var(--brand-500));
  color: var(--white);
  border-color: var(--brand-700);
  box-shadow: 0 6px 16px rgba(109, 95, 250, 0.30);
}
.button--primary:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--brand-700), var(--brand-600));
  box-shadow: 0 10px 24px rgba(109, 95, 250, 0.40);
  transform: translateY(-1px);
}

.button--secondary {
  background-color: var(--white);
  color: var(--brand-700);
  border-color: var(--brand-200);
}
.button--secondary:hover:not(:disabled) {
  background-color: var(--brand-050);
  border-color: var(--brand-500);
}

.button--ghost {
  background-color: transparent;
  color: var(--text-secondary);
  border-color: var(--border-subtle);
}
.button--ghost:hover:not(:disabled) {
  background-color: var(--ink-100);
  color: var(--text-primary);
}

.button--danger { background-color: var(--danger-600); color: var(--white); border-color: var(--danger-700); }
.button--danger:hover:not(:disabled) { background-color: var(--danger-700); }
.button--success { background-color: var(--success-600); color: var(--white); border-color: var(--success-700); }
.button--success:hover:not(:disabled) { background-color: var(--success-700); }

.button--small { padding: 9px 16px; font-size: 13px; border-radius: var(--radius-sm); border-width: 2px; }
.button--large { padding: 16px 28px; font-size: 15px; }
.button--block { width: 100%; }

.button--glow {
  box-shadow:
    0 10px 28px rgba(109, 95, 250, 0.40),
    0 4px 10px rgba(109, 95, 250, 0.25);
}
.button--glow:hover:not(:disabled) {
  box-shadow:
    0 14px 36px rgba(109, 95, 250, 0.50),
    0 6px 14px rgba(109, 95, 250, 0.30);
}

.link-button {
  background: none; border: none;
  color: var(--text-link);
  font-size: 13px; font-weight: 700;
  padding: 2px 0;
  border-radius: var(--radius-xs);
  transition: color var(--duration-fast) var(--ease-standard);
}
.link-button:hover { text-decoration: underline; color: var(--brand-800); }

.icon-button {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 42px; height: 42px;
  border-radius: var(--radius-md);
  font-size: 18px;
  color: var(--ink-700);
  background-color: transparent;
  border: 2px solid transparent;
  transition: background-color var(--duration-fast) var(--ease-standard),
              transform var(--duration-base) var(--ease-spring);
}
.icon-button:hover { background-color: var(--ink-100); transform: translateY(-1px); }

.icon-button__badge {
  position: absolute; top: 5px; right: 5px;
  min-width: 18px; height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, var(--accent-600), var(--accent-500));
  color: var(--white);
  font-size: 10px; font-weight: 800;
  line-height: 18px; text-align: center;
  border: 2px solid var(--white);
  box-shadow: 0 2px 6px rgba(234, 88, 12, 0.4);
}
.button__spinner {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: spin 0.7s linear infinite;
}
.button-group { display: flex; flex-wrap: wrap; gap: 8px; }

/* =========================================================================
   06. FORM CONTROLS — thick borders
   ========================================================================= */
.field { margin-bottom: 18px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.field > label, .field__label {
  display: block; margin-bottom: 8px;
  font-size: 13px; font-weight: 700;
  color: var(--ink-800);
  letter-spacing: 0.01em;
}

.field input[type="text"],
.field input[type="email"],
.field input[type="tel"],
.field input[type="password"],
.field input[type="number"],
.field input[type="date"],
.field input[type="time"],
.field input[type="datetime-local"],
.field input[type="search"],
.field select,
.field textarea {
  width: 100%;
  padding: 14px 16px;
  font-size: 14.5px;
  color: var(--text-primary);
  background-color: var(--white);
  border: var(--border-input) solid var(--brand-200);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-base) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
  appearance: none;
  font-weight: 500;
}
.field textarea { min-height: 100px; resize: vertical; line-height: 1.5; }
.field select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='10' viewBox='0 0 14 10'%3E%3Cpath fill='%235B4AC4' d='M7 10 0 2.4 2.4 0 7 5.2 11.6 0 14 2.4z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 16px center;
  padding-right: 42px;
}
.field input::placeholder, .field textarea::placeholder { color: var(--ink-400); font-weight: 400; }

.field input:hover:not(:disabled),
.field select:hover:not(:disabled),
.field textarea:hover:not(:disabled) {
  border-color: var(--brand-400);
}

.field input:focus, .field select:focus, .field textarea:focus {
  outline: none;
  border-color: var(--brand-600);
  box-shadow: var(--shadow-focus);
  background-color: #FDFCFF;
}

.field input:disabled, .field select:disabled, .field textarea:disabled {
  background-color: var(--ink-100);
  color: var(--text-muted);
  cursor: not-allowed;
  border-color: var(--ink-200);
}

.field.has-error input, .field.has-error select, .field.has-error textarea {
  border-color: var(--danger-500);
  background-color: #FFFBFB;
}
.field.has-error input:focus, .field.has-error select:focus {
  box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.2);
}

.field__error {
  margin-top: 6px; font-size: 12.5px; font-weight: 600;
  color: var(--danger-600);
}
.field__error:empty { display: none; }
.field__hint { margin-top: 6px; font-size: 12.5px; color: var(--text-muted); font-weight: 500; }

.field__password { position: relative; }
.field__password input { padding-right: 74px; }
.field__toggle {
  position: absolute; top: 50%; right: 8px;
  transform: translateY(-50%);
  padding: 6px 12px;
  font-size: 12px; font-weight: 700;
  color: var(--brand-700);
  border-radius: var(--radius-sm);
  transition: background-color var(--duration-fast) var(--ease-standard);
}
.field__toggle:hover { background-color: var(--brand-050); }

.password-meter {
  margin-top: 10px; height: 6px;
  border-radius: var(--radius-pill);
  background-color: var(--ink-200);
  overflow: hidden;
}
.password-meter__bar {
  display: block; height: 100%; width: 0;
  border-radius: var(--radius-pill);
  background-color: var(--danger-500);
  transition: width var(--duration-base) var(--ease-out),
              background-color var(--duration-base) var(--ease-out);
}
.password-meter__bar.is-weak { background-color: var(--danger-500); }
.password-meter__bar.is-fair { background-color: var(--warning-500); }
.password-meter__bar.is-good { background-color: var(--info-500); }
.password-meter__bar.is-strong { background-color: var(--success-500); }

.checkbox {
  display: inline-flex; align-items: flex-start; gap: 8px;
  font-size: 13.5px; color: var(--ink-700);
  cursor: pointer; user-select: none;
  font-weight: 500;
}
.checkbox input[type="checkbox"] {
  flex: 0 0 auto;
  width: 18px; height: 18px;
  margin: 2px 0 0;
  accent-color: var(--brand-600);
  cursor: pointer;
}
.checkbox--terms { margin: 8px 0 16px; line-height: 1.5; }

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0 16px;
}
.form-actions {
  display: flex; flex-wrap: wrap; gap: 12px;
  margin-top: 20px; padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

/* =========================================================================
   07. ALERTS
   ========================================================================= */
.alert {
  display: flex; flex-direction: column; gap: 4px;
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-subtle);
  background-color: var(--ink-050);
  color: var(--ink-800);
  font-size: 13.5px; line-height: 1.5;
  animation: alert-in var(--duration-base) var(--ease-out);
}
@keyframes alert-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.alert strong { font-weight: 800; }
.alert--success { background-color: var(--success-100); border-color: #5EEAD4; color: var(--success-700); }
.alert--danger { background-color: var(--danger-100); border-color: #FDA4AF; color: var(--danger-700); }
.alert--warning { background-color: var(--warning-100); border-color: #FCD34D; color: var(--warning-700); }
.alert--info { background-color: var(--info-100); border-color: #93C5FD; color: var(--info-700); }

/* =========================================================================
   08. BADGES / CHIPS / PILLS
   ========================================================================= */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: var(--radius-pill);
  font-size: 11.5px; font-weight: 800;
  letter-spacing: 0.02em; line-height: 1.6;
  white-space: nowrap;
  background-color: var(--ink-100);
  color: var(--ink-700);
}
.badge--scheduled { background-color: var(--info-100); color: var(--info-700); }
.badge--boarding { background-color: var(--accent-100); color: var(--accent-700); }
.badge--in_transit { background-color: var(--brand-100); color: var(--brand-700); }
.badge--completed { background-color: var(--success-100); color: var(--success-700); }
.badge--cancelled { background-color: var(--danger-100); color: var(--danger-700); }
.badge--missed { background-color: var(--danger-100); color: var(--danger-700); }
.badge--available, .badge--valid, .badge--active, .badge--approved { background-color: var(--success-100); color: var(--success-700); }
.badge--reserved { background-color: var(--info-100); color: var(--info-700); }
.badge--boarded { background-color: var(--brand-100); color: var(--brand-700); }
.badge--released, .badge--inactive { background-color: var(--ink-100); color: var(--ink-600); }
.badge--pending, .badge--unverified { background-color: var(--warning-100); color: var(--warning-700); }
.badge--rejected, .badge--suspended { background-color: var(--danger-100); color: var(--danger-700); }
.badge--used { background-color: var(--ink-100); color: var(--ink-700); }

.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: var(--radius-pill);
  background-color: var(--white);
  border: 2px solid var(--border-subtle);
  font-size: 12.5px; font-weight: 700;
  color: var(--ink-700);
}
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: var(--radius-pill);
  background-color: var(--brand-050);
  border: 2px solid var(--brand-200);
  color: var(--brand-700);
  font-size: 12px; font-weight: 800;
}

/* =========================================================================
   09. CARDS & LISTS
   ========================================================================= */
.card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition: box-shadow var(--duration-base) var(--ease-standard);
  animation: card-in var(--duration-slow) var(--ease-out) backwards;
}
@keyframes card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.card:hover { box-shadow: var(--shadow-sm); }

.card__header {
  display: flex; flex-wrap: wrap; align-items: center;
  justify-content: space-between; gap: 12px;
  padding: 18px 22px;
  border-bottom: 2px solid var(--border-subtle);
}
.card__title { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
.card__subtitle { margin-top: 2px; font-size: 13px; color: var(--text-muted); }
.card__body { padding: 22px; }
.card__body--tight { padding: 12px 16px; }
.card__body--flush { padding: 0; }
.card__footer {
  padding: 16px 22px;
  border-top: 2px solid var(--border-subtle);
  background-color: var(--ink-050);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.view-stack { display: flex; flex-direction: column; gap: 20px; }
.split-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 20px; align-items: start;
}

.list { display: flex; flex-direction: column; }
.list__item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border-subtle);
  transition: background-color var(--duration-fast) var(--ease-standard);
}
.list__item:last-child { border-bottom: none; }
.list__item--interactive { cursor: pointer; }
.list__item--interactive:hover { background-color: var(--ink-050); }
.list__main { min-width: 0; }
.list__title { font-size: 14px; font-weight: 700; }
.list__meta { margin-top: 2px; font-size: 12.5px; color: var(--text-muted); }
.list__actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* =========================================================================
   10. TABLES
   ========================================================================= */
.table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.data-table {
  width: 100%; border-collapse: collapse;
  font-size: 13.5px; min-width: 620px;
}
.data-table thead th {
  position: sticky; top: 0; z-index: 1;
  padding: 13px 16px; text-align: left;
  font-size: 11.5px; font-weight: 800;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-600);
  background-color: var(--ink-050);
  border-bottom: 2px solid var(--border-subtle);
  white-space: nowrap;
}
.data-table tbody td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--ink-800);
  vertical-align: middle;
}
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr { transition: background-color var(--duration-fast) var(--ease-standard); }
.data-table tbody tr:hover { background-color: var(--ink-050); }

/* =========================================================================
   11. EMPTY / LOADING
   ========================================================================= */
.empty-state {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  animation: fade-in var(--duration-base) var(--ease-out);
}
.empty-state__icon {
  font-size: 40px; line-height: 1;
  margin-bottom: 16px; opacity: 0.9;
  filter: drop-shadow(0 6px 14px rgba(109, 95, 250, 0.20));
}
.empty-state__title { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.empty-state__message {
  margin-top: 6px; max-width: 420px;
  font-size: 13.5px; line-height: 1.6;
  color: var(--text-muted);
}
.empty-state__actions { margin-top: 20px; }

.loading-state {
  display: flex; align-items: center; justify-content: center;
  gap: 12px;
  padding: 60px 16px;
  color: var(--text-muted);
  font-size: 13.5px;
  font-weight: 600;
}

/* =========================================================================
   12. MODAL
   ========================================================================= */
.modal-backdrop {
  position: fixed; inset: 0;
  z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  background-color: rgba(58, 46, 140, 0.35);
  backdrop-filter: blur(6px);
  animation: fade-in var(--duration-base) var(--ease-out);
}
.modal {
  width: 100%; max-width: 560px;
  max-height: calc(100vh - 48px);
  display: flex; flex-direction: column;
  background-color: var(--white);
  border: 3px solid var(--brand-500);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: modal-in var(--duration-base) var(--ease-out);
}
.modal__header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 2px solid var(--border-subtle);
}
.modal__title { font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
.modal__close {
  font-size: 26px; line-height: 1;
  color: var(--ink-500);
  padding: 0 6px;
  border-radius: var(--radius-sm);
}
.modal__close:hover { color: var(--text-primary); background-color: var(--ink-100); }
.modal__body { padding: 22px; overflow-y: auto; }
.modal__footer {
  display: flex; flex-wrap: wrap;
  justify-content: flex-end; gap: 12px;
  padding: 16px 22px;
  border-top: 2px solid var(--border-subtle);
  background-color: var(--ink-050);
}
.modal__footer:empty { display: none; }

@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes modal-in {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* =========================================================================
   13. TOASTS
   ========================================================================= */
.toast-container {
  position: fixed;
  top: calc(var(--header-height) + 16px);
  right: 20px;
  z-index: var(--z-toast);
  display: flex; flex-direction: column; gap: 12px;
  width: min(360px, calc(100vw - 40px));
  pointer-events: none;
}
.toast {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background-color: rgba(255,255,255,0.98);
  backdrop-filter: blur(12px);
  border: 2px solid var(--border-subtle);
  border-left: 6px solid var(--brand-500);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  animation: toast-in var(--duration-slow) var(--ease-spring);
}
.toast--success { border-left-color: var(--success-500); }
.toast--danger { border-left-color: var(--danger-500); }
.toast--warning { border-left-color: var(--warning-500); }
.toast--info { border-left-color: var(--brand-500); }
.toast__icon { font-size: 17px; line-height: 1.2; }
.toast__content { flex: 1 1 auto; min-width: 0; }
.toast__title { font-size: 13.5px; font-weight: 800; }
.toast__message {
  margin-top: 2px; font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45; word-break: break-word;
}
.toast__close { flex: 0 0 auto; font-size: 18px; line-height: 1; color: var(--ink-400); padding: 0 2px; }
.toast__close:hover { color: var(--ink-700); }
.toast.is-leaving { animation: toast-out var(--duration-base) var(--ease-standard) forwards; }
@keyframes toast-in {
  from { opacity: 0; transform: translateX(28px) scale(0.96); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes toast-out {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(28px); }
}

/* =========================================================================
   14. LOADER
   ========================================================================= */
.global-loader {
  position: fixed; inset: 0;
  z-index: var(--z-loader);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px;
  background-color: rgba(250, 247, 255, 0.85);
  backdrop-filter: blur(6px);
}
.global-loader__text { font-size: 13.5px; font-weight: 700; color: var(--ink-700); }
.spinner {
  width: 38px; height: 38px;
  border-radius: 50%;
  border: 4px solid var(--brand-100);
  border-top-color: var(--brand-600);
  animation: spin 0.8s linear infinite;
}
.spinner--small { width: 18px; height: 18px; border-width: 3px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* =========================================================================
   15. AUTH SCREEN — LIGHT & WARM
   ========================================================================= */

/* ----- Background canvas (very light) ----- */
.bg-canvas {
  position: fixed;
  inset: 0;
  z-index: var(--z-bg);
  overflow: hidden;
  pointer-events: none;
  background: linear-gradient(160deg, #FAF7FF 0%, #F2EEFF 45%, #FEF6EE 100%);
}
.bg-canvas__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.7;
  animation: blob-float 26s var(--ease-standard) infinite;
}
.bg-canvas__blob--1 {
  width: 520px; height: 520px;
  top: -120px; left: -120px;
  background: radial-gradient(circle, rgba(168, 155, 255, 0.75), transparent 70%);
}
.bg-canvas__blob--2 {
  width: 460px; height: 460px;
  bottom: -140px; right: -80px;
  background: radial-gradient(circle, rgba(252, 168, 104, 0.65), transparent 70%);
  animation-delay: -9s;
}
.bg-canvas__blob--3 {
  width: 380px; height: 380px;
  top: 45%; left: 55%;
  background: radial-gradient(circle, rgba(255, 228, 234, 0.85), transparent 70%);
  animation-delay: -15s;
}
.bg-canvas__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(109, 95, 250, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(109, 95, 250, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at 50% 40%, black 30%, transparent 75%);
  -webkit-mask-image: radial-gradient(circle at 50% 40%, black 30%, transparent 75%);
}
@keyframes blob-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(40px, -60px) scale(1.08); }
  66%      { transform: translate(-30px, 40px) scale(0.95); }
}

/* ----- Screen wrapper ----- */
.auth-screen {
  position: relative;
  z-index: var(--z-content);
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  min-height: 100vh;
}

/* =========== HERO (left) =========== */
.auth-hero {
  position: relative;
  display: flex; align-items: center;
  padding: 56px 56px;
  overflow: hidden;
}
.auth-hero__inner {
  position: relative;
  max-width: 560px;
  margin: 0 auto;
  width: 100%;
}

/* ---------- HEADER: brand + divider + tagline ---------- */
.hero-header {
  display: flex; flex-direction: column;
  gap: 22px;
}

.hero-header__brand {
  display: flex; align-items: center;
  gap: 20px;
}

.hero-header__icon {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 72px; height: 72px;
  flex: 0 0 auto;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, #FFFFFF, #F2EEFF);
  border: 3px solid var(--brand-500);
  box-shadow:
    0 10px 28px rgba(109, 95, 250, 0.25),
    inset 0 1px 0 rgba(255,255,255,0.9);
}
.hero-header__icon-glyph {
  font-size: 34px;
  line-height: 1;
  filter: drop-shadow(0 4px 10px rgba(109, 95, 250, 0.35));
  animation: icon-bob 4s var(--ease-standard) infinite;
}
@keyframes icon-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}
.hero-header__icon-ring {
  position: absolute; inset: -10px;
  border-radius: var(--radius-xl);
  border: 3px dashed rgba(109, 95, 250, 0.35);
  animation: ring-rotate 24s linear infinite;
}
@keyframes ring-rotate {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.hero-header__name {
  font-family: var(--font-display);
  font-size: clamp(32px, 3.6vw, 48px);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.05;
  background: linear-gradient(135deg, #3A2E8C 0%, #6D5FFA 45%, #EA580C 100%);
  -webkit-background-clip: text;
          background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

/* ---------- Animated divider ---------- */
/* ---------- Animated divider ---------- */
.hero-header__divider {
  position: relative;         /* NEW: needed so the bus can be positioned inside */
  overflow: visible;          /* NEW: allow the bus to travel past the edges */
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 2px 0 0;
}

.hero-header__divider-line {
  flex: 1 1 auto;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(109, 95, 250, 0.65) 20%,
    rgba(234, 88, 12, 0.65) 50%,
    rgba(109, 95, 250, 0.65) 80%,
    transparent 100%);
  background-size: 200% 100%;
  animation: divider-shimmer 4s linear infinite;
}

@keyframes divider-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.hero-header__divider-dot {
  flex: 0 0 auto;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-500), var(--accent-500));
  box-shadow: 0 0 0 5px rgba(109, 95, 250, 0.15);
  animation: dot-pulse 2s var(--ease-standard) infinite;
}

@keyframes dot-pulse {
  0%, 100% { box-shadow: 0 0 0 5px rgba(109, 95, 250, 0.15); }
  50%      { box-shadow: 0 0 0 10px rgba(109, 95, 250, 0.06); }
}

/* ---------- Mini Lagos danfo bus ---------- */
.hero-header__divider-bus {
  position: absolute;
  top: 50%;
  left: -30px;                        /* start off-screen to the left */
  transform: translateY(-50%);
  width: 26px;
  height: 15px;
  z-index: 2;
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgba(26, 23, 48, 0.25));
  animation: divider-bus-drive 9s linear infinite;
  /* Let the browser know only `left` and `opacity` will change.
     This lets the compositor move the bus without repainting the page. */
  will-change: left, opacity;
}

@keyframes divider-bus-drive {
  0%   { left: -30px;             opacity: 0; }
  6%   {                          opacity: 1; }
  90%  {                          opacity: 1; }
  100% { left: calc(100% + 5px);  opacity: 0; }
}

/* Accessibility: if the user prefers reduced motion, keep the bus hidden */
@media (prefers-reduced-motion: reduce) {
  .hero-header__divider-bus {
    animation: none;
    opacity: 0;
  }
}

.hero-header__divider-line {
  flex: 1 1 auto;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(109, 95, 250, 0.65) 20%,
    rgba(234, 88, 12, 0.65) 50%,
    rgba(109, 95, 250, 0.65) 80%,
    transparent 100%);
  background-size: 200% 100%;
  animation: divider-shimmer 4s linear infinite;
}
@keyframes divider-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.hero-header__divider-dot {
  flex: 0 0 auto;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-500), var(--accent-500));
  box-shadow: 0 0 0 5px rgba(109, 95, 250, 0.15);
  animation: dot-pulse 2s var(--ease-standard) infinite;
}
@keyframes dot-pulse {
  0%, 100% { box-shadow: 0 0 0 5px rgba(109, 95, 250, 0.15); }
  50%      { box-shadow: 0 0 0 10px rgba(109, 95, 250, 0.06); }
}

.hero-header__body { display: flex; flex-direction: column; gap: 16px; }

.hero-header__lede {
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-700);
  max-width: 520px;
  font-weight: 500;
}
.hero-header__tagline {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.005em;
  color: var(--accent-600);
  padding: 6px 0 6px 16px;
  border-left: 4px solid var(--accent-500);
  line-height: 1.4;
}

/* ---------- Feature list ---------- */
.hero-features {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 40px;
}
.hero-features__item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.75);
  border: 2px solid rgba(109, 95, 250, 0.12);
  backdrop-filter: blur(8px);
  transition:
    transform var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}
.hero-features__item:hover {
  transform: translateY(-3px);
  border-color: rgba(109, 95, 250, 0.35);
  box-shadow: 0 12px 28px rgba(109, 95, 250, 0.15);
}
.hero-features__icon {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--brand-100), var(--accent-100));
  font-size: 17px;
}
.hero-features__label {
  font-size: 13.5px; font-weight: 800;
  color: var(--ink-900);
  line-height: 1.35;
}
.hero-features__desc {
  font-size: 12px;
  color: var(--ink-600);
  line-height: 1.5;
  margin-top: 3px;
  font-weight: 500;
}

/* ---------- Footer ---------- */
.hero-footer {
  display: flex; align-items: center;
  gap: 8px;
  margin-top: 48px;
  padding-top: 20px;
  border-top: 2px dashed rgba(109, 95, 250, 0.20);
  font-size: 12.5px;
  letter-spacing: 0.02em;
  font-weight: 600;
}
.hero-footer__label { color: var(--ink-500); }
.hero-footer__brand { color: var(--accent-600); font-weight: 800; }

/* =========== AUTH CARD (right) — THICK BORDER =========== */
.auth-panel {
  display: flex; align-items: center; justify-content: center;
  padding: 56px 48px;
}

.auth-panel__inner { width: 100%; max-width: 440px; }

.auth-card {
  position: relative;
  padding: 34px 30px 26px;
  background: var(--white);
  border: var(--border-thick) solid var(--brand-600);
  border-radius: var(--radius-xl);
  box-shadow:
    0 24px 60px rgba(109, 95, 250, 0.22),
    0 8px 20px rgba(109, 95, 250, 0.10),
    inset 0 1px 0 rgba(255,255,255,0.9);
  animation: card-glow 5s var(--ease-standard) infinite;
}
@keyframes card-glow {
  0%, 100% {
    box-shadow:
      0 24px 60px rgba(109, 95, 250, 0.22),
      0 8px 20px rgba(109, 95, 250, 0.10);
  }
  50% {
    box-shadow:
      0 28px 68px rgba(109, 95, 250, 0.32),
      0 10px 24px rgba(234, 88, 12, 0.14);
  }
}

/* ---------- Tabs ---------- */
.auth-tabs {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 5px;
  margin-bottom: 26px;
  border-radius: var(--radius-md);
  background-color: var(--ink-100);
  border: 2px solid var(--border-subtle);
}
.auth-tab {
  position: relative; z-index: 1;
  padding: 11px 12px;
  border-radius: var(--radius-sm);
  font-size: 14px; font-weight: 800;
  color: var(--ink-600);
  transition: color var(--duration-base) var(--ease-standard);
}
.auth-tab.is-active { color: var(--brand-700); }
.auth-tabs__indicator {
  position: absolute;
  top: 5px; bottom: 5px; left: 5px;
  width: calc(50% - 7px);
  border-radius: var(--radius-sm);
  background-color: var(--white);
  box-shadow: 0 2px 6px rgba(109, 95, 250, 0.15);
  transition: transform var(--duration-base) var(--ease-spring);
  z-index: 0;
}
.auth-tabs:has(.auth-tab:nth-child(2).is-active) .auth-tabs__indicator {
  transform: translateX(calc(100% + 4px));
}

/* ---------- Forms ---------- */
.auth-form { animation: form-in var(--duration-slow) var(--ease-out); }
@keyframes form-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.auth-form__title {
  font-family: var(--font-display);
  font-size: 26px; font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--ink-900);
}
.auth-form__subtitle {
  margin-top: 6px;
  margin-bottom: 22px;
  font-size: 13.5px;
  color: var(--text-secondary);
  line-height: 1.55;
}
.auth-form__row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  margin-bottom: 22px;
}
.auth-card__footer {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 2px dashed var(--border-subtle);
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
}
.auth-card__footer strong { color: var(--brand-600); font-weight: 800; }

/* ---------- Role picker ---------- */
.role-picker {
  margin: 0 0 20px;
  padding: 0; border: none;
}
.role-picker__legend {
  padding: 0; margin-bottom: 12px;
  font-size: 13px; font-weight: 800;
  color: var(--ink-800);
}
.role-picker__options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.role-option { position: relative; cursor: pointer; }
.role-option input[type="radio"] {
  position: absolute; opacity: 0;
  width: 0; height: 0;
}
.role-option__card {
  display: flex; flex-direction: column;
  align-items: center; text-align: center;
  gap: 4px;
  padding: 16px 8px;
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background-color: var(--white);
  transition:
    border-color var(--duration-base) var(--ease-standard),
    background-color var(--duration-base) var(--ease-standard),
    transform var(--duration-base) var(--ease-spring),
    box-shadow var(--duration-base) var(--ease-standard);
}
.role-option__card:hover {
  border-color: var(--brand-400);
  background-color: var(--brand-050);
  transform: translateY(-2px);
}
.role-option input:checked + .role-option__card {
  border-color: var(--brand-600);
  background: linear-gradient(135deg, var(--brand-050), #FFF9F2);
  box-shadow: 0 6px 16px rgba(109, 95, 250, 0.18);
}
.role-option__icon { font-size: 22px; line-height: 1; }
.role-option__label { font-size: 13px; font-weight: 800; color: var(--ink-800); }
.role-option__hint { font-size: 11px; line-height: 1.35; color: var(--text-muted); }

/* =========================================================================
   16. APP SHELL
   ========================================================================= */
.app-shell {
  position: relative;
  z-index: var(--z-content);
  min-height: 100vh;
  background-color: var(--surface-page);
}

/* ---------- Header ---------- */
.app-header {
  position: fixed; top: 0; left: 0; right: 0;
  z-index: var(--z-header);
  display: flex; align-items: center;
  gap: 12px;
  height: var(--header-height);
  padding: 0 20px;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(20px) saturate(160%);
  border-bottom: 2px solid var(--border-subtle);
}
.app-header__menu {
  display: none; flex-direction: column;
  justify-content: center; gap: 5px;
  width: 42px; height: 42px;
  padding: 0 10px;
  border-radius: var(--radius-md);
}
.app-header__menu:hover { background-color: var(--ink-100); }
.app-header__menu span {
  display: block; height: 2px; border-radius: 2px;
  background-color: var(--ink-700);
}

.app-header__brand {
  display: flex; align-items: center; gap: 12px;
  min-width: 0; color: inherit;
  text-decoration: none;
  padding: 4px 6px;
  border-radius: var(--radius-md);
}
.app-header__brand:hover { text-decoration: none; background-color: var(--ink-050); }

.app-header__brand-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 42px; height: 42px; flex: 0 0 auto;
  font-size: 20px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--brand-600), var(--accent-500));
  box-shadow: 0 6px 18px rgba(109, 95, 250, 0.35);
  transition: transform var(--duration-base) var(--ease-spring);
}
.app-header__brand:hover .app-header__brand-mark { transform: rotate(-6deg) scale(1.05); }

.app-header__brand-text {
  display: flex; flex-direction: column;
  min-width: 0; line-height: 1.15;
  position: relative;
  padding-left: 12px;
}
.app-header__brand-text::before {
  content: "";
  position: absolute; left: 0; top: 4px; bottom: 4px;
  width: 3px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--brand-500), var(--accent-500));
}
.app-header__brand-text strong {
  font-family: var(--font-display);
  font-size: 15px; font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--ink-900);
}
.app-header__brand-divider {
  display: block; height: 1px;
  margin: 3px 0 2px;
  background: linear-gradient(90deg, var(--brand-500), transparent);
  opacity: 0.5;
}
.app-header__brand-text small {
  font-size: 10.5px;
  color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: 0.02em;
  font-weight: 600;
}

.app-header__actions {
  display: flex; align-items: center; gap: 8px;
  margin-left: auto;
}

/* ---------- Body ---------- */
.app-body {
  display: flex; align-items: flex-start;
  padding-top: var(--header-height);
}

/* ---------- Sidebar ---------- */
.app-sidebar {
  position: fixed;
  top: var(--header-height); bottom: 0; left: 0;
  z-index: var(--z-sidebar);
  display: flex; flex-direction: column;
  width: var(--sidebar-width);
  padding: 16px 12px;
  background-color: var(--white);
  border-right: 2px solid var(--border-subtle);
  overflow-y: auto;
}
.app-nav { display: flex; flex-direction: column; gap: 2px; }
.app-nav__group-label {
  padding: 16px 12px 8px;
  font-size: 10.5px; font-weight: 800;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink-400);
}
.app-nav__item {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-md);
  font-size: 14px; font-weight: 700;
  color: var(--ink-700);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard),
              color var(--duration-fast) var(--ease-standard),
              transform var(--duration-fast) var(--ease-standard);
}
.app-nav__item:hover {
  background-color: var(--ink-050);
  color: var(--text-primary);
  text-decoration: none;
  transform: translateX(2px);
}
.app-nav__item.is-active {
  background: linear-gradient(135deg, var(--brand-050), #FFF7EF);
  color: var(--brand-700);
}
.app-nav__item.is-active::before {
  content: "";
  position: absolute;
  left: 0; top: 10px; bottom: 10px;
  width: 4px;
  border-radius: 4px;
  background: linear-gradient(180deg, var(--brand-500), var(--accent-500));
}
.app-nav__icon {
  flex: 0 0 auto; width: 22px; text-align: center;
  font-size: 15px; line-height: 1;
}
.app-nav__label {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.app-nav__count {
  flex: 0 0 auto;
  min-width: 22px; padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, var(--accent-600), var(--accent-500));
  color: var(--white);
  font-size: 10.5px; font-weight: 800;
  text-align: center;
}
.app-sidebar__footer {
  margin-top: auto;
  padding: 20px 12px 8px;
  border-top: 2px solid var(--border-subtle);
}
.app-sidebar__credit { font-size: 11px; line-height: 1.5; color: var(--text-muted); }
.app-sidebar__credit strong { color: var(--brand-600); font-weight: 800; }
.app-sidebar__version { margin-top: 4px; font-size: 10.5px; color: var(--ink-400); }

/* ---------- Main ---------- */
.app-main {
  flex: 1 1 auto; min-width: 0; width: 100%;
  margin-left: var(--sidebar-width);
  padding: 24px 24px 56px;
}
.app-main__inner {
  max-width: var(--content-max-width);
  margin: 0 auto;
  animation: page-in var(--duration-slow) var(--ease-out);
}
@keyframes page-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ---------- Bottom nav ---------- */
.app-bottom-nav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  z-index: var(--z-bottom-nav);
  height: var(--bottom-nav-height);
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
  background: rgba(255,255,255,0.97);
  backdrop-filter: blur(18px) saturate(160%);
  border-top: 2px solid var(--border-subtle);
}
.app-bottom-nav__item {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 2px;
  flex: 1 1 0; min-width: 0;
  padding: 4px 2px;
  border-radius: var(--radius-sm);
  font-size: 10.5px; font-weight: 700;
  color: var(--ink-500);
  text-align: center; text-decoration: none;
  transition: color var(--duration-fast) var(--ease-standard),
              transform var(--duration-base) var(--ease-spring);
}
.app-bottom-nav__item:hover { text-decoration: none; }
.app-bottom-nav__item.is-active { color: var(--brand-600); transform: translateY(-2px); }
.app-bottom-nav__icon { position: relative; font-size: 18px; line-height: 1; }
.app-bottom-nav__label {
  max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* =========================================================================
   17. USER MENU
   ========================================================================= */
.avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; flex: 0 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-600), var(--accent-500));
  color: var(--white);
  font-size: 13px; font-weight: 800;
  letter-spacing: 0.02em; text-transform: uppercase;
  user-select: none;
  box-shadow: 0 4px 12px rgba(109, 95, 250, 0.25);
}
.avatar--small { width: 30px; height: 30px; font-size: 11.5px; }
.avatar--large { width: 60px; height: 60px; font-size: 22px; }

.user-menu { position: relative; }
.user-menu__trigger {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: var(--radius-pill);
  border: 2px solid transparent;
  transition: background-color var(--duration-fast) var(--ease-standard);
}
.user-menu__trigger:hover { background-color: var(--ink-050); border-color: var(--border-subtle); }
.user-menu__meta { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; min-width: 0; }
.user-menu__meta strong {
  font-size: 13px; font-weight: 800;
  max-width: 130px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.user-menu__meta small {
  font-size: 10.5px; font-weight: 800;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--brand-600);
}
.user-menu__dropdown {
  position: absolute; top: calc(100% + 8px); right: 0;
  z-index: var(--z-header);
  width: 236px;
  padding: 8px;
  background-color: var(--white);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: dropdown-in var(--duration-base) var(--ease-out);
}
@keyframes dropdown-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.user-menu__item {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 13.5px; font-weight: 700;
  color: var(--ink-700);
  text-align: left;
}
.user-menu__item:hover { background-color: var(--ink-050); color: var(--text-primary); text-decoration: none; }
.user-menu__item--danger { color: var(--danger-600); }
.user-menu__item--danger:hover { background-color: var(--danger-100); color: var(--danger-700); }
.user-menu__divider { margin: 6px 0; }

/* =========================================================================
   18. WIDGETS
   ========================================================================= */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}
.stat-card {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 18px 20px;
  background-color: var(--white);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition: transform var(--duration-base) var(--ease-out),
              box-shadow var(--duration-base) var(--ease-out);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-card__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; flex: 0 0 auto;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--brand-050), var(--brand-100));
  color: var(--brand-700);
  font-size: 20px;
}
.stat-card__icon--accent { background: linear-gradient(135deg, var(--accent-100), #FFE4CC); color: var(--accent-700); }
.stat-card__icon--info   { background: linear-gradient(135deg, var(--info-100), #C7DBFF); color: var(--info-700); }
.stat-card__icon--success{ background: linear-gradient(135deg, var(--success-100), #A7F3E4); color: var(--success-700); }
.stat-card__icon--danger { background: linear-gradient(135deg, var(--danger-100), #FFCFD6); color: var(--danger-700); }
.stat-card__body { min-width: 0; }
.stat-card__value {
  font-family: var(--font-display);
  font-size: 26px; font-weight: 700;
  letter-spacing: -0.02em; line-height: 1.1;
}
.stat-card__label { margin-top: 2px; font-size: 12.5px; font-weight: 600; color: var(--text-muted); }

/* ---------- Search panel ---------- */
.search-panel {
  position: relative;
  padding: 24px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #FFFFFF 0%, #F5F2FF 55%, #FFF6EE 100%);
  border: 3px solid var(--brand-500);
  color: var(--ink-900);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.search-panel__title {
  font-family: var(--font-display);
  font-size: 20px; font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink-900);
}
.search-panel__subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-600);
  font-weight: 500;
}
.search-panel__form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px; align-items: end;
  margin-top: 20px;
}
.search-panel__field label {
  display: block; margin-bottom: 6px;
  font-size: 11.5px; font-weight: 800;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-700);
}
.search-panel__field input,
.search-panel__field select {
  width: 100%;
  padding: 13px 15px;
  font-size: 14px;
  color: var(--text-primary);
  background-color: var(--white);
  border: var(--border-input) solid var(--brand-200);
  border-radius: var(--radius-md);
  font-weight: 500;
}
.search-panel__field input:focus,
.search-panel__field select:focus {
  outline: none;
  border-color: var(--brand-600);
  box-shadow: var(--shadow-focus);
}
.search-panel__actions { display: flex; gap: 8px; }

/* ---------- Trip cards ---------- */
.trip-list { display: flex; flex-direction: column; gap: 12px; }
.trip-card {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 16px;
  padding: 18px 22px;
  background-color: var(--white);
  border: 2px solid var(--border-subtle);
  border-left: 6px solid var(--brand-500);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition: box-shadow var(--duration-base) var(--ease-out),
              transform var(--duration-base) var(--ease-out);
}
.trip-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.trip-card--scheduled  { border-left-color: var(--info-500); }
.trip-card--boarding   { border-left-color: var(--accent-500); }
.trip-card--in_transit { border-left-color: var(--brand-500); }
.trip-card--completed  { border-left-color: var(--success-500); }
.trip-card--cancelled  { border-left-color: var(--danger-500); opacity: 0.85; }

.trip-card__identity { flex: 0 0 auto; min-width: 96px; }
.trip-card__code {
  font-family: var(--font-mono);
  font-size: 15px; font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--brand-700);
}
.trip-card__vehicle { margin-top: 2px; font-size: 11.5px; color: var(--text-muted); }
.trip-card__route { flex: 1 1 220px; min-width: 0; }
.trip-card__cities {
  display: flex; align-items: center; gap: 8px;
  font-size: 14.5px; font-weight: 800; letter-spacing: -0.01em;
}
.trip-card__arrow { color: var(--accent-500); font-size: 13px; }
.trip-card__stops {
  margin-top: 3px; font-size: 12px;
  color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.trip-card__timing { flex: 0 0 auto; }
.trip-card__time {
  font-family: var(--font-display);
  font-size: 17px; font-weight: 700;
  letter-spacing: -0.01em;
}
.trip-card__date { margin-top: 1px; font-size: 11.5px; color: var(--text-muted); }
.trip-card__seats { flex: 0 0 auto; text-align: center; min-width: 78px; }
.trip-card__seats-value {
  font-family: var(--font-display);
  font-size: 20px; font-weight: 700; line-height: 1.1;
  color: var(--brand-700);
}
.trip-card__seats-value--low { color: var(--danger-600); }
.trip-card__seats-label { font-size: 11px; color: var(--text-muted); }
.trip-card__fare { flex: 0 0 auto; min-width: 96px; text-align: right; }
.trip-card__fare-value {
  font-family: var(--font-display);
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
}
.trip-card__fare-label { font-size: 11px; color: var(--text-muted); }
.trip-card__actions { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }

/* ---------- Map ---------- */
.map-container {
  position: relative;
  width: 100%; height: 340px;
  border-radius: var(--radius-lg);
  background-color: var(--ink-100);
  border: 2px solid var(--border-subtle);
  overflow: hidden;
}
.map-container--tall { height: 460px; }
.map-placeholder {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  height: 100%; gap: 8px;
  text-align: center; padding: 24px;
  color: var(--text-muted); font-size: 13px;
}
.map-placeholder__icon { font-size: 30px; opacity: 0.7; }
.map-overlay {
  position: absolute;
  left: 12px; bottom: 12px;
  z-index: 2;
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background-color: rgba(255,255,255,0.97);
  border: 2px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  font-size: 12px; line-height: 1.45;
}
.map-overlay__label { font-weight: 800; color: var(--ink-800); }
.map-overlay__value { color: var(--text-muted); }
.map-overlay--stale { border-color: var(--warning-500); background-color: var(--warning-100); }
.map-overlay--stale .map-overlay__label { color: var(--warning-700); }

/* ---------- Seat grid ---------- */
.seat-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.seat-legend__item { display: inline-flex; align-items: center; gap: 6px; }
.seat-legend__swatch {
  width: 15px; height: 15px; border-radius: var(--radius-xs);
  border: 2px solid var(--border-strong);
}
.seat-legend__swatch--available { background-color: var(--white); }
.seat-legend__swatch--reserved  { background-color: var(--info-100); border-color: var(--info-500); }
.seat-legend__swatch--boarded   { background-color: var(--brand-100); border-color: var(--brand-600); }
.seat-legend__swatch--released  { background-color: var(--ink-100); }

.seat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  gap: 8px;
}
.seat {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 2px;
  aspect-ratio: 1 / 1;
  padding: 4px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--border-subtle);
  background-color: var(--white);
  font-size: 12px; font-weight: 800;
  color: var(--ink-700);
  transition: transform var(--duration-fast) var(--ease-spring),
              border-color var(--duration-fast) var(--ease-standard),
              background-color var(--duration-fast) var(--ease-standard);
}
.seat__number { font-family: var(--font-mono); font-size: 13px; }
.seat__state { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
.seat--available { cursor: pointer; border-color: var(--brand-200); }
.seat--available:hover {
  border-color: var(--brand-600);
  background-color: var(--brand-050);
  transform: translateY(-2px) scale(1.03);
}
.seat--selected {
  border-color: var(--brand-600);
  background: linear-gradient(135deg, var(--brand-600), var(--brand-500));
  color: var(--white);
  box-shadow: 0 6px 16px rgba(109, 95, 250, 0.35);
}
.seat--selected .seat__state { color: rgba(255,255,255,0.85); }
.seat--reserved { background-color: var(--info-100); border-color: var(--info-500); color: var(--info-700); cursor: not-allowed; }
.seat--boarded { background-color: var(--brand-100); border-color: var(--brand-600); color: var(--brand-700); cursor: not-allowed; }
.seat--released { background-color: var(--ink-100); border-color: var(--border-subtle); color: var(--ink-500); cursor: not-allowed; }

/* ---------- Ticket ---------- */
.ticket-card {
  position: relative;
  width: 100%; max-width: 420px;
  background-color: var(--white);
  border: 3px solid var(--brand-500);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.ticket-card__header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  padding: 16px 22px;
  background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
  color: var(--white);
}
.ticket-card__brand { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; letter-spacing: -0.01em; }
.ticket-card__status {
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background-color: rgba(255,255,255,0.25);
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.04em; text-transform: uppercase;
}
.ticket-card__body { padding: 22px; }
.ticket-card__route {
  font-family: var(--font-display);
  display: flex; align-items: center; gap: 12px;
  font-size: 18px; font-weight: 700;
  letter-spacing: -0.015em;
}
.ticket-card__details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 2px dashed var(--border-strong);
}
.ticket-card__detail dt {
  font-size: 10.5px; font-weight: 800;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-muted);
}
.ticket-card__detail dd {
  margin: 4px 0 0;
  font-size: 14px; font-weight: 800;
  color: var(--ink-900);
  word-break: break-word;
}
.ticket-card__qr {
  display: flex; flex-direction: column;
  align-items: center; gap: 12px;
  margin-top: 20px; padding-top: 20px;
  border-top: 2px dashed var(--border-strong);
}
.ticket-card__qr canvas, .ticket-card__qr img {
  width: 168px; height: 168px;
  padding: 8px;
  background-color: var(--white);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
.ticket-card__qr-caption { font-size: 11.5px; color: var(--text-muted); text-align: center; font-weight: 600; }

/* ---------- Notifications ---------- */
.notification-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border-subtle);
  transition: background-color var(--duration-fast) var(--ease-standard);
  cursor: pointer;
}
.notification-item:last-child { border-bottom: none; }
.notification-item--unread { background-color: var(--brand-050); }
.notification-item:hover { background-color: var(--ink-050); }
.notification-item__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; flex: 0 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-050), var(--brand-100));
  font-size: 15px;
}
.notification-item__body { flex: 1 1 auto; min-width: 0; }
.notification-item__title { font-size: 13.5px; font-weight: 800; }
.notification-item__message {
  margin-top: 2px; font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: break-word;
}
.notification-item__time { margin-top: 5px; font-size: 11.5px; color: var(--text-muted); }
.notification-dot {
  width: 8px; height: 8px; flex: 0 0 auto;
  margin-top: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-600), var(--accent-500));
  animation: dot-pulse 2s var(--ease-standard) infinite;
}

/* ---------- Feedback ---------- */
.rating-input {
  display: flex; flex-direction: row-reverse;
  justify-content: flex-end; gap: 4px;
}
.rating-input input { position: absolute; opacity: 0; width: 0; height: 0; }
.rating-input label {
  font-size: 30px; line-height: 1;
  color: var(--ink-300);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard),
              transform var(--duration-fast) var(--ease-spring);
}
.rating-input label:hover,
.rating-input label:hover ~ label,
.rating-input input:checked ~ label { color: var(--accent-500); }
.rating-input label:hover { transform: scale(1.15); }

/* ---------- Detail list ---------- */
.detail-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}
.detail-list dt {
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-muted);
}
.detail-list dd {
  margin: 4px 0 0; font-size: 14px; font-weight: 700;
  color: var(--ink-900);
  word-break: break-word;
}

/* ---------- Audit ---------- */
.audit-entry {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
}
.audit-entry:last-child { border-bottom: none; }
.audit-entry__time {
  flex: 0 0 140px; font-size: 12px;
  color: var(--text-muted); font-family: var(--font-mono);
}
.audit-entry__text { flex: 1 1 auto; color: var(--ink-800); line-height: 1.5; font-weight: 500; }

/* ---------- Scanner ---------- */
.scanner-result {
  margin-top: 20px; padding: 22px;
  border-radius: var(--radius-lg);
  text-align: center;
  border: 3px solid var(--border-subtle);
  background-color: var(--white);
  animation: card-in var(--duration-base) var(--ease-out);
}
.scanner-result--valid   { border-color: var(--success-500); background-color: var(--success-100); }
.scanner-result--invalid { border-color: var(--danger-500); background-color: var(--danger-100); }
.scanner-result--used    { border-color: var(--warning-500); background-color: var(--warning-100); }
.scanner-result__icon { font-size: 44px; line-height: 1; }
.scanner-result__title {
  margin-top: 12px;
  font-family: var(--font-display);
  font-size: 20px; font-weight: 700;
  letter-spacing: -0.015em;
}
.scanner-result__message {
  margin-top: 6px; font-size: 13.5px;
  color: var(--text-secondary); line-height: 1.55;
}

/* =========================================================================
   19. RESPONSIVE
   ========================================================================= */
@media (min-width: 1440px) {
  .app-main { padding-left: 32px; padding-right: 32px; }
}
@media (max-width: 1180px) {
  .split-layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 1024px) {
  .auth-screen { grid-template-columns: minmax(0, 1fr); }
  .auth-hero { padding: 48px 32px; }
  .auth-hero__inner { max-width: 640px; }
  .auth-panel { padding: 48px 24px; }
}
@media (max-width: 900px) {
  .app-header__menu { display: flex; }
  .app-sidebar {
    width: 272px;
    transform: translateX(-102%);
    transition: transform var(--duration-slow) var(--ease-out);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-backdrop);
  }
  .app-shell.sidebar-open::after {
    content: "";
    position: fixed;
    inset: var(--header-height) 0 0 0;
    z-index: calc(var(--z-backdrop) - 1);
    background-color: rgba(58, 46, 140, 0.35);
    backdrop-filter: blur(4px);
    animation: fade-in var(--duration-base) var(--ease-out);
  }
  .app-shell.sidebar-open .app-sidebar { transform: translateX(0); }
  .app-main { margin-left: 0; padding: 20px 20px 56px; }
}
@media (max-width: 720px) {
  :root { --header-height: 60px; }
  body { font-size: 14.5px; }
  .app-header { padding: 0 12px; }
  .app-header__brand-text small { display: none; }
  .app-header__brand-divider { display: none; }
  .user-menu__meta { display: none; }
  .user-menu__trigger { padding: 4px; }
  .app-main { padding: 16px 16px calc(var(--bottom-nav-height) + 40px); }
  .app-bottom-nav { display: flex; }
  .page-header { margin-bottom: 20px; }
  .page-header__title { font-size: 22px; }
  .page-header__actions { width: 100%; }
  .page-header__actions .button { width: 100%; }
  .card__header, .card__body, .card__footer { padding-left: 16px; padding-right: 16px; }
  .field-row { grid-template-columns: 1fr; gap: 0; }
  .role-picker__options { grid-template-columns: 1fr; }
  .role-option__card {
    flex-direction: row;
    justify-content: flex-start;
    text-align: left;
    gap: 12px;
    padding: 14px 16px;
  }
  .role-option__label { flex: 1 1 auto; }
  .role-option__hint { flex: 0 0 auto; }
  .search-panel { padding: 18px; }
  .search-panel__form { grid-template-columns: minmax(0, 1fr); }
  .search-panel__actions { flex-direction: column; }
  .search-panel__actions .button { width: 100%; }
  .trip-card { padding: 16px; gap: 12px; }
  .trip-card__identity, .trip-card__timing, .trip-card__seats, .trip-card__fare { flex: 1 1 auto; }
  .trip-card__fare { text-align: left; }
  .trip-card__actions { width: 100%; }
  .trip-card__actions .button { flex: 1 1 auto; }
  .stat-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .stat-card { padding: 14px 16px; gap: 12px; }
  .stat-card__value { font-size: 20px; }
  .toast-container {
    top: auto;
    bottom: calc(var(--bottom-nav-height) + 12px);
    left: 12px; right: 12px;
    width: auto;
  }
  .modal { max-height: calc(100vh - 24px); }
  .modal__body { padding: 16px; }
  .modal__footer { padding: 12px 16px; }
  .modal__footer .button { flex: 1 1 auto; }
  .map-container { height: 260px; }
  .map-container--tall { height: 340px; }
  .ticket-card__details { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .audit-entry { flex-direction: column; gap: 2px; }
  .audit-entry__time { flex: 0 0 auto; }
  .seat-grid { grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); }

  /* Auth screen */
  .auth-hero { padding: 40px 20px 28px; }
  .hero-header__icon { width: 60px; height: 60px; border-radius: var(--radius-lg); border-width: 3px; }
  .hero-header__icon-glyph { font-size: 28px; }
  .hero-header__icon-ring { inset: -8px; }
  .hero-header__name { font-size: 28px; }
  .hero-features { grid-template-columns: minmax(0, 1fr); gap: 10px; margin-top: 28px; }
  .hero-footer { margin-top: 32px; }
  .auth-panel { padding: 28px 16px 48px; }
  .auth-card { padding: 24px 20px 20px; }
  .auth-form__title { font-size: 22px; }
  .auth-form__row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .auth-form__row .link-button { align-self: flex-end; }
  .form-actions { flex-direction: column; }
  .form-actions .button { width: 100%; }
}
@media (max-width: 420px) {
  .app-header__brand-text strong { font-size: 14px; }
  .stat-grid { grid-template-columns: minmax(0, 1fr); }
  .data-table { min-width: 520px; }
  .ticket-card__qr canvas, .ticket-card__qr img { width: 148px; height: 148px; }
}
@media (max-width: 340px) {
  .app-bottom-nav__label { display: none; }
}
@media print {
  .app-header, .app-sidebar, .app-bottom-nav,
  .toast-container, .global-loader, .bg-canvas { display: none !important; }
  .app-main { margin-left: 0; padding: 0; }
  .card, .trip-card { box-shadow: none; border: 1px solid #ccc; }
}

/* =========================================================================
   20. MOTION PREFERENCES
   ========================================================================= */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
@media (forced-colors: active) {
  .button, .card, .trip-card, .seat, .badge, .auth-card { border: 2px solid CanvasText; }
}
