/**
 * UG Express - Search Results Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { tripAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  renderLayout();

  const urlParams = new URLSearchParams(window.location.search);
  const origin = urlParams.get('origin') || 'Kampala';
  const destination = urlParams.get('destination') || 'Mbarara';
  const date = urlParams.get('date') || new Date().toISOString().split('T')[0];
  const passengers = parseInt(urlParams.get('passengers') || '1', 10);

  // UI Targets
  const routeDisplay = document.getElementById('search-route-summary');
  const detailsDisplay = document.getElementById('search-details-summary');
  const tripsContainer = document.getElementById('trips-results-container');
  const sortTimeBtn = document.getElementById('sort-time-btn');
  const sortPriceBtn = document.getElementById('sort-price-btn');
  const operatorSelect = document.getElementById('operator-filter-select');

  if (routeDisplay) {
    routeDisplay.innerHTML = `<span>${origin}</span> <i data-lucide="arrow-right" style="width: 1rem; height: 1rem; display: inline-block; vertical-align: middle; color: #000000;"></i> <span>${destination}</span>`;
  }
  if (detailsDisplay) {
    detailsDisplay.textContent = `Departure: ${date} • ${passengers} Passenger${passengers > 1 ? 's' : ''}`;
  }

  let allTrips = [];
  let sortBy = 'time';
  let operatorFilter = 'ALL';

  async function loadTrips() {
    if (!tripsContainer) return;
    tripsContainer.innerHTML = `
      <div class="card text-center" style="padding: 3rem;">
        <div style="width: 2.5rem; height: 2.5rem; border: 4px solid var(--must-navy); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem;"></div>
        <p style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">Loading real-time bus connections...</p>
      </div>
    `;

    try {
      const res = await tripAPI.searchTrips({ origin, destination, date, passengers });
      if (res.data.success && res.data.trips) {
        allTrips = res.data.trips;
        populateOperators(allTrips);
        renderFilteredTrips();
      } else {
        renderEmpty('No scheduled trips found for this route on the selected date.');
      }
    } catch (err) {
      console.error(err);
      renderEmpty('Unable to fetch bus connections. Please try again.');
    }
  }

  function populateOperators(trips) {
    if (!operatorSelect) return;
    const operators = Array.from(new Set(trips.map((t) => t.vehicle?.operatorName).filter(Boolean)));
    operatorSelect.innerHTML = `<option value="ALL">All Operators (${trips.length})</option>` +
      operators.map((op) => `<option value="${op}">${op}</option>`).join('');
  }

  function renderFilteredTrips() {
    if (!tripsContainer) return;

    let filtered = allTrips.filter((t) => {
      if (operatorFilter === 'ALL') return true;
      return t.vehicle?.operatorName === operatorFilter;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'price') return a.priceUGX - b.priceUGX;
      return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
    });

    if (filtered.length === 0) {
      renderEmpty('No bus schedules match your filters.');
      return;
    }

    tripsContainer.innerHTML = filtered.map((trip) => {
      const depDateObj = new Date(trip.departureTime);
      const depTime = depDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const depDateStr = depDateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const arrTime = new Date(trip.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const availableCount = trip.availableSeats ?? (trip.seats ? trip.seats.filter(s => s.isAvailable).length : 36);

      const busImg = trip.vehicle?.operatorName === 'Global Coach'
        ? '../images/bus.jpeg'
        : trip.vehicle?.operatorName === 'Link Bus'
        ? '../images/bus1.jpeg'
        : trip.vehicle?.operatorName === 'Uganda Coach Express'
        ? '../images/bus3.jpeg'
        : '../images/bus4.jpeg';

      return `
        <div class="card" style="padding: 1.5rem; margin-bottom: 1.25rem;">
          <!-- Card Header -->
          <div class="flex items-center justify-between flex-wrap gap-2" style="border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1rem;">
            <div class="flex items-center gap-3">
              <div style="width: 2.5rem; height: 2.5rem; border-radius: var(--radius-md); overflow: hidden; background: #f1f5f9; border: 1px solid var(--border-color); flex-shrink: 0;">
                <img src="${busImg}" alt="${trip.vehicle?.operatorName || 'Bus'}" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="badge badge-navy">${trip.vehicle?.operatorName || 'Uganda Coach Express'}</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">
                  ${trip.vehicle?.regNumber || 'UBF-892K'} (${trip.vehicle?.totalSeats || 36} Seats)
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-navy" style="font-size: 11px;">
                <i data-lucide="calendar" style="width: 11px; height: 11px;"></i> ${depDateStr}
              </span>
              <span class="badge badge-green" style="font-size: 10px;">Direct Connection</span>
            </div>
          </div>

          <!-- Timeline & Fare Grid -->
          <div class="grid grid-cols-1" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.25rem; align-items: center;">
            <!-- Departure -->
            <div class="text-left">
              <div style="font-size: 1.35rem; font-weight: 700; font-family: var(--font-mono); color: var(--text-main);">${depTime}</div>
              <div style="font-size: 12px; font-weight: 700; color: var(--text-main);">${trip.route?.origin || origin}</div>
              <div style="font-size: 10px; color: var(--text-muted);">Main Bus Terminal</div>
            </div>

            <!-- Route Middle -->
            <div style="text-align: center;">
              <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">Direct Express</span>
              <div class="flex items-center gap-1" style="margin: 0.25rem 0;">
                <div style="width: 6px; height: 6px; border-radius: 50%; background: var(--must-navy);"></div>
                <div style="flex: 1; height: 2px; background: var(--border-color);"></div>
                <div style="width: 6px; height: 6px; border-radius: 50%; background: var(--must-navy);"></div>
              </div>
              <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${trip.route?.estimatedDuration || '4h 30m'}</span>
            </div>

            <!-- Arrival -->
            <div class="text-left">
              <div style="font-size: 1.35rem; font-weight: 700; font-family: var(--font-mono); color: var(--text-main);">${arrTime}</div>
              <div style="font-size: 12px; font-weight: 700; color: var(--text-main);">${trip.route?.destination || destination}</div>
              <div style="font-size: 10px; color: var(--text-muted);">Central Station</div>
            </div>

            <!-- Price & Action -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; text-align: left;">
              <div class="flex items-center gap-2" style="margin-bottom: 0.25rem; color: #000000;">
                <i data-lucide="wifi" style="width: 13px; height: 13px;"></i>
                <i data-lucide="zap" style="width: 13px; height: 13px;"></i>
                <i data-lucide="shield-check" style="width: 13px; height: 13px;"></i>
              </div>
              <div style="font-size: 1.35rem; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">
                UGX ${trip.priceUGX.toLocaleString()}
              </div>
              <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 0.5rem;">
                ${availableCount} seats left
              </div>
              <a href="seats.html?tripId=${trip.id}&passengers=${passengers}" class="btn-primary" style="width: 100%; text-align: center; font-size: 11px; padding: 0.5rem;">
                Select Bus & Seat &gt;
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function renderEmpty(message) {
    if (!tripsContainer) return;
    tripsContainer.innerHTML = `
      <div class="card text-center" style="padding: 3rem;">
        <i data-lucide="calendar" style="width: 2.5rem; height: 2.5rem; color: var(--text-muted); margin: 0 auto 0.75rem;"></i>
        <h4 style="font-weight: 700; margin-bottom: 0.5rem;">No Departures Found</h4>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">${message}</p>
        <div class="flex items-center justify-center gap-3 flex-wrap">
          <a href="index.html" class="btn-primary">Modify Search</a>
          <a href="schedules.html" class="btn-secondary">Browse All Bus Schedules</a>
        </div>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Sorting handlers
  if (sortTimeBtn && sortPriceBtn) {
    sortTimeBtn.addEventListener('click', () => {
      sortBy = 'time';
      sortTimeBtn.classList.add('active');
      sortPriceBtn.classList.remove('active');
      renderFilteredTrips();
    });

    sortPriceBtn.addEventListener('click', () => {
      sortBy = 'price';
      sortPriceBtn.classList.add('active');
      sortTimeBtn.classList.remove('active');
      renderFilteredTrips();
    });
  }

  if (operatorSelect) {
    operatorSelect.addEventListener('change', (e) => {
      operatorFilter = e.target.value;
      renderFilteredTrips();
    });
  }

  loadTrips();
});
