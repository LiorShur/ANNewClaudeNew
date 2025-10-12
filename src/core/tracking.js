// GPS tracking with proper save prompt
import { haversineDistance } from '../utils/calculations.js';

export class TrackingController {
  constructor(appState) {
    this.appState = appState;
    this.watchId = null;
    this.isTracking = false;
    this.isPaused = false;
    this.dependencies = {};
  }

  setDependencies(deps) {
    this.dependencies = deps;
  }

async start() {
  if (this.isTracking) return false;

  if (!navigator.geolocation) {
    throw new Error('Geolocation not supported by this browser');
  }

  console.log('🚀 Starting GPS tracking...');

  // FIXED: Check if we're resuming a restored route
  const currentElapsed = this.appState.getElapsedTime();
  const isResuming = currentElapsed > 0 && this.appState.getRouteData().length > 0;

  if (!isResuming) {
  // Starting fresh - clear any previous route data and set start time
  this.appState.clearRouteData();
  this.appState.setStartTime(Date.now());
} else {
  // FIXED: Resuming - use more precise timing calculation
  const currentTime = Date.now();
  const adjustedStartTime = currentTime - currentElapsed;
  this.appState.setStartTime(adjustedStartTime);
  console.log(`🔄 Resuming route with ${this.formatTime(currentElapsed)} elapsed`);
  
  // IMPORTANT: Also update the app state's elapsed time to match
  this.appState.setElapsedTime(currentElapsed);
}

  this.isTracking = true;
  this.isPaused = false;
  this.appState.setTrackingState(true);

  // Start GPS watch
  this.watchId = navigator.geolocation.watchPosition(
    (position) => this.handlePositionUpdate(position),
    (error) => this.handlePositionError(error),
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );

  // FIXED: Start timer with current elapsed time (if resuming)
  if (this.dependencies.timer) {
  if (isResuming) {
    // FIXED: Get the actual elapsed time from app state
    const restoredElapsed = this.appState.getElapsedTime();
    console.log(`⏱️ Starting timer with restored elapsed: ${restoredElapsed}ms`);
    this.dependencies.timer.start(restoredElapsed);
  } else {
    this.dependencies.timer.start();
  }
}

  this.updateTrackingButtons();
  
  if (isResuming) {
    console.log('✅ GPS tracking resumed successfully');
  } else {
    console.log('✅ GPS tracking started successfully');
  }
  
  return true;
}

// NEW: Format time helper method
formatTime(milliseconds) {
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

// UPDATED: Stop method to preserve elapsed time
stop() {
  if (!this.isTracking) {
    console.warn('Tracking not active');
    return false;
  }

  console.log('🛑 Stopping GPS tracking...');

  // Stop GPS watch
  if (this.watchId) {
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  // Stop timer and get final elapsed time
  if (this.dependencies.timer) {
    const finalElapsed = this.dependencies.timer.stop();
    this.appState.setElapsedTime(finalElapsed);
  }

  this.isTracking = false;
  this.isPaused = false;
  this.appState.setTrackingState(false);
  this.updateTrackingButtons();

  // Prompt for save
  this.promptForSave();

  console.log('✅ GPS tracking stopped');
  return true;
}

  togglePause() {
    if (!this.isTracking) {
      console.warn('Cannot pause - tracking not active');
      return false;
    }

    if (this.isPaused) {
      // Resume
      console.log('▶️ Resuming tracking...');
      this.isPaused = false;
      
      if (this.dependencies.timer) {
        this.dependencies.timer.resume();
      }

      // Restart GPS watch
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handlePositionUpdate(position),
        (error) => this.handlePositionError(error),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000
        }
      );

    } else {
      // Pause
      console.log('⏸️ Pausing tracking...');
      this.isPaused = true;
      
      if (this.dependencies.timer) {
        this.dependencies.timer.pause();
      }

      // Stop GPS watch but keep tracking state
      if (this.watchId) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    }

    this.appState.setTrackingState(this.isTracking, this.isPaused);
    this.updateTrackingButtons();
    return true;
  }

  handlePositionUpdate(position) {
    if (!this.isTracking || this.isPaused) return;

    const { latitude, longitude, accuracy } = position.coords;
    
    // Filter out inaccurate readings
    if (accuracy > 100) {
      console.warn(`GPS accuracy too low: ${accuracy}m`);
      return;
    }

    const currentCoords = { lat: latitude, lng: longitude };
    const lastCoords = this.appState.getLastCoords();

    // Calculate distance if we have a previous point
    if (lastCoords) {
      const distance = haversineDistance(lastCoords, currentCoords);
      
      // Ignore micro-movements (less than 3 meters)
      if (distance < 0.003) return;

      // Update total distance
      const newTotal = this.appState.getTotalDistance() + distance;
      this.appState.updateDistance(newTotal);
      this.updateDistanceDisplay(newTotal);

      // Draw route segment on map
      if (this.dependencies.map) {
        this.dependencies.map.addRouteSegment(lastCoords, currentCoords);
      }
    }

    // Add GPS point to route data
    this.appState.addRoutePoint({
      type: 'location',
      coords: currentCoords,
      timestamp: Date.now(),
      accuracy: accuracy
    });

    this.appState.addPathPoint(currentCoords);

    // Update map marker
    if (this.dependencies.map) {
      this.dependencies.map.updateMarkerPosition(currentCoords);
    }

    console.log(`📍 GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracy.toFixed(1)}m)`);
  }

  handlePositionError(error) {
    console.error('🚨 GPS error:', error);
    
    let errorMessage = 'GPS error: ';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage += 'Location permission denied. Please enable location access and try again.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage += 'Location information unavailable. Please check your GPS settings.';
        break;
      case error.TIMEOUT:
        errorMessage += 'Location request timed out. Please try again.';
        break;
      default:
        errorMessage += 'An unknown error occurred.';
        break;
    }

    alert(errorMessage);

    if (error.code === error.PERMISSION_DENIED) {
      this.stop(); // Stop tracking if permission denied
    }
  }

  updateTrackingButtons() {
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (startBtn) {
      startBtn.disabled = this.isTracking;
      startBtn.style.opacity = this.isTracking ? '0.5' : '1';
    }

    if (pauseBtn) {
      pauseBtn.disabled = !this.isTracking;
      pauseBtn.style.opacity = this.isTracking ? '1' : '0.5';
      
      // Update pause button text/icon based on state
      if (this.isPaused) {
        pauseBtn.innerHTML = '▶'; // Resume icon
        pauseBtn.title = 'Resume Tracking';
      } else {
        pauseBtn.innerHTML = '⏸'; // Pause icon
        pauseBtn.title = 'Pause Tracking';
      }
    }

    if (stopBtn) {
      stopBtn.disabled = !this.isTracking;
      stopBtn.style.opacity = this.isTracking ? '1' : '0.5';
    }
  }

  updateDistanceDisplay(distance) {
    const distanceElement = document.getElementById('distance');
    if (distanceElement) {
      if (distance < 1) {
        distanceElement.textContent = `${(distance * 1000).toFixed(0)} m`;
      } else {
        distanceElement.textContent = `${distance.toFixed(2)} km`;
      }
    }
  }

  // FIXED: Enhanced save prompt with better UI
  promptForSave() {
    const routeData = this.appState.getRouteData();
    const totalDistance = this.appState.getTotalDistance();
    const elapsedTime = this.appState.getElapsedTime();
    
    // Only prompt if we actually have route data
    if (!routeData || routeData.length === 0) {
      console.log('No route data to save');
      return;
    }

    const locationPoints = routeData.filter(point => point.type === 'location').length;
    const photos = routeData.filter(point => point.type === 'photo').length;
    const notes = routeData.filter(point => point.type === 'text').length;

    // Create a detailed save dialog
    const routeStats = `
Route Summary:
📍 GPS Points: ${locationPoints}
📏 Distance: ${totalDistance.toFixed(2)} km
⏱️ Duration: ${this.formatTime(elapsedTime)}
📷 Photos: ${photos}
📝 Notes: ${notes}

Would you like to save this route?`;

    const wantsToSave = confirm(routeStats);
    
    if (wantsToSave) {
      this.saveRoute();
    } else {
      // Ask if they want to discard
      const confirmDiscard = confirm('⚠️ Are you sure you want to discard this route? All data will be lost!');
      if (confirmDiscard) {
        this.discardRoute();
      } else {
        // Give them another chance to save
        this.saveRoute();
      }
    }
  }

// FIXED: Save route with proper cloud integration
// FIXED: Save route with proper cloud integration
// UPDATED: Save route with public/private choice
async saveRoute() {
  try {
    const defaultName = `Route ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    
    let routeName = prompt('Enter a name for this route:', defaultName);
    
    // If they cancelled the name dialog, ask if they want to use default
    if (routeName === null) {
      const useDefault = confirm('Use default name "' + defaultName + '"?');
      routeName = useDefault ? defaultName : null;
    }

    // If they still don't want to name it, don't save
    if (!routeName) {
      console.log('Route save cancelled by user');
      return;
    }

    // Clean up the name
    routeName = routeName.trim() || defaultName;

    // Save to local storage first
    const savedSession = await this.appState.saveSession(routeName);
    
    // Show success message for local save
    this.showSuccessMessage(`✅ "${routeName}" saved locally!`);
    
    // Check if user is logged in and offer cloud save
    const app = window.AccessNatureApp;
    const authController = app?.getController('auth');
    
    if (authController?.isAuthenticated()) {
      // Ask about cloud save with public/private option
      const cloudChoice = this.askCloudSaveOptions(routeName);
      
      if (cloudChoice && cloudChoice !== 'skip') {
        try {
          // Get the current route data before clearing it
          const routeData = this.appState.getRouteData();
          const routeInfo = {
            name: routeName,
            totalDistance: this.appState.getTotalDistance(),
            elapsedTime: this.appState.getElapsedTime(),
            date: new Date().toISOString(),
            makePublic: cloudChoice === 'public' // Add this flag
          };
          
          // Get accessibility data
          let accessibilityData = null;
          try {
            const storedAccessibilityData = localStorage.getItem('accessibilityData');
            accessibilityData = storedAccessibilityData ? JSON.parse(storedAccessibilityData) : null;
          } catch (error) {
            console.warn('Could not load accessibility data:', error);
          }
          
          // Save to cloud directly
          await this.saveRouteToCloud(routeData, routeInfo, accessibilityData, authController);
          
        } catch (cloudError) {
          console.error('❌ Cloud save failed:', cloudError);
          alert('⚠️ Local save successful, but cloud save failed.\nYou can upload it to cloud later from the Routes panel.');
        }
      }
    } else {
      // User not logged in
      const wantsToSignIn = confirm('Route saved locally!\n\n💡 Sign in to save routes to the cloud and create shareable trail guides.\n\nWould you like to sign in now?');
      if (wantsToSignIn && authController?.showAuthModal) {
        authController.showAuthModal();
      }
    }
    
    // Clear route data after saving
    this.appState.clearRouteData();
    console.log('✅ Route saved successfully:', savedSession);
    
  } catch (error) {
    console.error('❌ Failed to save route:', error);
    alert('Failed to save route: ' + error.message);
  }
}

// NEW: Ask user about cloud save options
askCloudSaveOptions(routeName) {
  const message = `"${routeName}" saved locally! 

☁️ Would you like to save to cloud and create a trail guide?

🔒 PRIVATE: Only you can see it (you can make it public later)
🌍 PUBLIC: Share with the community immediately  
❌ SKIP: Keep local only

Choose an option:`;

  const choice = prompt(message + "\n\nType: 'private', 'public', or 'skip'");
  
  if (!choice) return 'skip';
  
  const cleanChoice = choice.toLowerCase().trim();
  
  if (cleanChoice === 'private' || cleanChoice === 'p') {
    return 'private';
  } else if (cleanChoice === 'public' || cleanChoice === 'pub') {
    return 'public';
  } else if (cleanChoice === 'skip' || cleanChoice === 's') {
    return 'skip';
  } else {
    // Invalid choice, ask again with simpler options
    const simpleChoice = confirm('Save to cloud?\n\n✅ OK = Private trail guide\n❌ Cancel = Skip cloud save');
    return simpleChoice ? 'private' : 'skip';
  }
}

// UPDATED: Generate trail guide with public/private setting
async generateTrailGuide(routeId, routeData, routeInfo, accessibilityData, authController) {
  try {
    console.log('🌐 Generating trail guide HTML...');
    
    // Get the export controller to generate HTML
    const app = window.AccessNatureApp;
    const exportController = app?.getController('export');
    
    if (!exportController || typeof exportController.generateRouteSummaryHTML !== 'function') {
      console.warn('Export controller not available for HTML generation');
      return;
    }
    
    const htmlContent = exportController.generateRouteSummaryHTML(routeData, routeInfo, accessibilityData);
    const user = authController.getCurrentUser();
    
    // Create trail guide document
    const trailGuideDoc = {
      routeId: routeId,
      routeName: routeInfo.name,
      userId: user.uid,
      userEmail: user.email,
      htmlContent: htmlContent,
      generatedAt: new Date().toISOString(),
      isPublic: routeInfo.makePublic || false, // Use the user's choice
      
      // Add publication info if made public
      ...(routeInfo.makePublic && {
        publishedAt: new Date().toISOString()
      }),
      
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
      
      // Community features
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
    const { db } = await import('../../firebase-setup.js');
    
    const guideRef = await addDoc(collection(db, 'trail_guides'), trailGuideDoc);
    
    const visibilityText = routeInfo.makePublic ? 'public' : 'private';
    console.log(`✅ ${visibilityText} trail guide generated with ID:`, guideRef.id);
    
  } catch (error) {
    console.error('❌ Failed to generate trail guide:', error);
  }
}

// NEW: Save route to cloud (separate method)
async saveRouteToCloud(routeData, routeInfo, accessibilityData, authController) {
  try {
    console.log('☁️ Saving route to cloud...');
    
    // Import Firestore functions
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const { db } = await import('../../firebase-setup.js');
    
    const user = authController.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Prepare route document for Firestore
    const routeDoc = {
      userId: user.uid,
      userEmail: user.email,
      routeName: routeInfo.name,
      createdAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      
      // Route statistics
      totalDistance: routeInfo.totalDistance || 0,
      elapsedTime: routeInfo.elapsedTime || 0,
      originalDate: routeInfo.date,
      
      // Route data
      routeData: routeData,
      
      // Statistics for quick access
      stats: {
        locationPoints: routeData.filter(p => p.type === 'location').length,
        photos: routeData.filter(p => p.type === 'photo').length,
        notes: routeData.filter(p => p.type === 'text').length,
        totalDataPoints: routeData.length
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

    // Save route to cloud
    const docRef = await addDoc(collection(db, 'routes'), routeDoc);
    console.log('✅ Route saved to cloud with ID:', docRef.id);
    
    // Generate trail guide HTML
    await this.generateTrailGuide(docRef.id, routeData, routeInfo, accessibilityData, authController);
    
    this.showSuccessMessage(`✅ "${routeInfo.name}" saved to cloud with trail guide! ☁️`);
    
  } catch (error) {
    console.error('❌ Cloud save failed:', error);
    throw error;
  }
}

// NEW: Generate trail guide HTML
async generateTrailGuide(routeId, routeData, routeInfo, accessibilityData, authController) {
  try {
    console.log('🌐 Generating trail guide HTML...');
    
    // Get the export controller to generate HTML
    const app = window.AccessNatureApp;
    const exportController = app?.getController('export');
    
    if (!exportController || typeof exportController.generateRouteSummaryHTML !== 'function') {
      console.warn('Export controller not available for HTML generation');
      return;
    }
    
    const htmlContent = exportController.generateRouteSummaryHTML(routeData, routeInfo, accessibilityData);
    const user = authController.getCurrentUser();
    
    // Create trail guide document
    const trailGuideDoc = {
      routeId: routeId,
      routeName: routeInfo.name,
      userId: user.uid,
      userEmail: user.email,
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
      
      // Community features
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
    const { db } = await import('../../firebase-setup.js');
    
    const guideRef = await addDoc(collection(db, 'trail_guides'), trailGuideDoc);
    console.log('✅ Trail guide generated and stored with ID:', guideRef.id);
    
  } catch (error) {
    console.error('❌ Failed to generate trail guide:', error);
    // Don't fail the main save if HTML generation fails
  }
}

// NEW: Save route to cloud (separate method)
async saveRouteToCloud(routeData, routeInfo, accessibilityData, authController) {
  try {
    console.log('☁️ Saving route to cloud...');
    
    // Import Firestore functions
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const { db } = await import('../../firebase-setup.js');
    
    const user = authController.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Prepare route document for Firestore
    const routeDoc = {
      userId: user.uid,
      userEmail: user.email,
      routeName: routeInfo.name,
      createdAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      
      // Route statistics
      totalDistance: routeInfo.totalDistance || 0,
      elapsedTime: routeInfo.elapsedTime || 0,
      originalDate: routeInfo.date,
      
      // Route data
      routeData: routeData,
      
      // Statistics for quick access
      stats: {
        locationPoints: routeData.filter(p => p.type === 'location').length,
        photos: routeData.filter(p => p.type === 'photo').length,
        notes: routeData.filter(p => p.type === 'text').length,
        totalDataPoints: routeData.length
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

    // Save route to cloud
    const docRef = await addDoc(collection(db, 'routes'), routeDoc);
    console.log('✅ Route saved to cloud with ID:', docRef.id);
    
    // Generate trail guide HTML
    await this.generateTrailGuide(docRef.id, routeData, routeInfo, accessibilityData, authController);
    
    this.showSuccessMessage(`✅ "${routeInfo.name}" saved to cloud with trail guide! ☁️`);
    
  } catch (error) {
    console.error('❌ Cloud save failed:', error);
    throw error;
  }
}

// NEW: Generate trail guide HTML
async generateTrailGuide(routeId, routeData, routeInfo, accessibilityData, authController) {
  try {
    console.log('🌐 Generating trail guide HTML...');
    
    // Get the export controller to generate HTML
    const app = window.AccessNatureApp;
    const exportController = app?.getController('export');
    
    if (!exportController || typeof exportController.generateRouteSummaryHTML !== 'function') {
      console.warn('Export controller not available for HTML generation');
      return;
    }
    
    const htmlContent = exportController.generateRouteSummaryHTML(routeData, routeInfo, accessibilityData);
    const user = authController.getCurrentUser();
    
    // Create trail guide document
    const trailGuideDoc = {
      routeId: routeId,
      routeName: routeInfo.name,
      userId: user.uid,
      userEmail: user.email,
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
      
      // Community features
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
    const { db } = await import('../../firebase-setup.js');
    
    const guideRef = await addDoc(collection(db, 'trail_guides'), trailGuideDoc);
    console.log('✅ Trail guide generated and stored with ID:', guideRef.id);
    
  } catch (error) {
    console.error('❌ Failed to generate trail guide:', error);
    // Don't fail the main save if HTML generation fails
  }
}

  discardRoute() {
    this.appState.clearRouteData();
    this.showSuccessMessage('Route discarded');
    console.log('🗑️ Route data discarded');
  }

  showSuccessMessage(message) {
    // Create and show success notification
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
    `;

    // Add animation
    const style = document.createElement('style');
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

    document.body.appendChild(successDiv);
    
    // Remove after 4 seconds
    setTimeout(() => {
      successDiv.style.animation = 'slideDown 0.4s ease reverse';
      setTimeout(() => {
        successDiv.remove();
        style.remove();
      }, 400);
    }, 4000);
  }

  formatTime(milliseconds) {
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

  // Getters
  isTrackingActive() {
    return this.isTracking;
  }

  isPausedState() {
    return this.isPaused;
  }

  getTrackingStats() {
    return {
      isTracking: this.isTracking,
      isPaused: this.isPaused,
      totalDistance: this.appState.getTotalDistance(),
      elapsedTime: this.appState.getElapsedTime(),
      pointCount: this.appState.getRouteData().length
    };
  }

  cleanup() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    if (this.dependencies.timer) {
      this.dependencies.timer.stop();
    }
    
    this.isTracking = false;
    this.isPaused = false;
  }
}