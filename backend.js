import { createRouter } from './src/core/router.js';
import { createClient } from '@supabase/supabase-js';
import {
  createTrainingStore,
  hasTrainingProgress,
  mergeTrainingStates,
  migrateTrainingState
} from './src/core/store.js';

(() => {
  'use strict';

  const SUPABASE_URL = 'https://wljfjlamkqheewpwlgyc.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rZc-HzAn3UOkELOHKlnStw_4nxsZgh8';
  const SITE_URL = 'https://night-ops.training/#settings';

  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  let session = null;
  let profile = null;
  let sharedData = { announcements: [], events: [], questions: [] };
  let memberProfiles = [];
  let syncTimer = null;
  let syncInFlight = false;
  let remoteVersion = null;
  let pendingConflict = null;
  let authMode = 'sign-in';
  let recoveryMode = false;
  const trainingStore = createTrainingStore(state);

  const signedOut = document.querySelector('#auth-signed-out');
  const signedIn = document.querySelector('#auth-signed-in');
  const recovery = document.querySelector('#auth-recovery');
  const authStatus = document.querySelector('#auth-status');
  const accountSummary = document.querySelector('#account-summary');
  const loginButton = document.querySelector('.login-button');
  const syncConflict = document.querySelector('#sync-conflict');
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

  function setAuthMode(mode) {
    authMode = mode === 'sign-up' ? 'sign-up' : 'sign-in';
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.authMode === authMode));
    });
    document.querySelectorAll('[data-sign-up-only]').forEach(element => {
      element.hidden = authMode !== 'sign-up';
    });
    const heading = document.querySelector('#auth-heading');
    if (heading) heading.textContent = authMode === 'sign-up' ? 'Create a Night Ops account' : 'Sign in to Night Ops';
    document.querySelector('[data-auth-sign-in]')?.toggleAttribute('hidden', authMode !== 'sign-in');
    document.querySelector('[data-auth-sign-up]')?.toggleAttribute('hidden', authMode !== 'sign-up');
    document.querySelector('#auth-password')?.setAttribute('autocomplete', authMode === 'sign-up' ? 'new-password' : 'current-password');
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

  function storeLocal(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Account sync remains authoritative. */ }
  }

  function removeLocal(key) {
    try { localStorage.removeItem(key); } catch { /* Nothing else is required. */ }
  }

  function localSnapshot() {
    return trainingStore.getState();
  }

  function applyRemoteState(remote) {
    const migrated = migrateTrainingState(remote);
    trainingStore.replace(migrated, 'remote-hydration');
    state.packing = migrated.packing;
    state.practice = migrated.practice;
    state.currentLesson = migrated.currentLesson;
    state.reflections = migrated.reflections;
    storeLocal('nightOpsState', JSON.stringify(state));
    refresh();
    if (location.hash === '#skill') {
      const activeSkill = skills.find(skill => state.currentLesson[skill.id] !== undefined);
      if (activeSkill) showSkill(activeSkill.id);
    }
  }

  async function syncTrainingNow() {
    if (!session?.user || remoteVersion === null || syncInFlight || pendingConflict) return;
    syncInFlight = true;
    const nextVersion = remoteVersion + 1;
    const { data, error } = await client
      .from('training_state')
      .update({ state: localSnapshot(), version: nextVersion })
      .eq('user_id', session.user.id)
      .eq('version', remoteVersion)
      .select('version')
      .maybeSingle();

    if (error) {
      syncInFlight = false;
      return displayError(error, 'Progress could not be synchronized.');
    }

    if (data) {
      remoteVersion = data.version;
      syncInFlight = false;
      setStatus('Progress saved.', 'success');
      return;
    }

    const { data: latest, error: latestError } = await client
      .from('training_state')
      .select('state,version')
      .eq('user_id', session.user.id)
      .single();
    syncInFlight = false;
    if (latestError) return displayError(latestError, 'Newer progress could not be loaded.');

    remoteVersion = latest.version;
    const local = localSnapshot();
    const merged = mergeTrainingStates(local, latest.state);
    if (merged.conflicts.length) {
      pendingConflict = { local, remote: migrateTrainingState(latest.state), merged: merged.state, conflicts: merged.conflicts };
      if (syncConflict) syncConflict.hidden = false;
      setStatus('Your notes changed on another device. Choose which version to keep.', 'error');
      return;
    }

    applyRemoteState(merged.state);
    scheduleTrainingSync();
  }

  function scheduleTrainingSync() {
    if (!session?.user) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncTrainingNow, 450);
  }

  const saveLocally = save;
  save = function saveWithAccountSync() {
    saveLocally();
    trainingStore.replace(state, 'legacy-save');
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
    const memberAdmin = document.querySelector('#member-admin');
    if (memberAdmin) memberAdmin.hidden = !isLead;
  }

  function renderAccount() {
    const authenticated = Boolean(session?.user && profile);
    if (signedOut) signedOut.hidden = authenticated || recoveryMode;
    if (signedIn) signedIn.hidden = !authenticated || recoveryMode;
    if (recovery) recovery.hidden = !recoveryMode;
    if (loginButton) loginButton.textContent = authenticated ? profile.display_name : 'Log in';

    state.profile = authenticated
      ? { name: profile.display_name, role: profile.role }
      : { name: '', role: 'member' };
    storeLocal('nightOpsProfile', JSON.stringify(state.profile));

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
    if (!authenticated) setAuthMode(authMode);
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
    await loadMemberProfiles();
  }

  async function loadMemberProfiles() {
    const list = document.querySelector('#member-admin-list');
    if (profile?.role !== 'lead') {
      memberProfiles = [];
      if (list) list.innerHTML = '';
      return;
    }
    const { data, error } = await client.from('profiles').select('id,display_name,role,created_at').order('display_name');
    if (error) return displayError(error, 'Member access could not be loaded.');
    memberProfiles = data || [];
    if (list) {
      list.innerHTML = memberProfiles.map(member => {
        const nextRole = member.role === 'lead' ? 'member' : 'lead';
        const action = member.role === 'lead' ? 'Remove lead access' : 'Make lead';
        return `<div class="member-row"><div><strong>${escapeHtml(member.display_name)}</strong><small>${member.role === 'lead' ? 'Night Ops lead' : 'Troop member'}</small></div><button data-set-member-role="${member.id}|${nextRole}">${action}</button></div>`;
      }).join('') || '<p class="muted">No members yet.</p>';
    }
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
      remoteVersion = null;
      pendingConflict = null;
      if (syncConflict) syncConflict.hidden = true;
      renderAccount();
      renderSharedData();
      return;
    }

    const [{ data: profileData, error: profileError }, { data: trainingData, error: trainingError }] = await Promise.all([
      client.from('profiles').select('id,display_name,role').eq('id', session.user.id).single(),
      client.from('training_state').select('state,version').eq('user_id', session.user.id).single()
    ]);

    if (profileError || trainingError) {
      displayError(profileError || trainingError, 'Your account could not be loaded.');
      profile = null;
      renderAccount();
      return;
    }

    profile = profileData;
    remoteVersion = trainingData.version;
    const remote = trainingData?.state || {};
    const local = localSnapshot();
    if (!hasTrainingProgress(remote) && hasTrainingProgress(local)) await syncTrainingNow();
    else {
      const merged = mergeTrainingStates(local, remote);
      if (merged.conflicts.length) {
        pendingConflict = { local, remote: migrateTrainingState(remote), merged: merged.state, conflicts: merged.conflicts };
        if (syncConflict) syncConflict.hidden = false;
      } else {
        applyRemoteState(merged.state);
        if (JSON.stringify(merged.state) !== JSON.stringify(migrateTrainingState(remote))) scheduleTrainingSync();
      }
    }

    renderAccount();
    await loadSharedData();
    if (!pendingConflict) setStatus('Your progress is synchronized.', 'success');
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

  async function updateRecoveredPassword() {
    const password = document.querySelector('#recovery-password')?.value || '';
    const confirmation = document.querySelector('#recovery-confirm')?.value || '';
    if (password.length < 8) return setStatus('Use a password of at least eight characters.', 'error');
    if (password !== confirmation) return setStatus('The passwords do not match.', 'error');
    const { error } = await client.auth.updateUser({ password });
    if (error) return displayError(error, 'The password could not be updated.');
    recoveryMode = false;
    renderAccount();
    setStatus('Your password was updated.', 'success');
  }

  function exportAccountData() {
    if (!session?.user || !profile) return;
    const data = {
      exportedAt: new Date().toISOString(),
      account: { email: session.user.email, displayName: profile.display_name, role: profile.role },
      training: localSnapshot()
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `night-ops-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Your Night Ops data was downloaded.', 'success');
  }

  async function deleteAccount() {
    const confirmation = document.querySelector('#delete-confirmation')?.value.trim();
    if (confirmation !== 'DELETE') return setStatus('Type DELETE exactly before deleting the account.', 'error');
    setStatus('Deleting account…');
    const { error } = await client.functions.invoke('account-admin', { body: { action: 'delete_self' } });
    if (error) return displayError(error, 'The account could not be deleted.');
    await client.auth.signOut({ scope: 'local' });
    removeLocal('nightOpsState');
    removeLocal('nightOpsProfile');
    trainingStore.replace({}, 'account-deleted');
    route('home');
    setStatus('Your account and saved progress were deleted.', 'success');
  }

  async function setMemberRole(value) {
    if (profile?.role !== 'lead') return setStatus('Lead access is required.', 'error');
    const [targetId, role] = value.split('|');
    if (!targetId || !['member', 'lead'].includes(role)) return;
    setStatus('Updating member access…');
    const { data, error } = await client.functions.invoke('account-admin', {
      body: { action: 'set_role', targetId, role }
    });
    if (error) return displayError(error, 'Member access could not be updated.');
    if (targetId === session?.user?.id && data?.profile) {
      profile = data.profile;
      renderAccount();
      setLeaderControls();
    }
    await loadMemberProfiles();
    setStatus('Member access updated.', 'success');
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

  function resolveSyncConflict(preferLocal) {
    if (!pendingConflict) return;
    const resolved = structuredClone(pendingConflict.merged);
    for (const conflict of pendingConflict.conflicts) {
      const key = conflict.field.replace('reflections.', '');
      resolved.reflections[key] = preferLocal ? conflict.local : conflict.remote;
    }
    pendingConflict = null;
    if (syncConflict) syncConflict.hidden = true;
    applyRemoteState(resolved);
    setStatus(preferLocal ? 'This device’s notes were kept.' : 'The saved notes were kept.', 'success');
    scheduleTrainingSync();
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
    setAuthMode(gateAction.matches('[data-gate-create]') ? 'sign-up' : 'sign-in');
    route('settings');
    const target = gateAction.matches('[data-gate-create]') ? '#auth-display-name' : '#auth-email';
    setTimeout(() => document.querySelector(target)?.focus(), 0);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    if (event.target.matches('#auth-email, #auth-password, #auth-display-name')) {
      event.preventDefault();
      if (authMode === 'sign-up') signUp();
      else signIn();
    }
    if (event.target.matches('#recovery-password, #recovery-confirm')) {
      event.preventDefault();
      updateRecoveredPassword();
    }
  });

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-auth-mode], [data-auth-sign-in], [data-auth-sign-up], [data-auth-sign-out], [data-auth-reset], [data-auth-update-password], [data-save-account-profile], [data-export-account], [data-delete-account], [data-sync-keep-local], [data-sync-keep-remote]');
    if (!action) return;
    event.preventDefault();
    if (action.matches('[data-auth-mode]')) setAuthMode(action.dataset.authMode);
    if (action.matches('[data-auth-sign-in]')) signIn();
    if (action.matches('[data-auth-sign-up]')) signUp();
    if (action.matches('[data-auth-sign-out]')) client.auth.signOut();
    if (action.matches('[data-auth-reset]')) resetPassword();
    if (action.matches('[data-auth-update-password]')) updateRecoveredPassword();
    if (action.matches('[data-save-account-profile]')) saveDisplayName();
    if (action.matches('[data-export-account]')) exportAccountData();
    if (action.matches('[data-delete-account]')) deleteAccount();
    if (action.matches('[data-sync-keep-local]')) resolveSyncConflict(true);
    if (action.matches('[data-sync-keep-remote]')) resolveSyncConflict(false);
  });

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-add-announcement], [data-add-question], [data-add-training], [data-backend-delete], [data-set-member-role]');
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (action.matches('[data-add-announcement]')) addAnnouncement();
    if (action.matches('[data-add-question]')) addQuestion();
    if (action.matches('[data-add-training]')) addEvent();
    if (action.dataset.backendDelete) deleteSharedItem(action.dataset.backendDelete);
    if (action.dataset.setMemberRole) setMemberRole(action.dataset.setMemberRole);
  }, true);

  client.auth.onAuthStateChange((event, nextSession) => {
    session = nextSession;
    if (event === 'PASSWORD_RECOVERY') recoveryMode = true;
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
