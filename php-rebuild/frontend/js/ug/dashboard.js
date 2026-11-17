/**
 * UG Express - Customer Dashboard Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { bookingAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();

  // Guard: Require login
  if (!Auth.requireRole(['CUSTOMER'])) {
    return;
  }

  renderLayout();

  const user = Auth.getUser();
  const userNameEl = document.getElementById('dash-user-name');
  const totalBookingsCountEl = document.getElementById('dash-total-bookings');
  const upcomingCountEl = document.getElementById('dash-upcoming-count');
  const totalSpendEl = document.getElementById('dash-total-spend');
  const bookingsListContainer = document.getElementById('dash-bookings-list');

  if (userNameEl && user) {
    userNameEl.textContent = `Welcome back, ${user.name}`;
  }

  let bookings = [];

  async function loadUserBookings() {
    if (!bookingsListContainer) return;
    bookingsListContainer.innerHTML = `
      <div class="card text-center" style="padding: 2.5rem;">
        <div style="width: 2rem; height: 2rem; border: 3px solid var(--must-navy); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 0.75rem;"></div>
        <p style="font-size: 12px; color: var(--text-muted);">Fetching your reservations...</p>
      </div>
    `;

    try {
      const res = await bookingAPI.getUserBookings();
      if (res.data.success && res.data.bookings) {
        bookings = res.data.bookings;
        renderDashboardData();
      } else {
        renderEmpty();
      }
    } catch (err) {
      console.error(err);
      renderEmpty();
    }
  }

  function renderDashboardData() {
    // Metrics
    const upcomingCount = bookings.filter((b) => b.bookingStatus === 'CONFIRMED').length;
    const totalSpent = bookings
      .filter((b) => b.bookingStatus !== 'CANCELLED')
      .reduce((acc, b) => acc + (b.totalAmountUGX || 0), 0);

    if (totalBookingsCountEl) totalBookingsCountEl.textContent = bookings.length;
    if (upcomingCountEl) upcomingCountEl.textContent = upcomingCount;
    if (totalSpendEl) totalSpendEl.textContent = `UGX ${totalSpent.toLocaleString()}`;

    if (bookings.length === 0) {
      renderEmpty();
      return;
    }

    bookingsListContainer.innerHTML = bookings.map((b) => {
      const depDate = new Date(b.trip?.departureTime);
      const isCancelled = b.bookingStatus === 'CANCELLED';

      const seatsStr = b.passengers && b.passengers.length > 0
        ? b.passengers.map((p) => p.seat?.seatNumber || '1A').join(', ')
        : 'Assigned';

      return `
        <div class="card" style="padding: 1.25rem; margin-bottom: 1rem; border-left: 4px solid ${isCancelled ? '#ef4444' : 'var(--must-navy)'};">
          <div class="flex items-center justify-between flex-wrap gap-2" style="border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
            <div>
              <span style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); text-transform: uppercase;">Reference</span>
              <div style="font-weight: 800; font-family: var(--font-mono); font-size: 14px; color: var(--text-main);">${b.bookingRef}</div>
            </div>

            <div class="flex items-center gap-2">
              <span class="badge ${isCancelled ? 'badge-gold' : 'badge-green'}" style="font-size: 10px;">
                ${b.bookingStatus}
              </span>
              <span class="badge badge-navy" style="font-size: 10px;">
                ${b.paymentStatus}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4" style="font-size: 12px; margin-bottom: 1rem;">
            <div>
              <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase; font-family: var(--font-mono); display: block;">Route</span>
              <span style="font-weight: 700; color: #000000; font-size: 14px;">${b.trip?.route?.origin || 'Kampala'} → ${b.trip?.route?.destination || 'Mbarara'}</span>
              <div style="font-size: 11px; color: var(--text-muted);">${b.trip?.vehicle?.operatorName || 'Uganda Coach Express'}</div>
            </div>

            <div>
              <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase; font-family: var(--font-mono); display: block;">Departure Date</span>
              <span style="font-weight: 700; font-family: var(--font-mono);">${depDate.toLocaleDateString()}</span>
              <div style="font-size: 11px; color: var(--text-muted);">${depDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>

            <div>
              <span style="color: var(--text-muted); font-size: 10px; text-transform: uppercase; font-family: var(--font-mono); display: block;">Seats & Fare</span>
              <span style="font-weight: 700; font-family: var(--font-mono);">Seats: ${seatsStr}</span>
              <div style="font-weight: 800; color: #000000; font-size: 13px;">UGX ${b.totalAmountUGX.toLocaleString()}</div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2" style="border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <a href="confirmation.html?ref=${b.bookingRef}" class="btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 11px;">
              <i data-lucide="ticket" style="width: 12px; height: 12px;"></i> View Ticket & QR
            </a>

            ${b.canCancel ? `
              <button type="button" class="cancel-booking-btn" data-id="${b.id}" style="color: #ef4444; font-size: 11px; font-weight: 600; padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid #fecaca; background: #fef2f2;">
                Cancel Booking
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach cancellation handlers
    bookingsListContainer.querySelectorAll('.cancel-booking-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Are you sure you want to cancel this booking? Reserved seats will be released.')) return;

        try {
          const res = await bookingAPI.cancelBooking(id);
          if (res.data.success) {
            alert('Booking cancelled successfully.');
            loadUserBookings();
          }
        } catch (err) {
          alert(err.response?.data?.message || 'Cancellation failed.');
        }
      });
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function renderEmpty() {
    if (!bookingsListContainer) return;
    bookingsListContainer.innerHTML = `
      <div class="card text-center" style="padding: 3rem;">
        <i data-lucide="ticket" style="width: 2.5rem; height: 2.5rem; color: var(--text-muted); margin: 0 auto 0.75rem;"></i>
        <h4 style="font-weight: 700; margin-bottom: 0.5rem;">No Bookings Found</h4>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 1.25rem;">You haven't made any bus reservations yet.</p>
        <a href="index.html" class="btn-primary">Book Your First Journey</a>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  loadUserBookings();
});
