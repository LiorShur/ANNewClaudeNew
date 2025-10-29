/**
 * ACCESS NATURE - NAVIGATION CONTROLLER
 * Enhanced mobile navigation with hamburger menu
 */

export class NavigationController {
  constructor() {
    this.menuToggle = null;
    this.navMenu = null;
    this.isOpen = false;
    
    console.log('🧭 NavigationController initialized');
  }

  initialize() {
    this.menuToggle = document.getElementById('menuToggle');
    this.navMenu = document.getElementById('navMenu');

    if (!this.menuToggle || !this.navMenu) {
      console.warn('Navigation elements not found');
      return;
    }

    this.setupEventListeners();
    this.highlightActivePage();
  }

  setupEventListeners() {
    // Toggle menu on button click
    this.menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.navMenu.contains(e.target) && e.target !== this.menuToggle) {
        this.closeMenu();
      }
    });

    // Close menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeMenu();
      }
    });

    // Close menu when clicking nav links
    const navLinks = this.navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        this.closeMenu();
      });
    });

    // Prevent menu close when clicking inside menu
    this.navMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  toggleMenu() {
    if (this.isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    this.isOpen = true;
    this.navMenu.classList.add('active');
    this.menuToggle.classList.add('active');
    this.menuToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  }

  closeMenu() {
    this.isOpen = false;
    this.navMenu.classList.remove('active');
    this.menuToggle.classList.remove('active');
    this.menuToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }

  highlightActivePage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
}

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const nav = new NavigationController();
    nav.initialize();
  });
} else {
  const nav = new NavigationController();
  nav.initialize();
}

export default NavigationController;