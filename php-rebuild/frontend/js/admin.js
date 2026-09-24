// Admin dashboard: sidebar menu + content sections.
// Data comes from backend/api/admin.php (GET = load everything, POST = one change).
// The server validates every change; its error messages are shown in the form.

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
  data: null, // last snapshot loaded from the server
  loadError: '',
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
  return `${origin} → ${destination}`;
}

// created_at / paid_at are stored in UTC by SQLite
function utcDate(value) {
  return value ? `${String(value).replace(' ', 'T')}Z` : '';
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
  return value ? String(value).replace(' ', 'T').slice(0, 16) : '';
}

function isPaid(booking) {
  return booking.paymentStatus === 'PAID';
}

function isPendingPayment(booking) {
  return booking.paymentStatus === 'PAY_AT_STATION' && booking.status === 'CONFIRMED';
}

function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}" class="empty-row">${escapeHtml(text)}</td></tr>`;
}

function showToast(message) {
  const toast = document.getElementById('adminToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ---------- server data ----------

function normalizeAdminData(raw) {
  return {
    routes: raw.routes.map((r) => ({
      id: Number(r.id),
      origin: r.origin,
      destination: r.destination,
      distanceKm: Number(r.distance_km),
      duration: r.duration,
      price: Number(r.price_ugx),
      status: r.status
    })),
    buses: raw.buses.map((b) => ({
      id: Number(b.id),
      plate: b.reg_number,
      operator: b.operator_name,
      model: b.model,
      type: b.bus_type,
      capacity: Number(b.total_seats),
      driver: b.driver_name,
      status: b.status
    })),
    trips: raw.trips.map((t) => ({
      id: Number(t.id),
      routeId: Number(t.route_id),
      busId: Number(t.vehicle_id),
      origin: t.origin,
      destination: t.destination,
      operator: t.operator_name,
      plate: t.reg_number,
      capacity: Number(t.total_seats),
      departureTime: t.departure_time,
      arrivalTime: t.arrival_time,
      price: Number(t.price_ugx),
      seatsAvailable: Number(t.available_seats),
      status: t.status
    })),
    bookings: raw.bookings.map((b) => ({
      id: b.booking_ref,
      tripId: Number(b.trip_id),
      route: routeKey(b.origin, b.destination),
      operator: b.operator_name,
      departure: b.departure_time,
      seats: String(b.seats).split(',').filter(Boolean),
      customer: b.user_name,
      phone: b.phone,
      email: b.email,
      payment: b.payment_method,
      paymentStatus: b.payment_status,
      status: b.status,
      total: Number(b.total_amount),
      createdAt: utcDate(b.created_at),
      paidAt: utcDate(b.paid_at),
      refundedAt: utcDate(b.refunded_at)
    })),
    users: raw.passengers.map((u) => ({
      id: Number(u.id),
      name: u.name,
      email: u.email,
      phone: u.phone,
      blocked: Number(u.blocked) === 1
    }))
  };
}

async function loadAdminData() {
  const result = await api('admin.php');
  if (!result.ok) {
    adminUi.loadError = result.data.message || 'Could not load the dashboard.';
    return;
  }
  adminUi.loadError = '';
  adminUi.data = normalizeAdminData(result.data);
}

// Sends one change to the server. Returns an error message, or '' on success.
async function adminAction(payload) {
  const result = await api('admin.php', { method: 'POST', body: payload });
  if (!result.ok) return result.data.message || 'Something went wrong. Please try again.';
  await loadAdminData();
  renderAdmin();
  showToast(result.data.message);
  return '';
}

// ---------- modal ----------

function openModal({ title, body, submitLabel = 'Save', onSubmit, hideSubmit = false }) {
  const modal = document.getElementById('adminModal');
  document.getElementById('adminModalTitle').textContent = title;
  document.getElementById('adminModalBody').innerHTML = body;
  const submit = document.getElementById('adminModalSubmit');
  submit.textContent = submitLabel;
  submit.disabled = false;
  submit.classList.toggle('hidden', hideSubmit);
  setModalError('');
  adminUi.onSubmit = onSubmit || null;
  if (!modal.open) modal.showModal();
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
  const submit = document.getElementById('adminModalSubmit');

  modal.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', closeModal));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminUi.onSubmit) return closeModal();
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach((key) => { values[key] = String(values[key]).trim(); });

    submit.disabled = true;
    setModalError('');
    const error = await adminUi.onSubmit(values);
    submit.disabled = false;
    if (error) {
      setModalError(error);
      return;
    }
    closeModal();
  });
}

function field(label, input) {
  return `<label class="modal-field"><span>${escapeHtml(label)}</span>${input}</label>`;
}

function textInput(name, value = '', attrs = '') {
  return `<input name="${name}" value="${escapeHtml(value)}" ${attrs} />`;
}

function selectInput(name, options, selected, attrs = '') {
  return `<select name="${name}" ${attrs}>${options.map(([value, label]) =>
    `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('')}</select>`;
}

function confirmAction(title, message, confirmLabel, payload) {
  openModal({
    title,
    body: `<p class="modal-text">${escapeHtml(message)}</p>`,
    submitLabel: confirmLabel,
    onSubmit: () => adminAction(payload)
  });
}

// ---------- dashboard ----------

function renderDashboard(state) {
  const confirmed = state.bookings.filter((b) => b.status === 'CONFIRMED');
  const revenue = state.bookings.filter(isPaid).reduce((sum, b) => sum + b.total, 0);
  const pending = state.bookings.filter(isPendingPayment);
  const scheduled = state.trips.filter((t) => t.status === 'SCHEDULED');
  const activeBuses = state.buses.filter((b) => b.status === 'ACTIVE');
  const upcoming = scheduled
    .filter((t) => new Date(t.departureTime.replace(' ', 'T')) >= new Date())
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
                  <td>${statusBadge(b.status)}</td>
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
                  <td>${t.seatsAvailable} / ${t.capacity}</td>
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
    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
    const haystack = `${b.id} ${b.customer} ${b.email} ${b.phone} ${b.route}`.toLowerCase();
    return matchesStatus && (!term || haystack.includes(term));
  });

  return `
    <div class="toolbar">
      <input type="search" placeholder="Search by ref, passenger, phone or route" data-filter="bookingSearch" value="${escapeHtml(bookingSearch)}" />
      ${selectInput('bookingStatusFilter', [['ALL', 'All statuses'], ['CONFIRMED', 'Confirmed'], ['CANCELLED', 'Cancelled']], statusFilter, 'data-filter="bookingStatus"')}
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
                <td>${escapeHtml(b.seats.join(', '))}</td>
                <td>${currency(b.total)}</td>
                <td>${statusBadge(b.paymentStatus)}</td>
                <td>${statusBadge(b.status)}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="view-booking" data-id="${escapeHtml(b.id)}">View</button>
                  ${b.status === 'CONFIRMED'
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

function viewBooking(state, ref) {
  const b = state.bookings.find((item) => item.id === ref);
  if (!b) return;
  const rows = [
    ['Reference', b.id],
    ['Passenger', b.customer],
    ['Phone', b.phone],
    ['Email', b.email],
    ['Route', b.route],
    ['Operator', b.operator],
    ['Departure', dateLabel(b.departure)],
    ['Seats', b.seats.join(', ')],
    ['Payment method', paymentLabel(b.payment)],
    ['Total', currency(b.total)],
    ['Booked on', dateLabel(b.createdAt)]
  ];
  openModal({
    title: `Booking ${b.id}`,
    body: `
      <dl class="detail-list">
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')}
        <dt>Payment status</dt><dd>${statusBadge(b.paymentStatus)}</dd>
        <dt>Booking status</dt><dd>${statusBadge(b.status)}</dd>
      </dl>`,
    hideSubmit: true
  });
}

function cancelBooking(state, ref) {
  const booking = state.bookings.find((b) => b.id === ref);
  if (!booking) return;
  confirmAction('Cancel booking', `Cancel booking ${ref} for ${booking.customer}? The seats will be released.`, 'Cancel booking',
    { action: 'cancelBooking', ref });
}

function deleteBooking(state, ref) {
  confirmAction('Delete booking', `Permanently delete booking ${ref}? This cannot be undone.`, 'Delete',
    { action: 'deleteBooking', ref });
}

// ---------- passengers ----------

function collectPassengers(state) {
  const byEmail = new Map();
  state.users.forEach((u) => {
    byEmail.set(u.email.toLowerCase(), { ...u, registered: true, bookings: 0, spent: 0 });
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
    if (isPaid(b)) p.spent += b.total;
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
                    <button class="mini-btn" data-action="edit-passenger" data-id="${p.id}">Edit</button>
                    <button class="mini-btn ${p.blocked ? '' : 'danger'}" data-action="toggle-passenger" data-id="${p.id}">${p.blocked ? 'Unblock' : 'Block'}</button>
                    <button class="mini-btn danger" data-action="delete-passenger" data-id="${p.id}">Delete</button>` : ''}
                </td>
              </tr>`).join('') || emptyRow(8, 'No passengers found.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function passengerForm(state, id) {
  const user = id ? state.users.find((u) => u.id === Number(id)) : null;
  openModal({
    title: user ? 'Edit passenger' : 'Add passenger',
    body: `
      ${field('Full name', textInput('name', user?.name, 'required'))}
      ${field('Email', textInput('email', user?.email, 'type="email" required'))}
      ${field('Phone', textInput('phone', user?.phone, 'placeholder="e.g. 0772 123456"'))}
      ${field(user ? 'New password (leave blank to keep)' : 'Password', textInput('password', '', 'type="password" autocomplete="new-password"'))}
    `,
    onSubmit: (v) => adminAction({ action: 'savePassenger', id: user?.id, ...v })
  });
}

function togglePassenger(state, id) {
  adminAction({ action: 'togglePassenger', id: Number(id) }).then((error) => error && showToast(error));
}

function deletePassenger(state, id) {
  const user = state.users.find((u) => u.id === Number(id));
  if (!user) return;
  confirmAction('Delete passenger', `Delete the account for ${user.email}? Their past bookings are kept.`, 'Delete',
    { action: 'deletePassenger', id: user.id });
}

// ---------- trips ----------

function renderTrips(state) {
  const filter = adminUi.filters.tripStatus;
  const trips = state.trips.filter((t) => filter === 'ALL' || t.status === filter);

  return `
    <div class="toolbar">
      ${selectInput('tripStatusFilter', [['ALL', 'All trips'], ['SCHEDULED', 'Scheduled'], ['CANCELLED', 'Cancelled']], filter, 'data-filter="tripStatus"')}
      <button class="primary-btn" data-action="add-trip">+ Add trip</button>
    </div>
    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Trip</th><th>Route</th><th>Bus</th><th>Departure</th><th>Arrival</th><th>Fare</th><th>Seats left</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${trips.map((t) => `
              <tr>
                <td><strong>#${t.id}</strong></td>
                <td>${escapeHtml(routeKey(t.origin, t.destination))}</td>
                <td>${escapeHtml(t.plate)}<small class="cell-sub">${escapeHtml(t.operator)}</small></td>
                <td>${dateLabel(t.departureTime)}</td>
                <td>${dateLabel(t.arrivalTime)}</td>
                <td>${currency(t.price)}</td>
                <td>${t.seatsAvailable} / ${t.capacity}</td>
                <td>${statusBadge(t.status)}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="edit-trip" data-id="${t.id}">Edit</button>
                  <button class="mini-btn danger" data-action="delete-trip" data-id="${t.id}">Delete</button>
                </td>
              </tr>`).join('') || emptyRow(9, 'No trips yet. Add one to start selling tickets.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tripForm(state, id) {
  const trip = id ? state.trips.find((t) => t.id === Number(id)) : null;
  const routes = state.routes.filter((r) => r.status === 'ACTIVE' || r.id === trip?.routeId);
  const buses = state.buses.filter((b) => b.status === 'ACTIVE' || b.id === trip?.busId);

  if (!routes.length || !buses.length) {
    openModal({
      title: 'Add trip',
      body: '<p class="modal-text">You need at least one active route and one active bus before adding a trip.</p>',
      hideSubmit: true
    });
    return;
  }

  const routeId = trip?.routeId || routes[0].id;
  const defaultFare = trip?.price || routes.find((r) => r.id === routeId).price;

  openModal({
    title: trip ? `Edit trip #${trip.id}` : 'Add trip',
    body: `
      ${field('Route', selectInput('routeId', routes.map((r) => [r.id, `${routeKey(r.origin, r.destination)} (${r.duration})`]), routeId))}
      ${field('Bus', selectInput('busId', buses.map((b) => [b.id, `${b.plate} · ${b.operator} (${b.capacity} seats)`]), trip?.busId || buses[0].id))}
      <div class="modal-row">
        ${field('Departure', textInput('departureTime', toDateTimeInput(trip?.departureTime), 'type="datetime-local" required'))}
        ${field('Arrival', textInput('arrivalTime', toDateTimeInput(trip?.arrivalTime), 'type="datetime-local" required'))}
      </div>
      <div class="modal-row">
        ${field('Fare per seat (UGX)', textInput('price', defaultFare, 'type="number" min="1000" step="500" required'))}
        ${field('Status', selectInput('status', [['SCHEDULED', 'Scheduled'], ['CANCELLED', 'Cancelled']], trip?.status || 'SCHEDULED'))}
      </div>
      <p class="modal-hint">Seats on sale are worked out from the bus capacity minus seats already booked.</p>
    `,
    onSubmit: (v) => adminAction({ action: 'saveTrip', id: trip?.id, ...v })
  });

  // Picking a route fills in its default fare for new trips
  if (!trip) {
    const form = document.getElementById('adminModalForm');
    form.elements.routeId.addEventListener('change', () => {
      const route = routes.find((r) => r.id === Number(form.elements.routeId.value));
      if (route) form.elements.price.value = route.price;
    });
  }
}

function deleteTrip(state, id) {
  confirmAction('Delete trip', `Delete trip #${id}? Passengers will no longer see it.`, 'Delete',
    { action: 'deleteTrip', id: Number(id) });
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
          <thead><tr><th>Plate</th><th>Operator</th><th>Model</th><th>Class</th><th>Seats</th><th>Driver</th><th>Trips</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${state.buses.map((b) => `
              <tr>
                <td><strong>${escapeHtml(b.plate)}</strong></td>
                <td>${escapeHtml(b.operator)}</td>
                <td>${escapeHtml(b.model)}</td>
                <td>${escapeHtml(b.type)}</td>
                <td>${b.capacity}</td>
                <td>${escapeHtml(b.driver || '—')}</td>
                <td>${state.trips.filter((t) => t.busId === b.id).length}</td>
                <td>${statusBadge(b.status)}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="edit-bus" data-id="${b.id}">Edit</button>
                  <button class="mini-btn danger" data-action="delete-bus" data-id="${b.id}">Delete</button>
                </td>
              </tr>`).join('') || emptyRow(9, 'No buses yet.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function busForm(state, id) {
  const bus = id ? state.buses.find((b) => b.id === Number(id)) : null;
  openModal({
    title: bus ? `Edit bus ${bus.plate}` : 'Add bus',
    body: `
      <div class="modal-row">
        ${field('Number plate', textInput('plate', bus?.plate, 'placeholder="e.g. UBA 123K" required'))}
        ${field('Operator', textInput('operator', bus?.operator, 'placeholder="e.g. Great Link" required'))}
      </div>
      <div class="modal-row">
        ${field('Make / model', textInput('model', bus?.model, 'placeholder="e.g. Scania Marcopolo" required'))}
        ${field('Driver', textInput('driver', bus?.driver, 'placeholder="Driver name"'))}
      </div>
      <div class="modal-row">
        ${field('Class', selectInput('type', BUS_TYPES.map((t) => [t, t]), bus?.type || 'Standard'))}
        ${field('Seat capacity', textInput('capacity', bus?.capacity, 'type="number" min="4" max="90" required'))}
      </div>
      ${field('Status', selectInput('status', [['ACTIVE', 'Active'], ['MAINTENANCE', 'Under maintenance'], ['RETIRED', 'Retired']], bus?.status || 'ACTIVE'))}
    `,
    onSubmit: (v) => adminAction({ action: 'saveBus', id: bus?.id, ...v })
  });
}

function deleteBus(state, id) {
  const bus = state.buses.find((b) => b.id === Number(id));
  if (!bus) return;
  confirmAction('Delete bus', `Remove ${bus.plate} from the fleet?`, 'Delete', { action: 'deleteBus', id: bus.id });
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
          <thead><tr><th>Route</th><th>Distance</th><th>Journey time</th><th>Default fare</th><th>Trips</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${state.routes.map((r) => `
              <tr>
                <td><strong>${escapeHtml(routeKey(r.origin, r.destination))}</strong></td>
                <td>${r.distanceKm} km</td>
                <td>${escapeHtml(r.duration)}</td>
                <td>${currency(r.price)}</td>
                <td>${state.trips.filter((t) => t.routeId === r.id).length}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="row-actions">
                  <button class="mini-btn" data-action="edit-route" data-id="${r.id}">Edit</button>
                  <button class="mini-btn danger" data-action="delete-route" data-id="${r.id}">Delete</button>
                </td>
              </tr>`).join('') || emptyRow(7, 'No routes yet.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function routeForm(state, id) {
  const route = id ? state.routes.find((r) => r.id === Number(id)) : null;
  const inUse = route && state.trips.some((t) => t.routeId === route.id);
  const lock = inUse ? 'readonly title="Route has trips, so its towns cannot change"' : '';
  openModal({
    title: route ? 'Edit route' : 'Add route',
    body: `
      <div class="modal-row">
        ${field('From', textInput('origin', route?.origin, `placeholder="e.g. Kampala" required ${lock}`))}
        ${field('To', textInput('destination', route?.destination, `placeholder="e.g. Arua" required ${lock}`))}
      </div>
      <div class="modal-row">
        ${field('Distance (km)', textInput('distanceKm', route?.distanceKm, 'type="number" min="1" required'))}
        ${field('Journey time', textInput('duration', route?.duration, 'placeholder="e.g. 5h 30m" required'))}
      </div>
      <div class="modal-row">
        ${field('Default fare (UGX)', textInput('price', route?.price, 'type="number" min="1000" step="500" required'))}
        ${field('Status', selectInput('status', [['ACTIVE', 'Active'], ['INACTIVE', 'Inactive']], route?.status || 'ACTIVE'))}
      </div>
    `,
    onSubmit: (v) => adminAction({ action: 'saveRoute', id: route?.id, ...v })
  });
}

function deleteRoute(state, id) {
  const route = state.routes.find((r) => r.id === Number(id));
  if (!route) return;
  confirmAction('Delete route', `Delete the route ${routeKey(route.origin, route.destination)}?`, 'Delete',
    { action: 'deleteRoute', id: route.id });
}

// ---------- payments ----------

function renderPayments(state) {
  const filter = adminUi.filters.paymentStatus;
  const sum = (list) => list.reduce((total, b) => total + b.total, 0);
  const paid = state.bookings.filter(isPaid);
  const pending = state.bookings.filter(isPendingPayment);
  const refunded = state.bookings.filter((b) => b.paymentStatus === 'REFUNDED');
  const toRefund = paid.filter((b) => b.status === 'CANCELLED');
  const rows = state.bookings.filter((b) => filter === 'ALL' || b.paymentStatus === filter);

  return `
    <div class="admin-grid stats-grid">
      <div class="admin-card stat-box"><span class="stat-label">Collected</span><strong>${currency(sum(paid))}</strong><small>${paid.length} payments</small></div>
      <div class="admin-card stat-box"><span class="stat-label">Awaiting cash at station</span><strong>${currency(sum(pending))}</strong><small>${pending.length} bookings</small></div>
      <div class="admin-card stat-box"><span class="stat-label">Refunded</span><strong>${currency(sum(refunded))}</strong><small>${refunded.length} refunds</small></div>
      <div class="admin-card stat-box"><span class="stat-label">Refunds due</span><strong>${currency(sum(toRefund))}</strong><small>Paid but cancelled</small></div>
    </div>

    <div class="toolbar">
      ${selectInput('paymentStatusFilter', [['ALL', 'All payments'], ['PAID', 'Paid'], ['PAY_AT_STATION', 'Pending'], ['REFUNDED', 'Refunded']], filter, 'data-filter="paymentStatus"')}
    </div>

    <div class="table-card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Booking</th><th>Passenger</th><th>Method</th><th>Amount</th><th>Date</th><th>Booking</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            ${rows.map((b) => {
              let action = '';
              if (isPendingPayment(b)) {
                action = `<button class="mini-btn" data-action="mark-paid" data-id="${escapeHtml(b.id)}">Mark paid</button>`;
              } else if (isPaid(b)) {
                action = `<button class="mini-btn danger" data-action="refund" data-id="${escapeHtml(b.id)}">Refund</button>`;
              }
              return `
              <tr>
                <td><strong>${escapeHtml(b.id)}</strong></td>
                <td>${escapeHtml(b.customer)}</td>
                <td>${escapeHtml(paymentLabel(b.payment))}</td>
                <td>${currency(b.total)}</td>
                <td>${dateLabel(b.refundedAt || b.paidAt || b.createdAt)}</td>
                <td>${statusBadge(b.status)}</td>
                <td>${statusBadge(b.paymentStatus)}</td>
                <td class="row-actions">${action}</td>
              </tr>`;
            }).join('') || emptyRow(8, 'No payments match this filter.')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function markPaid(state, ref) {
  const booking = state.bookings.find((b) => b.id === ref);
  if (!booking) return;
  confirmAction('Confirm cash payment', `Confirm that ${booking.customer} paid ${currency(booking.total)} at the station?`, 'Mark as paid',
    { action: 'markPaid', ref });
}

function refundPayment(state, ref) {
  const booking = state.bookings.find((b) => b.id === ref);
  if (!booking) return;
  const note = booking.status === 'CONFIRMED' ? ' The booking will also be cancelled and its seats released.' : '';
  confirmAction('Refund payment', `Refund ${currency(booking.total)} to ${booking.customer} via ${paymentLabel(booking.payment)}?${note}`, 'Refund',
    { action: 'refund', ref });
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
  const confirmed = state.bookings.filter((b) => b.status === 'CONFIRMED');

  const byRoute = {};
  paid.forEach((b) => { byRoute[b.route] = (byRoute[b.route] || 0) + b.total; });

  const byMethod = {};
  PAYMENT_METHODS.forEach((m) => { byMethod[paymentLabel(m)] = 0; });
  state.bookings.forEach((b) => { byMethod[paymentLabel(b.payment)] = (byMethod[paymentLabel(b.payment)] || 0) + 1; });

  const byOperator = {};
  confirmed.forEach((b) => { byOperator[b.operator] = (byOperator[b.operator] || 0) + b.seats.length; });

  const cancelled = state.bookings.length - confirmed.length;
  const cancelRate = state.bookings.length ? Math.round((cancelled / state.bookings.length) * 100) : 0;
  const seatsSold = confirmed.reduce((n, b) => n + b.seats.length, 0);
  const avgTicket = paid.length ? paid.reduce((n, b) => n + b.total, 0) / paid.length : 0;

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
  const state = adminUi.data;
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
    if (!active) return;
    if (adminUi.loadError) {
      el.innerHTML = `<div class="empty-card"><h3>Could not load data</h3><p>${escapeHtml(adminUi.loadError)}</p></div>`;
    } else if (!state) {
      el.innerHTML = '<p class="toolbar-note">Loading…</p>';
    } else {
      el.innerHTML = SECTION_RENDERERS[section](state);
    }
  });

  const pending = state ? state.bookings.filter(isPendingPayment).length : 0;
  const badge = document.getElementById('pendingPaymentsCount');
  badge.textContent = pending;
  badge.classList.toggle('hidden', !pending);
}

async function initAdminDashboard() {
  const user = getCurrentUser();
  if (user) {
    document.getElementById('adminName').textContent = user.name;
    document.getElementById('adminEmail').textContent = user.email;
  }

  initModal();

  const content = document.querySelector('.admin-content');

  content.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !adminUi.data) return;
    const handler = ACTIONS[button.dataset.action];
    if (handler) handler(adminUi.data, button.dataset.id);
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
  await loadAdminData();
  renderAdmin();
}
