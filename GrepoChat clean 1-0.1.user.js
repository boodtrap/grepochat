// ==UserScript==
// @name         GrepoChat clean 1
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Initieert werelden, gebruikers, instellingen en voorbereidend kanaalbeheer voor Grepolis Chat
// @match        *://*.grepolis.com/*
// @author       Zambia1972
// @grant        none
// @require      https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.11.0/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-compat.js
// ==/UserScript==

(function() {
    'use strict';

    // =============================================
    // 1. GLOBALE CONFIGURATIE EN INITIALISATIE
    // =============================================

    // - Firebase configuratie

    const firebaseConfig = {
        apiKey: "AIzaSyDDrzMwH87tLO5tKGORcPSDpg6UdVIFX9U",
        authDomain: "grepochat-ff097.firebaseapp.com",
        projectId: "grepochat-ff097",
        storageBucket: "grepochat-ff097.appspot.com",
        messagingSenderId: "855439763418",
        appId: "1:855439763418:web:7d567af9844bd1d72d02e3"
    };

    // - Constante variabelen

    const wereldId = window.Game?.world_id || "onbekend";

    // - DOM selectoren

    // - Cache variabelen

    let playersCache = null;
    let alliancesCache = null;
    let townsCache = null;
    let islandsCache = null;
    let lastLoadTime = 0;
    let userId = null;

    // =============================================
    // 2. ALGEMENE HULPFUNCTIES
    // =============================================

    // - insertBBCode()

    const insertBBCode = (textarea, startTag, endTag = startTag, forceOutside = false) => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        const insert = `${startTag}${selected}${endTag}`;
        textarea.value = before + insert + after;
        const cursorPos = start + (forceOutside ? insert.length : startTag.length);
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();
    };

    // - escapeHtml()

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // - DOM creatie helpers

    function waitFor(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            (function check() {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (Date.now() - start > timeout) return reject(`Timeout waiting for ${selector}`);
                requestAnimationFrame(check);
            })();
        });
    }

    // - Event handlers

    // 6. Data laden
    async function loadPlayersData() {
        if (playersCache) return playersCache;
        const world = window.Game.world_id;
        const text = await fetch(`https://${world}.grepolis.com/data/players.txt`).then(r => r.text());
        playersCache = text.split('\n').map(line => {
            const parts = line.split(',');
            const id = parts[0]?.trim();
            const name = decodeURIComponent(parts[1]?.trim().replace(/\+/g, ' '));
            return { id, name };
        }).filter(p => p.name && p.id);

    }

    async function loadAllianceData() {
        if (alliancesCache) return alliancesCache;

        const world = window.Game?.world_id;
        if (!world) return [];

        try {
            const text = await fetch(`https://${world}.grepolis.com/data/alliances.txt`).then(r => r.text());
            alliancesCache = text.split('\n').map(line => {
                const parts = line.split(',');
                const id = parts[0]?.trim();
                const name = decodeURIComponent(parts[1]?.trim().replace(/\+/g, ' '));
                return { id, name };
            }).filter(a => a.id && a.name);

            return alliancesCache;
        } catch (e) {
            console.error("Fout bij ophalen alliances.txt:", e);
            return [];
        }
    }


    async function getAllianceId(allyName) {
    const normalize = s =>
        decodeURIComponent(s.replace(/\+/g, ' '))
            .replace(/\u00A0/g, ' ') // non-breaking space
            .trim().toLowerCase();

    const target = normalize(allyName);

    console.log("[DEBUG] Zoek naar alliantie:", target);

    try {
        const world = window.Game.world_id;
        const response = await fetch(`https://${world}.grepolis.com/data/alliances.txt`);
        const text = await response.text();
        const lines = text.split('\n');

        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length < 2) continue;

            const id = parts[0].trim();
            const encodedName = parts[1].trim();
            const decodedName = normalize(decodeURIComponent(encodedName)); 
            console.log(`[CHECK] Vergelijk: "${decodedName}" == "${target}"`);

            if (decodedName === target) {
                console.log(`[✅] Match: ${decodedName} → ID ${id}`);
                return id;
            }
        }

        console.warn(`[❌] Geen alliantie-match gevonden voor: "${allyName}" → "${target}"`);
        return null;
    } catch (e) {
        console.error('Fout bij ophalen alliances.txt:', e);
        return null;
    }
}

    async function loadTownData() {
        if (townsCache) return townsCache;
        const world = window.Game.world_id;
        const text = await fetch(`https://${world}.grepolis.com/data/towns.txt`).then(r => r.text());
        townsCache = text.split('\n').map(line => {
            const parts = line.split(',');
            const id = parts[0]?.trim();
            const name = parts[2]?.trim().replace(/\+/g, ' ');
            return { id, name };
        }).filter(t => t.name);
        return townsCache;
    }

    async function loadIslandData() {
        if (islandsCache) return islandsCache;
        const world = window.Game.world_id;
        const text = await fetch(`https://${world}.grepolis.com/data/islands.txt`).then(r => r.text());
        islandsCache = text.split('\n').map(line => {
            const [id, x, y, type] = line.split(',');
            return { id, name: `ID ${id} (${x},${y})` };
        }).filter(i => i.id);
        return islandsCache;
    }


    // - Async operaties (fetch, timeouts)


    // =============================================
    // 3. BB-CODE IMPLEMENTATIE
    // =============================================

    // - Toolbar logica

    const createToolbar = (textarea) => {
        const toolbar = document.createElement("div");
        toolbar.id = "grepochat-bbcode-toolbar";
        toolbar.style.display = "flex";
        toolbar.style.flexWrap = "wrap";
        toolbar.style.gap = "0px";
        toolbar.style.marginBottom = "0px";
        toolbar.style.position = "relative"; // Voor popup positionering

        const buttons = [
            { name: "b", label: "bold-button.png", title: "Vet" },
            { name: "i", label: "cursief-button.png", title: "Cursief" },
            { name: "u", label: "onderstreept-button.png", title: "Onderstreept" },
            { name: "s", label: "doorstreept-button.png", title: "Doorhalen" },
            { name: "quote", label: "quote-button.png", title: "Citaat" },
            { name: "center", label: "center-button.png", title: "Centreren" },
            { name: "url", label: "url-button.png", title: "Link" },
            { name: "img", label: "image-button.png", title: "Afbeelding" },
            { name: "color", label: "color-button.png", title: "Kleur", hasPopup: true },
            { name: "font", label: "font-button.png", title: "Lettertype", hasPopup: true },
            { name: "size", label: "size-button.png", title: "Tekstgrootte", hasPopup: true },
            { name: "player", label: "player-button.png", title: "Speler", hasPopup: true },
            { name: "ally", label: "ally-button.png", title: "Alliantie", hasPopup: true },
            { name: "town", label: "town-button.png", title: "Stad", hasPopup: true },
            { name: "report", label: "report-button.png", title: "Verslag", hasPopup: true },
            { name: "island", label: "island-button.png", title: "Eiland", hasPopup: true },
            { name: "table", label: "table-button.png", title: "Tabel", hasPopup: true },
            { name: "reservation", label: "reservation-button.png", title: "Reservering", hasPopup: true },
            { name: "spoiler", label: "spoiler-button.png", title: "Spoiler", hasPopup: true },
            { name: "csv", label: "📄", title: "CSV importeren", hasPopup: true },

        ];

        buttons.forEach(btn => {
            const a = document.createElement("a");
            a.href = "#";
            a.title = btn.title;

            if (btn.label.endsWith('.png')) {
                const img = document.createElement("img");
                img.src = `https://github.com/zambia1972/Grepolis-Manager/raw/main/BBcode-buttons/${btn.label}`;
                img.alt = btn.title;
                img.style.width = "20px";
                img.style.height = "20px";
                a.appendChild(img);
            } else {
                a.textContent = btn.label;
            }

            a.className = "bbcode_option";
            a.dataset.name = btn.name;
            a.style.cssText = "background:#444;padding:4px;border-radius:4px;text-decoration:none;cursor:pointer;display:flex;align-items:center;justify-content:center;";

            a.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (!btn.hasPopup) {
                    insertBBCode(textarea, `[${btn.name}]`, `[/${btn.name}]`);
                    return;
                }

                document.querySelectorAll('.gc-popup').forEach(p => p.remove());

                switch(btn.name) {
                    case 'color': {
                        const colorPopup = createPopup({
                            title: 'Tekstkleur',
                            fields: [{
                                id: 'gc-color',
                                label: 'Kies een kleur',
                                type: 'select',
                                options: [
                                    { value: 'red', label: 'Rood' },
                                    { value: 'blue', label: 'Blauw' },
                                    { value: 'green', label: 'Groen' },
                                    { value: 'yellow', label: 'Geel' },
                                    { value: 'orange', label: 'Oranje' },
                                    { value: 'purple', label: 'Paars' },
                                    { value: 'black', label: 'Zwart' },
                                    { value: 'white', label: 'Wit' }
                                ]
                            }]
                        }, a);

                        colorPopup.onSubmit((values) => {
                            const color = values['gc-color'];
                            if (color) {
                                insertBBCode(textarea, `[color=${color}]`, '[/color]');
                            }
                        });
                        break;
                    }
                    case 'font': {
                        const fontPopup = createPopup({
                            title: 'Lettertype',
                            fields: [{
                                id: 'gc-font',
                                label: 'Kies een lettertype',
                                type: 'select',
                                options: [
                                    { value: 'Arial', label: 'Arial (standaard)' },
                                    { value: 'Verdana', label: 'Verdana' },
                                    { value: 'Helvetica', label: 'Helvetica' },
                                    { value: 'Times New Roman', label: 'Times New Roman' },
                                    { value: 'Courier New', label: 'Courier New' },
                                    { value: 'Georgia', label: 'Georgia' },
                                    { value: 'Comic Sans MS', label: 'Comic Sans' },
                                    { value: 'Impact', label: 'Impact' }
                                ]
                            }]
                        }, a);

                        fontPopup.onSubmit((values) => {
                            const font = values['gc-font'];
                            if (font) {
                                insertBBCode(textarea, `[font=${font}]`, '[/font]');
                            }
                        });
                        break;
                    }
                    case 'size': {
                        const sizePopup = createPopup({
                            title: 'Tekstgrootte',
                            fields: [{
                                id: 'gc-size',
                                label: 'Kies een grootte (px)',
                                type: 'select',
                                options: [
                                    { value: '8', label: '8 (zeer klein)' },
                                    { value: '10', label: '10 (klein)' },
                                    { value: '12', label: '12 (standaard)' },
                                    { value: '14', label: '14 (medium)' },
                                    { value: '18', label: '18 (groot)' },
                                    { value: '24', label: '24 (extra groot)' },
                                    { value: '36', label: '36 (zeer groot)' },
                                    { value: '72', label: '72 (enorm)' }
                                ]
                            }]
                        }, a);

                        sizePopup.onSubmit((values) => {
                            const size = values['gc-size'];
                            if (size) {
                                insertBBCode(textarea, `[size=${size}]`, '[/size]');
                            }
                        });
                        break;
                    }

                    case 'player': {
                        loadPlayersData().then(data => {
                            createEntityPopup(a, 'player', data);
                        });
                        break;
                    }
                    case 'ally': {
                        loadAllianceData().then(data => {
                            createEntityPopup(a, 'ally', data);
                        });
                        break;
                    }
                    case 'town': {
                        loadTownData().then(data => {
                            createEntityPopup(a, 'town', data);
                        });
                        break;
                    }
                    case 'island': {
                        loadIslandData().then(data => {
                            createEntityPopup(a, 'island', data, 'island');
                        });
                        break;
                    }
                    case 'table': {
                        showTablePopup(textarea);
                        break;
                    }

                    case 'csv': {
                        showCsvPopup(textarea);
                        break;
                    }


                    default: {
                        const defaultPopup = createPopup({
                            title: btn.title,
                            placeholder: `Voer ${btn.title.toLowerCase()} in`
                        }, a);

                        defaultPopup.onSubmit((values) => {
                            if (values.value) {
                                insertBBCode(textarea, `[${btn.name}]${values.value}[/${btn.name}]`, '', true);
                            }
                        });
                    }
                }
            };
            toolbar.appendChild(a);
        });

        return toolbar;
    };

    function showTablePopup(textarea) {
        const overlay = document.createElement("div");
        overlay.style = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;
        background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;
        z-index:10000;
    `;

        const popup = document.createElement("div");
        popup.style = `
        background:#2f3136;padding:20px;border-radius:8px;color:#ddd;width:340px;
        display:flex;flex-direction:column;gap:10px;
    `;
        popup.innerHTML = `
        <h3>Voeg tabel in</h3>
        <label>Rijen: <input type="number" id="table-rows" value="2" min="1" style="width:100%;padding:4px;"></label>
        <label>Kolommen: <input type="number" id="table-cols" value="3" min="1" style="width:100%;padding:4px;"></label>
        <label><input type="checkbox" id="table-header"> Tabel bevat kopregel</label>
        <div id="header-row" style="display:none; flex-direction:column; gap:6px;"></div>
        <label>Standaard celinhoud: <input type="text" id="table-cell" placeholder="bv. -" style="width:100%;padding:4px;"></label>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;">
            <button id="cancel-table">Annuleer</button>
            <button id="insert-table">Invoegen</button>
        </div>
    `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const headerCheckbox = popup.querySelector("#table-header");
        const headerRow = popup.querySelector("#header-row");

        headerCheckbox.onchange = () => {
            const colCount = parseInt(popup.querySelector("#table-cols").value, 10);
            headerRow.innerHTML = "";
            if (headerCheckbox.checked) {
                headerRow.style.display = "flex";
                for (let i = 0; i < colCount; i++) {
                    const inp = document.createElement("input");
                    inp.type = "text";
                    inp.placeholder = `Kop ${i + 1}`;
                    inp.style = "width:100%;padding:4px;";
                    headerRow.appendChild(inp);
                }
            } else {
                headerRow.style.display = "none";
            }
        };

        popup.querySelector("#table-cols").onchange = () => {
            if (headerCheckbox.checked) headerCheckbox.dispatchEvent(new Event("change"));
        };

        popup.querySelector("#cancel-table").onclick = () => overlay.remove();

        popup.querySelector("#insert-table").onclick = () => {
            const rows = parseInt(popup.querySelector("#table-rows").value, 10);
            const cols = parseInt(popup.querySelector("#table-cols").value, 10);
            const cellValue = popup.querySelector("#table-cell").value || "-";

            let bbcode = "[table]\n";

            // Header
            if (headerCheckbox.checked) {
                const headerInputs = [...headerRow.querySelectorAll("input")];
                const headers = headerInputs.map(inp => inp.value.trim() || "-");
                bbcode += `[**]${headers.map((h, i) => (i === 0 ? h : `[||]${h}`)).join("")}[/**]\n`;
            }

            // Rijen
            for (let r = 0; r < rows; r++) {
                bbcode += "[*]";
                const cells = Array(cols).fill(cellValue);
                bbcode += cells.join("[|]");
                bbcode += "[/*]\n";
            }

            bbcode += "[/table]";
            insertBBCode(textarea, bbcode, "", true);
            overlay.remove();
        };
    }

    // ========== CVS popup==============

    function showCsvPopup(textarea) {
        const overlay = document.createElement("div");
        overlay.style = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;
        background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;
        z-index:10000;
    `;

        const popup = document.createElement("div");
        popup.style = `
        background:#2f3136;padding:20px;border-radius:8px;color:#ddd;width:460px;
        display:flex;flex-direction:column;gap:10px;max-height:90vh;overflow-y:auto;
    `;

        popup.innerHTML = `
        <h3>CSV importeren</h3>
        <input type="file" id="csv-file" accept=".csv" style="padding:6px;background:#444;color:#fff;border:none;">
        <label><input type="checkbox" id="csv-header" checked> Eerste rij bevat kolomnamen</label>
        <div id="csv-preview" style="max-height:200px;overflow:auto;background:#222;padding:6px;border:1px solid #555;"></div>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;">
            <button id="cancel-csv">Annuleer</button>
            <button id="insert-csv">Invoegen</button>
        </div>
    `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const fileInput = popup.querySelector("#csv-file");
        const previewBox = popup.querySelector("#csv-preview");
        const headerCheckbox = popup.querySelector("#csv-header");

        let csvData = [];

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result.trim();

                // delimiterdetectie
                const delimiter = text.includes(";") ? ";" : ",";

                csvData = text.split("\n").map(line =>
                                               line.split(delimiter).map(cell =>
                                                                         cell.trim().replace(/\[/g, "&#91;").replace(/\]/g, "&#93;")
                                                                        )
                                              );

                if (csvData.length === 0) return;

                const previewHtml = csvData
                .slice(0, 10)
                .map(row =>
                     `<div style="border-bottom:1px solid #444;">${row.map(cell =>
                                                                           `<span style="display:inline-block;width:120px;">${cell}</span>`
                                                                          ).join("")}</div>`
                    ).join("");

                previewBox.innerHTML = previewHtml;
            };
            reader.readAsText(file);
        };

        popup.querySelector("#cancel-csv").onclick = () => overlay.remove();

        popup.querySelector("#insert-csv").onclick = () => {
            if (csvData.length === 0) {
                alert("Geen geldige CSV geladen.");
                return;
            }

            const hasHeader = headerCheckbox.checked;
            let bbcode = "[table]\n";

            if (hasHeader) {
                const headers = csvData[0];
                const headerLine = headers.map((val, i) => i === 0 ? val : `[||]${val}`).join("");
                bbcode += `[**]${headerLine}[/**]\n`;
                csvData = csvData.slice(1);
            }

            csvData.forEach(row => {
                const line = row.map((val, i) => i === 0 ? val : `[|]${val}`).join("");
                bbcode += `[*]${line}[/*]\n`;
            });

            bbcode += "[/table]";
            insertBBCode(textarea, bbcode, "", true);
            overlay.remove();
        };
    }

    // - Autocomplete systemen

    const showAutocompletePopup = (textarea, tag) => {
        const popup = document.createElement("div");
        popup.style.position = "absolute";
        popup.style.background = "#222";
        popup.style.border = "1px solid #555";
        popup.style.padding = "2px";
        popup.style.zIndex = 9999;
        popup.style.top = `${textarea.offsetTop - 160}px`;
        popup.style.left = `${textarea.offsetLeft}px`;
        popup.style.width = "300px";

        const input = document.createElement("input");
        input.placeholder = `Zoek ${tag}...`;
        input.style.width = "100%";
        input.style.padding = "4px";
        input.style.border = "1px solid #888";
        popup.appendChild(input);

        const list = document.createElement("div");
        list.style.maxHeight = "120px";
        list.style.overflowY = "auto";
        popup.appendChild(list);

        const fetchResults = (term) => {
            fetch(`/autocomplete?what=game_${tag}&term=${encodeURIComponent(term)}`)
                .then(async r => {
                if (!r.ok) {
                    console.warn("Foutstatus van server:", r.status);
                    return [];
                }
                const text = await r.text();
                if (!text.trim()) {
                    console.warn("Lege JSON van server.");
                    return [];
                }
                try {
                    return JSON.parse(text);
                } catch (e) {
                    console.warn("Kon JSON niet parsen:", text);
                    return [];
                }
            })

                .then(data => {
                list.innerHTML = "";
                data.forEach(row => {
                    const item = document.createElement("div");
                    item.style.padding = "2px 6px";
                    item.style.cursor = "pointer";
                    item.style.borderBottom = "1px solid #444";
                    item.textContent = row[0];
                    item.onclick = () => {
                        insertBBCode(textarea, `[${tag}]${row[0]}`, `[/${tag}]`, true);
                        popup.remove();
                    };
                    list.appendChild(item);
                });
            });
        };

        input.oninput = () => {
            const val = input.value.trim();
            if (val.length < 2) {
                list.innerHTML = "<em>Minstens 2 letters...</em>";
                return;
            }
            fetchResults(val);
        };

        document.body.appendChild(popup);
        input.focus();
    };

    function showGrepolisAutocomplete(textarea, type) {
        const placeholder = {
            player: "Voer spelernaam in",
            ally: "Voer alliantienaam in",
            town: "Voer stadsnaam in",
            island: "Voer eiland ID in"
        }[type];

        const value = prompt(placeholder + ":");
        if (value) {
            insertBBCode(textarea, `[${type}]`, `[/${type}]`, '', true);
            textarea.setRangeText(match.name, textarea.selectionStart, textarea.selectionEnd, 'end');
        }
    }

    // - BBCode parsing

    const parseBBCode = (text) => {
        if (!text) return "";

        let out = text; // begin met de ruwe tekst

        // Stap 1: [table] parsing eerst, met recursie

        out = out.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, raw) => {
            let content = raw;

            // Verwijder alle sluit‑row‑tags "[/*]" voordat we verder gaan
            content = content.replace(/\[\/\*\]/g, '');

            let html = '<table style="border-collapse: collapse; border: 1px solid #666; width:100%;">';

            // Header verwerken
            const headerMatch = content.match(/\[\*\*\]([\s\S]*?)\[\/\*\*\]/i);
            if (headerMatch) {
                html += '<thead><tr>';
                headerMatch[1].split(/\[\|\|\]/g).forEach(h => {
                    html += `<th style="border:1px solid #666; padding:4px; background:#444; color:#fff;">${h.trim()}</th>`;
                });
                html += '</tr></thead>';
                content = content.replace(headerMatch[0], '');
            }

            // Body verwerken
            html += '<tbody>';
            content
                .split(/\[\*\]/g)          // splits op elke "[*]"
                .map(r => r.trim())       // trim whitespace
                .filter(r => r)           // verwijder lege stukken
                .forEach(row => {
                html += '<tr>';
                row.split(/\[\|\]/g)     // splits op elke "[|]"
                    .forEach(cell => {
                    html += `<td style="border:1px solid #666; padding:4px;">${cell.trim()}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            return html;
        });

        if (!alliancesCache) {
            loadAllianceData(); // zorg dat cache geladen is
        }

        // Stap 2: standaard BBCode
        const rules = [

            { regex: /\[b\](.*?)\[\/b\]/gis, replacement: "<strong>$1</strong>" },
            { regex: /\[i\](.*?)\[\/i\]/gis, replacement: "<em>$1</em>" },
            { regex: /\[u\](.*?)\[\/u\]/gis, replacement: "<u>$1</u>" },
            { regex: /\[s\](.*?)\[\/s\]/gis, replacement: "<s>$1</s>" },
            { regex: /\[url=(.*?)\](.*?)\[\/url\]/gis, replacement: '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>' },
            { regex: /\[url\](.*?)\[\/url\]/gis, replacement: '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>' },
            { regex: /\[img\](.*?)\[\/img\]/gis, replacement: '<img src="$1" style="max-width:100%; height:auto;">' },
            { regex: /\[color=([^\]]+)\](.*?)\[\/color\]/gis, replacement: '<span style="color:$1;">$2</span>' },
            { regex: /\[font=([^\]]+)\](.*?)\[\/font\]/gis, replacement: '<span style="font-family:$1;">$2</span>' },
            { regex: /\[size=(\d+)\](.*?)\[\/size\]/gis, replacement: '<span style="font-size:$1px;">$2</span>' },
            { regex: /\[center\](.*?)\[\/center\]/gis, replacement: '<div style="text-align:center;">$1</div>' },
            { regex: /\[quote(?:=[^\]]+)?\](.*?)\[\/quote\]/gis, replacement: '<blockquote style="border-left: 3px solid #888; padding-left: 8px; margin: 6px 0;">$1</blockquote>' },


        ];
        for (const rule of rules) {
            out = out.replace(rule.regex, rule.replacement);
        }

        // Stap 3: vervang [player] los, met escape én zonder innerlijke escape van de stijl
        out = out.replace(/\[player\](.*?)\[\/player\]/gi, (_, name) => {
            const safeName = escapeHtml(name.trim());
            const style = getIconStyle('player').replace(/\n/g, "").trim();
            const id = playersCache?.find(p => p.name === name)?.id;
            return `<a href="#" data-player-id="${id}" data-player="${safeName}" class="bb-player" style="${style}">${safeName}</a>`;
        });

        // Ally tag (met icoon)
        out = out.replace(/\[ally\](.*?)\[\/ally\]/gi, (_, name) => {
            const safeName = escapeHtml(name.trim());
            const style = getIconStyle('ally').replace(/\n/g, "").trim();
            const match = alliancesCache?.find(a => a.name.toLowerCase() === name.trim().toLowerCase());
            const id = match?.id || "onbekend";

            return `<a href="#" data-ally="${safeName}" data-ally-id="${id}" class="bb-ally " style="${style}">${safeName}</a>`;
        });

        // Town tag (met icoon)
        out = out.replace(/\[town\](\d+)\[\/town\]/gi, (_, townId) => {
            const town = townsCache?.find(t => t.id === townId);
            const name = town?.name || townId;

            if (!town) return `<span class="bb-town">${name}</span>`;

            const payload = {
                id: parseInt(town.id),
                ix: parseInt(town.x) || 0,
                iy: parseInt(town.y) || 0,
                tp: "town",
                name: town.name
            };

            const encoded = btoa(JSON.stringify(payload));
            return `<a href="#${encoded}" class="gp_town_link">${escapeHtml(name)}</a>`;
        });



        // Island tag (met icoon)
        out = out.replace(/\[island\](.*?)\[\/island\]/gi, (_, islandName) => {
            const safeName = escapeHtml(islandName.trim());
            const style = getIconStyle('island').replace(/\n/g, "").trim();

            return `<span class="bb-island" style="${style}">${safeName}</span>`;
        });


        // Stap 4: vervang linebreaks
        out = out.replace(/\n/g, "<br>");
        return out;
    };


    function getIconStyle(type) {
        const icons = {
            player: "player.png",
            town: "town.png",
            ally: "ally.png",
            island: "island.png"
        };
        return `
            color: #f7891b;
            padding-left: 20px;
            background: url(https://gpit.innogamescdn.com/images/game/bb_codes/${type}.png) no-repeat left center;
            display: inline-block;
            height: 20px;
            line-height: 20px;
            cursor: pointer;
            font-weight: bold;
            text-decoration: none;
        `;
    }
    // - Custom HTML generatie

    function insertCustomHTML(textarea, html, bbCodeFallback) {
        if (window.allowHTML) { // Controleer of HTML is toegestaan
            const range = textarea.selectionStart;
            const text = textarea.value;
            textarea.value = text.substring(0, range) + html + text.substring(range);
        } else {
            insertBBCode(textarea, bbCodeFallback, '', true);
        }
    }

    // - Speler/Alliantie specifieke handlers

    // 1. stijl









    function ensureTownsCacheAndUpdateMessages() {
        if (!townsCache) {
            loadTownData().then(() => {
                console.log("[GrepoChat] Town data geladen. Chat wordt bijgewerkt.");
                document.querySelectorAll(".grepochat-message").forEach(el => {
                    const raw = el.dataset.raw || el.innerText;
                    el.innerHTML = parseBBCode(raw);
                });
            }).catch(err => {
                console.error("Fout bij laden van towns.txt:", err);
            });
        }
    }

    // 2. Popup aanmaken functie

    function createEntityPopup(anchorElement, type, dataset, tagName = type) {
        const existing = document.getElementById(`gc-${type}-popup`);
        if (existing) existing.remove();

        const popup = document.createElement("div");
        popup.id = `gc-${type}-popup`;
        popup.className = "gc-popup";
        popup.style = `
    position:absolute;
    background:#2f3136;
    border:1px solid #111;
    border-radius:6px;
    padding:10px;
    z-index:10000;
    width:300px;
    color:#fff;
  `;

        popup.innerHTML = `
    <h3 style="margin:0 0 8px 0;">
      ${type.charAt(0).toUpperCase() + type.slice(1)} selecteren
    </h3>
    <input type="text" id="gc-${type}-search"
           placeholder="Typ minstens 2 letters..."
           style="width:100%;padding:6px;border-radius:4px;">
    <div id="gc-${type}-results"
         style="max-height:200px;overflow-y:auto;margin-top:6px;"></div>
  `;

        document.body.appendChild(popup);
        positionPopup(popup, anchorElement);

        const input   = popup.querySelector(`#gc-${type}-search`);
        const results = popup.querySelector(`#gc-${type}-results`);

        input.addEventListener('input', () => {
            const term = input.value.trim().toLowerCase();
            results.innerHTML = '';
            if (term.length < 2) return;

            const matches = dataset
            .filter(item => item.name.toLowerCase().includes(term))
            .slice(0, 15);

            if (matches.length === 0) {
                results.innerHTML = '<div style="padding:6px;color:#888;">Geen resultaten</div>';
                return;
            }

            for (const match of matches) {
                const div = document.createElement("div");
                div.textContent = match.name;
                div.style = 'padding:6px;border-bottom:1px solid #444;cursor:pointer;';

                div.onclick = () => {
                    const textarea = document.getElementById("grepochat-input");
                    if (textarea) {
                        insertBBCode(
                            textarea,
                            `[${tagName}]${match.name}[/${tagName}]`,
                            ''
                        );
                    }
                    popup.remove();
                };

                results.appendChild(div);
            }

        });

        setTimeout(() => input.focus(), 10);
    }

    // 3. Positionering
    function positionPopup(popup, anchor) {
        const rect = anchor.getBoundingClientRect();
        popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
        popup.style.left = `${rect.left + window.scrollX}px`;
    }

    // 4. Event handlers


    // 5. Spelers zoeken


    // 7. Hoe te gebruiken:

    // =============================================
    // 4. CHAT INTERFACE COMPONENTEN
    // =============================================

    // - Hoofdcontainer opbouw

    function buildUI() {
        if (document.getElementById("grepochat-container")) return;

        const style = document.createElement("style");
        style.textContent = `
          #grepochat-container {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 1160px; height: 740px;
            background: #2f3136; color: #ddd;
            font-family: Arial,sans-serif;
            display: flex; border-radius: 10px;
            box-shadow: 0 0 15px #0008;
            z-index: 75;
            user-select: none;
          }
          #grepochat-left, #grepochat-right {
            width: 180px;
            background: #202225;
            overflow-y: auto;
            padding: 10px;
            box-sizing: border-box;
          }
          #grepochat-middle {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #36393f;
            border-left: 1px solid #202225;
            border-right: 1px solid #202225;
          }
          #grepochat-channels {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .grepochat-channel-button {
            background: none;
            border: none;
            color: #b9bbbe;
            padding: 6px 10px;
            text-align: left;
            font-size: 14px;
            border-radius: 6px;
            cursor: pointer;
          }
          .grepochat-channel-button.active-channel {
            background: #36393f;
            color: white;
          }
          .grepochat-category-title {
            font-weight: bold;
            font-size: 13px;
            color: #aaa;
            margin-top: 10px;
            margin-bottom: 4px;
            padding-left: 4px;
            text-transform: uppercase;
          }
          #grepochat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            font-size: 14px;
            line-height: 1.3;
          }
          .grepochat-message {
            margin-bottom: 6px;
          }
          .grepochat-message-sender {
            font-weight: 700;
            margin-right: 8px;
            color: #fff;
          }
          .grepochat-message-time {
            color: #999;
            font-size: 10px;
            margin-left: 6px;
          }
          .grepochat-message-text {
            text-align: left;
            color: #ddd;
          }
          #grepochat-users {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          #grepochat-users li {
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          #grepochat-users img {
            width: 35px; height: 35px;
            border-radius: 50%;
            border: 2px solid #f04747;
          }
         #grepochat-input-area {
           display: flex;
           flex-direction: column;  /* ZET ALLES ONDER ELKAAR */
           gap: 6px;
           padding: 8px;
           border-top: 1px solid #202225;
           background: #2f3136;
          }
         .input-row {
           display: flex;            /* Alleen dit stuk horizontaal */
          }
          #grepochat-input {
            flex: 1;
            padding: 8px;
            border-radius: 6px;
            border: none;
            background: #202225;
            color: #ddd;
            font-size: 14px;
            resize: none;
            height: 50px;
            margin-right: 8px;
          }
          #grepochat-send {
            background: #7289da;
            border: none;
            color: white;
            padding: 0 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 18px;
          }
          #grepochat-settings-popup {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.7);
            z-index: 10000;
        }
        .grepochat-popup {
            background: #2f3136;
            color: #fff;
            width: 640px;
            margin: 60px auto;
            padding: 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            position: relative;
        }
        .grepochat-popup h2 {
            margin-bottom: 16px;
        }
        .grepochat-tab {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }
        .grepochat-section h3 {
            margin-bottom: 8px;
            font-size: 16px;
        }
        .grepochat-row {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 10px;
        }
        .grepochat-row input, .grepochat-row select {
            padding: 4px;
            flex: 1;
        }
        .grepochat-popup button {
            padding: 4px 8px;
            background: #7289da;
            border: none;
            color: #fff;
            border-radius: 4px;
            cursor: pointer;
        }
        .grepochat-close {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            color: #aaa;
            font-size: 16px;
            cursor: pointer;
        }
        .grepochat-tooltip {
          position: absolute;
          background: #202225;
          color: #ddd;
          padding: 8px;
          border-radius: 6px;
          font-size: 12px;
          pointer-events: none;
          z-index: 10020;
          white-space: nowrap;
        }
        .grepochat-tooltip-content {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          background: #202225;
          color: #ddd;
          padding: 8px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 10020;
          pointer-events: none;  /* blijf muisevents passeren */
        }
        #grepochat-users li:hover .grepochat-tooltip-content {
          display: block;
        }
        `;
        document.head.appendChild(style);

        const container = document.createElement("div");
        container.id = "grepochat-container";

        // === Linkerkant: Kanalen + instellingen ===
        const left = document.createElement("div");
        left.id = "grepochat-left";

        const settingsBtn = document.createElement("button");
        settingsBtn.textContent = "⚙️ Instellingen";
        settingsBtn.style.marginBottom = "10px";
        settingsBtn.style.width = "100%";
        settingsBtn.style.background = "#444";
        settingsBtn.style.color = "#fff";
        settingsBtn.style.border = "none";
        settingsBtn.style.padding = "6px 10px";
        settingsBtn.style.borderRadius = "4px";
        settingsBtn.style.cursor = "pointer";
        settingsBtn.onclick = () => openSettingsPopup();
        left.appendChild(settingsBtn);

        const chHeader = document.createElement("h3");
        chHeader.textContent = "Kanalen";
        left.appendChild(chHeader);

        const channelsDiv = document.createElement("div");
        channelsDiv.id = "grepochat-channels";
        left.appendChild(channelsDiv);

        // === Midden: Berichten + input ===
        const middle = document.createElement("div");
        middle.id = "grepochat-middle";

        const messagesDiv = document.createElement("div");
        messagesDiv.id = "grepochat-messages";
        middle.appendChild(messagesDiv);

        const inputArea = document.createElement("div");
        inputArea.id = "grepochat-input-area";

        // Maak invoerveld en verzendknop aan
        const textarea = document.createElement("textarea");
        textarea.id = "grepochat-input";
        enableImagePaste(textarea);
        textarea.placeholder = "Typ je bericht...";

        // Maak verzendknop aan
        const sendBtn = document.createElement("button");
        sendBtn.id = "grepochat-send";
        sendBtn.textContent = "➤";

        // === FIX: Voeg deze regel toe om toolbar te maken ===
        const toolbar = createToolbar(textarea);

        // Eerst de knoppen
        inputArea.appendChild(toolbar);

        // Dan het invoerveld + verzendknop in een rij
        const inputRow = document.createElement("div");
        inputRow.style.display = "flex";
        inputRow.style.marginTop = "6px";

        inputRow.appendChild(textarea);
        inputRow.appendChild(sendBtn);

        inputArea.appendChild(inputRow);

        middle.appendChild(inputArea);

        // === Rechterkant: gebruikerslijst ===
        const right = document.createElement("div");
        right.id = "grepochat-right";

        const usersHeader = document.createElement("h3");
        usersHeader.textContent = "Spelers";
        right.appendChild(usersHeader);

        const usersList = document.createElement("ul");
        usersList.id = "grepochat-users";
        right.appendChild(usersList);

        // === Samenvoegen ===
        container.appendChild(left);
        container.appendChild(middle);
        container.appendChild(right);

        // Sluitknop
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "×";
        closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: #444;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        z-index: 10001;
    `;
        closeBtn.onclick = () => container.style.display = 'none';
        container.appendChild(closeBtn);

        // Event handlers
        sendBtn.onclick = () => sendMessage();
        textarea.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        document.body.appendChild(container);
    }

    // ==============copy paste image==============================

    function enableImagePaste(textarea) {
        textarea.addEventListener("paste", async (e) => {
            const item = [...e.clipboardData.items].find(i => i.type.startsWith("image/"));
            if (!item) return;

            const file = item.getAsFile();
            if (!file) return;

            const url = await uploadImage(file);
            if (url) insertBBCode(textarea, `[img]${url}[/img]`, '', true);
        });

        textarea.addEventListener("drop", async (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.startsWith("image/")) return;

            const url = await uploadImage(file);
            if (url) insertBBCode(textarea, `[img]${url}[/img]`, '', true);
        });
    }

    async function uploadImage(file) {
        const formData = new FormData();
        formData.append("image", file);

        try {
            const response = await fetch("https://api.imgbb.com/1/upload?key=003d33b531bef411aab44f2587e42fcc", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            return data.data?.url;
        } catch (err) {
            alert("Afbeelding uploaden mislukt.");
            console.error("Uploadfout:", err);
            return null;
        }
    }


    // - Kanaallijst beheer

    async function renderChannels() {
        const container = document.getElementById("grepochat-channels");
        if (!container) return;
        container.innerHTML = "<em>Kanalen laden...</em>";

        const [catSnap, chSnap] = await Promise.all([
            categorieenCollection().get(),
            kanalenCollection().get()
        ]);

        const categories = {};
        catSnap.forEach(doc => {
            categories[doc.id] = { id: doc.id, ...doc.data() };
        });

        const grouped = {};
        chSnap.forEach(doc => {
            const ch = doc.data();
            const catId = ch.category;
            if (!grouped[catId]) grouped[catId] = [];
            grouped[catId].push({ id: doc.id, ...ch });
        });

        container.innerHTML = "";

        Object.entries(categories).forEach(([catId, cat]) => {
            const catTitle = document.createElement("div");
            catTitle.className = "grepochat-category-title";
            catTitle.textContent = cat.name;
            container.appendChild(catTitle);

            const catChannels = grouped[catId] || [];
            catChannels.forEach(ch => {
                const btn = document.createElement("button");
                btn.className = "grepochat-channel-button";
                btn.textContent = `# ${ch.name}`;
                btn.dataset.channelId = ch.id;

                // Voeg badge toe als nodig
                if (unreadCounts[ch.id] > 0) {
                    const badge = document.createElement("span");
                    badge.className = "unread-badge";
                    badge.textContent = unreadCounts[ch.id];
                    badge.style.cssText = `
                        background: red;
                        color: white;
                        padding: 2px 6px;
                        border-radius: 12px;
                        font-size: 12px;
                        float: right;
                        margin-left: 6px;
                    `;
                    btn.appendChild(badge);
                }

                btn.onclick = () => {
                    document.querySelectorAll(".grepochat-channel-button").forEach(b => b.classList.remove("active-channel"));
                    btn.classList.add("active-channel");
                    renderMessages(ch.id);

                    // Reset teller
                    unreadCounts[ch.id] = 0;
                    const badge = btn.querySelector(".unread-badge");
                    if (badge) badge.remove();

                    console.log(`Kanaal geselecteerd: ${ch.name}`);
                };

                container.appendChild(btn);

                kanalenCollection().doc(ch.id).collection("messages")
                    .orderBy("timestamp")
                    .limitToLast(1)
                    .onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        if (change.type === "added") {
                            notifyNewMessage(ch.id);
                        }
                    });
                });
            });
        });
        // Activeer automatisch eerste kanaal als er nog geen is gekozen
        if (!currentChannelId) {
            const firstBtn = container.querySelector(".grepochat-channel-button");
            if (firstBtn) {
                firstBtn.click();
            }
        }

    }

    // - Berichtenscherm renderen

    function renderMessages(channelId) {
        const container = document.getElementById("grepochat-messages");
        if (!container) return;
        container.innerHTML = "<em>Berichten laden...</em>";

        // 1) Unsubscribe van vorige listener, als die er is
        if (messageUnsubscribes[currentChannelId]) {
            messageUnsubscribes[currentChannelId]();
        }

        currentChannelId = channelId;

        verwijderOudeBerichten(channelId);  // Verwijder oude berichten zodra een kanaal wordt geopend

        // 2) Maak nieuwe listener
        const messagesRef = kanalenCollection()
        .doc(channelId)
        .collection("messages")
        .orderBy("timestamp");
        messageUnsubscribes[channelId] = messagesRef.onSnapshot(async snapshot => {
            console.log("Snapshots voor kanaal", channelId, "grootte:", snapshot.size);
            // laad data
            const msgs = [];
            const senders = new Set();
            snapshot.forEach(doc => {
                const m = { id: doc.id, ...doc.data() };
                msgs.push(m);
                senders.add(m.senderId);
            });

            // fetch gebruikersdata
            const cache = {};
            await Promise.all([...senders].map(async uid => {
                const d = await gebruikersCollection().doc(uid).get();
                cache[uid] = d.exists ? d.data() : {};
            }));

            await loadTownData();

            // render
            container.innerHTML = "";
            msgs.forEach(msg => {
                const s = cache[msg.senderId] || {};
                const avatar = s.avatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
                const name = s.name || msg.senderId;
                const time = msg.timestamp?.toDate?.().toLocaleTimeString() || "??:??";

                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.marginBottom = "8px";
                row.style.alignItems = "flex-start";
                row.style.gap = "8px";

                const img = document.createElement("img");
                img.src = avatar;
                img.style.width = img.style.height = "32px";
                img.style.borderRadius = "50%";

                const content = document.createElement("div");
                content.style.flex = "1";

                const hdr = document.createElement("div");
                hdr.innerHTML = `<strong>${name}</strong> <span style="font-size:10px;color:#999;margin-left:4px;">${time}</span>`;

                const txt = document.createElement("div");
                txt.className = "grepochat-message-text";
                txt.innerHTML = window.parseBBCode(msg.text);

                content.appendChild(hdr);
                content.appendChild(txt);

                row.appendChild(img);
                row.appendChild(content);

                // === 🗑️ Verwijderknop (alleen voor eigen berichten) ===
                if (msg.senderId === userId) {
                    const delBtn = document.createElement("button");
                    delBtn.textContent = "🗑️";
                    delBtn.title = "Bericht verwijderen";
                    delBtn.style.cssText = `
            background:none;
            border:none;
            color:#aaa;
            font-size:14px;
            cursor:pointer;
        `;
                    delBtn.onclick = async () => {
                        if (confirm("Weet je zeker dat je dit bericht wilt verwijderen?")) {
                            await kanalenCollection().doc(channelId).collection("messages").doc(msg.id).delete();
                            console.log(`[GrepoChat] Bericht ${msg.id} verwijderd.`);
                        }
                    };
                    row.appendChild(delBtn);
                }

                container.appendChild(row);
            });


            container.scrollTop = container.scrollHeight;
        });
    }

    // - Gebruikerslijst beheer

    function laadSpelersLive() {
        const rechterPaneel = document.getElementById("grepochat-right");
        if (!rechterPaneel) return;

        let userList = document.getElementById("grepochat-users");
        if (!userList) {
            userList = document.createElement("ul");
            userList.id = "grepochat-users";
            rechterPaneel.appendChild(userList);
        }

        const ONLINE_THRESHOLD = 5 * 60 * 1000; // 5 minuten

        gebruikersCollection().onSnapshot(snapshot => {
            const now = Date.now();
            const online = [];
            const offline = [];

            // 1) Lees per document zowel id als data in
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.name) return;
                const diff = now - (data.lastActive || 0);
                const user = {
                    id: doc.id,
                    data,    // bewaar de gehele data voor later
                    diff
                };
                if (diff <= ONLINE_THRESHOLD) {
                    online.push(user);
                } else {
                    offline.push(user);
                }
            });

            // 2) Sorteer lijsten
            online.sort((a, b) => a.diff - b.diff);
            offline.sort((a, b) => b.diff - a.diff);

            // 3) Render gecombineerde lijst
            userList.innerHTML = "";
            [...online, ...offline].forEach(user => {
                const { id, data, diff } = user;
                const borderColor = diff <= ONLINE_THRESHOLD
                ? "limegreen"
                : diff < 12 * 3600000
                ? "orange"
                : "red";

                const li = document.createElement("li");
                li.dataset.userid = id;
                li.style.position = "relative"; // voor absolute tooltip

                // Basisweergave: alleen avatar, naam en alliantie
                li.innerHTML = `
                  <div style="display:flex;align-items:center;gap:8px;">
                    <img src="${data.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}"
                         style="width:35px;height:35px;border-radius:50%;border:2px solid ${borderColor};" />
                    <span style="font-weight:bold;">${data.name}</span>
                    <span style="font-size:11px;color:gray;margin-left:auto;">${data.alliance}</span>
                  </div>
                `;
                userList.appendChild(li);

                // 4) Hover-handlers om tooltip te tonen / verbergen
                const tooltip = li.querySelector('.grepochat-tooltip-content');

            });
        });
    }

    // - Invoerveld met toolbar

    function enableBBCodeButtons() {
        const textarea = document.getElementById("grepochat-input");
        const toolbar = document.getElementById("grepochat-bbcode-toolbar");

        if (!textarea || !toolbar) {
            console.warn("BBCode: inputveld of toolbar niet gevonden");
            return;
        }

        toolbar.querySelectorAll(".bbcode_option").forEach(btn => {
            btn.addEventListener("click", e => {
                e.preventDefault();
                const tag = btn.getAttribute("data-tag");
                window.insertBBCodeTag(textarea, tag); // globaal aangeroepen
            });
        });
    }

    const interval = setInterval(() => {
        const ta = document.querySelector("#grepochat-input");
        if (ta) {
            applyBBCodeToolbar();
            clearInterval(interval);
        }
    }, 500);

    // =============================================
    // 5. FIREBASE INTEGRATIE
    // =============================================

    // - Authenticatie flow

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    // - Firestore operaties

    function gebruikersCollection() {
        return db.collection("worlds").doc(wereldId).collection("users");
    }

    function categorieenCollection() {
        return db.collection("worlds").doc(wereldId).collection("categories");
    }

    function kanalenCollection() {
        return db.collection("worlds").doc(wereldId).collection("channels");
    }

    // - Real-time updates

    function notifyNewMessage(channelId) {
        if (channelId === currentChannelId) return;

        unreadCounts[channelId] = (unreadCounts[channelId] || 0) + 1;
        renderChannels(); // om de teller te tonen
    }

    // - Wereld/gebruiker synchronisatie

    async function ensureWorldExists() {
        const worldRef = db.collection("worlds").doc(wereldId);
        const doc = await worldRef.get();
        if (!doc.exists) {
            await worldRef.set({
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: userId || "system"
            });
            console.log(`Wereld '${wereldId}' aangemaakt.`);
        } else {
            console.log(`Wereld '${wereldId}' bestaat al.`);
        }
    }

    async function ensureUserExists() {
        const spelerNaam   = window.Game.player_name;
        const alliantieNaam = await haalAlliantieNaamOp();

        const userRef = gebruikersCollection().doc(userId);
        const doc = await userRef.get();

        const now = Date.now();

        const userData = {
            name: spelerNaam,
            avatar: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
            alliance: alliantieNaam,
            lastActive: now,
            aangemeld: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!doc.exists) {
            await userRef.set(userData);
            console.log(`Gebruiker '${spelerNaam}' aangemaakt met alliantie '${alliantieNaam}'.`);
        } else {
            await userRef.update({
                alliance: alliantieNaam,
                lastActive: now
            });
            console.log(`Gebruiker '${spelerNaam}' geüpdatet met alliantie '${alliantieNaam}'.`);
        }

        // Sluit het venster automatisch
        const closeBtn = document.querySelector('#alliance_window .window_close');
        if (closeBtn) closeBtn.click();
    }


    // - Berichten synchronisatie

    // Automatische verwijdering van berichten ouder dan 3 dagen
    async function verwijderOudeBerichten(channelId) {
        const drieDagenGeleden = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const ref = kanalenCollection().doc(channelId).collection("messages");

        const oudeBerichten = await ref.where("timestamp", "<", drieDagenGeleden).get();
        oudeBerichten.forEach(doc => {
            doc.ref.delete().then(() => {
                console.log(`Verwijderd: bericht ${doc.id} ouder dan 3 dagen`);
            });
        });
    }


    // =============================================
    // 6. INSTELLINGEN EN BEHEER
    // =============================================

    // - Instellingen popup

    window.openSettingsPopup = async function() {
        const existing = document.getElementById("grepochat-settings-popup");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.id = "grepochat-settings-popup";
        overlay.className = "grepochat-popup-overlay";

        const popup = document.createElement("div");
        popup.className = "grepochat-popup";

        const closeBtn = document.createElement("button");
        closeBtn.className = "grepochat-close";
        closeBtn.textContent = "✖";
        closeBtn.onclick = () => overlay.remove();

        const title = document.createElement("h2");
        title.textContent = "Instellingen";

        // Tab knoppen
        const tabs = document.createElement("div");
        tabs.style.display = "flex";
        tabs.style.gap = "10px";
        tabs.style.marginBottom = "20px";

        const btnInstellingen = document.createElement("button");
        btnInstellingen.textContent = "🔧 Algemene instellingen";
        btnInstellingen.onclick = () => showDefaultTab();

        const btnCategorieen = document.createElement("button");
        btnCategorieen.textContent = "📂 Categorieën & Kanalen";
        btnCategorieen.onclick = () => showCategoryTab();

        const btnHerordenen = document.createElement("button");
        btnHerordenen.textContent = "🔀 Herordenen";
        btnHerordenen.onclick = () => showReorderTab();

        tabs.append(btnInstellingen, btnCategorieen, btnHerordenen);

        // Contentcontainer
        const content = document.createElement("div");
        content.id = "grepochat-tab-content";

        popup.append(closeBtn, title, tabs, content);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        showDefaultTab(); // start met de standaard tab

        function showDefaultTab() {
            content.innerHTML = "";
            const info = document.createElement("div");
            info.innerHTML = `
            <div id='default-settings-view'>
                <p><strong>Welkom bij de instellingen van GrepoChat.</strong></p>
                <p>Kies hierboven een onderdeel om te beheren.</p>
                <p>Bijvoorbeeld: kanalen organiseren, gebruikersinformatie aanpassen, enz.</p>
            </div>
        `;
            content.appendChild(info);
        }
        async function showCategoryTab() {
            content.innerHTML = "";

            const layout = document.createElement("div");
            layout.style.display = "flex";
            layout.style.flexDirection = "column";
            layout.style.gap = "20px";

            // Categorieën
            const catBlock = document.createElement("div");
            catBlock.innerHTML = `<h3>Categorieën</h3>`;
            const catRow = document.createElement("div");
            catRow.className = "grepochat-row";
            const catSelect = document.createElement("select"); catSelect.id = "catSelect";
            const catInput = document.createElement("input"); catInput.id = "catInput"; catInput.placeholder = "Nieuwe categorie";
            const catBtn = document.createElement("button"); catBtn.id = "addCat"; catBtn.textContent = "➕";
            catRow.append(catSelect, catInput, catBtn);
            catBlock.appendChild(catRow);
            layout.appendChild(catBlock);

            // Kanalen
            const chBlock = document.createElement("div");
            chBlock.innerHTML = `<h3>Kanalen</h3>`;
            const chRow = document.createElement("div");
            chRow.className = "grepochat-row";
            const chSelect = document.createElement("select"); chSelect.id = "kanaalSelect";
            const chInput = document.createElement("input"); chInput.id = "kanaalInput"; chInput.placeholder = "Nieuw kanaal";
            const chBtn = document.createElement("button"); chBtn.id = "addKanaal"; chBtn.textContent = "➕";
            chRow.append(chSelect, chInput, chBtn);
            chBlock.appendChild(chRow);
            layout.appendChild(chBlock);

            // Sub-kanalen
            const subBlock = document.createElement("div");
            subBlock.innerHTML = `<h3>Sub-kanalen</h3>`;
            const subRow = document.createElement("div");
            subRow.className = "grepochat-row";
            const subSelect = document.createElement("select"); subSelect.id = "subSelect"; subSelect.disabled = true;
            const subInput = document.createElement("input"); subInput.id = "subInput"; subInput.placeholder = "Nieuw subkanaal";
            const subBtn = document.createElement("button"); subBtn.id = "addSub"; subBtn.textContent = "➕";
            subRow.append(subSelect, subInput, subBtn);
            subBlock.appendChild(subRow);
            layout.appendChild(subBlock);

            content.appendChild(layout);

            const kanaalSelect = chSelect;

            catSelect.onchange = async () => {
                kanaalSelect.innerHTML = ''; subSelect.innerHTML = ''; subSelect.disabled = true;
                const snaps = await kanalenCollection().where('category','==',catSelect.value).get();
                snaps.forEach(doc=>{
                    const o = document.createElement('option'); o.value = doc.id; o.textContent = doc.data().name;
                    kanaalSelect.appendChild(o);
                });
                kanaalSelect.dispatchEvent(new Event('change'));
            };

            kanaalSelect.onchange = async () => {
                subSelect.innerHTML = ''; subSelect.disabled = false;
                const doc = await kanalenCollection().doc(kanaalSelect.value).get();
                (doc.data().subchannels||[]).forEach(name=>{
                    const o = document.createElement('option'); o.textContent = name;
                    subSelect.appendChild(o);
                });
            };

            catBtn.onclick = async () => {
                if (!catInput.value.trim()) return;
                await categorieenCollection().add({ name: catInput.value.trim() });
                openSettingsPopup();
            };
            chBtn.onclick = async () => {
                if (!chInput.value.trim() || !catSelect.value) return;
                await kanalenCollection().add({ name: chInput.value.trim(), category: catSelect.value, subchannels: [] });
                openSettingsPopup();
            };
            subBtn.onclick = async () => {
                if (!subInput.value.trim() || !kanaalSelect.value) return;
                await kanalenCollection().doc(kanaalSelect.value).update({ subchannels: firebase.firestore.FieldValue.arrayUnion(subInput.value.trim()) });
                openSettingsPopup();
            };

            const cats = await categorieenCollection().get();
            cats.forEach(doc => {
                const o = document.createElement('option'); o.value = doc.id; o.textContent = doc.data().name;
                catSelect.appendChild(o);
            });
            if (catSelect.options.length) catSelect.dispatchEvent(new Event('change'));
        }

        async function showReorderTab() {
            content.innerHTML = "";

            const layout = document.createElement("div");
            layout.style.display = "flex";
            layout.style.flexDirection = "column";
            layout.style.gap = "20px";

            // Categorie-verplaatsing
            const catBlock = document.createElement("div");
            catBlock.innerHTML = `<h3>Categorievolgorde</h3><p>(Nog niet geïmplementeerd)</p>`;
            layout.appendChild(catBlock);

            // Kanaalverplaatsing
            const chBlock = document.createElement("div");
            chBlock.innerHTML = `<h3>Kanalen herschikken/verplaatsen</h3>`;
            const chRow = document.createElement("div");
            chRow.className = "grepochat-row";

            const catSelect = document.createElement("select");
            const kanaalSelect = document.createElement("select");
            const moveUpBtn = document.createElement("button");
            moveUpBtn.textContent = "⬆️";
            const moveDownBtn = document.createElement("button");
            moveDownBtn.textContent = "⬇️";
            const moveToCatSelect = document.createElement("select");
            const moveToCatBtn = document.createElement("button");
            moveToCatBtn.textContent = "⤵️ Verplaats";

            chRow.append(catSelect, kanaalSelect, moveUpBtn, moveDownBtn);
            layout.appendChild(chBlock);
            chBlock.appendChild(chRow);

            const moveRow = document.createElement("div");
            moveRow.className = "grepochat-row";
            moveRow.append(moveToCatSelect, moveToCatBtn);
            chBlock.appendChild(moveRow);

            content.appendChild(layout);

            const categorieën = {};
            const cats = await categorieenCollection().get();
            cats.forEach(doc => {
                categorieën[doc.id] = doc.data().name;
                const o1 = document.createElement("option");
                o1.value = doc.id;
                o1.textContent = doc.data().name;
                catSelect.appendChild(o1);

                const o2 = document.createElement("option");
                o2.value = doc.id;
                o2.textContent = doc.data().name;
                moveToCatSelect.appendChild(o2);
            });

            let huidigeKanalen = [];

            catSelect.onchange = async () => {
                kanaalSelect.innerHTML = "";
                huidigeKanalen = [];

                const snaps = await kanalenCollection().where("category", "==", catSelect.value).get();
                snaps.forEach(doc => {
                    const kanaal = { id: doc.id, ...doc.data() };
                    huidigeKanalen.push(kanaal);
                });

                huidigeKanalen.forEach((k, i) => {
                    const opt = document.createElement("option");
                    opt.value = k.id;
                    opt.textContent = `${i + 1}. ${k.name}`;
                    kanaalSelect.appendChild(opt);
                });
            };

            moveUpBtn.onclick = async () => {
                const idx = kanaalSelect.selectedIndex;
                if (idx > 0) {
                    [huidigeKanalen[idx], huidigeKanalen[idx - 1]] = [huidigeKanalen[idx - 1], huidigeKanalen[idx]];
                    await saveNewOrder();
                }
            };

            moveDownBtn.onclick = async () => {
                const idx = kanaalSelect.selectedIndex;
                if (idx < huidigeKanalen.length - 1) {
                    [huidigeKanalen[idx], huidigeKanalen[idx + 1]] = [huidigeKanalen[idx + 1], huidigeKanalen[idx]];
                    await saveNewOrder();
                }
            };

            moveToCatBtn.onclick = async () => {
                const kanaalId = kanaalSelect.value;
                const nieuweCat = moveToCatSelect.value;
                if (!kanaalId || !nieuweCat) return;
                await kanalenCollection().doc(kanaalId).update({ category: nieuweCat });
                openSettingsPopup(); // herlaad
            };

            async function saveNewOrder() {
                // Store volgorde via numerieke "order" velden (niet zichtbaar in UI nog)
                for (let i = 0; i < huidigeKanalen.length; i++) {
                    await kanalenCollection().doc(huidigeKanalen[i].id).update({ order: i });
                }
                catSelect.dispatchEvent(new Event("change"));
            }

            if (catSelect.options.length) catSelect.dispatchEvent(new Event("change"));
        }
    };


    // - Categorie/Channel beheer

    async function showCategoryTab(container) {
        container.querySelector('#default-settings-view')?.remove();
        container.querySelectorAll('.tab-content')?.forEach(el=>el.remove());

        const tab = document.createElement('div');
        tab.className = 'tab-content';
        tab.style = 'margin-top:20px; display:grid;grid-template-columns:1fr 1fr;gap:16px;';
        // Category column
        const catCol = document.createElement('div');
        catCol.innerHTML = `
            <h3 style='margin-bottom:8px;'>Categorieën</h3>
            <div style='display:flex; gap:8px; align-items:center;'>
                <select id='catSelect' style='flex:1; padding:4px;'></select>
                <input id='catInput' type='text' placeholder='Nieuwe categorie' style='flex:2; padding:4px;' />
                <button id='addCat' style='padding:4px 6px;'>➕</button>
            </div>
        `;

        // Kanaal column
        const chCol = document.createElement('div');
        chCol.innerHTML = `
            <h3 style='margin-bottom:8px;'>Kanalen</h3>
            <div style='display:flex; gap:8px; align-items:center;'>
                <select id='kanaalSelect' style='flex:1; padding:4px;'></select>
                <input id='kanaalInput' type='text' placeholder='Nieuw kanaal' style='flex:2; padding:4px;' />
                <button id='addKanaal' style='padding:4px 6px;'>➕</button>
            </div>
            <h4 style='margin:12px 0 4px;'>Sub-kanalen</h4>
            <div style='display:flex; gap:8px; align-items:center;'>
                <select id='subSelect' style='flex:1; padding:4px;' disabled></select>
                <input id='subInput' type='text' placeholder='Nieuw subkanaal' style='flex:2; padding:4px;' />
                <button id='addSub' style='padding:4px 6px;'>➕</button>
            </div>
        `;

        tab.appendChild(catCol);
        tab.appendChild(chCol);
        container.appendChild(tab);

        // Elements
        const catSelect = tab.querySelector('#catSelect');
        const kanaalSelect = tab.querySelector('#kanaalSelect');
        const subSelect = tab.querySelector('#subSelect');

        // Load categories
        const cats = await categorieenCollection().get();
        cats.forEach(doc=>{
            const opt = document.createElement('option'); opt.value = doc.id; opt.textContent = doc.data().name;
            catSelect.appendChild(opt);
        });
        catSelect.onchange = async () => {
            // Populate channels
            kanaalSelect.innerHTML = '';
            subSelect.innerHTML = '';
            subSelect.disabled = true;
            const snaps = await kanalenCollection().where('category','==',catSelect.value).get();
            snaps.forEach(doc=>{
                const o = document.createElement('option'); o.value = doc.id; o.textContent = doc.data().name;
                kanaalSelect.appendChild(o);
            });
            kanaalSelect.dispatchEvent(new Event('change'));
        };

        kanaalSelect.onchange = async () => {
            subSelect.innerHTML = '';
            subSelect.disabled = false;
            const doc = await kanalenCollection().doc(kanaalSelect.value).get();
            (doc.data().subchannels||[]).forEach(name=>{
                const o = document.createElement('option'); o.textContent = name;
                subSelect.appendChild(o);
            });
        };

        // Add handlers
        tab.querySelector('#addCat').onclick = async () => {
            const input = tab.querySelector('#catInput');
            if (!input.value.trim()) return;
            await categorieenCollection().add({ name: input.value.trim() });
            openSettingsPopup();
        };
        tab.querySelector('#addKanaal').onclick = async () => {
            const input = tab.querySelector('#kanaalInput');
            if (!input.value.trim() || !catSelect.value) return;
            await kanalenCollection().add({ name: input.value.trim(), category: catSelect.value, subchannels: [] });
            openSettingsPopup();
        };
        tab.querySelector('#addSub').onclick = async () => {
            const input = tab.querySelector('#subInput');
            if (!input.value.trim() || !kanaalSelect.value) return;
            await kanalenCollection().doc(kanaalSelect.value)
                .update({ subchannels: firebase.firestore.FieldValue.arrayUnion(input.value.trim()) });
            openSettingsPopup();
        };

        // Trigger initial load
        if (catSelect.options.length) catSelect.dispatchEvent(new Event('change'));
    }

    async function updateKanaalDropdown(catId, kanaalSelect) {
        kanaalSelect.innerHTML = "";
        const kanaalSnap = await kanalenCollection().where("category", "==", catId).get();
        kanaalSnap.forEach(doc => {
            const opt = document.createElement("option");
            opt.value = doc.id;
            opt.textContent = doc.data().name;
            kanaalSelect.appendChild(opt);
        });
        if (kanaalSelect.options.length > 0) {
            kanaalSelect.dispatchEvent(new Event("change"));
        }
    }

    // - Gebruikersprofiel bewerking

    function openProfilePopup() {
        // Check of popup al open is
        if (document.getElementById("grepochat-profile-popup")) return;

        // Bouw overlay & popup
        const overlay = document.createElement("div");
        overlay.id = "grepochat-profile-popup";
        overlay.style = `
    position: fixed; top:0; left:0; width:100vw; height:100vh;
    background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center;
    z-index:10010;
  `;

        const form = document.createElement("form");
        form.style = `
    background: #2f3136; padding:20px; border-radius:8px; color:#ddd;
    width: 300px; display:flex; flex-direction:column; gap:10px;
  `;
        form.innerHTML = `
    <h3>Profiel bewerken</h3>
    <label>Echte naam:<input type="text" name="real_name" /></label>
    <label>Locatie:<input type="text" name="location" /></label>
    <label>Geboortedatum:<input type="date" name="birthdate" /></label>
    <label>Status:<input type="text" name="status" /></label>
    <label>Avatar-URL:<input type="text" name="avatar" placeholder="https://..." /></label>
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
      <button type="button" id="profile-cancel">Annuleren</button>
      <button type="submit">Opslaan</button>
    </div>
  `;

        overlay.appendChild(form);
        document.body.appendChild(overlay);

        // Laad bestaande waarden uit Firestore
        const docRef = gebruikersCollection().doc(userId);
        docRef.get().then(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            form.real_name.value = data.real_name || "";
            form.location.value = data.location || "";
            form.birthdate.value = data.birthdate || "";
            form.status.value = data.status || "";
            form.avatar.value = data.avatar || "";
        });

        // Handlers
        form.addEventListener("submit", async e => {
            e.preventDefault();
            const updates = {
                real_name: form.real_name.value.trim(),
                location: form.location.value.trim(),
                birthdate: form.birthdate.value || "",
                status: form.status.value.trim(),
                avatar: form.avatar.value.trim() || undefined
            };
            // Remove avatar key if empty to keep default
            if (!updates.avatar) delete updates.avatar;

            await docRef.update(updates);
            overlay.remove();
        });

        document.getElementById("profile-cancel").onclick = () => overlay.remove();
    }

    // - Permissie management

    // =============================================
    // 7. GREPOLIS INTEGRATIE
    // =============================================

    // - Game data parsing

    async function haalAlliantieNaamOp() {
        // 1) Bepaal de wereld (bv. "nl120")
        const world = window.location.host.split('.')[0];
        // 2) Haal de huidige alliance_id uit Game
        const allianceId = window.Game?.alliance_id;
        if (!allianceId) {
            return "Geen alliantie";
        }
        // 3) Fetchen van de alliances.txt
        const url = `https://${window.location.host}/data/alliances.txt`;
        try {
            const res = await fetch(url, {
                credentials: 'include' // houdt login-sessie in stand :contentReference[oaicite:5]{index=5}
            });
            if (!res.ok) {
                console.warn("Kan alliances.txt niet ophalen, status:", res.status);
                return "Onbekend";
            }
            const text = await res.text(); // haal platte tekst op :contentReference[oaicite:6]{index=6}
            // 4) Verwerk elke regel
            const lines = text.split('\n'); // split op regeleinden :contentReference[oaicite:7]{index=7}
            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.split(','); // CSV-splits :contentReference[oaicite:8]{index=8}
                if (parts[0] === allianceId.toString()) {
                    // 5) Decode naam en vervang '+' door spaties :contentReference[oaicite:9]{index=9}
                    return decodeURIComponent(parts[1].replace(/\+/g, ' '));
                }
            }
            return "Onbekend";
        } catch (e) {
            console.error("Fout bij ophalen alliances.txt:", e);
            return "Onbekend";
        }
    }

    async function fetchPlayersAlternative() {
        if (!window.Game || !window.Game.players) return null;
        return Object.entries(window.Game.players).map(([id, name]) => ({
            id,
            name: decodeURIComponent(name.replace(/\+/g, ' '))
        }));
    }

    // - In-game element interceptie

    function wachtOpGameData(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (window.Game?.player_id && window.Game?.csrfToken) {
                    resolve();
                } else if (Date.now() - start > timeout) {
                    reject("Game data niet beschikbaar na 10 seconden.");
                } else {
                    setTimeout(check, 200);
                }
            };
            check();
        });
    }

    // - Officiële API communicatie

    async function openPlayerProfile(playerName) {
        try {
            const playerId = await getPlayerId(playerName);
            const world = window.Game.world_id;

            if (playerId) {
                // Officiële Grepolis methode
                if (window.Layout && window.Layout.playerProfile) {
                    window.Layout.playerProfile.open(playerName, playerId);
                }
                // Fallback URL
                else {
                    window.open(`https://${world}.grepolis.com/game/profile?id=${playerId}`, '_blank');
                }
            } else {
                console.warn('Speler niet gevonden:', playerName);
                // Fallback naar naam-based benadering
                window.open(`https://${world}.grepolis.com/game/profile?player=${encodeURIComponent(playerName)}`, '_blank');
            }
        } catch (error) {
            console.error('Fout bij openen profiel:', error);
        }
        return false;
    }

    async function getPlayerId(playerName) {
        try {
            const world = window.Game.world_id;
            const response = await fetch(`https://${world}.grepolis.com/data/players.txt`);
            const text = await response.text();
            const lines = text.split('\n');

            const cleaned = playerName.trim().toLowerCase();

            for (const line of lines) {
                const [id, name] = line.split(',');
                if (name && name.trim().replace(/\+/g, ' ').toLowerCase() === cleaned) {
                    return id;
                }
            }
            return null;
        } catch (error) {
            console.error('Fout bij ophalen spelersdata:', error);
            return null;
        }
    }

    function getAllianceId(name) {
        if (!window.Game || !Game.alliances) return null;

        return Object.entries(Game.alliances).find(([id, encodedName]) => {
            return decodeURIComponent(encodedName.replace(/\+/g, " ")) === name;
        })?.[0] || null;
    }


    // - UI aanpassingen

    // =============================================
    // 8. EVENT HANDLERS EN OBSERVERS
    // =============================================

    // - DOM mutation observers

    function initPlayerLinks() {
        // Event delegation voor alle player links
        document.addEventListener('click', function(e) {
            const playerLink = e.target.closest('.bb-player');
            if (playerLink) {
                e.preventDefault();
                const playerName = playerLink.getAttribute('data-player');
                openPlayerProfile(playerLink.dataset.player);
            }
        });

        // Fallback implementatie
        window.openPlayerProfile = function(playerName) {
            try {
                if (window.Layout && window.Layout.playerProfile) {
                    window.Layout.playerProfile.open(playerName);
                } else {
                    window.open(`/game/profile?player=${encodeURIComponent(playerName)}`, '_blank');
                }
            } catch (e) {
                console.error('Error opening profile:', e);
            }
        };

        window.openAllianceProfile = async function(allyName) {
            try {
                const id = getAllianceId(allyName);
                if (id) {
                    Layout.allianceProfile.open(allyName, id);
                } else {
                    alert("Alliantie niet gevonden: " + allyName);
                }
            } catch (e) {
                console.error("Fout bij openen alliantie-profiel:", e);
            }
        };

        // Alternatieve methode voor dynamische content
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        const links = node.querySelectorAll ? node.querySelectorAll('.bb-player') : [];
                        links.forEach(link => {
                            link.onclick = (e) => {
                                e.preventDefault();
                                openPlayerProfile(link.dataset.player);
                            };
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    document.addEventListener("click", async (e) => {
        const link = e.target.closest(".bb-player");
        if (!link) return;

        e.preventDefault();
        const name = link.dataset.player;
        const id = await getPlayerId(name);
        if (id && Layout?.playerProfile) {
            Layout.playerProfile.open(name, id);
        } else {
            console.warn("Speler niet gevonden:", name);
        }
    });

    document.addEventListener("click", async (e) => {
    const el = e.target.closest(".bb-ally");
    if (el) {
        e.preventDefault();
        const allyId = el.dataset.allyId;
        const allyName = el.dataset.ally;

        if (allyId && allyId !== "onbekend") {
            Layout.allianceProfile.open(allyId);
        } else {
            alert(`Alliantie niet gevonden: ${allyName}`);
        }
    }
});

    // - Real-time listeners

    function setupPlayerLinks() {
        document.addEventListener('click', function(e) {
            // Zoek naar het dichtstbijzijnde player element
            const playerElement = e.target.closest('.bb-player, [data-player]');

            if (playerElement) {
                e.preventDefault();
                const playerName = playerElement.dataset.player;
                const playerId = playerElement.dataset.playerId;

                if (playerName) {
                    openPlayerProfile(playerName, playerId);
                }
            }
        });
    }

    // - Custom event handlers

    function enableProfileEditing() {
        const userList = document.getElementById("grepochat-users");
        if (!userList) return;
        userList.addEventListener("click", e => {
            const img = e.target.closest("img");
            if (!img) return;
            // Check of dit jouw eigen userId is
            const li = img.closest("li");
            if (!li) return;
            // We kunnen userId per li opslaan als data-attribuut bij renderen
            const uid = li.dataset.userid;
            if (uid === userId) {
                openProfilePopup();
            }
        });
    }

    // - Cross-component communicatie

    // =============================================
    // 9. INITIALISATIE EN STARTUP
    // =============================================

    // - Script init volgorde

    async function login() {
        const result = await auth.signInAnonymously();
        userId = result.user.uid;

        await wachtOpGameData(); // ← WACHT TOT window.Game klaar is
        await ensureWorldExists();
        await ensureUserExists();

        voegGrepoChatKnopToe();
        buildUI();

        await renderChannels();
        laadSpelersLive();
        enableProfileEditing();
        setTimeout(laadSpelersLive, 300); // klein uitstel zodat het rechterpaneel zeker bestaat
    }

    function init() {
        // Eerst setupPlayerLinks aanroepen
        setupPlayerLinks();
    }

    // - Afhankelijkheden check

    function initialize() {
        // Wacht tot de DOM klaar is
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            initPlayerLinks();
        } else {
            document.addEventListener('DOMContentLoaded', initPlayerLinks);
        }

        // Voor dynamische content (bijv. single page apps)
        window.addEventListener('load', initPlayerLinks);
    }

    // - Fallback mechanismen

    // - Laadprocedures

    const applyBBCodeToolbar = () => {
        const ta = document.querySelector("#grepochat-input");
        if (!ta || document.getElementById("grepochat-bbcode-toolbar")) return;
        const parent = ta.parentNode;
        const toolbar = createToolbar(ta);
        parent.insertBefore(toolbar, ta);
    };

    // =============================================
    // 10. DEBUGGING EN TESTEN
    // =============================================

    // - Test functies

    // - Logging systemen

    // - Foutafhandeling

    window.debugGrepolisChat = {
        openPlayerProfile,
        initPlayerLinks,
        parseBBCode
    };

    // - Performance monitoring

    // =============================================
    // 11. UI STYLESHEETS
    // =============================================

    // - Stijl voor de popup

    const popupStyle = `
        .gc-popup {
            position: absolute;
            background: #2f3136;
            border: 1px solid #555;
            border-radius: 4px;
            padding: 10px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            display: block !important; /* Override eventuele verborgen states */
            visibility: visible !important;
            opacity: 1 !important;
        }
        .gc-popup input {
            width: 100%;
            padding: 6px;
            margin-bottom: 8px;
            background: #202225;
            border: 1px solid #444;
            color: #ddd;
        }
        .gc-popup-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 6px;
            margin-top: 8px;
        }
        .gc-popup button {
            padding: 4px 10px;
            border-radius: 3px;
            cursor: pointer;
        }
        .gc-popup-cancel {
            background: #444;
            color: #ddd;
        }
        .gc-popup-submit {
            background: #7289da;
            color: white;
        }
        .gc-popup select {
            width: 100%;
            padding: 8px;
            background: #40444b;
            color: white;
            border: 1px solid #202225;
            border-radius: 4px;
            appearance: none;
            -webkit-appearance: none;
            cursor: pointer;
        }

        .gc-popup select:focus {
            outline: none;
            border-color: #7289da;
        }
        .bbcodes_player {
            font: 13px Verdana,Arial,Helvetica,sans-serif !important;
            list-style: none !important;
            line-height: 17px !important;
            word-wrap: break-word !important;
            outline-style: none !important;
            font-weight: 700 !important;
            text-decoration: none !important;
            color: #804000 !important;
            cursor: pointer !important;
            padding-left: 20px !important;
            background: url(https://gpnl.innogamescdn.com/images/game/bb_codes/player.png) no-repeat !important;
            display: inline-block;
            height: 20px;
            margin: 0 2px;
        }

    `;

    // ======================
    // UI Stijl voor de popup
    // ======================

    // Voeg stijl toe aan de pagina
    const style = document.createElement('style');
    style.textContent = `
    .gc-popup {
        position: fixed;
        background: #2f3136;
        border: 1px solid #7289da;
        border-radius: 5px;
        padding: 15px;
        z-index: 99999;
        box-shadow: 0 0 15px rgba(0,0,0,0.7);
        min-width: 250px;
    }

        .gc-popup-btn {
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
        }

        #gc-popup-cancel {
            background: #4f545c;
            color: white;
        }

        #gc-popup-submit {
            background: #7289da;
            color: white;
        }
    `;
    document.head.appendChild(style);

    // =============================================
    // 12. DOM MANIPULATIE HELPERS
    // =============================================

    // - Maak een popup voor BB-code invoer

    function createPopup(options, parentElement) {
        const popup = document.createElement('div');
        popup.className = 'gc-popup';

        popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        let html = `<h3 style="margin-top:0;color:#fff;">${options.title}</h3>`;

        // Input velden genereren
        options.fields.forEach(field => {
            html += `<div class="gc-popup-field">`;
            html += `<label for="${field.id}">${field.label}</label>`;

            if (field.type === 'select') {
                html += `<select id="${field.id}">`;
                field.options.forEach(opt => {
                    html += `<option value="${opt.value}">${opt.label}</option>`;
                });
                html += `</select>`;
            } else {
                // Aangepast voor text input
                html += `<input type="${field.type || 'text'}"
                    id="${field.id}"
                    placeholder="${field.placeholder || ''}"
                    value="${field.value || ''}"
                    style="width:100%;padding:8px;margin-top:4px;">`;
            }
        });

        html += `
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
            <button id="gc-popup-cancel" style="padding:6px 12px;background:#4f545c;color:#fff;border:none;border-radius:3px;cursor:pointer;">
                Annuleren
            </button>
            <button id="gc-popup-submit" style="padding:6px 12px;background:#7289da;color:#fff;border:none;border-radius:3px;cursor:pointer;">
                Toepassen
            </button>
        </div>
    `;

        popup.innerHTML = html;
        parentElement.appendChild(popup);

        // Positionering
        const rect = parentElement.getBoundingClientRect();
        popup.style.position = 'absolute';
        popup.style.bottom = '100%';
        popup.style.left = '0';

        // Sluit popup bij klik buiten
        const closePopup = function(e) {
            if (!popup.contains(e.target))
                popup.remove();
            document.removeEventListener('click', closePopup);

        };
        setTimeout(() => document.addEventListener('click', closePopup), 10);

        // Verbeterde event handlers voor knoppen
        const submitBtn = popup.querySelector('#gc-popup-submit');
        const cancelBtn = popup.querySelector('#gc-popup-cancel');

        cancelBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            popup.remove();
            document.removeEventListener('click', closePopup);
        });

        return {
            element: popup,
            onSubmit: (callback) => {
                submitBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const values = {};
                    if (options.fields) {
                        options.fields.forEach(field => {
                            values[field.id] = popup.querySelector(`#${field.id}`).value;
                        });
                    } else {
                        values.value = popup.querySelector('#gc-popup-input').value;
                    }
                    callback(values);
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                });
            }
        };
    }

    // - voeht de grepochat knop toe

    function voegGrepoChatKnopToe() {
        waitForElement("li.allianceforum.main_menu_item").then(li => {
            const knop = document.createElement("li");
            knop.className = "main_menu_item";
            knop.innerHTML = `
            <span class="content_wrapper">
                <span class="button_wrapper">
                    <span class="button">
                        <span class="icon"></span>
                    </span>
                </span>
                <span class="name_wrapper">
                    <span class="name">GrepoChat</span>
                </span>
            </span>`;
            knop.onclick = () => {
                const container = document.getElementById("grepochat-container");
                if (container) {
                    container.style.display = container.style.display === 'flex' ? 'none' : 'flex';
                }
            };
            li.parentNode.insertBefore(knop, li.nextSibling);
        });
    }

    // - ???

    function waitForElement(selector) {
        return new Promise(resolve => {
            const check = () => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                requestAnimationFrame(check);
            };
            check();
        });
    }

    // =============================================
    // 13. REAL-TIME COMMUNICATIE
    // =============================================

    let currentChannelId = null;
    const messageUnsubscribes = {}; // channelId → unsubscribe functie
    const unreadCounts = {}; // { kanaalId: aantal }
    const activeMessageListeners = new Set();

    function sendMessage() {
        const input = document.getElementById("grepochat-input");
        const text = input.value.trim();
        if (!text || !currentChannelId || !userId) return;

        kanalenCollection().doc(currentChannelId).collection("messages").add({
            text: text,
            senderId: userId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        input.value = "";
    }

    // ===================
    // einde
    // ===================

    window.parseBBCode = parseBBCode;
    window.openPlayerProfile = openPlayerProfile;
    window.addEventListener('DOMContentLoaded', () => {
        initPlayerLinks();
        init();
        loadTownData();
    });

    function initChat() {

        buildUI();
        ensureTownsCacheAndUpdateMessages(); // voeg hier toe
    }

    // START HET SCRIPT
    login();
    initialize();
})();
