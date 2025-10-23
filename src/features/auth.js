// auth.js - Consolidated Authentication Controller
import { auth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from '../../firebase-setup.js';

export class AuthController {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
    this.provider = new GoogleAuthProvider();
    
    // Add scopes for better user info
    this.provider.addScope('profile');
    this.provider.addScope('email');
    
    console.log('🔐 AuthController initialized');
  }

  /**
   * Initialize authentication state listener
   */
  initialize() {
    onAuthStateChanged(auth, (user) => {
      console.log('🔐 Auth state changed:', user ? user.email : 'No user');
      this.currentUser = user;
      this.notifyAuthStateListeners(user);
      this.updateUI(user);
    });

    this.attachEventListeners();
  }

  /**
   * Attach event listeners to auth buttons
   */
  attachEventListeners() {
    // Google sign in buttons
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const googleSignupBtn = document.getElementById('googleSignupBtn');
    
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', () => this.signInWithGoogle());
    }
    
    if (googleSignupBtn) {
      googleSignupBtn.addEventListener('click', () => this.signInWithGoogle());
    }

    // Sign in button (landing page)
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) {
      signInBtn.addEventListener('click', () => this.signInWithGoogle());
    }

    // Sign out/logout buttons
    const signOutBtn = document.getElementById('signOutBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => this.signOutUser());
    }
    
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.signOutUser());
    }

    // Account button (landing page)
    const accountBtn = document.getElementById('accountBtn');
    if (accountBtn) {
      accountBtn.addEventListener('click', () => this.handleAccountClick());
    }

    console.log('🔐 Auth event listeners attached');
  }

  /**
   * Sign in with Google popup
   */
  async signInWithGoogle() {
    try {
      console.log('🔐 Initiating Google sign in...');
      
      const result = await signInWithPopup(auth, this.provider);
      const user = result.user;
      
      console.log('✅ Sign in successful:', user.email);
      
      // Show success message
      this.showMessage('Welcome, ' + user.displayName + '!', 'success');
      
      // Close auth modal if exists
      const authModal = document.getElementById('authModal');
      if (authModal) {
        authModal.classList.add('hidden');
      }
      
      // Redirect to tracker if on landing page
      if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
        setTimeout(() => {
          window.location.href = 'tracker.html';
        }, 1000);
      }
      
      return user;
    } catch (error) {
      console.error('❌ Sign in error:', error);
      this.handleAuthError(error);
      throw error;
    }
  }

  /**
   * Sign out current user
   */
  async signOutUser() {
    try {
      console.log('🔐 Signing out...');
      
      await signOut(auth);
      
      console.log('✅ Sign out successful');
      this.showMessage('Signed out successfully', 'success');
      
      // Redirect to landing page if on tracker
      if (window.location.pathname.includes('tracker.html')) {
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      }
      
    } catch (error) {
      console.error('❌ Sign out error:', error);
      this.showMessage('Failed to sign out: ' + error.message, 'error');
      throw error;
    }
  }

  /**
   * Handle account button click
   */
  handleAccountClick() {
    if (this.currentUser) {
      // User is signed in, go to tracker
      window.location.href = 'tracker.html';
    } else {
      // User is not signed in, show sign in
      this.signInWithGoogle();
    }
  }

  /**
   * Update UI based on auth state
   */
  updateUI(user) {
    // Update auth status bar (tracker page)
    const authStatusBar = document.getElementById('authStatusBar');
    const userInfo = document.getElementById('userInfo');
    const authPrompt = document.getElementById('authPrompt');
    const userEmail = document.getElementById('userEmail');
    
    if (authStatusBar && userInfo && authPrompt) {
      if (user) {
        // User is signed in
        userInfo.classList.remove('hidden');
        authPrompt.classList.add('hidden');
        
        if (userEmail) {
          userEmail.textContent = user.displayName || user.email;
        }
      } else {
        // User is not signed in
        userInfo.classList.add('hidden');
        authPrompt.classList.remove('hidden');
      }
    }

    // Update sign in button (landing page)
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) {
      if (user) {
        signInBtn.textContent = 'Go to Tracker';
        signInBtn.onclick = () => window.location.href = 'tracker.html';
      } else {
        signInBtn.textContent = 'Sign In with Google';
        signInBtn.onclick = () => this.signInWithGoogle();
      }
    }

    // Update account button (landing page)
    const accountBtn = document.getElementById('accountBtn');
    if (accountBtn && user) {
      accountBtn.textContent = user.displayName || user.email;
      accountBtn.title = user.email;
    }

    // Show/hide authenticated content
    const authContent = document.querySelectorAll('.auth-required');
    authContent.forEach(element => {
      element.style.display = user ? 'block' : 'none';
    });

    const noAuthContent = document.querySelectorAll('.no-auth-required');
    noAuthContent.forEach(element => {
      element.style.display = user ? 'none' : 'block';
    });
  }

  /**
   * Handle authentication errors
   */
  handleAuthError(error) {
    let message = 'Authentication failed';
    
    switch (error.code) {
      case 'auth/popup-closed-by-user':
        message = 'Sign in cancelled';
        break;
      case 'auth/popup-blocked':
        message = 'Please enable popups for this site';
        break;
      case 'auth/network-request-failed':
        message = 'Network error. Please check your connection';
        break;
      case 'auth/too-many-requests':
        message = 'Too many attempts. Please try again later';
        break;
      case 'auth/user-disabled':
        message = 'This account has been disabled';
        break;
      default:
        message = error.message || 'An error occurred during sign in';
    }
    
    this.showMessage(message, 'error');
  }

  /**
   * Show user message
   */
  showMessage(message, type = 'info') {
    // Try to use existing notification system
    if (window.showNotification) {
      window.showNotification(message, type);
      return;
    }

    // Fallback to console and alert
    if (type === 'error') {
      console.error('🔐 ' + message);
      alert(message);
    } else {
      console.log('🔐 ' + message);
    }
  }

  /**
   * Register auth state change listener
   */
  onAuthStateChange(callback) {
    this.authStateListeners.push(callback);
    
    // Immediately call with current state
    if (this.currentUser !== null) {
      callback(this.currentUser);
    }
  }

  /**
   * Notify all registered listeners
   */
  notifyAuthStateListeners(user) {
    this.authStateListeners.forEach(listener => {
      try {
        listener(user);
      } catch (error) {
        console.error('❌ Auth listener error:', error);
      }
    });
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.currentUser !== null;
  }

  /**
   * Get user ID
   */
  getUserId() {
    return this.currentUser?.uid || null;
  }

  /**
   * Get user email
   */
  getUserEmail() {
    return this.currentUser?.email || null;
  }

  /**
   * Get user display name
   */
  getUserDisplayName() {
    return this.currentUser?.displayName || this.currentUser?.email || 'User';
  }

  /**
   * Wait for auth to be ready
   */
  async waitForAuth() {
    return new Promise((resolve) => {
      if (this.currentUser !== null) {
        resolve(this.currentUser);
        return;
      }

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  /**
   * Require authentication (redirect if not signed in)
   */
  async requireAuth() {
    const user = await this.waitForAuth();
    
    if (!user) {
      console.log('🔐 Authentication required, redirecting...');
      this.showMessage('Please sign in to continue', 'info');
      
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
      
      return false;
    }
    
    return true;
  }
}

// Create singleton instance
export const authController = new AuthController();