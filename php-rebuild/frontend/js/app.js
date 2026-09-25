88const state = {
  trips: [],
  selectedTrip: null,
  selectedSeats: [],
  availableSeats: [],
  seatMap: []
};

const elements = {
  origin: document.getElementById('origin'),
  destination: document.getElementById('destination'),
  date: document.getElementById('date'),
  passengers: document.getElementById('passengers'),
  searchForm: document.getElementById('searchForm'),
  results: document.getElementById('results'),
  seatSection: document.getElementById('seatSection'),
  seatMap: document.getElementById('seatMap'),
  bookingAlert: document.getElementById('bookingAlert'),
  summaryRoute: document.getElementById('summaryRoute'),
  summaryDeparture: document.getElementById('summaryDeparture'),
  summaryPassengers: document.getElementById('summaryPassengers'),
  summarySeats: document.getElementById('summarySeats'),
  summaryTotal: document.getElementById('summaryTotal'),
  customerName: document.getElementById('customerName'),
  customerPhone: document.getElementById('customerPhone'),
  customerEmail: document.getElementById('customerEmail'),
  paymentMethod: document.getElementById('paymentMethod'),
  bookBtn: document.getElementById('bookBtn'),
  adminStats: document.getElementById('adminStats')
};

function showAlert(message, type = 'success') {
  elements.bookingAlert.innerHTML = `<div class="alert ${type}">${message}</div>`;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function getSeatNumbers() {
  const seatNumbers = [];
  for (let row = 1; row <= 4; row++) {
    ['A', 'B', 'C', 'D'].forEach((col) => seatNumbers.push(`${row}${col}`));
  }
  return seatNumbers;
}

function buildSeatMap() {
  const seats = getSeatNumbers();
  const bookedSeats = new Set();

  state.availableSeats.forEach((seat) => {
    if (seat && seat.isBooked) bookedSeats.add(seat.label);
  });

  elements.seatMap.innerHTML = '';

  seats.forEach((seatLabel) => {
    const isBooked = bookedSeats.has(seatLabel);
    const isSelected = state.selectedSeats.includes(seatLabel);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `seat ${isBooked ? 'booked' : 'available'} ${isSelected ? 'selected' : ''}`;
    btn.textContent = seatLabel;
    btn.disabled = isBooked;
    btn.addEventListener('click', () => toggleSeat(seatLabel));
    elements.seatMap.appendChild(btn);
  });
}

function toggleSeat(seatLabel) {
  const maxSeats = Number(elements.passengers.value || 1);

  if (state.selectedSeats.includes(seatLabel)) {
    state.selectedSeats = state.selectedSeats.filter((item) => item !== seatLabel);
  } else {
    if (state.selectedSeats.length >= maxSeats) {
      showAlert(`You can only select ${maxSeats} seat(s).`, 'error');
      return;
    }
    state.selectedSeats.push(seatLabel);
  }

  updateBookingSummary();
  buildSeatMap();
}

function updateBookingSummary() {
  const trip = state.selectedTrip;
  if (!trip) return;

  const passengerCount = Number(elements.passengers.value || 1);
  const total = Number(trip.price_ugx || trip.route_price || 0) * state.selectedSeats.length;

  elements.summaryRoute.textContent = `${trip.origin} → ${trip.destination}`;
  elements.summaryDeparture.textContent = formatDate(trip.departure_time);
  elements.summaryPassengers.textContent = String(passengerCount);
  elements.summarySeats.textContent = state.selectedSeats.length ? state.selectedSeats.join(', ') : 'None';
  elements.summaryTotal.textContent = formatMoney(total);
}

async function loadOptions() {
  try {
    const response = await fetch('../../backend/api/routes.php');
    const payload = await response.json();

    if (!payload.success) {
      throw new Error(payload.message || 'Could not load route data');
    }

    const { origins, destinations } = payload;

    elements.origin.innerHTML = '<option value="">Select origin</option>' + origins.map((item) => `<option value="${item}">${item}</option>`).join('');
    elements.destination.innerHTML = '<option value="">Select destination</option>' + destinations.map((item) => `<option value="${item}">${item}</option>`).join('');
    elements.date.value = new Date().toISOString().split('T')[0];
  } catch (error) {
    console.error(error);
    showAlert(error.message, 'error');
  }
}

async function searchTrips(event) {
  event.preventDefault();

  const origin = elements.origin.value;
  const destination = elements.destination.value;
  const date = elements.date.value;
  const passengers = Number(elements.passengers.value || 1);

  if (!origin || !destination || !date) {
    showAlert('Please select all search fields.', 'error');
    return;
  }

  try {
    const url = `../../backend/api/search.php?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${encodeURIComponent(date)}&passengers=${passengers}`;
    const res = await fetch(url);
    const payload = await res.json();

    if (!payload.success) {
      throw new Error(payload.message || 'No trips found');
    }

    state.trips = payload.trips || [];
    state.selectedTrip = null;
    state.selectedSeats = [];
    elements.seatSection.classList.add('hidden');

    renderTrips();

    if (state.trips.length === 0) {
      showAlert('No trips available for your route. Try another date.', 'error');
      return;
    }

    showAlert(`Found ${state.trips.length} trip(s).`, 'success');
  } catch (error) {
    console.error(error);
    showAlert(error.message, 'error');
  }
}

function renderTrips() {
  elements.results.innerHTML = '';

  if (!state.trips.length) {
    elements.results.innerHTML = '<div class="info-card"><h3>No trips</h3><p>Select another route or date.</p></div>';
    return;
  }

  state.trips.forEach((trip) => {
    const card = document.createElement('div');
    card.className = 'trip-card';

    const price = Number(trip.price_ugx || trip.route_price || 0);

    card.innerHTML = `
      <div class="trip-top">
        <div>
          <div class="route-name">${trip.origin} → ${trip.destination}</div>
          <small>${trip.operator_name}</small>
        </div>
        <div class="route-price">${formatMoney(price)}</div>
      </div>

      <div class="trip-meta">
        <div>
          Departure
          <strong>${formatDate(trip.departure_time)}</strong>
        </div>
        <div>
          Arrival
          <strong>${formatDate(trip.arrival_time)}</strong>
        </div>
      </div>

      <div class="trip-footer">
        <span class="badge ${trip.available_seats > 5 ? 'success' : 'warning'}">${trip.available_seats} seats</span>
        <button class="primary-btn" type="button">Select trip</button>
      </div>
    `;

    card.querySelector('button').addEventListener('click', () => chooseTrip(trip));
    elements.results.appendChild(card);
  });
}

function chooseTrip(trip) {
  state.selectedTrip = trip;
  state.selectedSeats = [];
  const max = Number(elements.passengers.value || 1);

  state.availableSeats = Array.from({ length: 16 }, (_, index) => {
    const label = `${Math.floor(index / 4) + 1}${['A', 'B', 'C', 'D'][index % 4]}`;
    return { label, isBooked: false };
  }).slice(0, Math.min(16, max + 2));

  elements.seatSection.classList.remove('hidden');
  buildSeatMap();
  elements.summaryRoute.textContent = `${trip.origin} → ${trip.destination}`;
  elements.summaryDeparture.textContent = formatDate(trip.departure_time);
  elements.summaryPassengers.textContent = String(max);
  elements.summarySeats.textContent = 'None';
  elements.summaryTotal.textContent = formatMoney(0);
  showAlert(`Trip selected: ${trip.origin} to ${trip.destination}`, 'success');
}

async function loadAdminStats() {
  try {
    const response = await fetch('../../backend/api/stats.php');
    const payload = await response.json();

    if (!payload.success) {
      return;
    }

    elements.adminStats.innerHTML = payload.stats.map((item) => `
      <div class="admin-card stat-box">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

async function handleBooking() {
  if (!state.selectedTrip) {
    showAlert('Please select a trip first.', 'error');
    return;
  }

  if (state.selectedSeats.length === 0) {
    showAlert('Please select at least one seat.', 'error');
    return;
  }

  const customerName = elements.customerName.value.trim();
  const phone = elements.customerPhone.value.trim();
  const email = elements.customerEmail.value.trim();

  if (!customerName || !phone || !email) {
    showAlert('Please fill in the customer details.', 'error');
    return;
  }

  try {
    const response = await fetch('../../backend/api/book.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: state.selectedTrip.id,
        customerName,
        phone,
        email,
        paymentMethod: elements.paymentMethod.value,
        seats: state.selectedSeats
      })
    });

    const payload = await response.json();

    if (!payload.success) {
      throw new Error(payload.message || 'Booking failed');
    }

    showAlert(`Booking confirmed! Ref: ${payload.bookingRef}`, 'success');
    elements.summaryTotal.textContent = formatMoney(payload.total);
    elements.customerName.value = '';
    elements.customerPhone.value = '';
    elements.customerEmail.value = '';
    state.selectedSeats = [];
    buildSeatMap();
    await loadAdminStats();
  } catch (error) {
    console.error(error);
    showAlert(error.message, 'error');
  }
}

function init() {
  elements.searchForm.addEventListener('submit', searchTrips);
  elements.bookBtn.addEventListener('click', handleBooking);
  elements.passengers.addEventListener('change', () => {
    if (state.selectedTrip) {
      state.selectedSeats = [];
      buildSeatMap();
      updateBookingSummary();
    }
  });
  loadOptions();
  loadAdminStats();
}

init();
