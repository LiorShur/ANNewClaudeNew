// Landing page controller
import { auth, db } from '../firebase-setup.js';

class LandingPageController {
  constructor() {
    this.authController = null;
    this.currentFilters = {};
    this.currentSearch = '';
    this.lastVisible = null;
    this.isLoading = false;
  }

async initialize() {
  try {
    console.log('🏠 Initializing landing page...');
    
    this.setupEventListeners();
    await this.updateLandingAuthStatus();
    await this.loadCommunityStats();
    await this.loadFeaturedTrails();
    this.updateUserStats();
    
    // Make this instance globally available for modal functions
    window.landingAuth = this;
    
    console.log('✅ Landing page initialized');
  } catch (error) {
    console.error('❌ Landing page initialization failed:', error);
  }
}

  setupEventListeners() {
    // Quick search
    const quickSearchInput = document.getElementById('quickSearch');
    if (quickSearchInput) {
      quickSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.quickSearch();
        }
      });
      window.viewTrailGuide = (guideId) => this.viewTrailGuide(guideId);
    }

    // Make functions global
    window.openTrailBrowser = () => this.openTrailBrowser();
    window.closeTrailBrowser = () => this.closeTrailBrowser();
    window.openTracker = () => this.openTracker();
    window.quickSearch = () => this.quickSearch();
    window.searchTrails = () => this.searchTrails();
    window.applyFilters = () => this.applyFilters();
    window.loadMoreResults = () => this.loadMoreResults();
    window.loadMoreFeatured = () => this.loadMoreFeatured();
    window.viewTrailGuide = (guideId) => this.viewTrailGuide(guideId);
    window.loadMyTrailGuides = () => this.loadMyTrailGuides();
    
    // Info functions
    window.showAbout = () => this.showAbout();
    window.showPrivacy = () => this.showPrivacy();
    window.showContact = () => this.showContact();
    window.showHelp = () => this.showHelp();
  }

  // Navigation Functions
  openTrailBrowser() {
    const modal = document.getElementById('trailBrowserModal');
    if (modal) {
      modal.classList.remove('hidden');
      this.searchTrails(); // Load initial results
    }
  }

  closeTrailBrowser() {
    const modal = document.getElementById('trailBrowserModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  openTracker() {
    // Redirect to main tracker app
    window.location.href = 'tracker.html';
  }

  // Search Functions
  async quickSearch() {
    const searchInput = document.getElementById('quickSearch');
    const searchTerm = searchInput?.value?.trim();
    
    if (!searchTerm) {
      alert('Please enter a search term');
      return;
    }

    this.currentSearch = searchTerm;
    this.openTrailBrowser();
  }

// UPDATED: Search with better error handling
async searchTrails() {
  if (this.isLoading) return;
  
  this.isLoading = true;
  this.showLoading('trailResults');
  
  try {
    const searchInput = document.getElementById('trailSearch');
    const searchTerm = searchInput?.value?.trim() || this.currentSearch;
    
    console.log('Searching trails:', searchTerm || 'all trails');
    
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Simple query without orderBy
    let guidesQuery = query(
      collection(db, 'trail_guides'),
      where('isPublic', '==', true)
    );
    
    const querySnapshot = await getDocs(guidesQuery);
    const guides = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      
      // Apply text search filter on client side
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const nameMatch = data.routeName?.toLowerCase().includes(searchLower);
        const locationMatch = data.accessibility?.location?.toLowerCase().includes(searchLower);
        const authorMatch = data.userEmail?.toLowerCase().includes(searchLower);
        
        if (!nameMatch && !locationMatch && !authorMatch) {
          return; // Skip this result
        }
      }
      
      // Apply other filters on client side
      if (this.currentFilters.wheelchairAccess && 
          data.accessibility?.wheelchairAccess !== this.currentFilters.wheelchairAccess) {
        return;
      }
      
      if (this.currentFilters.difficulty && 
          data.accessibility?.difficulty !== this.currentFilters.difficulty) {
        return;
      }
      
      if (this.currentFilters.distance) {
        const distance = data.metadata?.totalDistance || 0;
        const [min, max] = this.parseDistanceFilter(this.currentFilters.distance);
        if (distance < min || (max && distance > max)) {
          return;
        }
      }
      
      guides.push({
        id: doc.id,
        ...data
      });
    });
    
    // Sort client-side by creation date (newest first)
    guides.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    
    console.log(`Found ${guides.length} trails matching criteria`);
    this.displayTrailResults(guides);
    this.updateResultsCount(guides.length);
    
  } catch (error) {
    console.error('Search failed:', error);
    
    const resultsContainer = document.getElementById('trailResults');
    if (resultsContainer) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3>Search temporarily unavailable</h3>
          <p>Please try again in a moment, or check your connection.</p>
          <button onclick="searchTrails()" class="nav-card-button primary">Retry Search</button>
        </div>
      `;
    }
  } finally {
    this.isLoading = false;
  }
}

  applyFilters() {
    // Collect filter values
    this.currentFilters = {
      wheelchairAccess: document.getElementById('wheelchairFilter')?.value || '',
      difficulty: document.getElementById('difficultyFilter')?.value || '',
      distance: document.getElementById('distanceFilter')?.value || ''
    };
    
    console.log('🎯 Applying filters:', this.currentFilters);
    this.searchTrails();
  }

  displayTrailResults(guides) {
    const resultsContainer = document.getElementById('trailResults');
    if (!resultsContainer) return;
    
    if (guides.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>No trails found</h3>
          <p>Try adjusting your search terms or filters</p>
          <button onclick="clearFilters()" class="nav-card-button primary">Clear Filters</button>
        </div>
      `;
      return;
    }
    
    const resultsHTML = guides.map(guide => this.createTrailResultCard(guide)).join('');
    resultsContainer.innerHTML = resultsHTML;
  }

  createTrailResultCard(guide) {
    const date = new Date(guide.generatedAt).toLocaleDateString();
    const accessibility = guide.accessibility || {};
    const metadata = guide.metadata || {};
    const community = guide.community || {};
    
    return `
      <div class="trail-result-card" onclick="viewTrailGuide('${guide.id}')">
        <div class="trail-result-header">
          <div class="trail-result-name">${guide.routeName}</div>
          <div class="trail-result-author">by ${guide.userEmail}</div>
          <div class="trail-result-date">${date}</div>
        </div>
        
        <div class="trail-result-body">
          <div class="trail-result-stats">
            <div class="trail-stat">
              <span class="trail-stat-value">${(metadata.totalDistance || 0).toFixed(1)}</span>
              <span class="trail-stat-label">km</span>
            </div>
            <div class="trail-stat">
              <span class="trail-stat-value">${metadata.locationCount || 0}</span>
              <span class="trail-stat-label">GPS Points</span>
            </div>
          </div>
          
          <div class="trail-accessibility-tags">
            ${accessibility.wheelchairAccess ? `<span class="accessibility-tag">♿ ${accessibility.wheelchairAccess}</span>` : ''}
            ${accessibility.difficulty ? `<span class="accessibility-tag">🥾 ${accessibility.difficulty}</span>` : ''}
            ${accessibility.trailSurface ? `<span class="accessibility-tag">🛤️ ${accessibility.trailSurface}</span>` : ''}
          </div>
          
          <div class="trail-community-stats">
            <span>👁️ ${community.views || 0} views</span>
            <span>📷 ${metadata.photoCount || 0} photos</span>
            <span>📝 ${metadata.noteCount || 0} notes</span>
          </div>
        </div>
      </div>
    `;
  }

  async viewTrailGuide(guideId) {
    try {
      console.log('👁️ Viewing trail guide:', guideId);
      
      // Get trail guide with HTML content
      const authController = window.AccessNatureApp?.getController?.('auth');
      if (authController && typeof authController.getTrailGuide === 'function') {
        const guide = await authController.getTrailGuide(guideId);
        
        if (guide && guide.htmlContent) {
          // Open HTML content in new tab
          const blob = new Blob([guide.htmlContent], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const newWindow = window.open(url, '_blank');
          
          // Clean up URL after delay
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          alert('Trail guide content not available');
        }
      } else {
        alert('Please sign in to view full trail guides');
      }
      
    } catch (error) {
      console.error('❌ Failed to view trail guide:', error);
      alert('Failed to load trail guide. Please try again.');
    }
  }

  // Stats Functions
// UPDATED: Load community stats without count queries
async loadCommunityStats() {
  try {
    console.log('Loading community stats...');
    
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Remove the orderBy to avoid index requirements
    const publicGuidesQuery = query(
      collection(db, 'trail_guides'), 
      where('isPublic', '==', true)
    );
    
    const guidesSnapshot = await getDocs(publicGuidesQuery);
    
    let totalKm = 0;
    let accessibleTrails = 0;
    const uniqueUsers = new Set();
    const publicGuidesCount = guidesSnapshot.size;
    
    guidesSnapshot.forEach(doc => {
      const data = doc.data();
      totalKm += data.metadata?.totalDistance || 0;
      uniqueUsers.add(data.userId);
      
      if (data.accessibility?.wheelchairAccess === 'Fully Accessible') {
        accessibleTrails++;
      }
    });
    
    // Update display with animation
    this.animateNumber('publicGuides', publicGuidesCount);
    this.animateNumber('totalKm', Math.round(totalKm));
    this.animateNumber('accessibleTrails', accessibleTrails);
    this.animateNumber('totalUsers', uniqueUsers.size);
    
    console.log('Community stats loaded successfully');
    
  } catch (error) {
    console.error('Failed to load community stats:', error);
    
    // Set default values if failing
    this.updateElement('publicGuides', '0');
    this.updateElement('totalKm', '0');
    this.updateElement('accessibleTrails', '0');
    this.updateElement('totalUsers', '0');
  }
}

// UPDATED: Load featured trails with better error handling
async loadFeaturedTrails() {
  try {
    console.log('Loading featured trails...');
    
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Simple query without orderBy to avoid index issues
    const featuredQuery = query(
      collection(db, 'trail_guides'),
      where('isPublic', '==', true)
    );
    
    const querySnapshot = await getDocs(featuredQuery);
    const featured = [];
    
    querySnapshot.forEach(doc => {
      featured.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort client-side by creation date (newest first)
    featured.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    
    // Take first 6 for featured display
    const featuredToShow = featured.slice(0, 6);
    
    console.log(`Loaded ${featuredToShow.length} featured trails`);
    this.displayFeaturedTrails(featuredToShow);
    
  } catch (error) {
    console.error('Failed to load featured trails:', error);
    this.showFeaturedPlaceholder();
  }
}

  displayFeaturedTrails(trails) {
    const container = document.getElementById('featuredTrails');
    if (!container) return;
    
    if (trails.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⭐</div>
          <h3>No featured trails yet</h3>
          <p>Be the first to contribute accessible trail guides!</p>
          <button onclick="openTracker()" class="nav-card-button primary">Start Mapping</button>
        </div>
      `;
      return;
    }
    
    const featuredHTML = trails.map(trail => this.createFeaturedTrailCard(trail)).join('');
    container.innerHTML = featuredHTML;
  }

  createFeaturedTrailCard(trail) {
    const accessibility = trail.accessibility || {};
    const metadata = trail.metadata || {};
    const community = trail.community || {};
    
    return `
      <div class="featured-trail">
        <div class="trail-image">🌲</div>
        <div class="trail-info">
          <div class="trail-name">${trail.routeName}</div>
          <div class="trail-meta">
            <span>📍 ${accessibility.location || 'Location not specified'}</span>
            <span>📅 ${new Date(trail.generatedAt).toLocaleDateString()}</span>
          </div>
          <div class="trail-accessibility">
            ${accessibility.wheelchairAccess ? `<span class="accessibility-badge">♿ ${accessibility.wheelchairAccess}</span>` : ''}
            ${accessibility.difficulty ? `<span class="accessibility-badge">🥾 ${accessibility.difficulty}</span>` : ''}
          </div>
          <div class="trail-stats">
            <span>📏 ${(metadata.totalDistance || 0).toFixed(1)} km</span>
            <span>👁️ ${community.views || 0} views</span>
            <span>📷 ${metadata.photoCount || 0} photos</span>
          </div>
          <button class="view-trail-btn" onclick="viewTrailGuide('${trail.id}')">
            View Trail Guide
          </button>
        </div>
      </div>
    `;
  }

  showFeaturedPlaceholder() {
    const container = document.getElementById('featuredTrails');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🌲</div>
          <h3>Featured trails coming soon!</h3>
          <p>Help build our community by mapping accessible trails</p>
        </div>
      `;
    }
  }

async updateUserStats() {
  try {
    const authStatus = await this.checkLandingAuth();
    
    if (authStatus.isSignedIn) {
      // User is signed in - load their cloud data
      await this.loadUserCloudStats();
    } else {
      // User not signed in - check localStorage only
      this.loadLocalStats();
    }
  } catch (error) {
    console.error('Failed to update user stats:', error);
    // Fallback to local stats
    this.loadLocalStats();
  }
}

// Add this new method to load cloud stats
async loadUserCloudStats() {
  try {
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const { auth } = await import('../firebase-setup.js');
    
    // Get user's routes from Firebase
    const routesQuery = query(
      collection(db, 'routes'),
      where('userId', '==', auth.currentUser.uid)
    );
    
    const routesSnapshot = await getDocs(routesQuery);
    let totalDistance = 0;
    
    routesSnapshot.forEach(doc => {
      const data = doc.data();
      totalDistance += data.totalDistance || 0;
    });
    
    // Update display
    this.updateElement('totalRoutes', routesSnapshot.size);
    this.updateElement('totalDistance', totalDistance.toFixed(1));
    
    console.log(`User stats: ${routesSnapshot.size} routes, ${totalDistance.toFixed(1)} km`);
    
  } catch (error) {
    console.error('Failed to load cloud stats:', error);
    // Fallback to local stats
    this.loadLocalStats();
  }
}

// Add this method for local stats fallback
loadLocalStats() {
  const totalRoutes = localStorage.getItem('sessions') ? JSON.parse(localStorage.getItem('sessions')).length : 0;
  this.updateElement('totalRoutes', totalRoutes);
  
  let totalDistance = 0;
  try {
    const sessions = JSON.parse(localStorage.getItem('sessions') || '[]');
    totalDistance = sessions.reduce((sum, session) => sum + (session.totalDistance || 0), 0);
  } catch (error) {
    console.warn('Error calculating total distance:', error);
  }
  
  this.updateElement('totalDistance', totalDistance.toFixed(1));
}

  // Utility Functions
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  updateResultsCount(count) {
    const element = document.getElementById('resultsCount');
    if (element) {
      element.textContent = `${count} trail${count !== 1 ? 's' : ''} found`;
    }
  }

  showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div class="loading">
          Loading trails... <span class="loading-spinner">⏳</span>
        </div>
      `;
    }
  }

  showError(message) {
    alert('❌ ' + message);
  }

  // Info Functions
  showAbout() {
    alert(`🌲 About Access Nature

Making outdoor spaces accessible for everyone.

Our mission is to create a comprehensive database of accessible trail information, documented by the community for the community.

Features:
- GPS tracking and route documentation
- Detailed accessibility surveys
- Photo and note sharing
- Community trail guide database
- Export and sharing capabilities

Join us in making nature accessible to all!`);
  }

  // Info Functions (continued)
  showPrivacy() {
    alert(`🔒 Privacy Policy

Access Nature Privacy Commitment:

DATA COLLECTION:
- We only collect data you choose to share
- Route data is stored locally by default
- Cloud sync is optional and user-controlled
- No tracking or analytics without consent

YOUR CONTROL:
- You own all your route data
- Delete data anytime from your device
- Make trail guides public/private as you choose
- Export your data in multiple formats

SHARING:
- Only public trail guides are visible to others
- Personal information is never shared
- Location data is only in routes you publish

SECURITY:
- Data encrypted in transit and at rest
- Firebase security rules protect your data
- Regular security updates and monitoring

Questions? Contact us through the app.`);
  }

  showContact() {
    alert(`📧 Contact Access Nature

Get in touch with our team:

SUPPORT:
- Email: support@accessnature.app
- Response time: 24-48 hours
- Include device info for technical issues

FEEDBACK:
- Feature requests welcome
- Bug reports appreciated
- Accessibility suggestions prioritized

PARTNERSHIPS:
- Trail organizations
- Accessibility advocates
- Technology collaborators

COMMUNITY:
- Join our monthly virtual meetups
- Share your accessibility mapping stories
- Help improve trail documentation

We're here to help make nature accessible!`);
  }

  showHelp() {
    alert(`❓ Access Nature Help

GETTING STARTED:
1. Sign up for cloud sync (optional)
2. Start tracking a trail
3. Take photos and notes along the way
4. Fill out accessibility survey
5. Save and share your trail guide

TRAIL MAPPING TIPS:
- Keep GPS enabled for accurate tracking
- Take photos of key accessibility features
- Note surface types, obstacles, facilities
- Include gradient and width information

SEARCHING TRAILS:
- Use filters for specific accessibility needs
- Browse by location or difficulty
- Read community reviews and ratings
- Download trail guides for offline use

TROUBLESHOOTING:
- Ensure location permissions enabled
- Use strong internet for cloud sync
- Clear browser cache if issues persist
- Contact support for technical problems

Happy trail mapping! 🥾`);
  }

  // Additional utility functions
  async loadMoreResults() {
    // Implement pagination for search results
    console.log('📄 Loading more results...');
    // This would extend the current search with more results
  }

  async loadMoreFeatured() {
    // Load more featured trails
    console.log('⭐ Loading more featured trails...');
    // This would load additional featured trails
  }

  clearFilters() {
    // Clear all filters and search
    document.getElementById('wheelchairFilter').value = '';
    document.getElementById('difficultyFilter').value = '';
    document.getElementById('distanceFilter').value = '';
    document.getElementById('trailSearch').value = '';
    
    this.currentFilters = {};
    this.currentSearch = '';
    this.searchTrails();
  }

  // Make clearFilters available globally
  setupGlobalFunctions() {
    window.clearFilters = () => this.clearFilters();
  }

  // NEW: Animate number changes for better UX
  animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const startValue = 0;
    const duration = 2000; // 2 seconds
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + (targetValue - startValue) * easeOutCubic);
      
      element.textContent = currentValue;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }

  // NEW: Parse distance filter range
  parseDistanceFilter(distanceFilter) {
    switch (distanceFilter) {
      case '0-2': return [0, 2];
      case '2-5': return [2, 5];
      case '5-10': return [5, 10];
      case '10+': return [10, null];
      default: return [0, null];
    }
  }

  // ADD this debug function to your LandingPageController class
async debugTrailGuides() {
  try {
    console.log('🐛 Debugging trail guides...');
    
    const { collection, getDocs, query, limit } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    
    // Check ALL trail guides (public and private)
    const allGuidesQuery = query(collection(db, 'trail_guides'), limit(10));
    const allSnapshot = await getDocs(allGuidesQuery);
    
    console.log('📊 Total trail guides in database:', allSnapshot.size);
    
    if (allSnapshot.size > 0) {
      allSnapshot.forEach(doc => {
        const data = doc.data();
        console.log('📄 Trail guide:', {
          id: doc.id,
          name: data.routeName,
          isPublic: data.isPublic,
          userId: data.userId,
          generatedAt: data.generatedAt
        });
      });
      
      // Check specifically for public guides
      const { where } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
      const publicQuery = query(
        collection(db, 'trail_guides'), 
        where('isPublic', '==', true),
        limit(10)
      );
      const publicSnapshot = await getDocs(publicQuery);
      console.log('🌍 Public trail guides:', publicSnapshot.size);
      
    } else {
      console.log('❌ No trail guides found in database');
    }
    
  } catch (error) {
    console.error('🐛 Debug failed:', error);
  }
}

// NEW: View trail guide directly (no auth controller dependency)
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
    
    // Check if it's public or user owns it
    const { auth } = await import('../firebase-setup.js');
    const currentUser = auth.currentUser;
    
    const canView = guideData.isPublic || (currentUser && currentUser.uid === guideData.userId);
    
    if (!canView) {
      alert('❌ This trail guide is private and you don\'t have permission to view it.');
      return;
    }
    
    // Increment view count (only for public guides and if not the owner)
    if (guideData.isPublic && (!currentUser || currentUser.uid !== guideData.userId)) {
      try {
        await updateDoc(guideRef, {
          'community.views': increment(1)
        });
        console.log('📈 View count incremented');
      } catch (error) {
        console.warn('Failed to increment view count:', error);
        // Don't fail the whole operation for this
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

// NEW: Display trail guide HTML in new window
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

// UPDATED: Check authentication status for landing page
async checkLandingAuth() {
  try {
    const { auth } = await import('../firebase-setup.js');
    return {
      isSignedIn: !!auth.currentUser,
      user: auth.currentUser,
      email: auth.currentUser?.email
    };
  } catch (error) {
    console.error('Auth check failed:', error);
    return { isSignedIn: false, user: null, email: null };
  }
}

// ADD this method to LandingPageController
async updateLandingAuthStatus() {
  const authStatus = await this.checkLandingAuth();
  
  const userInfo = document.getElementById('userInfo');
  const authPrompt = document.getElementById('authPrompt');
  const userEmail = document.getElementById('userEmail');
  
  if (authStatus.isSignedIn) {
    userInfo?.classList.remove('hidden');
    authPrompt?.classList.add('hidden');
    if (userEmail) userEmail.textContent = authStatus.email;
  } else {
    userInfo?.classList.add('hidden');
    authPrompt?.classList.remove('hidden');
  }
}

// Call this in your initialize() method
async initialize() {
  try {
    console.log('🏠 Initializing landing page...');
    
    this.setupEventListeners();
    await this.updateLandingAuthStatus(); // Add this line
    await this.loadCommunityStats();
    await this.loadFeaturedTrails();
    this.updateUserStats();
    
    console.log('✅ Landing page initialized');
  } catch (error) {
    console.error('❌ Landing page initialization failed:', error);
  }
}

async loadMyTrailGuides() {
  try {
    console.log('🌐 Loading trail guides from landing page...');
    
    // Check if user is signed in
    const authStatus = await this.checkLandingAuth();
    if (!authStatus.isSignedIn) {
      alert('Please sign in first to view your trail guides');
      return;
    }

    // Import Firestore functions
    const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const { db, auth } = await import('../firebase-setup.js');
    
    // Query user's trail guides
    const guidesQuery = query(
      collection(db, 'trail_guides'),
      where('userId', '==', auth.currentUser.uid),
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
    
    console.log(`Found ${guides.length} trail guides`);
    
    if (guides.length === 0) {
      alert('No trail guides found.\n\nTo create trail guides:\n• Record a route in the tracker\n• Save it to cloud\n• Trail guide will be auto-generated');
      return;
    }
    
    this.displayLandingGuides(guides);
    
  } catch (error) {
    console.error('Failed to load trail guides:', error);
    alert('Failed to load trail guides: ' + error.message);
  }
}

// Add this method too
displayLandingGuides(guides) {
  let message = 'Your Trail Guides:\n\n';
  
  guides.forEach((guide, index) => {
    const date = new Date(guide.generatedAt).toLocaleDateString();
    const visibility = guide.isPublic ? 'Public' : 'Private';
    
    message += `${index + 1}. ${guide.routeName} (${visibility})\n`;
    message += `   Created: ${date}\n`;
    if (guide.metadata) {
      message += `   Distance: ${(guide.metadata.totalDistance || 0).toFixed(1)} km\n`;
    }
    message += '\n';
  });

  message += `Select a guide to view (1-${guides.length}), or 0 to cancel:`;
  
  const choice = prompt(message);
  const choiceNum = parseInt(choice);
  
  if (choiceNum >= 1 && choiceNum <= guides.length) {
    this.viewTrailGuide(guides[choiceNum - 1].id);
  }
}
}

// FIXED: Landing page authentication integration
// Add this to the bottom of your landing.js file or create a separate auth-landing.js

class LandingAuthController {
  constructor() {
    this.authModal = null;
    this.currentUser = null;
  }

  async initialize() {
    console.log('🔐 Initializing landing page authentication...');
    
    // Set up auth state listener first
    await this.setupAuthStateListener();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Update UI based on current auth state
    await this.updateAuthStatus();
    
    console.log('✅ Landing page authentication initialized');
  }

  setupEventListeners() {
    // FIXED: Sign in button event listener
    const showAuthBtn = document.getElementById('showAuthBtn');
    if (showAuthBtn) {
      console.log('🔧 Setting up sign-in button listener...');
      
      // Remove any existing listeners
      const newBtn = showAuthBtn.cloneNode(true);
      showAuthBtn.parentNode.replaceChild(newBtn, showAuthBtn);
      
      // Add our listener
      newBtn.addEventListener('click', (e) => {
        console.log('🔑 Sign in button clicked');
        e.preventDefault();
        e.stopPropagation();
        this.showAuthModal();
      });
      
      console.log('✅ Sign-in button listener attached');
    } else {
      console.error('❌ Sign-in button not found');
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLogout();
      });
    }

    // Modal close handlers
    this.setupModalEventListeners();
  }

setupModalEventListeners() {
  // Handle login form
  const loginForm = document.getElementById('loginFormEl');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => this.handleLogin(e));
  }
  
  // Handle signup form
  const signupForm = document.getElementById('signupFormEl');
  if (signupForm) {
    signupForm.addEventListener('submit', (e) => this.handleSignup(e));
  }
  
  // Close modal when clicking background
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'authModal') {
        this.closeAuthModal();
      }
    });
  }
}

  async setupAuthStateListener() {
    try {
      // Import Firebase auth
      const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js");
      const { auth } = await import('../firebase-setup.js');
      
      onAuthStateChanged(auth, (user) => {
        this.currentUser = user;
        this.updateAuthStatus();
        
        if (user) {
          console.log('✅ User signed in:', user.email);
        } else {
          console.log('👋 User signed out');
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to setup auth listener:', error);
    }
  }

showAuthModal() {
  console.log('📱 Opening auth modal (permanent fix)...');
  
  // Remove any existing modal to start fresh
  const existingModal = document.getElementById('authModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create the working modal structure
  this.createWorkingAuthModal();
  
  // Show the modal
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.style.display = 'flex';
    console.log('✅ Auth modal opened successfully');
    
    // Focus on first input for accessibility
    setTimeout(() => {
      const firstInput = modal.querySelector('input[type="email"]');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
    
    return true;
  } else {
    console.error('❌ Failed to create auth modal');
    return false;
  }
}

showLoginForm() {
  const loginForm = document.getElementById('loginFormContent');
  const signupForm = document.getElementById('signupFormContent');
  const title = document.getElementById('authTitle');
  
  if (loginForm) loginForm.style.display = 'block';
  if (signupForm) signupForm.style.display = 'none';
  if (title) title.textContent = 'Welcome Back!';
}

showSignupForm() {
  const loginForm = document.getElementById('loginFormContent');
  const signupForm = document.getElementById('signupFormContent');
  const title = document.getElementById('authTitle');
  
  if (signupForm) signupForm.style.display = 'block';
  if (loginForm) loginForm.style.display = 'none';
  if (title) title.textContent = 'Join Access Nature';
}

  closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.remove(); // Completely remove it
    console.log('✅ Auth modal closed and removed');
  }
}

  createWorkingAuthModal() {
  const modalHTML = `
    <div id="authModal" style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
    ">
      <div class="auth-container" style="
        background: white;
        border-radius: 20px;
        width: 90%;
        max-width: 420px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
        position: relative;
        z-index: 100000;
      ">
        <!-- Header -->
        <div class="auth-header" style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 25px;
          text-align: center;
          position: relative;
          border-radius: 20px 20px 0 0;
        ">
          <h2 id="authTitle" style="
            margin: 0;
            font-size: 1.8rem;
            font-weight: 600;
          ">Welcome to Access Nature</h2>
          <button onclick="window.landingAuth.closeAuthModal()" style="
            position: absolute;
            top: 15px;
            right: 20px;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: none;
            width: 35px;
            height: 35px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          ">✕</button>
        </div>
        
        <!-- Login Form -->
        <div id="loginFormContent" class="form-content" style="padding: 30px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h3 style="margin: 0 0 8px 0; font-size: 1.4rem; color: #333;">Sign In to Your Account</h3>
            <p style="margin: 0; color: #666; font-size: 0.95rem;">Continue your accessibility mapping journey</p>
          </div>
          
          <form id="loginFormEl" style="margin-bottom: 25px;">
            <div style="margin-bottom: 20px; position: relative;">
              <input type="email" id="loginEmailInput" placeholder="Email address" required style="
                width: 100%;
                padding: 15px 20px 15px 50px;
                border: 2px solid #e1e5e9;
                border-radius: 12px;
                font-size: 16px;
                background: #f8f9fa;
                box-sizing: border-box;
              ">
              <span style="
                position: absolute;
                left: 18px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 18px;
              ">📧</span>
            </div>
            
            <div style="margin-bottom: 20px; position: relative;">
              <input type="password" id="loginPasswordInput" placeholder="Password" required style="
                width: 100%;
                padding: 15px 20px 15px 50px;
                border: 2px solid #e1e5e9;
                border-radius: 12px;
                font-size: 16px;
                background: #f8f9fa;
                box-sizing: border-box;
              ">
              <span style="
                position: absolute;
                left: 18px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 18px;
              ">🔒</span>
            </div>
            
            <button type="submit" id="loginSubmitBtn" style="
              width: 100%;
              padding: 16px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              margin-bottom: 20px;
            ">
              <span class="btn-text">Sign In</span>
              <span class="btn-spinner hidden">⏳</span>
            </button>
          </form>
          
          <div style="text-align: center; margin: 25px 0; position: relative;">
            <span style="
              background: white;
              padding: 0 20px;
              color: #666;
              font-size: 14px;
            ">or</span>
            <div style="
              position: absolute;
              top: 50%;
              left: 0;
              right: 0;
              height: 1px;
              background: #e1e5e9;
              z-index: -1;
            "></div>
          </div>
          
          <button onclick="window.landingAuth.handleGoogleAuth()" style="
            width: 100%;
            padding: 14px;
            background: white;
            border: 2px solid #e1e5e9;
            border-radius: 12px;
            font-size: 15px;
            cursor: pointer;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
          ">
            <span>Continue with Google</span>
          </button>
          
          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e1e5e9;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              Don't have an account? 
              <button type="button" onclick="window.landingAuth.showSignupForm()" style="
                background: none;
                border: none;
                color: #667eea;
                font-weight: 600;
                cursor: pointer;
                text-decoration: underline;
                font-size: 14px;
              ">Sign up</button>
            </p>
          </div>
        </div>
        
        <!-- Signup Form (hidden initially) -->
        <div id="signupFormContent" class="form-content" style="padding: 30px; display: none;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h3 style="margin: 0 0 8px 0; font-size: 1.4rem; color: #333;">Create Your Account</h3>
            <p style="margin: 0; color: #666; font-size: 0.95rem;">Join the community making nature accessible</p>
          </div>
          
          <form id="signupFormEl" style="margin-bottom: 25px;">
            <div style="margin-bottom: 20px; position: relative;">
              <input type="text" id="signupNameInput" placeholder="Full name" required style="
                width: 100%;
                padding: 15px 20px 15px 50px;
                border: 2px solid #e1e5e9;
                border-radius: 12px;
                font-size: 16px;
                background: #f8f9fa;
                box-sizing: border-box;
              ">
              <span style="
                position: absolute;
                left: 18px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 18px;
              ">👤</span>
            </div>
            
            <div style="margin-bottom: 20px; position: relative;">
              <input type="email" id="signupEmailInput" placeholder="Email address" required style="
                width: 100%;
                padding: 15px 20px 15px 50px;
                border: 2px solid #e1e5e9;
                border-radius: 12px;
                font-size: 16px;
                background: #f8f9fa;
                box-sizing: border-box;
              ">
              <span style="
                position: absolute;
                left: 18px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 18px;
              ">📧</span>
            </div>
            
            <div style="margin-bottom: 20px; position: relative;">
              <input type="password" id="signupPasswordInput" placeholder="Create password" required style="
                width: 100%;
                padding: 15px 20px 15px 50px;
                border: 2px solid #e1e5e9;
                border-radius: 12px;
                font-size: 16px;
                background: #f8f9fa;
                box-sizing: border-box;
              ">
              <span style="
                position: absolute;
                left: 18px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 18px;
              ">🔒</span>
            </div>
            
            <button type="submit" id="signupSubmitBtn" style="
              width: 100%;
              padding: 16px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              margin-bottom: 20px;
            ">
              <span class="btn-text">Create Account</span>
              <span class="btn-spinner hidden">⏳</span>
            </button>
          </form>
          
          <div style="text-align: center; margin: 25px 0; position: relative;">
            <span style="
              background: white;
              padding: 0 20px;
              color: #666;
              font-size: 14px;
            ">or</span>
            <div style="
              position: absolute;
              top: 50%;
              left: 0;
              right: 0;
              height: 1px;
              background: #e1e5e9;
              z-index: -1;
            "></div>
          </div>
          
          <button onclick="window.landingAuth.handleGoogleAuth()" style="
            width: 100%;
            padding: 14px;
            background: white;
            border: 2px solid #e1e5e9;
            border-radius: 12px;
            font-size: 15px;
            cursor: pointer;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
          ">
            <span>Continue with Google</span>
          </button>
          
          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e1e5e9;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              Already have an account? 
              <button type="button" onclick="window.landingAuth.showLoginForm()" style="
                background: none;
                border: none;
                color: #667eea;
                font-weight: 600;
                cursor: pointer;
                text-decoration: underline;
                font-size: 14px;
              ">Sign in</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Setup event listeners immediately
  this.setupModalEventListeners();
  
  console.log('✅ Working auth modal created with event listeners');
}

  switchToLogin() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const title = document.getElementById('authModalTitle');

    if (loginForm) loginForm.classList.add('active');
    if (signupForm) signupForm.classList.remove('active');
    if (title) title.textContent = 'Welcome Back!';
  }

  switchToSignup() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const title = document.getElementById('authModalTitle');

    if (signupForm) signupForm.classList.add('active');
    if (loginForm) loginForm.classList.remove('active');
    if (title) title.textContent = 'Join Access Nature';
  }

async handleLogin(event) {
  event.preventDefault();
  
  const loginBtn = document.getElementById('loginSubmitBtn');
  const emailInput = document.getElementById('loginEmailInput');
  const passwordInput = document.getElementById('loginPasswordInput');
  
  if (!emailInput?.value || !passwordInput?.value) {
    this.showAuthError('Please fill in all fields');
    return;
  }

  try {
    this.setButtonLoading(loginBtn, true);
    
    const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js");
    const { auth } = await import('../firebase-setup.js');
    
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
  
  const signupBtn = document.getElementById('signupSubmitBtn');
  const nameInput = document.getElementById('signupNameInput');
  const emailInput = document.getElementById('signupEmailInput');
  const passwordInput = document.getElementById('signupPasswordInput');
  
  if (!nameInput?.value || !emailInput?.value || !passwordInput?.value) {
    this.showAuthError('Please fill in all fields');
    return;
  }

  if (passwordInput.value.length < 6) {
    this.showAuthError('Password must be at least 6 characters');
    return;
  }

  try {
    this.setButtonLoading(signupBtn, true);
    
    const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js");
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const { auth, db } = await import('../firebase-setup.js');
    
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
    const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js");
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const { auth, db } = await import('../firebase-setup.js');
    
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

      const { signOut } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js");
      const { auth } = await import('./firebase-setup.js');

      await signOut(auth);
      console.log('👋 Logout successful');
      this.showSuccessMessage('See you next time! 👋');
      
    } catch (error) {
      console.error('❌ Logout failed:', error);
      this.showAuthError('Logout failed. Please try again.');
    }
  }

  async updateAuthStatus() {
    const userInfo = document.getElementById('userInfo');
    const authPrompt = document.getElementById('authPrompt');
    const userEmail = document.getElementById('userEmail');

    if (this.currentUser) {
      // Show user info
      userInfo?.classList.remove('hidden');
      authPrompt?.classList.add('hidden');
      if (userEmail) userEmail.textContent = this.currentUser.email;
    } else {
      // Show login prompt
      userInfo?.classList.add('hidden');
      authPrompt?.classList.remove('hidden');
    }
  }

  // Utility methods
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

    setTimeout(() => this.clearAuthError(), 5000);
  }

  clearAuthError() {
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
      existingError.remove();
    }
  }

  clearAuthForms() {
    const inputs = document.querySelectorAll('#authModal input');
    inputs.forEach(input => input.value = '');
    this.clearAuthError();
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
}

// Initialize landing page authentication
document.addEventListener('DOMContentLoaded', async () => {
  // Wait a bit for Firebase to load
  setTimeout(async () => {
    const landingAuth = new LandingAuthController();
    await landingAuth.initialize();
    
    // Make it globally available for debugging
    window.LandingAuth = landingAuth;
    
    console.log('🏠 Landing page authentication ready');
  }, 500);
});

// Export for use in other modules
export { LandingAuthController };

// Initialize landing page when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const landingController = new LandingPageController();
  await landingController.initialize();
  landingController.setupGlobalFunctions();
  
  // Make controller available globally
  window.LandingPageController = landingController;
});


export { LandingPageController };
