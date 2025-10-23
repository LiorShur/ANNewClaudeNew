// firebase.js - Complete Firebase Controller with Cloud Save & Trail Guides
import { db } from '../../firebase-setup.js';
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  doc,
  query, 
  where, 
  orderBy, 
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js';

export class FirebaseController {
  constructor() {
    this.db = db;
    this.authController = null;
    this.exportController = null;
    this.syncListeners = [];
    this.isOnline = navigator.onLine;
    this.pendingSyncs = [];
    
    this.setupNetworkListeners();
    
    console.log('🔥 FirebaseController initialized');
  }

  initialize(authController, exportController = null) {
    this.authController = authController;
    this.exportController = exportController;
    console.log('🔥 Firebase controller connected to auth');
  }

  setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('🌐 Back online');
      this.isOnline = true;
      this.processPendingSyncs();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Gone offline');
      this.isOnline = false;
    });
  }

  getCurrentUser() {
    if (!this.authController) {
      console.error('Auth controller not initialized');
      return null;
    }
    return this.authController.getCurrentUser();
  }

  isAuthenticated() {
    const user = this.getCurrentUser();
    return user !== null;
  }

  /**
   * Save route to cloud with trail guide generation
   */
  async saveRouteToCloud(routeData, metadata = {}) {
    const user = this.getCurrentUser();
    
    if (!user) {
      throw new Error('Please sign in to save routes to cloud');
    }

    if (!this.isOnline) {
      this.pendingSyncs.push({ type: 'save', routeData, metadata });
      throw new Error('Offline - route queued for sync when online');
    }

    try {
      console.log('☁️ Saving route to cloud...');

      // Get accessibility data
      let accessibilityData = null;
      try {
        const storedData = localStorage.getItem('accessibilityData');
        accessibilityData = storedData ? JSON.parse(storedData) : null;
      } catch (error) {
        console.warn('Could not load accessibility data:', error);
      }

      // Prepare route document
      const routeDoc = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email,
        name: metadata.name || 'Unnamed Route',
        description: metadata.description || '',
        isPublic: metadata.isPublic || false,
        tags: metadata.tags || [],
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        // Route data
        points: routeData || [],
        totalDistance: metadata.totalDistance || 0,
        duration: metadata.elapsedTime || 0,
        startTime: metadata.startTime || null,
        endTime: Date.now(),
        
        // Statistics
        stats: {
          locationPoints: routeData.filter(p => p.type === 'location').length,
          photos: routeData.filter(p => p.type === 'photo').length,
          notes: routeData.filter(p => p.type === 'text').length,
          totalDataPoints: routeData.length
        },
        
        // Accessibility data
        accessibility: accessibilityData || {},
        
        // Metadata
        metadata: {
          deviceInfo: this.getDeviceInfo(),
          appVersion: '1.0.0',
          ...metadata
        }
      };

      // Save route
      const docRef = await addDoc(collection(this.db, 'routes'), routeDoc);
      console.log('✅ Route saved to cloud:', docRef.id);

      // Generate trail guide
      await this.generateTrailGuide(docRef.id, routeData, metadata, accessibilityData);

      return docRef.id;
      
    } catch (error) {
      console.error('❌ Failed to save route to cloud:', error);
      
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check your account.');
      } else if (error.code === 'unavailable') {
        this.pendingSyncs.push({ type: 'save', routeData, metadata });
        throw new Error('Cloud temporarily unavailable. Route queued for sync.');
      }
      
      throw error;
    }
  }

  /**
   * Generate and save trail guide HTML
   */
  async generateTrailGuide(routeId, routeData, routeInfo, accessibilityData) {
    try {
      console.log('🌐 Generating trail guide HTML...');

      const user = this.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get HTML content from export controller if available
      let htmlContent = '';
      
      if (this.exportController && typeof this.exportController.generateRouteSummaryHTML === 'function') {
        htmlContent = this.exportController.generateRouteSummaryHTML(routeData, routeInfo, accessibilityData);
      } else {
        // Fallback: basic HTML generation
        htmlContent = this.generateBasicHTML(routeData, routeInfo, accessibilityData);
      }

      // Create trail guide document
      const trailGuideDoc = {
        routeId: routeId,
        routeName: routeInfo.name || 'Unnamed Route',
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email,
        htmlContent: htmlContent,
        generatedAt: serverTimestamp(),
        isPublic: routeInfo.isPublic || false,
        
        // Publication info
        ...(routeInfo.isPublic && {
          publishedAt: serverTimestamp()
        }),
        
        // Metadata
        metadata: {
          totalDistance: routeInfo.totalDistance || 0,
          elapsedTime: routeInfo.elapsedTime || 0,
          originalDate: routeInfo.date || new Date().toISOString(),
          locationCount: routeData.filter(p => p.type === 'location').length,
          photoCount: routeData.filter(p => p.type === 'photo').length,
          noteCount: routeData.filter(p => p.type === 'text').length
        },
        
        // Accessibility features
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

      // Save trail guide
      const guideRef = await addDoc(collection(this.db, 'trail_guides'), trailGuideDoc);
      
      const visibilityText = routeInfo.isPublic ? 'public' : 'private';
      console.log(`✅ ${visibilityText} trail guide generated with ID:`, guideRef.id);
      
      return guideRef.id;

    } catch (error) {
      console.error('❌ Failed to generate trail guide:', error);
      // Don't fail the main save if trail guide fails
    }
  }

  /**
   * Generate basic HTML for trail guide (fallback)
   */
  generateBasicHTML(routeData, routeInfo, accessibilityData) {
    const locationPoints = routeData.filter(p => p.type === 'location');
    const photos = routeData.filter(p => p.type === 'photo');
    const notes = routeData.filter(p => p.type === 'text');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${routeInfo.name || 'Trail Guide'}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c5530; }
    .stats { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .accessibility { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>🥾 ${routeInfo.name || 'Trail Guide'}</h1>
  
  <div class="stats">
    <h2>Trail Statistics</h2>
    <p>📏 Distance: ${(routeInfo.totalDistance || 0).toFixed(2)} km</p>
    <p>⏱️ Duration: ${this.formatDuration(routeInfo.elapsedTime || 0)}</p>
    <p>📍 GPS Points: ${locationPoints.length}</p>
    <p>📷 Photos: ${photos.length}</p>
    <p>📝 Notes: ${notes.length}</p>
  </div>
  
  ${accessibilityData ? `
  <div class="accessibility">
    <h2>♿ Accessibility Information</h2>
    <p><strong>Wheelchair Access:</strong> ${accessibilityData.wheelchairAccess || 'Unknown'}</p>
    <p><strong>Trail Surface:</strong> ${accessibilityData.trailSurface || 'Unknown'}</p>
    <p><strong>Difficulty:</strong> ${accessibilityData.difficulty || 'Unknown'}</p>
  </div>
  ` : ''}
  
  <p><small>Generated by Access Nature • ${new Date().toLocaleString()}</small></p>
</body>
</html>`;
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  async loadMyRoutes(limit = 50) {
    const user = this.getCurrentUser();
    
    if (!user) {
      throw new Error('Please sign in to load your routes');
    }

    try {
      console.log('☁️ Loading routes from cloud...');

      const q = query(
        collection(this.db, 'routes'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const routes = [];

      querySnapshot.forEach(doc => {
        routes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`✅ Loaded ${routes.length} routes from cloud`);
      return routes;
      
    } catch (error) {
      console.error('❌ Failed to load routes:', error);
      
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied. Please check Firestore rules.');
      }
      
      throw error;
    }
  }

  async loadRoute(routeId) {
    try {
      const docRef = doc(this.db, 'routes', routeId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        };
      } else {
        throw new Error('Route not found');
      }
    } catch (error) {
      console.error('❌ Failed to load route:', error);
      throw error;
    }
  }

  async updateRoute(routeId, updates) {
    const user = this.getCurrentUser();
    
    if (!user) {
      throw new Error('Please sign in to update routes');
    }

    try {
      const docRef = doc(this.db, 'routes', routeId);
      
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });

      console.log('✅ Route updated:', routeId);
      return true;
      
    } catch (error) {
      console.error('❌ Failed to update route:', error);
      throw error;
    }
  }

  async deleteRoute(routeId) {
    const user = this.getCurrentUser();
    
    if (!user) {
      throw new Error('Please sign in to delete routes');
    }

    try {
      const docRef = doc(this.db, 'routes', routeId);
      await deleteDoc(docRef);
      
      console.log('✅ Route deleted:', routeId);
      return true;
      
    } catch (error) {
      console.error('❌ Failed to delete route:', error);
      throw error;
    }
  }

  async loadPublicRoutes(limit = 20) {
    try {
      console.log('🌐 Loading public routes...');

      const q = query(
        collection(this.db, 'routes'),
        where('isPublic', '==', true),
        orderBy('timestamp', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const routes = [];

      querySnapshot.forEach(doc => {
        routes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`✅ Loaded ${routes.length} public routes`);
      return routes;
      
    } catch (error) {
      console.error('❌ Failed to load public routes:', error);
      return [];
    }
  }

  async searchRoutes(criteria = {}) {
    const user = this.getCurrentUser();
    
    try {
      let constraints = [];

      if (criteria.myRoutes && user) {
        constraints.push(where('userId', '==', user.uid));
      }

      if (criteria.publicOnly) {
        constraints.push(where('isPublic', '==', true));
      }

      if (criteria.tags && criteria.tags.length > 0) {
        constraints.push(where('tags', 'array-contains-any', criteria.tags));
      }

      if (criteria.wheelchairAccessible) {
        constraints.push(where('accessibility.wheelchairAccessible', '==', true));
      }

      constraints.push(orderBy('timestamp', 'desc'));

      const q = query(collection(this.db, 'routes'), ...constraints);
      const querySnapshot = await getDocs(q);
      const routes = [];

      querySnapshot.forEach(doc => {
        routes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return routes;
      
    } catch (error) {
      console.error('❌ Search failed:', error);
      return [];
    }
  }

  subscribeToRoute(routeId, callback) {
    const docRef = doc(this.db, 'routes', routeId);
    
    const unsubscribe = onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        callback({
          id: doc.id,
          ...doc.data()
        });
      }
    }, (error) => {
      console.error('❌ Snapshot error:', error);
    });

    return unsubscribe;
  }

  async processPendingSyncs() {
    if (this.pendingSyncs.length === 0) return;

    console.log(`🔄 Processing ${this.pendingSyncs.length} pending syncs...`);

    const syncs = [...this.pendingSyncs];
    this.pendingSyncs = [];

    for (const sync of syncs) {
      try {
        if (sync.type === 'save') {
          await this.saveRouteToCloud(sync.routeData, sync.metadata);
        }
      } catch (error) {
        console.error('❌ Sync failed, re-queuing:', error);
        this.pendingSyncs.push(sync);
      }
    }
  }

  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    };
  }

  async loadMyGuides() {
    const user = this.getCurrentUser();
    
    if (!user) {
      throw new Error('Please sign in to load your guides');
    }

    try {
      const q = query(
        collection(this.db, 'trail_guides'),
        where('userId', '==', user.uid),
        orderBy('generatedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const guides = [];

      querySnapshot.forEach(doc => {
        guides.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`✅ Loaded ${guides.length} guides`);
      return guides;
      
    } catch (error) {
      console.error('❌ Failed to load guides:', error);
      return [];
    }
  }
}

export default FirebaseController;