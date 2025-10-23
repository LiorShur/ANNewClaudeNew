// tracking.js - Refactored GPS Tracking Controller
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
    // Adaptive GPS options for battery optimization
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
      // Get route name
      if (!routeName) {
        const defaultName = `Route ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        routeName = prompt('Enter a name for this route:', defaultName);
        
        if (routeName === null) {
          const useDefault = confirm('Use default name "' + defaultName + '"?');
          routeName = useDefault ? defaultName : null;
        }
        
        if (!routeName) {
          console.log('Route save cancelled by user');
          return;
        }
      }

      routeName = routeName.trim();

      // Save to local storage first
      const savedSession = await this.appState.saveSession(routeName);
      this.showSuccessMessage(`✅ "${routeName}" saved locally!`);

      // Check if user is logged in for cloud save
      const authController = this.dependencies.auth;
      
      if (authController?.isAuthenticated()) {
        // Use FirebaseController for cloud save
        const firebaseController = this.dependencies.firebase;
        
        if (firebaseController) {
          const cloudChoice = options.visibility || await this.askCloudSaveOptions(routeName);
          
          if (cloudChoice && cloudChoice !== 'skip') {
            try {
              const routeData = this.appState.getRouteData();
              const metadata = {
                name: routeName,
                totalDistance: this.appState.getTotalDistance(),
                elapsedTime: this.appState.getElapsedTime(),
                isPublic: cloudChoice === 'public'
              };

              // Get accessibility data
              let accessibilityData = null;
              try {
                const storedData = localStorage.getItem('accessibilityData');
                accessibilityData = storedData ? JSON.parse(storedData) : null;
              } catch (error) {
                console.warn('Could not load accessibility data:', error);
              }

              // Save to cloud using FirebaseController
              await firebaseController.saveRouteToCloud(routeData, metadata);
              
              this.showSuccessMessage(`✅ "${routeName}" saved to cloud! ☁️`);
            } catch (cloudError) {
              console.error('❌ Cloud save failed:', cloudError);
              alert('⚠️ Local save successful, but cloud save failed.\nYou can upload to cloud later from the Routes panel.');
            }
          }
        }
      } else {
        // User not logged in
        const wantsToSignIn = confirm('Route saved locally!\n\n💡 Sign in to save routes to the cloud and create shareable trail guides.\n\nWould you like to sign in now?');
        
        if (wantsToSignIn) {
          // Trigger sign in
          const signInBtn = document.getElementById('showAuthBtn') || document.getElementById('googleLoginBtn');
          if (signInBtn) signInBtn.click();
        }
      }

      // Clear route data after saving
      this.appState.clearRouteData();
      console.log('✅ Route saved successfully');

    } catch (error) {
      console.error('❌ Failed to save route:', error);
      alert('Failed to save route: ' + error.message);
    }
  }

  async askCloudSaveOptions(routeName) {
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
      const simpleChoice = confirm('Save to cloud?\n\n✅ OK = Private trail guide\n❌ Cancel = Skip cloud save');
      return simpleChoice ? 'private' : 'skip';
    }
  }

  discardRoute() {
    this.appState.clearRouteData();
    this.showSuccessMessage('Route discarded');
    console.log('🗑️ Route data discarded');
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