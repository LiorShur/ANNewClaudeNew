// storage.js - Enhanced Storage Controller with IndexedDB
import { RouteDB } from './indexeddb.js';
import { throttle } from '../utils/helpers.js';

export class AppState {
  constructor() {
    this.routeData = [];
    this.pathPoints = [];
    this.totalDistance = 0;
    this.elapsedTime = 0;
    this.isTracking = false;
    this.isPaused = false;
    this.startTime = null;
    this.lastCoords = null;
    this.lastBackupTime = 0;
    this.backupInterval = null;

    // IndexedDB integration
    this.routeDB = new RouteDB();
    this.dbReady = false;

    // Throttled UI updates for performance
    this.throttledDistanceUpdate = throttle(this.updateDistanceDisplay.bind(this), 500);
    this.throttledTimerUpdate = throttle(this.updateTimerDisplay.bind(this), 1000);

    // Add cleanup listeners to prevent memory leaks
    this.setupCleanupListeners();

    // Initialize database
    this.initDB();
  }

  setupCleanupListeners() {
    window.addEventListener('beforeunload', () => {
      this.stopAutoBackup();
      if (this.isTracking) {
        this.autoSave(); // Final backup before exit
      }
    });

    window.addEventListener('pagehide', () => {
      this.stopAutoBackup();
    });
  }

  async initDB() {
    try {
      await this.routeDB.init();
      this.dbReady = true;
      console.log('✅ IndexedDB ready - Large storage capacity available');

      // Migrate localStorage data if exists
      await this.migrateFromLocalStorage();
    } catch (error) {
      console.warn('⚠️ IndexedDB failed, falling back to localStorage:', error);
      this.dbReady = false;
    }
  }

  async migrateFromLocalStorage() {
    try {
      const migrationStatus = localStorage.getItem('indexeddb_migration');
      
      if (migrationStatus === 'completed') {
        console.log('ℹ️ Migration already completed');
        
        // Check for orphaned backup data
        const backupData = localStorage.getItem('sessions_backup_pre_migration');
        if (backupData) {
          const existingRoutes = await this.routeDB.getAllRoutes();
          if (existingRoutes.length === 0) {
            console.log('🔄 Found orphaned backup data, attempting recovery...');
            await this.recoverFromBackup();
          }
        }
        return;
      }

      // Migrate sessions
      const oldSessions = JSON.parse(localStorage.getItem('sessions') || '[]');
      
      if (oldSessions.length > 0) {
        console.log(`🔄 Migrating ${oldSessions.length} routes from localStorage to IndexedDB...`);
        
        let migratedCount = 0;
        for (const session of oldSessions) {
          try {
            await this.routeDB.saveRoute({
              ...session,
              migrated: true,
              migratedAt: new Date().toISOString(),
              migratedFrom: 'localStorage',
              version: '2.0'
            });
            migratedCount++;
            console.log(`✅ Migrated: ${session.name}`);
          } catch (error) {
            console.error(`❌ Failed to migrate route ${session.name}:`, error);
          }
        }

        if (migratedCount > 0) {
          // Keep backup, then clear
          localStorage.setItem('sessions_backup_pre_migration', localStorage.getItem('sessions'));
          localStorage.removeItem('sessions');
          console.log(`✅ Successfully migrated ${migratedCount}/${oldSessions.length} routes`);
        }
      }

      // Migrate backup
      const oldBackup = localStorage.getItem('route_backup');
      if (oldBackup) {
        try {
          await this.routeDB.saveBackup(JSON.parse(oldBackup));
          localStorage.removeItem('route_backup');
          console.log('✅ Route backup migrated to IndexedDB');
        } catch (error) {
          console.error('❌ Failed to migrate backup:', error);
        }
      }

      localStorage.setItem('indexeddb_migration', 'completed');
      console.log('✅ IndexedDB migration completed successfully');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
    }
  }

  async recoverFromBackup() {
    try {
      const backupData = localStorage.getItem('sessions_backup_pre_migration');
      if (!backupData) return;

      const oldSessions = JSON.parse(backupData);
      console.log(`🔄 Recovering ${oldSessions.length} routes from backup...`);

      let recoveredCount = 0;
      for (const session of oldSessions) {
        try {
          await this.routeDB.saveRoute({
            ...session,
            migrated: true,
            migratedAt: new Date().toISOString(),
            migratedFrom: 'localStorage_backup_recovery',
            version: '2.0'
          });
          recoveredCount++;
        } catch (error) {
          console.error(`❌ Failed to recover route ${session.name}:`, error);
        }
      }

      console.log(`✅ Successfully recovered ${recoveredCount}/${oldSessions.length} routes`);
    } catch (error) {
      console.error('❌ Recovery failed:', error);
    }
  }

  addRoutePoint(entry) {
    this.routeData.push({
      ...entry,
      timestamp: entry.timestamp || Date.now()
    });

    // Smart backup: every 10 points or every 2 minutes
    const shouldBackup = this.routeData.length % 10 === 0 || 
                        (Date.now() - this.lastBackupTime) > 120000;

    if (shouldBackup && this.isTracking) {
      this.autoSave();
    }
  }

  getRouteData() {
    return [...this.routeData];
  }

  clearRouteData() {
    this.routeData = [];
    this.pathPoints = [];
    this.totalDistance = 0;
    this.elapsedTime = 0;
    this.lastCoords = null;
    this.isTracking = false;
    this.isPaused = false;
    this.stopAutoBackup();
    this.clearRouteBackup();
  }

  updateDistance(distance) {
    this.totalDistance = distance;
    this.throttledDistanceUpdate();
  }

  getTotalDistance() {
    return this.totalDistance;
  }

  setTrackingState(isTracking, isPaused = false) {
    this.isTracking = isTracking;
    this.isPaused = isPaused;

    if (isTracking && !isPaused) {
      this.startAutoBackup();
    } else {
      this.stopAutoBackup();
    }
  }

  getTrackingState() {
    return {
      isTracking: this.isTracking,
      isPaused: this.isPaused
    };
  }

  setElapsedTime(time) {
    this.elapsedTime = time;
    this.throttledTimerUpdate();
  }

  getElapsedTime() {
    return this.elapsedTime;
  }

  setStartTime(time) {
    this.startTime = time;
  }

  getStartTime() {
    return this.startTime;
  }

  addPathPoint(coords) {
    this.lastCoords = coords;
    this.pathPoints.push(coords);
  }

  getLastCoords() {
    return this.lastCoords;
  }

  async saveSession(name) {
    if (!name || this.routeData.length === 0) {
      throw new Error('Invalid session data');
    }

    const session = {
      id: Date.now(),
      name,
      date: new Date().toISOString(),
      totalDistance: this.totalDistance,
      elapsedTime: this.elapsedTime,
      data: [...this.routeData],
      dataSize: JSON.stringify(this.routeData).length,
      version: '2.0'
    };

    try {
      if (this.dbReady) {
        await this.routeDB.saveRoute(session);
        console.log(`✅ Route "${name}" saved to IndexedDB (${session.dataSize} bytes)`);
      } else {
        const sessions = await this.getSessions();
        sessions.push(session);
        localStorage.setItem('sessions', JSON.stringify(sessions));
        console.log(`✅ Route "${name}" saved to localStorage (fallback)`);
      }

      await this.clearRouteBackup();
      return session;

    } catch (error) {
      console.error('❌ Save failed:', error);

      // Fallback to localStorage if IndexedDB fails
      if (this.dbReady && error.name === 'QuotaExceededError') {
        console.log('💾 IndexedDB quota exceeded, trying localStorage fallback...');
        try {
          const sessions = await this.getSessions();
          sessions.push(session);
          localStorage.setItem('sessions', JSON.stringify(sessions));
          console.log('✅ Route saved to localStorage (quota fallback)');
          return session;
        } catch (fallbackError) {
          throw new Error('Storage quota exceeded on both IndexedDB and localStorage');
        }
      }

      throw error;
    }
  }

  async getSessions() {
    try {
      if (this.dbReady) {
        const routes = await this.routeDB.getAllRoutes();
        return routes.sort((a, b) => new Date(b.date) - new Date(a.date));
      } else {
        return JSON.parse(localStorage.getItem('sessions') || '[]');
      }
    } catch (error) {
      console.error('❌ Failed to get sessions:', error);
      
      try {
        return JSON.parse(localStorage.getItem('sessions') || '[]');
      } catch (fallbackError) {
        console.error('❌ localStorage fallback also failed:', fallbackError);
        return [];
      }
    }
  }

  async autoSave() {
    let currentElapsed = this.elapsedTime;

    // Get live elapsed time if tracking is active
    if (this.isTracking) {
      const app = window.AccessNatureApp;
      const timer = app?.getController('timer');
      
      if (timer && timer.isTimerRunning()) {
        currentElapsed = timer.getCurrentElapsed();
      }
    }

    const backup = {
      routeData: this.routeData,
      pathPoints: this.pathPoints,
      totalDistance: this.totalDistance,
      elapsedTime: currentElapsed,
      startTime: this.startTime,
      isTracking: this.isTracking,
      isPaused: this.isPaused,
      backupTime: Date.now(),
      deviceInfo: {
        userAgent: navigator.userAgent,
        url: window.location.href
      }
    };

    try {
      if (this.dbReady) {
        await this.routeDB.saveBackup(backup);
        console.log(`💾 Backup to IndexedDB: ${this.routeData.length} points, ${this.totalDistance.toFixed(2)} km, ${Math.floor(currentElapsed/1000)}s`);
      } else {
        localStorage.setItem('route_backup', JSON.stringify(backup));
        console.log(`💾 Backup to localStorage: ${this.routeData.length} points, ${Math.floor(currentElapsed/1000)}s`);
      }
      
      this.lastBackupTime = Date.now();
      
    } catch (error) {
      console.warn('Auto-save failed:', error);
      
      // Fallback to localStorage
      try {
        localStorage.setItem('route_backup', JSON.stringify(backup));
        console.log('💾 Backup fallback to localStorage successful');
      } catch (fallbackError) {
        console.error('❌ Both IndexedDB and localStorage backup failed');
      }
    }
  }

  async checkForUnsavedRoute() {
    try {
      let backup = null;

      // Try IndexedDB first
      if (this.dbReady) {
        try {
          backup = await this.routeDB.getBackup();
          if (backup) {
            console.log('📥 Backup found in IndexedDB');
          }
        } catch (dbError) {
          console.warn('⚠️ IndexedDB backup check failed:', dbError);
        }
      }

      // Fallback to localStorage
      if (!backup) {
        try {
          const localBackup = localStorage.getItem('route_backup');
          if (localBackup) {
            backup = JSON.parse(localBackup);
            console.log('📥 Backup found in localStorage');
          }
        } catch (parseError) {
          console.warn('⚠️ localStorage backup parse failed:', parseError);
          localStorage.removeItem('route_backup');
        }
      }

      if (!backup) {
        console.log('📭 No backup found');
        return null;
      }

      // Validate backup structure
      if (typeof backup !== 'object' || !backup.routeData || !Array.isArray(backup.routeData)) {
        console.warn('⚠️ Invalid backup structure, removing...');
        await this.clearRouteBackup();
        return null;
      }

      // Validate backup age (7 days instead of 24 hours)
      const backupTime = backup.backupTime || 0;
      const backupAge = Date.now() - backupTime;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (backupAge > maxAge) {
        console.log('⏰ Route backup too old, removing...');
        await this.clearRouteBackup();
        return null;
      }

      // Validate backup content
      if (backup.routeData.length === 0) {
        console.log('📭 Route backup empty, removing...');
        await this.clearRouteBackup();
        return null;
      }

      const locationPoints = backup.routeData.filter(p => p && p.type === 'location').length;
      console.log(`🔍 Found valid backup: ${backup.routeData.length} points (${locationPoints} GPS), ${backup.totalDistance?.toFixed(2) || 0} km`);

      return backup;

    } catch (error) {
      console.error('❌ Failed to check for unsaved route:', error);
      
      try {
        await this.clearRouteBackup();
      } catch (clearError) {
        console.error('❌ Failed to clear corrupted backup:', clearError);
      }
      
      return null;
    }
  }

  restoreFromBackup(backupData) {
    console.log('🔧 Restoring from backup...');
    
    try {
      if (!backupData || typeof backupData !== 'object') {
        console.error('❌ Invalid backup data structure');
        return false;
      }

      // Restore data
      this.routeData = Array.isArray(backupData.routeData) ? backupData.routeData : [];
      this.pathPoints = Array.isArray(backupData.pathPoints) ? backupData.pathPoints : [];
      this.totalDistance = typeof backupData.totalDistance === 'number' ? backupData.totalDistance : 0;
      this.elapsedTime = typeof backupData.elapsedTime === 'number' ? backupData.elapsedTime : 0;
      this.startTime = backupData.startTime || null;

      // Rebuild pathPoints if missing
      if (this.pathPoints.length === 0 && this.routeData.length > 0) {
        console.log('🔧 Rebuilding pathPoints from routeData...');
        this.rebuildPathPoints();
      }

      // Set last coords
      if (this.pathPoints.length > 0) {
        this.lastCoords = this.pathPoints[this.pathPoints.length - 1];
      }

      // Don't auto-resume tracking
      this.isTracking = false;
      this.isPaused = false;

      console.log(`✅ Route restored: ${this.routeData.length} points, ${this.totalDistance.toFixed(2)} km, ${this.pathPoints.length} path points`);

      // Update UI
      this.updateDistanceDisplay();
      this.updateTimerDisplay();

      // Restore route on map
      this.redrawRouteOnMap();

      return true;

    } catch (error) {
      console.error('❌ Failed to restore route from backup:', error);
      return false;
    }
  }

  rebuildPathPoints() {
    const locationPoints = this.routeData.filter(p => p && p.type === 'location' && p.coords);
    this.pathPoints = locationPoints.map(p => p.coords);
    console.log(`✅ Rebuilt ${this.pathPoints.length} pathPoints from location data`);
  }

  updateDistanceDisplay() {
    const distanceElement = document.getElementById('distance');
    if (distanceElement) {
      if (this.totalDistance < 1) {
        distanceElement.textContent = `${(this.totalDistance * 1000).toFixed(0)} m`;
      } else {
        distanceElement.textContent = `${this.totalDistance.toFixed(2)} km`;
      }
    }
  }

  updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    if (timerElement && this.startTime) {
      const elapsed = this.elapsedTime || (Date.now() - this.startTime);
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      
      timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  redrawRouteOnMap() {
    try {
      console.log('🗺️ Redrawing route on map...');
      
      const app = window.AccessNatureApp;
      const mapController = app?.getController('map');

      if (mapController && this.routeData.length > 0) {
        mapController.showRouteData(this.routeData);
        console.log('✅ Route redrawn on map');
      } else {
        console.warn('⚠️ Map controller not ready, scheduling retry...');
        
        setTimeout(() => {
          const retryApp = window.AccessNatureApp;
          const retryMap = retryApp?.getController('map');
          
          if (retryMap && this.routeData.length > 0) {
            retryMap.showRouteData(this.routeData);
            console.log('✅ Route redrawn on map (retry)');
          } else {
            console.warn('⚠️ Map controller still not available');
          }
        }, 2000);
      }
    } catch (error) {
      console.error('❌ Failed to redraw route on map:', error);
    }
  }

  startAutoBackup() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    // Backup every 30 seconds
    this.backupInterval = setInterval(() => {
      if (this.isTracking && this.routeData.length > 0) {
        this.autoSave();
      }
    }, 30000);

    console.log('🔄 Auto backup started (30s intervals)');
  }

  stopAutoBackup() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
  }

  async clearRouteBackup() {
    try {
      if (this.dbReady) {
        await this.routeDB.clearBackup();
      }
      
      localStorage.removeItem('route_backup');
      this.stopAutoBackup();
      
      console.log('🧹 Route backup cleared from all storage');
    } catch (error) {
      console.error('❌ Failed to clear backup:', error);
    }
  }

  async getStorageInfo() {
    const info = {
      indexedDBSupported: this.dbReady,
      storageType: this.dbReady ? 'IndexedDB' : 'localStorage',
      migrationCompleted: localStorage.getItem('indexeddb_migration') === 'completed'
    };

    try {
      if (this.dbReady) {
        const estimate = await this.routeDB.getStorageEstimate();
        info.usage = estimate.usage;
        info.quota = estimate.quota;
        info.usagePercent = estimate.usagePercent;
        info.usageFormatted = this.formatBytes(estimate.usage);
        info.quotaFormatted = this.formatBytes(estimate.quota);
      } else {
        let totalSize = 0;
        for (let key in localStorage) {
          if (localStorage.hasOwnProperty(key)) {
            totalSize += localStorage[key].length;
          }
        }
        
        info.usage = totalSize;
        info.quota = 5 * 1024 * 1024;
        info.usagePercent = ((totalSize / info.quota) * 100).toFixed(1);
        info.usageFormatted = this.formatBytes(totalSize);
        info.quotaFormatted = this.formatBytes(info.quota);
      }
    } catch (error) {
      console.error('Failed to get storage info:', error);
    }

    return info;
  }

  async checkStorageHealth() {
    const info = await this.getStorageInfo();
    
    if (info.usagePercent > 90) {
      return {
        status: 'critical',
        message: 'Storage almost full! Please delete old routes.',
        usagePercent: info.usagePercent
      };
    } else if (info.usagePercent > 75) {
      return {
        status: 'warning',
        message: 'Storage filling up. Consider backing up to cloud.',
        usagePercent: info.usagePercent
      };
    }
    
    return { 
      status: 'ok',
      usagePercent: info.usagePercent
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async clearAllSessions() {
    try {
      if (this.dbReady) {
        const routes = await this.routeDB.getAllRoutes();
        for (const route of routes) {
          await this.routeDB.deleteRoute(route.id);
        }
        console.log('🧹 All routes cleared from IndexedDB');
      }

      localStorage.removeItem('sessions');
      console.log('🧹 All sessions cleared');
      
    } catch (error) {
      console.error('❌ Failed to clear sessions:', error);
      localStorage.removeItem('sessions');
    }
  }

  async clearAllAppData() {
    try {
      if (this.dbReady) {
        await this.routeDB.clearAllData();
        console.log('🧹 All IndexedDB data cleared');
      }

      localStorage.clear();
      this.clearRouteData();
      
      console.log('🧹 All app data cleared');
      
    } catch (error) {
      console.error('❌ Failed to clear all data:', error);
      localStorage.clear();
      this.clearRouteData();
    }
  }

  async reset() {
    this.clearRouteData();
    this.setTrackingState(false);
  }
}