let deferredPrompt = null;

export function initPwaInstall(showToast) {
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        const installButton = document.getElementById('btn-pwa-install');
        if (installButton) {
            installButton.classList.remove('hidden');
            installButton.onclick = () => triggerPwaInstall(showToast);
        }
        console.log('PWA Install Prompt captured');
    });
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
    } catch (error) {
        console.log('PWA install prompt failed', error);
        showToast('Installation konnte nicht gestartet werden.', 'error');
    }
}
