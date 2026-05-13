(function () {
  var APP_URL = 'NEXT_PUBLIC_APP_URL_PLACEHOLDER';

  var mount = document.getElementById('library-search-widget');
  if (!mount) return;

  var iframe = document.createElement('iframe');
  iframe.src = APP_URL + '/widget';
  iframe.style.cssText = 'width:100%;border:0;min-height:400px;display:block;';
  iframe.allow = 'microphone';
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
        iframe.contentWindow.postMessage({ type: 'ms-user', userId: userId }, APP_URL);
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
