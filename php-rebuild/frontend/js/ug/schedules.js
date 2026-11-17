/**
 * UG Express - Bus Schedules & Timetable Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { tripAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  renderLayout();

  // Elements
  const routeFilterSelect = document.getElementById('schedule-route-filter');
  const dateInput = document.getElementById('schedule-date-input');
  const operatorSelect = document.getElementById('schedule-operator-filter');
  const quickTodayBtn = document.getElementById('btn-quick-today');
  const quickTomorrowBtn = document.getElementById('btn-quick-tomorrow');
  const quickAllBtn = document.getElementById('btn-quick-all');
  const tableContainer = document.getElementById('schedules-list-container');
  const totalCountEl = document.getElementById('schedules-count');

  // Default to today
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateInput) {
    dateInput.value = todayStr;
    dateInput.min = todayStr;
  }

  let allTrips = [];
  let routes = [];

  async function loadRoutes() {
    try {
      const res = await tripAPI.getRoutes();
      if (res.data.success && res.data.routes) {
        routes = res.data.routes;
        if (routeFilterSelect) {
          routeFilterSelect.innerHTML = '<option value="ALL">All Intercity Routes</option>' +
            routes.map(r => `<option value="${r.origin}->${r.destination}">${r.origin} ↔ ${r.destination} (${r.estimatedDuration})</option>`).join('');
        }
      }
    } catch (err) {
      console.warn('Failed to load routes:', err);
    }
  }

  async function loadSchedules() {
    if (!tableContainer) return;

    tableContainer.innerHTML = `
      <div class="card text-center" style="padding: 3rem;">
        <div style="width: 2.5rem; height: 2.5rem; border: 4px solid var(--must-navy); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem;"></div>
        <p style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">Fetching live intercity bus schedules...</p>
      </div>
    `;

    try {
      // Fetch without route restriction to get all active schedules
      const res = await tripAPI.searchTrips({});
      if (res.data.success && res.data.trips) {
        allTrips = res.data.trips;
        populateOperators(allTrips);
        renderSchedules();
      } else {
        renderEmpty();
      }
    } catch (err) {
      console.error(err);
      renderEmpty('Unable to load bus schedules. Please try again.');
    }
  }

  function populateOperators(trips) {
    if (!operatorSelect) return;
    const operators = Array.from(new Set(trips.map(t => t.vehicle?.operatorName).filter(Boolean)));
    operatorSelect.innerHTML = '<option value="ALL">All Operators</option>' +
      operators.map(op => `<option value="${op}">${op}</option>`).join('');
  }

  function renderSchedules() {
    if (!tableContainer) return;

    const selectedRoute = routeFilterSelect?.value || 'ALL';
    const selectedDate = dateInput?.value || '';
    const selectedOperator = operatorSelect?.value || 'ALL';

    let filtered = allTrips.filter((t) => {
      // Route filter
      if (selectedRoute !== 'ALL') {
        const routeKey = `${t.route?.origin}->${t.route?.destination}`;
        if (routeKey !== selectedRoute) return false;
      }

      // Operator filter
      if (selectedOperator !== 'ALL') {
        if (t.vehicle?.operatorName !== selectedOperator) return false;
      }

      // Date filter
      if (selectedDate) {
        const tripDate = new Date(t.departureTime).toISOString().split('T')[0];
        if (tripDate !== selectedDate) return false;
      }

      return true;
    });

    // If filtering by a specific date produced 0 results, show next upcoming
    let showingUpcomingFallback = false;
    if (filtered.length === 0 && selectedDate) {
      filtered = allTrips.filter((t) => {
        if (selectedRoute !== 'ALL') {
          const routeKey = `${t.route?.origin}->${t.route?.destination}`;
          if (routeKey !== selectedRoute) return false;
        }
        if (selectedOperator !== 'ALL') {
          if (t.vehicle?.operatorName !== selectedOperator) return false;
        }
        const tripDate = new Date(t.departureTime).toISOString().split('T')[0];
        return tripDate >= selectedDate;
      });
      if (filtered.length > 0) {
        showingUpcomingFallback = true;
      }
    }

    if (totalCountEl) {
      totalCountEl.textContent = `${filtered.length} Scheduled Departures`;
    }

    if (filtered.length === 0) {
      renderEmpty('No scheduled bus departures match your selected criteria.');
      return;
    }

    tableContainer.innerHTML = `
      ${showingUpcomingFallback ? `
        <div class="badge badge-gold" style="width: 100%; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 12px; justify-content: flex-start; gap: 0.5rem;">
          <i data-lucide="info" style="width: 16px; height: 16px;"></i>
          No exact departures found for ${selectedDate}. Displaying next available upcoming schedules below:
        </div>
      ` : ''}

      <div style="display: flex; flex-direction: column; gap: 1rem;">
        ${filtered.map((trip) => {
          const dep = new Date(trip.departureTime);
          const arr = new Date(trip.arrivalTime);
          const depTimeStr = dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const arrTimeStr = arr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const depDateStr = dep.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
          const availableSeats = trip.availableSeats || 34;

          const busImg = trip.vehicle?.operatorName === 'Global Coach'
            ? '../images/bus.jpeg'
            : trip.vehicle?.operatorName === 'Link Bus'
            ? '../images/bus1.jpeg'
            : trip.vehicle?.operatorName === 'Uganda Coach Express'
            ? '../images/bus3.jpeg'
            : '../images/bus4.jpeg';

          return `
            <div class="card" style="padding: 1.25rem 1.5rem; transition: all 0.2s;">
              <div class="grid grid-cols-1" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.25rem; align-items: center;">

                <!-- Operator & Bus Info -->
                <div class="flex items-center gap-3">
                  <div style="width: 3rem; height: 3rem; border-radius: var(--radius-md); overflow: hidden; background: #f1f5f9; border: 1px solid var(--border-color); flex-shrink: 0;">
                    <img src="${busImg}" alt="Bus" style="width: 100%; height: 100%; object-fit: cover;">
                  </div>
                  <div>
                    <span class="badge badge-navy" style="font-size: 11px;">${trip.vehicle?.operatorName || 'Uganda Coach Express'}</span>
                    <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-top: 0.2rem;">
                      ${trip.vehicle?.regNumber || 'UBF-892K'} • ${trip.vehicle?.model || 'Coach'}
                    </div>
                  </div>
                </div>

                <!-- Schedule Times -->
                <div>
                  <div class="flex items-center gap-2 font-mono" style="font-size: 1.25rem; font-weight: 800; color: var(--text-main);">
                    <span>${depTimeStr}</span>
                    <span style="font-size: 11px; color: var(--text-muted); font-weight: 400;">→</span>
                    <span>${arrTimeStr}</span>
                  </div>
                  <div style="font-size: 11px; color: #000000; font-weight: 700; font-family: var(--font-mono);">
                    ${depDateStr}
                  </div>
                </div>

                <!-- Route Details -->
                <div>
                  <div style="font-size: 14px; font-weight: 700; color: var(--text-main);">
                    ${trip.route?.origin} → ${trip.route?.destination}
                  </div>
                  <div class="flex items-center gap-2" style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 0.2rem;">
                    <span>${trip.route?.distanceKm || 280} km</span>
                    <span>•</span>
                    <span>${trip.route?.estimatedDuration || '4h 30m'}</span>
                  </div>
                </div>

                <!-- Price & Seats Left -->
                <div class="text-left sm:text-right">
                  <div style="font-size: 1.35rem; font-weight: 900; font-family: var(--font-mono); color: #000000;">
                    UGX ${trip.priceUGX.toLocaleString()}
                  </div>
                  <div class="badge badge-green" style="font-size: 10px; margin-top: 0.2rem;">
                    ${availableSeats} seats available
                  </div>
                </div>

                <!-- Action Button -->
                <div>
                  <a href="seats.html?tripId=${trip.id}&passengers=1" class="btn-primary" style="width: 100%; padding: 0.65rem 1rem; font-size: 12px; justify-content: center;">
                    Book This Bus &gt;
                  </a>
                </div>

              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function renderEmpty(msg = 'No schedules found.') {
    if (!tableContainer) return;
    tableContainer.innerHTML = `
      <div class="card text-center" style="padding: 3rem;">
        <i data-lucide="calendar" style="width: 2.5rem; height: 2.5rem; color: var(--text-muted); margin: 0 auto 0.75rem;"></i>
        <h4 style="font-weight: 700; margin-bottom: 0.5rem;">No Departures Found</h4>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 1.25rem;">${msg}</p>
        <button type="button" id="btn-reset-filters" class="btn-primary">View All Upcoming Schedules</button>
      </div>
    `;
    const resetBtn = document.getElementById('btn-reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (dateInput) dateInput.value = '';
        if (routeFilterSelect) routeFilterSelect.value = 'ALL';
        if (operatorSelect) operatorSelect.value = 'ALL';
        renderSchedules();
      });
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Event listeners
  if (routeFilterSelect) routeFilterSelect.addEventListener('change', renderSchedules);
  if (dateInput) dateInput.addEventListener('change', renderSchedules);
  if (operatorSelect) operatorSelect.addEventListener('change', renderSchedules);

  // Quick date buttons
  if (quickTodayBtn) {
    quickTodayBtn.addEventListener('click', () => {
      if (dateInput) dateInput.value = todayStr;
      renderSchedules();
    });
  }
  if (quickTomorrowBtn) {
    quickTomorrowBtn.addEventListener('click', () => {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      if (dateInput) dateInput.value = tom.toISOString().split('T')[0];
      renderSchedules();
    });
  }
  if (quickAllBtn) {
    quickAllBtn.addEventListener('click', () => {
      if (dateInput) dateInput.value = '';
      renderSchedules();
    });
  }

  await loadRoutes();
  await loadSchedules();
});
