const status = document.createElement('div');
status.className = 'connection-status';
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
status.hidden = true;
document.body.append(status);

function showConnectionState() {
  const offline = !navigator.onLine;
  status.hidden = !offline;
  status.textContent = offline ? 'Offline — training progress will sync when you reconnect.' : '';
  document.documentElement.dataset.connection = offline ? 'offline' : 'online';
}

window.addEventListener('online', showConnectionState);
window.addEventListener('offline', showConnectionState);
showConnectionState();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // The online app remains fully usable when offline support cannot register.
    });
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
  for (const image of document.querySelectorAll('img')) {
    image.loading ||= 'lazy';
    image.decoding ||= 'async';
  }
});
