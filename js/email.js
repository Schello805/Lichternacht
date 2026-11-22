import { formatSample, stationSummaryLine, DIAGNOSTIC_LABELS } from './usage-analytics.js?v=1.4.341';

const APP_URL = 'https://lichternacht-bechhofen.de/';
const APP_NAME = 'Lichternacht Bechhofen';
const GAME_RULES_URL = `${APP_URL}gewinnspiel.html`;
const PRIVACY_URL = `${APP_URL}datenschutz.html`;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
}

function renderButton(url, label, color = '#2563eb') {
    return `
        <a href="${escapeHtml(url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:800;border-radius:12px;padding:12px 18px;margin:4px 8px 4px 0;">
            ${escapeHtml(label)}
        </a>
    `;
}

function renderSection(title, body) {
    return `
        <tr>
            <td style="padding:18px 24px 0;">
                <h2 style="font-size:16px;line-height:1.35;margin:0 0 10px;color:#111827;">${escapeHtml(title)}</h2>
                <div style="font-size:14px;line-height:1.65;color:#374151;">${body}</div>
            </td>
        </tr>
    `;
}

function renderDefinitionList(items) {
    const rows = items
        .filter(item => item && item.value !== undefined && item.value !== null && String(item.value).trim() !== '')
        .map(item => `
            <tr>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em;width:34%;">${escapeHtml(item.label)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:700;">${escapeHtml(item.value)}</td>
            </tr>
        `).join('');
    return `<table role="presentation" style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">${rows}</table>`;
}

function renderList(items, emptyText = 'Keine Daten vorhanden') {
    const rows = (items && items.length ? items : [emptyText]).map(item => `
        <li style="margin:0 0 7px;">${escapeHtml(item)}</li>
    `).join('');
    return `<ul style="padding-left:20px;margin:0;">${rows}</ul>`;
}

function renderShell({ title, eyebrow = 'Lichternacht App', intro = '', sections = [], cta = '', footerNote = '' }) {
    const sectionRows = sections.map(section => renderSection(section.title, section.body)).join('');
    return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" style="width:100%;max-width:680px;border-collapse:collapse;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,.12);">
          <tr>
            <td style="padding:26px 24px;background:linear-gradient(135deg,#111827,#1f2937 58%,#f5b800);color:#ffffff;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#fde68a;font-weight:800;">${escapeHtml(eyebrow)}</div>
              <h1 style="font-size:26px;line-height:1.18;margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;">${escapeHtml(title)}</h1>
              ${intro ? `<p style="font-size:15px;line-height:1.6;margin:12px 0 0;color:#f9fafb;">${escapeHtml(intro)}</p>` : ''}
            </td>
          </tr>
          ${sectionRows}
          ${cta ? `<tr><td style="padding:22px 24px 4px;">${cta}</td></tr>` : ''}
          <tr>
            <td style="padding:22px 24px 26px;color:#6b7280;font-size:12px;line-height:1.6;">
              ${footerNote ? `<div style="margin-bottom:10px;">${escapeHtml(footerNote)}</div>` : ''}
              <div>
                <a href="${APP_URL}" style="color:#2563eb;font-weight:700;">Web-App öffnen</a>
                <span style="color:#d1d5db;"> · </span>
                <a href="${GAME_RULES_URL}" style="color:#2563eb;font-weight:700;">Gewinnspielinfos</a>
                <span style="color:#d1d5db;"> · </span>
                <a href="${PRIVACY_URL}" style="color:#2563eb;font-weight:700;">Datenschutz</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildFeedbackEmailHtml(report) {
    return renderShell({
        title: 'Neues Feedback',
        intro: 'Ein Besucher hat über die Web-App eine Rückmeldung gesendet.',
        sections: [
            {
                title: 'Nachricht',
                body: `<div style="padding:14px 16px;background:#fefce8;border:1px solid #fde68a;border-radius:12px;color:#713f12;">${nl2br(report.description || '')}</div>`
            },
            {
                title: 'Technische Infos',
                body: renderDefinitionList([
                    { label: 'App', value: report.appId || 'unknown' },
                    { label: 'Zeit', value: report.dateStr || '' },
                    { label: 'URL', value: report.url || '' },
                    { label: 'User', value: `${report.user || 'anonymous'} (${report.userId || 'n/a'})` },
                    { label: 'Browser', value: report.userAgent || '' }
                ])
            }
        ],
        cta: renderButton(APP_URL, 'Web-App öffnen'),
        footerNote: 'Diese Mail wurde automatisch über das Feedback-Formular der App erstellt.'
    });
}

export function buildPassParticipationEmailHtml({ name, email, visited, total, appId, visitedLines }) {
    return renderShell({
        title: 'Neue Lichter‑Pass Teilnahme',
        intro: 'Ein Nutzer möchte am Gewinnspiel teilnehmen.',
        sections: [
            {
                title: 'Teilnehmer',
                body: renderDefinitionList([
                    { label: 'Name', value: name },
                    { label: 'E-Mail', value: email },
                    { label: 'Fortschritt', value: `${visited}/${total} Stationen` },
                    { label: 'App', value: appId || 'unknown' }
                ])
            },
            {
                title: 'Bisher besuchte Stationen',
                body: renderList(visitedLines)
            }
        ],
        cta: `${renderButton(APP_URL, 'Web-App öffnen')}${renderButton(GAME_RULES_URL, 'Gewinnspielinfos ansehen', '#111827')}`,
        footerNote: 'Der Nutzer hat Name und E-Mail freiwillig für die Gewinnspiel-Teilnahme angegeben.'
    });
}

export function buildPrizeClaimEmailHtml({ claimId, level, prizeText, visited, total, name, contact, note, appId, visitedLines }) {
    return renderShell({
        title: 'Preisanforderung',
        intro: 'Ein erreichter Lichter‑Pass Preis wurde angefordert.',
        sections: [
            {
                title: 'Anforderung',
                body: renderDefinitionList([
                    { label: 'ID', value: claimId },
                    { label: 'Preisstufe', value: level },
                    { label: 'Preis', value: prizeText || '-' },
                    { label: 'Fortschritt', value: `${visited}/${total} Stationen` },
                    { label: 'Name', value: name },
                    { label: 'Kontakt', value: contact },
                    { label: 'Hinweis', value: note || '-' },
                    { label: 'App', value: appId || 'unknown' }
                ])
            },
            {
                title: 'Besuchte Stationen',
                body: renderList(visitedLines)
            }
        ],
        cta: `${renderButton(APP_URL, 'Web-App öffnen')}${renderButton(GAME_RULES_URL, 'Gewinnspielinfos ansehen', '#111827')}`,
        footerNote: 'Bitte Kontakt aufnehmen und die Übergabe des Preises organisieren.'
    });
}

export function buildUsageSummaryEmailHtml(summary) {
    return renderShell({
        title: 'Nutzungsanalyse',
        intro: summary.scopeLabel || 'Veranstaltungsrückblick',
        sections: [
            { title: 'Bestätigte Check-ins', body: renderDefinitionList([
                { label: 'Check-ins', value: summary.totalCheckins },
                { label: 'Geräte mit Check-in', value: summary.uniqueVisitors },
                { label: 'Stationen mit Check-ins', value: summary.stationsWithCheckins + '/' + summary.totalStations },
                { label: 'Ø zugeordnete Check-ins pro Gerät', value: summary.averageCheckins == null ? '–' : summary.averageCheckins.toLocaleString('de-DE', { maximumFractionDigits: 1 }) },
                { label: 'Medaillenmeldungen (je Gerät/Stufe)', value: `Bronze ${summary.levels.bronze} · Silber ${summary.levels.silver} · Gold ${summary.levels.gold} · Diamant ${summary.levels.diamond}` }
            ]) },
            { title: 'Freiwillige Standorterfassung – getrennte Datengruppe', body: renderList([summary.cohort.available ? formatSample(summary.cohort.checkedIn, summary.cohort.visits) + ' Browser-Stationsbesuche mit Check-in. Keine Anzahl unterschiedlicher Personen.' : 'Quelle derzeit nicht verfügbar.']) },
            { title: 'Zeitverlauf (Europe/Berlin)', body: renderList(summary.timelineRows.map(row => row.date + ' ' + row.time + ': ' + row.count + ' Check-ins'), 'Keine zeitlich zuordenbaren Daten.') },
            { title: 'Stationen', body: renderList(summary.stationRows.map(row => stationSummaryLine(row, summary.cohort.available))) },
            { title: 'Freiwillige Diagnose', body: renderList([
                summary.diagnostics.available ? summary.diagnostics.attempts + ' erfasste Versuche. Nur Daten ab Aktivierung, keine rückwirkende Fehleranalyse.' : 'Diagnosequelle derzeit nicht verfügbar.',
                ...Object.entries(summary.diagnostics.outcomes).map(([stage, amount]) => DIAGNOSTIC_LABELS[stage] + ': ' + amount)
            ]) },
            { title: 'Einordnung', body: renderList(summary.lessons) }
        ],
        cta: renderButton(APP_URL, 'Web-App öffnen'),
        footerNote: 'Keine vollständige Besucherzählung. Ohne abgesagte Stationen. Keine Namen, Kontaktdaten oder GPS-Koordinaten in dieser Auswertung.'
    });
}
