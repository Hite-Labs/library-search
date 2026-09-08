(function () {
  // Every spelling Webflow might have generated from the class name. Removing only one
  // leaves the block hidden by another while the DOM looks revealed — style="" and no
  // obviously matching class, which is a genuinely hard failure to see.
  var HIDDEN_CLASSES = ['is-hidden', 'ishidden', 'isHidden'];

  function rehide(el) {
    if (!el) return;
    if (el.classList) el.classList.add(HIDDEN_CLASSES[0]);
    el.style.display = 'none';
  }

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

  // NOT an early return any more.
  //
  // Everything below — including the whole library upsell / member-content gate — used to
  // sit behind `if (!mount) return`, so a page carrying the membership blocks but no search
  // widget ran none of it. The gate then never fired, the members-only column stayed
  // whatever Webflow left it, and no server answer was ever asked for. The two features
  // arrived at different times and only one of them needs the widget.
  //
  // The iframe setup is now guarded on `mount` individually, and the gate runs regardless.

  // Search is public, so the widget itself is never gated — but the mount div may still be
  // marked hidden to stop it flashing in before the iframe paints. Nothing else would ever
  // clear that: this script has no reveal step for the mount, so the class would sit there
  // and the widget would be built inside an invisible box.
  // NOT revealed here. Doing so showed the search bar immediately, then the gate resolved a
  // moment later and the upsell appeared above it — the bar visibly jumping down the page.
  // The widget is revealed alongside the gate's decision instead, so the column settles once.
  //
  // Kept out of the gate's own branches because it is not plan-dependent: everyone who
  // reaches this page gets search, member or not.


  // The search widget itself. Skipped entirely on a page that has no mount for it —
  // the membership blocks below are a separate feature and must still be gated there.
  if (mount) {
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
  }

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
  // Same endpoint the portal uses. Asked here only for its `plans` flags.
  var PORTAL_API_URL = 'https://dashboard.showyourspark.com/api/portal';

  // Run the upsell gate independently of the iframe, rather than only from its load
  // handler. Two paths above return early — no Memberstack on the page, or a throw — and
  // both would have left the block hidden from a logged-out visitor, who is exactly the
  // person it exists to convert. Resolving to "no member" here shows it, which is right.
  //
  // Called exactly once. It used to run from the iframe's load handler as well, which was
  // harmless while the check was synchronous — but the decision now awaits the server, so
  // two calls meant two in-flight answers and whichever landed first won. Since unhide()
  // only ever reveals and nothing hides again, a stale local answer could open the members
  // column and no later answer would close it.
  // Wait for Memberstack before deciding. Its script is async and regularly lands after
  // this one, so reading $memberstackDom straight away found nothing — and "nothing" is
  // indistinguishable from "logged out", which would show the upsell to a paying member and
  // withhold the content they bought. portal.js polls for the same reason; there is no
  // documented ready event.
  //
  // The timeout still decides rather than hanging: a member the page cannot identify is
  // treated as not-a-member, which shows the pitch and withholds paid content — the safe
  // direction for both.
  (function waitForMemberstack(waited) {
    var ms = window.$memberstackDom || window.MemberStack;
    var ready = ms && (ms.getCurrentMember || ms.getMember);

    if (!ready) {
      if (waited >= 10000) return revealLibraryUpsell(null);
      return setTimeout(function () { waitForMemberstack(waited + 100); }, 100);
    }

    try {
      var pending = ms.getCurrentMember ? ms.getCurrentMember() : ms.getMember();
      Promise.resolve(pending).then(revealLibraryUpsell).catch(function () {
        revealLibraryUpsell(null);
      });
    } catch (e) {
      revealLibraryUpsell(null);
    }
  })(0);

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
  /**
   * Ask the server whether this member holds the membership, and fall back to reading it
   * here if that fails.
   *
   * The local read below is the browser's own view of Memberstack. That is usually the same
   * answer, but it is not the authoritative one — the server decides entitlement everywhere
   * else in this product, and it is the only half that honours PORTAL_PRETEND_PLANS. Reading
   * only locally is why a tester set to hold nothing still saw member content here while the
   * portal correctly showed them the upsell.
   *
   * Falls back rather than failing: no token, a network error, or an older server without
   * `plans` in its payload all drop through to the local check, which is what this did
   * before.
   */
  function resolveMembership(member) {
    // getMemberCookie(), not document.cookie. Memberstack does not reliably expose _ms-mid
    // to script — reading it directly returned nothing on the live page, so the fetch never
    // ran and every decision silently fell back to the local read, which is exactly the
    // half that cannot see the server's answer. portal.js has always used this API.
    var ms = window.$memberstackDom;
    var token = ms && ms.getMemberCookie ? ms.getMemberCookie() : null;
    if (!token || !window.fetch) return Promise.resolve(null);

    return fetch(PORTAL_API_URL, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.plans) return null;
        return d.plans.membership === true;
      })
      .catch(function () { return null; });
  }

  function revealLibraryUpsell(member) {
    var upsellEl = document.getElementById(LIBRARY_UPSELL_ID);
    var memberEl = document.getElementById(LIBRARY_MEMBER_ID);
    if (!upsellEl && !memberEl) {
      unhide(mount); // No gated blocks here, so nothing to wait for.
      return;
    }

    // Withhold the members-only column until we know, rather than trusting the page to have
    // marked it hidden. It holds paid content, so "not yet decided" must look like "not a
    // member" — and a block authored without the hidden class would otherwise be visible to
    // everyone, which is how it shipped: the upsell carried the class and this one did not.
    rehide(memberEl);
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
    //
    // The server is asked first and wins when it answers; `holds` above is the fallback.
    resolveMembership(member).then(function (serverSays) {
      var decided = serverSays === null ? holds : serverSays;
      // Explicitly hide the other one rather than merely revealing the right one. Revealing
      // alone cannot correct anything: if a block is already open, leaving it open is a
      // decision too, and the wrong one whenever the answer has changed.
      if (decided) {
        rehide(el);
        unhide(memberEl);
      } else {
        rehide(memberEl);
        unhide(el);
      }
      // One paint: the widget arrives with whichever column won, rather than ahead of it.
      unhide(mount);
    });
  }
})();
