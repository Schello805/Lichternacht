export const LIKES_RESET_TOKEN_KEY = 'likes_reset_token_v1';

export function applyLikesResetToken(storage, token) {
    if (!storage || token === undefined || token === null || token === '') return false;

    const normalizedToken = String(token);
    if (storage.getItem(LIKES_RESET_TOKEN_KEY) === normalizedToken) return false;

    const keysToRemove = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith('liked_')) keysToRemove.push(key);
    }
    keysToRemove.forEach(key => storage.removeItem(key));
    storage.setItem(LIKES_RESET_TOKEN_KEY, normalizedToken);
    return true;
}
