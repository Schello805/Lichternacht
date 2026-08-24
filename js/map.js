import { state } from './state.js';
import { showToast, getVisitedStationIdSet } from './utils.js';

let tileLayer;
const GPS_ERROR_TOAST_COOLDOWN_MS = 5 * 60 * 1000;
let lastGpsErrorToastAt = 0;
let lastGpsErrorSignature = '';
let timeoutRetryToastShown = false;
let gpsFallbackTimer = null;

function getUserMarkerIcon() {
    const heading = Number.isFinite(Number(state.compassHeading)) ? Number(state.compassHeading) : 0;
    const headingClass = state.compassEnabled ? 'is-heading-active' : '';
    const headingStyle = state.compassEnabled ? `style="transform: rotate(${heading}deg);"` : '';
    return L.divIcon({
        html: `
            <div class="user-location-marker ${headingClass}">
                <div class="user-location-heading" ${headingStyle}></div>
                <div class="user-location-dot"></div>
            </div>
        `,
        className: 'user-loc',
        iconSize: [54, 54],
        iconAnchor: [27, 27]
    });
}

function updateUserMarkerHeading() {
    if (!state.userMarker) return;
    try {
        state.userMarker.setIcon(getUserMarkerIcon());
    } catch (e) { }
}

function normalizeHeading(event) {
    if (Number.isFinite(event.webkitCompassHeading)) {
        return (Number(event.webkitCompassHeading) + 360) % 360;
    }

    const alpha = Number(event.alpha);
    if (Number.isFinite(alpha)) {
        const screenAngle = Number(window.screen?.orientation?.angle ?? window.orientation ?? 0) || 0;
        return (360 - alpha + screenAngle + 360) % 360;
    }

    return null;
}

function handleDeviceOrientation(event) {
    const heading = normalizeHeading(event);
    if (heading == null) return;
    state.compassHeading = heading;
    updateUserMarkerHeading();
}

function shouldShowGpsErrorToast(err) {
    const now = Date.now();
    const signature = `${err?.code || 'unknown'}:${err?.message || ''}`;
    if (signature !== lastGpsErrorSignature || now - lastGpsErrorToastAt > GPS_ERROR_TOAST_COOLDOWN_MS) {
        lastGpsErrorSignature = signature;
        lastGpsErrorToastAt = now;
        return true;
    }
    return false;
}

function showLocationPermissionHelp() {
    let modal = document.getElementById('location-permission-help');
    if (!modal) {
        const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        modal = document.createElement('div');
        modal.id = 'location-permission-help';
        modal.className = 'fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 p-3';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'location-permission-title');
        modal.innerHTML = `
            <div class="w-full max-w-md rounded-2xl bg-white p-5 text-gray-900 shadow-2xl dark:bg-gray-800 dark:text-white">
                <h2 id="location-permission-title" class="text-lg font-bold">Standort wieder freigeben</h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">Der Browser hat den Standortzugriff für diese Website blockiert. Die App kann diese Einstellung aus Sicherheitsgründen nicht selbst ändern.</p>
                <ol class="mt-4 list-decimal space-y-2 pl-5 text-sm">
                    ${isAppleMobile
                        ? '<li>Tippe links in der Safari-Adressleiste auf das Seitensymbol.</li><li>Öffne „Website-Einstellungen“ und stelle „Standort“ auf „Erlauben“ oder „Fragen“.</li><li>Falls die Auswahl fehlt: Einstellungen → Datenschutz &amp; Sicherheit → Ortungsdienste → Safari-Websites → „Beim Verwenden der App“.</li>'
                        : '<li>Öffne im Browser das Seitenmenü beziehungsweise die Website-Einstellungen.</li><li>Wähle „Berechtigungen“ → „Standort“ → „Zulassen“.</li><li>Lade anschließend diese Seite neu.</li>'}
                </ol>
                <div class="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" data-location-close class="rounded-xl bg-gray-200 px-3 py-3 text-sm font-bold text-gray-800 dark:bg-gray-700 dark:text-white">Schließen</button>
                    <button type="button" data-location-retry class="rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white">Erneut versuchen</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-location-close]').addEventListener('click', () => modal.remove());
        modal.querySelector('[data-location-retry]').addEventListener('click', () => {
            modal.remove();
            locateUser(null, { userInitiated: true });
        });
    }
}

async function enableCompassFromUserGesture() {
    if (state.compassEnabled || state.compassPermissionTried) return;
    if (!window.DeviceOrientationEvent) return;

    try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            state.compassPermissionTried = true;
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') return;
        }
    } catch (e) {
        return;
    }

    state.compassPermissionTried = true;
    state.compassListener = handleDeviceOrientation;
    window.addEventListener('deviceorientationabsolute', state.compassListener, true);
    window.addEventListener('deviceorientation', state.compassListener, true);
    state.compassEnabled = true;
    updateUserMarkerHeading();
}

function getLocationButtons() {
    return ['map-locate-btn', 'list-locate-btn']
        .map(id => document.getElementById(id))
        .filter(Boolean);
}

function setGpsUiStatus(status) {
    state.gpsStatus = status;
    const statusIndicator = document.getElementById('status-indicator');
    const labels = {
        searching: 'Suche…',
        connected: 'Verbunden',
        timeout: 'GPS Timeout',
        denied: 'Standort gesperrt',
        error: 'GPS Fehler'
    };
    if (statusIndicator) statusIndicator.innerText = labels[status] || 'GPS';

    getLocationButtons().forEach(button => {
        const searching = status === 'searching';
        const connected = status === 'connected';
        button.setAttribute('aria-busy', searching ? 'true' : 'false');
        button.setAttribute('aria-label', connected ? 'Standort erneut bestimmen' : 'Eigenen Standort bestimmen');
        button.classList.toggle('ring-2', connected);
        button.classList.toggle('ring-blue-500', connected);
        button.classList.toggle('animate-pulse', searching);
    });
}

function clearGpsWatch() {
    if (state.watchId !== null && state.watchId !== undefined) {
        try { navigator.geolocation.clearWatch(state.watchId); } catch (e) { }
    }
    state.watchId = null;
}

function isValidPosition(position) {
    return Number.isFinite(Number(position?.coords?.latitude))
        && Number.isFinite(Number(position?.coords?.longitude));
}

export function initMap() {
    state.map = L.map('map', { zoomControl: false }).setView([49.158, 10.552], 16);
    const userLocationPane = state.map.createPane('userLocationPane');
    userLocationPane.style.zIndex = '750';
    userLocationPane.style.pointerEvents = 'none';
    updateMapTiles(document.documentElement.classList.contains('dark'));
}

export function updateMapTiles(isDark) {
    if (!state.map) return;
    console.log('Update Map Tiles:', isDark ? 'DARK' : 'LIGHT');
    
    if (tileLayer) {
        state.map.removeLayer(tileLayer);
        tileLayer = null; // Clear reference
    }
    
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
    tileLayer = L.tileLayer(tileUrl, { 
        attribution: '&copy; OpenStreetMap &copy; CARTO', 
        maxZoom: 19 
    }).addTo(state.map);
}

export function refreshMapMarkers() {
    state.markers.forEach(m => state.map.removeLayer(m.marker));
    state.markers = [];

    const visitedStations = getVisitedStationIdSet();

    const lastChecked = localStorage.getItem('last_checked_station');

    state.stations.forEach(s => {
        const isActive = state.activeStationId && state.activeStationId === s.id;
        const isVisited = visitedStations.has(String(s.id));
        const isLastChecked = lastChecked != null && lastChecked.toString() === s.id.toString();
        const color = (isActive || isLastChecked) ? '#1d4ed8' : '#f59e0b';
        const idStr = s.id.toString();
        const fontSize = idStr.length > 3 ? '10px' : '14px';
        const extraClasses = `${isVisited ? 'visited-pin' : ''} ${isLastChecked ? 'checked-pin' : ''}`.trim();
        
        const icon = L.divIcon({
            className: 'custom-pin',
            html: `<div class="station-pin ${extraClasses}" style="background-color: ${color}; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-family: sans-serif; font-size: ${fontSize}; overflow: hidden;">${idStr}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        // Admin: Draggable Markers
        const isDraggable = state.isAdmin;
        const marker = L.marker([s.lat, s.lng], { icon: icon, draggable: isDraggable }).addTo(state.map);
        
        marker.on('click', () => {
            // Prevent click when dragging
            if (marker._isDragging) return;
            if (window.openModal) window.openModal(s);
        });

        if (isDraggable) {
            marker.on('dragstart', () => { marker._isDragging = true; });
            marker.on('dragend', (e) => {
                setTimeout(() => { marker._isDragging = false; }, 100); // Debounce click
                const newPos = e.target.getLatLng();
                
                // Update Local State
                s.lat = newPos.lat;
                s.lng = newPos.lng;
                
                // Update Form if open
                if (state.activeStationId === s.id) {
                    const latInput = document.getElementById('edit-lat');
                    const lngInput = document.getElementById('edit-lng');
                    if (latInput && lngInput) {
                        latInput.value = newPos.lat;
                        lngInput.value = newPos.lng;
                        showToast(`Neue Position: ${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)}`, 'info');
                    }
                }
            });
        }

        state.markers.push({ id: s.id, marker: marker });
    });
}

export async function locateUser(cb, options = {}) {
    if (!navigator.geolocation) {
        showToast('GPS nicht verfügbar (Browser)', 'error');
        setGpsUiStatus('error');
        return;
    }

    const startedFromUserGesture = options.userInitiated === true || navigator.userActivation?.isActive === true;
    const requestToken = ++state.gpsRequestToken;

    if (startedFromUserGesture) {
        await enableCompassFromUserGesture();
        if (requestToken !== state.gpsRequestToken) return;
    }

    const forceCenter = !cb;
    const context = { requestToken, forceCenter, cb, cbCalled: false, hasFix: false, watchStarted: false, denied: false };

    clearGpsWatch();
    if (gpsFallbackTimer) clearTimeout(gpsFallbackTimer);
    gpsFallbackTimer = null;
    timeoutRetryToastShown = false;
    setGpsUiStatus('searching');

    const applyPosition = (pos) => {
        if (context.requestToken !== state.gpsRequestToken || !isValidPosition(pos)) return;
        const wasLocated = state.hasLocatedUser === true;
        context.hasFix = true;
        context.denied = false;
        setGpsUiStatus('connected');
        lastGpsErrorSignature = '';
        lastGpsErrorToastAt = 0;
        timeoutRetryToastShown = false;

        const userLat = Number(pos.coords.latitude);
        const userLng = Number(pos.coords.longitude);
        const fixTimestamp = Number.isFinite(Number(pos.timestamp)) ? Number(pos.timestamp) : Date.now();
        const isFreshFix = Date.now() - fixTimestamp <= 60000;
        state.userLocation = { lat: userLat, lng: userLng };
        state.gpsAccuracy = Number.isFinite(Number(pos.coords.accuracy)) ? Number(pos.coords.accuracy) : null;
        state.gpsLastFixAt = fixTimestamp;

        if (context.cb && !context.cbCalled && isFreshFix) {
            context.cbCalled = true;
            try { context.cb(); } catch (e) { }
        }

        if (state.userMarker) {
            state.userMarker.setLatLng([userLat, userLng]);
            state.userMarker.setIcon(getUserMarkerIcon());
        } else if (state.map) {
            state.userMarker = L.marker([userLat, userLng], {
                icon: getUserMarkerIcon(),
                pane: 'userLocationPane',
                interactive: false,
                keyboard: false,
                zIndexOffset: 10000
            }).addTo(state.map);
        }

        if (state.map && (!state.hasLocatedUser || context.forceCenter)) {
            state.map.setView([userLat, userLng], Math.max(state.map.getZoom(), 18));
            state.hasLocatedUser = true;
        }

        if (!wasLocated && startedFromUserGesture) {
            showToast(state.compassEnabled
                ? 'Standort erkannt – Kompass ist aktiv.'
                : 'Standort erkannt.', 'success');
        }

        if (window.checkProximity) window.checkProximity(userLat, userLng);
        if (window.refreshStationList) window.refreshStationList();
        if (window.renderTimeline) window.renderTimeline();
    };

    const handleFinalError = (err) => {
        if (context.requestToken !== state.gpsRequestToken) return;
        const denied = err?.code === 1;
        setGpsUiStatus(denied ? 'denied' : 'error');
        if (shouldShowGpsErrorToast(err)) {
            const message = denied
                ? 'Standortzugriff ist blockiert. Öffne die angezeigte Anleitung, um ihn wieder freizugeben.'
                : `Standort konnte nicht ermittelt werden: ${err?.message || 'Unbekannter Fehler'}`;
            console.warn('GPS Error', err);
            showToast(message, 'error');
        }
        if (denied) showLocationPermissionHelp();
    };

    const startRelaxedFallback = () => {
        if (context.denied || context.requestToken !== state.gpsRequestToken || gpsFallbackTimer) return;
        gpsFallbackTimer = setTimeout(() => {
            gpsFallbackTimer = null;
            navigator.geolocation.getCurrentPosition(
                applyPosition,
                (err) => {
                    if (!context.hasFix && err?.code === 1) handleFinalError(err);
                },
                { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 }
            );
        }, 600);
    };

    const handleWatchError = (err) => {
        if (context.requestToken !== state.gpsRequestToken) return;
        if (err?.code === 1) {
            context.denied = true;
            clearGpsWatch();
            handleFinalError(err);
            return;
        }

        setGpsUiStatus(context.hasFix ? 'connected' : 'timeout');
        const shouldNotify = shouldShowGpsErrorToast(err);
        if (shouldNotify) console.warn('GPS Watch Error', err);
        if (!context.hasFix && shouldNotify && !timeoutRetryToastShown) {
            timeoutRetryToastShown = true;
            showToast('Standortsignal ist noch ungenau – die Suche läuft weiter.', 'info');
        }
        startRelaxedFallback();
    };

    const startWatch = () => {
        if (context.watchStarted || context.denied || context.requestToken !== state.gpsRequestToken) return;
        context.watchStarted = true;
        state.watchId = navigator.geolocation.watchPosition(
            applyPosition,
            handleWatchError,
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
        );
    };

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            applyPosition(pos);
            startWatch();
        },
        (err) => {
            if (context.requestToken !== state.gpsRequestToken) return;
            if (err?.code === 1) {
                context.denied = true;
                clearGpsWatch();
                handleFinalError(err);
                return;
            }
            startWatch();
            startRelaxedFallback();
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
    );

    // Do not wait for the initial one-shot lookup before starting continuous tracking.
    setTimeout(startWatch, 1200);
}

export function calculateRoute(destLat, destLng) {
    if (!state.userLocation) {
        showToast("GPS wird benötigt – Standort wird aktiviert...", 'info');
        locateUser(() => calculateRoute(destLat, destLng));
        return;
    }
    if (state.routingControl) { state.map.removeControl(state.routingControl); state.routingControl = null; }
    state.routingControl = L.Routing.control({
        waypoints: [L.latLng(state.userLocation.lat, state.userLocation.lng), L.latLng(destLat, destLng)],
        routeWhileDragging: false, show: false, addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: true,
        lineOptions: { styles: [{ color: '#3b82f6', opacity: 0.7, weight: 5 }] }
    }).addTo(state.map);
    showToast("Route wird berechnet...", 'info');
}

export function resetMap() {
    if (state.stations.length > 0) {
        const bounds = L.latLngBounds(state.stations.map(s => [s.lat, s.lng]));
        state.map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        state.map.setView([49.158, 10.552], 16);
    }
}
