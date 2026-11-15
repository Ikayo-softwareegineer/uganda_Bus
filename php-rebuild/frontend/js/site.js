// ============================================================
// Uganda Bus - shared helpers for the admin dashboard (admin.html)
// The customer and staff pages use the modules in js/ug/ instead.
// The server checks the real login (PHP session) on every request;
// localStorage only remembers who is logged in so the page can greet them.
// ============================================================

const API = '../../backend/api/';
const STORAGE_KEY = 'ugandaBusBooking'; // written by js/ug/api.js when someone logs in

// ---------- Talking to the server ----------

async function api(path, options = {}) {
  const settings = {
    credentials: 'same-origin', // send the PHP session cookie
    headers: { 'Content-Type': 'application/json' },
    ...options
  };
  if (settings.body && typeof settings.body !== 'string') {
    settings.body = JSON.stringify(settings.body);
  }

  let response;
  try {
    response = await fetch(API + path, settings);
  } catch (error) {
    alert('Cannot reach the server. Make sure the PHP server is running.');
    throw error;
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = { success: false, message: 'Unexpected server response.' };
  }

  // Server says we are not logged in any more -> go to the sign-in page
  if (response.status === 401) {
    setCurrentUser(null);
    window.location.href = 'auth.html?redirect=admin.html';
  }

  return { ok: response.ok && data.success !== false, status: response.status, data };
}

// ---------- Who is logged in ----------

function getCurrentUser() {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}).user || null;
  } catch (error) {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
}

// Only the admin may open admin.html; staff go to their portal, everyone else signs in
function requireAdmin() {
  const user = getCurrentUser();
  if (user && user.role === 'admin') return true;
  if (user && user.role === 'staff') {
    window.location.href = 'staff.html';
  } else {
    window.location.href = 'auth.html?redirect=admin.html';
  }
  return false;
}

// ---------- Formatting helpers (used by admin.js) ----------

function currency(value) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0
  }).format(value);
}

function paymentLabel(payment) {
  const labels = {
    MTN_MOMO: 'MTN Mobile Money',
    AIRTEL_MONEY: 'Airtel Money',
    VISA_CARD: 'Visa Card',
    CASH_AT_STATION: 'Cash at station'
  };
  return labels[payment] || payment;
}

function dateLabel(value) {
  return new Date(String(value).replace(' ', 'T')).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

// ---------- Start ----------

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'admin') return;
  if (!requireAdmin()) return;
  if (typeof initAdminDashboard === 'function') initAdminDashboard();
});
