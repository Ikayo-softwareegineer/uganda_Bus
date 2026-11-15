/**
 * UG Express - Staff Ticket Verification Terminal Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { ticketAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();

  if (!Auth.requireRole(['STAFF', 'ADMIN'])) {
    return;
  }

  renderLayout();

  const verifyForm = document.getElementById('staff-verify-form');
  const refInput = document.getElementById('verify-ref-input');
  const verifyBtn = document.getElementById('btn-verify-ticket');
  const resultContainer = document.getElementById('verification-result-container');

  if (verifyForm) {
    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ref = refInput?.value.trim();
      if (!ref) return;

      if (verifyBtn) {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';
      }

      if (resultContainer) {
        resultContainer.innerHTML = `
          <div class="card text-center" style="padding: 2rem;">
            <div style="width: 2rem; height: 2rem; border: 3px solid var(--must-navy); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 0.5rem;"></div>
            <p style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">Connecting to live verification database...</p>
          </div>
        `;
      }

      try {
        const res = await ticketAPI.verifyTicket(ref);
        if (res.data.success && res.data.booking) {
          renderSuccess(res.data.message, res.data.booking);
        } else {
          renderError(res.data.message || 'Ticket not valid for travel.');
        }
      } catch (err) {
        console.error(err);
        const booking = err.response?.data?.booking;
        const msg = err.response?.data?.message || 'Invalid ticket or booking reference not found.';
        renderError(msg, booking);
      } finally {
        if (verifyBtn) {
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'VERIFY TICKET';
        }
      }
    });
  }

  function renderSuccess(message, booking) {
    if (!resultContainer) return;
    const dep = new Date(booking.trip?.departureTime);

    resultContainer.innerHTML = `
      <div class="card" style="border: 2px solid var(--must-green); background: #ecfdf5; padding: 1.5rem;">
        <div class="flex items-center gap-2" style="color: var(--must-green-dark); font-weight: 800; font-size: 15px; margin-bottom: 0.75rem;">
          <i data-lucide="check-circle" style="width: 1.25rem; height: 1.25rem;"></i>
          <span>${message || 'Ticket Verified & Approved for Boarding'}</span>
        </div>

        <div style="background: #ffffff; border-radius: var(--radius-md); padding: 1rem; font-family: var(--font-mono); font-size: 12px; border: 1px solid #a7f3d0;" class="space-y-2">
          <div class="flex items-center justify-between">
            <span style="color: var(--text-muted);">Reference:</span>
            <span style="font-weight: 800; color: #000000; font-size: 14px;">${booking.bookingRef}</span>
          </div>
          <div class="flex items-center justify-between">
            <span style="color: var(--text-muted);">Passenger:</span>
            <span style="font-weight: 700;">${booking.user?.name || booking.passengers?.[0]?.fullName || 'Authorized Traveler'}</span>
          </div>
          <div class="flex items-center justify-between">
            <span style="color: var(--text-muted);">Route:</span>
            <span style="font-weight: 700;">${booking.trip?.route?.origin} → ${booking.trip?.route?.destination}</span>
          </div>
          <div class="flex items-center justify-between">
            <span style="color: var(--text-muted);">Vehicle:</span>
            <span style="font-weight: 700;">${booking.trip?.vehicle?.operatorName} (${booking.trip?.vehicle?.regNumber})</span>
          </div>
          <div class="flex items-center justify-between">
            <span style="color: var(--text-muted);">Departure:</span>
            <span style="font-weight: 700;">${dep.toLocaleDateString()} at ${dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="flex items-center justify-between">
            <span style="color: var(--text-muted);">Seat(s):</span>
            <span style="font-weight: 800; color: #000000;">${booking.passengers?.map(p => p.seat?.seatNumber).join(', ') || '1A'}</span>
          </div>
        </div>
      </div>
    `;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function renderError(message, booking) {
    if (!resultContainer) return;
    resultContainer.innerHTML = `
      <div class="card" style="border: 2px solid #ef4444; background: #fef2f2; padding: 1.5rem;">
        <div class="flex items-center gap-2" style="color: #b91c1c; font-weight: 800; font-size: 14px; margin-bottom: 0.5rem;">
          <i data-lucide="alert-triangle" style="width: 1.25rem; height: 1.25rem;"></i>
          <span>${message}</span>
        </div>
        <p style="font-size: 12px; color: #7f1d1d;">
          Please verify the booking code with the passenger. This ticket may have already been boarded, cancelled, or does not exist.
        </p>
      </div>
    `;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Demo pre-fill button
  const demoRefBtn = document.getElementById('btn-demo-ref');
  if (demoRefBtn && refInput) {
    demoRefBtn.addEventListener('click', () => {
      refInput.value = 'UG-8942-XJ';
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});
