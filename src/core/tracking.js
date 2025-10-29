// tracking.js - Enhanced GPS Tracking Controller with Toast Notifications
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
      if (window.toast) {
        window.toast.error('GPS Not Supported', 'Your browser does not support geolocation');
      }
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
    
    // Show recording indicator
    const indicator = document.getElementById('recordingIndicator');
    if (indicator) {
      indicator.classList.add('active');
    }
    
    // Show toast notification
    if (window.toast) {
      if (isResuming) {
        window.toast.success('Tracking Resumed', 'Continuing your trail recording');
      } else {
        window.toast.success('Tracking Started', 'Recording your trail');
      }
    }
    
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
      if (window.toast) {
        window.toast.warning('Not Tracking', 'Tracking is not currently active');
      }
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

    // Hide recording indicator
    const indicator = document.getElementById('recordingIndicator');
    if (indicator) {
      indicator.classList.remove('active');
    }

    // Show toast notification
    if (window.toast) {
      window.toast.info('Tracking Stopped', 'You can now save your route');
    }

    // Prompt for save
    this.promptForSave();

    console.log('✅ GPS tracking stopped');
    return true;
  }

  togglePause() {
    if (!this.isTracking) {
      console.warn('Cannot pause - tracking not active');
      if (window.toast) {
        window.toast.warning('Cannot Pause', 'Tracking is not active');
      }
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
      
      // Show toast
      if (window.toast) {
        window.toast.success('Tracking Resumed', 'Recording continues');
      }
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
      
      // Show toast
      if (window.toast) {
        window.toast.info('Tracking Paused', 'Resume when ready');
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
      if (window.toast && this.retryCount === 0) {
        window.toast.warning('GPS Accuracy Low', `Accuracy: ${Math.round(accuracy)}m - Waiting for better signal`);
      }
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

    // Update status bar
    this.updateStatusBar();

    console.log(`📍 GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracy.toFixed(1)}m)`);
  }

  handlePositionError(error) {
    console.error('🚨 GPS error:', error);

    // Retry logic for timeouts
    if (error.code === error.TIMEOUT && this.retryCount < this.maxRetries) {
      this.retryCount++;
      const retryDelay = 2000 * this.retryCount;
      console.log(`GPS timeout, retry ${this.retryCount}/${this.maxRetries} in ${retryDelay}ms...`);
      
      if (window.toast && this.retryCount === 1) {
        window.toast.warning('GPS Timeout', `Retrying... (${this.retryCount}/${this.maxRetries})`);
      }
      
      setTimeout(() => {
        if (this.isTracking && !this.isPaused) {
          this.startGPSWatch();
        }
      }, retryDelay);
      return;
    }

    let errorMessage = '';
    let errorTitle = 'GPS Error';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorTitle = 'Location Permission Denied';
        errorMessage = 'Please enable location access in your browser settings and try again.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorTitle = 'Location Unavailable';
        errorMessage = 'Location information is unavailable. Please check your GPS settings.';
        break;
      case error.TIMEOUT:
        errorTitle = 'Location Timeout';
        errorMessage = 'Location request timed out. Please try again.';
        break;
      default:
        errorTitle = 'Unknown GPS Error';
        errorMessage = 'An unknown error occurred.';
        break;
    }

    // Show toast notification
    if (window.toast) {
      window.toast.error(errorTitle, errorMessage);
    } else {
      alert(errorTitle + ': ' + errorMessage);
    }

    if (error.code === error.PERMISSION_DENIED) {
      this.stop();
    }
  }

  updateTrackingButtons() {
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (!startBtn || !pauseBtn || !stopBtn) return;

    if (!this.isTracking) {
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      stopBtn.style.display = 'none';
    } else if (this.isPaused) {
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
      pauseBtn.textContent = '▶';
      pauseBtn.title = 'Resume';
      stopBtn.style.display = 'inline-block';
    } else {
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
      pauseBtn.textContent = '⏸';
      pauseBtn.title = 'Pause';
      stopBtn.style.display = 'inline-block';
    }
  }

  updateDistanceDisplay(distance) {
    const distanceElement = document.getElementById('distance');
    if (distanceElement) {
      distanceElement.textContent = `${distance.toFixed(2)} km`;
    }
    
    const statusDistanceElement = document.getElementById('statusDistance');
    if (statusDistanceElement) {
      statusDistanceElement.textContent = distance.toFixed(2);
    }
  }

  updateStatusBar() {
    // Update points count
    const statusPoints = document.getElementById('statusPoints');
    if (statusPoints) {
      const routeData = this.appState.getRouteData();
      const locationPoints = routeData.filter(p => p.type === 'location').length;
      statusPoints.textContent = locationPoints;
    }

    // Calculate and update speed
    const routeData = this.appState.getRouteData();
    const locationPoints = routeData.filter(p => p.type === 'location');
    
    if (locationPoints.length >= 2) {
      const lastPoint = locationPoints[locationPoints.length - 1];
      const prevPoint = locationPoints[locationPoints.length - 2];
      const timeDiff = (lastPoint.timestamp - prevPoint.timestamp) / 1000 / 3600; // hours
      const distance = haversineDistance(prevPoint.coords, lastPoint.coords);
      const speed = timeDiff > 0 ? distance / timeDiff : 0;
      
      const statusSpeed = document.getElementById('statusSpeed');
      if (statusSpeed) {
        statusSpeed.textContent = speed.toFixed(1);
      }
    }
  }

  promptForSave() {
    const routeData = this.appState.getRouteData();
    
    if (!routeData || routeData.length === 0) {
      console.log('No route data to save');
      return;
    }

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.style.display = 'inline-block';
      saveBtn.onclick = () => this.saveRoute();
    } else {
      // Fallback to prompt
      if (confirm('Would you like to save this route?')) {
        this.saveRoute();
      }
    }
  }

  async saveRoute(options = {}) {
    try {
      console.log('💾 === STARTING SAVE ROUTE ===');
      
      const routeData = this.appState.getRouteData();
      
      if (!routeData || routeData.length === 0) {
        console.error('❌ No route data to save');
        if (window.toast) {
          window.toast.error('No Data', 'No route data to save');
        }
        return;
      }

      console.log('📊 Route data to save:', {
        totalPoints: routeData.length,
        locationPoints: routeData.filter(p => p.type === 'location').length,
        photos: routeData.filter(p => p.type === 'photo').length,
        notes: routeData.filter(p => p.type === 'text').length
      });

      // Get route name
      const routeName = options.name || prompt('Enter route name:', `Trail ${new Date().toLocaleDateString()}`);
      
      if (!routeName) {
        console.log('❌ Save cancelled - no route name');
        return;
      }

      // Save locally
      console.log('💾 Saving locally...');
      const session = {
        id: Date.now(),
        name: routeName,
        date: Date.now(),
        data: routeData,
        totalDistance: this.appState.getTotalDistance(),
        elapsedTime: this.appState.getElapsedTime()
      };

      const sessions = this.appState.getSessions();
      sessions.push(session);
      this.appState.saveSessions(sessions);
      
      console.log('✅ Local save complete');

      // Check authentication status
      let isAuthenticated = false;
      let currentUser = null;
      const authController = this.dependencies.auth;

      if (!authController) {
        console.log('⚠️ Auth controller not available');
      } else {
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

        const userIsSignedIn = currentUser !== null && currentUser !== undefined;
        console.log('✅ Final auth decision: User is', userIsSignedIn ? 'SIGNED IN' : 'NOT signed in');

        if (userIsSignedIn) {
          console.log('☁️ === ATTEMPTING CLOUD SAVE ===');
          
          const firebaseController = this.dependencies.firebase;
          
          if (!firebaseController) {
            console.error('❌ Firebase controller not available');
            if (window.toast) {
              window.toast.warning('Local Only', 'Route saved locally. Cloud sync unavailable.');
            }
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

              // Show loading toast
              if (window.toast) {
                window.toast.info('Saving to Cloud', 'Uploading your trail...');
              }

              // Save to cloud using FirebaseController
              console.log('☁️ Calling firebaseController.saveRouteToCloud()...');
              const routeId = await firebaseController.saveRouteToCloud(routeData, metadata);
              console.log('✅ Cloud save successful! Route ID:', routeId);
              
              // Show success toast
              if (window.toast) {
                window.toast.success('Saved to Cloud', `"${routeName}" saved successfully! ☁️`);
              }
            } catch (cloudError) {
              console.error('❌ Cloud save failed:', cloudError);
              console.error('Error details:', {
                message: cloudError.message,
                code: cloudError.code,
                stack: cloudError.stack
              });
              
              if (window.toast) {
                window.toast.warning('Cloud Save Failed', 'Saved locally. You can upload to cloud later.');
              }
            }
          } else {
            console.log('⏭️ User skipped cloud save');
          }
        } else {
          console.log('🔓 === USER NOT SIGNED IN ===');
          
          // Show toast with sign-in prompt
          if (window.toast) {
            window.toast.success('Route Saved Locally', 'Sign in to save routes to the cloud');
          }
          
          // User not logged in
          const wantsToSignIn = confirm('Route saved locally!\n\n💡 Sign in to save routes to the cloud and create shareable trail guides.\n\nWould you like to sign in now?');
          
          if (wantsToSignIn) {
            console.log('👉 User wants to sign in, looking for sign in button...');
            
            const signInBtn = document.getElementById('showAuthBtn') || 
                             document.getElementById('googleLoginBtn') ||
                             document.getElementById('signInBtn');
            
            if (signInBtn) {
              console.log('✅ Found sign in button, clicking...');
              signInBtn.click();
            } else {
              console.error('❌ No sign in button found');
              if (window.toast) {
                window.toast.info('Sign In', 'Please use the sign in button in the menu');
              }
            }
          }
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
      
      if (window.toast) {
        window.toast.error('Save Failed', error.message);
      } else {
        alert('Failed to save route: ' + error.message);
      }
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
    
    if (window.toast) {
      window.toast.info('Route Discarded', 'Route data has been cleared');
    }
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