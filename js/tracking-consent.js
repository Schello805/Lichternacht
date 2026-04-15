// Minimal consent gate for tracking. This only stores/reads a flag.
// Hook this up to your cookie banner / privacy UI.

(function () {
  var KEY = 'tracking_consent'; // values: 'granted' | 'denied' | null

  function getTrackingConsentState() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'granted' || v === 'denied') return v;
      return null;
    } catch (e) {
      return null;
    }
  }

  function hasTrackingConsent() {
    try {
      return localStorage.getItem(KEY) === 'granted';
    } catch (e) {
      return false;
    }
  }

  function setTrackingConsent(granted) {
    try {
      localStorage.setItem(KEY, granted ? 'granted' : 'denied');
    } catch (e) {
      // ignore
    }
  }

  window.hasTrackingConsent = hasTrackingConsent;
  window.getTrackingConsentState = getTrackingConsentState;
  window.setTrackingConsent = setTrackingConsent;
})();
