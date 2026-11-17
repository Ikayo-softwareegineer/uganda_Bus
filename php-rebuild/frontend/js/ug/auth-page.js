/**
 * UG Express - Auth Page Controller (Vanilla JavaScript)
 */

import { Auth } from './auth.js';
import { renderLayout } from './navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  renderLayout();

  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect') || 'dashboard.html';

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const registerFields = document.getElementById('register-extra-fields');
  const authForm = document.getElementById('auth-form');
  const authErrorDisplay = document.getElementById('auth-error-msg');
  const submitBtn = document.getElementById('auth-submit-btn');

  let isLogin = true;

  function setMode(loginMode) {
    isLogin = loginMode;
    if (authErrorDisplay) authErrorDisplay.style.display = 'none';

    if (isLogin) {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      if (registerFields) registerFields.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Sign In';
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      if (registerFields) registerFields.style.display = 'block';
      if (submitBtn) submitBtn.textContent = 'Create Account';
    }
  }

  if (tabLogin) tabLogin.addEventListener('click', () => setMode(true));
  if (tabRegister) tabRegister.addEventListener('click', () => setMode(false));
  if (urlParams.get('mode') === 'register') setMode(false); // links to the old register.html land here

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (authErrorDisplay) authErrorDisplay.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
      }

      const email = document.getElementById('auth-email')?.value.trim();
      const password = document.getElementById('auth-password')?.value;
      const name = document.getElementById('auth-name')?.value.trim();
      const phone = document.getElementById('auth-phone')?.value.trim();

      try {
        if (isLogin) {
          await Auth.login(email, password);
        } else {
          await Auth.register({ name, email, phone, password });
        }
        window.location.href = getRedirectDestination();
      } catch (err) {
        console.error(err);
        if (authErrorDisplay) {
          authErrorDisplay.textContent = err.response?.data?.error || err.response?.data?.message || err.message || 'Authentication failed.';
          authErrorDisplay.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isLogin ? 'Sign In' : 'Create Account';
        }
      }
    });
  }

  function getRedirectDestination() {
    const explicit = urlParams.get('redirect');
    if (explicit) return explicit;
    const user = Auth.getUser();
    if (user?.role === 'STAFF') return 'staff.html';
    if (user?.role === 'ADMIN') return 'admin.html';
    return 'dashboard.html';
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});
