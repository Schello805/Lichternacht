let deferredPrompt = null;

export function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function getInstallGuidance() {
    if (isStandalone()) return { installed: true, text: 'Die App ist bereits installiert.' };
    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return {
        installed: false,
        text: isAppleMobile
            ? 'Im Browser auf Teilen tippen, „Zum Home-Bildschirm“ wählen und die App über das neue Symbol öffnen.'
            : 'Im Browser-Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.'
    };
}

function showInstallGuidance() {
    let dialog = document.getElementById('install-help-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'install-help-dialog';
        dialog.className = 'rounded-2xl p-5 max-w-sm w-[calc(100%-2rem)] bg-white text-gray-900 dark:bg-gray-800 dark:text-white shadow-xl';
        dialog.setAttribute('aria-labelledby', 'install-help-title');
        dialog.innerHTML = '<h2 id="install-help-title" class="font-bold text-lg mb-2">App installieren</h2><p id="install-help-text" class="text-sm leading-relaxed"></p><p class="mt-3 text-xs text-gray-500 dark:text-gray-300">Erinnerungen funktionieren aktuell nur bei geöffneter App. Die Installation allein aktiviert keine Hintergrundbenachrichtigungen.</p><form method="dialog" class="mt-4"><button class="rounded-lg bg-yellow-500 px-4 py-2 font-bold text-gray-900">Verstanden</button></form>';
        document.body.appendChild(dialog);
    }
    dialog.querySelector('#install-help-text').textContent = getInstallGuidance().text;
    if (!dialog.open) dialog.showModal();
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
        showInstallGuidance();
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
