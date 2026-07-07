(function () {
  'use strict';

  var API_URL = 'https://dashboard.showyourspark.com/api/portal';

  // Module-level state for tab logic
  var hasIndividualPlan = false;
  var hasCohortPlan = false;

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

  function setLink(root, name, url) {
    var el = root.querySelector('[data-field="' + name + '"]');
    if (el && url) el.setAttribute('href', url);
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
    var tabIndividual = byField('tab-individual');
    var tabCohort = byField('tab-cohort');

    if (!hasIndividualPlan || !hasCohortPlan) {
      hide(tabsHeader);
      return;
    }

    show(tabsHeader);

    function activate(which) {
      // Guard: only allow switching to a panel the member actually has
      if (which === 'individual' && !hasIndividualPlan) return;
      if (which === 'cohort' && !hasCohortPlan) return;

      var coaching = byId('portal-coaching');
      var cohort = byId('portal-cohort');

      if (which === 'individual') {
        if (coaching) coaching.style.display = 'block';
        if (cohort) cohort.style.display = 'none';
      } else {
        if (coaching) coaching.style.display = 'none';
        if (cohort) cohort.style.display = 'block';
      }

      if (tabIndividual) tabIndividual.classList.toggle('is-active', which === 'individual');
      if (tabCohort) tabCohort.classList.toggle('is-active', which === 'cohort');
    }

    if (tabIndividual) {
      tabIndividual.addEventListener('click', function () { activate('individual'); });
    }
    if (tabCohort) {
      tabCohort.addEventListener('click', function () { activate('cohort'); });
    }

    // Default to individual tab active
    activate('individual');
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

    var url = recording.public_url || '';
    var fileType = recording.file_type || 'video';
    var title = recording.title || '';

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

    var url = file.public_url || '';
    var fileType = file.file_type || 'audio';
    var title = file.title || '';

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
  // ASSUMPTION pending Claude Code confirmation: session.session_date and
  // cohort.end_date are the fields the API actually returns for this.
  function isCohortSessionLocked(session, cohort) {
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

    var url = file.public_url || '';
    var fileType = file.file_type || 'audio';
    var title = file.title || '';

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

    var url = file.public_url || '';
    var fileType = file.file_type || 'audio';
    var title = file.title || '';

    card.style.cursor = 'pointer';
    card.addEventListener('click', function () {
      if (fileType === 'pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        openModal(title, url, fileType);
      }
    });
  }

  function renderCohort(cohort) {
    if (!cohort) return;
    cohort = cohort || {};

    var goalEl = byField('cohort-my-goal');
    if (goalEl) {
      goalEl.textContent = cohort.member_goal || '';
      show(goalEl);
    }

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

        // FIX: these three are IDs in Webflow, not data-field attributes.
        var upsell = byId('portal-upsell');
        var coaching = byId('portal-coaching');
        var cohort = byId('portal-cohort');

        if (upsell) upsell.style.display = 'none';
        if (coaching) coaching.style.display = 'none';
        if (cohort) cohort.style.display = 'none';

        if (!member) {
          if (upsell) upsell.style.display = 'block';
          return;
        }

        var plans = member.planConnections.map(function (p) {
          return p.planId;
        });

        hasIndividualPlan = plans.indexOf('pln_individual-coaching-nkaa080g') !== -1;
        hasCohortPlan = plans.indexOf('pln_cohort-qbab0892') !== -1;

        if (!hasIndividualPlan && !hasCohortPlan) {
          if (upsell) upsell.style.display = 'block';
          return;
        }

        if (hasIndividualPlan) {
          if (coaching) coaching.style.display = 'block';
        }
        if (hasCohortPlan) {
          if (cohort) cohort.style.display = 'block';
        }

        // Single fetch drives both panels — init() handles tabs + data load
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
