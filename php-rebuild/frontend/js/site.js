const DEFAULT_TRIPS = [
  {
    id: 'TRIP-101',
    origin: 'Kampala',
    destination: 'Mbarara',
    departureTime: '2026-09-20T07:30:00',
    arrivalTime: '2026-09-20T13:00:00',
    operator: 'Great Link',
    price: 28000,
    seatsAvailable: 12
  },
  {
    id: 'TRIP-102',
    origin: 'Kampala',
    destination: 'Gulu',
    departureTime: '2026-09-21T08:00:00',
    arrivalTime: '2026-09-21T15:15:00',
    operator: 'Pearl Travel',
    price: 36000,
    seatsAvailable: 9
  },
  {
    id: 'TRIP-103',
    origin: 'Kampala',
    destination: 'Jinja',
    departureTime: '2026-09-22T09:00:00',
    arrivalTime: '2026-09-22T11:00:00',
    operator: 'Coastal Express',
    price: 16000,
    seatsAvailable: 15
  },
  {
    id: 'TRIP-104',
    origin: 'Kampala',
    destination: 'Fort Portal',
    departureTime: '2026-09-23T07:00:00',
    arrivalTime: '2026-09-23T12:30:00',
    operator: 'Roadmaster',
    price: 26000,
    seatsAvailable: 7
  },
  {
    id: 'TRIP-105',
    origin: 'Mbarara',
    destination: 'Kabale',
    departureTime: '2026-09-24T06:30:00',
    arrivalTime: '2026-09-24T10:45:00',
    operator: 'Mountain Route',
    price: 22000,
    seatsAvailable: 10
  },
  {
    id: 'TRIP-106',
    origin: 'Gulu',
    destination: 'Lira',
    departureTime: '2026-09-25T08:30:00',
    arrivalTime: '2026-09-25T11:15:00',
    operator: 'Northline Bus',
    price: 18000,
    seatsAvailable: 18
  }
];

const STORAGE_KEY = 'ugandaBusBooking';

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
    alert('Cannot reach the server. Make sure Apache (XAMPP) is running.');
    throw error;
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = { success: false, message: 'Unexpected server response.' };
  }

  // Server says we are not logged in any more -> go to login
  if (response.status === 401 && !path.startsWith('login') && !path.startsWith('register')) {
    setCurrentUser(null);
    const redirect = window.location.pathname.split('/').pop() + window.location.search;
    window.location.href = `login.html?redirect=${encodeURIComponent(redirect)}`;
  }

  return { ok: response.ok && data.success !== false, status: response.status, data };
}

// Convert a trip row from the database into the shape the pages use
function normalizeTrip(row) {
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    departureTime: String(row.departure_time).replace(' ', 'T'),
    arrivalTime: String(row.arrival_time).replace(' ', 'T'),
    operator: row.operator_name,
    price: Number(row.price_ugx),
    seatsAvailable: Number(row.available_seats),
    totalSeats: Number(row.total_seats || 16),
    bookedSeats: row.booked_seats || []
  };
}

async function fetchTrip(id) {
  const result = await api(`trip.php?id=${encodeURIComponent(id)}`);
  return result.ok ? normalizeTrip(result.data.trip) : null;
}

// ---------- Who is logged in (cached in the browser) ----------

function getState() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return JSON.parse(existing);

  const initial = {
    user: null,
    bookings: [],
    trips: DEFAULT_TRIPS,
    authMode: 'login'
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentUser() {
  return getState().user;
}

function getRoleHome(role) {
  return role === 'admin' || role === 'staff' ? 'admin.html' : 'index.html';
}

function requireRole(page) {
  const user = getCurrentUser();
  const passengerPages = ['search', 'seats', 'checkout', 'confirmation'];
  const adminPages = ['admin'];

  if (page === 'home' && user && ['admin', 'staff'].includes(user.role)) {
    window.location.href = 'admin.html';
    return false;
  }

  if (adminPages.includes(page)) {
    if (user && ['admin', 'staff'].includes(user.role)) return true;
    window.location.href = user ? 'index.html' : 'login.html?redirect=admin.html';
    return false;
  }

  if (passengerPages.includes(page)) {
    if (user && user.role === 'customer') return true;
    const redirect = `${page}.html${window.location.search}`;
    window.location.href = `login.html?redirect=${encodeURIComponent(redirect)}`;
    return false;
  }

  return true;
}

function initLogout() {
  document.querySelectorAll('[data-logout]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await api('logout.php', { method: 'POST' }).catch(() => {});
      setCurrentUser(null);
      window.location.href = 'login.html';
    });
  });
}

// ---------- Formatting helpers ----------

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

function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

function getTripById(id) {
  const state = getState();
  return state.trips.find((trip) => trip.id === id) || null;
}

function populateRouteSelects() {
  const state = getState();
  const origins = [...new Set(state.trips.map((trip) => trip.origin))];
  const destinations = [...new Set(state.trips.map((trip) => trip.destination))];

  const originSelect = document.getElementById('origin');
  const destinationSelect = document.getElementById('destination');
  if (!originSelect || !destinationSelect) return;

  const result = await api('routes.php');
  if (!result.ok) return;
  const { origins, destinations } = result.data;

  originSelect.innerHTML = ['<option value="">Select origin</option>']
    .concat(origins.map((origin) => `<option value="${origin}">${origin}</option>`))
    .join('');

  destinationSelect.innerHTML = ['<option value="">Select destination</option>']
    .concat(destinations.map((destination) => `<option value="${destination}">${destination}</option>`))
    .join('');

  const defaultOrigin = getParam('origin');
  const defaultDestination = getParam('destination');
  if (defaultOrigin) originSelect.value = defaultOrigin;
  if (defaultDestination) destinationSelect.value = defaultDestination;
}

function initHomePage() {
  populateRouteSelects();
  renderSearchResults();

  const form = document.getElementById('searchForm');
  const bookButton = document.getElementById('bookBtn');
  const dateInput = document.getElementById('date');
  if (dateInput && !dateInput.value) {
    dateInput.value = todayKey();
  }
  if (dateInput) dateInput.min = todayKey();

  if (bookButton) {
    bookButton.addEventListener('click', () => {
      if (form) form.requestSubmit();
    });
  }

  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    const date = document.getElementById('date').value;
    const passengers = document.getElementById('passengers').value;

    if (!origin || !destination || !date) {
      alert('Please choose origin, destination and date.');
      return;
    }

    if (origin === destination) {
      alert('Origin and destination cannot be the same.');
      return;
    }

    window.location.href = `search.html?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${encodeURIComponent(date)}&passengers=${encodeURIComponent(passengers)}`;
  });
}

// ---------- Search results (home "Available trips" + search.html) ----------

async function renderSearchResults() {
  const resultsContainer = document.getElementById('results');
  if (!resultsContainer) return;

  const origin = getParam('origin');
  const destination = getParam('destination');
  const date = getParam('date');
  const passengers = Number(getParam('passengers') || 1);

  const state = getState();
  let trips = state.trips.filter((trip) => {
    const matchesOrigin = !origin || trip.origin === origin;
    const matchesDestination = !destination || trip.destination === destination;
    const matchesDate = !date || trip.departureTime.slice(0, 10) === date;
    const hasSeats = trip.seatsAvailable >= passengers;
    const isScheduled = trip.status !== 'CANCELLED';
    return isScheduled && matchesOrigin && matchesDestination && matchesDate && hasSeats;
  });

  if (!trips.length) {
    resultsContainer.innerHTML = `
      <div class="empty-card">
        <h3>No trips found</h3>
        <p>${result.ok ? 'Try another date or route.' : (result.data.message || 'Try another date or route.')}</p>
      </div>
    `;
    return;
  }

  const notice = fallbackUsed && date
    ? `<p class="route-note">No exact trip was available on ${new Date(date).toLocaleDateString()}, but these departures are still available for the selected route.</p>`
    : '';

  resultsContainer.innerHTML = `
    ${notice}
    ${trips.map((trip) => `
      <article class="trip-card">
        <div class="trip-top">
          <div>
            <div class="route-name">${trip.origin} → ${trip.destination}</div>
            <small>${trip.operator}</small>
          </div>
          <div class="route-price">${currency(trip.price)}</div>
        </div>

        <div class="trip-meta">
          <div>
            Departure
            <strong>${dateLabel(trip.departureTime)}</strong>
          </div>
          <div>
            Arrival
            <strong>${dateLabel(trip.arrivalTime)}</strong>
          </div>
        </div>

        <div class="trip-footer">
          <span class="badge ${trip.seatsAvailable > 5 ? 'success' : 'warning'}">${trip.seatsAvailable} seats</span>
          <a class="primary-btn" href="seats.html?tripId=${trip.id}&passengers=${passengers}">Select trip</a>
        </div>
      </article>
    `).join('')}
  `;
}

// ---------- Seat selection ----------

let seatTrip = null; // the trip loaded from the server for seats.html

function seatLabels(totalSeats) {
  const labels = [];
  const rows = Math.ceil(totalSeats / 4);
  for (let row = 1; row <= rows; row++) {
    ['A', 'B', 'C', 'D'].forEach((col) => {
      if (labels.length < totalSeats) labels.push(`${row}${col}`);
    });
  }
  return labels;
}

async function renderSeatSelection() {
  const tripId = getParam('tripId');
  const passengers = Number(getParam('passengers') || 1);
  const seatContainer = document.getElementById('seatSection');
  if (!tripId || !seatContainer) return;

  seatTrip = await fetchTrip(tripId);
  if (!seatTrip) {
    alert('Trip not found.');
    window.location.href = 'index.html';
    return;
  }

  sessionStorage.setItem('selectedSeats', '[]');
  seatContainer.classList.remove('hidden');
  drawSeats(passengers);

  const continueButton = document.getElementById('continueBookingBtn');
  if (continueButton) {
    continueButton.addEventListener('click', () => {
      const selectedSeats = JSON.parse(sessionStorage.getItem('selectedSeats') || '[]');
      if (!selectedSeats.length) {
        alert('Please select one or more seats first.');
        return;
      }
      window.location.href = `checkout.html?tripId=${seatTrip.id}&passengers=${passengers}&seats=${encodeURIComponent(selectedSeats.join(','))}`;
    });
  }
}

function drawSeats(passengers) {
  const seatMap = document.getElementById('seatMap');
  if (!seatTrip || !seatMap) return;

  const selected = JSON.parse(sessionStorage.getItem('selectedSeats') || '[]');

  // Booked seats come from real bookings in the database
  seatMap.innerHTML = seatLabels(seatTrip.totalSeats).map((seat) => {
    const isSelected = selected.includes(seat);
    const isBooked = seatTrip.bookedSeats.includes(seat);
    const disabled = isBooked ? 'disabled' : '';
    return `<button type="button" class="seat ${isSelected ? 'selected' : ''} ${isBooked ? 'booked' : 'available'}" ${disabled} data-seat="${seat}">${seat}</button>`;
  }).join('');

  document.querySelectorAll('.seat.available').forEach((button) => {
    button.addEventListener('click', () => {
      const seat = button.dataset.seat;
      const nextSelected = [...selected];
      if (nextSelected.includes(seat)) {
        nextSelected.splice(nextSelected.indexOf(seat), 1);
      } else if (nextSelected.length < passengers) {
        nextSelected.push(seat);
      } else {
        alert(`You can only select ${passengers} seat(s) for this booking.`);
        return;
      }
      sessionStorage.setItem('selectedSeats', JSON.stringify(nextSelected));
      drawSeats(passengers);
    });
  });

  updateSummary(seatTrip, selected, passengers);
}

function updateSummary(trip, selectedSeats, passengers) {
  const summaryRoute = document.getElementById('summaryRoute');
  const summaryDeparture = document.getElementById('summaryDeparture');
  const summaryPassengers = document.getElementById('summaryPassengers');
  const summarySeats = document.getElementById('summarySeats');
  const summaryTotal = document.getElementById('summaryTotal');

  if (!trip || !summaryRoute || !summaryDeparture || !summaryPassengers || !summarySeats || !summaryTotal) return;

  summaryRoute.textContent = `${trip.origin} → ${trip.destination}`;
  summaryDeparture.textContent = dateLabel(trip.departureTime);
  summaryPassengers.textContent = String(passengers);
  summarySeats.textContent = selectedSeats.length ? selectedSeats.join(', ') : 'None';
  summaryTotal.textContent = currency((selectedSeats.length || 0) * trip.price);
}

// ---------- Checkout ----------

async function renderCheckoutPage() {
  const tripId = getParam('tripId');
  const seats = (getParam('seats') || '').split(',').filter(Boolean);
  const passengers = Number(getParam('passengers') || 1);

  const trip = await fetchTrip(tripId);
  if (!trip) return;

  updateSummary(trip, seats, passengers);

  // Pre-fill what we already know about the logged-in user
  const user = getCurrentUser();
  const nameInput = document.getElementById('customerName');
  const emailInput = document.getElementById('customerEmail');
  if (user && nameInput && !nameInput.value) nameInput.value = user.name;
  if (user && emailInput && !emailInput.value) emailInput.value = user.email;

  const confirmBtn = document.getElementById('confirmBookingBtn');
  if (!confirmBtn) return;

  confirmBtn.addEventListener('click', async () => {
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const email = document.getElementById('customerEmail').value.trim();
    const payment = document.getElementById('paymentMethod').value;

    if (!name || !phone || !email) {
      alert('Please enter your details before confirming the booking.');
      return;
    }

    confirmBtn.disabled = true;
    const result = await api('book.php', {
      method: 'POST',
      body: { tripId: trip.id, customerName: name, phone, email, paymentMethod: payment, seats }
    });
    confirmBtn.disabled = false;

    if (!result.ok) {
      alert(result.data.message || 'Booking failed. Please try again.');
      if (result.status === 409) {
        window.location.href = `seats.html?tripId=${trip.id}&passengers=${passengers}`;
      }
      return;
    }

    sessionStorage.removeItem('selectedSeats');
    window.location.href = `confirmation.html?ref=${encodeURIComponent(result.data.bookingRef)}`;
  });
}

// ---------- Confirmation / receipt ----------

async function renderConfirmationPage() {
  const ref = getParam('ref');
  const card = document.getElementById('confirmationCard');
  if (!card) return;

  const result = await api(`booking.php?ref=${encodeURIComponent(ref)}`);
  if (!result.ok) {
    card.innerHTML = '<h2>Booking not found</h2><p>Please make a new booking.</p>';
    return;
  }

  const row = result.data.booking;
  const booking = {
    id: row.booking_ref,
    tripId: row.trip_id,
    route: `${row.origin} → ${row.destination}`,
    departure: row.departure_time,
    seats: String(row.seats).split(','),
    customer: row.user_name,
    payment: row.payment_method,
    paymentStatus: row.payment_status,
    total: Number(row.total_amount)
  };

  const paymentStatus = booking.paymentStatus === 'PAY_AT_STATION' ? 'Pay cash at station' : 'Paid';
  const qrData = `UGANDA-BUS|${booking.id}|${booking.tripId}|${booking.seats.join(',')}|${booking.payment}|${booking.paymentStatus || 'PAID'}`;

  card.innerHTML = `
    <div class="confirmation-box">
      <span class="badge success">Confirmed</span>
      <h2>Booking receipt</h2>
      <p class="ref-code">Reference: <strong>${booking.id}</strong></p>
      <p><strong>Route:</strong> ${booking.route}</p>
      <p><strong>Departure:</strong> ${dateLabel(booking.departure)}</p>
      <p><strong>Seats:</strong> ${booking.seats.join(', ')}</p>
      <p><strong>Passenger:</strong> ${booking.customer}</p>
      <p><strong>Payment method:</strong> ${paymentLabel(booking.payment)}</p>
      <p><strong>Payment status:</strong> ${paymentStatus}</p>
      <p><strong>Total:</strong> ${currency(booking.total)}</p>
      <div class="receipt-qr">
        <div id="bookingQr" aria-label="QR code for booking ${booking.id}">
          <img id="bookingQrFallback" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}" alt="QR code for booking ${booking.id}" />
        </div>
        <p>Show this QR code to the conductor.</p>
      </div>
      <button id="printReceiptBtn" class="primary-btn" type="button" onclick="window.print()">Print receipt</button>
      <a class="primary-btn" href="index.html">Back home</a>
    </div>
  `;

  const qrContainer = document.getElementById('bookingQr');
  if (qrContainer && typeof QRCode === 'function') {
    const fallback = document.getElementById('bookingQrFallback');
    try {
      const generatedQr = document.createElement('div');
      generatedQr.className = 'generated-qr';
      qrContainer.appendChild(generatedQr);
      new QRCode(generatedQr, { text: qrData, width: 220, height: 220 });
      if (generatedQr.querySelector('canvas, img, svg, table')) {
        if (fallback) fallback.remove();
      } else {
        generatedQr.remove();
      }
    } catch (error) {
      console.error('QR generation failed; using fallback QR image.', error);
    }
  }

}

// Validation rules for login/register (the server checks them again)
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s'.-]*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 6;

function initLoginPage() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const successMsg = document.getElementById('registerSuccess');
  if (successMsg && getParam('registered') === '1') {
    successMsg.classList.remove('hidden');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!email || !password) {
      alert('Please enter email and password.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      alert('Please enter a valid email address (e.g. you@example.com).');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      alert(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    const result = await api('login.php', { method: 'POST', body: { email, password } });
    if (!result.ok) {
      alert(result.data.message || 'Login failed.');
      return;
    }

    const state = getState();
    let account = null;
    if (!isAdmin) {
      const users = state.users || [];
      account = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!account || account.password !== password) {
        alert('Invalid email or password. If you are new, please register first.');
        return;
      }
      if (account.blocked) {
        alert('This account has been suspended. Please contact Uganda Bus support.');
        return;
      }
    }

    state.user = {
      name: isAdmin ? 'Admin' : account.name,
      email,
      role: isAdmin ? 'admin' : 'customer'
    };
    saveState(state);

    const redirect = getParam('redirect');
    window.location.href = redirect || getRoleHome(result.data.user.role);
  });
}

function initRegisterPage() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();

    if (!name || !email || !password) {
      alert('Please complete all fields.');
      return;
    }

    if (!NAME_PATTERN.test(name)) {
      alert('Name should contain letters only (no numbers or symbols).');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      alert('Please enter a valid email address (e.g. you@example.com).');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      alert(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    const result = await api('register.php', { method: 'POST', body: { name, email, password } });
    if (!result.ok) {
      alert(result.data.message || 'Registration failed.');
      return;
    }

    // Save the account but do NOT log the user in – they must log in with these credentials
    state.users.push({ name, email, password });
    state.user = null;
    saveState(state);

    window.location.href = 'login.html?registered=1';
  });
}

// ---------- Start ----------

function initPage() {
  const page = document.body.dataset.page;

  initLogout();
  if (!requireRole(page)) return;

  if (page === 'home') initHomePage();
  if (page === 'search') renderSearchResults();
  if (page === 'seats') renderSeatSelection();
  if (page === 'checkout') renderCheckoutPage();
  if (page === 'confirmation') renderConfirmationPage();
  if (page === 'admin' && typeof initAdminDashboard === 'function') initAdminDashboard();
  if (page === 'login') initLoginPage();
  if (page === 'register') initRegisterPage();
}

document.addEventListener('DOMContentLoaded', initPage);
