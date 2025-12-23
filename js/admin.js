
import { state } from './state.js';
import { showToast } from './utils.js';

export function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) panel.classList.toggle('hidden');
}

export function uploadSeedData() {
    console.log("uploadSeedData called");
}

export function resetApp() {
    localStorage.clear();
    location.reload();
}

export function importData() {
    console.log("importData called");
}

export function handleAdminAdd(type) {
    console.log("handleAdminAdd called", type);
}

export function dumpData() {
    console.log("Dumping data:", state);
}

export function downloadDataJs() {
    console.log("Downloading data.js...");
}

export function uploadFlyer() {
    console.log("uploadFlyer called");
}

export function saveDownloads() {
    console.log("saveDownloads called");
}

export function sendBroadcast() {
    console.log("sendBroadcast called");
}

export function saveAppConfig() {
    console.log("saveAppConfig called");
}
