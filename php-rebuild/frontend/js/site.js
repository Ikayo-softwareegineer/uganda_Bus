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
const ADMIN_CREDENTIALS = {
  email: 'admin@ugandabus.com',
  password: 'Admin@123'
};

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
  return role === 'admin' ? 'admin.html' : 'index.html';
}

function requireRole(page) {
  const user = getCurrentUser();
  const passengerPages = ['search', 'seats', 'checkout', 'confirmation'];

  if (page === 'home' && user && user.role === 'admin') {
    window.location.href = 'admin.html';
    return false;
  }

  if (page === 'admin') {
    if (user && user.role === 'admin') return true;
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
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const state = getState();
      state.user = null;
      saveState(state);
      window.location.href = 'login.html';
    });
  });
}

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
  return new Date(value).toLocaleString([], {
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
    dateInput.value = new Date().toISOString().split('T')[0];
  }

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

    window.location.href = `search.html?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${encodeURIComponent(date)}&passengers=${encodeURIComponent(passengers)}`;
  });
}

function renderSearchResults() {
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
    return matchesOrigin && matchesDestination && matchesDate && hasSeats;
  });

  if (!trips.length) {
    resultsContainer.innerHTML = `
      <div class="empty-card">
        <h3>No trips found</h3>
        <p>Try another date or route.</p>
      </div>
    `;
    return;
  }

  trips = trips.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));

  resultsContainer.innerHTML = trips.map((trip) => `
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
  `).join('');
}

function renderSeatSelection() {
  const tripId = getParam('tripId');
  const passengers = Number(getParam('passengers') || 1);
  const trip = getTripById(tripId);
  const seatMap = document.getElementById('seatMap');
  const seatContainer = document.getElementById('seatSection');

  if (!trip || !seatMap || !seatContainer) return;

  const allSeats = ['1A', '1B', '1C', '1D', '2A', '2B', '2C', '2D', '3A', '3B', '3C', '3D', '4A', '4B', '4C', '4D'];
  const selected = JSON.parse(sessionStorage.getItem('selectedSeats') || '[]');

  seatContainer.classList.remove('hidden');
  seatMap.innerHTML = allSeats.map((seat) => {
    const isSelected = selected.includes(seat);
    const isBooked = Math.random() < 0.15 && !isSelected;
    const disabled = isBooked ? 'disabled' : '';
    return `<button type="button" class="seat ${isSelected ? 'selected' : ''} ${isBooked ? 'booked' : 'available'}" ${disabled} data-seat="${seat}">${seat}</button>`;
  }).join('');

  document.querySelectorAll('.seat.available').forEach((button) => {
    button.addEventListener('click', () => {
      const seat = button.dataset.seat;
      const nextSelected = [...selected];
      if (nextSelected.includes(seat)) {
        const index = nextSelected.indexOf(seat);
        nextSelected.splice(index, 1);
      } else if (nextSelected.length < passengers) {
        nextSelected.push(seat);
      } else {
        alert(`You can only select ${passengers} seat(s) for this booking.`);
        return;
      }
      sessionStorage.setItem('selectedSeats', JSON.stringify(nextSelected));
      renderSeatSelection();
      updateSummary();
    });
  });

  document.getElementById('summaryRoute').textContent = `${trip.origin} → ${trip.destination}`;
  document.getElementById('summaryDeparture').textContent = dateLabel(trip.departureTime);
  document.getElementById('summaryPassengers').textContent = String(passengers);
  document.getElementById('summarySeats').textContent = 'None';
  document.getElementById('summaryTotal').textContent = currency(0);

  const continueButton = document.getElementById('continueBookingBtn');
  if (continueButton) {
    continueButton.addEventListener('click', () => {
      const selectedSeats = JSON.parse(sessionStorage.getItem('selectedSeats') || '[]');
      if (!selectedSeats.length) {
        alert('Please select one or more seats first.');
        return;
      }
      window.location.href = `checkout.html?tripId=${trip.id}&passengers=${passengers}&seats=${encodeURIComponent(selectedSeats.join(','))}`;
    });
  }

  updateSummary();
}

function updateSummary() {
  const tripId = getParam('tripId');
  const passengers = Number(getParam('passengers') || 1);
  const trip = getTripById(tripId);
  const selectedSeats = JSON.parse(sessionStorage.getItem('selectedSeats') || '[]');
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

function renderCheckoutPage() {
  const tripId = getParam('tripId');
  const trip = getTripById(tripId);
  const seats = (getParam('seats') || '').split(',').filter(Boolean);
  const passengers = Number(getParam('passengers') || 1);

  if (!trip) return;

  const summaryRoute = document.getElementById('summaryRoute');
  const summaryDeparture = document.getElementById('summaryDeparture');
  const summaryPassengers = document.getElementById('summaryPassengers');
  const summarySeats = document.getElementById('summarySeats');
  const summaryTotal = document.getElementById('summaryTotal');

  if (summaryRoute) summaryRoute.textContent = `${trip.origin} → ${trip.destination}`;
  if (summaryDeparture) summaryDeparture.textContent = dateLabel(trip.departureTime);
  if (summaryPassengers) summaryPassengers.textContent = String(passengers);
  if (summarySeats) summarySeats.textContent = seats.length ? seats.join(', ') : 'None';
  if (summaryTotal) summaryTotal.textContent = currency((seats.length || 0) * trip.price);

  const confirmBtn = document.getElementById('confirmBookingBtn');
  if (!confirmBtn) return;

  confirmBtn.addEventListener('click', () => {
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const email = document.getElementById('customerEmail').value.trim();
    const payment = document.getElementById('paymentMethod').value;

    if (!name || !phone || !email) {
      alert('Please enter your details before confirming the booking.');
      return;
    }

    const state = getState();
    const bookingRef = `UG-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(100 + Math.random() * 900)}`;
    const total = (seats.length || 0) * trip.price;

    const booking = {
      id: bookingRef,
      tripId: trip.id,
      route: `${trip.origin} → ${trip.destination}`,
      departure: trip.departureTime,
      seats,
      customer: name,
      phone,
      email,
      payment,
      paymentStatus: payment === 'CASH_AT_STATION' ? 'PAY_AT_STATION' : 'PAID',
      total,
      createdAt: new Date().toISOString()
    };

    state.bookings.unshift(booking);
    saveState(state);

    sessionStorage.removeItem('selectedSeats');
    window.location.href = `confirmation.html?ref=${encodeURIComponent(bookingRef)}`;
  });
}

function renderConfirmationPage() {
  const ref = getParam('ref');
  const booking = getState().bookings.find((item) => item.id === ref);
  const card = document.getElementById('confirmationCard');

  if (!card) return;

  if (!booking) {
    card.innerHTML = '<h2>Booking not found</h2><p>Please make a new booking.</p>';
    return;
  }

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

function renderAdminPage() {
  const statsContainer = document.getElementById('adminStats');
  if (!statsContainer) return;

  const state = getState();
  const bookings = state.bookings;
  const totalBookings = bookings.length;
  const totalRevenue = bookings.reduce((sum, booking) => sum + Number(booking.total || 0), 0);

  statsContainer.innerHTML = `
    <div class="admin-card">
      <h3>Total trips</h3>
      <strong>${state.trips.length}</strong>
    </div>
    <div class="admin-card">
      <h3>Bookings</h3>
      <strong>${totalBookings}</strong>
    </div>
    <div class="admin-card">
      <h3>Revenue</h3>
      <strong>${currency(totalRevenue)}</strong>
    </div>
    <div class="admin-card">
      <h3>Routes</h3>
      <strong>${new Set(state.trips.map((trip) => trip.origin + '→' + trip.destination)).size}</strong>
    </div>
  `;

  const list = document.getElementById('adminBookings');
  if (!list) return;

  list.innerHTML = bookings.length ? bookings.map((booking) => `
    <tr>
      <td>${booking.id}</td>
      <td>${booking.route}</td>
      <td>${booking.seats.join(', ')}</td>
      <td>${currency(booking.total)}</td>
    </tr>
  `).join('') : '<tr><td colspan="4">No bookings yet.</td></tr>';
}

function initLoginPage() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!email || !password) {
      alert('Please enter email and password.');
      return;
    }

    const isAdmin = email.toLowerCase() === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password;
    if (email.toLowerCase().includes('admin') && !isAdmin) {
      alert('Invalid admin email or password.');
      return;
    }

    const state = getState();
    state.user = {
      name: email.split('@')[0],
      email,
      role: isAdmin ? 'admin' : 'customer'
    };
    saveState(state);

    const redirect = getParam('redirect');
    window.location.href = redirect || getRoleHome(state.user.role);
  });
}

function initRegisterPage() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();

    if (!name || !email || !password) {
      alert('Please complete all fields.');
      return;
    }

    const state = getState();
    state.user = { name, email, role: 'customer' };
    saveState(state);

    window.location.href = 'index.html';
  });
}

function initPage() {
  const page = document.body.dataset.page;

  initLogout();
  if (!requireRole(page)) return;

  if (page === 'home') initHomePage();
  if (page === 'search') renderSearchResults();
  if (page === 'seats') renderSeatSelection();
  if (page === 'checkout') renderCheckoutPage();
  if (page === 'confirmation') renderConfirmationPage();
  if (page === 'admin') renderAdminPage();
  if (page === 'login') initLoginPage();
  if (page === 'register') initRegisterPage();
}

document.addEventListener('DOMContentLoaded', initPage);
