// Authentication controller with beautiful UI
import { auth, db } from '../../firebase-setup.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

export class AuthController {
  constructor() {
    this.currentUser = null;
    this.isInitialized = false;
    this.isSavingToCloud = false;     // Add this line
    this.isSelectingRoute = false;    // Add this line
    this.callbacks = {
      onLogin: [],
      onLogout: []
    };
  }

  async initialize() {
  if (this.isInitialized) return;

  try {
    console.log('🔥 Auth controller starting...');
    
    this.setupEventListeners();
    this.setupAuthStateListener();
    this.adjustLayoutForAuth();
    
    // Force setup buttons
    this.forceSetupButtons();
    
    this.isInitialized = true;
    console.log('🔥 Auth controller initialized');
    
  } catch (error) {
    console.error('❌ Auth initialization failed:', error);
  }
}

setupEventListeners() {
  console.log('🔧 Setting up auth event listeners...');
  
  // Show auth modal button
  const showAuthBtn = document.getElementById('showAuthBtn');
  if (showAuthBtn) {
    showAuthBtn.addEventListener('click', () => this.showAuthModal());
  }

  // Login form
  const loginForm = document.querySelector('#loginForm form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => this.handleLogin(e));
  }

  // Signup form
  const signupForm = document.querySelector('#signupForm form');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => this.handleSignup(e));
  }

  // Google login buttons
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const googleSignupBtn = document.getElementById('googleSignupBtn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => this.handleGoogleAuth());
  }
  if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', () => this.handleGoogleAuth());
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => this.handleLogout());
  }

  // Cloud buttons - set up immediately and with retry
  this.setupCloudButtonsWithRetry();

  // Make global functions available
  window.showAuthModal = () => this.showAuthModal();
  window.closeAuthModal = () => this.closeAuthModal();
  window.switchToLogin = () => this.switchToLogin();
  window.switchToSignup = () => this.switchToSignup();
  
  console.log('✅ Auth event listeners setup complete');
}

// NEW: Setup cloud buttons with retry mechanism
setupCloudButtonsWithRetry() {
  const setupAttempt = (attempt = 1) => {
    console.log(`🔧 Setting up cloud buttons (attempt ${attempt})...`);
    
    const buttons = [
      { id: 'saveToCloudBtn', handler: () => this.saveCurrentRouteToCloud(), label: 'Save to Cloud' },
      { id: 'loadCloudRoutesBtn', handler: () => this.loadUserRoutes(), label: 'Load Cloud Routes' },
      { id: 'loadMyGuidesBtn', handler: () => this.loadMyTrailGuides(), label: 'Load My Guides' }
    ];

    let successCount = 0;
    
    buttons.forEach(({ id, handler, label }) => {
      const button = document.getElementById(id);
      if (button) {
        // Check if already has event listener
        const hasListener = button.onclick || Object.keys(getEventListeners(button)).length > 0;
        
        if (!hasListener) {
          button.addEventListener('click', (e) => {
            console.log(`📱 ${label} clicked`);
            e.preventDefault();
            e.stopPropagation();
            handler();
          });
          
          console.log(`✅ ${label} button setup complete`);
          successCount++;
        } else {
          console.log(`ℹ️ ${label} button already has event listener`);
          successCount++;
        }
      } else {
        console.warn(`⚠️ ${label} button not found (${id})`);
      }
    });
    
    // If not all buttons were found, retry up to 3 times
    if (successCount < buttons.length && attempt < 3) {
      console.log(`🔄 Only ${successCount}/${buttons.length} buttons found, retrying...`);
      setTimeout(() => setupAttempt(attempt + 1), 1000);
    } else {
      console.log(`🎯 Cloud buttons setup complete: ${successCount}/${buttons.length} buttons found`);
    }
  };
  
  // Start setup immediately
  setupAttempt();
  
  // Also setup with delay in case DOM isn't ready
  setTimeout(() => setupAttempt(), 1000);
  setTimeout(() => setupAttempt(), 3000);
}

  setupAuthStateListener() {
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      this.updateUI(user);
      
      if (user) {
        console.log('✅ User signed in:', user.email);
        this.executeCallbacks('onLogin', user);
        this.showCloudSyncIndicator('Connected to cloud');
      } else {
        console.log('👋 User signed out');
        this.executeCallbacks('onLogout');
      }
    });
  }

  adjustLayoutForAuth() {
    // Adjust top-bar position to account for auth status bar
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
      topBar.style.top = '45px'; // Account for auth status bar height
    }
  }

  async handleLogin(event) {
    event.preventDefault();
    
    const loginBtn = document.getElementById('loginBtn');
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    
    if (!emailInput.value || !passwordInput.value) {
      this.showAuthError('Please fill in all fields');
      return;
    }

    try {
      this.setButtonLoading(loginBtn, true);
      
      const userCredential = await signInWithEmailAndPassword(
        auth, 
        emailInput.value, 
        passwordInput.value
      );
      
      console.log('✅ Login successful:', userCredential.user.email);
      this.closeAuthModal();
      this.showSuccessMessage('Welcome back! 🎉');
      
    } catch (error) {
      console.error('❌ Login failed:', error);
      this.showAuthError(this.getFriendlyErrorMessage(error.code));
    } finally {
      this.setButtonLoading(loginBtn, false);
    }
  }

  async handleSignup(event) {
    event.preventDefault();
    
    const signupBtn = document.getElementById('signupBtn');
    const nameInput = document.getElementById('signupName');
    const emailInput = document.getElementById('signupEmail');
    const passwordInput = document.getElementById('signupPassword');
    
    if (!nameInput.value || !emailInput.value || !passwordInput.value) {
      this.showAuthError('Please fill in all fields');
      return;
    }

    if (passwordInput.value.length < 6) {
      this.showAuthError('Password must be at least 6 characters');
      return;
    }

    try {
      this.setButtonLoading(signupBtn, true);
      
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        emailInput.value, 
        passwordInput.value
      );
      
      const user = userCredential.user;
      
      // Save user profile to Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        name: nameInput.value,
        createdAt: new Date().toISOString(),
        routesCount: 0,
        totalDistance: 0
      });
      
      console.log('✅ Signup successful:', user.email);
      this.closeAuthModal();
      this.showSuccessMessage('Account created successfully! Welcome to Access Nature! 🌲');
      
    } catch (error) {
      console.error('❌ Signup failed:', error);
      this.showAuthError(this.getFriendlyErrorMessage(error.code));
    } finally {
      this.setButtonLoading(signupBtn, false);
    }
  }

  async handleGoogleAuth() {
    try {
      this.showCloudSyncIndicator('Connecting to Google...');
      
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if this is a new user and save profile
      if (result._tokenResponse?.isNewUser) {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          name: user.displayName || 'Google User',
          createdAt: new Date().toISOString(),
          routesCount: 0,
          totalDistance: 0,
          provider: 'google'
        });
      }
      
      console.log('✅ Google sign-in successful:', user.email);
      this.closeAuthModal();
      this.showSuccessMessage('Successfully connected with Google! 🎉');
      
    } catch (error) {
      console.error('❌ Google sign-in failed:', error);
      
      if (error.code === 'auth/popup-closed-by-user') {
        this.showAuthError('Sign-in was cancelled');
      } else {
        this.showAuthError('Google sign-in failed. Please try again.');
      }
    }
  }

  async handleLogout() {
    try {
      const confirmed = confirm('Are you sure you want to sign out?');
      if (!confirmed) return;

      await signOut(auth);
      console.log('👋 Logout successful');
      this.showSuccessMessage('See you next time! 👋');
      
    } catch (error) {
      console.error('❌ Logout failed:', error);
      this.showAuthError('Logout failed. Please try again.');
    }
  }

  // UI Management Methods
  updateUI(user) {
    const userInfo = document.getElementById('userInfo');
    const authPrompt = document.getElementById('authPrompt');
    const userEmail = document.getElementById('userEmail');
    const cloudButtons = document.querySelectorAll('.cloud-save-btn, .cloud-load-btn');

    if (user) {
      // Show user info
      userInfo?.classList.remove('hidden');
      authPrompt?.classList.add('hidden');
      if (userEmail) userEmail.textContent = user.email;

      // Enable cloud features
      cloudButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
      });

    } else {
      // Show login prompt
      userInfo?.classList.add('hidden');
      authPrompt?.classList.remove('hidden');

      // Disable cloud features
      cloudButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
      });
    }
  }

  showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.remove('hidden');
      this.switchToLogin(); // Default to login
    }
  }

  closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.add('hidden');
      this.clearAuthForms();
    }
  }

  switchToLogin() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const title = document.getElementById('authModalTitle');

    loginForm?.classList.add('active');
    signupForm?.classList.remove('active');
    
    if (title) title.textContent = 'Welcome Back!';
  }

  switchToSignup() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const title = document.getElementById('authModalTitle');

    signupForm?.classList.add('active');
    loginForm?.classList.remove('active');
    
    if (title) title.textContent = 'Join Access Nature';
  }

  clearAuthForms() {
    // Clear all form inputs
    const inputs = document.querySelectorAll('#authModal input');
    inputs.forEach(input => input.value = '');
    
    // Clear any error messages
    this.clearAuthError();
  }

  setButtonLoading(button, loading) {
    if (!button) return;

    const textSpan = button.querySelector('.btn-text');
    const spinnerSpan = button.querySelector('.btn-spinner');

    if (loading) {
      button.disabled = true;
      textSpan?.classList.add('hidden');
      spinnerSpan?.classList.remove('hidden');
    } else {
      button.disabled = false;
      textSpan?.classList.remove('hidden');
      spinnerSpan?.classList.add('hidden');
    }
  }

  showAuthError(message) {
    // Remove existing error if any
    this.clearAuthError();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'auth-error';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      background: #ffebee;
      color: #c62828;
      padding: 12px 20px;
      border-radius: 8px;
      margin: 15px 0;
      font-size: 14px;
      border: 1px solid #ffcdd2;
      animation: slideIn 0.3s ease;
    `;

    const activeForm = document.querySelector('.auth-form.active');
    if (activeForm) {
      activeForm.insertBefore(errorDiv, activeForm.firstChild);
    }

    // Auto-remove after 5 seconds
    setTimeout(() => this.clearAuthError(), 5000);
  }

  clearAuthError() {
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
      existingError.remove();
    }
  }

  showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.textContent = message;
    successDiv.style.cssText = `
      position: fixed;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: white;
      padding: 12px 24px;
      border-radius: 25px;
      z-index: 9999;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(76, 175, 80, 0.4);
      animation: slideDown 0.3s ease;
    `;

    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 4000);
  }

  showCloudSyncIndicator(message) {
    const indicator = document.getElementById('cloudSyncIndicator');
    const textElement = indicator?.querySelector('.sync-text');
    
    if (indicator && textElement) {
      textElement.textContent = message;
      indicator.classList.remove('hidden');
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        indicator.classList.add('hidden');
      }, 3000);
    }
  }

  getFriendlyErrorMessage(errorCode) {
    const errorMessages = {
      'auth/user-not-found': 'No account found with this email address',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/invalid-email': 'Please enter a valid email address',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later',
      'auth/network-request-failed': 'Network error. Please check your connection'
    };

    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
  }

  // Cloud functionality methods
// FIXED: Cloud save functionality - handles both current and saved routes
// UPDATED: Simplified cloud save for auth controller (legacy route selection)
async saveCurrentRouteToCloud() {
  if (!this.currentUser) {
    this.showAuthError('Please sign in to save routes to cloud');
    return;
  }

  // This method now handles saved route selection only
  const app = window.AccessNatureApp;
  const state = app?.getController('state');
  const savedSessions = state?.getSessions();
  
  if (!savedSessions || savedSessions.length === 0) {
    alert('❌ No saved routes available to upload to cloud.\n\n💡 To save routes to cloud:\n• Start tracking and record a route\n• The route will be automatically saved to cloud after local save');
    return;
  }
  
  // Let user select from saved routes
  const selectedRoute = this.selectRouteForCloudSave(savedSessions);
  if (!selectedRoute) return;
  
  try {
    this.showCloudSyncIndicator('Uploading saved route to cloud...');
    
    // Use the tracking controller's cloud save method
    const trackingController = app?.getController('tracking');
    if (trackingController && typeof trackingController.saveRouteToCloud === 'function') {
      await trackingController.saveRouteToCloud(
        selectedRoute.data,
        selectedRoute,
        null, // No accessibility data for old routes
        this
      );
    } else {
      throw new Error('Tracking controller not available');
    }
    
  } catch (error) {
    console.error('❌ Failed to upload saved route:', error);
    this.showAuthError('Failed to upload route: ' + error.message);
  }
}

// NEW: Let user select which saved route to upload to cloud
// FIXED: Route selection with proper event handling
selectRouteForCloudSave(sessions) {
  if (!sessions || sessions.length === 0) return null;
  
  // Prevent multiple rapid calls
  if (this.isSelectingRoute) {
    console.log('⏳ Route selection already in progress...');
    return null;
  }
  
  this.isSelectingRoute = true;
  
  try {
    let message = '☁️ Select a route to save to cloud:\n\n';
    sessions.forEach((session, index) => {
      const date = new Date(session.date).toLocaleDateString();
      const time = new Date(session.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const distance = session.totalDistance ? `${session.totalDistance.toFixed(2)} km` : '0 km';
      const points = session.data ? session.data.length : 0;
      
      message += `${index + 1}. ${session.name}\n`;
      message += `   📅 ${date} ${time} | 📏 ${distance} | 📍 ${points} points\n\n`;
    });

    message += `Enter route number (1-${sessions.length}) or 0 to cancel:`;
    
    const choice = prompt(message);
    
    // Handle cancellation
    if (choice === null || choice === '0' || choice === '') {
      console.log('Route selection cancelled');
      return null;
    }
    
    const choiceNum = parseInt(choice);
    
    if (choiceNum >= 1 && choiceNum <= sessions.length) {
      const selectedRoute = sessions[choiceNum - 1];
      console.log('✅ Route selected:', selectedRoute.name);
      return selectedRoute;
    } else {
      alert('❌ Invalid selection. Please try again.');
      return null;
    }
    
  } finally {
    // Always reset the flag
    setTimeout(() => {
      this.isSelectingRoute = false;
    }, 1000);
  }
}

// UPDATED: Enhanced cloud save with better state management
async saveCurrentRouteToCloud() {
  // Prevent multiple simultaneous saves
  if (this.isSavingToCloud) {
    console.log('⏳ Cloud save already in progress...');
    this.showCloudSyncIndicator('Save already in progress...');
    return;
  }

  if (!this.currentUser) {
    this.showAuthError('Please sign in to save routes to cloud');
    return;
  }

  this.isSavingToCloud = true;

  try {
    const app = window.AccessNatureApp;
    const state = app?.getController('state');
    
    // Check for current route data first
    let routeDataToSave = state?.getRouteData();
    let routeInfo = null;
    
    if (!routeDataToSave || routeDataToSave.length === 0) {
      // No current route data, let user choose from saved routes
      const savedSessions = state?.getSessions();
      
      if (!savedSessions || savedSessions.length === 0) {
        alert('❌ No route data available to save to cloud.\n\n💡 To save routes to cloud:\n• Start tracking and record a route, OR\n• Save a route locally first, then upload it to cloud');
        return;
      }
      
      console.log('📂 No current route data, showing saved routes...');
      
      // Let user select from saved routes
      const selectedRoute = this.selectRouteForCloudSave(savedSessions);
      if (!selectedRoute) {
        console.log('No route selected, cancelling cloud save');
        return;
      }
      
      routeDataToSave = selectedRoute.data;
      routeInfo = selectedRoute;
      
      console.log('✅ Selected route for cloud save:', selectedRoute.name);
    } else {
      // Use current route data
      console.log('📍 Using current route data for cloud save');
      
      const routeName = prompt('Enter a name for this route:');
      if (!routeName) {
        console.log('No route name provided, cancelling save');
        return;
      }
      
      routeInfo = {
        name: routeName.trim(),
        totalDistance: state?.getTotalDistance() || 0,
        elapsedTime: state?.getElapsedTime() || 0,
        date: new Date().toISOString()
      };
    }

    if (!routeDataToSave || routeDataToSave.length === 0) {
      alert('❌ No valid route data to save to cloud');
      return;
    }

    // Show saving indicator
    this.showCloudSyncIndicator('Saving route to cloud...');
    console.log('☁️ Starting cloud save process for:', routeInfo.name);
    
    // Get accessibility data if available
    let accessibilityData = null;
    try {
      const storedAccessibilityData = localStorage.getItem('accessibilityData');
      accessibilityData = storedAccessibilityData ? JSON.parse(storedAccessibilityData) : null;
    } catch (error) {
      console.warn('Could not load accessibility data:', error);
    }

    // Prepare route document for Firestore
    const routeDoc = {
      userId: this.currentUser.uid,
      userEmail: this.currentUser.email,
      routeName: routeInfo.name,
      createdAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      
      // Route statistics
      totalDistance: routeInfo.totalDistance || 0,
      elapsedTime: routeInfo.elapsedTime || 0,
      originalDate: routeInfo.date,
      
      // Route data
      routeData: routeDataToSave,
      
      // Statistics for quick access
      stats: {
        locationPoints: routeDataToSave.filter(p => p.type === 'location').length,
        photos: routeDataToSave.filter(p => p.type === 'photo').length,
        notes: routeDataToSave.filter(p => p.type === 'text').length,
        totalDataPoints: routeDataToSave.length
      },
      
      // Accessibility information
      accessibilityData: accessibilityData,
      
      // Technical info
      deviceInfo: {
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        appVersion: '1.0'
      }
    };

    console.log('📤 Uploading route document to Firestore...');

    // Import Firestore functions and save
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const docRef = await addDoc(collection(db, 'routes'), routeDoc);
    
    console.log('✅ Route saved to cloud successfully with ID:', docRef.id);
    this.showSuccessMessage(`✅ "${routeInfo.name}" saved to cloud successfully! ☁️`);
    
    // Update user stats (optional)
    await this.updateUserStats();
    
  } catch (error) {
    console.error('❌ Failed to save route to cloud:', error);
    
    // More specific error messages
    if (error.code === 'permission-denied') {
      this.showAuthError('Permission denied. Please check your Firestore security rules.');
    } else if (error.code === 'quota-exceeded') {
      this.showAuthError('Storage quota exceeded. Please contact support.');
    } else if (error.name === 'FirebaseError') {
      this.showAuthError('Firebase error: ' + error.message);
    } else {
      this.showAuthError('Failed to save route to cloud: ' + error.message);
    }
  } finally {
    // Always reset the saving flag
    this.isSavingToCloud = false;
    
    // Hide sync indicator after a delay
    setTimeout(() => {
      const indicator = document.getElementById('cloudSyncIndicator');
      if (indicator) {
        indicator.classList.add('hidden');
      }
    }, 2000);
  }
}

// UPDATED: Better event listener setup with debouncing
setupEventListeners() {
  // Show auth modal button
  const showAuthBtn = document.getElementById('showAuthBtn');
  if (showAuthBtn) {
    showAuthBtn.addEventListener('click', () => this.showAuthModal());
  }

  // Login form
  const loginForm = document.querySelector('#loginForm form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => this.handleLogin(e));
  }

  // Signup form
  const signupForm = document.querySelector('#signupForm form');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => this.handleSignup(e));
  }

  // Google login buttons
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const googleSignupBtn = document.getElementById('googleSignupBtn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => this.handleGoogleAuth());
  }
  if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', () => this.handleGoogleAuth());
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => this.handleLogout());
  }

  // Cloud save/load buttons with debouncing
  const saveToCloudBtn = document.getElementById('saveToCloudBtn');
  const loadCloudRoutesBtn = document.getElementById('loadCloudRoutesBtn');
  
  if (saveToCloudBtn) {
    // Remove any existing listeners
    const newSaveBtn = saveToCloudBtn.cloneNode(true);
    saveToCloudBtn.parentNode.replaceChild(newSaveBtn, saveToCloudBtn);
    
    // Add single event listener with debouncing
    newSaveBtn.addEventListener('click', this.debounce(() => {
      console.log('☁️ Cloud save button clicked');
      this.saveCurrentRouteToCloud();
    }, 1000)); // 1 second debounce
  }
  
  if (loadCloudRoutesBtn) {
    // Remove any existing listeners
    const newLoadBtn = loadCloudRoutesBtn.cloneNode(true);
    loadCloudRoutesBtn.parentNode.replaceChild(newLoadBtn, loadCloudRoutesBtn);
    
    // Add single event listener with debouncing
    newLoadBtn.addEventListener('click', this.debounce(() => {
      console.log('📂 Load cloud routes button clicked');
      this.loadUserRoutes();
    }, 1000)); // 1 second debounce
  }

  // Make global functions available
  window.showAuthModal = () => this.showAuthModal();
  window.closeAuthModal = () => this.closeAuthModal();
  window.switchToLogin = () => this.switchToLogin();
  window.switchToSignup = () => this.switchToSignup();
}

// NEW: Debounce utility function
debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}


// UPDATED: Enhanced route loading with better feedback
async loadUserRoutes() {
  if (!this.currentUser) {
    this.showAuthError('Please sign in to load your routes');
    return;
  }

  try {
    this.showCloudSyncIndicator('Loading your cloud routes...');

    // Import Firestore functions
    const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const routesQuery = query(
      collection(db, 'routes'),
      where('userId', '==', this.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(routesQuery);
    const routes = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      routes.push({
        id: doc.id,
        ...data,
        // Add computed fields for display
        displayDate: new Date(data.createdAt).toLocaleDateString(),
        displayTime: new Date(data.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        locationCount: data.stats?.locationPoints || 0,
        photoCount: data.stats?.photos || 0,
        noteCount: data.stats?.notes || 0
      });
    });

    if (routes.length === 0) {
      alert('📂 No cloud routes found.\n\n💡 To create cloud routes:\n• Start tracking and record a route\n• Save it locally\n• Then upload it to cloud using "☁️ Save to Cloud"');
      return;
    }

    this.showCloudRoutesList(routes);
    this.showSuccessMessage(`📂 Found ${routes.length} cloud route${routes.length !== 1 ? 's' : ''}!`);
    
  } catch (error) {
    console.error('❌ Failed to load routes:', error);
    
    if (error.code === 'permission-denied') {
      this.showAuthError('Permission denied. Please check your Firestore security rules.');
    } else {
      this.showAuthError('Failed to load routes: ' + error.message);
    }
  }
}

// UPDATED: Better cloud routes display with more info
showCloudRoutesList(routes) {
  let message = '☁️ Your Cloud Routes:\n\n';
  
  routes.forEach((route, index) => {
    message += `${index + 1}. ${route.routeName}\n`;
    message += `   📅 ${route.displayDate} ${route.displayTime}\n`;
    message += `   📏 ${route.totalDistance?.toFixed(2) || 0} km`;
    message += ` | 📍 ${route.locationCount} GPS`;
    message += ` | 📷 ${route.photoCount} photos`;
    message += ` | 📝 ${route.noteCount} notes\n`;
    
    // Show accessibility info if available
    if (route.accessibilityData?.wheelchairAccess) {
      message += `   ♿ ${route.accessibilityData.wheelchairAccess}\n`;
    }
    
    message += '\n';
  });

  message += `Select a route to load (1-${routes.length}):`;
  
  const selectedIndex = prompt(message);
  const index = parseInt(selectedIndex) - 1;
  
  if (index >= 0 && index < routes.length) {
    this.loadCloudRouteData(routes[index]);
  }
}

// FIXED: Enhanced route loading with proper map display
async loadCloudRouteData(route) {
  const confirmed = confirm(`Load "${route.routeName}"?\n\nThis will clear your current route data.`);
  if (!confirmed) return;

  const app = window.AccessNatureApp;
  const state = app?.getController('state');
  const mapController = app?.getController('map');
  const timerController = app?.getController('timer');
  
  if (state && route.routeData) {
    try {
      console.log(`📥 Loading cloud route: ${route.routeName}`);
      
      // Clear current data completely
      state.clearRouteData();
      
      // FIXED: Stop any running timers
      if (timerController) {
        timerController.reset();
      }
      
      // Load route data into state
      route.routeData.forEach(point => {
        state.addRoutePoint(point);
      });
      
      // FIXED: Rebuild path points for map display
      const locationPoints = route.routeData.filter(p => p.type === 'location' && p.coords);
      locationPoints.forEach(p => {
        state.addPathPoint(p.coords);
      });
      
      // Update distance and time
      if (route.totalDistance) {
        state.updateDistance(route.totalDistance);
      }
      if (route.elapsedTime) {
        state.setElapsedTime(route.elapsedTime);
        // Set timer display without starting it
        if (timerController) {
          timerController.setElapsedTime(route.elapsedTime);
        }
      }

      // Load accessibility data if available
      if (route.accessibilityData) {
        localStorage.setItem('accessibilityData', JSON.stringify(route.accessibilityData));
      }

      // FIXED: Display route on map using the enhanced method
      if (mapController && typeof mapController.showRouteData === 'function') {
        console.log('🗺️ Displaying route on map...');
        mapController.showRouteData(route.routeData);
        console.log('✅ Route displayed on map');
      } else {
        console.warn('⚠️ Map controller showRouteData method not available');
      }

      this.showSuccessMessage(`✅ "${route.routeName}" loaded from cloud!`);
      console.log('✅ Cloud route loaded successfully:', route.routeName);
      
    } catch (error) {
      console.error('❌ Failed to load cloud route:', error);
      this.showAuthError('Failed to load route: ' + error.message);
    }
  }
}

// NEW: Update user statistics (optional)
async updateUserStats() {
  try {
    const { doc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const userRef = doc(db, 'users', this.currentUser.uid);
    await updateDoc(userRef, {
      routesCount: increment(1),
      lastUpload: new Date().toISOString()
    });
    
  } catch (error) {
    console.warn('Failed to update user stats:', error);
    // Don't show error to user for this non-critical operation
  }
}

  async loadUserRoutes() {
    if (!this.currentUser) {
      this.showAuthError('Please sign in to load your routes');
      return;
    }

    try {
      this.showCloudSyncIndicator('Loading your routes...');

      // Import Firestore functions
      const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
      
      const routesQuery = query(
        collection(db, 'routes'),
        where('userId', '==', this.currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(routesQuery);
      const routes = [];
      
      querySnapshot.forEach(doc => {
        routes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      if (routes.length === 0) {
        alert('No cloud routes found. Start tracking and save your first route!');
        return;
      }

      this.showRoutesList(routes);
      this.showSuccessMessage(`Found ${routes.length} cloud routes!`);
      
    } catch (error) {
      console.error('❌ Failed to load routes:', error);
      this.showAuthError('Failed to load routes: ' + error.message);
    }
  }

  showRoutesList(routes) {
    const routeNames = routes.map(route => 
      `${route.routeName} (${new Date(route.createdAt).toLocaleDateString()}) - ${route.totalDistance?.toFixed(2) || 0} km`
    );

    const selectedIndex = prompt(
      `Select a route to load:\n${routeNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}\n\nEnter number (1-${routes.length}):`
    );

    const index = parseInt(selectedIndex) - 1;
    if (index >= 0 && index < routes.length) {
      this.loadRouteData(routes[index]);
    }
  }

  loadRouteData(route) {
  const confirmed = confirm(`Load "${route.routeName}"? This will clear your current route data.`);
  if (!confirmed) return;

  const app = window.AccessNatureApp;
  const state = app?.getController('state');
  const mapController = app?.getController('map');
  
  if (state) {
    // Clear current route
    state.clearRouteData();
    
    // Load route data
    route.routeData.forEach(point => {
      state.addRoutePoint(point);
    });
    
    // Set distance and time
    if (route.totalDistance) {
      state.updateDistance(route.totalDistance);
    }
    if (route.elapsedTime) {
      state.setElapsedTime(route.elapsedTime);
    }

    // FIXED: Force map to show route
    if (mapController) {
      console.log('🗺️ Displaying cloud route on map...');
      mapController.showRouteData(route.routeData);
    }

    this.showSuccessMessage('Route loaded successfully!');
    console.log('✅ Route loaded:', route.routeName);
  }
}

  // Event callback system
  onLogin(callback) {
    this.callbacks.onLogin.push(callback);
  }

  onLogout(callback) {
    this.callbacks.onLogout.push(callback);
  }

  executeCallbacks(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} callback:`, error);
        }
      });
    }
  }

  // Getters
  getCurrentUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  cleanup() {
    // Remove global functions
    delete window.showAuthModal;
    delete window.closeAuthModal;
    delete window.switchToLogin;
    delete window.switchToSignup;
  }

  // UPDATED: Enhanced cloud save with auto HTML generation
async saveCurrentRouteToCloud() {
  // ... keep existing code until after docRef is created ...
  
  const docRef = await addDoc(collection(db, 'routes'), routeDoc);
  
  console.log('✅ Route saved to cloud successfully with ID:', docRef.id);
  
  // NEW: Auto-generate trail guide HTML
  await this.generateAndStoreTrailGuide(docRef.id, routeDataToSave, routeInfo, accessibilityData);
  
  this.showSuccessMessage(`✅ "${routeInfo.name}" saved to cloud with trail guide! ☁️`);
  
  // Update user stats (optional)
  await this.updateUserStats();
}

// NEW: Generate and store HTML trail guide automatically
async generateAndStoreTrailGuide(routeId, routeData, routeInfo, accessibilityData) {
  try {
    console.log('🌐 Generating trail guide HTML for:', routeInfo.name);
    
    // Get the export controller to generate HTML
    const app = window.AccessNatureApp;
    const exportController = app?.getController('export');
    
    if (!exportController || typeof exportController.generateRouteSummaryHTML !== 'function') {
      console.warn('Export controller not available for HTML generation');
      return;
    }
    
    const htmlContent = exportController.generateRouteSummaryHTML(routeData, routeInfo, accessibilityData);
    
    // Create trail guide document
    const trailGuideDoc = {
      routeId: routeId,
      routeName: routeInfo.name,
      userId: this.currentUser.uid,
      userEmail: this.currentUser.email,
      htmlContent: htmlContent,
      generatedAt: new Date().toISOString(),
      isPublic: false, // Private by default
      
      // Enhanced metadata for search and discovery
      metadata: {
        totalDistance: routeInfo.totalDistance || 0,
        elapsedTime: routeInfo.elapsedTime || 0,
        originalDate: routeInfo.date,
        locationCount: routeData.filter(p => p.type === 'location').length,
        photoCount: routeData.filter(p => p.type === 'photo').length,
        noteCount: routeData.filter(p => p.type === 'text').length
      },
      
      // Accessibility features for search
      accessibility: accessibilityData ? {
        wheelchairAccess: accessibilityData.wheelchairAccess || 'Unknown',
        trailSurface: accessibilityData.trailSurface || 'Unknown',
        difficulty: accessibilityData.difficulty || 'Unknown',
        facilities: accessibilityData.facilities || [],
        location: accessibilityData.location || 'Unknown'
      } : null,
      
      // Technical info
      stats: {
        fileSize: new Blob([htmlContent]).size,
        version: '1.0',
        generatedBy: 'Access Nature App'
      },
      
      // Community features (for future)
      community: {
        views: 0,
        downloads: 0,
        ratings: [],
        averageRating: 0,
        reviews: []
      }
    };
    
    // Import Firestore and save trail guide
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const guideRef = await addDoc(collection(db, 'trail_guides'), trailGuideDoc);
    
    console.log('✅ Trail guide generated and stored with ID:', guideRef.id);
    
  } catch (error) {
    console.error('❌ Failed to generate trail guide:', error);
    // Don't fail the main save if HTML generation fails
    this.showCloudSyncIndicator('Route saved, trail guide generation failed');
  }
}

// NEW: Make trail guide public/private
async toggleTrailGuideVisibility(guideId, makePublic) {
  try {
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const updateData = {
      isPublic: makePublic,
      lastModified: new Date().toISOString()
    };
    
    if (makePublic) {
      updateData.publishedAt = new Date().toISOString();
    }
    
    await updateDoc(doc(db, 'trail_guides', guideId), updateData);
    
    this.showSuccessMessage(`✅ Trail guide ${makePublic ? 'published' : 'made private'}!`);
    
  } catch (error) {
    console.error('❌ Failed to update trail guide visibility:', error);
    this.showAuthError('Failed to update guide visibility: ' + error.message);
  }
}

// NEW: Get user's trail guides with management options
async getUserTrailGuides() {
  try {
    const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const guidesQuery = query(
      collection(db, 'trail_guides'),
      where('userId', '==', this.currentUser.uid),
      orderBy('generatedAt', 'desc')
    );
    
    const querySnapshot = await getDocs(guidesQuery);
    const guides = [];
    
    querySnapshot.forEach(doc => {
      guides.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return guides;
    
  } catch (error) {
    console.error('❌ Failed to load trail guides:', error);
    throw error;
  }
}

// NEW: Search public trail guides
async searchPublicTrailGuides(filters = {}) {
  try {
    const { collection, query, where, orderBy, limit, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    let guidesQuery = query(
      collection(db, 'trail_guides'),
      where('isPublic', '==', true),
      orderBy('generatedAt', 'desc'),
      limit(50) // Limit for performance
    );
    
    // Add filters if provided
    if (filters.wheelchairAccess) {
      guidesQuery = query(guidesQuery, where('accessibility.wheelchairAccess', '==', filters.wheelchairAccess));
    }
    
    const querySnapshot = await getDocs(guidesQuery);
    const guides = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      guides.push({
        id: doc.id,
        routeName: data.routeName,
        userEmail: data.userEmail,
        generatedAt: data.generatedAt,
        metadata: data.metadata,
        accessibility: data.accessibility,
        community: data.community,
        // Don't include full HTML content in search results for performance
        hasHtml: !!data.htmlContent
      });
    });
    
    return guides;
    
  } catch (error) {
    console.error('❌ Failed to search trail guides:', error);
    throw error;
  }
}

// NEW: Get specific trail guide with HTML content
async getTrailGuide(guideId) {
  try {
    const { doc, getDoc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const guideRef = doc(db, 'trail_guides', guideId);
    const guideSnap = await getDoc(guideRef);
    
    if (!guideSnap.exists()) {
      throw new Error('Trail guide not found');
    }
    
    const guideData = guideSnap.data();
    
    // Increment view count
    await updateDoc(guideRef, {
      'community.views': increment(1)
    });
    
    return {
      id: guideSnap.id,
      ...guideData
    };
    
  } catch (error) {
    console.error('❌ Failed to get trail guide:', error);
    throw error;
  }
}

// Add these methods to your existing AuthController class

// NEW: Rate a trail guide
async rateTrailGuide(guideId, rating, review = '') {
  if (!this.currentUser) {
    this.showAuthError('Please sign in to rate trail guides');
    return;
  }

  try {
    const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const ratingData = {
      userId: this.currentUser.uid,
      userEmail: this.currentUser.email,
      rating: rating,
      review: review,
      timestamp: new Date().toISOString()
    };

    // Add rating to trail guide
    await updateDoc(doc(db, 'trail_guides', guideId), {
      'community.ratings': arrayUnion(ratingData)
    });

    // Recalculate average rating
    await this.updateAverageRating(guideId);

    this.showSuccessMessage('✅ Rating submitted successfully!');

  } catch (error) {
    console.error('❌ Failed to rate trail guide:', error);
    this.showAuthError('Failed to submit rating: ' + error.message);
  }
}

// NEW: Update average rating for a trail guide
async updateAverageRating(guideId) {
  try {
    const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const guideRef = doc(db, 'trail_guides', guideId);
    const guideSnap = await getDoc(guideRef);
    
    if (guideSnap.exists()) {
      const data = guideSnap.data();
      const ratings = data.community?.ratings || [];
      
      if (ratings.length > 0) {
        const average = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
        
        await updateDoc(guideRef, {
          'community.averageRating': Math.round(average * 10) / 10 // Round to 1 decimal
        });
      }
    }

  } catch (error) {
    console.error('❌ Failed to update average rating:', error);
  }
}

// NEW: Search trails by region
async searchTrailsByRegion(region, filters = {}) {
  try {
    const { collection, query, where, orderBy, limit, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    let guidesQuery = query(
      collection(db, 'trail_guides'),
      where('isPublic', '==', true),
      where('accessibility.location', '>=', region),
      where('accessibility.location', '<=', region + '\uf8ff'),
      orderBy('accessibility.location'),
      orderBy('generatedAt', 'desc'),
      limit(50)
    );

    // Apply additional filters
    if (filters.wheelchairAccess) {
      guidesQuery = query(guidesQuery, where('accessibility.wheelchairAccess', '==', filters.wheelchairAccess));
    }

    const querySnapshot = await getDocs(guidesQuery);
    const guides = [];
    
    querySnapshot.forEach(doc => {
      guides.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return guides;

  } catch (error) {
    console.error('❌ Failed to search trails by region:', error);
    throw error;
  }
}

// NEW: Get trail guide versions (for future versioning feature)
async getTrailGuideVersions(routeId) {
  try {
    const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const versionsQuery = query(
      collection(db, 'trail_guides'),
      where('routeId', '==', routeId),
      orderBy('generatedAt', 'desc')
    );

    const querySnapshot = await getDocs(versionsQuery);
    const versions = [];
    
    querySnapshot.forEach(doc => {
      versions.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return versions;

  } catch (error) {
    console.error('❌ Failed to get trail guide versions:', error);
    throw error;
  }
}

// NEW: Update trail guide with new version
async updateTrailGuide(originalGuideId, routeData, routeInfo, accessibilityData) {
  try {
    // Create new version instead of updating existing
    const newGuideDoc = {
      routeId: originalGuideId, // Link to original
      routeName: routeInfo.name,
      userId: this.currentUser.uid,
      userEmail: this.currentUser.email,
      htmlContent: this.generateRouteSummaryHTML(routeData, routeInfo, accessibilityData),
      generatedAt: new Date().toISOString(),
      isPublic: false, // New version starts private
      
      // Version info
      version: {
        previousVersion: originalGuideId,
        versionNumber: 2, // This would be calculated properly
        updateReason: 'Trail conditions updated'
      },
      
      // Copy metadata structure from auto-generation function
      metadata: {
        totalDistance: routeInfo.totalDistance || 0,
        elapsedTime: routeInfo.elapsedTime || 0,
        originalDate: routeInfo.date,
        locationCount: routeData.filter(p => p.type === 'location').length,
        photoCount: routeData.filter(p => p.type === 'photo').length,
        noteCount: routeData.filter(p => p.type === 'text').length
      },
      
      accessibility: accessibilityData ? {
        wheelchairAccess: accessibilityData.wheelchairAccess || 'Unknown',
        trailSurface: accessibilityData.trailSurface || 'Unknown',
        difficulty: accessibilityData.difficulty || 'Unknown',
        facilities: accessibilityData.facilities || [],
        location: accessibilityData.location || 'Unknown'
      } : null,
      
      community: {
        views: 0,
        downloads: 0,
        ratings: [],
        averageRating: 0,
        reviews: []
      }
    };

    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const newGuideRef = await addDoc(collection(db, 'trail_guides'), newGuideDoc);

    this.showSuccessMessage('✅ Trail guide updated with new version!');
    return newGuideRef.id;

  } catch (error) {
    console.error('❌ Failed to update trail guide:', error);
    throw error;
  }
}

// ADD this to your auth.js for testing
async makeAllMyGuidesPublic() {
  if (!this.currentUser) {
    console.log('Not logged in');
    return;
  }
  
  try {
    const { collection, query, where, getDocs, doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Get user's private guides
    const myGuidesQuery = query(
      collection(db, 'trail_guides'),
      where('userId', '==', this.currentUser.uid),
      where('isPublic', '==', false)
    );
    
    const snapshot = await getDocs(myGuidesQuery);
    console.log(`Found ${snapshot.size} private guides to make public`);
    
    // Make them public
    const updatePromises = [];
    snapshot.forEach(docSnap => {
      const guideRef = doc(db, 'trail_guides', docSnap.id);
      updatePromises.push(updateDoc(guideRef, {
        isPublic: true,
        publishedAt: new Date().toISOString()
      }));
    });
    
    await Promise.all(updatePromises);
    console.log('✅ Made all guides public');
    
  } catch (error) {
    console.error('❌ Failed to make guides public:', error);
  }
}

// UPDATED: Load and display user's trail guides with better error handling
async loadMyTrailGuides() {
  if (!this.currentUser) {
    this.showAuthError('Please sign in to view your trail guides');
    return;
  }

  try {
    console.log('📂 Loading user trail guides...');
    this.showCloudSyncIndicator('Loading your trail guides...');
    
    // Import Firestore functions with timeout
    const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Create query with error handling
    let guidesQuery;
    try {
      guidesQuery = query(
        collection(db, 'trail_guides'),
        where('userId', '==', this.currentUser.uid),
        orderBy('generatedAt', 'desc')
      );
    } catch (indexError) {
      console.warn('Index not available, using simple query:', indexError);
      // Fallback to simple query without orderBy
      guidesQuery = query(
        collection(db, 'trail_guides'),
        where('userId', '==', this.currentUser.uid)
      );
    }

    console.log('📤 Executing Firestore query...');
    
    // Add timeout to the query
    const queryPromise = getDocs(guidesQuery);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 10000)
    );
    
    const querySnapshot = await Promise.race([queryPromise, timeoutPromise]);
    
    console.log('📥 Query completed, processing results...');
    
    const guides = [];
    querySnapshot.forEach(doc => {
      guides.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort client-side if we used simple query (no orderBy)
    guides.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    
    console.log(`✅ Found ${guides.length} user trail guides`);
    
    if (guides.length === 0) {
      alert('📂 No trail guides found.\n\n💡 To create trail guides:\n• Record a route with GPS tracking\n• Save it to cloud\n• Trail guide will be auto-generated');
      return;
    }
    
    this.displayMyGuides(guides);
    this.showSuccessMessage(`📂 Loaded ${guides.length} trail guide${guides.length !== 1 ? 's' : ''}!`);
    
  } catch (error) {
    console.error('❌ Failed to load trail guides:', error);
    
    // Handle specific error types
    if (error.message === 'Query timeout') {
      this.showAuthError('Request timed out. Please check your internet connection and try again.');
    } else if (error.code === 'permission-denied') {
      this.showAuthError('Permission denied. Please check your Firestore security rules.');
    } else if (error.code === 'unavailable') {
      this.showAuthError('Firestore service temporarily unavailable. Please try again in a moment.');
    } else {
      this.showAuthError('Failed to load trail guides: ' + error.message);
    }
  } finally {
    // Hide loading indicator
    setTimeout(() => {
      const indicator = document.getElementById('cloudSyncIndicator');
      if (indicator) {
        indicator.classList.add('hidden');
      }
    }, 1000);
  }
}

// Manage individual guide
manageGuide(guide) {
  const actions = `🌐 Manage "${guide.routeName}":

1. 👁️ View Trail Guide
2. ${guide.isPublic ? '🔒 Make Private' : '🌍 Make Public'}
3. 🗑️ Delete Guide
4. ❌ Cancel

Enter your choice (1-4):`;

  const choice = prompt(actions);
  
  switch (choice) {
    case '1':
      this.viewTrailGuide(guide.id);
      break;
    case '2':
      this.toggleTrailGuideVisibility(guide.id, !guide.isPublic);
      break;
    case '3':
      this.deleteTrailGuide(guide.id);
      break;
    default:
      // Cancel or invalid choice
      break;
  }
}

// NEW: Display user's guides in the panel
displayMyGuides(guides) {
  let message = '🌐 Your Trail Guides:\n\n';
  
  guides.forEach((guide, index) => {
    const date = new Date(guide.generatedAt).toLocaleDateString();
    const stats = guide.metadata || {};
    const visibility = guide.isPublic ? '🌍 Public' : '🔒 Private';
    
    message += `${index + 1}. ${guide.routeName} ${visibility}\n`;
    message += `   📅 ${date} | 📏 ${(stats.totalDistance || 0).toFixed(1)} km\n`;
    message += `   📍 ${stats.locationCount || 0} GPS | 📷 ${stats.photoCount || 0} photos\n`;
    if (guide.community?.views) {
      message += `   👁️ ${guide.community.views} views\n`;
    }
    message += '\n';
  });

  message += `Select a guide to manage (1-${guides.length}), or 0 to cancel:`;
  
  const choice = prompt(message);
  const choiceNum = parseInt(choice);
  
  if (choiceNum >= 1 && choiceNum <= guides.length) {
    this.manageGuide(guides[choiceNum - 1]);
  }
}

// NEW: Create HTML for a guide item
createGuideItem(guide) {
  const date = new Date(guide.generatedAt).toLocaleDateString();
  const stats = guide.metadata || {};
  
  return `
    <div class="guide-item">
      <div class="guide-header">
        <div class="guide-name">${guide.routeName}</div>
        <div class="guide-visibility ${guide.isPublic ? 'guide-public' : 'guide-private'}">
          ${guide.isPublic ? '🌍 Public' : '🔒 Private'}
        </div>
      </div>
      
      <div class="guide-meta">
        📅 ${date} | 📏 ${(stats.totalDistance || 0).toFixed(1)} km | 
        📍 ${stats.locationCount || 0} GPS | 📷 ${stats.photoCount || 0} photos
        ${guide.community?.views ? `| 👁️ ${guide.community.views} views` : ''}
      </div>
      
      <div class="guide-actions">
        <button class="guide-btn guide-btn-view" onclick="viewMyTrailGuide('${guide.id}')">
          👁️ View
        </button>
        <button class="guide-btn guide-btn-toggle" onclick="toggleGuideVisibility('${guide.id}', ${!guide.isPublic})">
          ${guide.isPublic ? '🔒 Make Private' : '🌍 Make Public'}
        </button>
        <button class="guide-btn guide-btn-delete" onclick="deleteTrailGuide('${guide.id}')">
          🗑️ Delete
        </button>
      </div>
    </div>
  `;
}

// UPDATED: Toggle guide visibility with confirmation
async toggleTrailGuideVisibility(guideId, makePublic) {
  const action = makePublic ? 'publish' : 'make private';
  const warning = makePublic 
    ? 'This will make your trail guide visible to everyone in the community search.' 
    : 'This will hide your trail guide from public search.';
    
  const confirmed = confirm(`${warning}\n\nAre you sure you want to ${action} this trail guide?`);
  
  if (!confirmed) return;

  try {
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    const updateData = {
      isPublic: makePublic,
      lastModified: new Date().toISOString()
    };
    
    if (makePublic) {
      updateData.publishedAt = new Date().toISOString();
    }
    
    await updateDoc(doc(db, 'trail_guides', guideId), updateData);
    
    this.showSuccessMessage(`✅ Trail guide ${makePublic ? 'published' : 'made private'}!`);
    
    // Reload the guides list
    this.loadMyTrailGuides();
    
  } catch (error) {
    console.error('❌ Failed to update trail guide visibility:', error);
    this.showAuthError('Failed to update guide visibility: ' + error.message);
  }
}

// NEW: Delete trail guide
// Delete trail guide
async deleteTrailGuide(guideId) {
  const confirmed = confirm('⚠️ Are you sure you want to permanently delete this trail guide?\n\nThis action cannot be undone!');
  
  if (!confirmed) return;

  try {
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    await deleteDoc(doc(db, 'trail_guides', guideId));
    
    this.showSuccessMessage('✅ Trail guide deleted!');
    
  } catch (error) {
    console.error('❌ Failed to delete trail guide:', error);
    this.showAuthError('Failed to delete guide: ' + error.message);
  }
}

// SIMPLE: Quick test method for loading guides
async testLoadGuides() {
  if (!this.currentUser) {
    alert('Please sign in first');
    return;
  }

  try {
    console.log('🧪 Testing guide loading...');
    alert('Loading guides... check console for progress');
    
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Simple query without orderBy to avoid index issues
    const guidesQuery = query(
      collection(db, 'trail_guides'),
      where('userId', '==', this.currentUser.uid)
    );
    
    const querySnapshot = await getDocs(guidesQuery);
    const guides = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      guides.push({
        id: doc.id,
        name: data.routeName,
        isPublic: data.isPublic,
        created: data.generatedAt
      });
    });
    
    console.log('✅ Found guides:', guides);
    
    if (guides.length === 0) {
      alert('No trail guides found for your account.');
    } else {
      const guidesList = guides.map(g => `• ${g.name} (${g.isPublic ? 'Public' : 'Private'})`).join('\n');
      alert(`Found ${guides.length} trail guides:\n\n${guidesList}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    alert('Test failed: ' + error.message);
  }
}

// NEW: View trail guide method for AuthController
async viewTrailGuide(guideId) {
  try {
    console.log('👁️ Viewing trail guide:', guideId);
    
    // Import Firestore functions
    const { doc, getDoc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Get the trail guide document
    const guideRef = doc(db, 'trail_guides', guideId);
    const guideSnap = await getDoc(guideRef);
    
    if (!guideSnap.exists()) {
      alert('❌ Trail guide not found');
      return;
    }
    
    const guideData = guideSnap.data();
    
    // Check if user can view this guide
    const canView = guideData.isPublic || (this.currentUser && this.currentUser.uid === guideData.userId);
    
    if (!canView) {
      alert('❌ This trail guide is private and you don\'t have permission to view it.');
      return;
    }
    
    // Increment view count (only for public guides and if not the owner)
    if (guideData.isPublic && (!this.currentUser || this.currentUser.uid !== guideData.userId)) {
      try {
        await updateDoc(guideRef, {
          'community.views': increment(1)
        });
        console.log('📈 View count incremented');
      } catch (error) {
        console.warn('Failed to increment view count:', error);
      }
    }
    
    // Show the HTML content
    if (guideData.htmlContent) {
      this.displayTrailGuideHTML(guideData.htmlContent, guideData.routeName);
    } else {
      alert('❌ Trail guide content not available');
    }
    
  } catch (error) {
    console.error('❌ Failed to view trail guide:', error);
    alert('❌ Failed to load trail guide: ' + error.message);
  }
}

// NEW: Display trail guide HTML
displayTrailGuideHTML(htmlContent, routeName) {
  try {
    // Create blob and open in new tab
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Open in new window/tab
    const newWindow = window.open(url, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    
    if (!newWindow) {
      // Popup blocked, offer download instead
      const downloadConfirm = confirm('Popup blocked! Would you like to download the trail guide instead?');
      if (downloadConfirm) {
        this.downloadTrailGuide(htmlContent, routeName);
      }
    } else {
      // Set window title
      newWindow.document.title = `${routeName} - Trail Guide`;
    }
    
    // Clean up URL after delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
  } catch (error) {
    console.error('❌ Failed to display trail guide:', error);
    alert('❌ Failed to display trail guide: ' + error.message);
  }
}

// NEW: Download trail guide as HTML file
downloadTrailGuide(htmlContent, routeName) {
  try {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${routeName.replace(/[^a-z0-9]/gi, '_')}_trail_guide.html`;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log('✅ Trail guide downloaded');
    
  } catch (error) {
    console.error('❌ Failed to download trail guide:', error);
    alert('❌ Failed to download trail guide: ' + error.message);
  }
}

// NEW: Force setup buttons immediately
forceSetupButtons() {
  console.log('🔨 Force setting up buttons...');
  
  // Use setTimeout to ensure DOM is ready
  const setupButtons = () => {
    const loadMyGuidesBtn = document.getElementById('loadMyGuidesBtn');
    
    if (loadMyGuidesBtn) {
      console.log('🔧 Found loadMyGuidesBtn, setting up...');
      
      // Remove all existing listeners
      const newBtn = loadMyGuidesBtn.cloneNode(true);
      loadMyGuidesBtn.parentNode.replaceChild(newBtn, loadMyGuidesBtn);
      
      // Add our listener
      newBtn.addEventListener('click', (e) => {
        console.log('🌐 Load My Guides clicked (forced setup)');
        e.preventDefault();
        e.stopPropagation();
        this.loadMyTrailGuides();
      });
      
      console.log('✅ loadMyGuidesBtn setup complete');
      return true;
    } else {
      console.warn('⚠️ loadMyGuidesBtn not found');
      return false;
    }
  };
  
  // Try setup immediately
  if (!setupButtons()) {
    // If failed, retry with delays
    setTimeout(setupButtons, 500);
    setTimeout(setupButtons, 1000);
    setTimeout(setupButtons, 2000);
    setTimeout(setupButtons, 5000);
  }
}
}

// Auto-initialize when imported
const authController = new AuthController();
document.addEventListener('DOMContentLoaded', () => {
  authController.initialize();
});

export default authController;