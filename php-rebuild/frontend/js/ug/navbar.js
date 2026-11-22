
/**
 * UG Express - Navbar & Footer Reusable UI (Vanilla JavaScript)
 */

import { Auth } from './auth.js';

export function renderLayout() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  // Remove demo bar container if present
  const demoBarEl = document.getElementById('demo-bar-container');
  if (demoBarEl) {
    demoBarEl.remove();
  }

  // 1. Render Standard Navbar
  const navbarEl = document.getElementById('navbar-container');
  if (navbarEl) {
    const user = Auth.getUser();

    navbarEl.innerHTML = `
      <nav class="navbar">
        <div class="container navbar-inner">

          <!-- Brand Logo -->
          <a href="index.html" class="brand-logo">
            <div class="brand-icon">
              <i data-lucide="bus" style="width: 1.25rem; height: 1.25rem; stroke-width: 2.5;"></i>
            </div>
            <div>
              <div class="brand-title">UG<span> Express</span></div>
              <div class="brand-subtitle">Uganda Intercity Bus Network</div>
            </div>
          </a>

          <!-- Desktop Nav Links -->
          <div class="nav-links">
            <a href="index.html" class="nav-link ${currentPath === 'index.html' || currentPath === '' ? 'active' : ''}">
              Plan Your Journey
            </a>

            <a href="schedules.html" class="nav-link ${currentPath === 'schedules.html' ? 'active' : ''}">
              <i data-lucide="calendar" style="width: 14px; height: 14px;"></i> Bus Schedules
            </a>

            <!-- Services dropdown -->
            <div style="position: relative;">
              <button type="button" id="services-dropdown-btn" class="nav-link">
                <span>Services</span>
                <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>
              </button>

              <div id="services-menu" style="display: none; position: absolute; top: 100%; left: 0; width: 280px; background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1rem; box-shadow: var(--shadow-xl); z-index: 70; margin-top: 0.5rem;">

                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; font-family: var(--font-mono);">
                  Onboard Comfort & Support
                </div>

                <div class="flex items-center gap-3 p-2 rounded-xl" style="padding: 0.5rem; border-radius: 0.5rem;">
                  <i data-lucide="wifi" style="color: #000000; width: 1.1rem; height: 1.1rem;"></i>
                  <div>
                    <div style="font-weight: 700; font-size: 12px;">High-Speed Wi-Fi</div>
                    <div style="font-size: 10px; color: var(--text-muted);">Free 4G Wi-Fi on all coaches</div>
                  </div>
                </div>

                <div class="flex items-center gap-3 p-2 rounded-xl" style="padding: 0.5rem; border-radius: 0.5rem;">
                  <i data-lucide="luggage" style="color: #000000; width: 1.1rem; height: 1.1rem;"></i>
                  <div>
                    <div style="font-weight: 700; font-size: 12px;">Luggage Allowance</div>
                    <div style="font-size: 10px; color: var(--text-muted);">20kg free hold baggage per traveler</div>
                  </div>
                </div>

                <div class="flex items-center gap-3 p-2 rounded-xl" style="padding: 0.5rem; border-radius: 0.5rem;">
                  <i data-lucide="shield-check" style="color: #000000; width: 1.1rem; height: 1.1rem;"></i>
                  <div>
                    <div style="font-weight: 700; font-size: 12px;">Verified Security</div>
                    <div style="font-size: 10px; color: var(--text-muted);">QR e-Ticket boarding validation</div>
                  </div>
                </div>
              </div>
            </div>

            ${user && user.role === 'CUSTOMER' ? `
              <a href="dashboard.html" class="nav-link ${currentPath === 'dashboard.html' ? 'active' : ''}">
                My Bookings
              </a>
            ` : ''}

            ${user && (user.role === 'STAFF' || user.role === 'ADMIN') ? `
              <a href="staff.html" class="nav-link ${currentPath === 'staff.html' ? 'active' : ''}">
                <i data-lucide="scan-line" style="width: 14px; height: 14px;"></i> Staff Portal
              </a>
            ` : ''}

            ${user && user.role === 'ADMIN' ? `
              <a href="admin.html" class="nav-link">
                <i data-lucide="layout-dashboard" style="width: 14px; height: 14px;"></i> Admin
              </a>
            ` : ''}
          </div>

          <!-- Auth Actions -->
          <div class="nav-actions">
            ${user ? `
              <div class="flex items-center gap-2">
                <a href="dashboard.html" class="nav-link" style="font-size: 12px; font-weight: 700;">
                  <i data-lucide="user" style="width: 13px; height: 13px;"></i> ${user.name.split(' ')[0]}
                </a>

                <button type="button" id="nav-logout-btn" class="btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 11px;">
                  Logout
                </button>
              </div>
            ` : `
              <a href="auth.html" class="signin-btn">
                <i data-lucide="log-in"></i>
                <span>Sign In</span>
              </a>
            `}

            <!-- Mobile Hamburger -->
            <button type="button" id="mobile-menu-btn" class="mobile-toggle" aria-label="Toggle menu">
              <i data-lucide="menu" style="width: 1.25rem; height: 1.25rem;"></i>
            </button>
          </div>
        </div>

        <!-- Mobile Drawer Menu -->
        <div id="mobile-menu" class="mobile-nav">
          <a href="index.html" class="nav-link ${currentPath === 'index.html' ? 'active' : ''}">
            Plan Your Journey
          </a>

          <a href="schedules.html" class="nav-link ${currentPath === 'schedules.html' ? 'active' : ''}">
            Bus Schedules
          </a>

          ${user && user.role === 'CUSTOMER' ? `
            <a href="dashboard.html" class="nav-link ${currentPath === 'dashboard.html' ? 'active' : ''}">
              My Bookings
            </a>
          ` : ''}

          ${user && (user.role === 'STAFF' || user.role === 'ADMIN') ? `
            <a href="staff.html" class="nav-link ${currentPath === 'staff.html' ? 'active' : ''}">
              Staff Portal
            </a>
          ` : ''}

          ${user && user.role === 'ADMIN' ? `
            <a href="admin.html" class="nav-link">
              Admin
            </a>
          ` : ''}

          ${!user ? `
            <a href="auth.html" class="mobile-signin-btn">
              <i data-lucide="log-in"></i>
              <span>Sign In / Register</span>
            </a>
          ` : `
            <button type="button" id="mobile-logout-btn" class="btn-secondary" style="margin-top: 0.5rem; width: 100%;">
              Sign Out (${user.name})
            </button>
          `}
        </div>
      </nav>
    `;

    // Services Dropdown
    const servicesBtn = navbarEl.querySelector('#services-dropdown-btn');
    const servicesMenu = navbarEl.querySelector('#services-menu');

    if (servicesBtn && servicesMenu) {
      servicesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        servicesMenu.style.display =
          servicesMenu.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', () => {
        servicesMenu.style.display = 'none';
      });
    }

    // Mobile Menu Toggle
    const mobileBtn = navbarEl.querySelector('#mobile-menu-btn');
    const mobileMenu = navbarEl.querySelector('#mobile-menu');

    if (mobileBtn && mobileMenu) {
      mobileBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('open');
      });
    }

    // Logout
    const logoutBtn = navbarEl.querySelector('#nav-logout-btn');

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        Auth.logout();
        window.location.href = 'index.html';
      });
    }

    const mobileLogoutBtn = navbarEl.querySelector('#mobile-logout-btn');

    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener('click', () => {
        Auth.logout();
        window.location.href = 'index.html';
      });
    }
  }

  // 3. Render Footer
  const footerEl = document.getElementById('footer-container');

  if (footerEl) {
    footerEl.innerHTML = `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">

            <div style="space-y: 0.75rem;">
              <a href="index.html" class="brand-logo" style="text-decoration: none; display: inline-flex; align-items: center; gap: 0.6rem; margin-bottom: 0.25rem;">
                <div class="brand-icon" style="width: 2.25rem; height: 2.25rem; border-radius: 0.75rem; background: var(--must-navy); color: #ffffff; display: flex; align-items: center; justify-content: center;">
                  <i data-lucide="bus" style="width: 1.25rem; height: 1.25rem; stroke-width: 2.5; color: #ffffff;"></i>
                </div>

                <div>
                  <div class="brand-title" style="color: #000000; font-family: var(--font-mono); font-weight: 700; font-size: 1.15rem; line-height: 1;">
                    UG<span style="color: var(--must-navy);"> Express</span>
                  </div>

                  <div class="brand-subtitle" style="font-size: 9px; color: #000000; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">
                    Uganda Intercity Bus Network
                  </div>
                </div>
              </a>

              <p style="font-size: 12px; color: #000000; margin-top: 0.5rem; line-height: 1.6;">
                Uganda Official Intercity Digital Coach Travel Reservation Network. Safe, reliable, and digital travel across Uganda.
              </p>
            </div>

            <div>
              <h4 style="font-weight: 700; color: #000000; font-size: 12px; text-transform: uppercase; margin-bottom: 0.75rem; font-family: var(--font-mono);">
                Quick Links
              </h4>

              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.4rem; font-size: 12px;">
                <li><a href="index.html" style="color: #000000;">Search Buses</a></li>
                <li><a href="dashboard.html" style="color: #000000;">Manage Bookings</a></li>
                <li><a href="auth.html" style="color: #000000;">Sign In</a></li>
              </ul>
            </div>

            <div>
              <h4 style="font-weight: 700; color: #000000; font-size: 12px; text-transform: uppercase; margin-bottom: 0.75rem; font-family: var(--font-mono);">
                Popular Routes
              </h4>

              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.4rem; font-size: 12px;">
                <li><a href="search.html?origin=Kampala&destination=Mbarara" style="color: #000000;">Kampala ↔ Mbarara</a></li>
                <li><a href="search.html?origin=Kampala&destination=Kabale" style="color: #000000;">Kampala ↔ Kabale</a></li>
                <li><a href="search.html?origin=Kampala&destination=Fort Portal" style="color: #000000;">Kampala ↔ Fort Portal</a></li>
                <li><a href="search.html?origin=Kampala&destination=Gulu" style="color: #000000;">Kampala ↔ Gulu</a></li>
              </ul>
            </div>

            <div>
              <h4 style="font-weight: 700; color: #000000; font-size: 12px; text-transform: uppercase; margin-bottom: 0.75rem; font-family: var(--font-mono);">
                Support & Emergency
              </h4>

              <p style="font-size: 12px; color: #000000; line-height: 1.6;">
                Central Bus Terminal, Kampala, Uganda<br>
                Hotline: +256 (0) 414 123 456<br>
                Email: support@travel.ug
              </p>
            </div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 1.5rem; display: flex; flex-direction: column; sm:flex-direction: row; justify-content: space-between; align-items: center; gap: 1rem; font-size: 11px; color: #000000;">
            <div style="color: #000000;">© 2026 UG Express Travel Booking System. All Rights Reserved.</div>

            <div class="flex items-center gap-4">
              <span style="color: #000000;">National Intercity Transit Service</span>
            </div>
          </div>
        </div>
      </footer>
    `;
  }

  // Initialize Lucide Icons
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Listen for auth changes and re-render header
window.addEventListener('auth-changed', () => {
  renderLayout();
});
