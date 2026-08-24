import { createRouter } from './src/core/router.js';

(() => {
  'use strict';

  const SUPABASE_URL = 'https://wljfjlamkqheewpwlgyc.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rZc-HzAn3UOkELOHKlnStw_4nxsZgh8';
  const SITE_URL = 'https://night-ops.training/#settings';

  if (!window.supabase?.createClient) {
    console.error('Night Ops account service did not load.');
    document.body.classList.remove('auth-pending');
    document.body.classList.add('auth-signed-out');
    history.replaceState(null, '', '#settings');
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === 'settings'));
    const unavailable = document.querySelector('#auth-status');
    if (unavailable) unavailable.textContent = 'Account service is temporarily unavailable. Please try again shortly.';
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  let session = null;
  let profile = null;
  let sharedData = { announcements: [], events: [], questions: [] };
  let syncTimer = null;

  const signedOut = document.querySelector('#auth-signed-out');
  const signedIn = document.querySelector('#auth-signed-in');
  const authStatus = document.querySelector('#auth-status');
  const accountSummary = document.querySelector('#account-summary');
  const loginButton = document.querySelector('.login-button');
  const renderAppRoute = route;
  const previewContent = {
    training: {
      eyebrow: 'TRAINING LIBRARY',
      title: 'Build your <em>field skills.</em>',
      lede: 'Explore guided practice paths for ropes, first aid, navigation, fire safety, observation, teamwork, and Morse code.',
      heading: 'Learn a little. Practice often.',
      detail: 'An account unlocks step-by-step lessons and keeps every completed practice round with you.',
      features: ['Guided skill paths', 'Safe practice instructions', 'Progress saved across devices']
    },
    packing: {
      eyebrow: 'NIGHT OPS PREP',
      title: 'Pack with <em>confidence.</em>',
      lede: 'Use a practical readiness checklist alongside your troop’s official event list so important field essentials are not forgotten.',
      heading: 'Make every bag check count.',
      detail: 'Sign in to use the interactive packing list and keep your readiness status synchronized.',
      features: ['Interactive bag checklist', 'Night Ops readiness status', 'Saved packing progress']
    },
    progress: {
      eyebrow: 'MISSION STATUS',
      title: 'See your progress <em>take shape.</em>',
      lede: 'Track practice across every field skill, notice what needs attention, and set a clear goal for the next troop meeting.',
      heading: 'Your personal mission log.',
      detail: 'Create an account to save completed rounds, packing progress, reflections, and next-practice goals.',
      features: ['Skill-by-skill progress', 'Personal practice notes', 'Private synchronized records']
    },
    leader: {
      eyebrow: 'NIGHT OPS TEAM',
      title: 'Stay connected <em>and prepared.</em>',
      lede: 'Members can see upcoming practices, read announcements, and bring questions to their Night Ops leads.',
      heading: 'One place for troop updates.',
      detail: 'Sign in to view private troop information. Approved leads can publish schedules and announcements.',
      features: ['Upcoming practice details', 'Lead announcements', 'Questions for the team']
    }
  };

  function renderPreview(section) {
    const preview = previewContent[section] || previewContent.training;
    const container = document.querySelector('#access-preview-content');
    if (container) {
      container.innerHTML = `<div class="access-hero"><div class="access-copy"><div class="eyebrow">${preview.eyebrow}</div><h1>${preview.title}</h1><p class="lede">${preview.lede}</p></div><aside class="access-panel"><div class="eyebrow">MEMBERS ONLY</div><h2>${preview.heading}</h2><p>${preview.detail}</p><ul class="access-features">${preview.features.map(feature => `<li>${feature}</li>`).join('')}</ul><div class="auth-actions"><button class="primary-button" data-gate-create>Create account <span>→</span></button><button class="outline-button" data-gate-login>Log in</button></div></aside></div>`;
    }
    renderAppRoute('access');
    document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.route === section));
  }

  const router = createRouter({
    window,
    isAuthenticated: () => Boolean(session?.user && profile),
    render: resolved => {
      if (resolved.preview) renderPreview(resolved.requested);
      else renderAppRoute(resolved.rendered);
    },
    onResolved: resolved => {
      const heading = document.querySelector(`#${resolved.rendered} h1, #${resolved.rendered} [role="status"]`);
      if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      if (heading) heading.focus({ preventScroll: true });
      const routeStatus = document.querySelector('#route-status');
      if (routeStatus) routeStatus.textContent = `${document.title} loaded`;
    }
  });

  route = name => router.navigate(name);

  function applyAuthGate(authenticated) {
    const wasAuthenticated = document.body.classList.contains('auth-signed-in');
    document.body.classList.remove('auth-pending', 'auth-signed-in', 'auth-signed-out');
    document.body.classList.add(authenticated ? 'auth-signed-in' : 'auth-signed-out');

    if (!authenticated) {
      router.authChanged(false);
      return;
    }

    if (!wasAuthenticated) router.authChanged(true);
  }

  function setStatus(message, kind = '') {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.className = `auth-status ${kind}`.trim();
  }

  function displayError(error, fallback) {
    console.error(error);
    setStatus(error?.message || fallback, 'error');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function localSnapshot() {
    return {
      packing: state.packing || {},
      practice: state.practice || {},
      currentLesson: state.currentLesson || {},
      reflections: state.reflections || {}
    };
  }

  function hasProgress(value) {
    if (!value || typeof value !== 'object') return false;
    return ['packing', 'practice', 'currentLesson', 'reflections'].some(key =>
      value[key] && Object.keys(value[key]).length > 0
    );
  }

  function applyRemoteState(remote) {
    if (!remote || typeof remote !== 'object') return;
    state.packing = remote.packing || {};
    state.practice = remote.practice || {};
    state.currentLesson = remote.currentLesson || {};
    state.reflections = remote.reflections || {};
    localStorage.setItem('nightOpsState', JSON.stringify(state));
    refresh();
    if (location.hash === '#skill') {
      const activeSkill = skills.find(skill => state.currentLesson[skill.id] !== undefined);
      if (activeSkill) showSkill(activeSkill.id);
    }
  }

  async function syncTrainingNow() {
    if (!session?.user) return;
    const { error } = await client
      .from('training_state')
      .upsert({ user_id: session.user.id, state: localSnapshot() }, { onConflict: 'user_id' });
    if (error) displayError(error, 'Progress could not be synchronized.');
  }

  function scheduleTrainingSync() {
    if (!session?.user) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncTrainingNow, 450);
  }

  const saveLocally = save;
  save = function saveWithAccountSync() {
    saveLocally();
    scheduleTrainingSync();
  };

  function setLeaderControls() {
    const signedInUser = Boolean(session?.user);
    const isLead = profile?.role === 'lead';
    const leaderOnly = [
      document.querySelector('.leader-add'),
      document.querySelector('#lead-announcement'),
      document.querySelector('[data-add-announcement]')
    ];
    leaderOnly.forEach(element => {
      if (!element) return;
      element.hidden = !isLead;
      if ('disabled' in element) element.disabled = !isLead;
    });

    const question = document.querySelector('#troop-question');
    const askButton = document.querySelector('[data-add-question]');
    if (question) question.disabled = !signedInUser;
    if (askButton) askButton.disabled = !signedInUser;
  }

  function renderAccount() {
    const authenticated = Boolean(session?.user && profile);
    if (signedOut) signedOut.hidden = authenticated;
    if (signedIn) signedIn.hidden = !authenticated;
    if (loginButton) loginButton.textContent = authenticated ? profile.display_name : 'Log in';

    state.profile = authenticated
      ? { name: profile.display_name, role: profile.role }
      : { name: '', role: 'member' };
    localStorage.setItem('nightOpsProfile', JSON.stringify(state.profile));

    const nameInput = document.querySelector('#profile-name');
    const profileStatus = document.querySelector('#profile-status');
    if (nameInput) nameInput.value = profile?.display_name || '';
    if (accountSummary) accountSummary.textContent = session?.user?.email || '';
    if (profileStatus) {
      profileStatus.textContent = authenticated
        ? `Role: ${profile.role === 'lead' ? 'Night Ops lead' : 'Troop member'} · Roles are assigned by the site administrator.`
        : '';
    }

    applyAuthGate(authenticated);
    setLeaderControls();
  }

  async function loadSharedData() {
    if (!session?.user) {
      sharedData = { announcements: [], events: [], questions: [] };
      renderSharedData();
      return;
    }

    const [announcementsResult, eventsResult, questionsResult] = await Promise.all([
      client.from('announcements').select('id,content,created_by,created_at').order('created_at', { ascending: false }),
      client.from('training_events').select('id,title,starts_at,location,created_by').order('starts_at', { ascending: true }),
      client.from('questions').select('id,content,created_by,created_at').order('created_at', { ascending: false })
    ]);

    const firstError = announcementsResult.error || eventsResult.error || questionsResult.error;
    if (firstError) {
      displayError(firstError, 'Troop information could not be loaded.');
      return;
    }

    sharedData = {
      announcements: announcementsResult.data || [],
      events: eventsResult.data || [],
      questions: questionsResult.data || []
    };
    renderSharedData();
  }

  function actionButton(kind, id, ownerId) {
    const allowed = profile?.role === 'lead' || (kind === 'question' && ownerId === session?.user?.id);
    return allowed
      ? `<button class="item-delete" data-backend-delete="${kind}|${id}" aria-label="Delete item">Delete</button>`
      : '';
  }

  function renderSharedData() {
    const authenticated = Boolean(session?.user);
    const announcements = document.querySelector('#announcement-list');
    const questions = document.querySelector('#question-list');
    const events = document.querySelector('#leader-schedule');

    if (!authenticated) {
      const prompt = '<p class="muted">Sign in to view troop information.</p>';
      if (announcements) announcements.innerHTML = prompt;
      if (questions) questions.innerHTML = prompt;
      if (events) events.innerHTML = prompt;
      setLeaderControls();
      return;
    }

    if (announcements) {
      announcements.innerHTML = sharedData.announcements.length
        ? sharedData.announcements.map(item => `<div class="board-post lead-post"><span>${escapeHtml(item.content)}</span>${actionButton('announcement', item.id, item.created_by)}</div>`).join('')
        : '<p class="muted">No announcements yet.</p>';
    }

    if (questions) {
      questions.innerHTML = sharedData.questions.length
        ? sharedData.questions.map(item => `<div class="board-post question-post"><span>${escapeHtml(item.content)}</span>${actionButton('question', item.id, item.created_by)}</div>`).join('')
        : '<p class="muted">No questions yet.</p>';
    }

    if (events) {
      events.innerHTML = sharedData.events.length
        ? sharedData.events.map(item => {
            const date = new Date(item.starts_at);
            const dateLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            return `<div class="schedule-item"><strong>${escapeHtml(dateLabel)} · ${escapeHtml(timeLabel)}</strong><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.location || 'Location TBD')}</small>${actionButton('event', item.id, item.created_by)}</div>`;
          }).join('')
        : '<p class="muted">No practices scheduled yet.</p>';
    }

    setLeaderControls();
  }

  // Older prototype renderers still run when training progress changes. Keep the
  // authenticated account and server-backed troop information authoritative.
  const refreshApp = refresh;
  refresh = function refreshWithBackendData() {
    refreshApp();
    renderAccount();
    renderSharedData();
  };

  async function loadAccount() {
    if (!session?.user) {
      profile = null;
      renderAccount();
      renderSharedData();
      return;
    }

    const [{ data: profileData, error: profileError }, { data: trainingData, error: trainingError }] = await Promise.all([
      client.from('profiles').select('id,display_name,role').eq('id', session.user.id).single(),
      client.from('training_state').select('state').eq('user_id', session.user.id).single()
    ]);

    if (profileError || trainingError) {
      displayError(profileError || trainingError, 'Your account could not be loaded.');
      profile = null;
      renderAccount();
      return;
    }

    profile = profileData;
    const remote = trainingData?.state || {};
    const local = localSnapshot();
    if (!hasProgress(remote) && hasProgress(local)) await syncTrainingNow();
    else applyRemoteState(remote);

    renderAccount();
    await loadSharedData();
    setStatus('Your progress is synchronized.', 'success');
  }

  async function signIn() {
    const email = document.querySelector('#auth-email')?.value.trim();
    const password = document.querySelector('#auth-password')?.value || '';
    if (!email || !password) return setStatus('Enter your email and password.', 'error');
    setStatus('Signing in…');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) displayError(error, 'Sign-in failed.');
  }

  async function signUp() {
    const displayName = document.querySelector('#auth-display-name')?.value.trim();
    const email = document.querySelector('#auth-email')?.value.trim();
    const password = document.querySelector('#auth-password')?.value || '';
    if (!displayName || !email || password.length < 8) {
      return setStatus('Enter a display name, valid email, and password of at least 8 characters.', 'error');
    }
    setStatus('Creating account…');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: SITE_URL }
    });
    if (error) return displayError(error, 'Account creation failed.');
    if (!data.session) setStatus('Check the email inbox to confirm the account, then return here to sign in.', 'success');
  }

  async function resetPassword() {
    const email = document.querySelector('#auth-email')?.value.trim();
    if (!email) return setStatus('Enter the account email first.', 'error');
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
    if (error) displayError(error, 'Password reset could not be sent.');
    else setStatus('Password-reset instructions were sent if that email has an account.', 'success');
  }

  async function saveDisplayName() {
    const displayName = document.querySelector('#profile-name')?.value.trim();
    if (!session?.user || !displayName) return setStatus('Enter a display name.', 'error');
    const { data, error } = await client
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', session.user.id)
      .select('id,display_name,role')
      .single();
    if (error) return displayError(error, 'The profile could not be updated.');
    profile = data;
    renderAccount();
    setStatus('Display name saved.', 'success');
  }

  async function addAnnouncement() {
    if (profile?.role !== 'lead') return setStatus('Only an approved lead can post announcements.', 'error');
    const input = document.querySelector('#lead-announcement');
    const content = input?.value.trim();
    if (!content) return;
    const { error } = await client.from('announcements').insert({ content, created_by: session.user.id });
    if (error) return displayError(error, 'Announcement could not be posted.');
    input.value = '';
    await loadSharedData();
  }

  async function addQuestion() {
    if (!session?.user) return setStatus('Sign in before asking a question.', 'error');
    const input = document.querySelector('#troop-question');
    const content = input?.value.trim();
    if (!content) return;
    const { error } = await client.from('questions').insert({ content, created_by: session.user.id });
    if (error) return displayError(error, 'Question could not be posted.');
    input.value = '';
    await loadSharedData();
  }

  async function addEvent() {
    if (profile?.role !== 'lead') return setStatus('Only an approved lead can schedule practices.', 'error');
    const date = document.querySelector('#leader-date')?.value;
    const time = document.querySelector('#leader-time')?.value || '18:00';
    const location = document.querySelector('#leader-address')?.value.trim() || '';
    const title = document.querySelector('#leader-training')?.value.trim();
    if (!date || !title) return setStatus('Add a practice name and date.', 'error');
    const startsAt = new Date(`${date}T${time}`);
    const { error } = await client.from('training_events').insert({
      title,
      starts_at: startsAt.toISOString(),
      location,
      created_by: session.user.id
    });
    if (error) return displayError(error, 'Practice could not be scheduled.');
    ['#leader-date', '#leader-time', '#leader-address', '#leader-training'].forEach(selector => {
      const input = document.querySelector(selector);
      if (input) input.value = '';
    });
    await loadSharedData();
  }

  async function deleteSharedItem(value) {
    const [kind, id] = value.split('|');
    const tables = { announcement: 'announcements', event: 'training_events', question: 'questions' };
    const table = tables[kind];
    if (!table || !id) return;
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) return displayError(error, 'The item could not be deleted.');
    await loadSharedData();
  }

  document.addEventListener('click', event => {
    const gateAction = event.target.closest('[data-gate-create], [data-gate-login]');
    if (!gateAction) return;
    event.preventDefault();
    route('settings');
    const target = gateAction.matches('[data-gate-create]') ? '#auth-display-name' : '#auth-email';
    setTimeout(() => document.querySelector(target)?.focus(), 0);
  });

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-auth-sign-in], [data-auth-sign-up], [data-auth-sign-out], [data-auth-reset], [data-save-account-profile]');
    if (!action) return;
    event.preventDefault();
    if (action.matches('[data-auth-sign-in]')) signIn();
    if (action.matches('[data-auth-sign-up]')) signUp();
    if (action.matches('[data-auth-sign-out]')) client.auth.signOut();
    if (action.matches('[data-auth-reset]')) resetPassword();
    if (action.matches('[data-save-account-profile]')) saveDisplayName();
  });

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-add-announcement], [data-add-question], [data-add-training], [data-backend-delete]');
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (action.matches('[data-add-announcement]')) addAnnouncement();
    if (action.matches('[data-add-question]')) addQuestion();
    if (action.matches('[data-add-training]')) addEvent();
    if (action.dataset.backendDelete) deleteSharedItem(action.dataset.backendDelete);
  }, true);

  client.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    setTimeout(loadAccount, 0);
  });

  state.profile = { name: '', role: 'member' };
  renderSharedData();
  router.start();

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      session = null;
      renderAccount();
      return displayError(error, 'Account session could not be checked.');
    }
    session = data.session;
    loadAccount();
  });

  window.NightOpsBackend = { client, syncTrainingNow, loadSharedData };
})();
