export function createProximityDwell() {
    let target = null;
    let startedAt = 0;
    let firstFixAt = 0;
    let lastFixAt = 0;

    return (sample, now = Date.now()) => {
        const { id, accuracy, fixAt, visible = true } = sample;
        if (id == null || !visible || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 20
            || !Number.isFinite(fixAt) || fixAt > now || now - fixAt > 5000) {
            target = null;
            return { ready: false, monitoring: false };
        }
        const key = String(id);
        if (target !== key || now < startedAt || fixAt < lastFixAt || fixAt - lastFixAt > 5000) {
            target = key;
            startedAt = now;
            firstFixAt = fixAt;
        }
        lastFixAt = fixAt;
        return { ready: now - startedAt >= 10000 && lastFixAt > firstFixAt, monitoring: true };
    };
}
