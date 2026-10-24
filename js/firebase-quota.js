let retryAt = 0;
try { retryAt = Number(localStorage.getItem('firestore_retry_at')) || 0; } catch {}

export function canUseFirestore() {
    return Date.now() >= retryAt;
}

export function noteFirestoreError(error) {
    if (!String(error?.code || '').includes('resource-exhausted') && !/quota exceeded/i.test(String(error?.message || ''))) return false;
    retryAt = Date.now() + 30 * 60 * 1000;
    try { localStorage.setItem('firestore_retry_at', String(retryAt)); } catch {}
    return true;
}
