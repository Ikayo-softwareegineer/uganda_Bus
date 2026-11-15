/**
 * Uganda Bus - API client for the PHP backend (Vanilla JavaScript)
 *
 * The pages call the same functions as before (authAPI.login, tripAPI.searchTrips, ...).
 * This file sends each call to the matching PHP file in backend/api/, then turns
 * the PHP/SQLite rows into the objects the pages expect (trip.route.origin, booking.passengers, ...).
 *
 * Login works with the PHP session cookie, so there is no token to store.
 * Successful calls resolve to { data }. Failed calls throw an Error with
 * error.response = { status, data } so pages can show the server's message.
 */

const API_BASE_URL = '../../backend/api/';

// The admin dashboard (admin.html + site.js) remembers the user under this key
const ADMIN_STORAGE_KEY = 'ugandaBusBooking';

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      method,
      credentials: 'same-origin', // send the PHP session cookie
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    const error = new Error('Cannot reach the server. Make sure the PHP server is running.');
    error.response = { status: 0, data: { success: false, message: error.message } };
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = { success: false, message: 'The server sent an unexpected response.' };
  }

  if (!response.ok || data.success === false) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.response = { status: response.status, data };
    throw error;
  }
  return { data };
}

// ---------- Converting PHP rows into page objects ----------

// SQLite stores "2026-11-16 07:30:00" (Uganda time); the pages expect "2026-11-16T07:30:00"
function toIso(value) {
  return value ? String(value).replace(' ', 'T') : null;
}

function parseJson(value, fallback) {
  if (Array.isArray(value)) return value;
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (e) {
    return fallback;
  }
}

function mapUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: String(user.role || 'customer').toUpperCase(), // CUSTOMER, STAFF, ADMIN
  };
}

function mapRoute(r) {
  return {
    id: r.id,
    origin: r.origin,
    destination: r.destination,
    distanceKm: Number(r.distance_km),
    estimatedDuration: r.duration,
    basePriceUGX: Number(r.price_ugx),
  };
}

// Seats laid out 4 per row (A B | aisle | C D), like a real coach
function buildSeats(totalSeats, bookedSeats = []) {
  const cols = ['A', 'B', 'C', 'D'];
  const seats = [];
  for (let i = 0; i < totalSeats; i++) {
    const row = Math.floor(i / 4) + 1;
    const col = (i % 4) + 1;
    const seatNumber = `${row}${cols[col - 1]}`;
    seats.push({
      id: seatNumber, // the seat number is what the PHP API books
      seatNumber,
      seatRow: row,
      seatCol: col,
      isAccessible: row === 1 && col <= 2,
      isAvailable: !bookedSeats.includes(seatNumber),
    });
  }
  return seats;
}

function mapTrip(t) {
  const trip = {
    id: t.id,
    routeId: t.route_id,
    vehicleId: t.vehicle_id,
    departureTime: toIso(t.departure_time),
    arrivalTime: toIso(t.arrival_time),
    priceUGX: Number(t.price_ugx),
    availableSeats: Number(t.available_seats),
    status: t.status,
    route: {
      id: t.route_id,
      origin: t.origin,
      destination: t.destination,
      distanceKm: Number(t.distance_km || 0),
      estimatedDuration: t.duration || '',
    },
    vehicle: {
      id: t.vehicle_id,
      regNumber: t.reg_number,
      model: t.model,
      operatorName: t.operator_name,
      totalSeats: Number(t.total_seats || 0),
      driverName: t.driver_name,
    },
  };
  // trip.php also sends the booked seats, so the seat map can be drawn
  if (Array.isArray(t.booked_seats)) {
    trip.seats = buildSeats(trip.vehicle.totalSeats || 36, t.booked_seats);
  }
  return trip;
}

function mapBooking(b) {
  const seatNumbers = String(b.seats || '').split(',').filter(Boolean);
  const details = parseJson(b.passenger_details, []);
  const names = parseJson(b.passenger_names, []);

  // One passenger per seat: full details if checkout sent them, otherwise the booking contact
  const passengers = seatNumbers.map((seat, i) => {
    const d = details.find((p) => p.seat === seat) || details[i] || {};
    return {
      fullName: d.name || names[i] || b.user_name,
      phone: d.phone || b.phone,
      email: d.email || b.email,
      seat: { seatNumber: seat },
    };
  });

  return {
    id: b.booking_ref, // the PHP API finds bookings by their reference
    bookingRef: b.booking_ref,
    totalAmountUGX: Number(b.total_amount),
    bookingStatus: b.status,
    paymentStatus: b.payment_status,
    createdAt: toIso(b.created_at),
    canCancel: Boolean(b.can_cancel),
    user: { name: b.user_name, phone: b.phone, email: b.email },
    trip: {
      id: b.trip_id,
      departureTime: toIso(b.departure_time),
      arrivalTime: toIso(b.arrival_time),
      priceUGX: Number(b.price_ugx || 0),
      route: {
        origin: b.origin,
        destination: b.destination,
        distanceKm: Number(b.distance_km || 0),
        estimatedDuration: b.duration || '',
      },
      vehicle: { operatorName: b.operator_name, regNumber: b.reg_number, model: b.model },
    },
    passengers,
    payment: { method: b.payment_method, status: b.payment_status },
    ticket: {
      ticketCode: `TKT-${b.booking_ref}`,
      qrData: `UGANDA-BUS|${b.booking_ref}|${b.trip_id}|${seatNumbers.join(',')}|${b.payment_method}|${b.payment_status}`,
      verifiedAt: toIso(b.verified_at),
    },
  };
}

// Keep the admin dashboard's login memory in step with the main site
function rememberForAdmin(user) {
  try {
    if (user) {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify({
        user: { id: user.id, name: user.name, email: user.email, role: user.role.toLowerCase() },
      }));
    } else {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
  } catch (e) { /* storage blocked: the admin page will ask to log in again */ }
}

// ---------- API used by the pages ----------

async function loginAndLoadUser(email, password) {
  await request('login.php', { method: 'POST', body: { email, password } });
  const me = await request('me.php'); // includes the phone number for checkout
  const user = mapUser(me.data.user);
  rememberForAdmin(user);
  return { data: { success: true, token: 'php-session', user } };
}

export const authAPI = {
  login: (email, password) => loginAndLoadUser(email, password),

  // Create the account, then log straight in (like the first version of the site)
  register: async ({ name, email, phone, password }) => {
    await request('register.php', { method: 'POST', body: { name, email, phone, password } });
    return loginAndLoadUser(email, password);
  },

  getMe: async () => {
    const res = await request('me.php');
    const user = mapUser(res.data.user);
    rememberForAdmin(user);
    return { data: { success: true, user } };
  },

  logout: async () => {
    rememberForAdmin(null);
    try {
      await request('logout.php', { method: 'POST' });
    } catch (e) { /* already logged out */ }
  },
};

export const tripAPI = {
  getRoutes: async () => {
    const res = await request('routes.php');
    return {
      data: {
        success: true,
        routes: res.data.routes.map(mapRoute),
        origins: res.data.origins,
        destinations: res.data.destinations,
      },
    };
  },

  searchTrips: async (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, v);
    });
    const res = await request(`search.php?${params.toString()}`);
    const trips = res.data.trips.map(mapTrip);
    return { data: { success: true, count: trips.length, trips } };
  },

  getTripById: async (id) => {
    const res = await request(`trip.php?id=${encodeURIComponent(id)}`);
    return { data: { success: true, trip: mapTrip(res.data.trip) } };
  },
};

export const bookingAPI = {
  // data = { tripId, passengerDetails: [{ seatId, fullName, phone, email }], paymentMethod }
  createBooking: async (data) => {
    const passengerDetails = (data.passengerDetails || []).map((p) => ({
      seat: p.seatId,
      fullName: p.fullName,
      phone: p.phone,
      email: p.email,
    }));
    const res = await request('book.php', {
      method: 'POST',
      body: { tripId: data.tripId, paymentMethod: data.paymentMethod, passengerDetails },
    });
    // Load the saved booking so the ticket page has every detail
    const saved = await request(`booking.php?ref=${encodeURIComponent(res.data.bookingRef)}`);
    return { data: { success: true, message: res.data.message, booking: mapBooking(saved.data.booking) } };
  },

  getUserBookings: async () => {
    const res = await request('my_bookings.php');
    return { data: { success: true, bookings: res.data.bookings.map(mapBooking), summary: res.data.summary } };
  },

  getBookingById: async (ref) => {
    const res = await request(`booking.php?ref=${encodeURIComponent(ref)}`);
    return { data: { success: true, booking: mapBooking(res.data.booking) } };
  },

  cancelBooking: (ref) => request('cancel_booking.php', { method: 'POST', body: { ref } }),
};

export const ticketAPI = {
  verifyTicket: async (bookingRef) => {
    try {
      const res = await request('verify_ticket.php', { method: 'POST', body: { ref: bookingRef } });
      return { data: { ...res.data, booking: mapBooking(res.data.booking) } };
    } catch (err) {
      // Keep the server's message, and the booking when there is one (used / cancelled tickets)
      const data = err.response?.data || {};
      if (data.booking) data.booking = mapBooking(data.booking);
      throw err;
    }
  },

  recentChecks: () => request('verify_ticket.php'),
};

// Expose globally for non-module scripts
window.API = { auth: authAPI, trip: tripAPI, booking: bookingAPI, ticket: ticketAPI };
