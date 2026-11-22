export function createProximityDwell({ durationMs = 10000, strictlyLonger = false } = {}) {
    let target = null;
    let startedAt = 0;
    let firstFixAt = 0;
    let lastFixAt = 0;
    let lastSampleAt = 0;

    return (sample = {}, now = Date.now()) => {
        const { id, accuracy, fixAt, visible = true } = sample;
        if (id == null || !visible || !Number.isFinite(now) || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 20
            || !Number.isFinite(fixAt) || fixAt > now || now - fixAt > 5000) {
            target = null;
            return { ready: false, monitoring: false };
        }
        const key = String(id);
        const advancing = target === key && fixAt > lastFixAt;
        if (target !== key || now < lastSampleAt || now - lastSampleAt > 5000 || fixAt < lastFixAt || fixAt - lastFixAt > 5000) {
            target = key;
            startedAt = now;
            firstFixAt = fixAt;
        }
        lastFixAt = fixAt;
        lastSampleAt = now;
        const elapsed = strictlyLonger ? Math.min(now - startedAt, lastFixAt - firstFixAt) : now - startedAt;
        return { ready: (strictlyLonger ? advancing && elapsed > durationMs : lastFixAt > firstFixAt && elapsed >= durationMs), monitoring: true };
    };
}
