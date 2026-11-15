/**
 * UG Express - Home Page Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { tripAPI } from './api.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Auth & layout
  await Auth.init();
  renderLayout();

  // Elements
  const originSelect = document.getElementById('search-origin');
  const destSelect = document.getElementById('search-destination');
  const swapBtn = document.getElementById('btn-swap-routes');
  const dateInput = document.getElementById('search-date');
  const prevDayBtn = document.getElementById('btn-prev-day');
  const nextDayBtn = document.getElementById('btn-next-day');
  const passengerBtn = document.getElementById('passenger-dropdown-btn');
  const passengerMenu = document.getElementById('passenger-dropdown-menu');
  const passengerCountDisplay = document.getElementById('passenger-count-display');
  const passengerNumSpan = document.getElementById('passenger-num');
  const btnDecPass = document.getElementById('btn-dec-passengers');
  const btnIncPass = document.getElementById('btn-inc-passengers');
  const btnApplyPass = document.getElementById('btn-apply-passengers');
  const searchForm = document.getElementById('bus-search-form');

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  if (dateInput) {
    dateInput.min = today;
    dateInput.value = today;
  }

  let passengers = 1;

  // 1. Fetch available routes from backend
  try {
    const res = await tripAPI.getRoutes();
    if (res.data.success && res.data.origins?.length > 0) {
      populateSelect(originSelect, res.data.origins, 'Kampala');
      populateSelect(destSelect, res.data.destinations, 'Mbarara');
    }
    if (res.data.success) updateRouteCards(res.data.routes || []);
  } catch (err) {
    console.warn('Using default routes:', err);
  }

  // Popular route cards: show the real distance, time and fare from the database
  function updateRouteCards(routes) {
    document.querySelectorAll('.route-card').forEach((card) => {
      const route = routes.find((r) => r.origin === card.dataset.origin && r.destination === card.dataset.destination);
      if (!route) return;
      const facts = card.querySelectorAll('.font-mono span');
      if (facts[0]) facts[0].textContent = `${route.distanceKm} km`;
      if (facts[1]) facts[1].textContent = route.estimatedDuration;
      const fare = card.querySelector('.badge');
      if (fare) fare.textContent = `UGX ${route.basePriceUGX.toLocaleString()}`;
    });
  }

  function populateSelect(selectEl, items, defaultValue) {
    if (!selectEl) return;
    selectEl.innerHTML = items.map((item) => `
      <option value="${item}" ${item === defaultValue ? 'selected' : ''}>${item}</option>
    `).join('');
  }

  // 2. Swap routes
  if (swapBtn && originSelect && destSelect) {
    swapBtn.addEventListener('click', () => {
      const temp = originSelect.value;
      originSelect.value = destSelect.value;
      destSelect.value = temp;
    });
  }

  // 3. Date stepper
  function stepDate(days) {
    if (!dateInput) return;
    const current = new Date(dateInput.value || today);
    current.setDate(current.getDate() + days);
    const newDateStr = current.toISOString().split('T')[0];
    if (newDateStr >= today) {
      dateInput.value = newDateStr;
    }
  }

  if (prevDayBtn) prevDayBtn.addEventListener('click', () => stepDate(-1));
  if (nextDayBtn) nextDayBtn.addEventListener('click', () => stepDate(1));

  // 4. Passenger Dropdown
  if (passengerBtn && passengerMenu) {
    passengerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      passengerMenu.style.display = passengerMenu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      passengerMenu.style.display = 'none';
    });

    passengerMenu.addEventListener('click', (e) => e.stopPropagation());
  }

  if (btnDecPass && btnIncPass && passengerNumSpan && passengerCountDisplay) {
    btnDecPass.addEventListener('click', () => {
      if (passengers > 1) {
        passengers--;
        updatePassengerUI();
      }
    });

    btnIncPass.addEventListener('click', () => {
      if (passengers < 6) {
        passengers++;
        updatePassengerUI();
      }
    });

    if (btnApplyPass) {
      btnApplyPass.addEventListener('click', () => {
        passengerMenu.style.display = 'none';
      });
    }
  }

  function updatePassengerUI() {
    if (passengerNumSpan) passengerNumSpan.textContent = passengers;
    if (passengerCountDisplay) passengerCountDisplay.textContent = `${passengers} Adult${passengers > 1 ? 's' : ''}`;
    if (btnDecPass) btnDecPass.disabled = passengers <= 1;
    if (btnIncPass) btnIncPass.disabled = passengers >= 6;
  }

  // 5. Search Form Submission
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const origin = originSelect?.value || 'Kampala';
      const destination = destSelect?.value || 'Mbarara';
      const date = dateInput?.value || today;

      if (origin === destination) {
        alert('Departure and destination cities cannot be the same. Please choose different cities.');
        return;
      }

      window.location.href = `search.html?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${encodeURIComponent(date)}&passengers=${passengers}`;
    });
  }

  // 6. Popular Route Card Click Handlers
  document.querySelectorAll('.route-card').forEach((card) => {
    card.addEventListener('click', () => {
      const origin = card.dataset.origin;
      const dest = card.dataset.destination;
      const date = dateInput?.value || today;
      window.location.href = `search.html?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&date=${encodeURIComponent(date)}&passengers=1`;
    });
  });

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});
