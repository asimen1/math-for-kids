// Keeps the screen on while a game runs. Android releases the lock whenever the page
// is hidden, so it's re-acquired when the page becomes visible again.

let lock = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator) || lock) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch {
    lock = null;
  }
}

export function enableWakeLock() {
  wanted = true;
  return acquire();
}

export function disableWakeLock() {
  wanted = false;
  lock?.release();
  lock = null;
}

export const wakeLockSupported = 'wakeLock' in navigator;

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});
