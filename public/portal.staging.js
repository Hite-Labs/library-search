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
    }
  ];

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
    var held = heldPlans();

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

    renderPromos(data.promos);
  }

  // ===== Promo blocks =====

  // Promos arrive already filtered by the API — it drops anything selling a plan the member
  // holds — so there is no visibility logic here. That deliberately keeps one source of
  // truth: adding a plan changes the registry, not this script.
  //
  // Two lists, so Webflow can style a buy CTA and an "already included" notice differently
  // without the script knowing anything about their markup. Either may be absent; renderList
  // no-ops on a missing container.
  function fillPromoCard(card, promo) {
    setField(card, 'promo-title', promo.title || '');
    setField(card, 'promo-body', promo.body || '');
    setField(card, 'promo-cta-label', promo.cta_label || '');
    setLink(card, 'promo-cta', promo.cta_url);

    // Stamped so Webflow can style by kind without a second template if preferred.
    card.setAttribute('data-promo-kind', promo.kind || 'buy');

    // Whole card clickable, matching how every other card in the portal behaves. Guarded on
    // a url so a promo with no link isn't a dead click target.
    if (promo.cta_url) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', function () {
        window.open(promo.cta_url, '_blank', 'noopener,noreferrer');
      });
    }
  }

  function renderPromos(promos) {
    promos = promos || [];

    var buy = [];
    var inclusion = [];
    for (var i = 0; i < promos.length; i++) {
      if (promos[i].kind === 'inclusion') inclusion.push(promos[i]);
      else buy.push(promos[i]);
    }

    renderList(byField('promo-list'), byField('promo-empty'), buy, fillPromoCard);
    renderList(
      byField('promo-inclusion-list'),
      byField('promo-inclusion-empty'),
      inclusion,
      fillPromoCard
    );
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
        var anyHeld = false;
        for (i = 0; i < PLANS.length; i++) {
          PLANS[i].has = plans.indexOf(PLANS[i].planId) !== -1;
          if (PLANS[i].has) anyHeld = true;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gateAndLoad);
  } else {
    gateAndLoad();
  }
})();
