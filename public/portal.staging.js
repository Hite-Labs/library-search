(function () {
  'use strict';

  var API_URL = 'https://dashboard.showyourspark.com/api/portal';

  // Plan registry — the browser half of lib/memberstack.ts's PLAN_KEYS. One entry per
  // plan: its Memberstack id, the Webflow element ids/fields it controls, and whether the
  // member holds it. Adding a plan is an entry here plus the matching Webflow elements.
  //
  // Replaces a pair of module-level booleans that initTabs and gateAndLoad each branched on
  // separately, which is what made a third panel impossible without rewriting both.
  var PLANS = [
    {
      key: 'individual',
      planId: 'pln_individual-coaching-nkaa080g',
      panelId: 'portal-coaching',
      tabField: 'tab-individual',
      has: false
    },
    {
      key: 'cohort',
      planId: 'pln_cohort-qbab0892',
      panelId: 'portal-cohort',
      tabField: 'tab-cohort',
      has: false
    },
    {
      // The 21-day challenge. Unlike the two above, this plan is bought directly (or comes
      // bundled with the audio membership) rather than being attached when a coach enrols
      // someone — so holding it IS the entitlement, with no dashboard enrollment behind it.
      // TODO: set planId once the Memberstack plan exists. Until then heldPlans() never
      // includes it, so the panel stays hidden and nothing else is affected.
      key: 'challenge',
      planId: 'pln_challenge-REPLACE_ME',
      panelId: 'portal-challenge',
      tabField: 'tab-challenge',
      has: false
    },
    {
      // SYS Society, the audio membership. The first plan here with no panel of its own:
      // it unlocks content elsewhere on the page rather than a tab, and is tracked so promo
      // gating can tell a member who already bought it from one who hasn't.
      //
      // panelId/tabField are null rather than omitted, and the two places that assume a
      // panel skip entries without one — so a member holding only this plan still sees the
      // upsell, and a cohort member who buys it doesn't get a tab header pointing at a
      // panel that isn't on the page.
      //
      // `key` must match the server's PlanKey exactly: promos compare hide_if_has against
      // it, and a mismatch would silently never match, showing the offer to everyone.
      key: 'membership',
      planId: 'pln_sys-society-6h2m809m5',
      panelId: null,
      tabField: null,
      has: false
    }
  ];

  /** Plans with a panel of their own — the ones tabs and the upsell gate care about. */
  function panelPlans() {
    var out = [];
    for (var i = 0; i < PLANS.length; i++) {
      if (PLANS[i].panelId) out.push(PLANS[i]);
    }
    return out;
  }

  function planByKey(key) {
    for (var i = 0; i < PLANS.length; i++) {
      if (PLANS[i].key === key) return PLANS[i];
    }
    return null;
  }

  function hasPlan(key) {
    var p = planByKey(key);
    return !!(p && p.has);
  }

  function heldPlans() {
    var out = [];
    for (var i = 0; i < PLANS.length; i++) {
      if (PLANS[i].has) out.push(PLANS[i]);
    }
    return out;
  }

  function byField(name) {
    return document.querySelector('[data-field="' + name + '"]');
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (el) el.style.display = '';
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  function eachEl(selector, fn) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) fn(nodes[i]);
  }

  function setField(root, name, value) {
    var el =
      root.querySelector('[data-field="' + name + '"]') ||
      root.querySelector('.' + name) ||
      root.querySelector('#' + name);
    if (el) el.textContent = value == null ? '' : String(value);
  }

  // Multi-match on purpose. Webflow duplicates elements for its mobile layout, so a
  // querySelector here set the href on the desktop copy only and the mobile Zoom/Telegram
  // links stayed dead. Same reasoning as eachEl above. Both callers pass `document`;
  // a root-scoped caller would still behave correctly, just with one match.
  function setLink(root, name, url) {
    if (!url) return;
    var nodes = root.querySelectorAll('[data-field="' + name + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].setAttribute('href', url);
  }

  function formatDate(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Short date ("June 3") for recording/file cards, where the year is noise — these are
   * recent items and the card has little room. Session dates keep the long form.
   */
  function formatDateShort(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }

  /**
   * Iconoir (https://iconoir.com) glyphs, inlined so the portal carries no CDN or font
   * dependency — a blocked stylesheet would otherwise silently strip every icon.
   * Keyed by media_type, which the DB constrains to exactly these three values, so an
   * unknown type simply renders no icon rather than a broken one.
   *
   * Strokes are hardcoded white for the portal's dark card background. They were
   * `currentColor`, but nothing set `color` on the wrapper so the icons rendered
   * invisible. To recolour, change the hex here — a CSS `color` rule will NOT affect
   * these, which is the tradeoff for them working without any Webflow styling at all.
   */
  var MEDIA_ICONS = {
    audio:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4"/><path d="M8 23h8"/></svg>',
    video:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z"/>' +
      '<path d="M15 11l6.4-3.2a.5.5 0 0 1 .7.4v7.6a.5.5 0 0 1-.7.4L15 13v-2z"/></svg>',
    pdf:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 3a1 1 0 0 1 1-1h9l6 6v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3z"/>' +
      '<path d="M14 2v6h6"/></svg>'
  };

  /**
   * Paint the media icon for a card. Also stamps data-media-type on the element so
   * Webflow can style per type (size, colour, spacing) without this script knowing how.
   */
  function setIcon(root, name, mediaType) {
    var el = root.querySelector('[data-field="' + name + '"]');
    if (!el) return;
    var svg = MEDIA_ICONS[mediaType];
    el.setAttribute('data-media-type', mediaType || '');
    el.innerHTML = svg || '';
  }

  function hideAll() {
    [
      'ind-goal',
      'ind-sessions-list',
      'ind-sessions-empty',
      'ind-recordings-list',
      'ind-recordings-empty',
      'ind-files-list',
      'ind-files-empty',
      'cohort-my-goal',
      'cohort-sessions-list',
      'cohort-sessions-empty',
      'cohort-files-list',
      'cohort-files-empty',
      'cohort-my-files-list',
      'cohort-my-files-empty'
    ].forEach(function (name) {
      hide(byField(name));
    });
    eachEl('[data-field="ind-sessions-completed"]', hide);
    eachEl('[data-field="ind-sessions-total"]', hide);
    eachEl('[data-field="ind-next-session-display"]', hide);
    eachEl('[data-field="ind-next-session-schedule"]', hide);
    eachEl('[data-field="cohort-session-display"]', hide);
    eachEl('[data-field="cohort-sessions-completed"]', hide);
    eachEl('[data-field="cohort-sessions-total"]', hide);
    // Challenge day blocks are hidden up front too: they are authored in Webflow and would
    // otherwise all be visible for the moment before the API answers — briefly showing
    // day 21 to someone on day 2.
    eachEl('[data-challenge-day]', hide);
    eachEl('[data-challenge-state]', hide);
    eachEl('[data-field="challenge-name"]', hide);
    eachEl('[data-field="challenge-current-day"]', hide);
    eachEl('[data-field="challenge-total-days"]', hide);
    eachEl('[data-field="challenge-starts-at"]', hide);
    eachEl('[data-field="challenge-closes-at"]', hide);
  }

  function showError(message) {
    var errorEl = byField('portal-error');
    if (errorEl) {
      var msgEl = errorEl.querySelector('[data-field="message"]');
      if (msgEl && message) msgEl.textContent = message;
      show(errorEl);
    } else {
      console.error('[portal] ' + (message || 'Unable to load portal data.'));
    }
  }

  // ===== Media modal (unchanged) =====

  function openModal(title, url, fileType) {
    var modal = byField('media-modal');
    var modalTitle = byField('modal-title');
    var videoWrap = byField('modal-video');
    var audioWrap = byField('modal-audio');
    var videoEl = document.querySelector('[data-field="modal-video-player"]');
    var audioEl = document.querySelector('[data-field="modal-audio-player"]');
    var downloadEl = byField('modal-download');

    if (modalTitle) modalTitle.textContent = title || '';

    hide(videoWrap);
    hide(audioWrap);

    if (fileType === 'video' && videoEl) {
      videoEl.src = url;
      if (videoWrap) videoWrap.style.display = 'block';
    } else if (fileType === 'audio' && audioEl) {
      audioEl.src = url;
      if (audioWrap) audioWrap.style.display = 'block';
    }

    if (downloadEl) {
      downloadEl.setAttribute('href', url);
    }

    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    var modal = byField('media-modal');
    var videoEl = document.querySelector('[data-field="modal-video-player"]');
    var audioEl = document.querySelector('[data-field="modal-audio-player"]');

    if (videoEl) { videoEl.pause(); videoEl.src = ''; }
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }

    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function initModal() {
    var closeBtn = byField('modal-close');
    var modal = byField('media-modal');

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ===== Tab header (new) =====

  function initTabs() {
    var tabsHeader = byField('plan-tabs-header');

    // Only plans with a panel can be tabbed to. Counting the audio membership here would
    // give a cohort member who buys it a two-tab header whose second tab points at nothing.
    var held = heldPlans().filter(function (p) { return !!p.panelId; });

    // Show tabs whenever the member holds MORE THAN ONE panel — previously this required
    // holding BOTH of exactly two, so a member with any other combination would have got no
    // tab header at all and no way to reach their second panel.
    if (held.length < 2) {
      hide(tabsHeader);
      return;
    }

    show(tabsHeader);

    function activate(key) {
      // Only switch to a panel the member actually holds.
      if (!hasPlan(key)) return;

      // Hide every panel, then show the one asked for. The old version was an if/else over
      // two panels, whose else-branch meant any unrecognised key showed the cohort panel.
      for (var i = 0; i < PLANS.length; i++) {
        var p = PLANS[i];
        var panel = byId(p.panelId);
        if (panel) panel.style.display = p.key === key ? 'block' : 'none';
        var tab = byField(p.tabField);
        if (tab) tab.classList.toggle('is-active', p.key === key);
      }
    }

    for (var i = 0; i < held.length; i++) {
      (function (p) {
        var tab = byField(p.tabField);
        if (tab) {
          tab.addEventListener('click', function () { activate(p.key); });
        }
      })(held[i]);
    }

    // Default to the first plan the member actually holds, in registry order. Was hardcoded
    // to 'individual', which the guard then rejected for a cohort-only member — leaving no
    // tab visually active.
    activate(held[0].key);
  }

  // ===== Individual coaching render (unchanged) =====

  function renderNextSession(value) {
    if (!value || isNaN(new Date(value).getTime())) {
      eachEl('[data-field="ind-next-session-display"]', hide);
      eachEl('[data-field="ind-next-session-schedule"]', show);
      return;
    }

    var d = new Date(value);

    eachEl('[data-field="ind-next-session-date"]', function (el) {
      el.textContent = d.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric'
      });
    });

    eachEl('[data-field="ind-next-session-time"]', function (el) {
      el.textContent = d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    });

    eachEl('[data-field="ind-next-session-display"]', show);
    eachEl('[data-field="ind-next-session-schedule"]', hide);
  }

  function renderClient(client) {
    client = client || {};

    var goalEl = byField('ind-goal');
    if (goalEl) {
      goalEl.textContent = client.goal || '';
      show(goalEl);
    }

    var doneText =
      client.sessions_done == null ? '0' : String(client.sessions_done);
    eachEl('[data-field="ind-sessions-completed"]', function (el) {
      el.textContent = doneText;
      show(el);
    });

    var totalText =
      client.total_sessions == null ? '0' : String(client.total_sessions);
    eachEl('[data-field="ind-sessions-total"]', function (el) {
      el.textContent = totalText;
      show(el);
    });

    // Point the schedule CTA at this client's booking link (their own, else the global
    // one — the API applies that precedence). setLink no-ops on a falsy url, so when the
    // API sends null the button keeps whatever href Webflow authored on it.
    setLink(document, 'ind-next-session-schedule', client.calendar_url);
    setLink(document, 'ind-schedule-link', client.calendar_url);

    renderNextSession(client.next_session_at);
  }

  function renderList(listEl, emptyEl, items, fill) {
    items = items || [];

    if (!listEl) return;

    var template = listEl.firstElementChild;
    if (!template) {
      hide(listEl);
      show(emptyEl);
      return;
    }

    template.style.display = 'none';

    if (!items.length) {
      hide(listEl);
      show(emptyEl);
      return;
    }

    while (listEl.children.length > 1) {
      listEl.removeChild(listEl.lastChild);
    }

    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      var card = template.cloneNode(true);
      card.removeAttribute('id');
      card.style.display = '';
      fill(card, item);
      fragment.appendChild(card);
    });
    listEl.appendChild(fragment);

    hide(emptyEl);
    show(listEl);
  }

  function fillSessionCard(card, session) {
    setField(card, 'ind-session-number', session.session_number);
    setField(card, 'ind-session-date', formatDate(session.session_date));
    setField(card, 'ind-session-notes', session.next_actions);
  }

  function fillRecordingCard(card, recording) {
    setField(card, 'ind-recording-title', recording.title);
    setField(card, 'ind-recording-label', recording.session_label || '');
    setField(card, 'ind-recording-date', formatDateShort(recording.recorded_at));

    var url = recording.public_url || '';
    var fileType = recording.file_type || 'video';
    var title = recording.title || '';

    // Deliberately the RAW file_type, not the 'video'-defaulted one above: that default
    // exists only to pick modal-vs-new-tab, and using it here would stamp a video icon on
    // every item whose type is missing — a confident wrong answer instead of no answer.
    setIcon(card, 'ind-recording-icon', recording.file_type);

    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      if (fileType === 'pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        openModal(title, url, fileType);
      }
    });
  }

  function fillFileCard(card, file) {
    setField(card, 'ind-file-title', file.title);
    setField(card, 'ind-file-description', file.description || '');
    setField(card, 'ind-file-date', formatDateShort(file.uploaded_at));

    var url = file.public_url || '';
    var fileType = file.file_type || 'audio';
    var title = file.title || '';

    // Raw file_type, not the 'audio'-defaulted one — see fillRecordingCard.
    setIcon(card, 'ind-file-icon', file.file_type);

    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      if (fileType === 'pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        openModal(title, url, fileType);
      }
    });
  }

  // ===== Cohort render (new) =====

  // A session is locked until its own date passes, UNLESS the cohort's
  // end date has passed, in which case everything unlocks regardless.
  //
  // The API is now authoritative: it sends `locked` per session and withholds the recording
  // URL and file list for locked ones, so a locked session cannot be played even by reading
  // the response directly. This function remains for presentation — deciding which DOM row
  // to show — and as a fallback for a cached script talking to an older payload.
  //
  // Fails closed: a missing or unparseable session_date leaves the session locked.
  function isCohortSessionLocked(session, cohort) {
    if (typeof session.locked === 'boolean') return session.locked;

    var today = new Date();

    var cohortEnd = cohort && cohort.end_date ? new Date(cohort.end_date) : null;
    if (cohortEnd && !isNaN(cohortEnd.getTime()) && today >= cohortEnd) {
      return false;
    }

    var unlockDate = session.session_date ? new Date(session.session_date) : null;
    if (!unlockDate || isNaN(unlockDate.getTime())) return true;

    return today < unlockDate;
  }

  function fillCohortSessionCard(card, session, cohort) {
    setField(card, 'cohort-session-number', 'Session ' + session.session_number);
    setField(card, 'cohort-session-title', session.title || '');
    setField(card, 'cohort-session-prompt', session.prompt_text || '');

    var lockedRow = card.querySelector('[data-field="cohort-session-locked"]');
    var unlockedRow = card.querySelector('[data-field="cohort-session-unlocked"]');
    var locked = isCohortSessionLocked(session, cohort);

    if (locked) {
      show(lockedRow);
      hide(unlockedRow);
      card.style.cursor = '';
    } else {
      hide(lockedRow);
      show(unlockedRow);
      setField(card, 'cohort-session-date', formatDate(session.session_date));

      var url = session.recording_url || '';
      var fileType = session.file_type || 'video';
      var title = session.title || ('Session ' + session.session_number);

      if (url) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', function () {
          if (fileType === 'pdf') {
            window.open(url, '_blank', 'noopener,noreferrer');
          } else {
            openModal(title, url, fileType);
          }
        });
      }
    }
  }

  function fillCohortFileCard(card, file) {
    setField(card, 'cohort-file-title', file.title);
    setField(card, 'cohort-file-description', file.description || '');
    setField(card, 'cohort-file-date', formatDateShort(file.uploaded_at));

    var url = file.public_url || '';
    var fileType = file.file_type || 'audio';
    var title = file.title || '';

    // Raw file_type, not the 'audio'-defaulted one — see fillRecordingCard.
    setIcon(card, 'cohort-file-icon', file.file_type);

    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      if (fileType === 'pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        openModal(title, url, fileType);
      }
    });
  }

  function fillCohortMyFileCard(card, file) {
    setField(card, 'cohort-my-file-title', file.title);
    setField(card, 'cohort-my-file-description', file.description || '');
    setField(card, 'cohort-my-file-date', formatDateShort(file.uploaded_at));

    var url = file.public_url || '';
    var fileType = file.file_type || 'audio';
    var title = file.title || '';

    // Raw file_type, not the 'audio'-defaulted one — see fillRecordingCard.
    setIcon(card, 'cohort-my-file-icon', file.file_type);

    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      if (fileType === 'pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        openModal(title, url, fileType);
      }
    });
  }

  // The cohort's next session is derived, not a stored field: the earliest scheduled
  // session still in the future. Mirrors renderNextSession on the individual side, but
  // there's no "schedule a session" counterpart — cohort dates are fixed by the coach,
  // so when nothing is upcoming the whole block simply hides.
  function renderCohortNextSession(sessions) {
    var now = new Date();
    var next = null;

    (sessions || []).forEach(function (s) {
      if (!s.session_date) return;
      var d = new Date(s.session_date);
      if (isNaN(d.getTime()) || d < now) return;
      if (!next || d < next) next = d;
    });

    if (!next) {
      eachEl('[data-field="cohort-session-display"]', hide);
      return;
    }

    eachEl('[data-field="cohort-next-session-date"]', function (el) {
      el.textContent = next.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric'
      });
    });

    eachEl('[data-field="cohort-next-session-time"]', function (el) {
      el.textContent = next.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    });

    eachEl('[data-field="cohort-session-display"]', show);
  }

  function renderCohort(cohort) {
    if (!cohort) return;
    cohort = cohort || {};

    var goalEl = byField('cohort-my-goal');
    if (goalEl) {
      goalEl.textContent = cohort.member_goal || '';
      show(goalEl);
    }

    var cohortDone =
      cohort.sessions_done == null ? '0' : String(cohort.sessions_done);
    eachEl('[data-field="cohort-sessions-completed"]', function (el) {
      el.textContent = cohortDone;
      show(el);
    });

    var cohortTotal =
      cohort.total_sessions == null ? '0' : String(cohort.total_sessions);
    eachEl('[data-field="cohort-sessions-total"]', function (el) {
      el.textContent = cohortTotal;
      show(el);
    });

    renderCohortNextSession(cohort.sessions);

    setLink(document, 'cohort-zoom-link', cohort.zoom_link);
    setLink(document, 'cohort-telegram-link', cohort.telegram_link);

    renderList(
      byField('cohort-sessions-list'),
      byField('cohort-sessions-empty'),
      cohort.sessions,
      function (card, session) {
        fillCohortSessionCard(card, session, cohort);
      }
    );

    renderList(
      byField('cohort-files-list'),
      byField('cohort-files-empty'),
      cohort.files,
      fillCohortFileCard
    );

    renderList(
      byField('cohort-my-files-list'),
      byField('cohort-my-files-empty'),
      cohort.my_files,
      fillCohortMyFileCard
    );
  }

  function render(data) {
    data = data || {};

    if (data.client) renderClient(data.client);

    renderList(
      byField('ind-sessions-list'),
      byField('ind-sessions-empty'),
      data.sessions,
      fillSessionCard
    );
    renderList(
      byField('ind-recordings-list'),
      byField('ind-recordings-empty'),
      data.recordings,
      fillRecordingCard
    );
    renderList(
      byField('ind-files-list'),
      byField('ind-files-empty'),
      data.files,
      fillFileCard
    );

    if (data.cohort) renderCohort(data.cohort);

    renderChallenge(data.challenge);
    renderPromos(data.promo_codes);
  }

  // ===== 21-day challenge =====

  // Like promos, the content is authored entirely in Webflow: Lindsay builds all 21 day
  // blocks on the page, each marked data-challenge-day="4". This script only reveals the
  // days the API says are unlocked, and hides the rest.
  //
  // The server decides. It sends `unlocked_days` and nothing else about the schedule, so a
  // locked day's content is never in the response to begin with — the same lesson the
  // cohort session lock had to learn, where hiding a row client-side still shipped the
  // recording URL to anyone reading the network tab.
  //
  // eachEl throughout, never byField: Webflow duplicates elements for mobile.
  function renderChallenge(challenge) {
    // Not entitled — no challenge plan at all. Hide everything challenge-related.
    if (!challenge) {
      eachEl('[data-challenge-day]', hide);
      eachEl('[data-challenge-state]', hide);
      return;
    }

    var state = challenge.state || 'none';
    var unlocked = challenge.unlocked_days || [];

    // Webflow authors one block per state — data-challenge-state="finished" and so on —
    // and exactly one shows. This is what keeps a finished run from going blank: the
    // account is permanent and nothing is ever revoked, so a member who has just finished
    // 21 days lands on "that run is over, here's what's next" rather than an empty panel.
    // That moment is the best upsell in the product.
    eachEl('[data-challenge-state]', function (el) {
      if (el.getAttribute('data-challenge-state') === state) show(el);
      else hide(el);
    });

    // Days only exist while the run is live. Every other state carries none, so this
    // hides them all without needing to special-case each one.
    eachEl('[data-challenge-day]', function (el) {
      var n = parseInt(el.getAttribute('data-challenge-day'), 10);
      // A non-numeric or unlisted day stays hidden. Fails closed, so a typo in the Webflow
      // attribute costs a hidden day rather than revealing day 21 on day one.
      if (!isNaN(n) && unlocked.indexOf(n) !== -1) show(el);
      else hide(el);
    });

    eachEl('[data-field="challenge-name"]', function (el) {
      el.textContent = challenge.name || '';
      show(el);
    });
    eachEl('[data-field="challenge-current-day"]', function (el) {
      el.textContent = challenge.current_day == null ? '' : String(challenge.current_day);
      show(el);
    });
    eachEl('[data-field="challenge-total-days"]', function (el) {
      el.textContent = challenge.total_days == null ? '' : String(challenge.total_days);
      show(el);
    });
    eachEl('[data-field="challenge-starts-at"]', function (el) {
      el.textContent = formatDate(challenge.starts_at);
      show(el);
    });
    eachEl('[data-field="challenge-closes-at"]', function (el) {
      el.textContent = formatDate(challenge.closes_at);
      show(el);
    });

    setLink(document, 'challenge-telegram-link', challenge.telegram_link);
  }

  // ===== Promo blocks =====

  // A promo block is authored entirely in Webflow: its image, copy, layout and hardcoded
  // button all live there, and this script never writes a word of it. Lindsay marks the
  // element data-promo="cohort-upsell" and the dashboard holds a rule for that code.
  //
  // All this does is reveal the blocks whose code the API returned, and hide the rest.
  //
  // Hiding the rest is the load-bearing half. Anything without a matching live rule stays
  // hidden, so a mistyped attribute costs an impression — which Lindsay notices — rather
  // than showing a cohort offer to someone who already bought the cohort, which nobody
  // notices. It also means the blocks are hidden by default without Webflow having to set
  // that up, and re-running is idempotent.
  //
  // The decision is the API's, not this script's. portal.js and the server deliberately
  // disagree about plan detection (see gateAndLoad: $memberstackDom's `active` is trusted
  // only when explicitly false), and the server is authoritative — so it sends codes, not
  // rules, and the client never learns which plan a promo targets.
  //
  // eachEl, not byField: Webflow duplicates elements for its mobile layout, and byField is
  // a single-match querySelector. That exact bug already shipped once on the Zoom and
  // Telegram links (see setLink).
  function renderPromos(codes) {
    codes = codes || [];
    eachEl('[data-promo]', function (el) {
      var code = el.getAttribute('data-promo');
      if (code && codes.indexOf(code) !== -1) show(el);
      else hide(el);
    });
  }

  // ===== Buy the audio membership, without leaving the page =====

  // The Stripe price for SYS Society. A price id, not a plan id — checkout is priced, and
  // purchasePlansWithCheckout takes prc_*, while the PLANS registry above matches pln_*.
  // They are different identifiers for the same product and are not interchangeable.
  var SYS_SOCIETY_PRICE_ID = 'prc_founding-member-launch-hj3n0e5z';

  /**
   * Wire the promo card's buy button to Memberstack checkout.
   *
   * The button is deliberately NOT a data-ms-price attribute in Webflow: that would hand
   * the element to Memberstack's own click handler, competing with the show/hide the rest
   * of this file does. Driving it here keeps one owner.
   *
   * Called once from init(), never from renderPromos — that runs on every load, and
   * re-binding would stack listeners and fire checkout several times per click.
   *
   * Note purchasePlansWithCheckout does nothing at all for a logged-out visitor. Inside the
   * portal that is fine, since gateAndLoad has already resolved a member before init runs.
   * A public page needs the save-price-then-resume-after-login dance instead.
   */
  function initBuyButtons() {
    // eachEl, not byField: Webflow duplicates elements for its mobile layout, and a
    // single-match querySelector would leave the mobile button dead. Same bug as setLink.
    eachEl('[data-field="sys-society-buy-button"]', function (btn) {
      btn.addEventListener('click', function (e) {
        // The button is an anchor in Webflow; without this the page navigates away mid-checkout.
        e.preventDefault();

        if (!window.$memberstackDom || !window.$memberstackDom.purchasePlansWithCheckout) {
          console.error('[portal] Memberstack checkout is unavailable.');
          return;
        }

        window.$memberstackDom
          .purchasePlansWithCheckout({
            priceId: SYS_SOCIETY_PRICE_ID,
            returnUrl: window.location.href
          })
          .catch(function (err) {
            console.error('[portal] audio membership checkout failed:', err);
          });
      });
    });
  }

  function loadPortal(token) {
    if (!token) {
      showError('You must be signed in to view your portal.');
      return;
    }

    fetch(API_URL, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json'
      }
    })
      .then(function (response) {
        if (response.status === 401) {
          throw new PortalError('Your session has expired. Please sign in again.');
        }
        // The API no longer 404s for a member without a client record — that member is the
        // upsell audience and gets an empty payload with promos instead. This branch stays
        // as a fallback for a genuine missing route or an older deployment.
        if (response.status === 404) {
          throw new PortalError(
            'We couldn\'t find your coaching portal. Please contact your coach.'
          );
        }
        if (!response.ok) {
          throw new PortalError('Something went wrong loading your portal.');
        }
        return response.json();
      })
      .then(function (data) {
        render(data);
      })
      .catch(function (err) {
        showError(
          err && err.isPortalError
            ? err.message
            : 'Something went wrong loading your portal.'
        );
        if (!(err && err.isPortalError)) console.error('[portal]', err);
      });
  }

  function PortalError(message) {
    this.message = message;
    this.isPortalError = true;
  }
  PortalError.prototype = Object.create(Error.prototype);

  function init() {
    hideAll();
    initModal();
    initTabs();
    initBuyButtons();

    if (!window.$memberstackDom || !window.$memberstackDom.getMemberCookie) {
      showError('Membership service is unavailable. Please try again later.');
      console.error('[portal] window.$memberstackDom.getMemberCookie is not available.');
      return;
    }

    var token = window.$memberstackDom.getMemberCookie();

    if (token && typeof token === 'string') {
      loadPortal(token);
    } else {
      Promise.resolve(token)
        .then(function (resolvedToken) {
          loadPortal(resolvedToken);
        })
        .catch(function (err) {
          showError('Membership service is unavailable. Please try again later.');
          console.error('[portal] getMemberCookie() rejected:', err);
        });
    }
  }

  function gateAndLoad() {
    window.$memberstackDom.getCurrentMember().then(function (result) {
      try {
        var member = result && result.data;

        // FIX: the gate containers are IDs in Webflow, not data-field attributes.
        var upsell = byId('portal-upsell');
        var i;

        if (upsell) upsell.style.display = 'none';
        for (i = 0; i < PLANS.length; i++) {
          var panelEl = byId(PLANS[i].panelId);
          if (panelEl) panelEl.style.display = 'none';
        }

        if (!member) {
          if (upsell) upsell.style.display = 'block';
          return;
        }

        // Only ACTIVE, non-terminal connections count. Memberstack keeps cancelled and
        // expired connections on the member, so a plain planId check kept showing paid
        // panels to someone whose plan had lapsed — and disagreed with the server and
        // /reconcile, which both filter them out (see lib/memberstack.ts).
        // A lapsed member keeps their account and simply sees the upsell again.
        // Note the asymmetry with the server (lib/memberstack.ts), which requires
        // active === true. That's the Admin SDK, where `active` is a documented boolean.
        // This is $memberstackDom, a different SDK whose payload we can't verify from the
        // repo — so treat `active` as disqualifying only when it is EXPLICITLY false. If the
        // DOM SDK omits the field, members keep access rather than all being locked out;
        // the server-side gate in /api/portal is the authoritative check either way.
        var conns = member.planConnections || [];
        var plans = [];
        for (var ci = 0; ci < conns.length; ci++) {
          var conn = conns[ci];
          if (!conn || !conn.planId) continue;
          if (conn.active === false) continue;
          if (/cancel|expired/i.test(conn.status || '')) continue;
          plans.push(conn.planId);
        }

        // Resolve every plan from the registry rather than two hardcoded lookups.
        for (i = 0; i < PLANS.length; i++) {
          PLANS[i].has = plans.indexOf(PLANS[i].planId) !== -1;
        }

        // The upsell asks "is any PANEL going to appear?", not "does this member hold
        // anything". A member whose only plan is the audio membership reveals no panel, so
        // counting it here would hide the upsell and leave them looking at an empty page.
        var panelled = panelPlans();
        var anyHeld = false;
        for (i = 0; i < panelled.length; i++) {
          if (panelled[i].has) anyHeld = true;
        }

        // No plans at all is not an error state — it is the funnel. The member keeps their
        // account and sees the upsell, which is how they buy their way in.
        //
        // Note this does NOT return early any more. It used to, which meant the one member
        // who most needs to see an offer never loaded any data — and so never got a promo.
        // init() still runs; the panels stay hidden because none are held, and the fetch
        // exists to populate the upsell.
        if (!anyHeld && upsell) upsell.style.display = 'block';

        for (i = 0; i < PLANS.length; i++) {
          if (!PLANS[i].has) continue;
          var held = byId(PLANS[i].panelId);
          if (held) held.style.display = 'block';
        }

        // Single fetch drives every panel — init() handles tabs + data load + promos
        init();
      } catch (err) {
        console.error('[portal] gateAndLoad inner error:', err);
        showError('Something went wrong loading your portal.');
      }
    }).catch(function (err) {
      console.error('[portal] getCurrentMember() rejected:', err);
      showError('Something went wrong loading your portal.');
    });
  }

  /**
   * Wait for Memberstack before doing anything.
   *
   * gateAndLoad() calls window.$memberstackDom.getCurrentMember() on its first line, and
   * used to run straight off DOMContentLoaded. Memberstack attaches $memberstackDom from
   * its own async script, which frequently lands AFTER DOMContentLoaded — so the very
   * first statement threw TypeError on undefined, outside the try/catch that guards the
   * body, and the page sat there with nothing shown and no message. Load order on the
   * Webflow page decided whether the portal worked, which is why it could look fine one
   * reload and dead the next.
   *
   * Polling rather than an event: Memberstack exposes no documented ready hook, and this
   * is the same approach their own snippets use.
   */
  var MS_POLL_MS = 100;
  var MS_TIMEOUT_MS = 10000;

  function whenMemberstackReady(callback) {
    var waited = 0;
    (function check() {
      if (window.$memberstackDom && window.$memberstackDom.getCurrentMember) {
        callback();
        return;
      }
      waited += MS_POLL_MS;
      if (waited >= MS_TIMEOUT_MS) {
        // Say so rather than failing silently. If Memberstack never loads, the member is
        // looking at a blank panel with no idea why — and neither would we.
        console.error(
          '[portal] Memberstack ($memberstackDom) did not load within ' +
            MS_TIMEOUT_MS / 1000 +
            's. Check that the Memberstack script is on this page and loads before portal.js.',
        );
        showError('Membership service is unavailable. Please refresh the page.');
        return;
      }
      setTimeout(check, MS_POLL_MS);
    })();
  }

  function start() {
    whenMemberstackReady(gateAndLoad);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
