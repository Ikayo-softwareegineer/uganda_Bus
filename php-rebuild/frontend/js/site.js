async function readApiResponse(response) {
  const body = await response.text();
  let payload;

  try {
    payload = JSON.parse(body);
  } catch (error) {
    const isHtml = /^\s*(<!doctype html|<html|<br\b|<b\b)/i.test(body);
    if (isHtml) {
      throw new Error('The server returned an HTML error instead of JSON. The PHP API may be unavailable; run the project with a PHP server and initialize its database.');
    }
    throw new Error('The server returned an invalid response. Please check the PHP API.');
  }

  if (!response.ok) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return payload;
}

function dateOffset(days, time) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const datePart = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  return `${datePart}T${time}`;
}

const DEFAULT_TRIPS = [
  {
    id: 'TRIP-101',
    origin: 'Kampala',
    destination: 'Mbarara',
    departureTime: dateOffset(1, '07:30:00'),
    arrivalTime: dateOffset(1, '13:00:00'),
    operator: 'Great Link',
    price: 28000,
    seatsAvailable: 12
  },
  {
    id: 'TRIP-102',
    origin: 'Kampala',
    destination: 'Gulu',
    departureTime: dateOffset(2, '08:00:00'),
    arrivalTime: dateOffset(2, '15:15:00'),
    operator: 'Pearl Travel',
    price: 36000,
    seatsAvailable: 9
  },
  {
    id: 'TRIP-103',
    origin: 'Kampala',
    destination: 'Jinja',
    departureTime: dateOffset(3, '09:00:00'),
    arrivalTime: dateOffset(3, '11:00:00'),
    operator: 'Coastal Express',
    price: 16000,
    seatsAvailable: 15
  },
  {
    id: 'TRIP-104',
    origin: 'Kampala',
    destination: 'Fort Portal',
    departureTime: dateOffset(4, '07:00:00'),
    arrivalTime: dateOffset(4, '12:30:00'),
    operator: 'Roadmaster',
    price: 26000,
    seatsAvailable: 7
  },
  {
    id: 'TRIP-105',
    origin: 'Mbarara',
    destination: 'Kabale',
    departureTime: dateOffset(5, '06:30:00'),
    arrivalTime: dateOffset(5, '10:45:00'),
    operator: 'Mountain Route',
    price: 22000,
    seatsAvailable: 10
  },
  {
    id: 'TRIP-106',
    origin: 'Gulu',
    destination: 'Lira',
    departureTime: dateOffset(6, '08:30:00'),
    arrivalTime: dateOffset(6, '11:15:00'),
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
    users: [],
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

function todayKey() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function isUpcomingTrip(trip) {
  return String(trip.departureTime || '').slice(0, 10) >= todayKey();
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
  const upcomingTrips = state.trips.filter(isUpcomingTrip);
  const origins = [...new Set(upcomingTrips.map((trip) => trip.origin))];
  const destinations = [...new Set(upcomingTrips.map((trip) => trip.destination))];

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
  const exactMatches = state.trips.filter((trip) => {
    if (!isUpcomingTrip(trip)) return false;
    const matchesOrigin = !origin || trip.origin === origin;
    const matchesDestination = !destination || trip.destination === destination;
    const matchesDate = !date || trip.departureTime.slice(0, 10) === date;
    const hasSeats = trip.seatsAvailable >= passengers;
    const isScheduled = trip.status !== 'CANCELLED';
    return isScheduled && matchesOrigin && matchesDestination && matchesDate && hasSeats;
  });

  let trips = exactMatches;
  let fallbackUsed = false;

  if (!trips.length) {
    trips = state.trips.filter((trip) => {
      if (!isUpcomingTrip(trip)) return false;
      const matchesRoute = (!origin || trip.origin === origin) && (!destination || trip.destination === destination);
      const hasSeats = trip.seatsAvailable >= passengers;
      return matchesRoute && hasSeats;
    });
    fallbackUsed = true;
  }

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
      status: 'CONFIRMED',
      seatsReserved: true,
      total,
      createdAt: new Date().toISOString()
    };

    state.bookings.unshift(booking);
    const bookedTrip = state.trips.find((item) => item.id === trip.id);
    if (bookedTrip) bookedTrip.seatsAvailable = Math.max(0, bookedTrip.seatsAvailable - seats.length);
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



// Validation rules for login/register
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

  if (getParam('registered') === '1') {
    alert('Account created successfully. Please log in with your email and password.');
  }

  form.addEventListener('submit', (event) => {
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

    const isAdmin = email.toLowerCase() === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password;
    if (email.toLowerCase().includes('admin') && !isAdmin) {
      alert('Invalid admin email or password.');
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

    const userRole = isAdmin ? 'admin' : (account && account.role ? account.role : 'customer');
    state.user = {
      name: isAdmin ? 'Admin' : account.name,
      email,
      role: userRole
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

    const state = getState();
    state.users = state.users || [];
    const exists = state.users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists || email.toLowerCase() === ADMIN_CREDENTIALS.email) {
      alert('An account with this email already exists. Please log in.');
      return;
    }

    // Save the account but do NOT log the user in – they must log in with these credentials
    state.users.push({ name, email, password, role: 'customer' });
    state.user = null;
    saveState(state);

    window.location.href = 'login.html?registered=1';
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
  if (page === 'admin' && typeof initAdminDashboard === 'function') initAdminDashboard();
  if (page === 'login') initLoginPage();
  if (page === 'register') initRegisterPage();
}

document.addEventListener('DOMContentLoaded', initPage);
