
import { state } from './state.js';
import { showToast, parseEventWindowConfig, formatEventWindowDe } from './utils.js';
import { saveData, seedStations, seedEvents } from './data.js';
import { parseCsv, toCsv } from './csv.js?v=1.4.120';
import { validateStations, validateEvents } from './validate.js';

console.log("js/admin.js module loaded"); // DEBUG

const STATION_CSV_COLUMNS = ['id', 'name', 'address', 'offer', 'link', 'lat', 'lng', 'tags', 'image', 'time', 'likes'];
const EVENT_CSV_COLUMNS = ['id', 'time', 'title', 'description', 'link', 'loc', 'lat', 'lng', 'color'];
const adminTableSort = { field: 'id', direction: 'asc' };

function getAdminConfigIssues() {
    const issues = [];
    const eventWindowRaw = String(state.downloads?.icsDate || '').trim();
    const rewards = state.config?.rewards || {};
    const prizes = rewards.prizes || {};

    if (!eventWindowRaw) {
        issues.push({
            severity: 'warn',
            where: 'config.eventWindow',
            label: 'Event-Zeitraum',
            field: 'icsDate',
            message: 'fehlt – Programmstatus und Lichter‑Pass sind dann nicht zeitlich begrenzt'
        });
    } else {
        const parsed = parseEventWindowConfig(eventWindowRaw);
        if (!parsed) {
            issues.push({
                severity: 'error',
                where: 'config.eventWindow',
                label: 'Event-Zeitraum',
                field: 'icsDate',
                message: 'Format nicht erkannt. Beispiel: 22.11.2026 17:00-23:00'
            });
        } else if (parsed.startMin === 0 && parsed.endMin === (24 * 60 - 1)) {
            issues.push({
                severity: 'warn',
                where: 'config.eventWindow',
                label: 'Event-Zeitraum',
                field: 'icsDate',
                message: 'nur Datum gesetzt – Check-ins sind an diesem Tag ganztägig möglich'
            });
        }
    }

    if (rewards.enabled === true) {
        const missingPrizes = ['bronze', 'silver', 'gold']
            .filter(key => !String(prizes[key] || '').trim())
            .map(key => ({ bronze: 'Bronze', silver: 'Silber', gold: 'Gold' }[key]));
        if (missingPrizes.length > 0) {
            issues.push({
                severity: 'warn',
                where: 'config.rewards',
                label: 'Preise',
                field: 'prizes',
                message: `aktiv, aber ohne Preistext für ${missingPrizes.join(', ')}`
            });
        }
    }

    return issues;
}

function escapeAttr(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function bindAdminTableActions(container) {
    container.querySelectorAll('[data-admin-edit]').forEach((button) => {
        button.addEventListener('click', () => {
            const type = button.getAttribute('data-admin-edit');
            const id = button.getAttribute('data-admin-id');
            closeAdminPanel();
            if (type === 'station') {
                if (window.openStation) window.openStation(id);
                if (window.editStation) window.editStation(id);
            } else if (type === 'event' && window.editEvent) {
                window.editEvent(id);
            }
        });
    });
    container.querySelectorAll('[data-admin-sort]').forEach((button) => {
        button.addEventListener('click', () => {
            const field = button.getAttribute('data-admin-sort');
            if (!field) return;
            if (adminTableSort.field === field) {
                adminTableSort.direction = adminTableSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                adminTableSort.field = field;
                adminTableSort.direction = 'asc';
            }
            renderAdminDataTables();
        });
    });
}

function renderAdminDataTables() {
    const container = document.getElementById('admin-data-tables');
    const search = document.getElementById('admin-table-search');
    if (!container) return;

    const query = String(search?.value || '').trim().toLowerCase();
    const matches = (...values) => !query || values.some(value => String(value ?? '').toLowerCase().includes(query));
    const formatCoord = value => Number.isFinite(Number(value)) ? Number(value).toFixed(5) : '';
    const formatLink = value => value ? `<span title="${escapeAttr(value)}">🔗</span>` : '';
    const formatImage = value => value ? `<span title="Bild hinterlegt">✓</span>` : '';
    const formatTags = tags => Array.isArray(tags) ? tags.join('|') : '';
    const sortIndicator = field => adminTableSort.field === field ? (adminTableSort.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕';
    const sortButton = (field, label, classes = 'text-left py-2') => `
        <button type="button" data-admin-sort="${escapeAttr(field)}" class="font-bold hover:text-yellow-600 ${classes}">
            ${escapeHtml(label)}${sortIndicator(field)}
        </button>
    `;
    const compareStationValues = (a, b) => {
        if (adminTableSort.field === 'id') {
            const aNum = Number(a.id);
            const bNum = Number(b.id);
            if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
            return String(a.id ?? '').localeCompare(String(b.id ?? ''), 'de', { numeric: true, sensitivity: 'base' });
        }
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de', { numeric: true, sensitivity: 'base' });
    };
    const stations = (state.stations || []).filter(s => matches(
        s.id,
        s.name,
        s.desc,
        s.offer,
        s.link,
        s.lat,
        s.lng,
        formatTags(s.tags),
        s.image,
        s.time,
        s.likes
    )).sort((a, b) => adminTableSort.direction === 'asc' ? compareStationValues(a, b) : compareStationValues(b, a));
    const events = (state.events || []).filter(e => matches(
        e.id,
        e.time,
        e.title,
        e.desc,
        e.link,
        e.loc,
        e.lat,
        e.lng,
        e.color
    ));

    const stationRows = stations.map(s => `
        <tr class="border-t border-gray-200 dark:border-gray-700">
            <td class="py-2 px-3 font-mono font-bold">${escapeHtml(s.id)}</td>
            <td class="py-2 pr-2 font-bold">${escapeHtml(s.name)}</td>
            <td class="py-2 pr-2 text-gray-500 dark:text-gray-300">${escapeHtml(s.desc || '')}</td>
            <td class="py-2 pr-2 text-gray-500 dark:text-gray-300">${escapeHtml(s.offer || '')}</td>
            <td class="py-2 pr-2 text-center">${formatLink(s.link)}</td>
            <td class="py-2 pr-2 font-mono">${escapeHtml(formatCoord(s.lat))}</td>
            <td class="py-2 pr-2 font-mono">${escapeHtml(formatCoord(s.lng))}</td>
            <td class="py-2 pr-2">${escapeHtml(formatTags(s.tags))}</td>
            <td class="py-2 pr-2 text-center">${formatImage(s.image)}</td>
            <td class="py-2 pr-2">${escapeHtml(s.time || '')}</td>
            <td class="py-2 pr-2 text-right">${escapeHtml(s.likes ?? '')}</td>
            <td class="py-2 text-right"><button type="button" data-admin-edit="station" data-admin-id="${escapeAttr(s.id)}" class="underline font-bold text-blue-600">Bearbeiten</button></td>
        </tr>
    `).join('');

    const eventRows = events.map(e => `
        <tr class="border-t border-gray-200 dark:border-gray-700">
            <td class="py-2 px-3 font-mono">${escapeHtml(e.id)}</td>
            <td class="py-2 pr-2 font-mono">${escapeHtml(e.time)}</td>
            <td class="py-2 pr-2 font-bold">${escapeHtml(e.title)}</td>
            <td class="py-2 pr-2 text-gray-500 dark:text-gray-300">${escapeHtml(e.desc || '')}</td>
            <td class="py-2 pr-2 text-center">${formatLink(e.link)}</td>
            <td class="py-2 pr-2 text-gray-500 dark:text-gray-300">${escapeHtml(e.loc || '')}</td>
            <td class="py-2 pr-2 font-mono">${escapeHtml(formatCoord(e.lat))}</td>
            <td class="py-2 pr-2 font-mono">${escapeHtml(formatCoord(e.lng))}</td>
            <td class="py-2 pr-2">${escapeHtml(e.color || '')}</td>
            <td class="py-2 text-right"><button type="button" data-admin-edit="event" data-admin-id="${escapeAttr(e.id)}" class="underline font-bold text-blue-600">Bearbeiten</button></td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="bg-white/70 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-600 overflow-x-auto">
            <div class="px-3 py-2 font-bold">Stationen (${stations.length}/${(state.stations || []).length})</div>
            <table class="w-full min-w-[1180px]">
                <thead class="text-[10px] uppercase text-gray-500 bg-gray-50 dark:bg-gray-700">
                    <tr><th class="text-left py-2 px-3">${sortButton('id', 'Nr.', 'text-left')}</th><th class="text-left py-2">${sortButton('name', 'Name')}</th><th class="text-left py-2">Adresse</th><th class="text-left py-2">Werbetext</th><th class="text-center py-2">Link</th><th class="text-left py-2">Lat</th><th class="text-left py-2">Lng</th><th class="text-left py-2">Tags</th><th class="text-center py-2">Bild</th><th class="text-left py-2">Zeit</th><th class="text-right py-2">Likes</th><th class="text-right py-2 px-3">Aktion</th></tr>
                </thead>
                <tbody>${stationRows || '<tr><td colspan="12" class="p-3 text-gray-500">Keine Stationen gefunden.</td></tr>'}</tbody>
            </table>
        </div>
        <div class="bg-white/70 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-600 overflow-x-auto">
            <div class="px-3 py-2 font-bold">Events (${events.length}/${(state.events || []).length})</div>
            <table class="w-full min-w-[980px]">
                <thead class="text-[10px] uppercase text-gray-500 bg-gray-50 dark:bg-gray-700">
                    <tr><th class="text-left py-2 px-3">ID</th><th class="text-left py-2">Zeit</th><th class="text-left py-2">Titel</th><th class="text-left py-2">Beschreibung</th><th class="text-center py-2">Link</th><th class="text-left py-2">Ort</th><th class="text-left py-2">Lat</th><th class="text-left py-2">Lng</th><th class="text-left py-2">Farbe</th><th class="text-right py-2 px-3">Aktion</th></tr>
                </thead>
                <tbody>${eventRows || '<tr><td colspan="10" class="p-3 text-gray-500">Keine Events gefunden.</td></tr>'}</tbody>
            </table>
        </div>
    `;
    bindAdminTableActions(container);
}

function fillAdminPanel() {
    document.getElementById('admin-app-title').value = state.config.title || '';
    document.getElementById('admin-app-subtitle').value = state.config.subtitle || '';
    document.getElementById('admin-planning-mode').checked = state.config.planningMode || false;
    document.getElementById('admin-planning-text').value = state.config.planningText || '';

    document.getElementById('admin-tracking-code').value = state.config.trackingCode || '';

    const rewards = state.config.rewards || {};
    const thresholds = rewards.thresholds || {};
    const prizes = rewards.prizes || {};
    document.getElementById('admin-rewards-enabled').checked = rewards.enabled || false;
    document.getElementById('admin-reward-bronze-threshold').value = thresholds.bronze ?? 80;
    document.getElementById('admin-reward-silver-threshold').value = thresholds.silver ?? 90;
    document.getElementById('admin-reward-gold-threshold').value = thresholds.gold ?? 95;
    document.getElementById('admin-reward-bronze-prize').value = prizes.bronze || '';
    document.getElementById('admin-reward-silver-prize').value = prizes.silver || '';
    document.getElementById('admin-reward-gold-prize').value = prizes.gold || '';

    document.getElementById('admin-flyer1').value = state.downloads?.flyer1 || '';
    document.getElementById('admin-flyer2').value = state.downloads?.flyer2 || '';
    document.getElementById('admin-ics-date').value = state.downloads?.icsDate || '';

    loadUsers();
    renderAdminDataTables();
    const search = document.getElementById('admin-table-search');
    if (search) search.oninput = renderAdminDataTables;
    try { runDataValidation(); } catch (e) { }
    if (window.updateAdminUiAvailability) window.updateAdminUiAvailability();
}

export function closeAdminPanel() {
    const panel = document.getElementById('admin-panel');
    const main = document.getElementById('main-content');
    const nav = document.getElementById('bottom-nav');
    const floatingStatus = document.getElementById('floating-status');
    const smartAction = document.getElementById('smart-action-container');
    const visitorStart = document.getElementById('visitor-start-card');

    if (panel) panel.classList.add('hidden');
    if (main) main.classList.remove('hidden');
    if (nav) nav.classList.remove('hidden');
    if (floatingStatus) floatingStatus.classList.remove('hidden');
    if (smartAction) smartAction.classList.remove('hidden');
    if (visitorStart && visitorStart.dataset.wasVisibleBeforeAdmin === 'true') {
        visitorStart.classList.remove('hidden');
    }
    if (visitorStart) delete visitorStart.dataset.wasVisibleBeforeAdmin;
}

export function openAdminPanel() {
    if (!state.isAdmin) {
        showToast('Bitte zuerst als Admin einloggen.', 'info');
        return;
    }

    const panel = document.getElementById('admin-panel');
    const main = document.getElementById('main-content');
    const nav = document.getElementById('bottom-nav');
    const floatingStatus = document.getElementById('floating-status');
    const smartAction = document.getElementById('smart-action-container');
    const visitorStart = document.getElementById('visitor-start-card');
    if (!panel) return;

    if (visitorStart) {
        visitorStart.dataset.wasVisibleBeforeAdmin = visitorStart.classList.contains('hidden') ? 'false' : 'true';
        visitorStart.classList.add('hidden');
    }

    if (main) main.classList.add('hidden');
    if (nav) nav.classList.add('hidden');
    if (floatingStatus) floatingStatus.classList.add('hidden');
    if (smartAction) smartAction.classList.add('hidden');
    panel.classList.remove('hidden');
    panel.scrollTop = 0;
    fillAdminPanel();
}

export function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel && !panel.classList.contains('hidden')) closeAdminPanel();
    else openAdminPanel();
}

export function updateAdminUiAvailability() {
    const label = document.getElementById('admin-mode-label');
    if (label) {
        label.innerText = state.useLocalStorage ? '🔧 ADMIN (Lokal)' : '🔧 ADMIN (Online)';
    }

    const userList = document.getElementById('user-list');
    if (userList && state.useLocalStorage) {
        userList.innerHTML = '<div class="text-xs text-gray-500">Nur im Online-Modus verfügbar.</div>';
    }

    const onlineOnly = document.querySelectorAll('[data-online-only="true"]');
    onlineOnly.forEach((el) => {
        const isOnline = !state.useLocalStorage;
        el.disabled = !isOnline;
        if (!isOnline) {
            el.classList.add('opacity-50', 'cursor-not-allowed');
            el.title = 'Nur im Online-Modus verfügbar';
        } else {
            el.classList.remove('opacity-50', 'cursor-not-allowed');
            if (el.title === 'Nur im Online-Modus verfügbar') el.title = '';
        }
    });
}

export async function loadUsers() {
    if (!state.fb || !state.fb.getDocs) return;
    const listEl = document.getElementById('user-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<div class="text-xs text-gray-500">Lade Nutzer...</div>';

    try {
        const { collection, getDocs } = state.fb;
        const colRef = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'users');
        const snap = await getDocs(colRef);
        
        const users = [];
        snap.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
        
        renderUserList(users);
    } catch (e) {
        console.error("Load Users Error", e);
        listEl.innerHTML = '<div class="text-xs text-red-500">Fehler beim Laden</div>';
    }
}

function renderUserList(users) {
    const listEl = document.getElementById('user-list');
    if (!listEl) return;

    if (users.length === 0) {
        listEl.innerHTML = '<div class="text-xs text-gray-500">Keine Nutzer gefunden.</div>';
        return;
    }

    listEl.innerHTML = users.map(u => `
        <div class="flex justify-between items-center bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600 text-sm mb-1">
            <div class="overflow-hidden">
                <div class="font-bold truncate" title="${u.email}">${u.email}</div>
                <div class="text-[10px] text-gray-400 truncate">${u.id}</div>
            </div>
            ${u.email === 'michael@schellenberger.biz' 
                ? '<span class="text-[10px] bg-blue-100 text-blue-800 px-1 rounded">Super Admin</span>' 
                : `<button onclick="deleteUser('${u.id}', '${u.email}')" class="text-red-500 hover:bg-red-50 p-1 rounded" title="Löschen"><i class="ph ph-trash"></i></button>`
            }
        </div>
    `).join('');
}

export async function deleteUser(uid, email) {
    if (!confirm(`Soll der Nutzer "${email}" wirklich gelöscht werden? Er verliert dadurch sofort den Zugriff.`)) return;
    
    try {
        const { doc, deleteDoc } = state.fb;
        const userRef = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'users', uid);
        await deleteDoc(userRef);
        showToast(`Nutzer ${email} gelöscht`, 'success');
        loadUsers(); // Refresh list
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Löschen", 'error');
    }
}


export async function uploadSeedData() {
    if (!confirm("ACHTUNG: Dies überschreibt/ergänzt die Datenbank mit den Demo-Daten. Fortfahren?")) return;
    
    try {
        let count = 0;
        for (const s of seedStations) {
            await saveData('station', s);
            count++;
        }
        for (const e of seedEvents) {
            await saveData('event', e);
            count++;
        }
        showToast(`${count} Datensätze hochgeladen!`, 'success');
        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Upload", 'error');
    }
}



export async function importData() {
    const el = document.getElementById('export-area');
    if (!el) {
        showToast("JSON-Import wurde entfernt. Bitte CSV Import nutzen.", 'info');
        return;
    }
    const json = el.value;
    if (!json) {
        showToast("Kein JSON im Textfeld!", 'error');
        return;
    }

    try {
        const data = JSON.parse(json);
        if (!data.stations && !data.events) {
            throw new Error("Ungültiges Format (braucht 'stations' oder 'events' Array)");
        }

        if (confirm(`Importieren? ${data.stations?.length || 0} Stationen, ${data.events?.length || 0} Events.`)) {
            if (data.stations) {
                for (const s of data.stations) await saveData('station', s);
            }
            if (data.events) {
                for (const e of data.events) await saveData('event', e);
            }
            showToast("Import erfolgreich!", 'success');
            setTimeout(() => location.reload(), 1500);
        }
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Import: " + e.message, 'error');
    }
}

function downloadTextFile(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function normalizeTags(tagsValue) {
    if (!tagsValue) return [];
    // Prefer pipe-separated list inside CSV cell, fallback to comma.
    const raw = String(tagsValue);
    const parts = raw.includes('|') ? raw.split('|') : raw.split(',');
    return parts.map(s => s.trim()).filter(Boolean);
}

function mergeImportedItems(collection, importedItems) {
    const currentItems = Array.isArray(collection) ? collection : [];
    const itemMap = new Map(currentItems.map(item => [String(item.id), item]));
    importedItems.forEach(item => itemMap.set(String(item.id), item));
    return Array.from(itemMap.values());
}

function refreshAfterCsvImport() {
    if (window.renderList) window.renderList(state.stations);
    if (window.renderTimeline) window.renderTimeline();
    if (window.renderFilterBar) window.renderFilterBar();
    if (window.refreshMapMarkers) window.refreshMapMarkers();
    if (window.updatePassProgress) window.updatePassProgress();
    if (window.updateVisitorStartCard) window.updateVisitorStartCard();
    renderAdminDataTables();
    try { runDataValidation(); } catch (e) { }
}

export function exportStationsCsv() {
    renderAdminDataTables();
    const rows = (state.stations || []).map(s => ({
        id: s.id ?? '',
        name: s.name ?? '',
        address: s.desc ?? '',
        offer: s.offer ?? '',
        link: s.link ?? '',
        lat: s.lat ?? '',
        lng: s.lng ?? '',
        tags: Array.isArray(s.tags) ? s.tags.join('|') : '',
        image: s.image ?? '',
        time: s.time ?? '',
        likes: s.likes ?? ''
    }));
    const csv = toCsv(rows, STATION_CSV_COLUMNS, ';');
    downloadTextFile('stations.csv', csv, 'text/csv');
    showToast('stations.csv heruntergeladen', 'success');
}

export function downloadStationsCsvTemplate() {
    const csv = toCsv([{
        id: '',
        name: 'Beispielstation',
        address: 'Adresse oder Ort',
        offer: 'Kurzer Angebotstext/Werbetext mit maximal 250 Zeichen',
        link: 'https://beispiel.de',
        lat: '49.1620',
        lng: '10.5550',
        tags: 'Essen|Getränke',
        image: '',
        time: '',
        likes: ''
    }], STATION_CSV_COLUMNS, ';');
    downloadTextFile('stations-vorlage.csv', csv, 'text/csv');
    showToast('Stations-Vorlage heruntergeladen', 'success');
}

export function exportEventsCsv() {
    renderAdminDataTables();
    const rows = (state.events || []).map(e => ({
        id: e.id ?? '',
        time: e.time ?? '',
        title: e.title ?? '',
        description: e.desc ?? '',
        link: e.link ?? '',
        loc: e.loc ?? '',
        lat: e.lat ?? '',
        lng: e.lng ?? '',
        color: e.color ?? ''
    }));
    const csv = toCsv(rows, EVENT_CSV_COLUMNS, ';');
    downloadTextFile('events.csv', csv, 'text/csv');
    showToast('events.csv heruntergeladen', 'success');
}

export function downloadEventsCsvTemplate() {
    const csv = toCsv([{
        id: '',
        time: '17:00',
        title: 'Eröffnung',
        description: 'Kurze Beschreibung',
        link: 'https://beispiel.de',
        loc: 'Johanniskirche',
        lat: '49.1620',
        lng: '10.5550',
        color: 'yellow'
    }], EVENT_CSV_COLUMNS, ';');
    downloadTextFile('events-vorlage.csv', csv, 'text/csv');
    showToast('Event-Vorlage heruntergeladen', 'success');
}

async function importCsvGeneric(file, kind) {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
        showToast('CSV ist leer oder ungültig.', 'error');
        return;
    }

    if (kind === 'stations') {
        const mapped = rows.map((r, idx) => {
            const idRaw = (r.id ?? '').toString().trim();
            if (idRaw && !/^\d+$/.test(idRaw)) {
                throw new Error(`Station: id muss eine Zahl sein in Zeile ${idx + 2}`);
            }
            const id = idRaw ? Number(idRaw) : null;
            const station = {
                id: Number.isFinite(id) ? id : null,
                name: (r.name ?? '').toString().trim(),
                desc: (r.address ?? '').toString().trim(),
                offer: (r.offer ?? '').toString().trim(),
                link: (r.link ?? '').toString().trim(),
                lat: Number.parseFloat((r.lat ?? '').toString().trim()) || 0,
                lng: Number.parseFloat((r.lng ?? '').toString().trim()) || 0,
                tags: normalizeTags(r.tags),
            };
            const image = (r.image ?? '').toString().trim();
            if (image) station.image = image;
            const time = (r.time ?? '').toString().trim();
            if (time) station.time = time;
            const likes = Number.parseInt((r.likes ?? '').toString().trim(), 10);
            if (Number.isFinite(likes)) station.likes = likes;

            if (!station.name) {
                throw new Error(`Station: name fehlt in Zeile ${idx + 2}`);
            }
            return station;
        });

        // Auto-fill missing ids (max+1)
        let maxId = (state.stations || []).reduce((max, s) => Math.max(max, Number(s.id) || 0), 0);
        for (const s of mapped) {
            if (s.id === null) {
                maxId += 1;
                s.id = maxId;
            }
        }

        const issues = validateStations(mapped);
        const errors = issues.filter(issue => issue.severity === 'error');
        if (errors.length > 0) {
            throw new Error(`CSV hat ${errors.length} Fehler. Bitte erst Datencheck/Vorlage nutzen. Erstes Problem: ${errors[0].label} – ${errors[0].message}`);
        }
        const warnings = issues.filter(issue => issue.severity === 'warn');
        const warningText = warnings.length > 0 ? `\n\nHinweise: ${warnings.length} Warnung(en), z.B. ${warnings[0].label} – ${warnings[0].message}` : '';

        if (!confirm(`CSV importieren? ${mapped.length} Stationen werden gespeichert/überschrieben.${warningText}`)) return;
        for (const s of mapped) await saveData('station', s);
        state.stations = mergeImportedItems(state.stations, mapped);
        if (state.useLocalStorage) localStorage.setItem('stations_data', JSON.stringify(state.stations));
        refreshAfterCsvImport();
        showToast('Stationen importiert', 'success');
        return;
    }

    if (kind === 'events') {
        const mapped = rows.map((r, idx) => {
            const idRaw = (r.id ?? '').toString().trim();
            const evt = {
                id: idRaw || ('evt_' + Date.now() + '_' + idx),
                time: (r.time ?? '').toString().trim(),
                title: (r.title ?? '').toString().trim(),
                desc: (r.description ?? '').toString().trim(),
                link: (r.link ?? '').toString().trim(),
                loc: (r.loc ?? '').toString().trim(),
                lat: Number.parseFloat((r.lat ?? '').toString().trim()) || 0,
                lng: Number.parseFloat((r.lng ?? '').toString().trim()) || 0,
                color: (r.color ?? '').toString().trim() || 'yellow'
            };
            if (!evt.time || !evt.title) {
                throw new Error(`Event: time/title fehlt in Zeile ${idx + 2}`);
            }
            return evt;
        });

        const issues = validateEvents(mapped);
        const errors = issues.filter(issue => issue.severity === 'error');
        if (errors.length > 0) {
            throw new Error(`CSV hat ${errors.length} Fehler. Erstes Problem: ${errors[0].label} – ${errors[0].message}`);
        }
        const warnings = issues.filter(issue => issue.severity === 'warn');
        const warningText = warnings.length > 0 ? `\n\nHinweise: ${warnings.length} Warnung(en), z.B. ${warnings[0].label} – ${warnings[0].message}` : '';

        if (!confirm(`CSV importieren? ${mapped.length} Events werden gespeichert/überschrieben.${warningText}`)) return;
        for (const e of mapped) await saveData('event', e);
        state.events = mergeImportedItems(state.events, mapped);
        if (state.useLocalStorage) localStorage.setItem('events_data', JSON.stringify(state.events));
        refreshAfterCsvImport();
        showToast('Events importiert', 'success');
        return;
    }
}

export async function importStationsCsv() {
    const input = document.getElementById('admin-stations-csv');
    const file = input?.files?.[0];
    try {
        await importCsvGeneric(file, 'stations');
    } catch (e) {
        console.error(e);
        showToast('Import Fehler: ' + e.message, 'error');
    } finally {
        if (input) input.value = '';
    }
}

export async function importEventsCsv() {
    const input = document.getElementById('admin-events-csv');
    const file = input?.files?.[0];
    try {
        await importCsvGeneric(file, 'events');
    } catch (e) {
        console.error(e);
        showToast('Import Fehler: ' + e.message, 'error');
    } finally {
        if (input) input.value = '';
    }
}

export function runDataValidation() {
    const stationIssues = validateStations(state.stations);
    const eventIssues = validateEvents(state.events);
    const configIssues = getAdminConfigIssues();

    state.validation = {
        stations: stationIssues,
        events: eventIssues,
        config: configIssues
    };

    const el = document.getElementById('admin-validation-results');
    if (!el) return;

    const total = stationIssues.length + eventIssues.length + configIssues.length;
    if (total === 0) {
        el.innerHTML = `<div class="text-green-600 font-bold">✅ Keine Probleme gefunden.</div>`;
        return;
    }

    const renderIssue = (issue) => {
        const color = issue.severity === 'error' ? 'text-red-600' : 'text-yellow-700';
        const badge = issue.severity === 'error' ? 'ERROR' : 'WARN';
        const primaryLabel = issue.label || issue.where || 'Eintrag';
        const where = issue.where ? `${issue.where}${issue.field ? `.${issue.field}` : ''}` : '';
        const whereSuffix = (where && where !== primaryLabel) ? ` <span class="font-mono opacity-70">${where}</span>` : '';
        const openBtn = issue.stationId
            ? `<button type="button" class="ml-2 underline font-bold" data-validation-open="station" data-validation-id="${escapeAttr(issue.stationId)}">Öffnen</button>`
            : (issue.eventId ? `<button type="button" class="ml-2 underline font-bold" data-validation-open="event" data-validation-id="${escapeAttr(issue.eventId)}">Öffnen</button>` : '');
        return `<div class="${color}"><span class="font-bold">${badge}</span> <span class="font-bold">${primaryLabel}</span>${whereSuffix} – ${issue.message}${openBtn}</div>`;
    };

    const stationErr = stationIssues.filter(i => i.severity === 'error').length;
    const eventErr = eventIssues.filter(i => i.severity === 'error').length;
    const configErr = configIssues.filter(i => i.severity === 'error').length;
    const header = `
        <div class="font-bold mb-1">⚠️ Probleme gefunden: ${total}</div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
            Stationen: ${stationIssues.length} (Errors: ${stationErr}) · Events: ${eventIssues.length} (Errors: ${eventErr}) · Einstellungen: ${configIssues.length}
        </div>
    `;

    const details = [
        ...configIssues.slice(0, 10).map(renderIssue),
        ...stationIssues.slice(0, 10).map(renderIssue),
        ...eventIssues.slice(0, 10).map(renderIssue),
    ].join('');

    const more = total > 20 ? `<div class="text-[11px] text-gray-500 dark:text-gray-400 mt-2">… weitere Probleme vorhanden (gekürzt).</div>` : '';
    el.innerHTML = header + details + more;
    el.querySelectorAll('[data-validation-open]').forEach((button) => {
        button.addEventListener('click', () => {
            const type = button.getAttribute('data-validation-open');
            const id = button.getAttribute('data-validation-id');
            closeAdminPanel();
            if (type === 'station') {
                if (window.openStation) window.openStation(id);
                if (window.editStation) window.editStation(id);
            } else if (type === 'event' && window.editEvent) {
                window.editEvent(id);
            }
        });
    });

    // Toast only inside the admin panel (avoid showing this to normal users).
    try {
        const adminPanel = document.getElementById('admin-panel');
        const isAdminPanelOpen = !!adminPanel && !adminPanel.classList.contains('hidden');
        if (state.isAdmin && isAdminPanelOpen) {
            showToast(`Datencheck: ${total} Problem(e) gefunden`, stationErr + eventErr + configErr > 0 ? 'error' : 'info');
        }
    } catch (e) { }
}

export function handleAdminAdd(type) {
    // Determine type based on where it's called or just generic
    // Actually the button calls handleAdminAdd() without args usually, 
    // but let's assume we want to add a Station by default if no type.
    
    // We can show a prompt or just create a new empty one and open modal.
    // Let's create a new Station at map center.
    
    const center = state.map.getCenter();
    
    // Better ID generation: Max existing ID + 1 to avoid conflicts and keep it numeric if possible, 
    // or fallback to timestamp if we want safe unique IDs.
    // The user mentioned "cannot assign station number", which implies they want to set the ID.
    // We should probably allow editing the ID or just picking a free one.
    // Let's pick a high number for new stations to avoid collision with manual IDs (usually 1-50).
    // Or just find the first gap? No, gaps are confusing.
    // Let's use max + 1.
    const maxId = state.stations.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0);
    const newId = maxId + 1;
    
    const newStation = {
        id: newId,
        name: "Neue Station",
        desc: "Beschreibung hier...",
        lat: center.lat,
        lng: center.lng,
        tags: [],
        __draft: true
    };
    
    state.stations.push(newStation);
    
    // Refresh Map to show new pin immediately
    if (window.refreshMapMarkers) window.refreshMapMarkers();

    // Open Modal immediately for this new station and jump into edit mode
    if (window.openModal) {
        window.openModal(newStation);
    }
    if (window.editStation) {
        window.editStation(newId);
    }
    showToast(`Neue Station (${newId}) erstellt (Entwurf)`, 'info');
}

export function dumpData() {
    const el = document.getElementById('export-area');
    if (!el) {
        showToast("JSON Export wurde entfernt. Bitte CSV Export nutzen.", 'info');
        return;
    }
    const data = {
        stations: state.stations,
        events: state.events
    };
    const json = JSON.stringify(data, null, 2);
    el.value = json;
    showToast("Daten in Textfeld exportiert", 'success');
}

export function downloadDataJs() {
    showToast("data.js Export wurde entfernt. Bitte CSV Export nutzen.", 'info');
    return;
    const data = {
        stations: state.stations,
        events: state.events
    };
    
    const content = `import { state } from './state.js';
import { showToast } from './utils.js';
import { refreshMapMarkers } from './map.js';
import { renderList, renderTimeline } from './ui.js';

export const seedStations = ${JSON.stringify(data.stations, null, 4)};

export const seedEvents = ${JSON.stringify(data.events, null, 4)};

// ... keep the rest of data.js logic manually or just use this for seeding
// Note: This download is intended to update the seed data in data.js
`;

    const blob = new Blob([content], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.js';
    a.click();
    URL.revokeObjectURL(url);
    showToast("data.js heruntergeladen", 'success');
}

export function uploadFlyer(inputId, outputId) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    
    if (input.files && input.files[0]) {
        // Since we don't have a backend for arbitrary file upload easily without auth/storage setup validation,
        // and we want to keep it simple:
        // Ideally we would upload to Firebase Storage here.
        // For now, let's show an alert that this requires Storage configuration.
        // OR: Read as Base64 (DataURL) but that's huge for PDFs.
        
        // Let's assume the user puts a URL manually for now if they don't have storage.
        // But if they selected a file, we can try to upload if `state.fb` has storage.
        
        showToast("Upload-Funktion benötigt Firebase Storage Konfiguration. Bitte URL manuell eingeben.", 'info');
        console.warn("File upload not fully implemented without Storage bucket config.");
    }
}

export async function saveDownloads() {
    const flyer1 = document.getElementById('admin-flyer1').value;
    const flyer2 = document.getElementById('admin-flyer2').value;
    const icsDate = document.getElementById('admin-ics-date').value;
    const eventWindowRaw = (icsDate || '').trim();

    const isValidUrlOrEmpty = (v) => {
        const s = (v || '').trim();
        if (!s) return true;
        return /^https?:\/\//i.test(s);
    };

    if (!isValidUrlOrEmpty(flyer1) || !isValidUrlOrEmpty(flyer2)) {
        showToast('Bitte bei Flyer-URLs nur http(s):// Links verwenden (oder leer lassen).', 'error');
        return;
    }

    const parsedEventWindow = eventWindowRaw ? parseEventWindowConfig(eventWindowRaw) : null;
    if (eventWindowRaw && !parsedEventWindow) {
        showToast('Event-Zeitraum nicht erkannt. Beispiel: 22.11.2026 17:00-23:00', 'error');
        return;
    }

    const config = {
        downloads: {
            flyer1: (flyer1 || '').trim(),
            flyer2: (flyer2 || '').trim(),
            icsDate: eventWindowRaw
        }
    };
    
    try {
        if (state.useLocalStorage) {
            const old = JSON.parse(localStorage.getItem('app_config') || '{}');
            localStorage.setItem('app_config', JSON.stringify({...old, ...config}));
        } else {
            const { doc, setDoc } = state.fb;
            await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'), config, { merge: true });
        }

        // Update in-memory state immediately (no reload required)
        state.downloads = { ...(state.downloads || {}), ...config.downloads };
        state.config = { ...(state.config || {}), ...config };
        if (window.renderTimeline) window.renderTimeline();
        showToast("Downloads gespeichert", 'success');
        if (!eventWindowRaw) {
            setTimeout(() => showToast('Hinweis: Ohne Event-Zeitraum sind Programmstatus und Lichter‑Pass nicht zeitlich begrenzt.', 'info'), 350);
        } else if (parsedEventWindow.startMin === 0 && parsedEventWindow.endMin === (24 * 60 - 1)) {
            setTimeout(() => showToast('Hinweis: Nur Datum gesetzt – Check-ins sind ganztägig möglich.', 'info'), 350);
        } else {
            const label = formatEventWindowDe(parsedEventWindow);
            setTimeout(() => showToast(`Event-Zeitraum aktiv: ${label}`, 'success'), 350);
        }
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}

export async function sendBroadcast() {
    const text = document.getElementById('admin-broadcast-text').value;
    if (!text) return;
    
    if (!confirm(`Nachricht senden an alle?\n"${text}"`)) return;

    try {
        if (state.useLocalStorage || !state.db) {
            showToast("Sendefehler (nur Online)", 'error');
            return;
        }

        if (!state.fb?.doc || !state.fb?.setDoc) {
            const fbStore = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
            Object.assign(state.fb, fbStore);
        }

        const { doc, setDoc } = state.fb;
        if (typeof doc !== 'function' || typeof setDoc !== 'function') {
            showToast("Sendefehler (Firebase nicht bereit)", 'error');
            return;
        }
        await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'broadcast'), {
            text: text,
            timestamp: Date.now()
        });
        
        showToast("Nachricht gesendet!", 'success');
        document.getElementById('admin-broadcast-text').value = '';
    } catch (e) {
        console.error(e);
        showToast("Sendefehler (nur Online)", 'error');
    }
}

export async function deleteBroadcast() {
    if (!confirm("Wirklich die aktuelle Nachricht löschen?")) return;

    try {
        if (state.useLocalStorage || !state.db) {
            showToast("Fehler beim Löschen (nur Online)", 'error');
            return;
        }

        if (!state.fb?.doc || !state.fb?.deleteDoc) {
            const fbStore = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
            Object.assign(state.fb, fbStore);
        }

        const { doc, deleteDoc } = state.fb;
        if (typeof doc !== 'function' || typeof deleteDoc !== 'function') {
            showToast("Fehler beim Löschen (Firebase nicht bereit)", 'error');
            return;
        }
        await deleteDoc(doc(state.db, 'artifacts', state.appId, 'public', 'broadcast'));
        
        showToast("Nachricht gelöscht!", 'success');
        document.getElementById('admin-broadcast-text').value = '';
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Löschen (nur Online)", 'error');
    }
}

export async function saveAppConfig() {
    const titleRaw = document.getElementById('admin-app-title').value;
    const subtitleRaw = document.getElementById('admin-app-subtitle').value;
    const planningMode = document.getElementById('admin-planning-mode').checked;
    const planningText = document.getElementById('admin-planning-text').value;
    
    const title = (titleRaw || '').trim();
    const subtitle = (subtitleRaw || '').trim();
    const ignoredFields = [];
    if (!title && String(titleRaw || '').length === 0) ignoredFields.push('Titel');
    if (!subtitle && String(subtitleRaw || '').length === 0) ignoredFields.push('Untertitel');
    console.log("Saving App Config:", { title, subtitle, planningMode, planningText });

    // Safety: never overwrite title/subtitle with empty strings by accident.
    const config = { planningMode, planningText };
    if (title) config.title = title;
    if (subtitle) config.subtitle = subtitle;
    
    try {
        if (state.useLocalStorage) {
            const old = JSON.parse(localStorage.getItem('app_config') || '{}');
            localStorage.setItem('app_config', JSON.stringify({...old, ...config}));
        } else {
            const { doc, setDoc } = state.fb;
            await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'), config, { merge: true });
        }
        showToast("Konfiguration gespeichert", 'success');
        
        // Update UI immediately
        if (title) document.getElementById('app-title').innerText = title;
        if (subtitle) document.getElementById('app-subtitle').innerText = subtitle;
        
        // Update State
        state.config = { ...state.config, ...config };
        
        // Update Banner Visibility immediately
        if (window.checkPlanningMode) window.checkPlanningMode();
        
        if (planningMode) {
            showToast("⚠️ Planungs-Modus AKTIV", 'info');
            if (!String(planningText || '').trim()) {
                setTimeout(() => showToast('Hinweis: Planungs-Modus ist aktiv, aber ohne Hinweistext.', 'info'), 350);
            }
        }

        if (ignoredFields.length > 0) {
            setTimeout(() => showToast(`${ignoredFields.join(' & ')} leer – vorhandener Wert wurde nicht überschrieben.`, 'info'), 500);
        }

    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}

export async function saveTrackingConfig() {
    const trackingCode = (document.getElementById('admin-tracking-code').value || '').trim();

    // Safety: don't accidentally clear tracking by saving an empty textarea.
    if (!trackingCode) {
        showToast("Tracking Code ist leer – nicht gespeichert. (Zum Löschen extra Button nutzen.)", 'info');
        return;
    }
    
    // We just save it as string in the config
    const config = { trackingCode };
    
    try {
        if (state.useLocalStorage) {
            const old = JSON.parse(localStorage.getItem('app_config') || '{}');
            localStorage.setItem('app_config', JSON.stringify({...old, ...config}));
            state.config = {...state.config, ...config}; // Update state immediately
        } else {
            const { doc, setDoc } = state.fb;
            await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'), config, { merge: true });
            state.config = {...state.config, ...config}; // Update state immediately
        }
        showToast("Tracking Code gespeichert (Neuladen erforderlich)", 'success');
        
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}

export async function clearTrackingConfig() {
    if (!confirm("Tracking wirklich deaktivieren? (Tracking Code wird gelöscht)")) return;

    const config = { trackingCode: null };
    try {
        if (state.useLocalStorage) {
            const old = JSON.parse(localStorage.getItem('app_config') || '{}');
            localStorage.setItem('app_config', JSON.stringify({ ...old, ...config }));
            state.config = { ...state.config, ...config };
        } else {
            const { doc, setDoc } = state.fb;
            await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'), config, { merge: true });
            state.config = { ...state.config, ...config };
        }
        const el = document.getElementById('admin-tracking-code');
        if (el) el.value = '';
        showToast("Tracking deaktiviert", 'success');
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Löschen", 'error');
    }
}

export async function saveRewardsConfig() {
    const enabled = !!document.getElementById('admin-rewards-enabled')?.checked;

    const bronze = Number(document.getElementById('admin-reward-bronze-threshold')?.value || 80);
    const silver = Number(document.getElementById('admin-reward-silver-threshold')?.value || 90);
    const gold = Number(document.getElementById('admin-reward-gold-threshold')?.value || 95);

    const isValidPercent = (v) => Number.isFinite(v) && v >= 1 && v <= 100;
    if (!isValidPercent(bronze) || !isValidPercent(silver) || !isValidPercent(gold)) {
        showToast("Bitte gültige Prozentwerte (1–100) für Bronze/Silber/Gold eingeben.", 'error');
        return;
    }
    if (!(bronze < silver && silver < gold)) {
        showToast("Schwellen müssen aufsteigend sein: Bronze < Silber < Gold.", 'error');
        return;
    }

    const prizes = {
        bronze: (document.getElementById('admin-reward-bronze-prize')?.value || '').trim(),
        silver: (document.getElementById('admin-reward-silver-prize')?.value || '').trim(),
        gold: (document.getElementById('admin-reward-gold-prize')?.value || '').trim()
    };

    const missingPrizes = Object.entries({
        bronze: 'Bronze',
        silver: 'Silber',
        gold: 'Gold'
    }).filter(([key]) => !prizes[key]).map(([, label]) => label);
    if (enabled && missingPrizes.length === 3) {
        showToast("Preise sind aktiv, aber alle Preisfelder sind leer.", 'error');
        return;
    }

    const rewards = {
        enabled,
        thresholds: { bronze, silver, gold },
        prizes
    };

    const config = { rewards };

    try {
        if (state.useLocalStorage) {
            const old = JSON.parse(localStorage.getItem('app_config') || '{}');
            localStorage.setItem('app_config', JSON.stringify({ ...old, ...config }));
            state.config = { ...state.config, ...config };
        } else {
            const { doc, setDoc } = state.fb;
            await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'), config, { merge: true });
            state.config = { ...state.config, ...config };
        }
        showToast("Preise gespeichert", 'success');
        if (enabled && missingPrizes.length > 0) {
            setTimeout(() => showToast(`Hinweis: Kein Preistext für ${missingPrizes.join(', ')}.`, 'info'), 350);
        }
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}

function buildUsageSummary(checkins) {
    const stationLookup = new Map((state.stations || []).map(station => [String(station.id), station]));
    const byStation = new Map();
    const byHour = new Map();
    const byDate = new Map();
    const uniqueVisitors = new Set();
    const levels = { bronze: 0, silver: 0, gold: 0, diamond: 0 };

    checkins.forEach((event) => {
        const stationId = String(event.stationId || '');
        const station = stationLookup.get(stationId);
        const stationName = event.stationName || station?.name || `Station ${stationId}`;
        const current = byStation.get(stationId) || { stationId, stationName, count: 0, uniqueVisitors: new Set(), first: '', last: '' };
        current.count += 1;
        if (event.anonymousId) current.uniqueVisitors.add(event.anonymousId);
        if (event.checkedAt && (!current.first || event.checkedAt < current.first)) current.first = event.checkedAt;
        if (event.checkedAt && (!current.last || event.checkedAt > current.last)) current.last = event.checkedAt;
        byStation.set(stationId, current);

        if (event.anonymousId) uniqueVisitors.add(event.anonymousId);
        const hour = Number.isFinite(Number(event.hour)) ? `${String(Number(event.hour)).padStart(2, '0')}:00` : 'unbekannt';
        byHour.set(hour, (byHour.get(hour) || 0) + 1);
        const dateKey = event.dateKey || (event.checkedAt ? String(event.checkedAt).slice(0, 10) : 'unbekannt');
        byDate.set(dateKey, (byDate.get(dateKey) || 0) + 1);

        const level = String(event.reachedLevel || '').toLowerCase();
        if (levels[level] !== undefined) levels[level] += 1;
    });

    const stationRows = [...byStation.values()]
        .map(row => ({ ...row, uniqueVisitors: row.uniqueVisitors.size }))
        .sort((a, b) => b.count - a.count || a.stationName.localeCompare(b.stationName, 'de'));
    const hourlyRows = [...byHour.entries()].map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour.localeCompare(b.hour));
    const dateRows = [...byDate.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
    const totalStations = (state.stations || []).length;
    const visitedStationIds = new Set(stationRows.map(row => String(row.stationId)));
    const stationsWithoutCheckins = (state.stations || [])
        .filter(station => !visitedStationIds.has(String(station.id)))
        .map(station => ({ stationId: String(station.id), stationName: station.name || `Station ${station.id}` }));
    const peakHour = hourlyRows.slice().sort((a, b) => b.count - a.count)[0] || null;
    const topStation = stationRows[0] || null;
    const lowStations = stationRows.filter(row => row.count <= 2);

    const lessons = [];
    if (topStation) lessons.push(`Stärkste Station: ${topStation.stationName} mit ${topStation.count} Check-ins.`);
    if (peakHour) lessons.push(`Stärkstes Zeitfenster: ${peakHour.hour} mit ${peakHour.count} Check-ins.`);
    if (stationsWithoutCheckins.length > 0) lessons.push(`${stationsWithoutCheckins.length} Station(en) hatten keine Check-ins – Beschilderung/Position/Angebot prüfen.`);
    if (lowStations.length > 0) lessons.push(`${lowStations.length} Station(en) hatten nur 1–2 Check-ins – Lage, Attraktivität oder Sichtbarkeit prüfen.`);
    if (uniqueVisitors.size > 0) lessons.push(`Ø Check-ins pro aktivem Lichter‑Pass Gerät: ${(checkins.length / uniqueVisitors.size).toFixed(1)}.`);

    return {
        generatedAt: new Date().toISOString(),
        totalCheckins: checkins.length,
        uniqueVisitors: uniqueVisitors.size,
        totalStations,
        stationRows,
        hourlyRows,
        dateRows,
        stationsWithoutCheckins,
        levels,
        lessons
    };
}

function renderUsageSummary(summary) {
    const el = document.getElementById('admin-usage-summary');
    if (!el) return;
    if (!summary) {
        el.innerHTML = '<div class="text-gray-500">Noch keine Auswertung geladen.</div>';
        return;
    }

    const topStations = summary.stationRows.slice(0, 8).map(row => `
        <tr class="border-t border-gray-200 dark:border-gray-700">
            <td class="py-1 pr-2 font-mono">#${escapeHtml(row.stationId)}</td>
            <td class="py-1 pr-2 font-bold">${escapeHtml(row.stationName)}</td>
            <td class="py-1 text-right">${escapeHtml(row.count)}</td>
            <td class="py-1 text-right">${escapeHtml(row.uniqueVisitors)}</td>
        </tr>
    `).join('');
    const hours = summary.hourlyRows.map(row => `${escapeHtml(row.hour)}: ${escapeHtml(row.count)}`).join(' · ') || 'Keine Daten';
    const lessons = summary.lessons.map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Noch zu wenig Daten für Lessons Learned.</li>';

    el.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div class="p-3 rounded-lg bg-white/70 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600"><div class="text-[10px] uppercase text-gray-500">Check-ins</div><div class="text-xl font-extrabold">${summary.totalCheckins}</div></div>
            <div class="p-3 rounded-lg bg-white/70 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600"><div class="text-[10px] uppercase text-gray-500">Aktive Geräte</div><div class="text-xl font-extrabold">${summary.uniqueVisitors}</div></div>
            <div class="p-3 rounded-lg bg-white/70 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600"><div class="text-[10px] uppercase text-gray-500">Stationen genutzt</div><div class="text-xl font-extrabold">${summary.stationRows.length}/${summary.totalStations}</div></div>
            <div class="p-3 rounded-lg bg-white/70 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600"><div class="text-[10px] uppercase text-gray-500">Medaillen</div><div class="text-xs font-bold">B ${summary.levels.bronze} · S ${summary.levels.silver} · G ${summary.levels.gold}</div></div>
        </div>
        <div class="mb-3">
            <div class="font-bold mb-1">Check-ins nach Uhrzeit</div>
            <div class="text-xs text-gray-600 dark:text-gray-300">${hours}</div>
        </div>
        <div class="mb-3">
            <div class="font-bold mb-1">Top Stationen</div>
            <table class="w-full text-xs">
                <thead class="text-[10px] uppercase text-gray-500"><tr><th class="text-left">Nr.</th><th class="text-left">Station</th><th class="text-right">Check-ins</th><th class="text-right">Geräte</th></tr></thead>
                <tbody>${topStations || '<tr><td colspan="4" class="py-2 text-gray-500">Keine Check-ins vorhanden.</td></tr>'}</tbody>
            </table>
        </div>
        <div>
            <div class="font-bold mb-1">Lessons Learned</div>
            <ul class="list-disc pl-5 text-xs text-gray-600 dark:text-gray-300 space-y-1">${lessons}</ul>
        </div>
    `;
}

function usageSummaryToText(summary) {
    const createdAt = new Date(summary.generatedAt).toLocaleString('de-DE');
    const stationCoverage = summary.totalStations > 0
        ? Math.round((summary.stationRows.length / summary.totalStations) * 100)
        : 0;
    const averageCheckins = summary.uniqueVisitors > 0
        ? (summary.totalCheckins / summary.uniqueVisitors).toFixed(1).replace('.', ',')
        : '0';
    const peakHour = summary.hourlyRows.slice().sort((a, b) => b.count - a.count)[0] || null;
    const topStation = summary.stationRows[0] || null;
    const medalLine = [
        `Bronze ${summary.levels.bronze}`,
        `Silber ${summary.levels.silver}`,
        `Gold ${summary.levels.gold}`,
        `Diamant ${summary.levels.diamond}`
    ].join(' · ');
    const formatRows = (rows, emptyText) => rows.length ? rows : [`- ${emptyText}`];
    const topStationRows = formatRows(
        summary.stationRows.slice(0, 12).map((row, index) => {
            return `${String(index + 1).padStart(2, '0')}. #${row.stationId} ${row.stationName} – ${row.count} Check-in${row.count === 1 ? '' : 's'} (${row.uniqueVisitors} Gerät${row.uniqueVisitors === 1 ? '' : 'e'})`;
        }),
        'Keine Daten vorhanden'
    );
    const hourRows = formatRows(
        summary.hourlyRows.map(row => `- ${row.hour}: ${row.count} Check-in${row.count === 1 ? '' : 's'}`),
        'Keine Daten vorhanden'
    );
    const unusedStationRows = formatRows(
        summary.stationsWithoutCheckins.map(row => `- #${row.stationId} ${row.stationName}`),
        'Keine'
    );
    const lessonRows = formatRows(
        summary.lessons.map(item => `- ${item}`),
        'Noch zu wenig Daten für belastbare Erkenntnisse'
    );

    const lines = [
        '🕯️ Lichternacht App',
        'Anonyme Nutzungsanalyse',
        '',
        `Erstellt am ${createdAt}`,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Kurzüberblick',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `• Check-ins gesamt: ${summary.totalCheckins}`,
        `• Aktive Lichter‑Pass Geräte: ${summary.uniqueVisitors}`,
        `• Ø Check-ins pro aktivem Gerät: ${averageCheckins}`,
        `• Stationen mit Check-ins: ${summary.stationRows.length}/${summary.totalStations} (${stationCoverage} %)`,
        `• Medaillen erreicht: ${medalLine}`,
        '',
        'Top-Erkenntnisse',
        `• Stärkste Station: ${topStation ? `#${topStation.stationId} ${topStation.stationName} (${topStation.count})` : 'noch keine Daten'}`,
        `• Stärkste Uhrzeit: ${peakHour ? `${peakHour.hour} (${peakHour.count})` : 'noch keine Daten'}`,
        `• Stationen ohne Check-ins: ${summary.stationsWithoutCheckins.length}`,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Check-ins nach Uhrzeit',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ...hourRows,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Stationen nach Check-ins',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ...topStationRows,
        ...(summary.stationRows.length > 12 ? [`… ${summary.stationRows.length - 12} weitere Station(en) im CSV-Export.`] : []),
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Stationen ohne Check-ins',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ...unusedStationRows,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Lessons Learned',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ...lessonRows,
        '',
        'Hinweis: Diese Auswertung ist anonym. Es werden keine Namen, E-Mail-Adressen oder GPS-Koordinaten aus normalen Check-ins ausgewertet.'
    ];
    return lines.join('\n');
}

function downloadUsageCsv(summary) {
    const rows = [
        ['stationId', 'stationName', 'checkins', 'uniqueDevices', 'firstCheckin', 'lastCheckin'].join(';'),
        ...summary.stationRows.map(row => [
            toCsvValue(row.stationId),
            toCsvValue(row.stationName),
            toCsvValue(row.count),
            toCsvValue(row.uniqueVisitors),
            toCsvValue(row.first),
            toCsvValue(row.last)
        ].join(';'))
    ];
    downloadTextFile('lichterpass-nutzungsanalyse-stationen.csv', `\uFEFF${rows.join('\n')}\n`, 'text/csv;charset=utf-8');
}

function toCsvValue(value) {
    const s = String(value ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function loadUsageAnalytics() {
    if (state.useLocalStorage || !state.db || !state.fb?.collection || !state.fb?.getDocs) {
        showToast('Nutzungsanalyse ist nur online verfügbar.', 'error');
        return;
    }
    try {
        const colRef = state.fb.collection(state.db, 'artifacts', state.appId, 'public', 'data', 'checkins');
        const snap = await state.fb.getDocs(colRef);
        const checkins = [];
        snap.forEach(docSnap => checkins.push({ id: docSnap.id, ...docSnap.data() }));
        state.usageSummary = buildUsageSummary(checkins);
        renderUsageSummary(state.usageSummary);
        showToast('Nutzungsanalyse geladen', 'success');
    } catch (e) {
        console.error('Usage analytics load failed', e);
        showToast('Nutzungsanalyse konnte nicht geladen werden.', 'error');
    }
}

export function exportUsageAnalyticsCsv() {
    if (!state.usageSummary) {
        showToast('Bitte zuerst Nutzungsanalyse laden.', 'info');
        return;
    }
    downloadUsageCsv(state.usageSummary);
    showToast('Nutzungsanalyse exportiert.', 'success');
}

export async function sendUsageSummaryEmail() {
    if (!state.usageSummary) {
        showToast('Bitte zuerst Nutzungsanalyse laden.', 'info');
        return;
    }
    try {
        const res = await fetch('./api/bug-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: 'Lichternacht App – anonyme Nutzungsanalyse',
                text: usageSummaryToText(state.usageSummary),
                meta: { type: 'usage_summary', appId: state.appId || 'unknown' }
            })
        });
        if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
        showToast('Summary-Mail gesendet.', 'success');
    } catch (e) {
        console.error('Usage summary email failed', e);
        showToast('Summary-Mail konnte nicht gesendet werden.', 'error');
    }
}

export function renderUsageAnalyticsPlaceholder() {
    renderUsageSummary(state.usageSummary || null);
}

export async function resetLikes() {
    if (!confirm("WARNUNG: Möchtest du wirklich ALLE 'Likes' (Flammen) auf 0 zurücksetzen? Das kann nicht rückgängig gemacht werden.")) return;

    // Safety check for writeBatch
    if (!state.fb || !state.fb.writeBatch) {
        showToast("Fehler: Firebase nicht vollständig geladen. Bitte Seite neu laden.", 'error');
        console.error("writeBatch missing in state.fb", state.fb);
        return;
    }

    try {
        if (state.useLocalStorage) {
            // Local mode: Just update state and save
            state.stations.forEach(s => s.likes = 0);
            localStorage.setItem('stations_data', JSON.stringify(state.stations));
        } else {
            // Firebase mode: Batch update
            // Note: Firestore Batch limit is 500. We might need chunks if stations > 500.
            const { writeBatch, doc } = state.fb;
            const batch = writeBatch(state.db);
            
            state.stations.forEach(s => {
                const ref = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'stations', s.id.toString());
                batch.update(ref, { likes: 0 });
                // Also update local state optimistically
                s.likes = 0;
            });
            
            await batch.commit();
        }
        
        showToast("Alle Likes wurden zurückgesetzt.", 'success');
        // Refresh UI
        if (window.renderList) window.renderList(state.stations);
        if (window.openStation && state.activeStationId) {
             const s = state.stations.find(x => x.id == state.activeStationId);
             if(s) window.openStation(s.id); // Refresh Modal
        }

    } catch (e) {
        console.error(e);
        showToast("Fehler beim Zurücksetzen der Likes", 'error');
    }
}

export async function startNewYear() {
    if (!confirm("⚠️ ACHTUNG: 'Neues Jahr starten' führt folgende Aktionen aus:\n\n1. Alle Likes auf 0 setzen.\n2. Aktuelle Broadcast-Nachricht löschen.\n3. Medaillen-Statistiken zurücksetzen.\n4. Anonyme Check-in-Auswertung löschen.\n5. ALLE Besucher-Listen auf den Handys der Nutzer löschen (beim nächsten Start).\n\nWirklich fortfahren?")) return;
    
    const code = prompt("Bitte 'RESET' eingeben zur Bestätigung:");
    if (code !== 'RESET') return;

    showToast("Starte Reset... Bitte warten.", 'info');

    try {
        const { writeBatch, doc, deleteDoc, setDoc, collection, getDocs } = state.fb;
        const batch = writeBatch(state.db);

        // 1. Reset Likes (Batch)
        state.stations.forEach(s => {
            const ref = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'stations', s.id.toString());
            batch.update(ref, { likes: 0 });
            s.likes = 0; // Optimistic local update
        });

        // 2. Reset Global Stats (Batch)
        const statsRef = doc(state.db, 'global', 'stats');
        batch.set(statsRef, { 
            count_bronze: 0, 
            count_silver: 0, 
            count_gold: 0, 
            count_diamond: 0 
        });

        // 3. Delete anonymous check-in analytics
        const checkinsRef = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'checkins');
        const checkinsSnap = await getDocs(checkinsRef);
        checkinsSnap.forEach(docSnap => batch.delete(docSnap.ref));

        // Commit Batch
        await batch.commit();

        // 4. Delete Broadcast (Single Op)
        const broadcastRef = doc(state.db, 'artifacts', state.appId, 'public', 'broadcast');
        await deleteDoc(broadcastRef).catch(() => {}); // Ignore if not exists

        // 5. Update Global Config to trigger Client Wipe
        const globalConfigRef = doc(state.db, 'global', 'config');
        await setDoc(globalConfigRef, { 
            resetToken: Date.now() 
        }, { merge: true });

        showToast("✅ Neues Jahr erfolgreich gestartet!", 'success');
        
        // Refresh UI
        if (window.renderList) window.renderList(state.stations);
        if (window.openStation && state.activeStationId) {
             const s = state.stations.find(x => x.id == state.activeStationId);
             if(s) window.openStation(s.id);
        }
        document.getElementById('admin-broadcast-text').value = '';

    } catch (e) {
        console.error("New Year Reset Error", e);
        showToast("Fehler beim Reset: " + e.message, 'error');
    }
}

export function resetApp() {
    console.warn("resetApp is deprecated");
    localStorage.clear();
    location.reload();
}

export function testPlanningBanner() {
    alert("Test-Funktion aufgerufen!"); // DEBUG
    console.log("Testing Planning Banner (Dynamic Mode)...");

    // Remove any existing test banner
    const existing = document.getElementById('test-planning-overlay');
    if (existing) existing.remove();

    // Create container
    const overlay = document.createElement('div');
    overlay.id = 'test-planning-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(0, 0, 0, 0.85);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(8px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        opacity: 0;
        transition: opacity 0.3s ease-out;
    `;

    // Create content card
    // Note: We use innerHTML for simplicity as we did in ui.js to match exact structure
    
    // Content
    const inputTextArea = document.getElementById('admin-planning-text');
    const customText = inputTextArea && inputTextArea.value ? inputTextArea.value : "Dies ist ein Test für den Planungs-Modus.";

    overlay.innerHTML = `
        <div style="
            background: white; 
            padding: 32px; 
            border-radius: 24px; 
            max-width: 400px; 
            width: 90%; 
            text-align: center; 
            position: relative; 
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255,255,255,0.1);
            transform: scale(0.95);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
            <button id="close-test-banner" style="
                position: absolute; 
                top: 16px; 
                right: 16px; 
                background: #f3f4f6; 
                border: none; 
                width: 32px; 
                height: 32px; 
                border-radius: 50%; 
                font-size: 20px; 
                line-height: 1;
                cursor: pointer; 
                color: #6b7280;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">&times;</button>
            
            <div style="font-size: 64px; margin-bottom: 16px; line-height: 1;">🚧</div>
            
            <h2 style="
                font-size: 24px; 
                font-weight: 800; 
                margin: 0 0 12px 0; 
                color: #111827; 
                font-family: inherit;
            ">Vorschau Modus</h2>
            
            <p style="
                font-size: 16px; 
                color: #4b5563; 
                margin-bottom: 24px; 
                line-height: 1.6;
            ">
                ${customText}
            </p>
            
            <button id="close-test-btn-main" style="
                background-color: #eab308; 
                color: white; 
                font-weight: bold; 
                padding: 14px 32px; 
                border-radius: 12px; 
                border: none; 
                cursor: pointer; 
                width: 100%; 
                font-size: 16px; 
                box-shadow: 0 4px 6px -1px rgba(234, 179, 8, 0.3);
                transition: transform 0.1s;
            " onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
                Schließen
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Trigger Animation
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.firstElementChild.style.transform = 'scale(1)';
    });

    // Event Listener for Close (both X and Button)
    const closer = () => {
        // Fade out
        overlay.style.opacity = '0';
        overlay.firstElementChild.style.transform = 'scale(0.95)';
        setTimeout(() => overlay.remove(), 300);
    };
    document.getElementById('close-test-banner').addEventListener('click', closer);
    document.getElementById('close-test-btn-main').addEventListener('click', closer);
    
    showToast("Design-Update v1.4.45 geladen", 'success');
}
