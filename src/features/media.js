// Media capture functionality
import { getCurrentPosition } from '../utils/geolocation.js';

export class MediaController {
  constructor(appState) {
    this.appState = appState;
  }

  initialize() {
    this.setupFileInputs();
    this.setupMediaButtons();
  }

  setupFileInputs() {
    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        this.handlePhotoCapture(e);
      });
    }
  }

  setupMediaButtons() {
    const takePhotoBtn = document.getElementById('takePhotoBtn');
    if (takePhotoBtn) {
      takePhotoBtn.addEventListener('click', () => {
        this.capturePhoto();
      });
    }
  }

  async capturePhoto() {
    if (!this.appState.getTrackingState().isTracking) {
      alert('Start tracking first to capture photos');
      return;
    }

    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
      photoInput.click();
    }
  }

  async handlePhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const position = await getCurrentPosition();
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      const compressedImage = await this.compressImage(file, 0.7);

      this.appState.addRoutePoint({
        type: 'photo',
        coords: coords,
        content: compressedImage,
        timestamp: Date.now(),
        originalSize: file.size
      });

      alert('Photo captured and saved!');
    } catch (error) {
      console.error('Failed to capture photo:', error);
      alert('Failed to capture photo: ' + error.message);
    }

    event.target.value = '';
  }

  async addTextNote() {
    if (!this.appState.getTrackingState().isTracking) {
      alert('Start tracking first to add notes');
      return;
    }

    const note = prompt('Enter your note:');
    if (!note || note.trim() === '') return;

    try {
      const position = await getCurrentPosition();
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      this.appState.addRoutePoint({
        type: 'text',
        coords: coords,
        content: note.trim(),
        timestamp: Date.now()
      });

      alert('Note added successfully!');
    } catch (error) {
      console.error('Failed to add note:', error);
      alert('Failed to add note: ' + error.message);
    }
  }

  async compressImage(file, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target.result;
      };

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const maxWidth = 1200;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        try {
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        } catch (error) {
          reject(new Error('Image compression failed'));
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsDataURL(file);
    });
  }

  showPhotoCleanupDialog() {
    const photos = this.getStoredPhotos();

    if (photos.length === 0) {
      alert('No stored photos found.');
      return;
    }

    const shouldDelete = confirm(`Found ${photos.length} photos. Delete all to free up space?`);
    if (shouldDelete) {
      this.deleteAllPhotos();
      alert('All photos deleted.');
    }
  }

  getStoredPhotos() {
    const photos = [];
    
    this.appState.getRouteData().forEach(entry => {
      if (entry.type === 'photo' && entry.content) {
        photos.push(entry);
      }
    });

    this.appState.getSessions().forEach(session => {
      if (session.data) {
        session.data.forEach(entry => {
          if (entry.type === 'photo' && entry.content) {
            photos.push(entry);
          }
        });
      }
    });

    return photos;
  }

  deleteAllPhotos() {
    // Clear from current route data
    const routeData = this.appState.getRouteData();
    const filtered = routeData.filter(entry => entry.type !== 'photo');
    this.appState.routeData = filtered;

    // Clear from all sessions
    const sessions = this.appState.getSessions();
    sessions.forEach(session => {
      if (session.data) {
        session.data = session.data.filter(entry => entry.type !== 'photo');
      }
    });
    localStorage.setItem('sessions', JSON.stringify(sessions));
  }
}