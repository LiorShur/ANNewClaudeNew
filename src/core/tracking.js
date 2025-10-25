// tracking.js - Refactored GPS Tracking Controller with Debug Logging
import { haversineDistance } from '../utils/calculations.js';

export class TrackingController {
  constructor(appState) {
    this.appState = appState;
    this.watchId = null;
    this.isTracking = false;
    this.isPaused = false;
    this.dependencies = {};
    this.retryCount = 0;
    this.maxRetries = 3;
    
    console.log('🎯 TrackingController created');
  }

  setDependencies(deps) {
    this.dependencies = deps;
    console.log('🔗 TrackingController dependencies set:', {
      hasState: !!deps.state,
      hasMap: !!deps.map,
      hasTimer: !!deps.timer,
      hasFirebase: !!deps.firebase,
      hasAuth: !!deps.auth,
      hasDialogs: !!deps.dialogs
    });
  }

  async start() {
    if (this.isTracking) return false;
    
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported by this browser');
    }

    console.log('🚀 Starting GPS tracking...');

    // Check if resuming a restored route
    const currentElapsed = this.appState.getElapsedTime();
    const isResuming = currentElapsed > 0 && this.appState.getRouteData().length > 0;

    if (!isResuming) {
      // Starting fresh
      this.appState.clearRouteData();
      this.appState.setStartTime(Date.now());
    } else {
      // Resuming - adjust start time
      const currentTime = Date.now();
      const adjustedStartTime = currentTime - currentElapsed;
      this.appState.setStartTime(adjustedStartTime);
      this.appState.setElapsedTime(currentElapsed);
      console.log(`🔄 Resuming route with ${this.formatTime(currentElapsed)} elapsed`);
    }

    this.isTracking = true;
    this.isPaused = false;
    this.retryCount = 0;
    this.appState.setTrackingState(true);

    // Start GPS watch
    this.startGPSWatch();

    // Start timer
    if (this.dependencies.timer) {
      if (isResuming) {
        this.dependencies.timer.start(currentElapsed);
      } else {
        this.dependencies.timer.start();
      }
    }

    this.updateTrackingButtons();
    console.log(isResuming ? '✅ GPS tracking resumed' : '✅ GPS tracking started');
    
    return true;
  }

  startGPSWatch() {
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionUpdate(position),
      (error) => this.handlePositionError(error),
      this.getGPSOptions()
    );
  }

  getGPSOptions() {
    return {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    };
  }

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
      
      this.startGPSWatch();
    } else {
      // Pause
      console.log('⏸️ Pausing tracking...');
      this.isPaused = true;
      
      if (this.dependencies.timer) {
        this.dependencies.timer.pause();
      }
      
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

    // Reset retry count on successful position
    this.retryCount = 0;

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

    // Retry logic for timeouts
    if (error.code === error.TIMEOUT && this.retryCount < this.maxRetries) {
      this.retryCount++;
      const retryDelay = 2000 * this.retryCount;
      console.log(`GPS timeout, retry ${this.retryCount}/${this.maxRetries} in ${retryDelay}ms...`);
      
      setTimeout(() => {
        if (this.isTracking && !this.isPaused) {
          this.startGPSWatch();
        }
      }, retryDelay);
      return;
    }

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
      this.stop();
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
      
      if (this.isPaused) {
        pauseBtn.innerHTML = '▶';
        pauseBtn.title = 'Resume Tracking';
      } else {
        pauseBtn.innerHTML = '⏸';
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

  async promptForSave() {
    const routeData = this.appState.getRouteData();
    const totalDistance = this.appState.getTotalDistance();
    const elapsedTime = this.appState.getElapsedTime();

    // Only prompt if we have route data
    if (!routeData || routeData.length === 0) {
      console.log('No route data to save');
      return;
    }

    const locationPoints = routeData.filter(point => point.type === 'location').length;
    const photos = routeData.filter(point => point.type === 'photo').length;
    const notes = routeData.filter(point => point.type === 'text').length;

    // Use custom dialog if available
    if (this.dependencies.dialogs) {
      console.log('🎨 Using custom dialog system');
      const result = await this.dependencies.dialogs.showSaveDialog({
        locationPoints,
        distance: totalDistance,
        duration: elapsedTime,
        photos,
        notes
      });

      if (result.save) {
        await this.saveRoute(result.name, result.options);
      } else if (result.discard) {
        this.discardRoute();
      }
    } else {
      console.log('📋 Using fallback confirm dialogs');
      // Fallback to confirm dialogs
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
        await this.saveRoute();
      } else {
        const confirmDiscard = confirm('⚠️ Are you sure you want to discard this route? All data will be lost!');
        if (confirmDiscard) {
          this.discardRoute();
        } else {
          await this.saveRoute();
        }
      }
    }
  }

  async saveRoute(routeName = null, options = {}) {
    try {
      console.log('💾 === SAVE ROUTE STARTED ===');
      console.log('📋 Input:', { routeName, options });

      // Get route name
      if (!routeName) {
        const defaultName = `Route ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        routeName = prompt('Enter a name for this route:', defaultName);
        
        if (routeName === null) {
          const useDefault = confirm('Use default name "' + defaultName + '"?');
          routeName = useDefault ? defaultName : null;
        }
        
        if (!routeName) {
          console.log('❌ Route save cancelled by user');
          return;
        }
      }

      routeName = routeName.trim();
      console.log('📝 Route name:', routeName);

      // Save to local storage first
      const savedSession = await this.appState.saveSession(routeName);
      this.showSuccessMessage(`✅ "${routeName}" saved locally!`);
      console.log('✅ Local save complete');

      // === DEBUG AUTH STATE ===
      console.log('🔍 === CHECKING AUTH STATE ===');
      console.log('📦 Dependencies:', {
        hasAuth: !!this.dependencies.auth,
        hasFirebase: !!this.dependencies.firebase,
        hasDialogs: !!this.dependencies.dialogs
      });

      const authController = this.dependencies.auth;
      
      if (!authController) {
        console.error('❌ Auth controller is undefined!');
        console.log('📦 All dependencies:', Object.keys(this.dependencies));
        alert('Error: Authentication system not available. Please refresh the page.');
        return;
      }

      console.log('✅ Auth controller exists');

      // Check authentication multiple ways
      let currentUser = null;
      let isAuthenticated = false;

      try {
        currentUser = authController.getCurrentUser();
        console.log('👤 getCurrentUser() result:', currentUser ? {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName
        } : null);
      } catch (error) {
        console.error('❌ Error calling getCurrentUser():', error);
      }

      try {
        isAuthenticated = authController.isAuthenticated();
        console.log('🔐 isAuthenticated() result:', isAuthenticated);
      } catch (error) {
        console.error('❌ Error calling isAuthenticated():', error);
      }

      // Double check with direct property access
      console.log('🔍 Auth controller properties:', {
        currentUser: authController.currentUser,
        hasCurrentUser: !!authController.currentUser
      });

      // Final decision
      const userIsSignedIn = currentUser !== null && currentUser !== undefined;
      console.log('✅ Final auth decision: User is', userIsSignedIn ? 'SIGNED IN' : 'NOT signed in');

      if (userIsSignedIn) {
        console.log('☁️ === ATTEMPTING CLOUD SAVE ===');
        
        const firebaseController = this.dependencies.firebase;
        
        if (!firebaseController) {
          console.error('❌ Firebase controller not available');
          alert('⚠️ Local save successful, but cloud sync is not available. Please try syncing from the Routes panel later.');
          this.appState.clearRouteData();
          return;
        }

        console.log('✅ Firebase controller available');

        const cloudChoice = options.visibility || await this.askCloudSaveOptions(routeName);
        console.log('📊 Cloud save choice:', cloudChoice);
        
        if (cloudChoice && cloudChoice !== 'skip') {
          try {
            const routeData = this.appState.getRouteData();
            const metadata = {
              name: routeName,
              totalDistance: this.appState.getTotalDistance(),
              elapsedTime: this.appState.getElapsedTime(),
              isPublic: cloudChoice === 'public'
            };

            console.log('📤 Preparing cloud save with metadata:', metadata);

            // Get accessibility data
            let accessibilityData = null;
            try {
              const storedData = localStorage.getItem('accessibilityData');
              accessibilityData = storedData ? JSON.parse(storedData) : null;
              console.log('♿ Accessibility data:', accessibilityData ? 'Found' : 'None');
            } catch (error) {
              console.warn('⚠️ Could not load accessibility data:', error);
            }

            // Save to cloud using FirebaseController
            console.log('☁️ Calling firebaseController.saveRouteToCloud()...');
            const routeId = await firebaseController.saveRouteToCloud(routeData, metadata);
            console.log('✅ Cloud save successful! Route ID:', routeId);
            
            this.showSuccessMessage(`✅ "${routeName}" saved to cloud! ☁️`);
          } catch (cloudError) {
            console.error('❌ Cloud save failed:', cloudError);
            console.error('Error details:', {
              message: cloudError.message,
              code: cloudError.code,
              stack: cloudError.stack
            });
            alert('⚠️ Local save successful, but cloud save failed.\nYou can upload to cloud later from the Routes panel.');
          }
        } else {
          console.log('⏭️ User skipped cloud save');
        }
      } else {
        console.log('🔓 === USER NOT SIGNED IN ===');
        
        // User not logged in
        const wantsToSignIn = confirm('Route saved locally!\n\n💡 Sign in to save routes to the cloud and create shareable trail guides.\n\nWould you like to sign in now?');
        
        if (wantsToSignIn) {
          console.log('👉 User wants to sign in, looking for sign in button...');
          
          // Try multiple sign in button IDs
          const signInBtn = document.getElementById('showAuthBtn') || 
                           document.getElementById('googleLoginBtn') ||
                           document.getElementById('signInBtn');
          
          if (signInBtn) {
            console.log('✅ Found sign in button, clicking...');
            signInBtn.click();
          } else {
            console.error('❌ No sign in button found');
            alert('Please use the sign in button in the menu to authenticate.');
          }
        } else {
          console.log('⏭️ User declined sign in');
        }
      }

      // Clear route data after saving
      this.appState.clearRouteData();
      console.log('✅ Route data cleared');
      console.log('💾 === SAVE ROUTE COMPLETE ===');

    } catch (error) {
      console.error('❌ === SAVE ROUTE FAILED ===');
      console.error('Error:', error);
      console.error('Stack:', error.stack);
      alert('Failed to save route: ' + error.message);
    }
  }

  async askCloudSaveOptions(routeName) {
    console.log('❓ Asking user for cloud save options...');
    
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
      console.log('✅ User chose: private');
      return 'private';
    } else if (cleanChoice === 'public' || cleanChoice === 'pub') {
      console.log('✅ User chose: public');
      return 'public';
    } else if (cleanChoice === 'skip' || cleanChoice === 's') {
      console.log('✅ User chose: skip');
      return 'skip';
    } else {
      console.log('❓ Invalid choice, showing simple confirm...');
      const simpleChoice = confirm('Save to cloud?\n\n✅ OK = Private trail guide\n❌ Cancel = Skip cloud save');
      const result = simpleChoice ? 'private' : 'skip';
      console.log('✅ User chose:', result);
      return result;
    }
  }

  discardRoute() {
    console.log('🗑️ Discarding route');
    this.appState.clearRouteData();
    this.showSuccessMessage('Route discarded');
  }

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
    `;

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
    console.log('🧹 Cleaning up tracking controller');
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
