// dialogs.js - Custom Modal Dialog System
export class DialogSystem {
  constructor() {
    this.activeDialog = null;
    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById('dialog-system-styles')) return;

    const style = document.createElement('style');
    style.id = 'dialog-system-styles';
    style.textContent = `
      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
      }

      .dialog-container {
        background: white;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        animation: slideUp 0.3s ease;
      }

      .dialog-header {
        padding: 24px 24px 16px;
        border-bottom: 1px solid #e0e0e0;
      }

      .dialog-title {
        font-size: 24px;
        font-weight: 600;
        color: #2c5530;
        margin: 0 0 8px 0;
      }

      .dialog-subtitle {
        font-size: 14px;
        color: #666;
        margin: 0;
      }

      .dialog-body {
        padding: 24px;
      }

      .dialog-stats {
        background: #f5f5f5;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
      }

      .dialog-stat {
        display: flex;
        align-items: center;
        margin: 8px 0;
        font-size: 16px;
      }

      .dialog-stat-icon {
        margin-right: 12px;
        font-size: 20px;
      }

      .dialog-input-group {
        margin: 16px 0;
      }

      .dialog-label {
        display: block;
        font-weight: 500;
        margin-bottom: 8px;
        color: #333;
      }

      .dialog-input {
        width: 100%;
        padding: 12px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        font-size: 16px;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }

      .dialog-input:focus {
        outline: none;
        border-color: #4CAF50;
      }

      .dialog-checkbox-group {
        display: flex;
        align-items: center;
        margin: 16px 0;
        padding: 12px;
        background: #f9f9f9;
        border-radius: 8px;
        cursor: pointer;
      }

      .dialog-checkbox {
        width: 20px;
        height: 20px;
        margin-right: 12px;
        cursor: pointer;
      }

      .dialog-radio-group {
        margin: 16px 0;
      }

      .dialog-radio-option {
        display: flex;
        align-items: center;
        padding: 12px;
        margin: 8px 0;
        background: #f9f9f9;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .dialog-radio-option:hover {
        background: #f0f0f0;
        border-color: #4CAF50;
      }

      .dialog-radio-option.selected {
        background: #e8f5e9;
        border-color: #4CAF50;
      }

      .dialog-radio {
        width: 20px;
        height: 20px;
        margin-right: 12px;
        cursor: pointer;
      }

      .dialog-footer {
        padding: 16px 24px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .dialog-button {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .dialog-button-primary {
        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        color: white;
      }

      .dialog-button-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
      }

      .dialog-button-secondary {
        background: #f5f5f5;
        color: #333;
      }

      .dialog-button-secondary:hover {
        background: #e0e0e0;
      }

      .dialog-button-danger {
        background: #f44336;
        color: white;
      }

      .dialog-button-danger:hover {
        background: #d32f2f;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 600px) {
        .dialog-container {
          width: 95%;
          max-height: 90vh;
        }

        .dialog-footer {
          flex-direction: column;
        }

        .dialog-button {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Show save route dialog
   */
  showSaveDialog(stats) {
    return new Promise((resolve) => {
      const dialog = this.createSaveDialog(stats, resolve);
      document.body.appendChild(dialog);
      this.activeDialog = dialog;

      // Focus on input
      setTimeout(() => {
        const input = dialog.querySelector('.dialog-input');
        if (input) input.focus();
      }, 100);
    });
  }

  createSaveDialog(stats, resolve) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const defaultName = `Route ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

    overlay.innerHTML = `
      <div class="dialog-container">
        <div class="dialog-header">
          <h2 class="dialog-title">💾 Save Route</h2>
          <p class="dialog-subtitle">Give your adventure a name</p>
        </div>

        <div class="dialog-body">
          <div class="dialog-stats">
            <div class="dialog-stat">
              <span class="dialog-stat-icon">📍</span>
              <span><strong>${stats.locationPoints}</strong> GPS points</span>
            </div>
            <div class="dialog-stat">
              <span class="dialog-stat-icon">📏</span>
              <span><strong>${stats.distance.toFixed(2)} km</strong> distance</span>
            </div>
            <div class="dialog-stat">
              <span class="dialog-stat-icon">⏱️</span>
              <span><strong>${this.formatDuration(stats.duration)}</strong> duration</span>
            </div>
            ${stats.photos > 0 ? `
            <div class="dialog-stat">
              <span class="dialog-stat-icon">📷</span>
              <span><strong>${stats.photos}</strong> photos</span>
            </div>
            ` : ''}
            ${stats.notes > 0 ? `
            <div class="dialog-stat">
              <span class="dialog-stat-icon">📝</span>
              <span><strong>${stats.notes}</strong> notes</span>
            </div>
            ` : ''}
          </div>

          <div class="dialog-input-group">
            <label class="dialog-label">Route Name</label>
            <input 
              type="text" 
              class="dialog-input" 
              value="${defaultName}"
              placeholder="Enter route name..."
            >
          </div>

          <div class="dialog-radio-group">
            <label class="dialog-label">Visibility</label>
            <div class="dialog-radio-option selected" data-value="private">
              <input type="radio" name="visibility" value="private" class="dialog-radio" checked>
              <div>
                <strong>🔒 Private</strong>
                <div style="font-size: 14px; color: #666;">Only you can see it</div>
              </div>
            </div>
            <div class="dialog-radio-option" data-value="public">
              <input type="radio" name="visibility" value="public" class="dialog-radio">
              <div>
                <strong>🌍 Public</strong>
                <div style="font-size: 14px; color: #666;">Share with the community</div>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="dialog-button dialog-button-secondary" data-action="discard">
            Discard
          </button>
          <button class="dialog-button dialog-button-primary" data-action="save">
            Save Route
          </button>
        </div>
      </div>
    `;

    // Radio button selection
    const radioOptions = overlay.querySelectorAll('.dialog-radio-option');
    radioOptions.forEach(option => {
      option.addEventListener('click', () => {
        radioOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        option.querySelector('input').checked = true;
      });
    });

    // Button handlers
    overlay.querySelector('[data-action="save"]').addEventListener('click', () => {
      const name = overlay.querySelector('.dialog-input').value.trim();
      const visibility = overlay.querySelector('input[name="visibility"]:checked').value;

      this.closeDialog(overlay);
      resolve({
        save: true,
        name: name || defaultName,
        options: { visibility }
      });
    });

    overlay.querySelector('[data-action="discard"]').addEventListener('click', () => {
      this.showConfirmDialog(
        'Discard Route?',
        '⚠️ Are you sure you want to discard this route? All data will be lost!',
        'Discard',
        'Cancel'
      ).then(confirmed => {
        if (confirmed) {
          this.closeDialog(overlay);
          resolve({ save: false, discard: true });
        }
      });
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.showConfirmDialog(
          'Cancel Save?',
          'Do you want to cancel saving this route?',
          'Yes, Cancel',
          'No, Keep Editing'
        ).then(confirmed => {
          if (confirmed) {
            this.closeDialog(overlay);
            resolve({ save: false, discard: false });
          }
        });
      }
    });

    return overlay;
  }

  /**
   * Show confirmation dialog
   */
  showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDangerous = false) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';

      overlay.innerHTML = `
        <div class="dialog-container">
          <div class="dialog-header">
            <h2 class="dialog-title">${title}</h2>
          </div>

          <div class="dialog-body">
            <p style="font-size: 16px; line-height: 1.6;">${message}</p>
          </div>

          <div class="dialog-footer">
            <button class="dialog-button dialog-button-secondary" data-action="cancel">
              ${cancelText}
            </button>
            <button class="dialog-button ${isDangerous ? 'dialog-button-danger' : 'dialog-button-primary'}" data-action="confirm">
              ${confirmText}
            </button>
          </div>
        </div>
      `;

      overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        this.closeDialog(overlay);
        resolve(true);
      });

      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        this.closeDialog(overlay);
        resolve(false);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeDialog(overlay);
          resolve(false);
        }
      });

      document.body.appendChild(overlay);
      this.activeDialog = overlay;
    });
  }

  /**
   * Show alert dialog
   */
  showAlert(title, message, buttonText = 'OK') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';

      overlay.innerHTML = `
        <div class="dialog-container">
          <div class="dialog-header">
            <h2 class="dialog-title">${title}</h2>
          </div>

          <div class="dialog-body">
            <p style="font-size: 16px; line-height: 1.6;">${message}</p>
          </div>

          <div class="dialog-footer">
            <button class="dialog-button dialog-button-primary" data-action="ok">
              ${buttonText}
            </button>
          </div>
        </div>
      `;

      const closeDialog = () => {
        this.closeDialog(overlay);
        resolve();
      };

      overlay.querySelector('[data-action="ok"]').addEventListener('click', closeDialog);
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDialog();
      });

      document.body.appendChild(overlay);
      this.activeDialog = overlay;
    });
  }

  closeDialog(dialog) {
    if (dialog) {
      dialog.style.animation = 'fadeIn 0.2s ease reverse';
      setTimeout(() => {
        dialog.remove();
        if (this.activeDialog === dialog) {
          this.activeDialog = null;
        }
      }, 200);
    }
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}

export default DialogSystem;