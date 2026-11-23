/**
 * UG Express - Booking Checkout & Payment Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { tripAPI, bookingAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  renderLayout();

  // Bookings belong to a customer account: sign in first, then come back here
  if (!Auth.requireRole(['CUSTOMER'])) return;

  const urlParams = new URLSearchParams(window.location.search);
  const tripId = urlParams.get('tripId');
  const seatIdsParam = urlParams.get('seats');

  let trip = null;
  let selectedSeats = [];

  try {
    const cachedTrip = sessionStorage.getItem('selected_trip');
    const cachedSeats = sessionStorage.getItem('selected_seats');
    if (cachedTrip) trip = JSON.parse(cachedTrip);
    if (cachedSeats) selectedSeats = JSON.parse(cachedSeats);
  } catch (e) {}

  if (!trip && tripId) {
    try {
      const res = await tripAPI.getTripById(tripId);
      if (res.data.success) trip = res.data.trip;
    } catch (e) {
      console.error(e);
    }
  }

  if (!trip) {
    alert('Session expired. Please select your trip again.');
    window.location.href = 'index.html';
    return;
  }

  // Fallback seat objects if not in session
  if (selectedSeats.length === 0 && seatIdsParam) {
    selectedSeats = seatIdsParam.split(',').map((id, idx) => ({
      id,
      seatNumber: `${idx + 1}A`,
    }));
  }

  const currentUser = Auth.getUser();

  // UI Elements
  const summaryOriginEl = document.getElementById('checkout-origin');
  const summaryDestEl = document.getElementById('checkout-destination');
  const summaryDateEl = document.getElementById('checkout-date');
  const summarySeatsEl = document.getElementById('checkout-seats');
  const summaryTotalEl = document.getElementById('checkout-total');
  const passengerFormsContainer = document.getElementById('passenger-forms-container');
  const paymentModal = document.getElementById('payment-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalPayBtn = document.getElementById('modal-pay-btn');
  const modalTotalDisplay = document.getElementById('modal-total-amount');
  const modalErrorDisplay = document.getElementById('modal-error-msg');
  const paymentMethodInputs = document.querySelectorAll('input[name="payment-method"]');
  const checkoutForm = document.getElementById('checkout-form');

  const totalAmount = selectedSeats.length * trip.priceUGX;

  // 1. Populate summary
  if (summaryOriginEl) summaryOriginEl.textContent = trip.route?.origin || 'Origin';
  if (summaryDestEl) summaryDestEl.textContent = trip.route?.destination || 'Destination';
  if (summaryDateEl) {
    const dep = new Date(trip.departureTime);
    summaryDateEl.textContent = `${dep.toDateString()} at ${dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (summarySeatsEl) summarySeatsEl.textContent = selectedSeats.map((s) => s.seatNumber).join(', ');
  if (summaryTotalEl) summaryTotalEl.textContent = `UGX ${totalAmount.toLocaleString()}`;
  if (modalTotalDisplay) modalTotalDisplay.textContent = `UGX ${totalAmount.toLocaleString()}`;

  // 2. Render Passenger Input Forms
  if (passengerFormsContainer) {
    passengerFormsContainer.innerHTML = selectedSeats.map((seat, idx) => `
      <div class="card" style="padding: 1.25rem; margin-bottom: 1rem;">
        <div class="flex items-center justify-between" style="margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
          <h4 style="font-size: 13px; font-weight: 700; font-family: var(--font-mono); color: #000000;">
            Passenger ${idx + 1}
          </h4>
          <span class="badge badge-navy">Seat ${seat.seatNumber}</span>
        </div>

        <div class="grid grid-cols-1" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
          <div class="input-group">
            <label class="input-label">Full Name</label>
            <input
              type="text"
              class="form-input passenger-name"
              data-seat-id="${seat.id}"
              required
              value="${idx === 0 && currentUser ? currentUser.name : ''}"
              placeholder="e.g. Mugisha Alex"
              style="padding-left: 0.75rem;"
            />
          </div>

          <div class="input-group">
            <label class="input-label">Phone Number</label>
            <input
              type="tel"
              class="form-input passenger-phone"
              data-seat-id="${seat.id}"
              required
              value="${idx === 0 && currentUser ? currentUser.phone : '0771234567'}"
              placeholder="e.g. 0771234567"
              style="padding-left: 0.75rem;"
            />
          </div>

          <div class="input-group">
            <label class="input-label">Email Address</label>
            <input
              type="email"
              class="form-input passenger-email"
              data-seat-id="${seat.id}"
              required
              value="${idx === 0 && currentUser ? currentUser.email : 'traveler@travel.ug'}"
              placeholder="e.g. traveler@travel.ug"
              style="padding-left: 0.75rem;"
            />
          </div>
        </div>
      </div>
    `).join('');
  }

  // 3. Checkout Form Submit -> Open Modal
  let currentPassengerDetails = [];
  let selectedPaymentMethod = 'MTN_MOMO';

  if (checkoutForm) {
    checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Collect passenger details
      const nameInputs = document.querySelectorAll('.passenger-name');
      const phoneInputs = document.querySelectorAll('.passenger-phone');
      const emailInputs = document.querySelectorAll('.passenger-email');

      currentPassengerDetails = [];
      for (let i = 0; i < selectedSeats.length; i++) {
        const name = nameInputs[i]?.value.trim();
        const phone = phoneInputs[i]?.value.trim();
        const email = emailInputs[i]?.value.trim();

        if (!name || !phone) {
          alert(`Please fill in required fields for Passenger ${i + 1}`);
          return;
        }

        currentPassengerDetails.push({
          seatId: selectedSeats[i].id,
          fullName: name,
          phone: phone,
          email: email,
        });
      }

      // Check selected payment method
      const checkedMethod = document.querySelector('input[name="payment-method"]:checked');
      if (checkedMethod) {
        selectedPaymentMethod = checkedMethod.value;
      }

      // Open Modal
      openPaymentModal();
    });
  }

  function openPaymentModal() {
    if (!paymentModal) return;
    paymentModal.classList.add('open');
    updateModalFields();
  }

  function closePaymentModal() {
    if (!paymentModal) return;
    paymentModal.classList.remove('open');
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closePaymentModal);
  }
 
  // Escape key closes the payment popup
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && paymentModal && paymentModal.classList.contains('open')) {
      closePaymentModal();
    }
  });

  // Clicking the dark background (outside the popup box) also closes it
  if (paymentModal) {
    paymentModal.addEventListener('click', (event) => {
      if (event.target === paymentModal) closePaymentModal();
    });
  }
  

  // Payment Method Selection inside Modal
  const modalMethodButtons = document.querySelectorAll('.modal-method-btn');
  modalMethodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modalMethodButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPaymentMethod = btn.dataset.method;
      updateModalFields();
    });
  });

  function updateModalFields() {
    const phoneWrap = document.getElementById('modal-momo-phone-wrap');
    const cardWrap = document.getElementById('modal-card-wrap');
    const ussdNotice = document.getElementById('modal-ussd-notice');
    const phoneLabel = document.getElementById('modal-phone-label');

    if (selectedPaymentMethod === 'VISA_CARD') {
      if (phoneWrap) phoneWrap.style.display = 'none';
      if (ussdNotice) ussdNotice.style.display = 'none';
      if (cardWrap) cardWrap.style.display = 'block';
    } else {
      if (phoneWrap) phoneWrap.style.display = 'block';
      if (ussdNotice) ussdNotice.style.display = 'block';
      if (cardWrap) cardWrap.style.display = 'none';
      if (phoneLabel) {
        phoneLabel.textContent = selectedPaymentMethod === 'MTN_MOMO'
          ? 'MTN Phone Number (USSD Push Prompt)'
          : 'Airtel Phone Number (USSD Push Prompt)';
      }
    }
  }

  // 4. Modal Payment Trigger
  if (modalPayBtn) {
    modalPayBtn.addEventListener('click', async () => {
      if (modalErrorDisplay) modalErrorDisplay.style.display = 'none';
      modalPayBtn.disabled = true;
      modalPayBtn.innerHTML = `
        <div style="width: 1rem; height: 1rem; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 0.5rem;"></div>
        Simulating USSD PIN Authorization...
      `;

      // Bookings belong to a customer account: send visitors to sign in first
      if (!Auth.isLoggedIn()) {
        window.location.href = `auth.html?redirect=${encodeURIComponent('checkout.html' + window.location.search)}`;
        return;
      }

      setTimeout(async () => {
        try {
          const payload = {
            tripId: trip.id,
            passengerDetails: currentPassengerDetails,
            paymentMethod: selectedPaymentMethod,
          };

          const res = await bookingAPI.createBooking(payload);
          if (res.data.success && res.data.booking) {
            sessionStorage.setItem('latest_booking', JSON.stringify(res.data.booking));
            window.location.href = `confirmation.html?ref=${res.data.booking.bookingRef}`;
          } else {
            throw new Error(res.data.message || 'Payment simulation failed');
          }
        } catch (err) {
          console.error(err);
          if (modalErrorDisplay) {
            modalErrorDisplay.textContent = err.response?.data?.message || err.message || 'Payment processing error.';
            modalErrorDisplay.style.display = 'block';
          }
          modalPayBtn.disabled = false;
          modalPayBtn.textContent = 'Pay & Authorize';
        }
      }, 2000);
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});
