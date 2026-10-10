let deferredPrompt = null;

function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateAvailabilityStatus() {
    const status = document.getElementById('app-availability-status');
    const installButton = document.getElementById('visitor-install-app');
    if (!status) return;

    let icon = 'ph-wifi-high';
    let text = 'Online · Inhalte werden für offline vorbereitet';
    if (!navigator.onLine) {
        icon = 'ph-wifi-slash';
        text = 'Offline-Modus aktiv';
    } else if (isStandalone()) {
        icon = 'ph-device-mobile-check';
        text = 'Installiert · offline verfügbar';
    } else if (navigator.serviceWorker?.controller) {
        icon = 'ph-check-circle';
        text = 'Offline verfügbar';
    }
    status.innerHTML = `<i class="ph ${icon}"></i> ${text}`;
    installButton?.classList.toggle('hidden', !deferredPrompt || isStandalone());

    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
        const savedAt = Number(window.state?.visitorDataSavedAt) || 0;
        const updatedLabel = savedAt
            ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(savedAt)
            : 'noch kein Stand gespeichert';
        connectionStatus.classList.toggle('hidden', navigator.onLine);
        connectionStatus.innerHTML = `<i class="ph ph-wifi-slash"></i><span><strong>Offline</strong> · Daten vom ${updatedLabel}</span>`;
    }
}

export function initPwaInstall(showToast) {
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        const installButton = document.getElementById('btn-pwa-install');
        if (installButton) {
            installButton.classList.remove('hidden');
            installButton.onclick = () => triggerPwaInstall(showToast);
        }
        const visitorInstallButton = document.getElementById('visitor-install-app');
        if (visitorInstallButton) visitorInstallButton.onclick = () => triggerPwaInstall(showToast);
        updateAvailabilityStatus();
        console.log('PWA Install Prompt captured');
    });
    window.addEventListener('online', updateAvailabilityStatus);
    window.addEventListener('offline', updateAvailabilityStatus);
    window.addEventListener('appinstalled', updateAvailabilityStatus);
    window.addEventListener('lichternacht:data-updated', updateAvailabilityStatus);
    navigator.serviceWorker?.ready.then(updateAvailabilityStatus).catch(() => updateAvailabilityStatus());
    updateAvailabilityStatus();
}

export async function triggerPwaInstall(showToast) {
    if (!deferredPrompt) {
        showToast('Installation ist in diesem Browser gerade nicht verfügbar. Nutze ggf. "Zum Home-Bildschirm" im Browser-Menü.', 'info');
        return;
    }
    try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        deferredPrompt = null;
        document.getElementById('btn-pwa-install')?.classList.add('hidden');
        updateAvailabilityStatus();
    } catch (error) {
        console.log('PWA install prompt failed', error);
        showToast('Installation konnte nicht gestartet werden.', 'error');
    }
}
