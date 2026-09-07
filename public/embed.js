(function () {
  // Every spelling Webflow might have generated from the class name. Removing only one
  // leaves the block hidden by another while the DOM looks revealed — style="" and no
  // obviously matching class, which is a genuinely hard failure to see.
  var HIDDEN_CLASSES = ['is-hidden', 'ishidden', 'isHidden'];

  function unhide(el) {
    if (!el) return;
    if (el.classList) {
      for (var h = 0; h < HIDDEN_CLASSES.length; h++) el.classList.remove(HIDDEN_CLASSES[h]);
    }
    el.style.display = '';
  }

  // Hardcoded deliberately, matching portal.js. This was 'NEXT_PUBLIC_APP_URL_PLACEHOLDER',
  // which nothing ever substituted — there is no build step for the files in public/, so the
  // literal string shipped to production. That broke the widget twice over: iframe.src
  // resolved to a relative path, and the postMessage below targeted an invalid origin, so
  // the member's token never arrived and search silently fell back to library-only results.
  var APP_URL = 'https://dashboard.showyourspark.com';

  var mount = document.getElementById('library-search-widget');
  if (!mount) return;

  // Search is public, so the widget itself is never gated — but the mount div may still be
  // marked hidden to stop it flashing in before the iframe paints. Nothing else would ever
  // clear that: this script has no reveal step for the mount, so the class would sit there
  // and the widget would be built inside an invisible box.
  unhide(mount);

  var iframe = document.createElement('iframe');
  iframe.src = APP_URL + '/widget';
  iframe.style.cssText = 'width:100%;border:0;min-height:400px;display:block;';
  // microphone: the voice search button. fullscreen: video playback — without it the
  // fullscreen button in our own player chrome silently does nothing in a cross-origin
  // frame. autoplay: lets playback that a member started continue across a src change
  // (picking a second track) instead of needing a fresh tap.
  iframe.allow = 'microphone; fullscreen; autoplay';
  iframe.title = 'Content Search';

  // Forward Memberstack user ID to widget via postMessage
  iframe.addEventListener('load', function () {
    try {
      var ms = window.$memberstackDom || window.MemberStack;
      if (!ms) return;
      var getUser = ms.getCurrentMember
        ? ms.getCurrentMember()
        : ms.getMember
        ? ms.getMember()
        : Promise.resolve(null);
      Promise.resolve(getUser).then(function (m) {
        var userId = (m && (m.id || (m.data && m.data.id))) || null;
        revealLibraryUpsell(m);
        // Memberstack stores the member JWT in the _ms-mid cookie. The backend
        // verifies this token (the userId alone is not trusted for access).
        var tokenMatch = document.cookie.match(/_ms-mid=([^;]+)/);
        var token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
        iframe.contentWindow.postMessage(
          { type: 'ms-user', userId: userId, token: token },
          APP_URL
        );
      });
    } catch (e) {
      // Memberstack not available — that's fine
    }
  });

  // Auto-resize iframe to content height
  window.addEventListener('message', function (e) {
    if (e.source !== iframe.contentWindow) return;
    if (e.data && e.data.type === 'resize' && typeof e.data.height === 'number') {
      iframe.style.height = e.data.height + 'px';
    }
  });

  mount.appendChild(iframe);

  // Declared above the call below, not beside the function. `var` assignments do not hoist
  // with the function that reads them: leaving these underneath meant the plan id was
  // undefined at call time, so no connection ever matched and a paying member was shown the
  // pitch anyway — the one outcome this block must avoid.
  var LIBRARY_UPSELL_ID = 'library-upsell';
  // The mirror of the upsell: content only members get — the custom audio and whatever else
  // Lindsay adds to that column later. One id for the whole wrapper, so adding a second
  // block inside it needs no code change.
  var LIBRARY_MEMBER_ID = 'library-member-content';
  var MEMBERSHIP_PLAN_ID = 'pln_sys-society-6h2m809m5';

  // Run the upsell gate independently of the iframe, rather than only from its load
  // handler. Two paths above return early — no Memberstack on the page, or a throw — and
  // both would have left the block hidden from a logged-out visitor, who is exactly the
  // person it exists to convert. Resolving to "no member" here shows it, which is right.
  //
  // Calling it twice is harmless: it only ever removes a class, and the second call with a
  // real member re-checks and leaves a genuine member's copy hidden.
  try {
    var msNow = window.$memberstackDom || window.MemberStack;
    var pending = msNow && msNow.getCurrentMember
      ? msNow.getCurrentMember()
      : msNow && msNow.getMember
      ? msNow.getMember()
      : Promise.resolve(null);
    Promise.resolve(pending).then(revealLibraryUpsell).catch(function () {
      revealLibraryUpsell(null);
    });
  } catch (e) {
    revealLibraryUpsell(null);
  }

  // ===== "What is the membership?" block, for people who don't have it =====

  // Search is public, so this page is read by three different audiences: members with the
  // audio membership, members who hold something else, and logged-out visitors. Only the
  // first should be spared the pitch.
  //
  // The block is authored in Webflow as id="library-upsell" and marked is-hidden, so the
  // page paints without it and this reveals it — the same inverted default portal.js uses.
  // That direction matters here: failing to reveal shows the pitch to nobody, while failing
  // to hide would sell the membership to someone who already pays for it.
  //
  // Deliberately not a promo block. Promos are gated server-side and rendered by portal.js,
  // which does not run on this page — the membership page loads this script instead.
  function revealLibraryUpsell(member) {
    var upsellEl = document.getElementById(LIBRARY_UPSELL_ID);
    var memberEl = document.getElementById(LIBRARY_MEMBER_ID);
    if (!upsellEl && !memberEl) return; // Neither block on this page — nothing to do.
    var el = upsellEl;

    var data = (member && (member.data || member)) || null;
    var conns = (data && data.planConnections) || [];
    var holds = false;
    for (var i = 0; i < conns.length; i++) {
      var c = conns[i];
      if (!c || typeof c === 'string' || c.planId !== MEMBERSHIP_PLAN_ID) continue;
      // Same liveness test as portal.js and the server: `active` disqualifies only when
      // EXPLICITLY false, since this SDK's payload cannot be verified from the repo.
      if (c.active === false) continue;
      if (/cancel|expired/i.test(c.status || '')) continue;
      holds = true;
    }

    // Exactly one of the two shows, and the pair are deliberately asymmetric.
    //
    // The upsell is revealed for anyone who does NOT hold the membership — logged-out
    // visitors included, since search is public and they are who it converts. Member
    // content requires a positive, live connection: unknown reads as "not a member", so a
    // failed lookup withholds paid content rather than leaking it.
    if (holds) unhide(memberEl);
    else unhide(el);
  }
})();
