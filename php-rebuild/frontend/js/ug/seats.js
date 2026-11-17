/**
 * UG Express - Interactive Bus Seat Selection Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { tripAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  renderLayout();

  const urlParams = new URLSearchParams(window.location.search);
  const tripId = urlParams.get('tripId');
  const maxSeats = parseInt(urlParams.get('passengers') || '1', 10);

  if (!tripId) {
    alert('No trip selected. Redirecting to search...');
    window.location.href = 'index.html';
    return;
  }

  // UI Elements
  const routeSummaryEl = document.getElementById('trip-route-summary');
  const detailsSummaryEl = document.getElementById('trip-details-summary');
  const seatGridEl = document.getElementById('seat-grid-container');
  const selectedSeatsDisplay = document.getElementById('selected-seats-display');
  const totalPriceDisplay = document.getElementById('total-price-display');
  const checkoutBtn = document.getElementById('btn-proceed-checkout');
  const maxSeatsWarning = document.getElementById('max-seats-warning');

  let trip = null;
  let seats = [];
  let selectedSeats = [];

  async function loadTripDetails() {
    try {
      const res = await tripAPI.getTripById(tripId);
      if (res.data.success && res.data.trip) {
        trip = res.data.trip;
        renderTripInfo();
        generateSeats();
        renderSeatMap();
        updateFareSummary();
      } else {
        alert('Trip not found.');
        window.location.href = 'index.html';
      }
    } catch (err) {
      console.error(err);
      alert('Unable to load trip seats. Please try again.');
    }
  }

  function renderTripInfo() {
    if (routeSummaryEl) {
      routeSummaryEl.innerHTML = `
        <span>${trip.route?.origin || 'Origin'}</span>
        <i data-lucide="arrow-right" style="width: 1rem; height: 1rem; display: inline-block; vertical-align: middle; color: #000000;"></i>
        <span>${trip.route?.destination || 'Destination'}</span>
      `;
    }
    if (detailsSummaryEl) {
      const dep = new Date(trip.departureTime);
      detailsSummaryEl.textContent = `${dep.toDateString()} at ${dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${trip.vehicle?.operatorName || 'Uganda Coach Express'} • UGX ${trip.priceUGX.toLocaleString()} per seat`;
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function generateSeats() {
    if (trip.seats && trip.seats.length > 0) {
      seats = trip.seats;
    } else {
      // Standard 36 seats: 9 rows x 4 cols (1A, 1B, 1C, 1D ... 9D)
      const cols = ['A', 'B', 'C', 'D'];
      seats = [];
      for (let r = 1; r <= 9; r++) {
        for (let c = 1; c <= 4; c++) {
          const seatNum = `${r}${cols[c - 1]}`;
          seats.push({
            id: `seat-${r}-${c}`,
            seatNumber: seatNum,
            seatRow: r,
            seatCol: c,
            isAvailable: !(r === 1 && c === 2) && !(r === 3 && c === 3), // simulate already booked seats
          });
        }
      }
    }
  }

  function renderSeatMap() {
    if (!seatGridEl) return;

    // Group seats by row
    const rows = {};
    seats.forEach((seat) => {
      if (!rows[seat.seatRow]) rows[seat.seatRow] = [];
      rows[seat.seatRow].push(seat);
    });

    let html = '';
    Object.keys(rows).sort((a, b) => a - b).forEach((rowNum) => {
      const rowSeats = rows[rowNum].sort((a, b) => a.seatCol - b.seatCol);
      const leftSeats = rowSeats.slice(0, 2);
      const rightSeats = rowSeats.slice(2, 4);

      html += `
        <div class="seat-grid-row">
          <!-- Left Pair (A & B) -->
          <div class="seat-pair">
            ${leftSeats.map(renderSeatButton).join('')}
          </div>

          <!-- Center Aisle -->
          <div class="aisle-label">AISLE</div>

          <!-- Right Pair (C & D) -->
          <div class="seat-pair">
            ${rightSeats.map(renderSeatButton).join('')}
          </div>
        </div>
      `;
    });

    seatGridEl.innerHTML = html;

    // Attach click events
    seatGridEl.querySelectorAll('.seat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const seatId = btn.dataset.seatId;
        const seat = seats.find((s) => s.id === seatId);
        if (seat && (seat.isAvailable !== false)) {
          toggleSeat(seat);
        }
      });
    });
  }

  function renderSeatButton(seat) {
    const isOccupied = seat.isAvailable === false;
    const isSelected = selectedSeats.some((s) => s.id === seat.id);

    let stateClass = 'available';
    if (isOccupied) stateClass = 'booked';
    else if (isSelected) stateClass = 'selected';

    return `
      <button
        type="button"
        class="seat-btn ${stateClass}"
        data-seat-id="${seat.id}"
        ${isOccupied ? 'disabled' : ''}
        title="Seat ${seat.seatNumber} ${isOccupied ? '(Booked)' : '(Available)'}"
      >
        ${seat.seatNumber}
      </button>
    `;
  }

  function toggleSeat(seat) {
    const idx = selectedSeats.findIndex((s) => s.id === seat.id);
    if (idx >= 0) {
      selectedSeats.splice(idx, 1);
    } else {
      if (selectedSeats.length >= maxSeats) {
        if (maxSeatsWarning) maxSeatsWarning.style.display = 'block';
        return;
      }
      selectedSeats.push(seat);
    }

    if (maxSeatsWarning) {
      maxSeatsWarning.style.display = selectedSeats.length >= maxSeats ? 'block' : 'none';
    }

    renderSeatMap();
    updateFareSummary();
  }

  function updateFareSummary() {
    const total = selectedSeats.length * (trip ? trip.priceUGX : 0);

    if (selectedSeatsDisplay) {
      selectedSeatsDisplay.textContent = selectedSeats.length > 0
        ? selectedSeats.map((s) => s.seatNumber).join(', ')
        : 'None';
    }

    if (totalPriceDisplay) {
      totalPriceDisplay.textContent = `UGX ${total.toLocaleString()}`;
    }

    if (checkoutBtn) {
      checkoutBtn.disabled = selectedSeats.length === 0;
      checkoutBtn.style.opacity = selectedSeats.length === 0 ? '0.5' : '1';
    }
  }

  // Proceed to Checkout
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (selectedSeats.length === 0) {
        alert('Please select at least one seat to proceed.');
        return;
      }

      // Save selection in sessionStorage
      sessionStorage.setItem('selected_trip', JSON.stringify(trip));
      sessionStorage.setItem('selected_seats', JSON.stringify(selectedSeats));

      const seatIds = selectedSeats.map((s) => s.id).join(',');
      window.location.href = `checkout.html?tripId=${trip.id}&seats=${encodeURIComponent(seatIds)}`;
    });
  }

  loadTripDetails();
});
