/**
 * UG Express - Booking Confirmation & E-Ticket Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { bookingAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  renderLayout();

  const urlParams = new URLSearchParams(window.location.search);
  const bookingRef = urlParams.get('ref');

  let booking = null;

  try {
    const cached = sessionStorage.getItem('latest_booking');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (!bookingRef || parsed.bookingRef === bookingRef) {
        booking = parsed;
      }
    }
  } catch (e) {}

  if (bookingRef) {
    // Always load the latest state from the server (it may be cancelled or used since)
    try {
      const res = await bookingAPI.getBookingById(bookingRef);
      if (res.data.success && res.data.booking) booking = res.data.booking;
    } catch (e) {
      console.error(e);
      booking = null;
    }
  }

  if (!booking) {
    const main = document.querySelector('main') || document.body;
    main.innerHTML = `
      <div class="container" style="padding: 4rem 0; text-align: center;">
        <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;">Ticket not found</h2>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">We could not find booking ${bookingRef || ''} on your account.</p>
        <a href="dashboard.html" class="btn-primary">Go to My Bookings</a>
      </div>`;
    return;
  }

  // Populate UI
  const refDisplay = document.getElementById('ticket-booking-ref');
  const routeDisplay = document.getElementById('ticket-route');
  const vehicleDisplay = document.getElementById('ticket-vehicle');
  const amountDisplay = document.getElementById('ticket-amount');
  const dateDisplay = document.getElementById('ticket-date');
  const depTimeDisplay = document.getElementById('ticket-dep-time');
  const arrTimeDisplay = document.getElementById('ticket-arr-time');
  const passengersContainer = document.getElementById('ticket-passengers-container');
  const qrContainer = document.getElementById('ticket-qr-code');
  const printBtn = document.getElementById('btn-print-ticket');

  if (refDisplay) refDisplay.textContent = booking.bookingRef;

  // Show the ticket's real state: cancelled or already used for boarding
  if (booking.bookingStatus === 'CANCELLED' || booking.ticket?.verifiedAt) {
    const cancelled = booking.bookingStatus === 'CANCELLED';
    const banner = document.createElement('div');
    banner.className = 'card';
    banner.style.cssText = `margin: 1rem auto; max-width: 56rem; padding: 1rem 1.25rem; font-weight: 700; border: 2px solid ${cancelled ? '#ef4444' : '#f59e0b'}; background: ${cancelled ? '#fef2f2' : '#fffbeb'};`;
    banner.textContent = cancelled
      ? 'This booking was cancelled. The ticket is no longer valid for travel.'
      : `This ticket was used for boarding on ${new Date(booking.ticket.verifiedAt).toLocaleString()}.`;
    (document.querySelector('main') || document.body).prepend(banner);
  }
  if (routeDisplay) routeDisplay.textContent = `${booking.trip?.route?.origin || 'Kampala'} → ${booking.trip?.route?.destination || 'Mbarara'}`;
  if (vehicleDisplay) vehicleDisplay.textContent = `${booking.trip?.vehicle?.operatorName || 'Uganda Coach Express'} • ${booking.trip?.vehicle?.regNumber || 'UBF-892K'}`;
  if (amountDisplay) amountDisplay.textContent = `UGX ${booking.totalAmountUGX.toLocaleString()}`;

  const dep = new Date(booking.trip?.departureTime);
  const arr = new Date(booking.trip?.arrivalTime);

  if (dateDisplay) dateDisplay.textContent = dep.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  if (depTimeDisplay) depTimeDisplay.textContent = dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (arrTimeDisplay) arrTimeDisplay.textContent = arr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Passenger manifest
  if (passengersContainer) {
    const list = booking.passengers && booking.passengers.length > 0
      ? booking.passengers
      : [{ fullName: 'Passenger', phone: '0771234567', seat: { seatNumber: '1A' } }];

    passengersContainer.innerHTML = list.map((p, idx) => `
      <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; font-family: var(--font-mono); font-size: 12px;">
        <div>
          <div style="font-weight: 800; color: #000000;">${p.fullName}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${p.phone}</div>
        </div>
        <div style="background: #000000; color: #fff; padding: 0.25rem 0.65rem; border-radius: var(--radius-sm); font-weight: 800;">
          Seat ${p.seat?.seatNumber || (idx + 1) + 'A'}
        </div>
      </div>
    `).join('');
  }

  // QR Code Generation
  if (qrContainer) {
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qrContainer, {
        text: booking.ticket?.qrData || booking.bookingRef, // staff can paste this text to verify
        width: 100,
        height: 100,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
      });
    } else {
      // Fallback SVG QR pattern
      qrContainer.innerHTML = `
        <div style="width: 100px; height: 100px; background: #f8fafc; border: 2px dashed #000000; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-family: var(--font-mono); text-align: center; color: #000000; font-weight: 700;">
          ${booking.bookingRef}
        </div>
      `;
    }
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});
