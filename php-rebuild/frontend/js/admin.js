// Admin dashboard: sidebar menu + content sections, backed by the same localStorage state as site.js

const DEFAULT_BUSES = [
  { id: 'BUS-01', plate: 'UBA 123K', operator: 'Great Link', model: 'Scania Marcopolo', type: 'Executive', capacity: 16, status: 'ACTIVE' },
  { id: 'BUS-02', plate: 'UBB 456M', operator: 'Pearl Travel', model: 'Yutong ZK6122', type: 'Standard', capacity: 16, status: 'ACTIVE' },
  { id: 'BUS-03', plate: 'UBC 789P', operator: 'Coastal Express', model: 'Toyota Coaster', type: 'Standard', capacity: 16, status: 'ACTIVE' },
  { id: 'BUS-04', plate: 'UBD 234Q', operator: 'Roadmaster', model: 'Higer KLQ6128', type: 'VIP', capacity: 16, status: 'ACTIVE' },
  { id: 'BUS-05', plate: 'UBE 567R', operator: 'Mountain Route', model: 'Isuzu Journey', type: 'Standard', capacity: 16, status: 'ACTIVE' },
  { id: 'BUS-06', plate: 'UBF 890S', operator: 'Northline Bus', model: 'Scania Irizar', type: 'Executive', capacity: 18, status: 'MAINTENANCE' }
];

const ROUTE_DISTANCES = {
  'Kampala→Mbarara': 266,
  'Kampala→Gulu': 333,
  'Kampala→Jinja': 81,
  'Kampala→Fort Portal': 297,
  'Mbarara→Kabale': 141,
  'Gulu→Lira': 106
};

const SECTION_TITLES = {
  dashboard: 'Dashboard',
  bookings: 'Manage bookings',
  passengers: 'Manage passengers',
  trips: 'Trips & schedules',
  buses: 'Bus fleet',
  routes: 'Routes',
  payments: 'Payments',
  reports: 'Reports'
};

const BUS_TYPES = ['Standard', 'Executive', 'VIP'];
const PAYMENT_METHODS = ['MTN_MOMO', 'AIRTEL_MONEY', 'VISA_CARD', 'CASH_AT_STATION'];

const adminUi = {
  filters: { bookingSearch: '', bookingStatus: 'ALL', passengerSearch: '', tripStatus: 'ALL', paymentStatus: 'ALL' },
  onSubmit: null
};

// ---------- helpers ----------

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function routeKey(origin, destination) {
  return `${origin}→${destination}`;
}

function nextId(prefix, list, pad = 0) {
  const max = list.reduce((highest, item) => {
    const n = Number(String(item.id).replace(/\D/g, ''));
    return Number.isFinite(n) && n > highest ? n : highest;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(pad, '0')}`;
}

function bookingStatus(booking) {
  return booking.status || 'CONFIRMED';
}

function paymentStatus(booking) {
  return booking.paymentStatus || 'PAID';
}

function statusBadge(status) {
  const map = {
    CONFIRMED: ['success', 'Confirmed'],
    CANCELLED: ['danger', 'Cancelled'],
    PAID: ['success', 'Paid'],
    PAY_AT_STATION: ['warning', 'Pending'],
    REFUNDED: ['muted', 'Refunded'],
    SCHEDULED: ['success', 'Scheduled'],
    ACTIVE: ['success', 'Active'],
    MAINTENANCE: ['warning', 'Maintenance'],
    RETIRED: ['muted', 'Retired'],
    INACTIVE: ['muted', 'Inactive'],
    BLOCKED: ['danger', 'Blocked']
  };
  const [tone, label] = map[status] || ['muted', status];
  return `<span class="badge ${tone}">${escapeHtml(label)}</span>`;
}

function toDateTimeInput(value) {
  return value ? String(value).slice(0, 16) : '';
}

function isPaid(booking) {
  return paymentStatus(booking) === 'PAID';
}

// Fills collections the admin needs that older saved state may not have yet
function getAdminState() {
  const state = getState();
  let changed = false;

  if (!Array.isArray(state.users)) { state.users = []; changed = true; }
  if (!Array.isArray(state.bookings)) { state.bookings = []; changed = true; }

  if (!Array.isArray(state.buses)) {
    state.buses = DEFAULT_BUSES.map((bus) => ({ ...bus }));
    changed = true;
  }

  if (!Array.isArray(state.routes)) {
    const seen = new Set();
    state.routes = [];
    state.trips.forEach((trip) => {
      const key = routeKey(trip.origin, trip.destination);
      if (seen.has(key)) return;
      seen.add(key);
      state.routes.push({
        id: nextId('RT', state.routes, 2),
        origin: trip.origin,
        destination: trip.destination,
        distanceKm: ROUTE_DISTANCES[key] || 0,
        status: 'ACTIVE'
      });
    });
    changed = true;
  }

  state.trips.forEach((trip) => {
    if (!trip.status) { trip.status = 'SCHEDULED'; changed = true; }
    if (!trip.busId) {
      const bus = state.buses.find((b) => b.operator === trip.operator);
      if (bus) { trip.busId = bus.id; changed = true; }
    }
  });

  if (changed) saveState(state);
  return state;
}

function commit(state, message) {
  saveState(state);
  renderAdmin();
  if (message) showToast(message);
}

function showToast(message) {
  const toast = document.getElementById('adminToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}" class="empty-row">${escapeHtml(text)}</td></tr>`;
}

// ---------- modal ----------

function openModal({ title, body, submitLabel = 'Save', onSubmit, hideSubmit = false }) {
  const modal = document.getElementById('adminModal');
  document.getElementById('adminModalTitle').textContent = title;
  document.getElementById('adminModalBody').innerHTML = body;
  const submit = document.getElementById('adminModalSubmit');
  submit.textContent = submitLabel;
  submit.classList.toggle('hidden', hideSubmit);
  setModalError('');
  adminUi.onSubmit = onSubmit || null;
  modal.showModal();
  const firstInput = modal.querySelector('.modal-body input, .modal-body select');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  document.getElementById('adminModal').close();
  adminUi.onSubmit = null;
}

function setModalError(message) {
  const error = document.getElementById('adminModalError');
  error.textContent = message;
  error.classList.toggle('hidden', !message);
}

function initModal() {
  const modal = document.getElementById('adminModal');
  const form = document.getElementById('adminModalForm');

  modal.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', closeModal));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!adminUi.onSubmit) return closeModal();
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach((key) => { values[key] = String(values[key]).trim(); });
    const error = adminUi.onSubmit(values);
    if (error) {
      setModalError(error);
      return;
    }
    closeModal();
  });
}

function field(label, name, input) {
  return `<label class="modal-field"><span>${escapeHtml(label)}</span>${input}</label>`;
}

function textInput(name, value = '', attrs = '') {
  return `<input name="${name}" value="${escapeHtml(value)}" ${attrs} />`;
}

function selectInput(name, options, selected) {
  return `<select name="${name}">${options.map(([value, label]) =>
    `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('')}</select>`;
}

function confirmAction(title, message, confirmLabel, onConfirm) {
  openModal({
    title,
    body: `<p class="modal-text">${escapeHtml(message)}</p>`,
    submitLabel: confirmLabel,
    onSubmit: () => { onConfirm(); }
  });
}

// ---------- dashboard ----------

function renderDashboard(state) {
  const confirmed = state.bookings.filter((b) => bookingStatus(b) === 'CONFIRMED');
  const revenue = state.bookings.filter(isPaid).reduce((sum, b) => sum + Number(b.total || 0), 0);
  const pending = state.bookings.filter((b) => paymentStatus(b) === 'PAY_AT_STATION' && bookingStatus(b) === 'CONFIRMED');
  const scheduled = state.trips.filter((t) => t.status === 'SCHEDULED');
  const activeBuses = state.buses.filter((b) => b.status === 'ACTIVE');
  const upcoming = scheduled
    .filter((t) => new Date(t.departureTime) >= new Date())
    .sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime))
    .slice(0, 5);

  const stats = [
    ['Revenue collected', currency(revenue)],
    ['Active bookings', confirmed.length],
    ['Registered passengers', state.users.length],
    ['Scheduled trips', scheduled.length],
    ['Buses in service', `${activeBuses.length} / ${state.buses.length}`],
    ['Pending payments', pending.length]
  ];

  return `
    <div class="admin-grid stats-grid">
      ${stats.map(([label, value]) => `
        <div class="admin-card stat-box">
          <span class="stat-label">${label}</span>
          <strong>${value}</strong>
        </div>`).join('')}
    </div>

    <div class="quick-actions">
      <button class="primary-btn" data-action="add-trip">+ Add trip</button>
      <button class="secondary-btn" data-action="add-bus">+ Add bus</button>
      <button class="secondary-btn" data-action="add-route">+ Add route</button>
    </div>

    <div class="dashboard-columns">
      <div class="table-card">
        <div class="card-head"><h3>Recent bookings</h3><a href="#bookings">View all</a></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Ref</th><th>Passenger</th><th>Route</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              ${state.bookings.slice(0, 5).map((b) => `
                <tr>
                  <td><strong>${escapeHtml(b.id)}</strong></td>
                  <td>${escapeHtml(b.customer)}</td>
                  <td>${escapeHtml(b.route)}</td>
                  <td>${currency(b.total)}</td>
                  <td>${statusBadge(bookingStatus(b))}</td>
                </tr>`).join('') || emptyRow(5, 'No bookings yet.')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-card">
        <div class="card-head"><h3>Upcoming departures</h3><a href="#trips">View all</a></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Route</th><th>Departure</th><th>Seats left</th></tr></thead>
            <tbody>
              ${upcoming.map((t) => `
                <tr>
                  <td>${escapeHtml(routeKey(t.origin, t.destination))}</td>
                  <td>${dateLabel(t.departureTime)}</td>
                  <td>${t.seatsAvailable}</td>
                </tr>`).join('') || emptyRow(3, 'No upcoming trips.')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------- bookings ----------

function renderBookings(state) {
  const { bookingSearch, bookingStatus: statusFilter } = adminUi.filters;
  const term = bookingSearch.toLowerCase();
  const rows = state.bookings.filter((b) => {
    const matchesStatus = statusFilter === 'ALL' || bookingStatus(b) === statusFilter;
    const haystack = `${b.id} ${b.customer} ${b.email} ${b.phone} ${b.route}`.toLowerCase();
    return matchesStatus && (!term || haystack.includes(term));
  });

  return `
    <div class="toolbar">
      <input type="search" placeholder="Search by ref, passenger, phone or route" data-filter="bookingSearch" value="${escapeHtml(bookingSearch)}" />
      ${selectInput('bookingStatusFilter', [['ALL', 'All statuses'], ['CONFIRMED', 'Confirmed'], ['CANCELLED', 'Cancelled']], statusFilter).replace('<select', '<select data-filter="bookingStatus"')}
    </div>
    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ref</th><th>Passenger</th><th>Route</th><th>Departure</th><th>Seats</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${rows.map((b) => `
              <tr>
                <td><strong>${escapeHtml(b.id)}</strong></td>
                <td>${escapeHtml(b.customer)}<small class="cell-sub">${escapeHtml(b.phone)}</small></td>
                <td>${escapeHtml(b.route)}</td>
                <td>${dateLabel(b.departure)}</td>
                <td>${escapeHtml((b.seats || []).join(', '))}</td>
                <td>${currency(b.total)}</td>
                <td>${statusBadge(paymentStatus(b))}</td>
                <td>${statusBadge(bookingStatus(b))}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="view-booking" data-id="${escapeHtml(b.id)}">View</button>
                  ${bookingStatus(b) === 'CONFIRMED'
                    ? `<button class="mini-btn danger" data-action="cancel-booking" data-id="${escapeHtml(b.id)}">Cancel</button>`
                    : `<button class="mini-btn danger" data-action="delete-booking" data-id="${escapeHtml(b.id)}">Delete</button>`}
                </td>
              </tr>`).join('') || emptyRow(9, 'No bookings match your filters.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function viewBooking(state, id) {
  const b = state.bookings.find((item) => item.id === id);
  if (!b) return;
  const rows = [
    ['Reference', b.id],
    ['Passenger', b.customer],
    ['Phone', b.phone],
    ['Email', b.email],
    ['Route', b.route],
    ['Departure', dateLabel(b.departure)],
    ['Seats', (b.seats || []).join(', ')],
    ['Payment method', paymentLabel(b.payment)],
    ['Total', currency(b.total)],
    ['Booked on', dateLabel(b.createdAt)]
  ];
  openModal({
    title: `Booking ${b.id}`,
    body: `
      <dl class="detail-list">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')}
        <dt>Payment status</dt><dd>${statusBadge(paymentStatus(b))}</dd>
        <dt>Booking status</dt><dd>${statusBadge(bookingStatus(b))}</dd>
      </dl>`,
    hideSubmit: true
  });
}

function cancelBooking(state, id) {
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking) return;
  confirmAction('Cancel booking', `Cancel booking ${id} for ${booking.customer}? The seats will be released.`, 'Cancel booking', () => {
    booking.status = 'CANCELLED';
    const trip = state.trips.find((t) => t.id === booking.tripId);
    if (trip && booking.seatsReserved) {
      trip.seatsAvailable += (booking.seats || []).length;
      booking.seatsReserved = false;
    }
    commit(state, isPaid(booking) ? `Booking ${id} cancelled. Refund it from Payments.` : `Booking ${id} cancelled.`);
  });
}

function deleteBooking(state, id) {
  confirmAction('Delete booking', `Permanently delete booking ${id}? This cannot be undone.`, 'Delete', () => {
    state.bookings = state.bookings.filter((b) => b.id !== id);
    commit(state, `Booking ${id} deleted.`);
  });
}

// ---------- passengers ----------

function collectPassengers(state) {
  const byEmail = new Map();
  state.users.forEach((u) => {
    byEmail.set(u.email.toLowerCase(), { name: u.name, email: u.email, phone: u.phone || '', registered: true, blocked: !!u.blocked, bookings: 0, spent: 0 });
  });
  state.bookings.forEach((b) => {
    const key = String(b.email || '').toLowerCase();
    if (!key) return;
    if (!byEmail.has(key)) {
      byEmail.set(key, { name: b.customer, email: b.email, phone: b.phone, registered: false, blocked: false, bookings: 0, spent: 0 });
    }
    const p = byEmail.get(key);
    if (!p.phone) p.phone = b.phone;
    p.bookings += 1;
    if (isPaid(b)) p.spent += Number(b.total || 0);
  });
  return [...byEmail.values()];
}

function renderPassengers(state) {
  const term = adminUi.filters.passengerSearch.toLowerCase();
  const passengers = collectPassengers(state).filter((p) =>
    !term || `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(term)
  );

  return `
    <div class="toolbar">
      <input type="search" placeholder="Search by name, email or phone" data-filter="passengerSearch" value="${escapeHtml(adminUi.filters.passengerSearch)}" />
      <button class="primary-btn" data-action="add-passenger">+ Add passenger</button>
    </div>
    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Account</th><th>Bookings</th><th>Total spent</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${passengers.map((p) => `
              <tr>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${escapeHtml(p.email)}</td>
                <td>${escapeHtml(p.phone || '—')}</td>
                <td>${p.registered ? 'Registered' : 'Guest'}</td>
                <td>${p.bookings}</td>
                <td>${currency(p.spent)}</td>
                <td>${statusBadge(p.blocked ? 'BLOCKED' : 'ACTIVE')}</td>
                <td class="row-actions">
                  ${p.registered ? `
                    <button class="mini-btn" data-action="edit-passenger" data-id="${escapeHtml(p.email)}">Edit</button>
                    <button class="mini-btn ${p.blocked ? '' : 'danger'}" data-action="toggle-passenger" data-id="${escapeHtml(p.email)}">${p.blocked ? 'Unblock' : 'Block'}</button>
                    <button class="mini-btn danger" data-action="delete-passenger" data-id="${escapeHtml(p.email)}">Delete</button>` : ''}
                </td>
              </tr>`).join('') || emptyRow(8, 'No passengers found.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function passengerForm(state, email) {
  const user = email ? state.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) : null;
  openModal({
    title: user ? 'Edit passenger' : 'Add passenger',
    body: `
      ${field('Full name', 'name', textInput('name', user?.name, 'required'))}
      ${field('Email', 'email', textInput('email', user?.email, 'type="email" required'))}
      ${field('Phone', 'phone', textInput('phone', user?.phone, 'placeholder="e.g. 0772 123456"'))}
      ${field(user ? 'New password (leave blank to keep)' : 'Password', 'password', textInput('password', '', 'type="password"'))}
    `,
    onSubmit: (v) => {
      if (!v.name || !NAME_PATTERN.test(v.name)) return 'Enter a valid name (letters only).';
      if (!EMAIL_PATTERN.test(v.email)) return 'Enter a valid email address.';
      if (v.phone && !/^\+?[\d\s-]{9,15}$/.test(v.phone)) return 'Enter a valid phone number.';
      const lower = v.email.toLowerCase();
      const clash = lower === ADMIN_CREDENTIALS.email ||
        state.users.some((u) => u.email.toLowerCase() === lower && u !== user);
      if (clash) return 'Another account already uses this email.';
      if ((!user || v.password) && v.password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      }

      if (user) {
        Object.assign(user, { name: v.name, email: v.email, phone: v.phone });
        if (v.password) user.password = v.password;
      } else {
        state.users.push({ name: v.name, email: v.email, phone: v.phone, password: v.password, blocked: false });
      }
      commit(state, user ? 'Passenger updated.' : 'Passenger added.');
    }
  });
}

function togglePassenger(state, email) {
  const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;
  user.blocked = !user.blocked;
  commit(state, user.blocked ? `${user.name} has been blocked from logging in.` : `${user.name} has been unblocked.`);
}

function deletePassenger(state, email) {
  confirmAction('Delete passenger', `Delete the account for ${email}? Their past bookings are kept.`, 'Delete', () => {
    state.users = state.users.filter((u) => u.email.toLowerCase() !== email.toLowerCase());
    commit(state, 'Passenger account deleted.');
  });
}

// ---------- trips ----------

function renderTrips(state) {
  const filter = adminUi.filters.tripStatus;
  const trips = state.trips
    .filter((t) => filter === 'ALL' || t.status === filter)
    .sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));

  return `
    <div class="toolbar">
      ${selectInput('tripStatusFilter', [['ALL', 'All trips'], ['SCHEDULED', 'Scheduled'], ['CANCELLED', 'Cancelled']], filter).replace('<select', '<select data-filter="tripStatus"')}
      <button class="primary-btn" data-action="add-trip">+ Add trip</button>
    </div>
    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Trip</th><th>Route</th><th>Bus</th><th>Departure</th><th>Arrival</th><th>Fare</th><th>Seats left</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${trips.map((t) => {
              const bus = state.buses.find((b) => b.id === t.busId);
              return `
              <tr>
                <td><strong>${escapeHtml(t.id)}</strong></td>
                <td>${escapeHtml(routeKey(t.origin, t.destination))}</td>
                <td>${bus ? escapeHtml(bus.plate) : '—'}<small class="cell-sub">${escapeHtml(t.operator)}</small></td>
                <td>${dateLabel(t.departureTime)}</td>
                <td>${dateLabel(t.arrivalTime)}</td>
                <td>${currency(t.price)}</td>
                <td>${t.seatsAvailable}</td>
                <td>${statusBadge(t.status)}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="edit-trip" data-id="${escapeHtml(t.id)}">Edit</button>
                  <button class="mini-btn danger" data-action="delete-trip" data-id="${escapeHtml(t.id)}">Delete</button>
                </td>
              </tr>`;
            }).join('') || emptyRow(9, 'No trips yet. Add one to start selling tickets.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tripForm(state, id) {
  const trip = id ? state.trips.find((t) => t.id === id) : null;
  const routes = state.routes.filter((r) => r.status === 'ACTIVE' || (trip && r.origin === trip.origin && r.destination === trip.destination));
  const buses = state.buses.filter((b) => b.status === 'ACTIVE' || (trip && b.id === trip.busId));

  if (!routes.length || !buses.length) {
    openModal({
      title: 'Add trip',
      body: `<p class="modal-text">You need at least one active route and one active bus before adding a trip.</p>`,
      hideSubmit: true
    });
    return;
  }

  const currentRoute = trip ? routes.find((r) => r.origin === trip.origin && r.destination === trip.destination) : routes[0];

  openModal({
    title: trip ? `Edit trip ${trip.id}` : 'Add trip',
    body: `
      ${field('Route', 'routeId', selectInput('routeId', routes.map((r) => [r.id, routeKey(r.origin, r.destination)]), currentRoute?.id))}
      ${field('Bus', 'busId', selectInput('busId', buses.map((b) => [b.id, `${b.plate} · ${b.operator} (${b.capacity} seats)`]), trip?.busId || buses[0].id))}
      <div class="modal-row">
        ${field('Departure', 'departureTime', textInput('departureTime', toDateTimeInput(trip?.departureTime), 'type="datetime-local" required'))}
        ${field('Arrival', 'arrivalTime', textInput('arrivalTime', toDateTimeInput(trip?.arrivalTime), 'type="datetime-local" required'))}
      </div>
      <div class="modal-row">
        ${field('Fare (UGX)', 'price', textInput('price', trip?.price, 'type="number" min="1000" step="500" required'))}
        ${field('Seats available (blank = bus capacity)', 'seatsAvailable', textInput('seatsAvailable', trip?.seatsAvailable, 'type="number" min="0"'))}
      </div>
      ${field('Status', 'status', selectInput('status', [['SCHEDULED', 'Scheduled'], ['CANCELLED', 'Cancelled']], trip?.status || 'SCHEDULED'))}
    `,
    onSubmit: (v) => {
      const route = state.routes.find((r) => r.id === v.routeId);
      const bus = state.buses.find((b) => b.id === v.busId);
      if (!route || !bus) return 'Choose a route and a bus.';
      if (!v.departureTime || !v.arrivalTime) return 'Enter departure and arrival times.';
      if (new Date(v.arrivalTime) <= new Date(v.departureTime)) return 'Arrival must be after departure.';
      const price = Number(v.price);
      if (!price || price < 1000) return 'Fare must be at least UGX 1,000.';
      const seats = v.seatsAvailable === '' ? bus.capacity : Number(v.seatsAvailable);
      if (!Number.isInteger(seats) || seats < 0) return 'Seats available must be a whole number.';
      if (seats > bus.capacity) return `This bus only has ${bus.capacity} seats.`;

      const data = {
        origin: route.origin,
        destination: route.destination,
        busId: bus.id,
        operator: bus.operator,
        departureTime: `${v.departureTime}:00`,
        arrivalTime: `${v.arrivalTime}:00`,
        price,
        seatsAvailable: seats,
        status: v.status
      };

      if (trip) {
        Object.assign(trip, data);
      } else {
        state.trips.push({ id: nextId('TRIP', state.trips), ...data });
      }
      commit(state, trip ? `Trip ${trip.id} updated.` : 'Trip added. It is now visible to passengers.');
    }
  });
}

function deleteTrip(state, id) {
  const active = state.bookings.some((b) => b.tripId === id && bookingStatus(b) === 'CONFIRMED');
  if (active) {
    openModal({
      title: 'Cannot delete trip',
      body: `<p class="modal-text">Trip ${escapeHtml(id)} has confirmed bookings. Edit the trip and set its status to Cancelled instead, then cancel the bookings.</p>`,
      hideSubmit: true
    });
    return;
  }
  confirmAction('Delete trip', `Delete trip ${id}? Passengers will no longer see it.`, 'Delete', () => {
    state.trips = state.trips.filter((t) => t.id !== id);
    commit(state, `Trip ${id} deleted.`);
  });
}

// ---------- buses ----------

function renderBuses(state) {
  return `
    <div class="toolbar">
      <p class="toolbar-note">${state.buses.length} buses in the fleet</p>
      <button class="primary-btn" data-action="add-bus">+ Add bus</button>
    </div>
    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Plate</th><th>Operator</th><th>Model</th><th>Class</th><th>Seats</th><th>Trips</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${state.buses.map((b) => `
              <tr>
                <td><strong>${escapeHtml(b.plate)}</strong></td>
                <td>${escapeHtml(b.operator)}</td>
                <td>${escapeHtml(b.model)}</td>
                <td>${escapeHtml(b.type)}</td>
                <td>${b.capacity}</td>
                <td>${state.trips.filter((t) => t.busId === b.id).length}</td>
                <td>${statusBadge(b.status)}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="edit-bus" data-id="${escapeHtml(b.id)}">Edit</button>
                  <button class="mini-btn danger" data-action="delete-bus" data-id="${escapeHtml(b.id)}">Delete</button>
                </td>
              </tr>`).join('') || emptyRow(8, 'No buses yet.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function busForm(state, id) {
  const bus = id ? state.buses.find((b) => b.id === id) : null;
  openModal({
    title: bus ? `Edit bus ${bus.plate}` : 'Add bus',
    body: `
      <div class="modal-row">
        ${field('Number plate', 'plate', textInput('plate', bus?.plate, 'placeholder="e.g. UBA 123K" required'))}
        ${field('Operator', 'operator', textInput('operator', bus?.operator, 'placeholder="e.g. Great Link" required'))}
      </div>
      ${field('Make / model', 'model', textInput('model', bus?.model, 'placeholder="e.g. Scania Marcopolo"'))}
      <div class="modal-row">
        ${field('Class', 'type', selectInput('type', BUS_TYPES.map((t) => [t, t]), bus?.type || 'Standard'))}
        ${field('Seat capacity', 'capacity', textInput('capacity', bus?.capacity, 'type="number" min="4" max="90" required'))}
      </div>
      ${field('Status', 'status', selectInput('status', [['ACTIVE', 'Active'], ['MAINTENANCE', 'Under maintenance'], ['RETIRED', 'Retired']], bus?.status || 'ACTIVE'))}
    `,
    onSubmit: (v) => {
      const plate = v.plate.toUpperCase().replace(/\s+/g, ' ');
      if (!/^[A-Z]{2,3}\s?\d{3}[A-Z]?$/.test(plate)) return 'Enter a valid Ugandan number plate, e.g. UBA 123K.';
      if (!v.operator) return 'Enter the operator name.';
      if (state.buses.some((b) => b.plate === plate && b !== bus)) return 'A bus with this plate already exists.';
      const capacity = Number(v.capacity);
      if (!Number.isInteger(capacity) || capacity < 4 || capacity > 90) return 'Capacity must be between 4 and 90 seats.';

      const data = { plate, operator: v.operator, model: v.model, type: v.type, capacity, status: v.status };
      if (bus) {
        Object.assign(bus, data);
        state.trips.filter((t) => t.busId === bus.id).forEach((t) => { t.operator = bus.operator; });
      } else {
        state.buses.push({ id: nextId('BUS', state.buses, 2), ...data });
      }
      commit(state, bus ? 'Bus updated.' : 'Bus added to the fleet.');
    }
  });
}

function deleteBus(state, id) {
  const bus = state.buses.find((b) => b.id === id);
  if (!bus) return;
  if (state.trips.some((t) => t.busId === id)) {
    openModal({
      title: 'Cannot delete bus',
      body: `<p class="modal-text">${escapeHtml(bus.plate)} is assigned to trips. Reassign or delete those trips first, or mark the bus as Retired.</p>`,
      hideSubmit: true
    });
    return;
  }
  confirmAction('Delete bus', `Remove ${bus.plate} from the fleet?`, 'Delete', () => {
    state.buses = state.buses.filter((b) => b.id !== id);
    commit(state, 'Bus removed.');
  });
}

// ---------- routes ----------

function renderRoutes(state) {
  return `
    <div class="toolbar">
      <p class="toolbar-note">${state.routes.length} routes</p>
      <button class="primary-btn" data-action="add-route">+ Add route</button>
    </div>
    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Route</th><th>Distance</th><th>Trips</th><th>Lowest fare</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${state.routes.map((r) => {
              const trips = state.trips.filter((t) => t.origin === r.origin && t.destination === r.destination);
              const lowest = trips.length ? Math.min(...trips.map((t) => t.price)) : null;
              return `
              <tr>
                <td><strong>${escapeHtml(routeKey(r.origin, r.destination))}</strong></td>
                <td>${r.distanceKm ? `${r.distanceKm} km` : '—'}</td>
                <td>${trips.length}</td>
                <td>${lowest ? currency(lowest) : '—'}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="edit-route" data-id="${escapeHtml(r.id)}">Edit</button>
                  <button class="mini-btn danger" data-action="delete-route" data-id="${escapeHtml(r.id)}">Delete</button>
                </td>
              </tr>`;
            }).join('') || emptyRow(6, 'No routes yet.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function routeForm(state, id) {
  const route = id ? state.routes.find((r) => r.id === id) : null;
  const inUse = route && state.trips.some((t) => t.origin === route.origin && t.destination === route.destination);
  const lock = inUse ? 'readonly title="Route has trips, so its towns cannot change"' : '';
  openModal({
    title: route ? 'Edit route' : 'Add route',
    body: `
      <div class="modal-row">
        ${field('From', 'origin', textInput('origin', route?.origin, `placeholder="e.g. Kampala" required ${lock}`))}
        ${field('To', 'destination', textInput('destination', route?.destination, `placeholder="e.g. Arua" required ${lock}`))}
      </div>
      ${field('Distance (km)', 'distanceKm', textInput('distanceKm', route?.distanceKm || '', 'type="number" min="1"'))}
      ${field('Status', 'status', selectInput('status', [['ACTIVE', 'Active'], ['INACTIVE', 'Inactive']], route?.status || 'ACTIVE'))}
    `,
    onSubmit: (v) => {
      const town = /^[A-Za-z][A-Za-z\s'-]*$/;
      if (!town.test(v.origin) || !town.test(v.destination)) return 'Town names should contain letters only.';
      if (v.origin.toLowerCase() === v.destination.toLowerCase()) return 'Origin and destination must be different.';
      const duplicate = state.routes.some((r) => r !== route &&
        r.origin.toLowerCase() === v.origin.toLowerCase() && r.destination.toLowerCase() === v.destination.toLowerCase());
      if (duplicate) return 'This route already exists.';

      const data = { origin: v.origin, destination: v.destination, distanceKm: Number(v.distanceKm) || 0, status: v.status };
      if (route) {
        Object.assign(route, data);
      } else {
        state.routes.push({ id: nextId('RT', state.routes, 2), ...data });
      }
      commit(state, route ? 'Route updated.' : 'Route added.');
    }
  });
}

function deleteRoute(state, id) {
  const route = state.routes.find((r) => r.id === id);
  if (!route) return;
  if (state.trips.some((t) => t.origin === route.origin && t.destination === route.destination)) {
    openModal({
      title: 'Cannot delete route',
      body: `<p class="modal-text">${escapeHtml(routeKey(route.origin, route.destination))} has trips. Delete them first, or set the route to Inactive.</p>`,
      hideSubmit: true
    });
    return;
  }
  confirmAction('Delete route', `Delete the route ${routeKey(route.origin, route.destination)}?`, 'Delete', () => {
    state.routes = state.routes.filter((r) => r.id !== id);
    commit(state, 'Route deleted.');
  });
}

// ---------- payments ----------

function renderPayments(state) {
  const filter = adminUi.filters.paymentStatus;
  const sum = (list) => list.reduce((total, b) => total + Number(b.total || 0), 0);
  const paid = state.bookings.filter(isPaid);
  const pending = state.bookings.filter((b) => paymentStatus(b) === 'PAY_AT_STATION' && bookingStatus(b) === 'CONFIRMED');
  const refunded = state.bookings.filter((b) => paymentStatus(b) === 'REFUNDED');
  const toRefund = paid.filter((b) => bookingStatus(b) === 'CANCELLED');
  const rows = state.bookings.filter((b) => filter === 'ALL' || paymentStatus(b) === filter);

  return `
    <div class="admin-grid stats-grid">
      <div class="admin-card stat-box"><span class="stat-label">Collected</span><strong>${currency(sum(paid))}</strong><small>${paid.length} payments</small></div>
      <div class="admin-card stat-box"><span class="stat-label">Awaiting cash at station</span><strong>${currency(sum(pending))}</strong><small>${pending.length} bookings</small></div>
      <div class="admin-card stat-box"><span class="stat-label">Refunded</span><strong>${currency(sum(refunded))}</strong><small>${refunded.length} refunds</small></div>
      <div class="admin-card stat-box"><span class="stat-label">Refunds due</span><strong>${currency(sum(toRefund))}</strong><small>Paid but cancelled</small></div>
    </div>

    <div class="toolbar">
      ${selectInput('paymentStatusFilter', [['ALL', 'All payments'], ['PAID', 'Paid'], ['PAY_AT_STATION', 'Pending'], ['REFUNDED', 'Refunded']], filter).replace('<select', '<select data-filter="paymentStatus"')}
    </div>

    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Booking</th><th>Passenger</th><th>Method</th><th>Amount</th><th>Date</th><th>Booking</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            ${rows.map((b) => {
              const pStatus = paymentStatus(b);
              const bStatus = bookingStatus(b);
              let action = '';
              if (pStatus === 'PAY_AT_STATION' && bStatus === 'CONFIRMED') {
                action = `<button class="mini-btn" data-action="mark-paid" data-id="${escapeHtml(b.id)}">Mark paid</button>`;
              } else if (pStatus === 'PAID') {
                action = `<button class="mini-btn danger" data-action="refund" data-id="${escapeHtml(b.id)}">Refund</button>`;
              }
              return `
              <tr>
                <td><strong>${escapeHtml(b.id)}</strong></td>
                <td>${escapeHtml(b.customer)}</td>
                <td>${escapeHtml(paymentLabel(b.payment))}</td>
                <td>${currency(b.total)}</td>
                <td>${dateLabel(b.paidAt || b.createdAt)}</td>
                <td>${statusBadge(bStatus)}</td>
                <td>${statusBadge(pStatus)}</td>
                <td class="row-actions">${action}</td>
              </tr>`;
            }).join('') || emptyRow(8, 'No payments match this filter.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function markPaid(state, id) {
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking) return;
  confirmAction('Confirm cash payment', `Confirm that ${booking.customer} paid ${currency(booking.total)} at the station?`, 'Mark as paid', () => {
    booking.paymentStatus = 'PAID';
    booking.paidAt = new Date().toISOString();
    commit(state, `Payment for ${id} recorded.`);
  });
}

function refundPayment(state, id) {
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking) return;
  const note = bookingStatus(booking) === 'CONFIRMED' ? ' The booking will also be cancelled and its seats released.' : '';
  confirmAction('Refund payment', `Refund ${currency(booking.total)} to ${booking.customer} via ${paymentLabel(booking.payment)}?${note}`, 'Refund', () => {
    booking.paymentStatus = 'REFUNDED';
    booking.refundedAt = new Date().toISOString();
    if (bookingStatus(booking) === 'CONFIRMED') {
      booking.status = 'CANCELLED';
      const trip = state.trips.find((t) => t.id === booking.tripId);
      if (trip && booking.seatsReserved) {
        trip.seatsAvailable += (booking.seats || []).length;
        booking.seatsReserved = false;
      }
    }
    commit(state, `Refund for ${id} recorded.`);
  });
}

// ---------- reports ----------

function barList(entries, format) {
  const max = Math.max(1, ...entries.map(([, value]) => value));
  if (!entries.length) return '<p class="toolbar-note">No data yet.</p>';
  return `<div class="bar-list">${entries.map(([label, value]) => `
    <div class="bar-row">
      <span class="bar-label">${escapeHtml(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(value / max) * 100}%"></span></span>
      <span class="bar-value">${format(value)}</span>
    </div>`).join('')}</div>`;
}

function renderReports(state) {
  const paid = state.bookings.filter(isPaid);

  const byRoute = {};
  paid.forEach((b) => { byRoute[b.route] = (byRoute[b.route] || 0) + Number(b.total || 0); });

  const byMethod = {};
  PAYMENT_METHODS.forEach((m) => { byMethod[paymentLabel(m)] = 0; });
  state.bookings.forEach((b) => { byMethod[paymentLabel(b.payment)] = (byMethod[paymentLabel(b.payment)] || 0) + 1; });

  const byOperator = {};
  state.bookings.filter((b) => bookingStatus(b) === 'CONFIRMED').forEach((b) => {
    const trip = state.trips.find((t) => t.id === b.tripId);
    const operator = trip ? trip.operator : 'Unknown';
    byOperator[operator] = (byOperator[operator] || 0) + (b.seats || []).length;
  });

  const cancelled = state.bookings.filter((b) => bookingStatus(b) === 'CANCELLED').length;
  const cancelRate = state.bookings.length ? Math.round((cancelled / state.bookings.length) * 100) : 0;
  const seatsSold = state.bookings.filter((b) => bookingStatus(b) === 'CONFIRMED').reduce((n, b) => n + (b.seats || []).length, 0);
  const avgTicket = paid.length ? paid.reduce((n, b) => n + Number(b.total || 0), 0) / paid.length : 0;

  const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

  return `
    <div class="admin-grid stats-grid">
      <div class="admin-card stat-box"><span class="stat-label">Seats sold</span><strong>${seatsSold}</strong></div>
      <div class="admin-card stat-box"><span class="stat-label">Average booking value</span><strong>${currency(avgTicket)}</strong></div>
      <div class="admin-card stat-box"><span class="stat-label">Cancellation rate</span><strong>${cancelRate}%</strong></div>
    </div>
    <div class="dashboard-columns">
      <div class="table-card"><h3>Revenue by route</h3>${barList(sortDesc(byRoute), currency)}</div>
      <div class="table-card"><h3>Bookings by payment method</h3>${barList(sortDesc(byMethod), (n) => n)}</div>
      <div class="table-card"><h3>Seats sold by operator</h3>${barList(sortDesc(byOperator), (n) => n)}</div>
    </div>
  `;
}

// ---------- routing & events ----------

const SECTION_RENDERERS = {
  dashboard: renderDashboard,
  bookings: renderBookings,
  passengers: renderPassengers,
  trips: renderTrips,
  buses: renderBuses,
  routes: renderRoutes,
  payments: renderPayments,
  reports: renderReports
};

const ACTIONS = {
  'add-trip': (s) => tripForm(s),
  'edit-trip': (s, id) => tripForm(s, id),
  'delete-trip': deleteTrip,
  'add-bus': (s) => busForm(s),
  'edit-bus': (s, id) => busForm(s, id),
  'delete-bus': deleteBus,
  'add-route': (s) => routeForm(s),
  'edit-route': (s, id) => routeForm(s, id),
  'delete-route': deleteRoute,
  'view-booking': viewBooking,
  'cancel-booking': cancelBooking,
  'delete-booking': deleteBooking,
  'add-passenger': (s) => passengerForm(s),
  'edit-passenger': (s, id) => passengerForm(s, id),
  'toggle-passenger': togglePassenger,
  'delete-passenger': deletePassenger,
  'mark-paid': markPaid,
  refund: refundPayment
};

function currentSection() {
  const hash = window.location.hash.replace('#', '');
  return SECTION_RENDERERS[hash] ? hash : 'dashboard';
}

function renderAdmin() {
  const state = getAdminState();
  const section = currentSection();

  document.getElementById('adminSectionTitle').textContent = SECTION_TITLES[section];
  document.title = `${SECTION_TITLES[section]} | Uganda Bus Admin`;

  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === section;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  document.querySelectorAll('[data-section]').forEach((el) => {
    const active = el.dataset.section === section;
    el.hidden = !active;
    if (active) el.innerHTML = SECTION_RENDERERS[section](state);
  });

  const pending = state.bookings.filter((b) => paymentStatus(b) === 'PAY_AT_STATION' && bookingStatus(b) === 'CONFIRMED').length;
  const badge = document.getElementById('pendingPaymentsCount');
  badge.textContent = pending;
  badge.classList.toggle('hidden', !pending);
}

function initAdminDashboard() {
  const user = getCurrentUser();
  if (user) {
    document.getElementById('adminName').textContent = user.name;
    document.getElementById('adminEmail').textContent = user.email;
  }

  initModal();

  const content = document.querySelector('.admin-content');

  content.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const handler = ACTIONS[button.dataset.action];
    if (handler) handler(getAdminState(), button.dataset.id);
  });

  content.addEventListener('input', (event) => {
    const key = event.target.dataset.filter;
    if (!key) return;
    adminUi.filters[key] = event.target.value;
    const cursor = event.target.selectionStart;
    renderAdmin();
    // Re-rendering replaces the search box; put focus and caret back
    const replaced = content.querySelector(`[data-filter="${key}"]`);
    if (replaced && replaced.type === 'search') {
      replaced.focus();
      replaced.setSelectionRange(cursor, cursor);
    }
  });

  window.addEventListener('hashchange', renderAdmin);
  renderAdmin();
}
