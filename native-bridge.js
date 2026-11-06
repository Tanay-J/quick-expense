/**
 * native-bridge.js
 * Lightweight Native Android / Capacitor Bridge + Local Mac Widget Simulator:
 * 1. Crisp Native Haptics (Android JavascriptInterface + Capacitor + navigator.vibrate fallback)
 * 2. Hardware Back Gesture & Browser History stack integration (popstate + onAndroidBackPressed)
 * 3. 60/120fps Swipe-Down-to-Dismiss gesture for bottom sheets & full-screen overlays
 * 4. Real-time Android Home Screen Widget sync + Native Floating Quick-Add queue consumer
 * 5. Push-to-Publish OTA Live Updater (pulls latest GitHub main assets without reinstalling APK)
 * 6. Local Mac Browser "Android Home Screen Widget & Floating Quick-Add" Preview Simulator
 */

import {
  getCategoryById,
  getPaymentMethodById,
  toLocalISODate
} from './parser.js?v=18';
import { normalizeEntryType } from './sync.js?v=18';
import { computeSameSpanComparison, computeUsuals } from './insights.js?v=18';

export const WIDGET_SNAPSHOT_KEY = 'qe_widget_snapshot_v1';
export const WIDGET_PENDING_QUEUE_KEY = 'qe_widget_pending_adds_v1';
export const OTA_META_KEY = 'qe_ota_meta_v1';

/**
 * Detect whether we are running inside the Native Android APK shell / Capacitor
 */
export function isNativeAndroidApp() {
  return Boolean(
    window.DropSpendNative ||
    window.Capacitor?.isNativePlatform?.() ||
    navigator.userAgent.includes('DropSpendAndroid')
  );
}

/**
 * Focus an input element and explicitly request the Android/mobile soft keyboard to open
 */
export function requestSoftKeyboard(inputEl) {
  if (!inputEl) return;
  try {
    inputEl.focus({ preventScroll: true });
    const len = (inputEl.value || '').length;
    if (typeof inputEl.setSelectionRange === 'function') {
      inputEl.setSelectionRange(len, len);
    }
  } catch {
    try {
      inputEl.focus();
    } catch {
      // Ignore
    }
  }
  try {
    if ('virtualKeyboard' in navigator && navigator.virtualKeyboard?.show) {
      navigator.virtualKeyboard.show();
    }
  } catch {
    // Ignore
  }
  try {
    if (window.DropSpendNative?.showKeyboard) {
      window.DropSpendNative.showKeyboard();
    }
  } catch {
    // Ignore
  }
}

/**
 * Trigger physical haptic feedback on Android (native bridge or Web Vibration API fallback)
 * @param {'light'|'medium'|'heavy'|'success'|'warning'} style
 */
export function triggerHaptic(style = 'light') {
  try {
    if (window.DropSpendNative?.haptic) {
      window.DropSpendNative.haptic(style);
      return;
    }
    if (window.Capacitor?.Plugins?.Haptics) {
      const H = window.Capacitor.Plugins.Haptics;
      if (style === 'success' && H.notification) {
        H.notification({ type: 'SUCCESS' });
      } else if (H.impact) {
        H.impact({ style: style === 'heavy' ? 'HEAVY' : style === 'medium' ? 'MEDIUM' : 'LIGHT' });
      }
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const pattern =
        style === 'success'
          ? [10, 30, 18]
          : style === 'warning'
            ? [18, 40, 18]
            : style === 'heavy'
              ? 18
              : style === 'medium'
                ? 10
                : 6;
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore haptic errors on desktop browsers
  }
}

/**
 * Install global delegated tactile feedback so buttons/keys feel instant
 */
export function initGlobalTactileFeedback() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target?.closest?.(
        '.spec-numpad-key, .spec-usual-tile-main, .spec-usual-prefill, .spec-circle-btn, .spec-seg-btn, .spec-bottom-add-pill, .spec-preview-chip, .spec-kp-usual-chip, .spec-kp-submit-btn, .spec-return-btn, [data-nav], .widget-sim-usual-btn, .widget-sim-add-btn'
      );
      if (!target) return;
      if (
        target.classList.contains('spec-kp-submit-btn') ||
        target.classList.contains('spec-return-btn') ||
        target.classList.contains('spec-usual-tile-main')
      ) {
        triggerHaptic('medium');
      } else {
        triggerHaptic('light');
      }
    },
    { passive: true }
  );
}

/**
 * Attach 60/120fps touch swipe-down gesture to dismiss a sheet or overlay
 */
export function attachSwipeToDismiss(containerEl, handleSelector, onDismiss) {
  if (!containerEl || containerEl.dataset.swipeBound === '1') return;
  containerEl.dataset.swipeBound = '1';

  let startY = 0;
  let startX = 0;
  let currentDy = 0;
  let dragging = false;
  let startTime = 0;

  containerEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const handleEl = handleSelector ? e.target?.closest?.(handleSelector) : containerEl;
      const scrollBody = e.target?.closest?.('.spec-add-dynamic-body, .dialog-content');
      if (!handleEl && scrollBody && scrollBody.scrollTop > 2) return;
      // Only start drag if touching top header/handle or when scroll is at top
      if (!handleEl && touch.clientY > 140) return;

      startY = touch.clientY;
      startX = touch.clientX;
      currentDy = 0;
      dragging = true;
      startTime = performance.now();
      containerEl.style.transition = 'none';
    },
    { passive: true }
  );

  containerEl.addEventListener(
    'touchmove',
    (e) => {
      if (!dragging || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dy = touch.clientY - startY;
      const dx = Math.abs(touch.clientX - startX);

      if (dy <= 0 || (dx > dy && currentDy === 0)) {
        if (dy < -10) dragging = false;
        return;
      }
      currentDy = dy;
      const damped = dy < 120 ? dy : 120 + (dy - 120) * 0.45;
      containerEl.style.transform = `translate3d(0, ${damped}px, 0)`;
    },
    { passive: true }
  );

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = currentDy / elapsed; // px/ms

    containerEl.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.9, 0.2, 1)';
    if (currentDy > 88 || (currentDy > 36 && velocity > 0.55)) {
      triggerHaptic('light');
      containerEl.style.transform = 'translate3d(0, 100%, 0)';
      setTimeout(() => {
        containerEl.style.transition = '';
        containerEl.style.transform = '';
        onDismiss();
      }, 170);
    } else {
      containerEl.style.transform = 'translate3d(0, 0, 0)';
      setTimeout(() => {
        containerEl.style.transition = '';
        containerEl.style.transform = '';
      }, 200);
    }
    currentDy = 0;
  };

  containerEl.addEventListener('touchend', finishDrag, { passive: true });
  containerEl.addEventListener('touchcancel', finishDrag, { passive: true });
}

/**
 * Build and sync the live snapshot for the Native Android Home Screen Widget
 * AND our local Mac Browser Widget Simulator.
 */
export function syncWidgetSnapshot(expenses, settings) {
  const now = new Date();
  const todayIso = toLocalISODate(now);
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  const monthExpenses = (expenses || []).filter(
    (e) => e.date?.startsWith(monthPrefix) && normalizeEntryType(e) !== 'income'
  );
  const monthTotal = Math.round(
    monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  );
  const todayItems = monthExpenses.filter((e) => e.date === todayIso);
  const todayTotal = Math.round(
    todayItems.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  );

  const spanComp = computeSameSpanComparison(expenses || [], 'month', year, month, now);
  const budget = Number(settings?.monthlyBudget) || 30000;
  const leftAmt = Math.max(0, Math.round(budget - monthTotal));
  const remDays = Math.max(1, spanComp.daysInCurMonth - spanComp.elapsedDay + 1);
  const perDayAllowance = Math.max(0, Math.round((budget - monthTotal) / remDays));
  const fillPct = Math.min(100, Math.max(0, Math.round((monthTotal / Math.max(1, budget)) * 100)));
  const tickPct = Math.min(
    100,
    Math.max(2, Math.round((spanComp.elapsedDay / Math.max(1, spanComp.daysInCurMonth)) * 100))
  );
  const expectedByToday = (budget * spanComp.elapsedDay) / Math.max(1, spanComp.daysInCurMonth);
  const paceDiff = Math.round(monthTotal - expectedByToday);
  const isOverPace = paceDiff > 0;

  const usuals = computeUsuals(expenses || [], 4).map((u) => {
    const cat = getCategoryById(u.category);
    const pay = getPaymentMethodById(u.paymentMethod);
    return {
      note: u.note,
      amount: Math.round(Number(u.amount) || 0),
      category: u.category,
      icon: cat.icon,
      mode: pay.shortName,
      rawCommand: `${Math.round(Number(u.amount) || 0)} ${u.note} ${pay.shortName.toLowerCase()}`
    };
  });

  const snapshot = {
    updatedAt: Date.now(),
    monthLabel: now.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
    monthTotal,
    todayTotal,
    todayCount: todayItems.length,
    budget,
    leftAmt,
    perDayAllowance,
    remDays,
    fillPct,
    tickPct,
    isOverPace,
    paceDiff: Math.abs(paceDiff),
    paceLabel: isOverPace
      ? `₹${Math.abs(paceDiff).toLocaleString('en-IN')} over pace`
      : `₹${Math.abs(paceDiff).toLocaleString('en-IN')} under pace`,
    usuals
  };

  try {
    const json = JSON.stringify(snapshot);
    localStorage.setItem(WIDGET_SNAPSHOT_KEY, json);
    if (window.DropSpendNative?.updateWidgetData) {
      window.DropSpendNative.updateWidgetData(json);
    }
  } catch {
    // Ignore storage quota errors
  }

  renderWidgetSimulatorIfOpen(snapshot);
  return snapshot;
}

/**
 * Drain any pending expenses added via the Native Android Widget or Floating Quick-Add Activity
 */
export function consumePendingWidgetAdds(quickAddFn) {
  if (typeof quickAddFn !== 'function') return 0;
  let addedCount = 0;

  // 1. Check Native Android JavascriptInterface queue
  try {
    if (window.DropSpendNative?.drainPendingQuickAdds) {
      const rawJson = window.DropSpendNative.drainPendingQuickAdds();
      if (rawJson) {
        const items = JSON.parse(rawJson);
        if (Array.isArray(items)) {
          for (const item of items) {
            const msg = typeof item === 'string' ? item : item?.raw;
            if (msg && msg.trim()) {
              quickAddFn(msg.trim());
              addedCount++;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed draining native quick adds:', err);
  }

  // 2. Check localStorage queue
  try {
    const localQueueRaw = localStorage.getItem(WIDGET_PENDING_QUEUE_KEY);
    if (localQueueRaw) {
      localStorage.removeItem(WIDGET_PENDING_QUEUE_KEY);
      const list = JSON.parse(localQueueRaw);
      if (Array.isArray(list)) {
        for (const msg of list) {
          if (typeof msg === 'string' && msg.trim()) {
            quickAddFn(msg.trim());
            addedCount++;
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  return addedCount;
}

/**
 * Check and apply OTA updates from GitHub (`Tanay-J/quick-expense` main branch)
 */
export async function checkAndApplyOtaUpdate({ manual = false, onStatus } = {}) {
  const report = (msg) => {
    if (typeof onStatus === 'function') onStatus(msg);
  };

  try {
    report('Checking GitHub main branch for updates...');

    // If inside Android APK with native OTA engine, trigger native OTA pull too
    if (window.DropSpendNative?.triggerOtaSync) {
      window.DropSpendNative.triggerOtaSync();
    }

    // Update Service Worker cache if registered
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
      }
    }

    // Query latest commit on Tanay-J/quick-expense main
    const res = await fetch('https://api.github.com/repos/Tanay-J/quick-expense/commits/main', {
      cache: 'no-store'
    });
    if (!res.ok) {
      throw new Error(`GitHub status ${res.status}`);
    }
    const data = await res.json();
    const sha = String(data.sha || '').slice(0, 7);
    const message = String(data.commit?.message || '').split('\n')[0];
    const dateStr = data.commit?.committer?.date || new Date().toISOString();

    const prevMeta = getOtaMeta();
    const nextMeta = {
      sha,
      message,
      commitDate: dateStr,
      checkedAt: new Date().toISOString()
    };
    localStorage.setItem(OTA_META_KEY, JSON.stringify(nextMeta));

    if (prevMeta?.sha && prevMeta.sha !== sha) {
      triggerHaptic('success');
      report(`Updated to ${sha}: "${message}" — reloading...`);
      setTimeout(() => window.location.reload(), 650);
      return { updated: true, meta: nextMeta };
    }

    if (manual) {
      triggerHaptic('success');
      report(`Up to date (${sha || 'latest'}) · "${message.slice(0, 38)}"`);
    }
    return { updated: false, meta: nextMeta };
  } catch (err) {
    if (manual) {
      report('Offline or GitHub rate-limited — running latest cached build.');
    }
    return { updated: false, error: err };
  }
}

export function getOtaMeta() {
  try {
    const raw = localStorage.getItem(OTA_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ==========================================================================
   LOCAL MAC BROWSER: ANDROID HOME SCREEN WIDGET & FLOATING QUICK-ADD SIMULATOR
   Lets you preview and test the exact Android Widget & 0ms Floating Quick-Add
   overlay locally at localhost:8090 without installing Android Studio!
   ========================================================================== */

let simulatorHookCtx = null;
let simulatorOpen = false;
let floatingQuickAddOpen = false;

export function initNativeBridge(ctx) {
  simulatorHookCtx = ctx;
  initGlobalTactileFeedback();

  // Drain any pending widget quick-adds on startup and when tab/app resumes
  consumePendingWidgetAdds((msg) => ctx.QuickAdd(msg));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      consumePendingWidgetAdds((msg) => ctx.QuickAdd(msg));
    }
  });
  window.addEventListener('dropspend:native-quickadd', (e) => {
    const msg = e.detail?.text;
    if (msg) ctx.QuickAdd(msg);
  });

  // Handle URL shortcuts (?quickadd=1, ?screen=stats, ?widget=1)
  const params = new URLSearchParams(window.location.search);
  if (params.get('quickadd') === '1') {
    setTimeout(() => ctx.openSpecAddPalette?.(params.get('prefill') || ''), 40);
  } else if (params.get('screen') === 'stats') {
    setTimeout(() => ctx.navigateSpecScreen?.('stats'), 40);
  }
  if (params.get('widget') === '1') {
    setTimeout(() => toggleWidgetSimulator(true), 80);
  }

  // Register global Android hardware back button hook (called by MainActivity.kt)
  window.onAndroidBackPressed = () => {
    return handleHardwareOrBrowserBack(ctx);
  };

  // Synchronize browser history back button / Android swipe-back gesture
  if (!window.history.state || !window.history.state.dropspend) {
    window.history.replaceState({ dropspend: 'root' }, '');
  }
  window.addEventListener('popstate', () => {
    const handled = handleHardwareOrBrowserBack(ctx, true);
    if (handled) {
      // Keep a guard entry on the history stack so next back swipe is also caught
      window.history.pushState({ dropspend: 'guard' }, '');
    }
  });

  // Mount the subtle desktop "📱 Widget & Quick-Add Preview" launcher pill on localhost/desktop
  mountDesktopWidgetLauncher();

  // Check OTA metadata silently in background after 2.5s
  setTimeout(() => {
    checkAndApplyOtaUpdate({ manual: false });
  }, 2500);
}

export function pushNavigationGuard() {
  try {
    if (window.history.state?.dropspend !== 'guard') {
      window.history.pushState({ dropspend: 'guard' }, '');
    }
  } catch {
    // Ignore in restricted webviews
  }
}

function handleHardwareOrBrowserBack(ctx, fromPopState = false) {
  // 1. Close Floating Quick-Add simulator if open
  if (floatingQuickAddOpen) {
    floatingQuickAddOpen = false;
    const snap = getLatestWidgetSnapshot();
    renderWidgetSimulatorIfOpen(snap);
    triggerHaptic('light');
    return true;
  }

  // 2. Close Widget Simulator if open
  if (simulatorOpen) {
    toggleWidgetSimulator(false);
    triggerHaptic('light');
    return true;
  }

  // 3. Close any open <dialog> modal first (except mandatory name gate if name is empty)
  const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
  if (openDialogs.length > 0) {
    const topDialog = openDialogs[openDialogs.length - 1];
    if (topDialog.id === 'name-gate-dialog') {
      const hasName = Boolean((ctx?.getSettings?.()?.userName || '').trim());
      if (!hasName) {
        requestSoftKeyboard(document.getElementById('quick-name-input'));
        return true;
      }
    }
    topDialog.close();
    triggerHaptic('light');
    return true;
  }

  // 4. Ask specController to unwind its stack (Add Palette -> Subscreen -> Screen -> Home)
  if (ctx?.handleSpecBack && ctx.handleSpecBack()) {
    triggerHaptic('light');
    return true;
  }

  // Not handled (already at Home root)
  if (!fromPopState && window.DropSpendNative?.minimizeApp) {
    window.DropSpendNative.minimizeApp();
  }
  return false;
}

function getLatestWidgetSnapshot() {
  if (simulatorHookCtx) {
    return syncWidgetSnapshot(simulatorHookCtx.getExpenses(), simulatorHookCtx.getSettings());
  }
  try {
    return JSON.parse(localStorage.getItem(WIDGET_SNAPSHOT_KEY) || '{}');
  } catch {
    return {};
  }
}

function mountDesktopWidgetLauncher() {
  if (document.getElementById('android-widget-sim-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'android-widget-sim-fab';
  fab.type = 'button';
  fab.className = 'android-widget-sim-fab';
  fab.title = 'Preview the Android Home Screen Widget & Floating Quick-Add Sheet locally';
  fab.innerHTML = `<span>📱</span> <span class="sim-fab-label">Android Widget Preview</span>`;
  fab.addEventListener('click', () => {
    triggerHaptic('light');
    toggleWidgetSimulator(!simulatorOpen);
  });
  document.body.appendChild(fab);
}

export function toggleWidgetSimulator(forceState) {
  simulatorOpen = typeof forceState === 'boolean' ? forceState : !simulatorOpen;
  if (!simulatorOpen) {
    floatingQuickAddOpen = false;
  } else {
    pushNavigationGuard();
  }
  const snap = getLatestWidgetSnapshot();
  renderWidgetSimulatorIfOpen(snap);
}

export function openFloatingQuickAddSimulator(prefill = '') {
  simulatorOpen = true;
  floatingQuickAddOpen = true;
  pushNavigationGuard();
  const snap = getLatestWidgetSnapshot();
  renderWidgetSimulatorIfOpen(snap, prefill);
}

function renderWidgetSimulatorIfOpen(snap, prefillText = '') {
  let host = document.getElementById('android-widget-sim-overlay');
  if (!simulatorOpen) {
    if (host) host.hidden = true;
    return;
  }
  if (!host) {
    host = document.createElement('div');
    host.id = 'android-widget-sim-overlay';
    host.className = 'android-widget-sim-overlay';
    document.body.appendChild(host);
  }
  host.hidden = false;

  const usuals = snap?.usuals || [];
  const usualsHtml =
    usuals.length > 0
      ? usuals
          .slice(0, 3)
          .map(
            (u) => `
          <button type="button" class="widget-sim-usual-btn" data-sim-usual="${u.rawCommand.replace(/"/g, '&quot;')}">
            <span>${u.icon || '⚡'}</span>
            <span class="w-u-name">${u.note}</span>
            <strong>₹${u.amount}</strong>
          </button>
        `
          )
          .join('')
      : `<span class="widget-sim-empty-hint">Tap + to log your first expense — top usuals appear here for 1-tap logging.</span>`;

  const nowTime = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const nowDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  host.innerHTML = `
    <div class="android-sim-backdrop" id="android-sim-close-bg"></div>
    <div class="android-sim-phone" role="dialog" aria-label="Android Home Screen Widget Simulator">
      <div class="android-sim-topbar">
        <span>${nowTime} · Android Home Screen Preview</span>
        <button type="button" class="android-sim-close-btn" id="android-sim-close-btn">✕ Close</button>
      </div>

      <div class="android-sim-wallpaper">
        <div class="android-sim-date-at-glance">${nowDate}</div>

        <!-- THE NATIVE ANDROID 4x2 DROPSPEND HOME SCREEN WIDGET -->
        <div class="dropspend-native-widget">
          <div class="dnw-top-row">
            <div class="dnw-brand-col" id="dnw-open-main-app" title="Tap to open full DropSpend app">
              <div class="dnw-kicker">
                <span class="dnw-logo">₹</span>
                <span>DROPSPEND · ${snap?.monthLabel || 'THIS MONTH'}</span>
              </div>
              <div class="dnw-hero-row">
                <strong class="dnw-month-val">₹${Number(snap?.monthTotal || 0).toLocaleString('en-IN')}</strong>
                <span class="dnw-today-badge">Today ₹${Number(snap?.todayTotal || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <button type="button" class="widget-sim-add-btn" id="dnw-trigger-quickadd" title="Open 0ms Native Floating Quick-Add">
              <span>+</span>
              <small>Quick Add</small>
            </button>
          </div>

          <!-- Pace Progress Bar with Elapsed Tick -->
          <div class="dnw-pace-wrap">
            <div class="dnw-pace-bar">
              <div class="dnw-pace-fill ${snap?.isOverPace ? 'is-over' : ''}" style="width:${snap?.fillPct || 0}%"></div>
              <div class="dnw-pace-tick" style="left:${snap?.tickPct || 50}%"></div>
            </div>
            <div class="dnw-pace-meta">
              <span>₹${Number(snap?.leftAmt ?? 30000).toLocaleString('en-IN')} left (₹${Number(snap?.perDayAllowance || 1000).toLocaleString('en-IN')}/d)</span>
              <span class="${snap?.isOverPace ? 'is-over' : 'is-under'}">${snap?.paceLabel || 'On pace'}</span>
            </div>
          </div>

          <!-- 1-Tap Usuals Strip right inside the Android Widget -->
          <div class="dnw-usuals-row">
            ${usualsHtml}
          </div>
        </div>

        <div class="android-sim-explainer">
          <strong>How this works on your Android phone:</strong>
          <ul>
            <li><strong>1-Tap Usual Chips:</strong> Tapping a chip on the widget logs it immediately and updates the widget total.</li>
            <li><strong>+ Quick Add Button:</strong> Pops up the native floating input bar below in <code>&lt;60ms</code> without opening the full app.</li>
          </ul>
        </div>

        <!-- NATIVE FLOATING QUICK-ADD OVERLAY SHEET -->
        <div class="android-floating-quickadd ${floatingQuickAddOpen ? 'is-open' : ''}">
          <div class="afq-handle"></div>
          <div class="afq-header">
            <span class="afq-title">⚡ DropSpend Quick Add</span>
            <span class="afq-sub">Saves &amp; syncs in background</span>
          </div>
          <form id="afq-form" class="afq-input-row">
            <input
              type="text"
              id="afq-input"
              placeholder="e.g. 200 fuel bike upi"
              value="${prefillText.replace(/"/g, '&quot;')}"
              autocomplete="off"
            />
            <button type="submit" class="afq-save-btn">Add ↵</button>
          </form>
          <div id="afq-toast" class="afq-toast" hidden></div>
        </div>
      </div>
    </div>
  `;

  host.querySelector('#android-sim-close-bg')?.addEventListener('click', () => toggleWidgetSimulator(false));
  host.querySelector('#android-sim-close-btn')?.addEventListener('click', () => toggleWidgetSimulator(false));
  host.querySelector('#dnw-open-main-app')?.addEventListener('click', () => toggleWidgetSimulator(false));

  host.querySelector('#dnw-trigger-quickadd')?.addEventListener('click', () => {
    floatingQuickAddOpen = true;
    renderWidgetSimulatorIfOpen(snap, '');
    setTimeout(() => host.querySelector('#afq-input')?.focus(), 30);
  });

  // 1-tap usual logging right from the widget!
  host.querySelectorAll('[data-sim-usual]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.simUsual;
      if (!cmd || !simulatorHookCtx) return;
      triggerHaptic('success');
      simulatorHookCtx.QuickAdd(cmd);
      const updatedSnap = getLatestWidgetSnapshot();
      renderWidgetSimulatorIfOpen(updatedSnap);
      const toast = host.querySelector('#afq-toast');
      if (toast) {
        toast.hidden = false;
        toast.textContent = `✓ Logged "${cmd}" from widget`;
      }
    });
  });

  const afqForm = host.querySelector('#afq-form');
  const afqInput = host.querySelector('#afq-input');
  if (floatingQuickAddOpen && afqInput) {
    setTimeout(() => afqInput.focus(), 25);
  }
  afqForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (afqInput?.value || '').trim();
    if (!text || !simulatorHookCtx) return;
    triggerHaptic('success');
    simulatorHookCtx.QuickAdd(text);
    floatingQuickAddOpen = false;
    const updatedSnap = getLatestWidgetSnapshot();
    renderWidgetSimulatorIfOpen(updatedSnap);
  });
}
