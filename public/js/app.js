/**
 * ==============================================================================
 * MediMate - Client Application Engine (Phase 3 Full-Stack Integration)
 * ==============================================================================
 * "Your personal healthcare companion."
 *
 * Connects the accessible UI to the real Express backend & MongoDB Atlas database:
 * 1. Authentication lifecycle (Register, Sign In, Sign Out, Session Restoration)
 * 2. Real user-scoped Medicine CRUD & Dose Tracking via API
 * 3. Real user-scoped Health Records CRUD via API
 * 4. Genuine empty states and zero fabricated dummy data
 * 5. Secure HTTP-only cookie session handling (No tokens in localStorage)
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

  // ----------------------------------------------------------------------------
  // 1. Application State
  // ----------------------------------------------------------------------------
  let currentUser = null; // { id, name, email } or null
  let medicines = []; // User's real medicines fetched from /api/medicines
  let healthRecords = []; // User's real records fetched from /api/health-records
  let medicalReports = []; // User's real documents fetched from /api/medical-reports
  let doctorVisits = []; // User's real visits fetched from /api/doctor-visits

  let activeMedTimeFilter = 'all';
  let activeMedStatusFilter = 'all'; // 'all' | 'active' | 'completed'
  let medSearchQuery = '';
  let activeRecordCategoryFilter = 'all';
  let activeReportCategoryFilter = 'all';
  let reportSearchQuery = '';
  let activeVisitStatusFilter = 'all';

  let itemToDelete = null; // { type: 'medicine'|'record'|'report'|'visit', id: string, name: string }
  let lastFocusedElement = null; // for modal accessibility return
  let selectedPhotoFile = null; // For profile picture preview and upload

  // ----------------------------------------------------------------------------
  // 2. Navigation UI & Session Handling (Single Unified Responsive Header)
  // ----------------------------------------------------------------------------
  const navCollapse = document.getElementById('publicNavCollapse') || document.getElementById('navCollapse');
  const navLinksGroup = document.getElementById('publicNavLinksGroup') || document.getElementById('navLinksGroup');
  const navAuthGroup = document.getElementById('publicNavAuthGroup') || document.getElementById('navAuthGroup');
  const mobileMenuToggle = document.getElementById('publicMobileMenuToggle') || document.getElementById('mobileMenuToggle');

  const publicView = document.getElementById('publicView');
  const authenticatedView = document.getElementById('authenticatedView');
  const appLoadingState = document.getElementById('appLoadingState');
  const userNameGreeting = document.getElementById('userNameGreeting');

  // ----------------------------------------------------------------------------
  // Route Definitions & Dedicated Page View Mapping
  // ----------------------------------------------------------------------------
  const ROUTES = {
    '/dashboard': {
      viewId: 'viewDashboard',
      title: 'Dashboard — MediMate',
      renderer: () => renderDashboard()
    },
    '/schedule': {
      viewId: 'viewSchedule',
      title: "Today's Schedule — MediMate",
      renderer: () => renderSchedule()
    },
    '/medicines': {
      viewId: 'viewMedicines',
      title: 'My Medicines — MediMate',
      renderer: () => renderMedicines()
    },
    '/health-records': {
      viewId: 'viewRecords',
      title: 'Health Records — MediMate',
      renderer: () => renderHealthRecords()
    },
    '/medical-reports': {
      viewId: 'viewReports',
      title: 'Medical Reports & Files — MediMate',
      renderer: () => renderMedicalReports()
    },
    '/doctor-visits': {
      viewId: 'viewVisits',
      title: 'Doctor Visits & Appointments — MediMate',
      renderer: () => renderDoctorVisits()
    },
    '/profile': {
      viewId: 'viewProfile',
      title: 'My Profile — MediMate',
      renderer: () => renderProfile()
    },
    '/caregiver': {
      viewId: 'viewCaregiverDashboard',
      title: 'Caregiver Dashboard — MediMate',
      renderer: () => renderCaregiverDashboard()
    },
    '/caregiver/dashboard': {
      viewId: 'viewCaregiverDashboard',
      title: 'Caregiver Dashboard — MediMate',
      renderer: () => renderCaregiverDashboard()
    },
    '/caregiver/patients': {
      viewId: 'viewCaregiverPatients',
      title: 'My Patients — MediMate',
      renderer: () => renderCaregiverPatients()
    },
    '/caregiver/schedule': {
      viewId: 'viewCaregiverSchedule',
      title: 'Medicine Schedule — MediMate',
      renderer: () => renderCaregiverSchedule()
    }
  };
  const DEFAULT_AUTH_ROUTE = '/dashboard';

  /**
   * Client-Side Router: Switches active dedicated page view, updates document title,
   * highlights active navigation links, and manages browser history.
   */
  function navigateTo(targetPath, push = true) {
    let path = targetPath || '/';
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    // 1. Unauthenticated Visitor Handling
    if (!currentUser) {
      if (path === '/' || path === '') {
        renderPublicState();
        if (push && window.location.pathname !== '/') {
          history.pushState(null, '', '/');
        }
      } else {
        // Protected route accessed without session
        history.replaceState(null, '', '/');
        renderPublicState();
        openAuthModal(false);
        showToast('Please sign in to access your personal healthcare portal.', 'info');
      }
      return;
    }

    // 2. Authenticated Patient or Caregiver Handling
    const defaultRoute = (currentUser && currentUser.role === 'caregiver') ? '/caregiver' : DEFAULT_AUTH_ROUTE;
    if (path === '/' || path === '') {
      path = defaultRoute;
    }

    // Role-specific route enforcement
    if (currentUser && currentUser.role === 'caregiver') {
      const caregiverAllowedRoutes = ['/caregiver', '/caregiver/dashboard', '/caregiver/patients', '/caregiver/schedule', '/profile'];
      if (!caregiverAllowedRoutes.includes(path)) {
        path = '/caregiver';
      }
    } else if (currentUser && currentUser.role === 'patient') {
      const caregiverOnlyRoutes = ['/caregiver', '/caregiver/dashboard', '/caregiver/patients', '/caregiver/schedule'];
      if (caregiverOnlyRoutes.includes(path)) {
        path = DEFAULT_AUTH_ROUTE;
      }
    }

    const routeConfig = ROUTES[path] || ROUTES[defaultRoute];
    const resolvedPath = ROUTES[path] ? path : defaultRoute;

    // Ensure layout displays authenticated container
    if (publicView) publicView.style.display = 'none';
    if (authenticatedView) authenticatedView.style.display = 'block';

    // Switch dedicated page views
    document.querySelectorAll('.page-view').forEach(viewEl => {
      viewEl.classList.remove('active');
      viewEl.style.display = 'none';
    });

    const targetViewEl = document.getElementById(routeConfig.viewId);
    if (targetViewEl) {
      targetViewEl.classList.add('active');
      targetViewEl.style.display = 'block';
    }

    // Update browser title
    document.title = routeConfig.title;

    // Update active navigation link in public header (if visible)
    if (navLinksGroup) {
      navLinksGroup.querySelectorAll('.nav-link').forEach(link => {
        const linkRoute = link.getAttribute('data-route') || link.getAttribute('href');
        if (linkRoute === resolvedPath) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        } else {
          link.classList.remove('active');
          link.removeAttribute('aria-current');
        }
      });
    }

    // Update active navigation link in left sidebar
    document.querySelectorAll('.sidebar-nav-item').forEach(link => {
      const linkRoute = link.getAttribute('data-route') || link.getAttribute('href');
      if (linkRoute === resolvedPath) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });

    // Close drawers on navigation
    closeSidebarDrawer();
    closeNotificationsDrawer();

    // Update browser History API
    if (push && window.location.pathname !== resolvedPath) {
      history.pushState(null, '', resolvedPath);
    }

    // Render data for this view
    if (typeof routeConfig.renderer === 'function') {
      routeConfig.renderer();
    }

    // Close mobile menu if open
    closeMobileMenu();

    // Scroll to top of page smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Check authenticated status on page load via /api/auth/me
   */
  async function checkAuthStatus() {
    if (appLoadingState) appLoadingState.style.display = 'block';

    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        currentUser = data.user;

        // Sync theme with user preference or storage
        if (currentUser.themePreference) {
          applyTheme(currentUser.themePreference);
        }

        // Sync client timezone with backend profile for accurate scheduled reminders
        syncClientTimezone();
        autoSyncPushSubscription();

        renderAuthenticatedState();
        if (currentUser.role === 'patient') {
          await fetchUserData();
        }
        startReminderScheduler();

        // Navigate to the current browser URL route, or fallback to default
        const currentPath = window.location.pathname;
        const defaultRoute = (currentUser && currentUser.role === 'caregiver') ? '/caregiver' : DEFAULT_AUTH_ROUTE;
        let targetRoute = (currentPath && currentPath !== '/' && ROUTES[currentPath]) ? currentPath : defaultRoute;
        if (currentUser.role === 'caregiver') {
          const caregiverAllowed = ['/caregiver', '/caregiver/dashboard', '/caregiver/patients', '/caregiver/schedule', '/profile'];
          if (!caregiverAllowed.includes(targetRoute)) {
            targetRoute = '/caregiver';
          }
        } else if (currentUser.role === 'patient') {
          const caregiverOnly = ['/caregiver', '/caregiver/dashboard', '/caregiver/patients', '/caregiver/schedule'];
          if (caregiverOnly.includes(targetRoute)) {
            targetRoute = DEFAULT_AUTH_ROUTE;
          }
        }
        navigateTo(targetRoute, currentPath !== targetRoute);
      } else {
        currentUser = null;
        const currentPath = window.location.pathname;
        if (currentPath !== '/') {
          history.replaceState(null, '', '/');
        }
        renderPublicState();
        if (currentPath !== '/' && ROUTES[currentPath]) {
          openAuthModal(false);
          showToast('Please sign in to access your personal healthcare portal.', 'info');
        }
      }
    } catch (error) {
      console.warn('[Auth Check] Not authenticated or offline:', error.message);
      currentUser = null;
      renderPublicState();
    } finally {
      if (appLoadingState) appLoadingState.style.display = 'none';
    }
  }

  /**
   * Render Navigation & Shell for Authenticated User
   */
  function renderAuthenticatedState() {
    document.body.classList.add('has-sidebar');
    const publicSiteHeader = document.getElementById('publicSiteHeader');
    if (publicSiteHeader) publicSiteHeader.style.display = 'none';
    const appSidebar = document.getElementById('appSidebar');
    if (appSidebar) appSidebar.style.display = 'flex';
    const mobileAppBar = document.getElementById('mobileAppBar');
    if (mobileAppBar) mobileAppBar.style.display = '';

    if (publicView) publicView.style.display = 'none';
    if (authenticatedView) authenticatedView.style.display = 'block';

    if (userNameGreeting && currentUser) {
      userNameGreeting.textContent = currentUser.name || (currentUser.role === 'caregiver' ? 'Caregiver' : 'Patient');
    }

    const isCaregiver = currentUser && currentUser.role === 'caregiver';

    const patientNavGroup = document.getElementById('patientNavGroup');
    const caregiverNavGroup = document.getElementById('caregiverNavGroup');
    if (patientNavGroup) patientNavGroup.style.display = isCaregiver ? 'none' : 'block';
    if (caregiverNavGroup) caregiverNavGroup.style.display = isCaregiver ? 'block' : 'none';

    // Update brand link target
    document.querySelectorAll('.sidebar-brand').forEach(brandLink => {
      const brandRoute = isCaregiver ? '/caregiver' : '/dashboard';
      brandLink.setAttribute('href', brandRoute);
      brandLink.setAttribute('data-route', brandRoute);
    });

    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserEmail = document.getElementById('sidebarUserEmail');
    if (sidebarUserName && currentUser) {
      sidebarUserName.textContent = currentUser.name || (isCaregiver ? 'Caregiver' : 'Patient');
    }
    if (sidebarUserEmail && currentUser) {
      sidebarUserEmail.textContent = currentUser.email || '';
    }

    updateProfileAvatarUI();
    updateRemindersUI();

    const btnSignOut = document.getElementById('btnSignOut');
    if (btnSignOut) btnSignOut.onclick = handleSignOut;

    wireMobileMenuToggle();
  }

  /**
   * Wire all landing page sign-in and sign-up trigger buttons
   */
  function wireAuthTriggerButtons() {
    const btnNavSignIn = document.getElementById('btnNavSignIn');
    const btnNavSignUp = document.getElementById('btnNavSignUp');
    const btnHeroSignIn = document.getElementById('btnHeroSignIn');
    const btnHeroSignUp = document.getElementById('btnHeroSignUp');

    if (btnNavSignIn) btnNavSignIn.onclick = () => { closeMobileMenu(); openAuthModal(false); };
    if (btnNavSignUp) btnNavSignUp.onclick = () => { closeMobileMenu(); openAuthModal(true); };
    if (btnHeroSignIn) btnHeroSignIn.onclick = () => { closeMobileMenu(); openAuthModal(false); };
    if (btnHeroSignUp) btnHeroSignUp.onclick = () => { closeMobileMenu(); openAuthModal(true); };
  }

  /**
   * Render Navigation & Views for Public Visitors
   */
  function renderPublicState() {
    document.body.classList.remove('has-sidebar');
    const publicSiteHeader = document.getElementById('publicSiteHeader');
    if (publicSiteHeader) publicSiteHeader.style.display = 'block';
    const appSidebar = document.getElementById('appSidebar');
    if (appSidebar) appSidebar.style.display = 'none';
    const mobileAppBar = document.getElementById('mobileAppBar');
    if (mobileAppBar) mobileAppBar.style.display = 'none';

    closeSidebarDrawer();
    closeNotificationsDrawer();
    closeMobileMenu();

    if (authenticatedView) authenticatedView.style.display = 'none';
    if (publicView) publicView.style.display = 'block';

    document.title = 'MediMate — Your Personal Healthcare Companion';

    // Clear state
    medicines = [];
    healthRecords = [];
    medicalReports = [];
    doctorVisits = [];

    // Ensure links active state
    if (navLinksGroup) {
      const homeLink = navLinksGroup.querySelector('[data-route="/"]');
      if (homeLink) homeLink.classList.add('active');
    }

    // Hook up all navigation and authentication triggers
    wireAuthTriggerButtons();
    wireMobileMenuToggle();
  }

  /**
   * Fetch authenticated user's real medicines, records, reports, and doctor visits
   */
  async function fetchUserData() {
    if (currentUser && currentUser.role === 'caregiver') {
      if (appLoadingState) appLoadingState.style.display = 'none';
      return;
    }
    const errorBanner = document.getElementById('appErrorBanner');
    if (errorBanner) errorBanner.style.display = 'none';

    try {
      const [medsRes, recordsRes, reportsRes, visitsRes] = await Promise.all([
        fetch('/api/medicines', { headers: { 'Accept': 'application/json' } }),
        fetch('/api/health-records', { headers: { 'Accept': 'application/json' } }),
        fetch('/api/medical-reports', { headers: { 'Accept': 'application/json' } }),
        fetch('/api/doctor-visits', { headers: { 'Accept': 'application/json' } })
      ]);

      if (!medsRes.ok || !recordsRes.ok || !reportsRes.ok || !visitsRes.ok) {
        throw new Error('One or more healthcare services could not be reached.');
      }

      medicines = (await medsRes.json()).medicines || [];
      healthRecords = (await recordsRes.json()).records || [];
      medicalReports = (await reportsRes.json()).reports || [];
      doctorVisits = (await visitsRes.json()).visits || [];

      if (errorBanner) errorBanner.style.display = 'none';
      renderAll();
    } catch (error) {
      console.error('[Data Fetch Error]', error);
      if (errorBanner) {
        errorBanner.style.display = 'flex';
        const msg = document.getElementById('appErrorMessage');
        if (msg) msg.textContent = 'Unable to load your healthcare records. Please check your network connection.';
        const retryBtn = document.getElementById('btnRetryFetch');
        if (retryBtn) {
          retryBtn.onclick = () => {
            fetchUserData();
          };
        }
      }
      showToast('Could not load your records. Please check your network connection.', 'danger');
    } finally {
      if (appLoadingState) appLoadingState.style.display = 'none';
    }
  }

  /**
   * Sign Out Handler
   */
  async function handleSignOut() {
    stopReminderScheduler();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Non-fatal
    }
    currentUser = null;
    history.pushState(null, '', '/');
    closeMobileMenu();
    renderPublicState();
    showToast('You have been signed out successfully.', 'info');
  }

  // Intercept client navigation clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-route], a.brand-logo-link, #brandHomeLink');
    if (!link) return;

    const route = link.getAttribute('data-route') || link.getAttribute('href');
    if (route && (route.startsWith('/') || route === '')) {
      if (link.getAttribute('target') === '_blank') return;
      e.preventDefault();
      navigateTo(route, true);
    }
  });

  // Browser back and forward button navigation
  window.addEventListener('popstate', () => {
    if (currentUser) {
      navigateTo(window.location.pathname, false);
    } else {
      if (window.location.pathname !== '/') {
        history.replaceState(null, '', '/');
      }
      renderPublicState();
    }
  });

  // ----------------------------------------------------------------------------
  // 3. Render Functions (Real Data & Helpful Empty States)
  // ----------------------------------------------------------------------------

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const month = monthNames[parseInt(parts[1], 10) - 1];
        const day = parseInt(parts[2], 10);
        return `${month} ${day}, ${year}`;
      }
    } catch (e) {
      // Fallback
    }
    return dateStr;
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Render Patient Dashboard Overview
   */
  function renderDashboard() {
    const dashPatientName = document.getElementById('dashPatientName');
    if (dashPatientName && currentUser) {
      dashPatientName.textContent = currentUser.name || 'Patient';
    }

    const todayStr = getTodayDateString();

    // 1. Dose Adherence (Calculated from active prescriptions for today)
    const activeMeds = medicines.filter(m => !m.endDate || m.endDate >= todayStr);
    const totalDoses = activeMeds.length;
    const takenMeds = activeMeds.filter(m => Array.isArray(m.doseHistory) && m.doseHistory.some(d => d.date === todayStr && d.status === 'taken'));
    const takenCount = takenMeds.length;
    const percentage = totalDoses > 0 ? Math.round((takenCount / totalDoses) * 100) : 0;

    const dashAdherenceValue = document.getElementById('dashAdherenceValue');
    const dashAdherenceLabel = document.getElementById('dashAdherenceLabel');
    const dashAdherenceBadge = document.getElementById('dashAdherenceBadge');
    const dashProgressFill = document.getElementById('dashProgressFill');
    const dashProgressBar = document.getElementById('dashProgressBar');

    if (dashAdherenceValue) dashAdherenceValue.textContent = `${takenCount} of ${totalDoses}`;
    if (dashAdherenceLabel) dashAdherenceLabel.textContent = totalDoses === 0 ? 'No active medicines today' : `Doses taken today (${percentage}%)`;
    if (dashAdherenceBadge) dashAdherenceBadge.textContent = totalDoses === 0 ? 'No Active Courses' : (percentage === 100 ? '✓ Complete' : 'Today');
    if (dashProgressFill) dashProgressFill.style.width = `${percentage}%`;
    if (dashProgressBar) dashProgressBar.setAttribute('aria-valuenow', percentage);

    // 2. Prescriptions Count (Total in user's profile)
    const dashMedsTotal = document.getElementById('dashMedsTotal');
    if (dashMedsTotal) dashMedsTotal.textContent = `${medicines.length}`;

    // 3. Next Doctor Visit
    const dashNextVisitDoctor = document.getElementById('dashNextVisitDoctor');
    const dashNextVisitMeta = document.getElementById('dashNextVisitMeta');

    const upcomingVisits = doctorVisits
      .filter(v => v.status === 'Upcoming')
      .sort((a, b) => `${a.appointmentDate} ${a.appointmentTime}`.localeCompare(`${b.appointmentDate} ${b.appointmentTime}`));

    if (upcomingVisits.length > 0) {
      const next = upcomingVisits[0];
      if (dashNextVisitDoctor) dashNextVisitDoctor.textContent = `Dr. ${next.doctorName}`;
      if (dashNextVisitMeta) dashNextVisitMeta.textContent = `${formatDate(next.appointmentDate)} at ${formatTime(next.appointmentTime)} · ${next.clinicOrHospital || next.specialty || 'Clinic'}`;
    } else {
      if (dashNextVisitDoctor) dashNextVisitDoctor.textContent = 'No upcoming visits';
      if (dashNextVisitMeta) dashNextVisitMeta.textContent = 'Schedule your next consultation';
    }

    // 4. Documents & Records Total
    const dashDocsTotal = document.getElementById('dashDocsTotal');
    const dashRecordsTotal = document.getElementById('dashRecordsTotal');
    if (dashDocsTotal) dashDocsTotal.textContent = `${medicalReports.length} Document${medicalReports.length === 1 ? '' : 's'}`;
    if (dashRecordsTotal) dashRecordsTotal.textContent = `${healthRecords.length} clinical note${healthRecords.length === 1 ? '' : 's'} on record`;

    // 5. Today's Medicine Snapshot List (Active courses only)
    const todaySnapshotContainer = document.getElementById('dashTodaySnapshotContainer');
    if (todaySnapshotContainer) {
      if (activeMeds.length === 0) {
        todaySnapshotContainer.innerHTML = `
          <div class="empty-state" style="padding: 24px 16px;">
            <span class="empty-icon" style="font-size: 2rem;" aria-hidden="true">${medicines.length === 0 ? '💊' : '✓'}</span>
            <h4 class="empty-title" style="font-size: 1.1rem;">${medicines.length === 0 ? 'No Medicines Added' : 'No Doses Due Today'}</h4>
            <p class="empty-text" style="font-size: var(--font-size-sm); margin-bottom: 12px;">
              ${medicines.length === 0 ? 'Add your daily medications to start tracking doses.' : 'All recorded medication courses have completed.'}
            </p>
            <button type="button" class="btn btn-primary btn-sm" id="btnDashEmptyAddMed">+ Add Medicine</button>
          </div>
        `;
        const btnDashEmpty = document.getElementById('btnDashEmptyAddMed');
        if (btnDashEmpty) btnDashEmpty.addEventListener('click', () => openMedicineModal());
      } else {
        const previewMeds = activeMeds.slice(0, 4);
        todaySnapshotContainer.innerHTML = previewMeds.map(med => {
          const isTaken = Array.isArray(med.doseHistory) && med.doseHistory.some(d => d.date === todayStr && d.status === 'taken');
          const timeStr = (med.scheduleTimes && med.scheduleTimes[0]) ? formatTime(med.scheduleTimes[0]) : '';
          return `
            <div class="dash-mini-item">
              <div class="dash-mini-left">
                <div class="dash-mini-title">${escapeHtml(med.name)} <span style="font-size: var(--font-size-xs); color: var(--color-teal-dark); font-weight: 600;">(${escapeHtml(med.dosage)})</span></div>
                <div class="dash-mini-subtitle">${escapeHtml(med.timeOfDay || 'Daily')} • ${timeStr}</div>
              </div>
              <span class="dash-mini-badge ${isTaken ? 'taken' : 'pending'}">
                ${isTaken ? '✓ Taken' : 'Due'}
              </span>
            </div>
          `;
        }).join('') + (medicines.length > 4 ? `
          <div style="text-align: center; margin-top: 10px;">
            <a href="/schedule" data-route="/schedule" class="metric-link" style="font-size: var(--font-size-xs);">+ View ${medicines.length - 4} more in Today's Schedule →</a>
          </div>
        ` : '');
      }
    }

    // 6. Upcoming Consultations Container
    const dashUpcomingContainer = document.getElementById('dashUpcomingVisitsContainer');
    if (dashUpcomingContainer) {
      if (upcomingVisits.length === 0) {
        dashUpcomingContainer.innerHTML = `
          <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: 8px;">
            No upcoming appointments scheduled.
          </p>
          <button type="button" class="btn btn-secondary btn-sm" id="btnDashScheduleFirstVisit">+ Schedule Appointment</button>
        `;
        const btnSchedule = document.getElementById('btnDashScheduleFirstVisit');
        if (btnSchedule) btnSchedule.addEventListener('click', () => openVisitModal());
      } else {
        dashUpcomingContainer.innerHTML = upcomingVisits.slice(0, 2).map(visit => `
          <div class="dash-mini-item">
            <div class="dash-mini-left">
              <div class="dash-mini-title">Dr. ${escapeHtml(visit.doctorName)} (${escapeHtml(visit.specialty || 'General')})</div>
              <div class="dash-mini-subtitle">📅 ${formatDate(visit.appointmentDate)} at ${formatTime(visit.appointmentTime)} • ${escapeHtml(visit.clinicOrHospital || 'Clinic')}</div>
            </div>
            <span class="dash-mini-badge pending">Upcoming</span>
          </div>
        `).join('');
      }
    }

    // 7. Recent Health Activity Container
    const dashRecentContainer = document.getElementById('dashRecentActivityContainer');
    if (dashRecentContainer) {
      const recentItems = [];
      healthRecords.slice(0, 2).forEach(r => recentItems.push({
        type: 'Record',
        title: r.title,
        subtitle: `${formatDate(r.date)} • ${r.category}`,
        icon: '📋'
      }));
      medicalReports.slice(0, 2).forEach(d => recentItems.push({
        type: 'Document',
        title: d.title,
        subtitle: `${formatDate(d.reportDate)} • ${d.category}`,
        icon: '🔒'
      }));

      if (recentItems.length === 0) {
        dashRecentContainer.innerHTML = `
          <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: 8px;">
            No health records or documents uploaded yet.
          </p>
          <button type="button" class="btn btn-secondary btn-sm" id="btnDashAddFirstRecord">+ Add First Health Note</button>
        `;
        const btnFirstRecord = document.getElementById('btnDashAddFirstRecord');
        if (btnFirstRecord) btnFirstRecord.addEventListener('click', () => openRecordModal());
      } else {
        dashRecentContainer.innerHTML = recentItems.slice(0, 3).map(item => `
          <div class="dash-mini-item">
            <div class="dash-mini-left">
              <div class="dash-mini-title">${item.icon} ${escapeHtml(item.title)}</div>
              <div class="dash-mini-subtitle">${escapeHtml(item.subtitle)}</div>
            </div>
            <span class="item-meta-tag" style="font-size: 11px;">${item.type}</span>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Render Today's Schedule & Progress
   */
  function renderSchedule() {
    const container = document.getElementById('scheduleListContainer');
    const heroProgressCount = document.getElementById('heroProgressCount');
    const scheduleProgressText = document.getElementById('scheduleProgressText');
    const scheduleProgressFill = document.getElementById('scheduleProgressFill');
    const scheduleProgressBar = document.getElementById('scheduleProgressBar');

    if (!container) return;

    const todayStr = getTodayDateString();

    // Calculate real progress based on today's active medicines (non-expired)
    const activeMeds = medicines.filter(m => !m.endDate || m.endDate >= todayStr);
    const totalDoses = activeMeds.length;
    const takenMeds = activeMeds.filter(m => {
      return Array.isArray(m.doseHistory) && m.doseHistory.some(d => d.date === todayStr && d.status === 'taken');
    });
    const takenCount = takenMeds.length;
    const percentage = totalDoses > 0 ? Math.round((takenCount / totalDoses) * 100) : 0;

    // Update Progress Bars & Counters
    if (heroProgressCount) {
      heroProgressCount.textContent = `${takenCount} of ${totalDoses}`;
    }
    if (scheduleProgressText) {
      scheduleProgressText.textContent = `${takenCount} of ${totalDoses} doses taken (${percentage}%)`;
    }
    if (scheduleProgressFill) {
      scheduleProgressFill.style.width = `${percentage}%`;
    }
    if (scheduleProgressBar) {
      scheduleProgressBar.setAttribute('aria-valuenow', percentage);
    }

    // Genuine Helpful Empty State for new users
    if (medicines.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">💊</span>
          <h3 class="empty-title">Your Medicine Schedule is Empty</h3>
          <p class="empty-text">
            You haven't added any medicines to your account yet. Add your daily prescriptions to track your doses.
          </p>
          <button type="button" class="btn btn-primary" id="btnEmptyScheduleAdd">
            + Add Your First Medicine
          </button>
        </div>
      `;
      const btnAdd = document.getElementById('btnEmptyScheduleAdd');
      if (btnAdd) btnAdd.addEventListener('click', () => openMedicineModal());
      return;
    }

    // When medicines exist but all courses have completed
    if (activeMeds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🎉</span>
          <h3 class="empty-title">All Medication Courses Completed</h3>
          <p class="empty-text">
            All your prescribed medicine courses have concluded. You have no pending doses scheduled for today.
          </p>
          <a href="/medicines" data-route="/medicines" class="btn btn-secondary">
            View Prescriptions History →
          </a>
        </div>
      `;
      return;
    }

    // Sort active medicines by schedule time
    const sortedMeds = [...activeMeds].sort((a, b) => {
      const timeA = (a.scheduleTimes && a.scheduleTimes[0]) || '';
      const timeB = (b.scheduleTimes && b.scheduleTimes[0]) || '';
      return timeA.localeCompare(timeB);
    });

    container.innerHTML = sortedMeds.map(med => {
      const todayDose = Array.isArray(med.doseHistory) ? med.doseHistory.find(d => d.date === todayStr && d.status === 'taken') : null;
      const isTaken = !!todayDose;
      const displayTime = (med.scheduleTimes && med.scheduleTimes[0]) ? formatTime(med.scheduleTimes[0]) : '';

      return `
        <div class="schedule-item ${isTaken ? 'is-taken' : ''}" data-id="${med._id}">
          <div class="schedule-time-box">
            <span class="schedule-time-badge">${escapeHtml(med.timeOfDay || 'Scheduled')}</span>
            <span class="schedule-clock-time">${displayTime}</span>
          </div>

          <div class="schedule-info-box">
            <div class="schedule-med-name">
              <span>${escapeHtml(med.name)}</span>
              <span class="schedule-dose-tag">${escapeHtml(med.dosage)}</span>
            </div>
            <p class="schedule-notes">
              ${med.notes ? escapeHtml(med.notes) : 'Standard scheduled daily dose.'}
            </p>
          </div>

          <div class="schedule-action-box">
            ${isTaken ? `
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                <span class="status-badge taken">✓ Taken ${todayDose.takenAt ? `at ${todayDose.takenAt}` : ''}</span>
                <button type="button" class="btn btn-secondary btn-sm btn-toggle-dose" data-id="${med._id}" data-action="undo">
                  Undo Checkoff
                </button>
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                <span class="status-badge due">Scheduled Dose</span>
                <button type="button" class="btn btn-primary btn-toggle-dose" data-id="${med._id}" data-action="take">
                  ✓ Mark as Taken
                </button>
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Attach Event Listeners to Dose Toggle Buttons
    container.querySelectorAll('.btn-toggle-dose').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        handleDoseAction(id, action);
      });
    });
  }

  /**
   * Render My Medicines List
   */
  function renderMedicines() {
    const container = document.getElementById('medicinesGridContainer');
    if (!container) return;

    const todayStr = getTodayDateString();

    // Filter by search query, time of day & course status
    let filtered = medicines.filter(med => {
      const matchesSearch = med.name.toLowerCase().includes(medSearchQuery.toLowerCase()) ||
                            (med.notes && med.notes.toLowerCase().includes(medSearchQuery.toLowerCase()));
      const matchesTime = activeMedTimeFilter === 'all' || med.timeOfDay === activeMedTimeFilter;
      const isCompleted = med.endDate && med.endDate < todayStr;
      const matchesStatus = activeMedStatusFilter === 'all' ||
                            (activeMedStatusFilter === 'active' && !isCompleted) ||
                            (activeMedStatusFilter === 'completed' && isCompleted);
      return matchesSearch && matchesTime && matchesStatus;
    });

    const medsCountBadge = document.getElementById('medsCountBadge');
    if (medsCountBadge) {
      medsCountBadge.textContent = medicines.length === 0
        ? '0 medicines'
        : `Showing ${filtered.length} of ${medicines.length} medicine${medicines.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-icon" aria-hidden="true">💊</span>
          <h3 class="empty-title">${medicines.length === 0 ? 'No Medicines in Your Account' : 'No Medicines Match Your Filter'}</h3>
          <p class="empty-text">
            ${medicines.length === 0 
              ? 'Keep track of your dosages and daily schedules by adding your first medicine.' 
              : `No results found. Try resetting your filter to view all medicines.`}
          </p>
          <button type="button" class="btn btn-primary" id="btnEmptyMedAddAction">
            ${medicines.length === 0 ? '+ Add Your First Medicine' : 'Show All Medicines'}
          </button>
        </div>
      `;
      const btnEmptyAction = document.getElementById('btnEmptyMedAddAction');
      if (btnEmptyAction) {
        btnEmptyAction.addEventListener('click', () => {
          if (medicines.length === 0) {
            openMedicineModal();
          } else {
            activeMedTimeFilter = 'all';
            activeMedStatusFilter = 'all';
            medSearchQuery = '';
            const searchInput = document.getElementById('medSearchInput');
            if (searchInput) searchInput.value = '';
            updateFilterPillUI('filter-btn', 'all');
            document.querySelectorAll('.med-status-btn').forEach(b => {
              if (b.getAttribute('data-status') === 'all') b.classList.add('active');
              else b.classList.remove('active');
            });
            renderMedicines();
          }
        });
      }
      return;
    }

    container.innerHTML = filtered.map(med => {
      const todayDose = Array.isArray(med.doseHistory) ? med.doseHistory.find(d => d.date === todayStr && d.status === 'taken') : null;
      const isTaken = !!todayDose;
      const displayTime = (med.scheduleTimes && med.scheduleTimes[0]) ? formatTime(med.scheduleTimes[0]) : '';
      const isCompleted = med.endDate && med.endDate < todayStr;

      const statusBadge = isCompleted
        ? `<span class="badge-completed">✓ Course Completed (${formatDate(med.endDate)})</span>`
        : `<span class="badge-active">● Active Prescription</span>`;

      const courseDurationRow = (med.startDate || med.endDate)
        ? `<div class="detail-row">
            <span>Course Duration:</span>
            <strong>${med.startDate ? formatDate(med.startDate) : 'Started'} → ${med.endDate ? formatDate(med.endDate) : 'Ongoing'}</strong>
          </div>`
        : '';

      return `
        <article class="item-card ${isCompleted ? 'course-completed' : ''}" data-id="${med._id}">
          <div class="item-card-top">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                <h3 class="item-card-title" style="margin: 0;">${escapeHtml(med.name)}</h3>
                ${statusBadge}
              </div>
              <span style="font-size: var(--font-size-sm); color: var(--color-teal-dark); font-weight: 600;">
                ${escapeHtml(med.dosage)}
              </span>
            </div>
            <span class="item-meta-tag">
              ${escapeHtml(med.timeOfDay || 'Daily')} • ${displayTime}
            </span>
          </div>

          <p class="item-card-desc">
            ${med.notes ? escapeHtml(med.notes) : 'Take as instructed by your healthcare professional.'}
          </p>

          <div class="item-card-details">
            <div class="detail-row">
              <span>Today's Status:</span>
              <strong>${isCompleted ? 'Course Concluded' : (isTaken ? '✓ Taken' : 'Due / Upcoming')}</strong>
            </div>
            <div class="detail-row">
              <span>Schedule Time:</span>
              <strong>${escapeHtml(med.timeOfDay)} (${displayTime})</strong>
            </div>
            ${courseDurationRow}
          </div>

          <div class="item-card-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-med" data-id="${med._id}">
              ✏️ Edit
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-delete-med" data-id="${med._id}" style="color: #dc2626;">
              🗑️ Delete
            </button>
            ${!isCompleted ? `
              <button type="button" class="btn btn-sm ${isTaken ? 'btn-secondary' : 'btn-primary'} btn-card-toggle-dose" data-id="${med._id}" data-action="${isTaken ? 'undo' : 'take'}">
                ${isTaken ? '✓ Taken' : 'Mark Taken'}
              </button>
            ` : `
              <span style="font-size: var(--font-size-xs); color: var(--color-text-muted); font-weight: 600;">Completed</span>
            `}
          </div>
        </article>
      `;
    }).join('');

    // Attach actions
    container.querySelectorAll('.btn-edit-med').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const med = medicines.find(m => m._id === id);
        if (med) openMedicineModal(med);
      });
    });

    container.querySelectorAll('.btn-delete-med').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const med = medicines.find(m => m._id === id);
        if (med) {
          openDeleteConfirmModal('medicine', med._id, med.name);
        }
      });
    });

    container.querySelectorAll('.btn-card-toggle-dose').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        handleDoseAction(id, action);
      });
    });
  }

  /**
   * Render Health Records List
   */
  function renderHealthRecords() {
    const container = document.getElementById('recordsGridContainer');
    if (!container) return;

    let filtered = healthRecords.filter(rec => {
      if (activeRecordCategoryFilter === 'all') return true;
      return rec.category === activeRecordCategoryFilter;
    });

    const recordsCountBadge = document.getElementById('recordsCountBadge');
    if (recordsCountBadge) {
      recordsCountBadge.textContent = healthRecords.length === 0
        ? '0 records'
        : `Showing ${filtered.length} of ${healthRecords.length} record${healthRecords.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-icon" aria-hidden="true">📋</span>
          <h3 class="empty-title">${healthRecords.length === 0 ? 'No Health Records Saved' : 'No Records in this Category'}</h3>
          <p class="empty-text">
            ${healthRecords.length === 0 
              ? 'Keep track of doctor consultations, blood pressure readings, and vital observations in one safe place.' 
              : `You do not have any notes or records stored in "${escapeHtml(activeRecordCategoryFilter)}".`}
          </p>
          <button type="button" class="btn btn-primary" id="btnEmptyRecordAdd">
            + Add Health Record
          </button>
        </div>
      `;
      const btnAdd = document.getElementById('btnEmptyRecordAdd');
      if (btnAdd) btnAdd.addEventListener('click', () => openRecordModal());
      return;
    }

    container.innerHTML = filtered.map(rec => {
      return `
        <article class="item-card" data-id="${rec._id}">
          <div class="item-card-top">
            <div>
              <h3 class="item-card-title">${escapeHtml(rec.title)}</h3>
              <span style="font-size: var(--font-size-xs); color: var(--color-text-muted);">
                📅 ${formatDate(rec.date)}
              </span>
            </div>
            <span class="item-meta-tag">
              ${escapeHtml(rec.category)}
            </span>
          </div>

          <p class="item-card-desc">
            ${escapeHtml(rec.notes)}
          </p>

          <div class="item-card-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-record" data-id="${rec._id}">
              ✏️ Edit
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-delete-record" data-id="${rec._id}" style="color: #dc2626;">
              🗑️ Delete
            </button>
          </div>
        </article>
      `;
    }).join('');

    container.querySelectorAll('.btn-edit-record').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const rec = healthRecords.find(r => r._id === id);
        if (rec) openRecordModal(rec);
      });
    });

    container.querySelectorAll('.btn-delete-record').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const rec = healthRecords.find(r => r._id === id);
        if (rec) {
          openDeleteConfirmModal('record', rec._id, rec.title);
        }
      });
    });
  }

  function renderAll() {
    renderDashboard();
    renderSchedule();
    renderMedicines();
    renderHealthRecords();
    renderMedicalReports();
    renderDoctorVisits();
    updateProfileAvatarUI();
    updateRemindersUI();
  }

  /**
   * Render Medical Documents & Reports Grid
   */
  function renderMedicalReports() {
    const container = document.getElementById('reportsGridContainer');
    if (!container) return;

    // Filter by search query & category
    const filtered = medicalReports.filter(report => {
      const matchesSearch = !reportSearchQuery ||
        (report.title && report.title.toLowerCase().includes(reportSearchQuery.toLowerCase())) ||
        (report.notes && report.notes.toLowerCase().includes(reportSearchQuery.toLowerCase())) ||
        (report.originalFilename && report.originalFilename.toLowerCase().includes(reportSearchQuery.toLowerCase()));
      const matchesCategory = activeReportCategoryFilter === 'all' || report.category === activeReportCategoryFilter;
      return matchesSearch && matchesCategory;
    });

    const reportsCountBadge = document.getElementById('reportsCountBadge');
    if (reportsCountBadge) {
      reportsCountBadge.textContent = medicalReports.length === 0
        ? '0 documents'
        : `Showing ${filtered.length} of ${medicalReports.length} document${medicalReports.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-icon" aria-hidden="true">${medicalReports.length === 0 ? '📂' : '🔍'}</span>
          <h3 class="empty-title">${medicalReports.length === 0 ? 'No Medical Documents Yet' : 'No Documents Match Your Filter'}</h3>
          <p class="empty-text">
            ${medicalReports.length === 0
              ? 'Upload lab test PDFs, prescriptions, and scans to keep your health documents organized, private, and readily available.'
              : 'Try searching for a different title or click "Show All Documents".'}
          </p>
          <button type="button" class="btn btn-primary" id="btnEmptyReportAction">
            ${medicalReports.length === 0 ? '+ Upload Your First Document' : 'Show All Documents'}
          </button>
        </div>
      `;

      const btnEmptyAction = document.getElementById('btnEmptyReportAction');
      if (btnEmptyAction) {
        btnEmptyAction.addEventListener('click', () => {
          if (medicalReports.length === 0) {
            openReportModal();
          } else {
            activeReportCategoryFilter = 'all';
            reportSearchQuery = '';
            const searchInput = document.getElementById('reportSearchInput');
            if (searchInput) searchInput.value = '';
            updateFilterPillUI('report-filter-btn', 'all');
            renderMedicalReports();
          }
        });
      }
      return;
    }

    container.innerHTML = filtered.map(report => {
      let icon = '📄';
      if (report.category === 'Lab Report') icon = '🔬';
      else if (report.category === 'Prescription') icon = '💊';
      else if (report.category === 'Scan / X-Ray') icon = '🩻';
      else if (report.category === 'Discharge Summary') icon = '🏥';

      const isPdf = report.mimeType === 'application/pdf' || (report.originalFilename && report.originalFilename.toLowerCase().endsWith('.pdf'));
      const formatBadge = isPdf ? 'PDF Document' : 'Image Document';
      const sizeStr = formatFileSize(report.size);

      return `
        <article class="health-card doc-card" data-id="${report._id}">
          <div class="health-card-header">
            <span class="category-pill">${escapeHtml(report.category || 'Document')}</span>
            <span class="health-card-date">${formatDate(report.reportDate)}</span>
          </div>

          <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
            <span style="font-size: 1.8rem; line-height: 1;" aria-hidden="true">${icon}</span>
            <div style="flex: 1; min-width: 0;">
              <h3 class="health-card-title" style="margin-bottom: 4px;">${escapeHtml(report.title)}</h3>
              <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0; word-break: break-all;">
                📎 ${escapeHtml(report.originalFilename || 'document')} · ${sizeStr} · <span style="font-weight: 600; color: var(--color-teal);">${formatBadge}</span>
              </p>
            </div>
          </div>

          ${report.notes ? `
            <p class="health-card-text" style="margin-top: 8px;">
              ${escapeHtml(report.notes)}
            </p>
          ` : ''}

          <div class="health-card-actions" style="margin-top: 14px;">
            <a 
              href="/api/medical-reports/${report._id}/file" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="btn btn-secondary btn-sm"
              aria-label="View or download ${escapeHtml(report.title)}"
            >
              📥 View / Download
            </a>
            <button type="button" class="btn btn-secondary btn-sm btn-edit-report" data-id="${report._id}">
              Edit Details
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm btn-delete-report" data-id="${report._id}">
              Remove
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Attach click listeners to edit & delete buttons
    container.querySelectorAll('.btn-edit-report').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const rep = medicalReports.find(r => r._id === id);
        if (rep) openReportModal(rep);
      });
    });

    container.querySelectorAll('.btn-delete-report').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const rep = medicalReports.find(r => r._id === id);
        if (rep) openDeleteConfirmModal('report', rep._id, rep.title);
      });
    });
  }

  /**
   * Render Doctor Visits & Appointments Grid
   */
  function renderDoctorVisits() {
    const container = document.getElementById('visitsGridContainer');
    if (!container) return;

    // Filter by visit status
    const filtered = doctorVisits.filter(visit => {
      if (activeVisitStatusFilter === 'all') return true;
      return visit.status === activeVisitStatusFilter;
    });

    const visitsCountBadge = document.getElementById('visitsCountBadge');
    if (visitsCountBadge) {
      visitsCountBadge.textContent = doctorVisits.length === 0
        ? '0 visits'
        : `Showing ${filtered.length} of ${doctorVisits.length} appointment${doctorVisits.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="empty-icon" aria-hidden="true">${doctorVisits.length === 0 ? '🩺' : '🔍'}</span>
          <h3 class="empty-title">${doctorVisits.length === 0 ? 'No Doctor Visits Scheduled' : 'No Visits Found'}</h3>
          <p class="empty-text">
            ${doctorVisits.length === 0
              ? 'Keep track of your upcoming clinic visits, specialist consultations, and doctor recommendations in one place.'
              : 'No appointments match this status filter. Select "All Visits" to see your full schedule.'}
          </p>
          <button type="button" class="btn btn-primary" id="btnEmptyVisitAction">
            ${doctorVisits.length === 0 ? '+ Schedule Your First Visit' : 'Show All Visits'}
          </button>
        </div>
      `;

      const btnEmptyAction = document.getElementById('btnEmptyVisitAction');
      if (btnEmptyAction) {
        btnEmptyAction.addEventListener('click', () => {
          if (doctorVisits.length === 0) {
            openVisitModal();
          } else {
            activeVisitStatusFilter = 'all';
            updateFilterPillUI('visit-filter-btn', 'all');
            renderDoctorVisits();
          }
        });
      }
      return;
    }

    container.innerHTML = filtered.map(visit => {
      const statusClass = visit.status === 'Completed' 
        ? 'status-completed' 
        : (visit.status === 'Cancelled' ? 'status-cancelled' : 'status-upcoming');
      const statusLabel = visit.status === 'Completed' ? '✓ Completed' : (visit.status === 'Cancelled' ? '✕ Cancelled' : 'Upcoming');

      return `
        <article class="health-card visit-card" data-id="${visit._id}">
          <div class="health-card-header">
            <span class="status-pill ${statusClass}">${statusLabel}</span>
            <span class="health-card-date">${formatDate(visit.appointmentDate)}</span>
          </div>

          <h3 class="health-card-title" style="margin-bottom: 4px;">
            Dr. ${escapeHtml(visit.doctorName)}
          </h3>

          <div style="font-size: var(--font-size-sm); color: var(--color-teal-dark); font-weight: 600; margin-bottom: 8px;">
            ${visit.specialty ? `${escapeHtml(visit.specialty)} · ` : ''}⏰ ${formatTime(visit.appointmentTime)}
          </div>

          ${visit.clinicOrHospital ? `
            <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: 8px;">
              📍 <strong>Location:</strong> ${escapeHtml(visit.clinicOrHospital)}
            </p>
          ` : ''}

          ${visit.reason ? `
            <p style="font-size: var(--font-size-sm); color: var(--color-text-main); margin-bottom: 8px;">
              <strong>Reason:</strong> ${escapeHtml(visit.reason)}
            </p>
          ` : ''}

          ${visit.contactNumber ? `
            <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-bottom: 8px;">
              📞 <strong>Contact:</strong> ${escapeHtml(visit.contactNumber)}
            </p>
          ` : ''}

          ${visit.notes ? `
            <div style="background-color: var(--color-surface-hover); padding: 10px 12px; border-radius: var(--radius-sm); font-size: var(--font-size-sm); margin-top: 8px;">
              <strong>Doctor's Advice:</strong> ${escapeHtml(visit.notes)}
            </div>
          ` : ''}

          <div class="health-card-actions" style="margin-top: 14px;">
            ${visit.status === 'Upcoming' ? `
              <button type="button" class="btn btn-secondary btn-sm btn-quick-toggle-status" data-id="${visit._id}" data-target-status="Completed">
                ✓ Mark Completed
              </button>
            ` : (visit.status === 'Completed' ? `
              <button type="button" class="btn btn-secondary btn-sm btn-quick-toggle-status" data-id="${visit._id}" data-target-status="Upcoming">
                ↩ Re-open
              </button>
            ` : '')}
            <button type="button" class="btn btn-secondary btn-sm btn-edit-visit" data-id="${visit._id}">
              Edit
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm btn-delete-visit" data-id="${visit._id}">
              Remove
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Quick status toggle listeners
    container.querySelectorAll('.btn-quick-toggle-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const targetStatus = btn.getAttribute('data-target-status');
        await handleVisitStatusToggle(id, targetStatus);
      });
    });

    // Edit visit listeners
    container.querySelectorAll('.btn-edit-visit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const visit = doctorVisits.find(v => v._id === id);
        if (visit) openVisitModal(visit);
      });
    });

    // Delete visit listeners
    container.querySelectorAll('.btn-delete-visit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const visit = doctorVisits.find(v => v._id === id);
        if (visit) openDeleteConfirmModal('visit', visit._id, `Dr. ${visit.doctorName}`);
      });
    });
  }

  /**
   * Quick status toggle for Doctor Visits
   */
  async function handleVisitStatusToggle(visitId, newStatus) {
    try {
      const response = await fetch(`/api/doctor-visits/${visitId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update visit status.');
      }

      const data = await response.json();
      const idx = doctorVisits.findIndex(v => v._id === visitId);
      if (idx !== -1) {
        doctorVisits[idx] = data.visit;
      }

      renderDoctorVisits();
      showToast(`✓ Visit marked as ${newStatus}.`, 'success');
    } catch (error) {
      console.error('[Visit Status Error]', error);
      showToast(error.message, 'danger');
    }
  }

  // ----------------------------------------------------------------------------
  // 4. Real Dose Adherence Interaction via Backend API
  // ----------------------------------------------------------------------------
  async function handleDoseAction(medId, action) {
    const todayStr = getTodayDateString();

    try {
      const response = await fetch(`/api/medicines/${medId}/dose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ action, date: todayStr })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update dose status.');
      }

      const data = await response.json();
      
      // Update local medicine record with updated backend state
      const index = medicines.findIndex(m => m._id === medId);
      if (index !== -1) {
        medicines[index] = data.medicine;
      }

      renderAll();
      showToast(action === 'take' ? '✓ Dose recorded as taken!' : 'Dose checkoff undone.', 'success');
    } catch (error) {
      console.error('[Dose Error]', error);
      showToast(error.message, 'danger');
    }
  }

  // ----------------------------------------------------------------------------
  // 5. Accessible Modal Dialogs
  // ----------------------------------------------------------------------------
  function openModal(modalEl, focusTargetEl) {
    lastFocusedElement = document.activeElement;
    modalEl.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      if (focusTargetEl) {
        focusTargetEl.focus();
      } else {
        const firstInput = modalEl.querySelector('input:not([type="hidden"]), select, textarea, button');
        if (firstInput) firstInput.focus();
      }
    }, 50);
  }

  function closeModal(modalEl) {
    modalEl.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal-backdrop.is-open');
      openModals.forEach(m => closeModal(m));
    }
  });

  // ----------------------------------------------------------------------------
  // 6. Real Medicine Form Handlers (Add & Edit via API)
  // ----------------------------------------------------------------------------
  const medModal = document.getElementById('medModal');
  const medForm = document.getElementById('medForm');
  const medModalTitle = document.getElementById('medModalTitle');
  const medEditId = document.getElementById('medEditId');
  const medName = document.getElementById('medName');
  const medDosage = document.getElementById('medDosage');
  const medTimeOfDay = document.getElementById('medTimeOfDay');
  const medTime = document.getElementById('medTime');
  const medNotes = document.getElementById('medNotes');
  const btnSaveMed = document.getElementById('btnSaveMed');

  function openMedicineModal(medToEdit = null) {
    clearFormErrors('med');
    medForm.reset();

    const medStartDate = document.getElementById('medStartDate');
    const medEndDate = document.getElementById('medEndDate');

    if (medToEdit) {
      medModalTitle.textContent = 'Edit Medicine';
      medEditId.value = medToEdit._id;
      medName.value = medToEdit.name;
      medDosage.value = medToEdit.dosage;
      medTimeOfDay.value = medToEdit.timeOfDay || 'Morning';
      medTime.value = (medToEdit.scheduleTimes && medToEdit.scheduleTimes[0]) || '08:00';
      medNotes.value = medToEdit.notes || '';
      if (medStartDate) medStartDate.value = medToEdit.startDate || '';
      if (medEndDate) medEndDate.value = medToEdit.endDate || '';
    } else {
      medModalTitle.textContent = 'Add New Medicine';
      medEditId.value = '';
      medTimeOfDay.value = 'Morning';
      medTime.value = '08:00';
      if (medStartDate) medStartDate.value = getTodayDateString();
      if (medEndDate) medEndDate.value = '';
    }

    openModal(medModal, medName);
  }

  // Duplicate Medicine Confirmation Dialog Elements & State
  const duplicateMedModal = document.getElementById('duplicateMedModal');
  const btnCloseDuplicateMedModal = document.getElementById('btnCloseDuplicateMedModal');
  const btnCancelDuplicateMed = document.getElementById('btnCancelDuplicateMed');
  const btnConfirmDuplicateMed = document.getElementById('btnConfirmDuplicateMed');
  const dupMedExistingName = document.getElementById('dupMedExistingName');
  const dupMedExistingDosage = document.getElementById('dupMedExistingDosage');
  const dupMedExistingSchedule = document.getElementById('dupMedExistingSchedule');

  let pendingMedicinePayload = null;

  function openDuplicateConfirmModal(existingMed, payload) {
    pendingMedicinePayload = payload;
    if (dupMedExistingName) dupMedExistingName.textContent = existingMed.name;
    if (dupMedExistingDosage) dupMedExistingDosage.textContent = existingMed.dosage;
    const schedTime = (existingMed.scheduleTimes && existingMed.scheduleTimes[0]) ? formatTime(existingMed.scheduleTimes[0]) : '';
    if (dupMedExistingSchedule) {
      dupMedExistingSchedule.textContent = `Schedule: ${existingMed.timeOfDay || 'Daily'} ${schedTime ? '(' + schedTime + ')' : ''}`;
    }
    openModal(duplicateMedModal, btnConfirmDuplicateMed);
  }

  if (btnCloseDuplicateMedModal) {
    btnCloseDuplicateMedModal.addEventListener('click', () => {
      closeModal(duplicateMedModal);
      pendingMedicinePayload = null;
      if (medName) medName.focus();
    });
  }

  if (btnCancelDuplicateMed) {
    btnCancelDuplicateMed.addEventListener('click', () => {
      closeModal(duplicateMedModal);
      pendingMedicinePayload = null;
      if (medName) medName.focus();
      showToast('Duplicate was not added. Your medicine details were kept in the form.', 'info');
    });
  }

  if (btnConfirmDuplicateMed) {
    btnConfirmDuplicateMed.addEventListener('click', async () => {
      if (!pendingMedicinePayload) return;

      btnConfirmDuplicateMed.disabled = true;
      btnConfirmDuplicateMed.textContent = 'Adding...';

      try {
        const payloadWithConfirm = {
          ...pendingMedicinePayload,
          confirmDuplicate: true
        };

        const response = await fetch('/api/medicines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payloadWithConfirm)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to add duplicate medicine.');
        }

        medicines.unshift(data.medicine);
        closeModal(duplicateMedModal);
        closeModal(medModal);
        pendingMedicinePayload = null;
        renderAll();
        showToast(`✓ Added second entry for ${data.medicine.name} to your schedule.`, 'success');
      } catch (error) {
        console.error('[Add Anyway Error]', error);
        showToast(error.message, 'danger');
      } finally {
        btnConfirmDuplicateMed.disabled = false;
        btnConfirmDuplicateMed.textContent = 'Add Anyway';
      }
    });
  }

  // Dashboard Quick Action Buttons
  const btnDashAddMed = document.getElementById('btnDashAddMed');
  const btnDashAddRecord = document.getElementById('btnDashAddRecord');
  const btnDashUploadReport = document.getElementById('btnDashUploadReport');
  const btnDashAddVisit = document.getElementById('btnDashAddVisit');

  if (btnDashAddMed) btnDashAddMed.addEventListener('click', () => openMedicineModal());
  if (btnDashAddRecord) btnDashAddRecord.addEventListener('click', () => openRecordModal());
  if (btnDashUploadReport) btnDashUploadReport.addEventListener('click', () => openReportModal());
  if (btnDashAddVisit) btnDashAddVisit.addEventListener('click', () => openVisitModal());

  document.getElementById('btnCloseMedModal').addEventListener('click', () => closeModal(medModal));
  document.getElementById('btnCancelMed').addEventListener('click', () => closeModal(medModal));
  document.getElementById('btnOpenAddMedModal').addEventListener('click', () => openMedicineModal());
  document.getElementById('btnQuickAddMed').addEventListener('click', () => openMedicineModal());

  medForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors('med');

    const nameVal = medName.value.trim();
    const dosageVal = medDosage.value.trim();

    let hasError = false;
    if (!nameVal) {
      showFieldError('medNameError', 'Please enter the medicine name.');
      hasError = true;
    }
    if (!dosageVal) {
      showFieldError('medDosageError', 'Please enter the dosage or strength.');
      hasError = true;
    }

    const startDateVal = document.getElementById('medStartDate') ? document.getElementById('medStartDate').value : null;
    const endDateVal = document.getElementById('medEndDate') ? document.getElementById('medEndDate').value : null;

    if (startDateVal && endDateVal && endDateVal < startDateVal) {
      showFieldError('medEndDateError', 'End date cannot be earlier than start date.');
      hasError = true;
    }

    if (hasError) return;

    const payload = {
      name: nameVal,
      dosage: dosageVal,
      timeOfDay: medTimeOfDay.value,
      time: medTime.value || '08:00',
      notes: medNotes.value.trim(),
      startDate: startDateVal || null,
      endDate: endDateVal || null
    };

    const editId = medEditId.value;

    // Check for duplicate in frontend list first (immediate friendly UX)
    if (!editId) {
      const normalizedEntered = nameVal.toLowerCase();
      const existingMed = medicines.find(m => m.name.trim().toLowerCase() === normalizedEntered);

      if (existingMed) {
        openDuplicateConfirmModal(existingMed, payload);
        return;
      }
    }

    btnSaveMed.disabled = true;
    btnSaveMed.textContent = 'Saving...';

    const url = editId ? `/api/medicines/${editId}` : '/api/medicines';
    const method = editId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Handle backend-detected duplicate (e.g. concurrent creation or stale client list)
      if (response.status === 409) {
        const conflictData = await response.json().catch(() => ({}));
        if (conflictData.isDuplicate && conflictData.existingMedicine) {
          openDuplicateConfirmModal(conflictData.existingMedicine, payload);
          return;
        }
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save medicine.');
      }

      const data = await response.json();

      if (editId) {
        const index = medicines.findIndex(m => m._id === editId);
        if (index !== -1) medicines[index] = data.medicine;
        showToast(`✓ Updated ${data.medicine.name} successfully.`, 'success');
      } else {
        medicines.unshift(data.medicine);
        showToast(`✓ Added ${data.medicine.name} to your schedule.`, 'success');
      }

      closeModal(medModal);
      renderAll();
    } catch (error) {
      console.error('[Save Med Error]', error);
      showToast(error.message, 'danger');
    } finally {
      btnSaveMed.disabled = false;
      btnSaveMed.textContent = 'Save Medicine';
    }
  });

  // ----------------------------------------------------------------------------
  // 7. Real Health Record Form Handlers (Add & Edit via API)
  // ----------------------------------------------------------------------------
  const recordModal = document.getElementById('recordModal');
  const recordForm = document.getElementById('recordForm');
  const recordModalTitle = document.getElementById('recordModalTitle');
  const recordEditId = document.getElementById('recordEditId');
  const recordTitle = document.getElementById('recordTitle');
  const recordCategory = document.getElementById('recordCategory');
  const recordDate = document.getElementById('recordDate');
  const recordNotes = document.getElementById('recordNotes');
  const btnSaveRecord = document.getElementById('btnSaveRecord');

  function openRecordModal(recToEdit = null) {
    clearFormErrors('record');
    recordForm.reset();

    const todayStr = getTodayDateString();

    if (recToEdit) {
      recordModalTitle.textContent = 'Edit Health Record';
      recordEditId.value = recToEdit._id;
      recordTitle.value = recToEdit.title;
      recordCategory.value = recToEdit.category || 'Doctor Visit';
      recordDate.value = recToEdit.date || todayStr;
      recordNotes.value = recToEdit.notes || '';
    } else {
      recordModalTitle.textContent = 'Add Health Record';
      recordEditId.value = '';
      recordCategory.value = 'Doctor Visit';
      recordDate.value = todayStr;
    }

    openModal(recordModal, recordTitle);
  }

  document.getElementById('btnCloseRecordModal').addEventListener('click', () => closeModal(recordModal));
  document.getElementById('btnCancelRecord').addEventListener('click', () => closeModal(recordModal));
  document.getElementById('btnOpenAddRecordModal').addEventListener('click', () => openRecordModal());

  recordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors('record');

    const titleVal = recordTitle.value.trim();
    const dateVal = recordDate.value;
    const notesVal = recordNotes.value.trim();

    let hasError = false;
    if (!titleVal) {
      showFieldError('recordTitleError', 'Please enter a title for this record.');
      hasError = true;
    }
    if (!dateVal) {
      showFieldError('recordDateError', 'Please select a date.');
      hasError = true;
    }
    if (!notesVal) {
      showFieldError('recordNotesError', 'Please enter details or notes.');
      hasError = true;
    }

    if (hasError) return;

    btnSaveRecord.disabled = true;
    btnSaveRecord.textContent = 'Saving...';

    const payload = {
      title: titleVal,
      date: dateVal,
      category: recordCategory.value,
      notes: notesVal
    };

    const editId = recordEditId.value;
    const url = editId ? `/api/health-records/${editId}` : '/api/health-records';
    const method = editId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save health record.');
      }

      const data = await response.json();

      if (editId) {
        const index = healthRecords.findIndex(r => r._id === editId);
        if (index !== -1) healthRecords[index] = data.record;
        showToast(`✓ Updated record "${data.record.title}".`, 'success');
      } else {
        healthRecords.unshift(data.record);
        showToast(`✓ Health record saved.`, 'success');
      }

      closeModal(recordModal);
      renderHealthRecords();
    } catch (error) {
      console.error('[Save Record Error]', error);
      showToast(error.message, 'danger');
    } finally {
      btnSaveRecord.disabled = false;
      btnSaveRecord.textContent = 'Save Record';
    }
  });

  // ----------------------------------------------------------------------------
  // 7A. Real Medical Reports & Documents Handlers (Upload & Edit via API)
  // ----------------------------------------------------------------------------
  const reportModal = document.getElementById('reportModal');
  const reportForm = document.getElementById('reportForm');
  const reportModalTitle = document.getElementById('reportModalTitle');
  const reportEditId = document.getElementById('reportEditId');
  const reportTitle = document.getElementById('reportTitle');
  const reportCategory = document.getElementById('reportCategory');
  const reportDate = document.getElementById('reportDate');
  const reportFileInput = document.getElementById('reportFileInput');
  const reportFileRequiredMark = document.getElementById('reportFileRequiredMark');
  const reportNotes = document.getElementById('reportNotes');
  const btnSaveReport = document.getElementById('btnSaveReport');

  function openReportModal(reportToEdit = null) {
    clearFormErrors('report');
    reportForm.reset();

    if (reportToEdit) {
      reportModalTitle.textContent = 'Edit Document Details';
      reportEditId.value = reportToEdit._id;
      reportTitle.value = reportToEdit.title;
      reportCategory.value = reportToEdit.category || 'Lab Report';
      reportDate.value = reportToEdit.reportDate || getTodayDateString();
      reportNotes.value = reportToEdit.notes || '';
      if (reportFileInput) reportFileInput.removeAttribute('required');
      if (reportFileRequiredMark) reportFileRequiredMark.style.display = 'none';
      if (btnSaveReport) btnSaveReport.textContent = 'Save Changes';
    } else {
      reportModalTitle.textContent = 'Upload Medical Document';
      reportEditId.value = '';
      reportCategory.value = 'Lab Report';
      reportDate.value = getTodayDateString();
      if (reportFileInput) reportFileInput.setAttribute('required', 'required');
      if (reportFileRequiredMark) reportFileRequiredMark.style.display = 'inline';
      if (btnSaveReport) btnSaveReport.textContent = 'Upload Document';
    }

    openModal(reportModal, reportTitle);
  }

  const btnCloseReportModal = document.getElementById('btnCloseReportModal');
  const btnCancelReport = document.getElementById('btnCancelReport');
  const btnOpenUploadReportModal = document.getElementById('btnOpenUploadReportModal');
  const btnHeroUploadReport = document.getElementById('btnHeroUploadReport');

  if (btnCloseReportModal) btnCloseReportModal.addEventListener('click', () => closeModal(reportModal));
  if (btnCancelReport) btnCancelReport.addEventListener('click', () => closeModal(reportModal));
  if (btnOpenUploadReportModal) btnOpenUploadReportModal.addEventListener('click', () => openReportModal());
  if (btnHeroUploadReport) btnHeroUploadReport.addEventListener('click', () => openReportModal());

  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors('report');

    const editId = reportEditId.value;
    const titleVal = reportTitle.value.trim();
    const categoryVal = reportCategory.value;
    const dateVal = reportDate.value;
    const notesVal = reportNotes.value.trim();
    const file = reportFileInput.files && reportFileInput.files[0];

    let hasError = false;
    if (!titleVal) {
      showFieldError('reportTitleError', 'Please enter a document title.');
      hasError = true;
    }
    if (!dateVal) {
      showFieldError('reportDateError', 'Please select a date.');
      hasError = true;
    }
    if (!editId && !file) {
      showFieldError('reportFileError', 'Please select a document file to upload (PDF, JPG, or PNG).');
      hasError = true;
    }

    if (file && file.size > 10 * 1024 * 1024) {
      showFieldError('reportFileError', 'File size exceeds 10 MB limit. Please select a smaller document.');
      hasError = true;
    }

    if (hasError) return;

    btnSaveReport.disabled = true;
    btnSaveReport.textContent = editId ? 'Saving...' : 'Uploading...';

    try {
      const formData = new FormData();
      formData.append('title', titleVal);
      formData.append('category', categoryVal);
      formData.append('reportDate', dateVal);
      formData.append('notes', notesVal);
      if (file) {
        formData.append('document', file);
      }

      const url = editId ? `/api/medical-reports/${editId}` : '/api/medical-reports';
      const method = editId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process document upload.');
      }

      if (editId) {
        const index = medicalReports.findIndex(r => r._id === editId);
        if (index !== -1) medicalReports[index] = data.report;
        showToast(`✓ Updated document "${data.report.title}".`, 'success');
      } else {
        medicalReports.unshift(data.report);
        showToast(`✓ Uploaded "${data.report.title}" securely.`, 'success');
      }

      closeModal(reportModal);
      renderMedicalReports();
    } catch (error) {
      console.error('[Report Submit Error]', error);
      showToast(error.message, 'danger');
    } finally {
      btnSaveReport.disabled = false;
      btnSaveReport.textContent = editId ? 'Save Changes' : 'Upload Document';
    }
  });

  // ----------------------------------------------------------------------------
  // 7B. Real Doctor Visits Handlers (Schedule & Edit via API)
  // ----------------------------------------------------------------------------
  const visitModal = document.getElementById('visitModal');
  const visitForm = document.getElementById('visitForm');
  const visitModalTitle = document.getElementById('visitModalTitle');
  const visitEditId = document.getElementById('visitEditId');
  const visitDoctorName = document.getElementById('visitDoctorName');
  const visitSpecialty = document.getElementById('visitSpecialty');
  const visitClinic = document.getElementById('visitClinic');
  const visitDate = document.getElementById('visitDate');
  const visitTime = document.getElementById('visitTime');
  const visitReason = document.getElementById('visitReason');
  const visitContact = document.getElementById('visitContact');
  const visitStatus = document.getElementById('visitStatus');
  const visitNotes = document.getElementById('visitNotes');
  const btnSaveVisit = document.getElementById('btnSaveVisit');

  function openVisitModal(visitToEdit = null) {
    clearFormErrors('visit');
    visitForm.reset();

    if (visitToEdit) {
      visitModalTitle.textContent = 'Edit Doctor Visit';
      visitEditId.value = visitToEdit._id;
      visitDoctorName.value = visitToEdit.doctorName;
      visitSpecialty.value = visitToEdit.specialty || '';
      visitClinic.value = visitToEdit.clinicOrHospital || '';
      visitDate.value = visitToEdit.appointmentDate || getTodayDateString();
      visitTime.value = visitToEdit.appointmentTime || '10:00';
      visitReason.value = visitToEdit.reason || '';
      visitContact.value = visitToEdit.contactNumber || '';
      visitStatus.value = visitToEdit.status || 'Upcoming';
      visitNotes.value = visitToEdit.notes || '';
      btnSaveVisit.textContent = 'Save Changes';
    } else {
      visitModalTitle.textContent = 'Schedule Doctor Visit';
      visitEditId.value = '';
      visitDate.value = getTodayDateString();
      visitTime.value = '10:00';
      visitStatus.value = 'Upcoming';
      btnSaveVisit.textContent = 'Schedule Visit';
    }

    openModal(visitModal, visitDoctorName);
  }

  const btnCloseVisitModal = document.getElementById('btnCloseVisitModal');
  const btnCancelVisit = document.getElementById('btnCancelVisit');
  const btnOpenAddVisitModal = document.getElementById('btnOpenAddVisitModal');
  const btnHeroAddVisit = document.getElementById('btnHeroAddVisit');
  const btnHeroAddMed = document.getElementById('btnHeroAddMed');

  if (btnCloseVisitModal) btnCloseVisitModal.addEventListener('click', () => closeModal(visitModal));
  if (btnCancelVisit) btnCancelVisit.addEventListener('click', () => closeModal(visitModal));
  if (btnOpenAddVisitModal) btnOpenAddVisitModal.addEventListener('click', () => openVisitModal());
  if (btnHeroAddVisit) btnHeroAddVisit.addEventListener('click', () => openVisitModal());
  if (btnHeroAddMed) btnHeroAddMed.addEventListener('click', () => openMedicineModal());

  visitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors('visit');

    const editId = visitEditId.value;
    const doctorVal = visitDoctorName.value.trim();
    const dateVal = visitDate.value.trim();
    const timeVal = visitTime.value.trim();

    let hasError = false;
    if (!doctorVal) {
      showFieldError('visitDoctorNameError', "Please enter the doctor's name.");
      hasError = true;
    }
    if (!dateVal) {
      showFieldError('visitDateError', 'Please select an appointment date.');
      hasError = true;
    }
    if (!timeVal) {
      showFieldError('visitTimeError', 'Please select an appointment time.');
      hasError = true;
    }

    if (hasError) return;

    btnSaveVisit.disabled = true;
    btnSaveVisit.textContent = editId ? 'Saving...' : 'Scheduling...';

    const payload = {
      doctorName: doctorVal,
      specialty: visitSpecialty.value.trim(),
      clinicOrHospital: visitClinic.value.trim(),
      appointmentDate: dateVal,
      appointmentTime: timeVal,
      reason: visitReason.value.trim(),
      contactNumber: visitContact.value.trim(),
      status: visitStatus.value,
      notes: visitNotes.value.trim()
    };

    try {
      const url = editId ? `/api/doctor-visits/${editId}` : '/api/doctor-visits';
      const method = editId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save appointment.');
      }

      if (editId) {
        const index = doctorVisits.findIndex(v => v._id === editId);
        if (index !== -1) doctorVisits[index] = data.visit;
        showToast(`✓ Updated visit with Dr. ${data.visit.doctorName}.`, 'success');
      } else {
        doctorVisits.push(data.visit);
        // Sort chronologically
        doctorVisits.sort((a, b) => {
          const dtA = `${a.appointmentDate} ${a.appointmentTime}`;
          const dtB = `${b.appointmentDate} ${b.appointmentTime}`;
          return dtA.localeCompare(dtB);
        });
        showToast(`✓ Scheduled appointment with Dr. ${data.visit.doctorName}.`, 'success');
      }

      closeModal(visitModal);
      renderDoctorVisits();
    } catch (error) {
      console.error('[Visit Submit Error]', error);
      showToast(error.message, 'danger');
    } finally {
      btnSaveVisit.disabled = false;
      btnSaveVisit.textContent = editId ? 'Save Changes' : 'Schedule Visit';
    }
  });

  // ----------------------------------------------------------------------------
  // 8. Delete Confirmation Modal (Real API Delete)
  // ----------------------------------------------------------------------------
  const deleteModal = document.getElementById('deleteModal');
  const deleteConfirmPrompt = document.getElementById('deleteConfirmPrompt');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  function openDeleteConfirmModal(type, id, name) {
    itemToDelete = { type, id, name };
    if (deleteConfirmPrompt) {
      deleteConfirmPrompt.textContent = `Are you sure you want to remove "${name}"?`;
    }
    openModal(deleteModal, btnConfirmDelete);
  }

  document.getElementById('btnCloseDeleteModal').addEventListener('click', () => closeModal(deleteModal));
  document.getElementById('btnCancelDelete').addEventListener('click', () => closeModal(deleteModal));

  btnConfirmDelete.addEventListener('click', async () => {
    if (!itemToDelete) return;

    btnConfirmDelete.disabled = true;
    btnConfirmDelete.textContent = 'Removing...';

    const { type, id, name } = itemToDelete;
    let url = '';
    if (type === 'medicine') url = `/api/medicines/${id}`;
    else if (type === 'record') url = `/api/health-records/${id}`;
    else if (type === 'report') url = `/api/medical-reports/${id}`;
    else if (type === 'visit') url = `/api/doctor-visits/${id}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to remove entry.');
      }

      if (type === 'medicine') {
        medicines = medicines.filter(m => m._id !== id);
        showToast(`✓ Removed "${name}" from schedule.`, 'info');
        renderAll();
      } else if (type === 'record') {
        healthRecords = healthRecords.filter(r => r._id !== id);
        showToast(`✓ Removed record "${name}".`, 'info');
        renderHealthRecords();
      } else if (type === 'report') {
        medicalReports = medicalReports.filter(r => r._id !== id);
        showToast(`✓ Removed medical document "${name}".`, 'info');
        renderMedicalReports();
      } else if (type === 'visit') {
        doctorVisits = doctorVisits.filter(v => v._id !== id);
        showToast(`✓ Removed visit "${name}".`, 'info');
        renderDoctorVisits();
      }

      closeModal(deleteModal);
    } catch (error) {
      console.error('[Delete Error]', error);
      showToast(error.message, 'danger');
    } finally {
      btnConfirmDelete.disabled = false;
      btnConfirmDelete.textContent = 'Yes, Remove';
      itemToDelete = null;
    }
  });

  // ----------------------------------------------------------------------------
  // 9. Real Authentication Modal Handlers (Register & Login via API)
  // ----------------------------------------------------------------------------
  const authModal = document.getElementById('authModal');
  const authForm = document.getElementById('authForm');
  const authModalTitle = document.getElementById('authModalTitle');
  const authModalSubtitle = document.getElementById('authModalSubtitle');
  const authNameGroup = document.getElementById('authNameGroup');
  const authName = document.getElementById('authName');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authConfirmPasswordGroup = document.getElementById('authConfirmPasswordGroup');
  const authConfirmPassword = document.getElementById('authConfirmPassword');
  const authRoleGroup = document.getElementById('authRoleGroup');
  const authRole = document.getElementById('authRole');
  const authRoleHint = document.getElementById('authRoleHint');
  const btnSwitchAuthMode = document.getElementById('btnSwitchAuthMode');
  const btnSubmitAuth = document.getElementById('btnSubmitAuth');
  const btnTogglePassword = document.getElementById('btnTogglePassword');
  const authGlobalError = document.getElementById('authGlobalError');

  let isSignUpMode = false;

  function setAuthMode(signUp) {
    isSignUpMode = signUp;
    clearAuthErrors();

    if (isSignUpMode) {
      authModalTitle.textContent = 'Create MediMate Account';
      if (authModalSubtitle) {
        authModalSubtitle.textContent = 'Join MediMate as a patient or caregiver to manage medications and care.';
      }
      authNameGroup.style.display = 'block';
      authConfirmPasswordGroup.style.display = 'block';
      if (authRoleGroup) authRoleGroup.style.display = 'block';
      btnSwitchAuthMode.textContent = 'Already have an account? Sign In';
      btnSubmitAuth.textContent = 'Create Account';
    } else {
      authModalTitle.textContent = 'MediMate Sign In';
      if (authModalSubtitle) {
        authModalSubtitle.textContent = 'Sign in to access your medicine schedule and health records.';
      }
      authNameGroup.style.display = 'none';
      authConfirmPasswordGroup.style.display = 'none';
      if (authRoleGroup) authRoleGroup.style.display = 'none';
      btnSwitchAuthMode.textContent = 'Need an account? Create one';
      btnSubmitAuth.textContent = 'Sign In';
    }
  }

  if (authRole) {
    authRole.addEventListener('change', () => {
      if (authRoleHint) {
        if (authRole.value === 'caregiver') {
          authRoleHint.textContent = 'Caregivers can link to patients, monitor medicine schedules, and track adherence.';
        } else {
          authRoleHint.textContent = 'Patients can track medicines, log doses, and manage healthcare records.';
        }
      }
    });
  }

  function openAuthModal(signUp = false) {
    setAuthMode(signUp);
    authForm.reset();
    clearAuthErrors();
    openModal(authModal, isSignUpMode ? authName : authEmail);
  }

  function clearAuthErrors() {
    if (authGlobalError) {
      authGlobalError.textContent = '';
      authGlobalError.style.display = 'none';
    }
    clearFormErrors('auth');
  }

  // Hook up all public authentication buttons
  wireAuthTriggerButtons();

  document.getElementById('btnCloseAuthModal').addEventListener('click', () => closeModal(authModal));
  document.getElementById('btnDismissAuth').addEventListener('click', () => closeModal(authModal));

  btnSwitchAuthMode.addEventListener('click', () => {
    setAuthMode(!isSignUpMode);
  });

  btnTogglePassword.addEventListener('click', () => {
    if (authPassword.type === 'password') {
      authPassword.type = 'text';
      btnTogglePassword.textContent = '🔒';
    } else {
      authPassword.type = 'password';
      btnTogglePassword.textContent = '👁️';
    }
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthErrors();

    const emailVal = authEmail.value.trim();
    const passwordVal = authPassword.value;

    let hasError = false;

    if (isSignUpMode) {
      const nameVal = authName.value.trim();
      const confirmVal = authConfirmPassword.value;
      const roleVal = authRole ? authRole.value : 'patient';

      if (!nameVal || nameVal.length < 2) {
        showFieldError('authNameError', 'Please enter your full name (minimum 2 characters).');
        hasError = true;
      }
      if (!emailVal || !/^\S+@\S+\.\S+$/.test(emailVal)) {
        showFieldError('authEmailError', 'Please enter a valid email address.');
        hasError = true;
      }
      if (!passwordVal || passwordVal.length < 6) {
        showFieldError('authPasswordError', 'Password must be at least 6 characters.');
        hasError = true;
      }
      if (passwordVal !== confirmVal) {
        showFieldError('authConfirmPasswordError', 'Passwords do not match.');
        hasError = true;
      }

      if (hasError) return;

      btnSubmitAuth.disabled = true;
      btnSubmitAuth.textContent = 'Creating Account...';

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            name: nameVal,
            email: emailVal,
            password: passwordVal,
            confirmPassword: confirmVal,
            role: roleVal
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Registration failed. Please check your details.');
        }

        currentUser = data.user;
        closeModal(authModal);
        renderAuthenticatedState();
        if (currentUser.role === 'patient') {
          await fetchUserData();
        }
        autoSyncPushSubscription();
        const destRegister = (currentUser.role === 'caregiver') ? '/caregiver' : DEFAULT_AUTH_ROUTE;
        navigateTo(destRegister, true);
        showToast(`✓ Welcome to MediMate, ${currentUser.name}!`, 'success');
      } catch (err) {
        authGlobalError.textContent = err.message;
        authGlobalError.style.display = 'block';
      } finally {
        btnSubmitAuth.disabled = false;
        btnSubmitAuth.textContent = 'Create Account';
      }

    } else {
      // Sign In mode
      if (!emailVal) {
        showFieldError('authEmailError', 'Please enter your email address.');
        hasError = true;
      }
      if (!passwordVal) {
        showFieldError('authPasswordError', 'Please enter your password.');
        hasError = true;
      }

      if (hasError) return;

      btnSubmitAuth.disabled = true;
      btnSubmitAuth.textContent = 'Signing In...';

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            email: emailVal,
            password: passwordVal
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Invalid email or password.');
        }

        currentUser = data.user;
        closeModal(authModal);
        renderAuthenticatedState();
        if (currentUser.role === 'patient') {
          await fetchUserData();
        }
        autoSyncPushSubscription();
        const destLogin = (currentUser.role === 'caregiver') ? '/caregiver' : DEFAULT_AUTH_ROUTE;
        navigateTo(destLogin, true);
        showToast(`✓ Welcome back, ${currentUser.name}!`, 'success');
      } catch (err) {
        authGlobalError.textContent = err.message;
        authGlobalError.style.display = 'block';
      } finally {
        btnSubmitAuth.disabled = false;
        btnSubmitAuth.textContent = 'Sign In';
      }
    }
  });

  // ----------------------------------------------------------------------------
  // 10. Search & Filter Handlers
  // ----------------------------------------------------------------------------
  const medSearchInput = document.getElementById('medSearchInput');
  if (medSearchInput) {
    medSearchInput.addEventListener('input', (e) => {
      medSearchQuery = e.target.value;
      renderMedicines();
    });
  }

  const reportSearchInput = document.getElementById('reportSearchInput');
  if (reportSearchInput) {
    reportSearchInput.addEventListener('input', (e) => {
      reportSearchQuery = e.target.value;
      renderMedicalReports();
    });
  }

  // Medicine Time Filter Pills
  document.querySelectorAll('.filter-btn[data-time]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-time]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMedTimeFilter = btn.getAttribute('data-time');
      renderMedicines();
    });
  });

  // Record Category Filter Pills
  document.querySelectorAll('.record-filter-btn[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.record-filter-btn[data-category]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRecordCategoryFilter = btn.getAttribute('data-category');
      renderHealthRecords();
    });
  });

  // Report Category Filter Pills
  document.querySelectorAll('.report-filter-btn[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-filter-btn[data-category]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeReportCategoryFilter = btn.getAttribute('data-category');
      renderMedicalReports();
    });
  });

  // Visit Status Filter Pills
  document.querySelectorAll('.visit-filter-btn[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.visit-filter-btn[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeVisitStatusFilter = btn.getAttribute('data-status');
      renderDoctorVisits();
    });
  });

  function updateFilterPillUI(groupClass, activeValue) {
    document.querySelectorAll(`.${groupClass}`).forEach(b => {
      const val = b.getAttribute('data-time') || b.getAttribute('data-category') || b.getAttribute('data-status');
      if (val === activeValue) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  // ----------------------------------------------------------------------------
  // 11. Mobile Navigation Menu Toggle (Single Unified Collapse)
  // ----------------------------------------------------------------------------
  function wireMobileMenuToggle() {
    const toggle = document.getElementById('publicMobileMenuToggle') || document.getElementById('mobileMenuToggle');
    const collapse = document.getElementById('publicNavCollapse') || document.getElementById('navCollapse');
    if (!toggle || !collapse) return;

    toggle.onclick = (e) => {
      e.stopPropagation();
      const isOpen = collapse.classList.contains('is-open');
      if (isOpen) {
        closeMobileMenu();
      } else {
        collapse.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.textContent = '✕';
      }
    };

    collapse.querySelectorAll('.nav-link').forEach(link => {
      link.onclick = () => closeMobileMenu();
    });
  }

  function closeMobileMenu() {
    const collapse = document.getElementById('publicNavCollapse') || document.getElementById('navCollapse');
    const toggle = document.getElementById('publicMobileMenuToggle') || document.getElementById('mobileMenuToggle');
    if (collapse) collapse.classList.remove('is-open');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    }
  }

  // ----------------------------------------------------------------------------
  // 12. Helper Functions
  // ----------------------------------------------------------------------------
  function clearFormErrors(prefix) {
    document.querySelectorAll(`[id^="${prefix}"][id$="Error"]`).forEach(el => {
      el.style.display = 'none';
    });
  }

  function showFieldError(errorId, message) {
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3500);
  }

  // Medicine Course Status Filter Pills
  document.querySelectorAll('.med-status-btn[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.med-status-btn[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMedStatusFilter = btn.getAttribute('data-status');
      renderMedicines();
    });
  });

  // ----------------------------------------------------------------------------
  // 14. Theme Management & Dark Mode Support
  // ----------------------------------------------------------------------------
  function initTheme() {
    const saved = localStorage.getItem('medimate_theme');
    if (saved) {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        const currentSaved = localStorage.getItem('medimate_theme');
        if (!currentSaved || currentSaved === 'system') {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  const THEME_SUN_SVG = `<svg class="icon-svg sun-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  const THEME_MOON_SVG = `<svg class="icon-svg moon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

  function applyTheme(theme) {
    let resolvedTheme = theme;
    if (theme === 'system' || !theme) {
      resolvedTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', resolvedTheme);

    const sidebarThemeIcon = document.getElementById('sidebarThemeIcon');
    const sidebarThemeLabel = document.getElementById('sidebarThemeLabel');
    const btnSidebarTheme = document.getElementById('btnSidebarThemeToggle');
    const profileThemeSelect = document.getElementById('profileThemeSelect');

    const isDark = resolvedTheme === 'dark';
    if (sidebarThemeIcon) sidebarThemeIcon.innerHTML = isDark ? THEME_SUN_SVG : THEME_MOON_SVG;
    if (sidebarThemeLabel) sidebarThemeLabel.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    if (btnSidebarTheme) btnSidebarTheme.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');

    if (profileThemeSelect && profileThemeSelect.value !== theme) {
      profileThemeSelect.value = theme;
    }
  }

  async function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

    localStorage.setItem('medimate_theme', nextTheme);
    applyTheme(nextTheme);

    if (currentUser) {
      currentUser.themePreference = nextTheme;
      try {
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ themePreference: nextTheme })
        });
      } catch (e) {
        // Non-fatal background sync
      }
    }
  }

  const btnSidebarThemeToggle = document.getElementById('btnSidebarThemeToggle');
  if (btnSidebarThemeToggle) btnSidebarThemeToggle.addEventListener('click', toggleTheme);

  // ----------------------------------------------------------------------------
  // 15. Sidebar & Mobile Drawer Interactions
  // ----------------------------------------------------------------------------
  const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
  const btnCloseSidebar = document.getElementById('btnCloseSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const appSidebar = document.getElementById('appSidebar');

  function openSidebarDrawer() {
    if (appSidebar) appSidebar.classList.add('drawer-open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
  }

  function closeSidebarDrawer() {
    if (appSidebar) appSidebar.classList.remove('drawer-open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
  }

  if (mobileSidebarToggle) mobileSidebarToggle.addEventListener('click', openSidebarDrawer);
  if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebarDrawer);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebarDrawer);

  if (appSidebar) {
    appSidebar.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', closeSidebarDrawer);
    });
  }

  // ----------------------------------------------------------------------------
  // 16. Patient Profile Page & Photo Management
  // ----------------------------------------------------------------------------
  function updateProfileAvatarUI() {
    const sidebarInitials = document.getElementById('sidebarAvatarInitials');
    const sidebarImg = document.getElementById('sidebarAvatarImg');
    const profileInitials = document.getElementById('profileLargeInitials');
    const profileImg = document.getElementById('profileLargeImg');
    const btnRemovePhoto = document.getElementById('btnRemovePhoto');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserEmail = document.getElementById('sidebarUserEmail');
    const profileSummaryName = document.getElementById('profileSummaryName');
    const profileSummaryEmail = document.getElementById('profileSummaryEmail');

    const name = (currentUser && currentUser.name) || 'Patient';
    const email = (currentUser && currentUser.email) || '';
    const initials = name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'P';

    if (sidebarUserName) sidebarUserName.textContent = name;
    if (sidebarUserEmail) sidebarUserEmail.textContent = email;
    if (profileSummaryName) profileSummaryName.textContent = name;
    if (profileSummaryEmail) profileSummaryEmail.textContent = email;

    if (currentUser && currentUser.profilePicture) {
      const imgSrc = `/api/profile/picture?t=${Date.now()}`;
      if (sidebarImg) {
        sidebarImg.src = imgSrc;
        sidebarImg.style.display = 'block';
      }
      if (sidebarInitials) sidebarInitials.style.display = 'none';

      if (profileImg) {
        profileImg.src = imgSrc;
        profileImg.style.display = 'block';
      }
      if (profileInitials) profileInitials.style.display = 'none';

      if (btnRemovePhoto) btnRemovePhoto.style.display = 'inline-block';
    } else {
      if (sidebarImg) sidebarImg.style.display = 'none';
      if (sidebarInitials) {
        sidebarInitials.textContent = initials;
        sidebarInitials.style.display = 'flex';
      }

      if (profileImg) profileImg.style.display = 'none';
      if (profileInitials) {
        profileInitials.textContent = initials;
        profileInitials.style.display = 'flex';
      }

      if (btnRemovePhoto) btnRemovePhoto.style.display = 'none';
    }
  }

  async function renderProfile() {
    if (!currentUser) return;

    const populateFields = () => {
      if (!currentUser) return;
      const nameInput = document.getElementById('profileNameInput');
      const emailInput = document.getElementById('profileEmailInput');
      const phoneInput = document.getElementById('profilePhoneInput');
      const emergencyInput = document.getElementById('profileEmergencyInput');
      const themeSelect = document.getElementById('profileThemeSelect');
      const memberSince = document.getElementById('profileMemberSince');

      if (nameInput) nameInput.value = currentUser.name || '';
      if (emailInput) emailInput.value = currentUser.email || '';
      if (phoneInput) phoneInput.value = currentUser.phone || '';
      if (emergencyInput) emergencyInput.value = currentUser.emergencyContact || '';
      if (themeSelect) themeSelect.value = currentUser.themePreference || localStorage.getItem('medimate_theme') || 'system';

      if (memberSince) {
        const created = currentUser.createdAt ? new Date(currentUser.createdAt) : new Date();
        const monthYear = created.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        memberSince.textContent = `Member since ${monthYear}`;
      }

      const prefInApp = document.getElementById('prefInAppReminders');
      const prefBrowser = document.getElementById('prefBrowserAlerts');
      if (prefInApp) {
        prefInApp.checked = currentUser.inAppRemindersEnabled !== false;
      }
      if (prefBrowser) {
        prefBrowser.checked = currentUser.browserNotificationsEnabled === true;
      }
      updatePermissionBadgeUI();
      updatePushBadgeUI();
      updateProfileAvatarUI();

      const isCaregiver = currentUser && currentUser.role === 'caregiver';
      const patientCaregiverCard = document.getElementById('patientCaregiverCard');
      if (patientCaregiverCard) {
        patientCaregiverCard.style.display = isCaregiver ? 'none' : 'block';
      }

      const profileRoleBadge = document.getElementById('profileRoleBadge');
      if (profileRoleBadge) {
        profileRoleBadge.innerHTML = isCaregiver ? '<span>🤝 Caregiver Profile</span>' : '<span>👤 Patient Profile</span>';
      }
      const profilePageSubtitle = document.getElementById('profilePageSubtitle');
      if (profilePageSubtitle) {
        profilePageSubtitle.textContent = isCaregiver
          ? 'Manage your account contact details, theme preferences, and notifications.'
          : 'Manage your personal information, emergency contacts, and profile photo in one safe place.';
      }
    };

    // 1. Populate immediately from existing state to eliminate UI lag
    populateFields();
    if (!currentUser || currentUser.role !== 'caregiver') {
      loadPatientCaregiverLinks();
    }

    // 2. Fetch fresh profile data from backend
    try {
      const res = await fetch('/api/profile', { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        currentUser = { ...currentUser, ...data.user };
        populateFields();
        if (!currentUser || currentUser.role !== 'caregiver') {
          loadPatientCaregiverLinks();
        }
      }
    } catch (e) {
      // Non-fatal background fetch
    }
  }

  const profilePhotoInput = document.getElementById('profilePhotoInput');
  const profilePhotoPreviewBox = document.getElementById('profilePhotoPreviewBox');
  const photoPreviewImg = document.getElementById('photoPreviewImg');
  const btnCancelPhotoPreview = document.getElementById('btnCancelPhotoPreview');
  const btnConfirmUploadPhoto = document.getElementById('btnConfirmUploadPhoto');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');

  if (profilePhotoInput) {
    profilePhotoInput.addEventListener('change', () => {
      const file = profilePhotoInput.files && profilePhotoInput.files[0];
      if (!file) return;

      if (file.size > 3 * 1024 * 1024) {
        showToast('Image file size must not exceed 3 MB.', 'danger');
        profilePhotoInput.value = '';
        return;
      }

      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        showToast('Please select a JPG, PNG, or WebP image.', 'danger');
        profilePhotoInput.value = '';
        return;
      }

      selectedPhotoFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        if (photoPreviewImg) photoPreviewImg.src = e.target.result;
        if (profilePhotoPreviewBox) profilePhotoPreviewBox.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnCancelPhotoPreview) {
    btnCancelPhotoPreview.addEventListener('click', () => {
      selectedPhotoFile = null;
      if (profilePhotoInput) profilePhotoInput.value = '';
      if (profilePhotoPreviewBox) profilePhotoPreviewBox.style.display = 'none';
    });
  }

  if (btnConfirmUploadPhoto) {
    btnConfirmUploadPhoto.addEventListener('click', async () => {
      if (!selectedPhotoFile) return;

      btnConfirmUploadPhoto.disabled = true;
      btnConfirmUploadPhoto.textContent = 'Saving...';

      const formData = new FormData();
      formData.append('picture', selectedPhotoFile);

      try {
        const res = await fetch('/api/profile/picture', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update profile picture.');
        }

        currentUser.profilePicture = data.profilePicture;
        selectedPhotoFile = null;
        if (profilePhotoInput) profilePhotoInput.value = '';
        if (profilePhotoPreviewBox) profilePhotoPreviewBox.style.display = 'none';
        updateProfileAvatarUI();
        showToast('✓ Profile picture updated successfully.', 'success');
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        btnConfirmUploadPhoto.disabled = false;
        btnConfirmUploadPhoto.textContent = 'Save Photo';
      }
    });
  }

  if (btnRemovePhoto) {
    btnRemovePhoto.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to remove your profile picture and restore your initials avatar?')) return;

      btnRemovePhoto.disabled = true;
      try {
        const res = await fetch('/api/profile/picture', { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to remove picture.');

        currentUser.profilePicture = null;
        updateProfileAvatarUI();
        showToast('✓ Profile picture removed. Initials restored.', 'info');
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        btnRemovePhoto.disabled = false;
      }
    });
  }

  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors('profile');

      const nameVal = document.getElementById('profileNameInput').value.trim();
      const phoneVal = document.getElementById('profilePhoneInput').value.trim();
      const emergVal = document.getElementById('profileEmergencyInput').value.trim();
      const themeVal = document.getElementById('profileThemeSelect').value;

      if (!nameVal || nameVal.length < 2) {
        showFieldError('profileNameError', 'Please enter your full name (minimum 2 characters).');
        return;
      }

      const btnSave = document.getElementById('btnSaveProfile');
      btnSave.disabled = true;
      btnSave.textContent = 'Saving...';

      try {
        const res = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            name: nameVal,
            phone: phoneVal,
            emergencyContact: emergVal,
            themePreference: themeVal
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update profile.');

        currentUser = { ...currentUser, ...data.user };
        updateProfileAvatarUI();
        applyTheme(themeVal);
        localStorage.setItem('medimate_theme', themeVal);
        showToast('✓ Profile details saved successfully.', 'success');
      } catch (err) {
        showToast(err.message, 'danger');
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Save Changes';
      }
    });
  }

  const profileThemeSelect = document.getElementById('profileThemeSelect');
  if (profileThemeSelect) {
    profileThemeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

  // ----------------------------------------------------------------------------
  // Caregiver Portal & Patient Caregiver Linking Handlers
  // ----------------------------------------------------------------------------
  let inviteCountdownInterval = null;

  function startInviteCountdown(expiresAtDate) {
    if (inviteCountdownInterval) {
      clearInterval(inviteCountdownInterval);
      inviteCountdownInterval = null;
    }

    const timerEl = document.getElementById('inviteCountdownTimer');
    const countdownWrap = document.getElementById('inviteCountdown');
    if (!timerEl) return;

    function tick() {
      const remainingMs = new Date(expiresAtDate).getTime() - Date.now();
      if (remainingMs <= 0) {
        timerEl.textContent = '00:00 (Expired)';
        if (countdownWrap) countdownWrap.classList.add('is-expired');
        clearInterval(inviteCountdownInterval);
        inviteCountdownInterval = null;
        loadPatientCaregiverLinks();
        return;
      }

      const totalSec = Math.floor(remainingMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      timerEl.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
      if (countdownWrap) countdownWrap.classList.remove('is-expired');
    }

    tick();
    inviteCountdownInterval = setInterval(tick, 1000);
  }

  function setCaregiverCardAlert(msg, type = 'danger') {
    const alertEl = document.getElementById('caregiverCardAlert');
    if (!alertEl) return;
    if (!msg) {
      alertEl.textContent = '';
      alertEl.style.display = 'none';
      alertEl.className = 'caregiver-card-alert';
    } else {
      alertEl.textContent = msg;
      alertEl.className = `caregiver-card-alert alert-${type}`;
      alertEl.style.display = 'block';
    }
  }

  async function loadPatientCaregiverLinks() {
    const pendingContainer = document.getElementById('pendingInvitesContainer');
    const activeContainer = document.getElementById('activeCaregiversContainer');
    const pendingCountBadge = document.getElementById('pendingInvitesCount');
    const activeCountBadge = document.getElementById('activeCaregiversCount');
    if (!pendingContainer || !activeContainer) return;

    try {
      const res = await fetch('/api/caregiver/links', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('Failed to fetch caregiver links');
      const data = await res.json();
      const links = data.links || [];

      const now = new Date();
      const pending = links.filter(l => l.status === 'pending' && new Date(l.expiresAt) > now);
      const active = links.filter(l => l.status === 'active' && l.caregiverId);

      if (pendingCountBadge) {
        pendingCountBadge.textContent = `${pending.length} Pending`;
      }
      if (activeCountBadge) {
        activeCountBadge.textContent = `${active.length} Active`;
      }

      if (pending.length === 0) {
        pendingContainer.innerHTML = '<p class="caregiver-empty-hint">No pending invitations.</p>';
      } else {
        pendingContainer.innerHTML = pending.map(l => {
          const expDate = new Date(l.expiresAt);
          const expTime = expDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const diffMins = Math.max(1, Math.round((expDate.getTime() - Date.now()) / 60000));
          return `
            <div class="caregiver-link-item">
              <div class="caregiver-link-details">
                <span class="caregiver-link-name">Single-Use Invitation Code</span>
                <span class="caregiver-link-meta">Expires at ${expTime} (⏱️ ~${diffMins} min${diffMins === 1 ? '' : 's'} remaining)</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm btn-revoke-link" data-id="${l._id}" style="padding: 4px 10px; font-size: var(--font-size-xs); color: var(--color-danger);">
                Cancel Invite
              </button>
            </div>
          `;
        }).join('');
      }

      if (active.length === 0) {
        activeContainer.innerHTML = '<p class="caregiver-empty-hint">No caregivers connected yet. Generate an invite code above to get started.</p>';
      } else {
        activeContainer.innerHTML = active.map(l => {
          const caregiver = l.caregiverId || {};
          const connectedDate = l.acceptedAt ? new Date(l.acceptedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Active';
          const phoneMeta = caregiver.phone ? ` · 📞 ${caregiver.phone}` : '';
          return `
            <div class="caregiver-link-item">
              <div class="caregiver-link-details">
                <span class="caregiver-link-name">${caregiver.name || 'Caregiver'}</span>
                <span class="caregiver-link-meta">${caregiver.email || ''}${phoneMeta} · Connected ${connectedDate}</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm btn-revoke-link" data-id="${l._id}" style="padding: 4px 10px; font-size: var(--font-size-xs); color: var(--color-danger);">
                Revoke Access
              </button>
            </div>
          `;
        }).join('');
      }

      // Wire revoke buttons with button loading feedback
      document.querySelectorAll('.btn-revoke-link').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-id');
          await handleRevokeCaregiverLink(id, btn);
        };
      });
    } catch (err) {
      console.warn('[Caregiver Links Fetch Error]', err.message);
    }
  }

  async function handleRevokeCaregiverLink(linkId, btnEl) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'Revoking...';
    }
    setCaregiverCardAlert(null);

    try {
      const res = await fetch(`/api/caregiver/links/${linkId}/revoke`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke link');

      const newInviteBox = document.getElementById('newInviteBox');
      if (newInviteBox) newInviteBox.style.display = 'none';
      if (inviteCountdownInterval) {
        clearInterval(inviteCountdownInterval);
        inviteCountdownInterval = null;
      }

      showToast('✓ Caregiver access revoked successfully.', 'info');
      await loadPatientCaregiverLinks();
    } catch (err) {
      setCaregiverCardAlert(err.message, 'danger');
      showToast(err.message, 'danger');
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = 'Revoke Access';
      }
    }
  }

  async function handleGenerateCaregiverInvite() {
    const btn = document.getElementById('btnGenerateCaregiverInvite');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Generating...';
    }
    setCaregiverCardAlert(null);

    try {
      const res = await fetch('/api/caregiver/invite', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate invite');

      const newInviteBox = document.getElementById('newInviteBox');
      const inviteCodeDisplay = document.getElementById('inviteCodeDisplay');
      if (newInviteBox && inviteCodeDisplay) {
        inviteCodeDisplay.textContent = data.token || data.inviteToken;
        newInviteBox.style.display = 'block';
        startInviteCountdown(data.expiresAt);
      }
      showToast('✓ Invite code generated! Valid for 15 minutes.', 'success');
      await loadPatientCaregiverLinks();
    } catch (err) {
      setCaregiverCardAlert(err.message, 'danger');
      showToast(err.message, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '✨ Generate Invite Code';
      }
    }
  }

  let selectedCaregiverPatientId = localStorage.getItem('medimate_selected_caregiver_patient') || null;

  function setSelectedCaregiverPatientId(id) {
    selectedCaregiverPatientId = id || null;
    if (selectedCaregiverPatientId) {
      localStorage.setItem('medimate_selected_caregiver_patient', selectedCaregiverPatientId);
    } else {
      localStorage.removeItem('medimate_selected_caregiver_patient');
    }
  }

  /**
   * Helper: Fetch list of authorized patients for the caregiver
   */
  async function fetchCaregiverPatientsList() {
    try {
      const res = await fetch('/api/caregiver/patients', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('Failed to load linked patients');
      const data = await res.json();
      const patients = data.patients || [];

      if (patients.length === 0) {
        setSelectedCaregiverPatientId(null);
      } else if (!selectedCaregiverPatientId || !patients.some(p => p.id === selectedCaregiverPatientId)) {
        // Default to first patient
        setSelectedCaregiverPatientId(patients[0].id);
      }
      return patients;
    } catch (err) {
      console.warn('[Caregiver Patients List Error]', err.message);
      return [];
    }
  }

  /**
   * 1. Render Caregiver Dashboard (/caregiver or /caregiver/dashboard)
   */
  async function renderCaregiverDashboard() {
    const greetingEl = document.getElementById('caregiverDashGreetingName');
    if (greetingEl && currentUser) {
      greetingEl.textContent = currentUser.name || 'Caregiver';
    }

    const contextCard = document.getElementById('caregiverDashActiveContextCard');
    const metricsGrid = document.getElementById('caregiverDashMetricsGrid');
    const emptyState = document.getElementById('caregiverDashEmptyState');
    const patientNameEl = document.getElementById('caregiverDashPatientName');
    const patientEmailEl = document.getElementById('caregiverDashPatientEmail');
    const patientAvatarEl = document.getElementById('caregiverDashPatientAvatar');
    const switcherWrapper = document.getElementById('caregiverDashPatientSelectWrapper');
    const patientSelect = document.getElementById('caregiverDashPatientSelect');

    const patients = await fetchCaregiverPatientsList();

    if (patients.length === 0) {
      if (contextCard) contextCard.style.display = 'none';
      if (metricsGrid) metricsGrid.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (contextCard) contextCard.style.display = 'block';
    if (metricsGrid) metricsGrid.style.display = 'grid';

    const activePatient = patients.find(p => p.id === selectedCaregiverPatientId) || patients[0];
    if (activePatient && selectedCaregiverPatientId !== activePatient.id) {
      setSelectedCaregiverPatientId(activePatient.id);
    }

    if (patientNameEl) patientNameEl.textContent = activePatient.name || 'Patient';
    if (patientEmailEl) {
      patientEmailEl.textContent = activePatient.email + (activePatient.phone ? ` · ${activePatient.phone}` : '');
    }
    if (patientAvatarEl) {
      patientAvatarEl.textContent = (activePatient.name || 'P').charAt(0).toUpperCase();
    }

    // Multiple patients selector
    if (patients.length > 1 && switcherWrapper && patientSelect) {
      switcherWrapper.style.display = 'block';
      patientSelect.innerHTML = patients.map(p =>
        `<option value="${p.id}" ${p.id === activePatient.id ? 'selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.email)})</option>`
      ).join('');
      patientSelect.onchange = async () => {
        setSelectedCaregiverPatientId(patientSelect.value);
        await renderCaregiverDashboard();
      };
    } else if (switcherWrapper) {
      switcherWrapper.style.display = 'none';
    }

    // Load active patient dashboard data for summary cards
    try {
      const res = await fetch(`/api/caregiver/patients/${activePatient.id}/dashboard`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        const { summary, nextUpcomingDose, totalMedicines, activeMedicinesCount } = data;

        const adherenceVal = document.getElementById('caregiverDashAdherenceValue');
        const adherenceLbl = document.getElementById('caregiverDashAdherenceLabel');
        const adherenceBdg = document.getElementById('caregiverDashAdherenceBadge');
        const progressFill = document.getElementById('caregiverDashProgressFill');
        const progressBar = document.getElementById('caregiverDashProgressBar');
        const nextDoseName = document.getElementById('caregiverDashNextDoseName');
        const nextDoseMeta = document.getElementById('caregiverDashNextDoseMeta');
        const totalMeds = document.getElementById('caregiverDashTotalMeds');
        const totalMedsLbl = document.getElementById('caregiverDashTotalMedsLabel');

        const hasDoses = summary && summary.totalDoses > 0;
        if (adherenceVal) adherenceVal.textContent = hasDoses ? `${summary.takenDoses} of ${summary.totalDoses}` : '0 of 0';
        if (adherenceLbl) adherenceLbl.textContent = hasDoses ? `Doses taken today (${summary.adherencePercentage}%)` : 'No doses scheduled today';
        if (adherenceBdg) adherenceBdg.textContent = !hasDoses ? 'No Doses' : (summary.allTaken ? '✓ Complete' : 'Today');
        if (progressFill) progressFill.style.width = `${summary ? summary.adherencePercentage : 0}%`;
        if (progressBar) progressBar.setAttribute('aria-valuenow', summary ? summary.adherencePercentage : 0);

        if (nextUpcomingDose) {
          if (nextDoseName) nextDoseName.textContent = `${nextUpcomingDose.name} (${nextUpcomingDose.dosage})`;
          if (nextDoseMeta) {
            const timeFormatted = formatTime(nextUpcomingDose.time);
            const timeOfDayStr = nextUpcomingDose.timeOfDay ? ` · ${nextUpcomingDose.timeOfDay}` : '';
            nextDoseMeta.textContent = `Scheduled at ${timeFormatted}${timeOfDayStr}`;
          }
        } else if (summary && summary.allTaken) {
          if (nextDoseName) nextDoseName.textContent = '✓ All Doses Taken';
          if (nextDoseMeta) nextDoseMeta.textContent = 'All scheduled doses for today have been checked off by the patient.';
        } else if (!hasDoses) {
          if (nextDoseName) nextDoseName.textContent = 'No Doses Scheduled';
          if (nextDoseMeta) nextDoseMeta.textContent = totalMedicines === 0 ? 'Patient has no prescriptions added.' : 'No doses scheduled for today.';
        } else {
          if (nextDoseName) nextDoseName.textContent = 'No Doses Due';
          if (nextDoseMeta) nextDoseMeta.textContent = 'No upcoming doses pending for today.';
        }

        if (totalMeds) totalMeds.textContent = totalMedicines || 0;
        if (totalMedsLbl) totalMedsLbl.textContent = `${totalMedicines === 1 ? 'Prescription' : 'Prescriptions'} tracked`;
      }
    } catch (e) {
      console.warn('[Caregiver Dash Summary Error]', e.message);
    }
  }

  /**
   * 2. Render My Patients Management (/caregiver/patients)
   */
  async function renderCaregiverPatients() {
    const container = document.getElementById('caregiverPatientsContainer');
    const countBadge = document.getElementById('caregiverPatientsCount');
    const connectError = document.getElementById('caregiverConnectError');
    if (connectError) {
      connectError.textContent = '';
      connectError.style.display = 'none';
    }

    if (!container) return;

    const patients = await fetchCaregiverPatientsList();

    if (countBadge) {
      countBadge.textContent = `${patients.length} Patient${patients.length === 1 ? '' : 's'} Linked`;
    }

    if (patients.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
          <div style="font-size: 3rem; margin-bottom: 12px;" aria-hidden="true">🤝</div>
          <h3 style="font-size: var(--font-size-lg); font-weight: 700; color: var(--color-text-main); margin-bottom: 8px;">No Patients Linked Yet</h3>
          <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); max-width: 480px; margin: 0 auto 16px;">
            Ask your loved one or patient to generate a 15-minute invite code from their profile, then enter it above to connect.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = patients.map(p => {
      const isSelected = p.id === selectedCaregiverPatientId;
      const since = p.linkedSince ? new Date(p.linkedSince).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Connected';
      return `
        <div class="card ${isSelected ? 'patient-card-selected' : ''}" style="padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="avatar-initials" style="width: 42px; height: 42px; font-size: 1.1rem; background: var(--color-teal); color: #fff; border-radius: var(--radius-pill); display: flex; align-items: center; justify-content: center; font-weight: 700;">
                  ${(p.name || 'P').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style="font-size: var(--font-size-md); font-weight: 700; color: var(--color-text-main); margin: 0;">${escapeHtml(p.name || 'Patient')}</h3>
                  <span style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${escapeHtml(p.email || '')}</span>
                </div>
              </div>
              <span class="permission-status-badge status-allowed" style="font-size: 0.72rem;">Active Link</span>
            </div>
            <div style="background: var(--color-bg-page); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 16px; font-size: var(--font-size-xs); color: var(--color-text-muted);">
              <span>Linked since: <strong>${since}</strong></span><br>
              <span>Phone: <strong>${escapeHtml(p.phone || 'Not provided')}</strong></span><br>
              <span>Access: <strong>Read-Only Medication & Schedule Oversight</strong></span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm btn-select-patient" data-id="${p.id}">
              ${isSelected ? '✓ Active Patient' : '📋 View Schedule'}
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-leave-patient" data-id="${p.linkId}" style="color: var(--color-danger);">
              Disconnect / Leave
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Wire select buttons
    document.querySelectorAll('.btn-select-patient').forEach(btn => {
      btn.onclick = () => {
        const patientId = btn.getAttribute('data-id');
        if (patientId) {
          setSelectedCaregiverPatientId(patientId);
          navigateTo('/caregiver/schedule');
        }
      };
    });

    // Wire leave buttons
    document.querySelectorAll('.btn-leave-patient').forEach(btn => {
      btn.onclick = async () => {
        const linkId = btn.getAttribute('data-id');
        await handleLeavePatientLink(linkId);
      };
    });
  }

  /**
   * 3. Render Medicine Schedule View (/caregiver/schedule)
   */
  async function renderCaregiverSchedule() {
    const emptyState = document.getElementById('caregiverScheduleEmptyState');
    const contextCard = document.getElementById('caregiverScheduleContextCard');
    const schedulePanel = document.getElementById('caregiverSchedulePanel');
    const switcherWrapper = document.getElementById('caregiverScheduleSwitcherWrapper');
    const switcherSelect = document.getElementById('caregiverSchedulePatientSelect');

    const patients = await fetchCaregiverPatientsList();

    if (patients.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (contextCard) contextCard.style.display = 'none';
      if (schedulePanel) schedulePanel.style.display = 'none';
      if (switcherWrapper) switcherWrapper.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (contextCard) contextCard.style.display = 'block';
    if (schedulePanel) schedulePanel.style.display = 'block';

    const activePatient = patients.find(p => p.id === selectedCaregiverPatientId) || patients[0];
    if (activePatient && selectedCaregiverPatientId !== activePatient.id) {
      setSelectedCaregiverPatientId(activePatient.id);
    }

    // Switcher handling
    if (patients.length > 1 && switcherWrapper && switcherSelect) {
      switcherWrapper.style.display = 'flex';
      switcherSelect.innerHTML = patients.map(p =>
        `<option value="${p.id}" ${p.id === activePatient.id ? 'selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.email)})</option>`
      ).join('');
      switcherSelect.onchange = async () => {
        setSelectedCaregiverPatientId(switcherSelect.value);
        await renderCaregiverSchedule();
      };
    } else if (switcherWrapper) {
      switcherWrapper.style.display = 'none';
    }

    if (selectedCaregiverPatientId) {
      await loadCaregiverPatientDashboard(selectedCaregiverPatientId);
    }
  }

  async function loadCaregiverPatientDashboard(patientId) {
    const detailName = document.getElementById('caregiverDetailPatientName');
    const detailEmail = document.getElementById('caregiverDetailPatientEmail');
    const detailLinkedDate = document.getElementById('caregiverDetailLinkedDate');
    const adherenceBadge = document.getElementById('caregiverAdherenceBadge');
    const adherenceValue = document.getElementById('caregiverAdherenceValue');
    const adherenceLabel = document.getElementById('caregiverAdherenceLabel');
    const progressBar = document.getElementById('caregiverProgressBar');
    const progressFill = document.getElementById('caregiverProgressFill');
    const nextDoseName = document.getElementById('caregiverNextDoseName');
    const nextDoseMeta = document.getElementById('caregiverNextDoseMeta');
    const totalMeds = document.getElementById('caregiverTotalMeds');
    const totalMedsLabel = document.getElementById('caregiverTotalMedsLabel');
    const scheduleCount = document.getElementById('caregiverScheduleCount');
    const scheduleContainer = document.getElementById('caregiverScheduleContainer');

    if (!scheduleContainer) return;

    scheduleContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 16px;">
        <div class="spinner-icon" aria-hidden="true"></div>
        <p style="color: var(--color-teal); font-weight: 600; margin-top: 12px; font-size: var(--font-size-sm);">
          Loading patient medication schedule...
        </p>
      </div>
    `;

    try {
      const res = await fetch(`/api/caregiver/patients/${patientId}/dashboard`, {
        headers: { 'Accept': 'application/json' }
      });

      if (res.status === 401) {
        showToast('Your session has expired. Please sign in again.', 'danger');
        signOutUser();
        return;
      }

      if (res.status === 403) {
        scheduleContainer.innerHTML = `
          <div class="caregiver-card-alert is-danger" style="display: block;">
            Access denied. You do not have an active caregiver relationship with this patient.
          </div>
        `;
        showToast('Access to patient schedule is not authorized or has been revoked.', 'danger');
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load patient details');
      }

      const data = await res.json();
      const { patient, summary, nextUpcomingDose, schedule, totalMedicines, activeMedicinesCount } = data;

      // Update patient profile info
      if (detailName) detailName.textContent = patient.name || 'Patient';
      if (detailEmail) {
        detailEmail.textContent = patient.email + (patient.phone ? ` · ${patient.phone}` : '');
      }
      if (detailLinkedDate) {
        detailLinkedDate.textContent = patient.linkedSince
          ? new Date(patient.linkedSince).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Active';
      }

      // Update Adherence summary
      const hasDoses = summary && summary.totalDoses > 0;
      if (adherenceValue) {
        adherenceValue.textContent = hasDoses ? `${summary.takenDoses} of ${summary.totalDoses}` : '0 of 0';
      }
      if (adherenceLabel) {
        adherenceLabel.textContent = hasDoses
          ? `Doses taken today (${summary.adherencePercentage}%)`
          : 'No doses scheduled for today';
      }
      if (adherenceBadge) {
        adherenceBadge.textContent = !hasDoses
          ? 'No Doses'
          : (summary.allTaken ? '✓ Complete' : 'Today');
      }
      if (progressFill) {
        progressFill.style.width = `${summary ? summary.adherencePercentage : 0}%`;
      }
      if (progressBar) {
        progressBar.setAttribute('aria-valuenow', summary ? summary.adherencePercentage : 0);
      }

      // Update Next Upcoming Dose
      if (nextUpcomingDose) {
        if (nextDoseName) {
          nextDoseName.textContent = `${nextUpcomingDose.name} (${nextUpcomingDose.dosage})`;
        }
        if (nextDoseMeta) {
          const timeFormatted = formatTime(nextUpcomingDose.time);
          const timeOfDayStr = nextUpcomingDose.timeOfDay ? ` · ${nextUpcomingDose.timeOfDay}` : '';
          const notesStr = nextUpcomingDose.notes ? ` · Note: ${nextUpcomingDose.notes}` : '';
          nextDoseMeta.textContent = `Scheduled at ${timeFormatted}${timeOfDayStr}${notesStr}`;
        }
      } else if (summary && summary.allTaken) {
        if (nextDoseName) nextDoseName.textContent = '✓ All Doses Taken';
        if (nextDoseMeta) nextDoseMeta.textContent = 'All scheduled doses for today have been checked off by the patient.';
      } else if (!hasDoses) {
        if (nextDoseName) nextDoseName.textContent = 'No Doses Scheduled';
        if (nextDoseMeta) {
          nextDoseMeta.textContent = totalMedicines === 0
            ? 'Patient has not added medicines yet.'
            : 'All recorded medication courses have completed.';
        }
      } else {
        if (nextDoseName) nextDoseName.textContent = 'No Doses Due';
        if (nextDoseMeta) nextDoseMeta.textContent = 'No upcoming doses pending for today.';
      }

      // Update Total Prescriptions
      if (totalMeds) totalMeds.textContent = totalMedicines || 0;
      if (totalMedsLabel) {
        totalMedsLabel.textContent = `${totalMedicines === 1 ? 'Prescription' : 'Prescriptions'} tracked` +
          (activeMedicinesCount !== totalMedicines ? ` (${activeMedicinesCount} active today)` : '');
      }

      // Update Schedule Count Badge
      if (scheduleCount) {
        const totalCount = (summary && summary.totalDoses) || 0;
        scheduleCount.textContent = `${totalCount} Dose${totalCount === 1 ? '' : 's'} Scheduled`;
      }

      // Render Today's Medicine Schedule List (Strictly Read-Only)
      if (totalMedicines === 0) {
        scheduleContainer.innerHTML = `
          <div class="empty-state" style="padding: 36px 16px;">
            <span class="empty-icon" aria-hidden="true">💊</span>
            <h4 class="empty-title">Patient Has No Prescriptions</h4>
            <p class="empty-text">
              This patient has not added any medicines to their account yet. When they add prescriptions, their daily doses will appear here automatically.
            </p>
          </div>
        `;
        return;
      }

      if (!hasDoses) {
        scheduleContainer.innerHTML = `
          <div class="empty-state" style="padding: 36px 16px;">
            <span class="empty-icon" aria-hidden="true">🎉</span>
            <h4 class="empty-title">No Doses Scheduled Today</h4>
            <p class="empty-text">
              All prescribed medication courses for this patient have concluded or no doses are scheduled for today.
            </p>
          </div>
        `;
        return;
      }

      scheduleContainer.innerHTML = schedule.map(item => {
        const isTaken = item.status === 'taken';
        const displayClockTimes = (Array.isArray(item.scheduleTimes) && item.scheduleTimes.length > 0)
          ? item.scheduleTimes.map(t => formatTime(t)).join(', ')
          : formatTime(item.time);

        return `
          <div class="schedule-item ${isTaken ? 'is-taken' : ''}" style="margin-bottom: 12px;">
            <div class="schedule-time-box">
              <span class="schedule-time-badge">${escapeHtml(item.timeOfDay || 'Scheduled')}</span>
              <span class="schedule-clock-time">${displayClockTimes}</span>
            </div>
            <div class="schedule-info-box" style="flex: 1;">
              <div class="schedule-med-name">
                <span>${escapeHtml(item.name)}</span>
                <span class="schedule-dose-tag">${escapeHtml(item.dosage)}</span>
              </div>
              <p class="schedule-notes" style="margin: 4px 0 0;">
                ${item.notes ? escapeHtml(item.notes) : 'Standard scheduled daily dose.'}
              </p>
            </div>
            <div style="display: flex; align-items: center; justify-content: flex-end; min-width: 140px;">
              ${isTaken
                ? `<span class="status-badge taken">✓ Taken${item.takenAt ? ' at ' + escapeHtml(item.takenAt) : ''}</span>`
                : `<span class="status-badge pending">⏳ Due / Pending</span>`
              }
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[Caregiver Patient Dashboard Error]', err);
      scheduleContainer.innerHTML = `
        <div class="caregiver-card-alert is-danger" style="display: block;">
          Failed to load patient schedule: ${escapeHtml(err.message)}
          <button type="button" class="btn btn-secondary btn-sm" id="btnRetryCaregiverDash" style="margin-left: 10px;">
            Retry
          </button>
        </div>
      `;
      const btnRetry = document.getElementById('btnRetryCaregiverDash');
      if (btnRetry) {
        btnRetry.onclick = () => loadCaregiverPatientDashboard(patientId);
      }
    }
  }

  async function handleLeavePatientLink(linkId) {
    if (!confirm('Are you sure you want to disconnect from this patient? You will lose access to their medication schedule.')) {
      return;
    }
    try {
      const res = await fetch(`/api/caregiver/links/${linkId}/leave`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect from patient');
      showToast('✓ Disconnected from patient.', 'info');
      setSelectedCaregiverPatientId(null);
      
      // Refresh current view
      if (window.location.pathname === '/caregiver/patients') {
        await renderCaregiverPatients();
      } else if (window.location.pathname === '/caregiver/schedule') {
        await renderCaregiverSchedule();
      } else {
        await renderCaregiverDashboard();
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async function handleAcceptCaregiverInvite(e) {
    if (e) e.preventDefault();
    const tokenInput = document.getElementById('caregiverInviteTokenInput');
    const errEl = document.getElementById('caregiverConnectError');
    const btn = document.getElementById('btnConnectPatient');
    if (!tokenInput) return;

    const token = tokenInput.value.trim();
    if (!token) {
      if (errEl) {
        errEl.textContent = 'Please enter an invitation code.';
        errEl.style.display = 'block';
      }
      return;
    }

    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/caregiver/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not accept invitation code.');
      }

      tokenInput.value = '';
      showToast('✓ Successfully connected to patient!', 'success');
      await renderCaregiverPatients();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
      showToast(err.message, 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Bind Caregiver UI event listeners
  const btnGenerateCaregiverInvite = document.getElementById('btnGenerateCaregiverInvite');
  if (btnGenerateCaregiverInvite) {
    btnGenerateCaregiverInvite.addEventListener('click', handleGenerateCaregiverInvite);
  }

  const btnCopyInviteCode = document.getElementById('btnCopyInviteCode');
  if (btnCopyInviteCode) {
    btnCopyInviteCode.addEventListener('click', () => {
      const display = document.getElementById('inviteCodeDisplay');
      if (display && display.textContent) {
        navigator.clipboard.writeText(display.textContent).then(() => {
          btnCopyInviteCode.textContent = '✓ Copied!';
          setTimeout(() => { btnCopyInviteCode.textContent = '📋 Copy Code'; }, 2000);
        }).catch(() => {
          showToast('Could not automatically copy code to clipboard.', 'info');
        });
      }
    });
  }

  const caregiverConnectForm = document.getElementById('caregiverConnectForm');
  if (caregiverConnectForm) {
    caregiverConnectForm.addEventListener('submit', handleAcceptCaregiverInvite);
  }

  // ----------------------------------------------------------------------------
  // 17. Medicine Reminders, Autonomous Foreground Scheduler & Preferences
  // ----------------------------------------------------------------------------
  let reminderSchedulerTimer = null;
  let previousActiveElement = null;

  // SVG Icons for Notification Drawer & Alerts
  const NOTIF_BELL_SVG = `<svg class="icon-svg bell-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
  const NOTIF_CHECK_SVG = `<svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const NOTIF_ALERT_SVG = `<svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  const NOTIF_CLOCK_SVG = `<svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
  const NOTIF_CAL_SVG = `<svg class="icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

  const btnSidebarNotifications = document.getElementById('btnSidebarNotifications');
  const notifDrawer = document.getElementById('notificationsDrawer');
  const notifDrawerBackdrop = document.getElementById('notifDrawerBackdrop');
  const btnCloseNotifDrawer = document.getElementById('btnCloseNotifDrawer');
  const btnClearDismissedNotifs = document.getElementById('btnClearDismissedNotifs');
  const btnEnableBrowserNotifs = document.getElementById('btnEnableBrowserNotifs');

  function openNotificationsDrawer() {
    previousActiveElement = document.activeElement;
    if (notifDrawer) {
      notifDrawer.classList.add('open');
      notifDrawer.setAttribute('aria-hidden', 'false');
    }
    if (notifDrawerBackdrop) {
      notifDrawerBackdrop.classList.add('active');
      notifDrawerBackdrop.setAttribute('aria-hidden', 'false');
    }
    renderRemindersDrawer();
    if (btnCloseNotifDrawer) btnCloseNotifDrawer.focus();
  }

  function closeNotificationsDrawer() {
    if (notifDrawer) {
      notifDrawer.classList.remove('open');
      notifDrawer.setAttribute('aria-hidden', 'true');
    }
    if (notifDrawerBackdrop) {
      notifDrawerBackdrop.classList.remove('active');
      notifDrawerBackdrop.setAttribute('aria-hidden', 'true');
    }
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
  }

  if (btnSidebarNotifications) btnSidebarNotifications.addEventListener('click', openNotificationsDrawer);
  if (btnCloseNotifDrawer) btnCloseNotifDrawer.addEventListener('click', closeNotificationsDrawer);
  if (notifDrawerBackdrop) notifDrawerBackdrop.addEventListener('click', closeNotificationsDrawer);

  // Close drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifDrawer && notifDrawer.classList.contains('open')) {
      closeNotificationsDrawer();
    }
  });

  // Close drawer when clicking outside
  document.addEventListener('click', (e) => {
    if (notifDrawer && notifDrawer.classList.contains('open')) {
      const isTrigger = btnSidebarNotifications && btnSidebarNotifications.contains(e.target);
      if (!notifDrawer.contains(e.target) && !isTrigger && e.target !== notifDrawerBackdrop) {
        closeNotificationsDrawer();
      }
    }
  });

  // Track dismissed reminders in localStorage
  function getDismissedReminders() {
    try {
      const raw = localStorage.getItem('medimate_dismissed_reminders');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function dismissReminder(occurrenceId) {
    const list = getDismissedReminders();
    if (!list.includes(occurrenceId)) {
      list.push(occurrenceId);
      localStorage.setItem('medimate_dismissed_reminders', JSON.stringify(list));
    }
    updateRemindersUI();
    renderRemindersDrawer();
  }

  function clearDismissedReminders() {
    localStorage.removeItem('medimate_dismissed_reminders');
    updateRemindersUI();
    renderRemindersDrawer();
    showToast('Dismissed reminder history reset.', 'info');
  }

  if (btnClearDismissedNotifs) {
    btnClearDismissedNotifs.addEventListener('click', clearDismissedReminders);
  }

  // Track delivered in-app reminders to prevent annoying repeats
  function getDeliveredReminders() {
    try {
      const raw = localStorage.getItem('medimate_delivered_reminders');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function markReminderDelivered(occurrenceId) {
    const delivered = getDeliveredReminders();
    if (!delivered.includes(occurrenceId)) {
      delivered.push(occurrenceId);
      if (delivered.length > 250) delivered.shift();
      localStorage.setItem('medimate_delivered_reminders', JSON.stringify(delivered));
    }
  }

  // Calculate today's reminders with deduplicated occurrence IDs
  function calculateTodayReminders() {
    const todayStr = getTodayDateString();
    const dismissed = getDismissedReminders();
    const activeMeds = medicines.filter(m => !m.endDate || m.endDate >= todayStr);

    const reminders = [];
    const now = new Date();
    const userId = (currentUser && (currentUser._id || currentUser.id)) ? (currentUser._id || currentUser.id) : 'patient';

    activeMeds.forEach(med => {
      const times = (Array.isArray(med.scheduleTimes) && med.scheduleTimes.length > 0)
        ? med.scheduleTimes
        : ['08:00'];

      times.forEach(timeStr => {
        const occurrenceId = `${userId}_${med._id}_${timeStr}_${todayStr}`;
        const isTaken = Array.isArray(med.doseHistory) &&
          med.doseHistory.some(d => d.date === todayStr && d.status === 'taken');
        const isDismissed = dismissed.includes(occurrenceId);

        const [h, m] = timeStr.split(':').map(Number);
        const doseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
        const diffMinutes = Math.round((doseDate.getTime() - now.getTime()) / 60000);

        let urgency = 'scheduled';
        if (isTaken) {
          urgency = 'taken';
        } else if (diffMinutes <= 60 && diffMinutes >= -180) {
          urgency = 'due-now';
        } else if (diffMinutes > 60 && diffMinutes <= 240) {
          urgency = 'upcoming';
        }

        reminders.push({
          occurrenceId,
          medId: med._id,
          medName: med.name,
          dosage: med.dosage,
          timeOfDay: med.timeOfDay,
          timeStr,
          diffMinutes,
          isTaken,
          isDismissed,
          urgency
        });
      });
    });

    reminders.sort((a, b) => a.timeStr.localeCompare(b.timeStr));
    return reminders;
  }

  // Update Notification Bell badge counters & aria-labels
  function updateRemindersUI() {
    const reminders = calculateTodayReminders();
    const activePending = reminders.filter(r => !r.isTaken && !r.isDismissed);
    const count = activePending.length;

    const sidebarBadge = document.getElementById('sidebarNotifBadge');
    const sidebarBtn = document.getElementById('btnSidebarNotifications');

    if (sidebarBadge) {
      if (count > 0) {
        sidebarBadge.textContent = count > 9 ? '9+' : String(count);
        sidebarBadge.style.display = 'inline-block';
      } else {
        sidebarBadge.textContent = '';
        sidebarBadge.style.display = 'none';
      }
    }

    const ariaLabel = count > 0 ? `Medicine Reminders (${count} pending)` : 'Medicine Reminders';
    if (sidebarBtn) sidebarBtn.setAttribute('aria-label', ariaLabel);
  }

  // Autonomous foreground scheduler loop
  function checkAutonomousReminders() {
    if (!currentUser || !medicines || medicines.length === 0) return;

    const delivered = getDeliveredReminders();
    const reminders = calculateTodayReminders();

    const inAppAllowed = currentUser.inAppRemindersEnabled !== false;
    const browserAllowed = currentUser.browserNotificationsEnabled === true;

    reminders.forEach(r => {
      // Due now: between -180 minutes and +60 minutes, not taken, not dismissed
      if (r.urgency === 'due-now' && !r.isTaken && !r.isDismissed) {
        if (!delivered.includes(r.occurrenceId)) {
          // Record delivery to deduplicate
          markReminderDelivered(r.occurrenceId);

          // Deliver in-app alert toast
          if (inAppAllowed) {
            showToast(`Time for ${r.medName} (${r.dosage}) · Scheduled for ${formatTime(r.timeStr)}`, 'info');
          }

          // Deliver desktop notification if enabled & permitted
          if (browserAllowed && 'Notification' in window && Notification.permission === 'granted') {
            try {
              if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                  reg.showNotification(`MediMate: ${r.medName} Due`, {
                    body: `Take ${r.dosage} scheduled for ${formatTime(r.timeStr)}.`,
                    icon: '/assets/medimate-logo.jpg',
                    badge: '/assets/medimate-logo.jpg',
                    tag: `dose-${r.occurrenceId}`,
                    data: { url: '/schedule' }
                  });
                });
              } else {
                new Notification(`MediMate: ${r.medName} Due`, {
                  body: `Take ${r.dosage} scheduled for ${formatTime(r.timeStr)}.`,
                  icon: '/assets/medimate-logo.jpg'
                });
              }
            } catch (err) {
              console.warn('[Desktop Alert Warning]', err.message);
            }
          }
        }
      }
    });

    updateRemindersUI();
    if (notifDrawer && notifDrawer.classList.contains('open')) {
      renderRemindersDrawer();
    }
  }

  function startReminderScheduler() {
    if (reminderSchedulerTimer) clearInterval(reminderSchedulerTimer);
    checkAutonomousReminders();
    reminderSchedulerTimer = setInterval(checkAutonomousReminders, 30000); // Check every 30 seconds
  }

  function stopReminderScheduler() {
    if (reminderSchedulerTimer) {
      clearInterval(reminderSchedulerTimer);
      reminderSchedulerTimer = null;
    }
  }

  // Wake up reminder check whenever tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUser) {
      checkAutonomousReminders();
    }
  });

  // Render content inside Notification Drawer
  function renderRemindersDrawer() {
    const drawerList = document.getElementById('notifDrawerList');
    const drawerCount = document.getElementById('notifDrawerCount');
    const browserBanner = document.getElementById('notifBrowserBanner');

    if (!drawerList) return;

    if (browserBanner) {
      if ('Notification' in window && Notification.permission === 'default') {
        browserBanner.style.display = 'flex';
      } else {
        browserBanner.style.display = 'none';
      }
    }

    const reminders = calculateTodayReminders();
    const activePending = reminders.filter(r => !r.isTaken && !r.isDismissed);

    if (drawerCount) {
      drawerCount.textContent = `${activePending.length} active reminder${activePending.length === 1 ? '' : 's'}`;
    }

    if (reminders.length === 0) {
      drawerList.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <span class="empty-icon" style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background-color: var(--color-teal-light); color: var(--color-teal-dark); margin: 0 auto 12px;">
            ${NOTIF_BELL_SVG}
          </span>
          <h4 class="empty-title" style="font-size: 1.1rem;">No Reminders Scheduled</h4>
          <p class="empty-text" style="font-size: var(--font-size-sm);">You have no active medicine doses scheduled for today.</p>
        </div>
      `;
      return;
    }

    drawerList.innerHTML = reminders.map(r => {
      let statusTag = '';
      if (r.isTaken) {
        statusTag = `<span class="status-badge taken">${NOTIF_CHECK_SVG} Dose Taken</span>`;
      } else if (r.urgency === 'due-now') {
        statusTag = `<span class="status-badge due">${NOTIF_ALERT_SVG} Due Now</span>`;
      } else if (r.urgency === 'upcoming') {
        statusTag = `<span class="status-badge upcoming">${NOTIF_CLOCK_SVG} Upcoming</span>`;
      } else {
        statusTag = `<span class="status-badge upcoming">${NOTIF_CAL_SVG} Scheduled</span>`;
      }

      if (r.isDismissed) {
        statusTag += ' <span style="font-size: 11px; color: var(--color-text-muted);">(Dismissed)</span>';
      }

      return `
        <div class="reminder-item ${r.urgency} ${r.isTaken ? 'taken' : ''}" data-occurrence="${r.occurrenceId}">
          <div class="reminder-item-header">
            <div>
              <div class="reminder-item-name">${escapeHtml(r.medName)}</div>
              <div class="reminder-item-dose">${escapeHtml(r.dosage)} · ${escapeHtml(r.timeOfDay || 'Daily')}</div>
            </div>
            ${statusTag}
          </div>
          <div class="reminder-item-time" style="display: flex; align-items: center; gap: 6px;">
            ${NOTIF_CLOCK_SVG} Scheduled for <strong>${formatTime(r.timeStr)}</strong>
          </div>
          <div class="reminder-item-actions">
            ${!r.isDismissed && !r.isTaken ? `
              <button type="button" class="btn btn-secondary btn-sm btn-dismiss-reminder" data-occurrence="${r.occurrenceId}" style="padding: 4px 10px; font-size: 12px;">
                Dismiss
              </button>
            ` : ''}
            ${!r.isTaken ? `
              <button type="button" class="btn btn-primary btn-sm btn-take-reminder" data-med-id="${r.medId}" style="padding: 4px 12px; font-size: 12px;">
                Mark Taken
              </button>
            ` : `
              <span style="font-size: 12px; color: var(--color-success-text); font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                ${NOTIF_CHECK_SVG} Completed for today
              </span>
            `}
          </div>
        </div>
      `;
    }).join('');

    drawerList.querySelectorAll('.btn-dismiss-reminder').forEach(btn => {
      btn.addEventListener('click', () => {
        const occId = btn.getAttribute('data-occurrence');
        dismissReminder(occId);
      });
    });

    drawerList.querySelectorAll('.btn-take-reminder').forEach(btn => {
      btn.addEventListener('click', async () => {
        const medId = btn.getAttribute('data-med-id');
        await handleDoseAction(medId, 'take');
        renderRemindersDrawer();
        updateRemindersUI();
      });
    });
  }

  // Helper: Base64 to Uint8Array for Web Push Key
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Update Permission Status Badge in Profile Settings
  function updatePermissionBadgeUI() {
    const badge = document.getElementById('prefPermissionBadge');
    const btnRequest = document.getElementById('btnRequestPermissionAction');
    if (!badge) return;

    if (!('Notification' in window)) {
      badge.className = 'permission-status-badge status-denied';
      badge.textContent = 'Not Supported';
      if (btnRequest) btnRequest.style.display = 'none';
      return;
    }

    if (Notification.permission === 'granted') {
      badge.className = 'permission-status-badge status-granted';
      badge.textContent = 'Granted';
      if (btnRequest) btnRequest.style.display = 'none';
    } else if (Notification.permission === 'denied') {
      badge.className = 'permission-status-badge status-denied';
      badge.textContent = 'Blocked in Browser';
      if (btnRequest) btnRequest.style.display = 'none';
    } else {
      badge.className = 'permission-status-badge status-default';
      badge.textContent = 'Not Enabled';
      if (btnRequest) btnRequest.style.display = 'inline-block';
    }
  }

  // Update Background Push Service Status Badge in Profile Settings
  async function updatePushBadgeUI() {
    const badge = document.getElementById('prefPushBadge');
    const btnSubscribe = document.getElementById('btnSubscribePushAction');
    if (!badge) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      badge.className = 'permission-status-badge status-denied';
      badge.textContent = 'Not Supported';
      if (btnSubscribe) btnSubscribe.style.display = 'none';
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      // Query server MongoDB subscription status as authoritative confirmation
      let serverConfirmed = false;
      let serverSubsCount = 0;
      try {
        const statusRes = await fetch('/api/notifications/subscription-status');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          serverConfirmed = Boolean(statusData.isSubscribed);
          serverSubsCount = statusData.totalSubscriptions || 0;
        }
      } catch (e) {
        serverConfirmed = currentUser && (currentUser.hasPushSubscription || (currentUser.pushSubscriptionsCount > 0));
      }

      if (sub && serverConfirmed) {
        badge.className = 'permission-status-badge status-granted';
        badge.textContent = 'Active (Web Push Ready)';
        if (btnSubscribe) btnSubscribe.style.display = 'none';
      } else if (sub && !serverConfirmed) {
        // Browser has local PushManager subscription but server hasn't saved it yet
        badge.className = 'permission-status-badge status-default';
        badge.textContent = 'Syncing to Server...';
        if (btnSubscribe) btnSubscribe.style.display = 'inline-block';
        // Auto trigger sync to store in MongoDB
        autoSyncPushSubscription();
      } else if (!sub && serverConfirmed) {
        badge.className = 'permission-status-badge status-default';
        badge.textContent = 'Registered on Another Device';
        if (btnSubscribe) btnSubscribe.style.display = 'inline-block';
      } else {
        badge.className = 'permission-status-badge status-default';
        badge.textContent = 'Not Registered';
        if (btnSubscribe) btnSubscribe.style.display = 'inline-block';
      }
    } catch (e) {
      badge.className = 'permission-status-badge status-default';
      badge.textContent = 'Not Registered';
      if (btnSubscribe) btnSubscribe.style.display = 'inline-block';
    }
  }

  // Sync client timezone with profile for accurate server-side push scheduling
  function syncClientTimezone() {
    if (!currentUser) return;
    try {
      const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const clientOffset = -(new Date().getTimezoneOffset());
      if (!currentUser.timezone || currentUser.timezone !== clientTz) {
        currentUser.timezone = clientTz;
        currentUser.timezoneOffset = clientOffset;
        fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ timezone: clientTz, timezoneOffset: clientOffset })
        }).catch(() => {});
      }
    } catch (e) {
      // Non-fatal
    }
  }

  // Proactively synchronize push subscription on session start / login
  async function autoSyncPushSubscription() {
    if (!currentUser) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const vapidRes = await fetch('/api/notifications/vapid-public-key');
        if (vapidRes.ok) {
          const { publicKey } = await vapidRes.json();
          if (publicKey) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
          }
        }
      }

      if (sub) {
        const syncRes = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub)
        });
        if (syncRes.ok) {
          currentUser.hasPushSubscription = true;
          currentUser.browserNotificationsEnabled = true;
        }
      }
      await updatePushBadgeUI();
    } catch (err) {
      console.warn('[AutoSync Push Subscription]', err.message);
    }
  }

  // Request browser notification permission and register push
  async function requestDesktopPermission() {
    if (!('Notification' in window)) {
      showToast('Notifications are not supported in this browser.', 'warning');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      updatePermissionBadgeUI();

      if (permission === 'granted') {
        showToast('Desktop notifications permitted!', 'success');

        if ('serviceWorker' in navigator && 'PushManager' in window) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const vapidRes = await fetch('/api/notifications/vapid-public-key');
            if (vapidRes.ok) {
              const { publicKey } = await vapidRes.json();
              if (publicKey) {
                const sub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
                await fetch('/api/notifications/subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(sub)
                });
                await updatePushBadgeUI();
              }
            }
          } catch (pushErr) {
            console.warn('[Push Registration Warning]', pushErr.message);
          }
        }

        if (currentUser) currentUser.browserNotificationsEnabled = true;
        const prefBrowser = document.getElementById('prefBrowserAlerts');
        if (prefBrowser) prefBrowser.checked = true;

        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ browserNotificationsEnabled: true })
        });

        await updatePushBadgeUI();
        return true;
      } else if (permission === 'denied') {
        showToast('Notification permission was denied in your browser settings.', 'warning');
        const prefBrowser = document.getElementById('prefBrowserAlerts');
        if (prefBrowser) prefBrowser.checked = false;
        await updatePushBadgeUI();
        return false;
      }
    } catch (e) {
      console.warn('[Notification Permission Error]', e.message);
      return false;
    }
  }

  if (btnEnableBrowserNotifs) {
    btnEnableBrowserNotifs.addEventListener('click', requestDesktopPermission);
  }

  const btnRequestPermissionAction = document.getElementById('btnRequestPermissionAction');
  if (btnRequestPermissionAction) {
    btnRequestPermissionAction.addEventListener('click', requestDesktopPermission);
  }

  const btnSubscribePushAction = document.getElementById('btnSubscribePushAction');
  if (btnSubscribePushAction) {
    btnSubscribePushAction.addEventListener('click', async () => {
      btnSubscribePushAction.disabled = true;
      btnSubscribePushAction.textContent = 'Enabling...';
      try {
        await requestDesktopPermission();
        await updatePushBadgeUI();
      } finally {
        btnSubscribePushAction.disabled = false;
        btnSubscribePushAction.textContent = 'Enable Push';
      }
    });
  }

  // Profile Notification Preference Switches
  const prefInAppReminders = document.getElementById('prefInAppReminders');
  if (prefInAppReminders) {
    prefInAppReminders.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      if (currentUser) currentUser.inAppRemindersEnabled = enabled;
      try {
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ inAppRemindersEnabled: enabled })
        });
        showToast(enabled ? 'In-app reminders enabled.' : 'In-app reminders silenced.', 'info');
      } catch (err) {
        showToast('Failed to update in-app reminder preference.', 'danger');
      }
    });
  }

  const prefBrowserAlerts = document.getElementById('prefBrowserAlerts');
  if (prefBrowserAlerts) {
    prefBrowserAlerts.addEventListener('change', async (e) => {
      const wantEnabled = e.target.checked;
      if (wantEnabled) {
        if ('Notification' in window && Notification.permission !== 'granted') {
          const granted = await requestDesktopPermission();
          if (!granted) {
            e.target.checked = false;
            return;
          }
        } else {
          if (currentUser) currentUser.browserNotificationsEnabled = true;
          await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ browserNotificationsEnabled: true })
          });
          showToast('Desktop notifications enabled.', 'success');
        }
      } else {
        if (currentUser) currentUser.browserNotificationsEnabled = false;
        await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ browserNotificationsEnabled: false })
        });
        showToast('Desktop notifications turned off.', 'info');
      }
    });
  }

  // Safe Send Test Notification Action (Genuine Web Push verification)
  const btnSendTestReminder = document.getElementById('btnSendTestReminder');
  if (btnSendTestReminder) {
    btnSendTestReminder.addEventListener('click', async () => {
      btnSendTestReminder.disabled = true;
      const originalText = btnSendTestReminder.innerHTML;
      btnSendTestReminder.textContent = 'Sending...';

      try {
        const res = await fetch('/api/notifications/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to send test notification.');
        }

        if (data.sentCount > 0) {
          showToast(`✓ Genuine Web Push sent to ${data.sentCount} device(s)! Service Worker will display the OS notification.`, 'success');
        } else if (data.pushAttempted) {
          showToast('Push service rejected the test notification. You may need to re-enable push.', 'warning');
        } else {
          showToast('No active push subscriptions on server. Click "Enable Push" to register this browser.', 'warning');
        }
      } catch (err) {
        showToast(err.message || 'Failed to trigger test notification.', 'danger');
      } finally {
        btnSendTestReminder.disabled = false;
        btnSendTestReminder.innerHTML = originalText;
      }
    });
  }

  // ----------------------------------------------------------------------------
  // 17. Notification & Background Push Diagnostics Modal
  // ----------------------------------------------------------------------------
  const diagnosticsModal = document.getElementById('diagnosticsModal');
  const btnOpenNotifDiagnostics = document.getElementById('btnOpenNotifDiagnostics');
  const btnCloseDiagnosticsModal = document.getElementById('btnCloseDiagnosticsModal');
  const btnDismissDiagnostics = document.getElementById('btnDismissDiagnostics');
  const btnRefreshDiagnostics = document.getElementById('btnRefreshDiagnostics');
  const btnTriggerSchedulerNow = document.getElementById('btnTriggerSchedulerNow');
  const diagnosticsLoading = document.getElementById('diagnosticsLoading');
  const diagnosticsContent = document.getElementById('diagnosticsContent');

  async function loadAndRenderDiagnostics() {
    if (!diagnosticsContent || !diagnosticsLoading) return;
    diagnosticsLoading.style.display = 'block';
    diagnosticsContent.style.display = 'none';

    try {
      // 1. Gather browser client environment info
      const clientInfo = {
        isSecureContext: window.isSecureContext,
        swSupported: 'serviceWorker' in navigator,
        swControllerActive: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        swState: 'none',
        pushSupported: 'PushManager' in window,
        notificationPermission: ('Notification' in window) ? Notification.permission : 'unsupported',
        currentClientEndpoint: null,
        clientTz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      };

      if (clientInfo.swSupported) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            clientInfo.swState = reg.active ? 'Active' : (reg.installing ? 'Installing' : 'Waiting');
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
              clientInfo.currentClientEndpoint = sub.endpoint;
            }
          } else {
            clientInfo.swState = 'Not Registered';
          }
        } catch (e) {
          clientInfo.swState = 'Error: ' + e.message;
        }
      }

      // 2. Fetch server diagnostics
      const res = await fetch('/api/notifications/diagnostics');
      if (!res.ok) {
        throw new Error('Server returned HTTP ' + res.status);
      }
      const data = await res.json();

      // 3. Render HTML
      let html = '';

      // Section A: Browser & Client Readiness
      const permBadgeClass = clientInfo.notificationPermission === 'granted' ? 'status-granted' : (clientInfo.notificationPermission === 'denied' ? 'status-denied' : 'status-default');
      const swBadgeClass = clientInfo.swState === 'Active' ? 'status-granted' : 'status-default';
      const pushBadgeClass = clientInfo.currentClientEndpoint ? 'status-granted' : 'status-default';

      html += `
        <div class="diag-section">
          <div class="diag-section-header">
            <h4 class="diag-title">💻 Browser & Device Environment</h4>
            <span class="permission-status-badge ${permBadgeClass}">${clientInfo.notificationPermission.toUpperCase()}</span>
          </div>
          <div class="diag-grid">
            <div class="diag-item">
              <span class="diag-label">Secure Context (HTTPS / Localhost)</span>
              <span class="diag-val">${clientInfo.isSecureContext ? '✓ Secure' : '⚠ Insecure (Pushes require HTTPS)'}</span>
            </div>
            <div class="diag-item">
              <span class="diag-label">Service Worker Engine</span>
              <span class="diag-val"><span class="permission-status-badge ${swBadgeClass}">${clientInfo.swState}</span></span>
            </div>
            <div class="diag-item">
              <span class="diag-label">Browser PushManager</span>
              <span class="diag-val">${clientInfo.pushSupported ? '✓ Supported' : '✕ Not Supported'}</span>
            </div>
            <div class="diag-item">
              <span class="diag-label">Active Push Subscription on this Browser</span>
              <span class="diag-val"><span class="permission-status-badge ${pushBadgeClass}">${clientInfo.currentClientEndpoint ? 'Active on Device' : 'None Detected'}</span></span>
            </div>
            <div class="diag-item" style="grid-column: 1 / -1;">
              <span class="diag-label">Browser Push Endpoint (Device Token)</span>
              <span class="diag-val"><code class="diag-code">${clientInfo.currentClientEndpoint ? (clientInfo.currentClientEndpoint.slice(0, 65) + '...') : 'None (click "Enable Push" in profile to register)'}</code></span>
            </div>
          </div>
        </div>
      `;

      // Section B: Server & Scheduler Engine
      const vapidBadgeClass = data.vapid.configured ? 'status-granted' : 'status-denied';
      const schedBadgeClass = data.scheduler.running ? 'status-granted' : 'status-default';
      const lastRun = data.scheduler.lastRunAt ? new Date(data.scheduler.lastRunAt).toLocaleTimeString() : 'Not executed yet';
      const stats = data.scheduler.lastRunStats || {};

      html += `
        <div class="diag-section">
          <div class="diag-section-header">
            <h4 class="diag-title">⚙️ Server Background Scheduler & VAPID</h4>
            <span class="permission-status-badge ${vapidBadgeClass}">${data.vapid.configured ? 'VAPID CONFIGURED' : 'MISSING VAPID'}</span>
          </div>
          <div class="diag-grid">
            <div class="diag-item">
              <span class="diag-label">Scheduler Daemon Status</span>
              <span class="diag-val"><span class="permission-status-badge ${schedBadgeClass}">${data.scheduler.running ? 'Active (' + data.scheduler.intervalMinutes + 'm cycle)' : 'Stopped'}</span></span>
            </div>
            <div class="diag-item">
              <span class="diag-label">Last Scheduler Sweep</span>
              <span class="diag-val">${lastRun} (${data.scheduler.lastRunDurationMs || 0} ms)</span>
            </div>
            <div class="diag-item">
              <span class="diag-label">Patient Timezone (from Profile)</span>
              <span class="diag-val">${data.user.timezone} (Local: ${data.user.serverCalculatedLocalTime || '--'})</span>
            </div>
            <div class="diag-item">
              <span class="diag-label">Stored Server Subscriptions for Account</span>
              <span class="diag-val"><strong>${data.user.totalPushSubscriptions}</strong> device(s) registered</span>
            </div>
            <div class="diag-item" style="grid-column: 1 / -1;">
              <span class="diag-label">Last Sweep Stats</span>
              <span class="diag-val" style="font-size: var(--font-size-xs);">Evaluated Users: ${stats.evaluatedUsers || 0} · Due Doses: ${stats.evaluatedDoses || 0} · Notifications Sent: ${stats.sent || 0} · Failed: ${stats.failed || 0} · Skipped: ${stats.skipped || 0}</span>
            </div>
          </div>
        </div>
      `;

      // Section C: Active Medicines Due Today
      const meds = data.medicines.items || [];
      html += `
        <div class="diag-section">
          <div class="diag-section-header">
            <h4 class="diag-title">💊 Medicines Active Today (${meds.length})</h4>
          </div>
          ${meds.length === 0 ? '<p style="font-size: var(--font-size-xs); color: var(--color-text-muted);">No active prescriptions found for today.</p>' : `
            <div style="overflow-x: auto;">
              <table class="diag-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Dosage</th>
                    <th>Scheduled Times</th>
                    <th>Course</th>
                    <th>Today Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${meds.map(m => `
                    <tr>
                      <td><strong>${m.name}</strong></td>
                      <td>${m.dosage}</td>
                      <td>${(m.scheduleTimes || []).join(', ')}</td>
                      <td>${m.endDate ? 'Ends ' + m.endDate : 'Ongoing'}</td>
                      <td>${m.takenToday ? '✓ Taken Today' : 'Pending'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      // Section D: Recent Push Delivery Logs (Last 10)
      const logs = data.recentLogs || [];
      html += `
        <div class="diag-section">
          <div class="diag-section-header">
            <h4 class="diag-title">📜 Recent Push Delivery Logs</h4>
            <span style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${logs.length} logged attempt(s)</span>
          </div>
          ${logs.length === 0 ? '<p style="font-size: var(--font-size-xs); color: var(--color-text-muted);">No push delivery attempts logged yet for your account.</p>' : `
            <div style="overflow-x: auto;">
              <table class="diag-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Dose Time</th>
                    <th>Status</th>
                    <th>Delivered / Attempts</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${logs.map(log => {
                    const statusClass = log.status === 'sent' ? 'status-sent' : (log.status === 'failed' ? 'status-failed' : 'status-skipped');
                    const timeStr = log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : '--';
                    return `
                      <tr>
                        <td>${timeStr}</td>
                        <td>${log.doseTime}</td>
                        <td><span class="diag-log-status ${statusClass}">${log.status.toUpperCase()}</span></td>
                        <td>${log.deliveredCount || 0} / ${log.attemptedCount || 1}</td>
                        <td>${log.errorMessage ? `<span style="color: var(--color-danger);">${log.errorMessage}</span>` : 'Delivered successfully'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      diagnosticsContent.innerHTML = html;
      diagnosticsContent.style.display = 'block';
    } catch (err) {
      diagnosticsContent.innerHTML = `
        <div style="padding: 16px; background-color: var(--color-danger-bg); border: 1px solid var(--color-danger-border); border-radius: var(--radius-sm); color: var(--color-danger-text);">
          <strong>Failed to load diagnostics:</strong> ${err.message}
        </div>
      `;
      diagnosticsContent.style.display = 'block';
    } finally {
      diagnosticsLoading.style.display = 'none';
    }
  }

  if (btnOpenNotifDiagnostics && diagnosticsModal) {
    btnOpenNotifDiagnostics.addEventListener('click', () => {
      openModal(diagnosticsModal);
      loadAndRenderDiagnostics();
    });
  }

  if (btnCloseDiagnosticsModal && diagnosticsModal) {
    btnCloseDiagnosticsModal.addEventListener('click', () => {
      closeModal(diagnosticsModal);
    });
  }

  if (btnDismissDiagnostics && diagnosticsModal) {
    btnDismissDiagnostics.addEventListener('click', () => {
      closeModal(diagnosticsModal);
    });
  }

  if (btnRefreshDiagnostics) {
    btnRefreshDiagnostics.addEventListener('click', () => {
      loadAndRenderDiagnostics();
    });
  }

  if (btnTriggerSchedulerNow) {
    btnTriggerSchedulerNow.addEventListener('click', async () => {
      btnTriggerSchedulerNow.disabled = true;
      btnTriggerSchedulerNow.textContent = 'Running...';
      try {
        const runRes = await fetch('/api/notifications/scheduler/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const runData = await runRes.json();
        showToast(runData.message || 'Scheduler executed successfully.', 'info');
        await loadAndRenderDiagnostics();
      } catch (e) {
        showToast('Failed to trigger scheduler: ' + e.message, 'danger');
      } finally {
        btnTriggerSchedulerNow.disabled = false;
        btnTriggerSchedulerNow.textContent = '⚡ Run Scheduler Once';
      }
    });
  }

  // Register Service Worker for Web Push with robust lifecycle handling
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const doRegister = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[SW Registration] Scope:', reg.scope);
        if (reg.update) {
          reg.update().catch(() => {});
        }
      } catch (err) {
        console.warn('[SW Registration Error]', err.message);
      }
    };

    if (document.readyState === 'complete') {
      doRegister();
    } else {
      window.addEventListener('load', doRegister);
      setTimeout(doRegister, 500); // Fail-safe fallback if load event was missed
    }
  }

  registerServiceWorker();

  // ----------------------------------------------------------------------------
  // 18. Initialize Application
  // ----------------------------------------------------------------------------
  initTheme();
  checkAuthStatus();
});
