// Main application entry point with all modules
import { authController } from './features/auth.js';
   
   // Initialize auth first
   authController.initialize();
import { DialogSystem } from './ui/dialogs.js';
import { AppState } from './core/storage.js';
import { MapController } from './core/map.js';
import { TrackingController } from './core/tracking.js';
import { TimerController } from './core/timer.js';
import { NavigationController } from './ui/navigation.js';
import { CompassController } from './ui/compass.js';
import { AccessibilityForm } from './features/accessibility.js';
import { MediaController } from './features/media.js';
import { ExportController } from './features/export.js';
import { FirebaseController } from './features/firebase.js';


class AccessNatureApp {
  constructor() {
    this.controllers = {};
    this.isInitialized = false;
  }

// UPDATED: Initialize method with backup restore handling
async initialize() {
  if (this.isInitialized) return;

  try {
    console.log('🌲 Access Nature starting...');

    // Initialize core systems
    this.controllers.dialogs = new DialogSystem();
    this.controllers.state = new AppState();
    this.controllers.map = new MapController();
    this.controllers.tracking = new TrackingController(this.controllers.state);
    this.controllers.timer = new TimerController();

    // Initialize UI controllers
    this.controllers.navigation = new NavigationController();
    this.controllers.compass = new CompassController();

    // Initialize feature controllers
    this.controllers.accessibility = new AccessibilityForm();
    this.controllers.media = new MediaController(this.controllers.state);
    this.controllers.export = new ExportController(this.controllers.state);
    this.controllers.firebase = new FirebaseController();  // CREATE INSTANCE
    this.controllers.auth = authController;

    this.controllers.firebase.initialize(
      this.controllers.auth,
      this.controllers.export  // Pass export controller
    );

    // Set up dependencies
    this.setupControllerDependencies();

    // Initialize all controllers
    await this.initializeControllers();

    // Set up the main UI event listeners
    this.setupMainEventListeners();

    // Set up error handling
    this.setupErrorHandling();

    // NEW: Check for unsaved route BEFORE loading initial state
    await this.handleUnsavedRoute();

    // Load saved state
    await this.loadInitialState();

    this.isInitialized = true;
    console.log('✅ App initialization complete');

  } catch (error) {
    console.error('❌ App initialization failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    alert('Failed to initialize application. Please refresh the page.');
  }
}

// 1. FIXED: Update the handleUnsavedRoute method
async handleUnsavedRoute() {
  try {
    // IMPORTANT: Wait for state controller to be ready
    await this.waitForStateController();
    
    const backupData = await this.controllers.state.checkForUnsavedRoute();
    
    if (backupData) {
      const success = await this.showRestoreDialog(backupData);
      
      if (success) {
        console.log('✅ Route restoration completed');
        
        // FIXED: Set up timer with restored elapsed time
        const timerController = this.controllers.timer;
        const elapsedTime = this.controllers.state.getElapsedTime();
        
        if (timerController && elapsedTime > 0) {
          timerController.setElapsedTime(elapsedTime);
          console.log(`⏱️ Timer initialized with ${this.formatElapsedTime(elapsedTime)} elapsed`);
        }
        
      } else {
        console.log('🗑️ User chose to discard backup or restoration failed');
      }
    }
  } catch (error) {
    console.error('❌ Error handling unsaved route:', error);
    try {
      await this.controllers.state.clearRouteBackup();
    } catch (clearError) {
      console.error('❌ Failed to clear backup:', clearError);
    }
  }
}

// 2. NEW: Wait for state controller to be ready
async waitForStateController() {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    if (this.controllers.state && this.controllers.state.dbReady !== undefined) {
      // Wait a bit more if IndexedDB is still initializing
      if (this.controllers.state.dbReady === false) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  console.warn('⚠️ State controller initialization timeout');
}

// NEW: Show enhanced restore dialog
// FIXED: Show enhanced restore dialog
async showRestoreDialog(backupData) {
  return new Promise((resolve) => {
    try {
      // Validate backupData structure
      if (!backupData || typeof backupData !== 'object') {
        console.error('❌ Invalid backup data structure');
        resolve(false);
        return;
      }

      const backupDate = new Date(backupData.backupTime || Date.now()).toLocaleString();
      const routeData = backupData.routeData || [];
      const pointCount = routeData.length;
      const distance = (backupData.totalDistance || 0).toFixed(2);
      
      // Safely filter route data
      const locationPoints = routeData.filter(p => p && p.type === 'location').length;
      const photos = routeData.filter(p => p && p.type === 'photo').length;
      const notes = routeData.filter(p => p && p.type === 'text').length;
      
      // Calculate time since backup
      const backupTime = backupData.backupTime || Date.now();
      const backupAge = Date.now() - backupTime;
      const hoursAgo = Math.floor(backupAge / (1000 * 60 * 60));
      const minutesAgo = Math.floor((backupAge % (1000 * 60 * 60)) / (1000 * 60));
      
      let timeAgoText = '';
      if (hoursAgo > 0) {
        timeAgoText = `${hoursAgo}h ${minutesAgo}m ago`;
      } else {
        timeAgoText = `${minutesAgo}m ago`;
      }

      // Create detailed restore dialog
      const restoreMessage = `🔄 UNSAVED ROUTE FOUND!

📅 Created: ${backupDate}
⏰ Time: ${timeAgoText}

📊 Route Details:
📏 Distance: ${distance} km
📍 GPS Points: ${locationPoints}
📷 Photos: ${photos}
📝 Notes: ${notes}
📋 Total Data: ${pointCount} entries

This route was not saved before the app was closed.

Would you like to restore it?

✅ OK = Restore and continue route
❌ Cancel = Start fresh (data will be lost)`;

      const shouldRestore = confirm(restoreMessage);
      
      if (shouldRestore) {
        console.log('👤 User chose to restore route');
        
        const success = this.controllers.state.restoreFromBackup(backupData);
        
        if (success) {
          // Show success message without action options to avoid conflicts
          this.showRestoreSuccessMessage(backupData);
          resolve(true);
        } else {
          this.showError('❌ Failed to restore route. Starting fresh.');
          this.controllers.state.clearRouteBackup();
          resolve(false);
        }
      } else {
        // User chose to start fresh
        console.log('👤 User chose to start fresh');
        
        // Double-check with warning about data loss
        const confirmDiscard = confirm(`⚠️ Are you sure you want to discard this route?

This will permanently delete:
- ${distance} km of tracked distance
- ${locationPoints} GPS points
- ${photos} photos
- ${notes} notes

This action cannot be undone!`);
        
        if (confirmDiscard) {
          this.controllers.state.clearRouteBackup();
          this.showSuccessMessage('🗑️ Route data discarded. Starting fresh.');
          resolve(false);
        } else {
          // User changed their mind, try restore again
          console.log('👤 User changed mind, attempting restore...');
          const success = this.controllers.state.restoreFromBackup(backupData);
          if (success) {
            this.showRestoreSuccessMessage(backupData);
            resolve(true);
          } else {
            this.showError('❌ Failed to restore route.');
            resolve(false);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error in restore dialog:', error);
      this.showError('❌ Error during route restoration.');
      this.controllers.state.clearRouteBackup();
      resolve(false);
    }
  });
}

// FIXED: Simple success message without action dialogs
showRestoreSuccessMessage(backupData) {
  const distance = (backupData.totalDistance || 0).toFixed(2);
  const pointCount = (backupData.routeData || []).filter(p => p && p.type === 'location').length;
  
  this.showSuccessMessage(`✅ Route restored! ${distance} km and ${pointCount} GPS points recovered. Check the map and click ▶ to continue tracking.`);
  
  console.log(`✅ Route restored: ${distance} km, ${pointCount} GPS points`);
  console.log('💡 User can now: 1) Resume tracking with ▶, 2) Save route, 3) View on map');
}

// NEW: Show restore success dialog with options
// UPDATED: Show restore success dialog without auto-popup
showRestoreSuccessDialog(backupData) {
  const distance = (backupData.totalDistance || 0).toFixed(2);
  const pointCount = backupData.routeData.filter(p => p.type === 'location').length;
  
  // Show success message only
  this.showSuccessMessage('✅ Route restored successfully! Check route on map.');
  
  console.log(`✅ Route restored: ${distance} km, ${pointCount} GPS points`);
  console.log('💡 User can now: 1) Resume tracking, 2) Save route, 3) View on map');
  
  // Don't show the options dialog automatically - let user decide
}

// UPDATED: Continue tracking from restored route
continueRestoredRoute() {
  try {
    console.log('🚀 Preparing to continue restored route...');
    
    // Set up timer with restored elapsed time
    const timerController = this.controllers.timer;
    const elapsedTime = this.controllers.state.getElapsedTime();
    
    if (timerController && elapsedTime > 0) {
      timerController.setElapsedTime(elapsedTime);
      console.log(`⏱️ Timer prepared with ${this.formatElapsedTime(elapsedTime)} elapsed`);
    }
    
    // Update tracking buttons but don't auto-start
    const trackingController = this.controllers.tracking;
    if (trackingController) {
      trackingController.updateTrackingButtons();
    }
    
    this.showSuccessMessage('🚀 Ready to continue! Click ▶ to resume tracking.');
    
  } catch (error) {
    console.error('❌ Failed to prepare continued tracking:', error);
    this.showError('❌ Failed to prepare tracking continuation.');
  }
}

// NEW: Helper method to format elapsed time
formatElapsedTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// NEW: Save restored route
async saveRestoredRoute() {
  try {
    console.log('💾 Saving restored route...');
    
    const trackingController = this.controllers.tracking;
    if (trackingController && typeof trackingController.saveRoute === 'function') {
      await trackingController.saveRoute();
    } else {
      // Fallback manual save
      const routeName = prompt('Enter a name for this restored route:') || `Restored Route ${new Date().toLocaleDateString()}`;
      await this.controllers.state.saveSession(routeName);
      this.showSuccessMessage(`✅ Route saved as "${routeName}"`);
    }
  } catch (error) {
    console.error('❌ Failed to save restored route:', error);
    this.showError('❌ Failed to save route: ' + error.message);
  }
}

// NEW: View restored route on map
viewRestoredRoute() {
  try {
    console.log('👁️ Viewing restored route on map...');
    
    const mapController = this.controllers.map;
    if (mapController) {
      // The route should already be redrawn by restoreFromBackup
      // Just ensure map is focused on the route
      this.showSuccessMessage('👁️ Route displayed on map');
    }
  } catch (error) {
    console.error('❌ Failed to view route on map:', error);
    this.showError('❌ Failed to display route on map.');
  }
}

// UPDATED: Enhanced success message method
showSuccessMessage(message) {
  const successDiv = document.createElement('div');
  successDiv.textContent = message;
  successDiv.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
    color: white;
    padding: 15px 25px;
    border-radius: 25px;
    z-index: 9999;
    font-size: 16px;
    font-weight: 500;
    box-shadow: 0 6px 25px rgba(76, 175, 80, 0.4);
    animation: slideDown 0.4s ease;
    max-width: 80%;
    text-align: center;
  `;

  // Add CSS animation if not already added
  if (!document.getElementById('successMessageCSS')) {
    const style = document.createElement('style');
    style.id = 'successMessageCSS';
    style.textContent = `
      @keyframes slideDown {
        from {
          transform: translate(-50%, -100%);
          opacity: 0;
        }
        to {
          transform: translate(-50%, 0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(successDiv);
  setTimeout(() => {
    if (successDiv.parentNode) {
      successDiv.remove();
    }
  }, 4000);
}

// UPDATED: Enhanced error message method
showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.textContent = message;
  errorDiv.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
    color: white;
    padding: 15px 25px;
    border-radius: 25px;
    z-index: 9999;
    font-size: 16px;
    font-weight: 500;
    box-shadow: 0 6px 25px rgba(220, 53, 69, 0.4);
    animation: slideDown 0.4s ease;
    max-width: 80%;
    text-align: center;
  `;

  document.body.appendChild(errorDiv);
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.remove();
    }
  }, 5000);
}

// ... rest of your existing methods stay the same ...

  // NEW: Setup main event listeners for tracking buttons
setupMainEventListeners() {
  // Start button
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      try {
        console.log('🎯 Start button clicked');
        await this.controllers.tracking.start();
      } catch (error) {
        console.error('Failed to start tracking:', error);
        alert('Failed to start tracking: ' + error.message);
      }
    });
  }

  // Pause button
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      console.log('⏸️ Pause button clicked');
      this.controllers.tracking.togglePause();
    });
  }

  // Stop button
  const stopBtn = document.getElementById('stopBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      console.log('⏹️ Stop button clicked');
      this.controllers.tracking.stop();
    });
  }

  // Load My Routes button
  const loadRoutesBtn = document.getElementById('loadCloudRoutesBtn');
  if (loadRoutesBtn) {
    loadRoutesBtn.addEventListener('click', async () => {
      console.log('☁️ Load My Routes clicked');
      try {
        const routes = await this.controllers.firebase.loadMyRoutes();
        console.log(`✅ Loaded ${routes.length} routes:`, routes);
        
        if (routes.length === 0) {
          alert('No routes found in cloud. Save some routes first!');
        } else {
          // Display routes list
          this.displayRoutesList(routes);
        }
      } catch (error) {
        console.error('❌ Failed to load routes:', error);
        alert('Failed to load routes: ' + error.message);
      }
    });
  }

  // Load My Guides button
  const loadGuidesBtn = document.getElementById('loadMyGuidesBtn');
  if (loadGuidesBtn) {
    loadGuidesBtn.addEventListener('click', async () => {
      console.log('🌐 Load My Guides clicked');
      try {
        const guides = await this.controllers.firebase.loadMyGuides();
        console.log(`✅ Loaded ${guides.length} guides:`, guides);
        
        if (guides.length === 0) {
          alert('No trail guides found. Save a route to cloud to create a guide!');
        } else {
          // Display guides list
          this.displayGuidesList(guides);
        }
      } catch (error) {
        console.error('❌ Failed to load guides:', error);
        alert('Failed to load guides: ' + error.message);
      }
    });
  }

  // Save to Cloud button (if you have one)
  const saveToCloudBtn = document.getElementById('saveToCloudBtn');
  if (saveToCloudBtn) {
    saveToCloudBtn.addEventListener('click', async () => {
      console.log('☁️ Save to Cloud clicked');
      alert('Please save routes by stopping tracking. Cloud save happens automatically!');
    });
  }

  console.log('✅ Main event listeners set up');
}

// Add these methods to your AccessNatureApp class in main.js

displayRoutesList(routes) {
  const modal = document.getElementById('routesListModal');
  const container = document.getElementById('routesListContainer');
  
  if (!modal || !container) {
    console.error('Routes modal not found in HTML');
    alert(`Found ${routes.length} routes. Check console for details.`);
    console.table(routes);
    return;
  }

  if (routes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>No Routes Found</h3>
        <p>Start tracking a route and save it to the cloud!</p>
      </div>
    `;
  } else {
    let html = '';
    
    routes.forEach(route => {
      const date = route.createdAt ? new Date(route.createdAt).toLocaleDateString() : 'Unknown date';
      const time = route.createdAt ? new Date(route.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
      const distance = (route.totalDistance || 0).toFixed(2);
      const duration = this.formatDuration(route.duration || route.elapsedTime || 0);
      const points = route.stats?.locationPoints || route.points?.length || 0;
      const photos = route.stats?.photos || 0;
      const visibility = route.isPublic ? '🌍 Public' : '🔒 Private';
      
      html += `
        <div class="list-item" data-route-id="${route.id}">
          <div class="list-item-title">${route.name || route.routeName || 'Unnamed Route'}</div>
          <div class="list-item-meta">
            <span>📅 ${date} ${time}</span>
            <span>📏 ${distance} km</span>
            <span>⏱️ ${duration}</span>
            <span>📍 ${points} points</span>
            ${photos > 0 ? `<span>📷 ${photos}</span>` : ''}
            <span>${visibility}</span>
          </div>
          <div class="list-item-actions">
            <button class="list-item-btn list-item-btn-primary" onclick="window.AccessNatureApp.loadRouteOnMap('${route.id}')">
              🗺️ View on Map
            </button>
            <button class="list-item-btn list-item-btn-secondary" onclick="window.AccessNatureApp.downloadRoute('${route.id}')">
              📥 Download
            </button>
            <button class="list-item-btn list-item-btn-secondary" onclick="window.AccessNatureApp.deleteRoute('${route.id}')">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  modal.classList.remove('hidden');
}

displayGuidesList(guides) {
  const modal = document.getElementById('guidesListModal');
  const container = document.getElementById('guidesListContainer');
  
  if (!modal || !container) {
    console.error('Guides modal not found in HTML');
    alert(`Found ${guides.length} guides. Check console for details.`);
    console.table(guides);
    return;
  }

  if (guides.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>No Trail Guides Found</h3>
        <p>Save a route to the cloud to automatically create a trail guide!</p>
      </div>
    `;
  } else {
    let html = '';
    
    guides.forEach(guide => {
      const date = guide.generatedAt ? new Date(guide.generatedAt).toLocaleDateString() : 'Unknown date';
      const time = guide.generatedAt ? new Date(guide.generatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
      const distance = (guide.metadata?.totalDistance || 0).toFixed(2);
      const duration = this.formatDuration(guide.metadata?.elapsedTime || 0);
      const points = guide.metadata?.locationCount || 0;
      const photos = guide.metadata?.photoCount || 0;
      const visibility = guide.isPublic ? '🌍 Public' : '🔒 Private';
      const wheelchairAccess = guide.accessibility?.wheelchairAccess || 'Unknown';
      
      html += `
        <div class="list-item" data-guide-id="${guide.id}">
          <div class="list-item-title">${guide.routeName || 'Unnamed Guide'}</div>
          <div class="list-item-meta">
            <span>📅 ${date} ${time}</span>
            <span>📏 ${distance} km</span>
            <span>⏱️ ${duration}</span>
            <span>📍 ${points} points</span>
            ${photos > 0 ? `<span>📷 ${photos}</span>` : ''}
            <span>${visibility}</span>
            <span>♿ ${wheelchairAccess}</span>
          </div>
          <div class="list-item-actions">
            <button class="list-item-btn list-item-btn-primary" onclick="window.AccessNatureApp.viewGuide('${guide.id}')">
              📖 View Guide
            </button>
            <button class="list-item-btn list-item-btn-secondary" onclick="window.AccessNatureApp.downloadGuide('${guide.id}')">
              📥 Download HTML
            </button>
            ${!guide.isPublic ? `
              <button class="list-item-btn list-item-btn-secondary" onclick="window.AccessNatureApp.makeGuidePublic('${guide.id}')">
                🌍 Make Public
              </button>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  modal.classList.remove('hidden');
}

// Helper method to format duration
formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

// Action methods
async loadRouteOnMap(routeId) {
  console.log('📍 Loading route on map:', routeId);
  
  try {
    // Close modal
    this.closeRoutesModal();
    
    // Load route data from Firebase (no loading alert)
    const route = await this.controllers.firebase.loadRoute(routeId);
    console.log('✅ Route data loaded:', route);
    
    // Check if route has points
    if (!route.points || route.points.length === 0) {
      alert('⚠️ This route has no GPS points to display on the map.');
      return;
    }
    
    // Display route on map
    this.controllers.map.showRouteData(route.points);
    
    // Also update distance and timer displays
    if (route.totalDistance) {
      const distanceEl = document.getElementById('distance');
      if (distanceEl) {
        distanceEl.textContent = `${route.totalDistance.toFixed(2)} km`;
      }
    }
    
    if (route.duration || route.elapsedTime) {
      const timerEl = document.getElementById('timer');
      if (timerEl) {
        const duration = route.duration || route.elapsedTime;
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        timerEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }
    
    alert(`✅ Route "${route.name || 'Unnamed'}" loaded on map!\n\n📍 ${route.points.length} GPS points\n📏 ${(route.totalDistance || 0).toFixed(2)} km`);
    
  } catch (error) {
    console.error('❌ Failed to load route on map:', error);
    alert('Failed to load route on map: ' + error.message);
  }
}

async downloadRoute(routeId) {
  console.log('📥 Downloading route:', routeId);
  
  try {
    // Load route from Firebase
    const route = await this.controllers.firebase.loadRoute(routeId);
    console.log('✅ Route loaded for download:', route);
    
    // Prepare clean data for download
    const downloadData = {
      name: route.name || 'Unnamed Route',
      createdAt: route.createdAt,
      totalDistance: route.totalDistance,
      duration: route.duration || route.elapsedTime,
      points: route.points,
      stats: route.stats,
      accessibility: route.accessibility,
      isPublic: route.isPublic
    };
    
    // Convert to JSON
    const json = JSON.stringify(downloadData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(route.name || 'route').replace(/[^a-z0-9]/gi, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('✅ Route downloaded successfully!');
    
  } catch (error) {
    console.error('❌ Failed to download route:', error);
    alert('Failed to download route: ' + error.message);
  }
}

async deleteRoute(routeId) {
  // Confirm deletion
  if (!confirm('⚠️ Delete this route?\n\nThis will permanently delete the route from the cloud.\nThis action cannot be undone!')) {
    return;
  }
  
  console.log('🗑️ Deleting route:', routeId);
  
  try {
    // Delete from Firebase
    await this.controllers.firebase.deleteRoute(routeId);
    console.log('✅ Route deleted');
    
    alert('✅ Route deleted successfully!');
    
    // Reload and refresh the routes list
    const routes = await this.controllers.firebase.loadMyRoutes();
    this.displayRoutesList(routes);
    
  } catch (error) {
    console.error('❌ Failed to delete route:', error);
    alert('Failed to delete route: ' + error.message);
  }
}

async viewGuide(guideId) {
  console.log('📖 Opening trail guide:', guideId);
  
  try {
    // Close modal
    this.closeGuidesModal();
    
    // Load guide from Firebase
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const db = this.controllers.firebase.db;
    
    const guideRef = doc(db, 'trail_guides', guideId);
    const guideSnap = await getDoc(guideRef);
    
    if (!guideSnap.exists()) {
      throw new Error('Trail guide not found');
    }
    
    const guide = guideSnap.data();
    console.log('✅ Guide loaded:', guide);
    
    if (!guide.htmlContent) {
      alert('⚠️ This trail guide has no HTML content to display.');
      return;
    }
    
    // Open in new window
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      alert('⚠️ Pop-up blocked! Please allow pop-ups for this site and try again.');
      return;
    }
    
    newWindow.document.write(guide.htmlContent);
    newWindow.document.close();
    
    console.log('✅ Trail guide opened in new window');
    
  } catch (error) {
    console.error('❌ Failed to view guide:', error);
    alert('Failed to open trail guide: ' + error.message);
  }
}

async downloadGuide(guideId) {
  console.log('📥 Downloading trail guide:', guideId);
  
  try {
    // Load guide from Firebase
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const db = this.controllers.firebase.db;
    
    const guideRef = doc(db, 'trail_guides', guideId);
    const guideSnap = await getDoc(guideRef);
    
    if (!guideSnap.exists()) {
      throw new Error('Trail guide not found');
    }
    
    const guide = guideSnap.data();
    console.log('✅ Guide loaded for download:', guide);
    
    if (!guide.htmlContent) {
      alert('⚠️ This trail guide has no HTML content to download.');
      return;
    }
    
    // Create blob and download
    const blob = new Blob([guide.htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(guide.routeName || 'trail-guide').replace(/[^a-z0-9]/gi, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('✅ Trail guide downloaded successfully!');
    
  } catch (error) {
    console.error('❌ Failed to download guide:', error);
    alert('Failed to download trail guide: ' + error.message);
  }
}

async makeGuidePublic(guideId) {
  // Confirm making public
  if (!confirm('🌍 Make this trail guide public?\n\nIt will be visible to everyone on the community page.\n\nYou can change it back to private later if needed.')) {
    return;
  }
  
  console.log('🌍 Making guide public:', guideId);
  
  try {
    // Update in Firebase
    const { doc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const db = this.controllers.firebase.db;
    
    const guideRef = doc(db, 'trail_guides', guideId);
    
    await updateDoc(guideRef, {
      isPublic: true,
      publishedAt: serverTimestamp()
    });
    
    console.log('✅ Guide is now public');
    
    alert('✅ Trail guide is now public!\n\nIt will appear on the community page for everyone to see.');
    
    // Reload and refresh the guides list
    const guides = await this.controllers.firebase.loadMyGuides();
    this.displayGuidesList(guides);
    
  } catch (error) {
    console.error('❌ Failed to make guide public:', error);
    alert('Failed to update trail guide: ' + error.message);
  }
}

async deleteGuide(guideId) {
  try {
    const confirmDelete = confirm('⚠️ Are you sure you want to delete this trail guide?\n\nThis action cannot be undone.');
    
    if (!confirmDelete) {
      return;
    }
    
    console.log('🗑️ Deleting guide:', guideId);
    
    // Delete from Firebase
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const db = this.controllers.firebase.db;
    
    const guideRef = doc(db, 'trail_guides', guideId);
    await deleteDoc(guideRef);
    
    console.log('✅ Guide deleted');
    alert('✅ Trail guide deleted successfully!');
    
    // Reload the guides list
    const guides = await this.controllers.firebase.loadMyGuides();
    this.displayGuidesList(guides);
    
  } catch (error) {
    console.error('❌ Failed to delete guide:', error);
    alert('Failed to delete guide: ' + error.message);
  }
}

// Close modal functions
closeRoutesModal() {
  const modal = document.getElementById('routesListModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

closeGuidesModal() {
  const modal = document.getElementById('guidesListModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// loadRouteOnMap(routeId) {
//   console.log('📍 Loading route on map:', routeId);
//   // TODO: Implement route display on map
//   alert('Loading route on map - coming soon!');
// }

// viewGuide(guideId) {
//   console.log('🌐 Viewing guide:', guideId);
//   // TODO: Implement guide viewer
//   alert('Opening trail guide - coming soon!');
// }

  setupControllerDependencies() {
  // Tracking controller - ALL dependencies in ONE call
  this.controllers.tracking.setDependencies({
    state: this.controllers.state,
    map: this.controllers.map,
    timer: this.controllers.timer,
    media: this.controllers.media,      // Add media here
    firebase: this.controllers.firebase,
    auth: this.controllers.auth,
    dialogs: this.controllers.dialogs
  });

  // Export controller
  this.controllers.export.setDependencies({
    map: this.controllers.map,
    accessibility: this.controllers.accessibility
  });

  // Compass controller
  this.controllers.compass.setDependencies({
    map: this.controllers.map
  });
  
  // DEBUG - Check final state
  console.log('🔍 FINAL tracking dependencies:', Object.keys(this.controllers.tracking.dependencies));
}

  async initializeControllers() {
  // Skip controllers that are already initialized manually with specific arguments
  const skipControllers = ['firebase', 'auth', 'dialogs'];
  
  for (const [name, controller] of Object.entries(this.controllers)) {
    // Skip manually initialized controllers
    if (skipControllers.includes(name)) {
      console.log(`⏭️ ${name} already initialized, skipping`);
      continue;
    }
    
    // Initialize controller if it has an initialize method
    if (controller && typeof controller.initialize === 'function') {
      try {
        await controller.initialize();
        console.log(`✅ ${name} controller initialized`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${name}:`, error);
      }
    }
  }
}

  setupErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.handleError(event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.handleError(event.reason);
      event.preventDefault();
    });
  }

  async loadInitialState() {
    try {
      const backup = localStorage.getItem('route_backup');
      if (backup) {
        const shouldRestore = confirm('Unsaved route found! Would you like to restore it?');
        if (shouldRestore) {
          console.log('✅ Restored from backup');
        } else {
          localStorage.removeItem('route_backup');
        }
      }

      if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
      }

    } catch (error) {
      console.error('Failed to load initial state:', error);
    }
  }

  handleError(error) {
    console.error('App error:', error);
    
    const isCritical = error instanceof TypeError || 
                      error instanceof ReferenceError ||
                      error.message?.includes('Firebase') ||
                      error.message?.includes('geolocation');

    if (isCritical) {
      this.showError('A critical error occurred. Some features may not work properly.');
    }
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #dc3545;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  getController(name) {
    return this.controllers[name];
  }
}

// Global app instance
let app = null;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📄 DOM loaded, initializing app...');
  app = new AccessNatureApp();
  await app.initialize();
  window.AccessNatureApp = app;
});

// Global functions for HTML onclick handlers
window.openAccessibilityForm = (callback) => {
  console.log('🔧 Opening accessibility form');
  app?.getController('accessibility')?.open(callback);
};

window.closeAccessibilityForm = () => {
  console.log('🔧 Closing accessibility form');
  app?.getController('accessibility')?.close();
};

window.addTextNote = () => {
  console.log('📝 Adding text note');
  app?.getController('media')?.addTextNote();
};

window.showRouteDataOnMap = () => {
  console.log('🗺️ Showing route data on map');
  const routeData = app?.getController('state')?.getRouteData();
  app?.getController('map')?.showRouteData(routeData);
};

window.togglePanel = (panelId) => {
  console.log('📱 Toggling panel:', panelId);
  app?.getController('navigation')?.togglePanel(panelId);
};

window.showStorageMonitor = () => {
  console.log('💾 Showing storage monitor');
  app?.getController('navigation')?.showStorageMonitor();
};

window.triggerImport = () => {
  console.log('📥 Triggering import');
  app?.getController('export')?.triggerImport();
};

window.confirmAndResetApp = () => {
  console.log('🔄 Confirming app reset');
  if (confirm('Reset everything?')) {
    app?.getController('state')?.clearAllAppData();
    location.reload();
  }
};

// Add this to your existing global functions in main.js
window.loadMyTrailGuides = () => {
  console.log('🌐 Global loadMyTrailGuides called');
  const app = window.AccessNatureApp;
  const auth = app?.getController('auth');
  
  if (auth && typeof auth.loadMyTrailGuides === 'function') {
    auth.loadMyTrailGuides();
  } else {
    console.error('Auth controller or method not available');
    alert('Auth controller not available. Please refresh the page.');
  }
};

// Add these to your existing global functions
window.loadMyTrailGuides = () => app?.getController('auth')?.loadMyTrailGuides();
window.viewMyTrailGuide = (guideId) => app?.getController('auth')?.viewTrailGuide(guideId);
window.toggleGuideVisibility = (guideId, makePublic) => app?.getController('auth')?.toggleTrailGuideVisibility(guideId, makePublic);
window.deleteTrailGuide = (guideId) => app?.getController('auth')?.deleteTrailGuide(guideId);

// Global functions for onclick handlers
window.closeRoutesModal = function() {
  const app = window.AccessNatureApp;
  if (app) app.closeRoutesModal();
};

window.closeGuidesModal = function() {
  const app = window.AccessNatureApp;
  if (app) app.closeGuidesModal();
};

export { AccessNatureApp };