/**
 * UG Express - Auth & Session Manager (Vanilla JavaScript)
 */

import { authAPI } from './api.js';

let currentUser = null;
let authToken = localStorage.getItem('ug_travel_token') || localStorage.getItem('must_travel_token') || null;

// Try to parse cached user for immediate rendering
try {
  const cached = localStorage.getItem('ug_travel_user') || localStorage.getItem('must_travel_user');
  if (cached) currentUser = JSON.parse(cached);
} catch (e) {
  // ignore
}

export const Auth = {
  getUser() {
    return currentUser;
  },

  getToken() {
    return authToken;
  },

  isLoggedIn() {
    return !!authToken && !!currentUser;
  },

  async init() {
    if (!authToken) {
      currentUser = null;
      localStorage.removeItem('ug_travel_user');
      localStorage.removeItem('must_travel_user');
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
      return null;
    }

    try {
      const res = await authAPI.getMe();
      if (res.data.success && res.data.user) {
        currentUser = res.data.user;
        localStorage.setItem('ug_travel_user', JSON.stringify(currentUser));
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: currentUser } }));
        return currentUser;
      } else {
        this.logout();
        return null;
      }
    } catch (err) {
      console.warn('Session check failed, logging out:', err);
      this.logout();
      return null;
    }
  },

  async login(email, password) {
    const res = await authAPI.login(email, password);
    if (res.data.success) {
      authToken = res.data.token;
      currentUser = res.data.user;
      localStorage.setItem('ug_travel_token', authToken);
      localStorage.setItem('ug_travel_user', JSON.stringify(currentUser));
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: currentUser } }));
      return currentUser;
    }
    throw new Error(res.data.message || 'Login failed');
  },

  async register(data) {
    const res = await authAPI.register(data);
    if (res.data.success) {
      authToken = res.data.token;
      currentUser = res.data.user;
      localStorage.setItem('ug_travel_token', authToken);
      localStorage.setItem('ug_travel_user', JSON.stringify(currentUser));
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: currentUser } }));
      return currentUser;
    }
    throw new Error(res.data.message || 'Registration failed');
  },

  logout() {
    authAPI.logout(); // ends the PHP session on the server
    authToken = null;
    currentUser = null;
    localStorage.removeItem('ug_travel_token');
    localStorage.removeItem('ug_travel_user');
    localStorage.removeItem('must_travel_token');
    localStorage.removeItem('must_travel_user');
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));

    // If on protected page, redirect
    const path = window.location.pathname;
    if (path.includes('dashboard') || path.includes('staff') || path.includes('admin')) {
      window.location.href = 'auth.html';
    }
  },

  requireRole(allowedRoles = []) {
    if (!this.isLoggedIn()) {
      window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return false;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
      alert(`Access denied. This portal requires one of: ${allowedRoles.join(', ')}`);
      window.location.href = currentUser.role === 'STAFF' ? 'staff.html' : currentUser.role === 'ADMIN' ? 'admin.html' : 'index.html';
      return false;
    }
    return true;
  }
};

// Expose globally
window.Auth = Auth;
