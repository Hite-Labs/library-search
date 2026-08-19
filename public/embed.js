(function () {
  // Hardcoded deliberately, matching portal.js. This was 'NEXT_PUBLIC_APP_URL_PLACEHOLDER',
  // which nothing ever substituted — there is no build step for the files in public/, so the
  // literal string shipped to production. That broke the widget twice over: iframe.src
  // resolved to a relative path, and the postMessage below targeted an invalid origin, so
  // the member's token never arrived and search silently fell back to library-only results.
  var APP_URL = 'https://dashboard.showyourspark.com';

  var mount = document.getElementById('library-search-widget');
  if (!mount) return;

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
})();
