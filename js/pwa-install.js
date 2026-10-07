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
