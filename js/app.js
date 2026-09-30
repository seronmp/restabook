import { state, translations } from './config.js';
import { initAuth } from './auth.js';
import { renderCalendar, renderDailySummary, formatDateKey } from './calendar.js';
import { renderRooms, renderTables } from './floor.js';

// ==========================================
// FIX: FUNZIONE GLOBALE DI CONTENIMENTO (TABLET VS PC)
// ==========================================
window.fermaEntroIConfini = function(x, y, maxWidth = 1000, maxHeight = 800, elWidth = 50, elHeight = 50) {
    return {
        x: Math.max(0, Math.min(x, maxWidth - elWidth)),
        y: Math.max(0, Math.min(y, maxHeight - elHeight))
    };
};

document.addEventListener('DOMContentLoaded', () => {
    initAuth(async () => {
        await initRestaurantSelector(); // Carica prima la lista
        await loadData();               // Poi disegna lo schermo
        setupEventListeners();
        setupGlobalHeaderButtons();
    });
});

async function loadData() {
    if (!state.supabaseClient) {
        console.warn("Client Supabase non ancora inizializzato.");
        return;
    }
    
    const restId = state.currentRestaurantId || localStorage.getItem('currentRestaurantId');
    if (!restId || restId === 'undefined') return;

    state.rooms = [];
    state.currentRoomId = null;

    try {
        // 1. CARICAMENTO SALE E MURI
        if (restId !== 'tutti') {
            const { data, error } = await state.supabaseClient
                .from('restaurants')
                .select('rooms_config')
                .eq('restaurant_id', restId)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error("Errore (rooms_config):", error.message);
            } else if (data && data.rooms_config && data.rooms_config.length > 0) {
                state.rooms = typeof data.rooms_config === 'string' ? JSON.parse(data.rooms_config) : data.rooms_config;
            } else {
                const savedRooms = localStorage.getItem('restabook_rooms_' + restId) || localStorage.getItem('rooms_' + restId);
                if (savedRooms) {
                    try { state.rooms = JSON.parse(savedRooms); } catch (e) {}
                }
            }
        }

        // Conversione vecchi muri e sanificazione coordinate (Tablet/PC fix)
        if (restId === 'tutti') {
            state.rooms = [{ id: 'sala-globale', name: 'Vista Globale', walls: [] }];
        } else if (state.rooms && state.rooms.length > 0) {
            if (state.rooms[0].x1 !== undefined || !state.rooms[0].id) {
                state.rooms = [{
                    id: 'sala-principale',
                    name: 'Sala Principale',
                    walls: [...state.rooms]
                }];
                if (typeof window.saveRoomsToLocal === 'function') setTimeout(() => window.saveRoomsToLocal(), 500);
            }
            
            // Assicura che i muri non escano dallo schermo
            state.rooms.forEach(r => {
                if (!r.walls) r.walls = [];
                r.walls = r.walls.map(w => ({
                    ...w,
                    x1: Math.max(0, Math.min(w.x1 ?? 50, 1000)),
                    y1: Math.max(0, Math.min(w.y1 ?? 50, 800)),
                    x2: Math.max(0, Math.min(w.x2 ?? 250, 1000)),
                    y2: Math.max(0, Math.min(w.y2 ?? 50, 800))
                }));
            });
        } else {
            state.rooms = [{ id: 'sala-principale', name: 'Sala Principale', walls: [] }];
        }

        if (state.rooms.length > 0) state.currentRoomId = state.rooms[0].id;

        // 2. OTTIMIZZAZIONE: CARICAMENTO IN PARALLELO DI TAVOLI E PRENOTAZIONI
        let queryTables = state.supabaseClient.from('tables').select('*');
        let queryBookings = state.supabaseClient.from('bookings').select('*');

        if (restId !== 'tutti') {
            queryTables = queryTables.eq('restaurant_id', restId);
            queryBookings = queryBookings.eq('restaurant_id', restId);
        }

        // Esegue le query simultaneamente invece di aspettarle in sequenza
        const [ 
            { data: tablesData, error: tablesError }, 
            { data: bookingsData, error: bookingsError } 
        ] = await Promise.all([queryTables, queryBookings]);

        if (tablesError) throw tablesError;
        if (bookingsError) throw bookingsError;

        // 3. PARSING TAVOLI CON CONTROLLO CONFINI (Clamp)
        state.tables = (tablesData || []).map(t => {
            const width = t.width ?? (t.seats <= 2 ? 70 : t.seats <= 4 ? 90 : t.seats <= 8 ? 120 : 150);
            const height = t.height ?? (t.seats <= 8 ? 90 : 100);
            
            // Controlla che il tavolo caricato non sia fuori schermo
            const safePos = window.fermaEntroIConfini(t.pos_x ?? 50, t.pos_y ?? 50, 1000, 800, width, height);

            return {
                id: t.id,
                table_number: t.table_number,
                seats: t.seats,
                shape: t.shape,
                pos_x: safePos.x,
                pos_y: safePos.y,
                width: width,
                height: height,
                rotation: t.rotation ?? 0,
                room_id: t.room_id || 'sala-principale',
                restaurant_id: t.restaurant_id
            };
        });

        // 4. PARSING PRENOTAZIONI
        state.bookings = (bookingsData || []).map(b => ({
            id: b.id,
            tableId: b.table_id,
            date: b.date,
            startTime: b.start_time ? b.start_time.substring(0, 5) : '',
            endTime: b.end_time ? b.end_time.substring(0, 8) : '',
            name: b.name,
            guests: b.guests,
            phone: b.phone
        }));

        refreshUI();
    } catch (err) {
        console.error("Errore caricamento Supabase:", err.message);
    }
}

async function initRestaurantSelector() {
    const select = document.getElementById('restaurant-select');
    if (!select || !state.supabaseClient) return;

    const { data: restaurants, error } = await state.supabaseClient.from('restaurants').select('*');
    if (error) {
        console.error("Errore caricamento ristoranti:", error);
        return;
    }

    state.allRestaurants = restaurants || [];

    const userRole = localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
    const isSpecificRestaurant = state.currentRestaurantId && state.currentRestaurantId !== 'tutti' && userRole !== 'admin';

    if (isSpecificRestaurant) {
        select.style.display = 'none';
        return;
    }

    select.style.display = 'block';
    let optionsHtml = `<option value="tutti">Tutti i ristoranti / Admin (Vista Globale)</option>`;
    if (restaurants) {
        restaurants.forEach(r => {
            const isSelected = r.restaurant_id === state.currentRestaurantId ? 'selected' : '';
            optionsHtml += `<option value="${r.restaurant_id}" data-name="${r.name}" ${isSelected}>${r.name}</option>`;
        });
    }
    select.innerHTML = optionsHtml;

    select.onchange = async (e) => {
        const selectedId = e.target.value;
        const selectedOpt = e.target.options[e.target.selectedIndex];
        
        state.currentRestaurantId = selectedId;
        state.currentRestaurantName = selectedId === 'tutti' ? "Admin Globale" : (selectedOpt ? selectedOpt.getAttribute('data-name') : '');

        localStorage.setItem('currentRestaurantId', state.currentRestaurantId);
        localStorage.setItem('currentRestaurantName', state.currentRestaurantName);

        await loadData();
    };
}

function setupGlobalHeaderButtons() {
    const existing = document.getElementById('global-actions-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'global-actions-container';
    container.className = 'flex items-center space-x-2 ml-4';

    const isAdmin = state.currentRestaurantId === 'tutti' || (localStorage.getItem('userRole') === 'admin');

    let html = '';
    if (isAdmin) {
        html += `<button id="btn-create-restaurant-header" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition flex items-center space-x-1">
            <i class="fa-solid fa-plus"></i><span>Ristorante</span>
        </button>`;
    }

    html += `<button id="btn-logout-header" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition flex items-center space-x-1">
        <i class="fa-solid fa-right-from-bracket"></i><span>Esci</span>
    </button>`;

    container.innerHTML = html;

    const headerRight = document.querySelector('header .flex.items-center.space-x-4');
    if (headerRight) headerRight.appendChild(container);

    const btnCreate = document.getElementById('btn-create-restaurant-header');
    if (btnCreate) btnCreate.onclick = () => window.location.href = 'register.html';

    const btnLogout = document.getElementById('btn-logout-header');
    if (btnLogout) {
        btnLogout.onclick = async () => {
            try {
                if (state.supabaseClient) await state.supabaseClient.auth.signOut();
            } catch (e) {
                console.log("Logout:", e);
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'index.html';
        };
    }
}

function refreshUI() {
    renderRooms(refreshUI);
    renderCalendar(refreshUI);
    renderTables(openTableModal);
    renderDailySummary(deleteBooking);
}

function setupEventListeners() {
    document.getElementById('btn-it').addEventListener('click', () => setLanguage('it'));
    document.getElementById('btn-de').addEventListener('click', () => setLanguage('de'));

    document.getElementById('cal-prev').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar(refreshUI);
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar(refreshUI);
    });

    document.getElementById('filter-time').addEventListener('change', () => renderTables(openTableModal));
    document.getElementById('btn-toggle-edit').addEventListener('click', toggleEditMode);

    document.getElementById('btn-add-wall').addEventListener('click', addCustomWall);
    document.getElementById('btn-add-room').addEventListener('click', () => document.getElementById('room-config-modal').classList.remove('hidden'));
    document.getElementById('btn-add-table').addEventListener('click', () => document.getElementById('table-config-modal').classList.remove('hidden'));

    // Chiusura Modali
    const closeModal = (id) => document.getElementById(id).classList.add('hidden');
    document.getElementById('close-booking-modal').addEventListener('click', () => closeModal('booking-modal'));
    document.getElementById('close-table-config-modal').addEventListener('click', () => closeModal('table-config-modal'));
    document.getElementById('close-room-config-modal').addEventListener('click', () => closeModal('room-config-modal'));

    document.getElementById('booking-form').addEventListener('submit', saveBooking);
    document.getElementById('form-phone').addEventListener('input', checkClientPrivacy);

    document.getElementById('table-config-form').addEventListener('submit', saveNewTable);
    document.getElementById('room-config-form').addEventListener('submit', saveNewRoom);
}

function setLanguage(lang) {
    state.currentLang = lang;
    const isIt = lang === 'it';
    
    document.getElementById('btn-it').className = isIt ? 'px-3 py-1 rounded-md text-sm font-medium bg-white shadow-sm' : 'px-3 py-1 rounded-md text-sm font-medium text-gray-600';
    document.getElementById('btn-de').className = !isIt ? 'px-3 py-1 rounded-md text-sm font-medium bg-white shadow-sm' : 'px-3 py-1 rounded-md text-sm font-medium text-gray-600';

    const t = translations[lang];
    const elementsToTranslate = {
        'opt-all': t.timeFilterAll, 'opt-lunch': t.timeFilterLunch,
        'opt-dinner1': t.timeFilterDinner1, 'opt-dinner2': t.timeFilterDinner2,
        'app-title': state.currentRestaurantName || t.title,
        'calendar-title': t.calendar, 'floor-title': t.floorTitle,
        'floor-subtitle': t.floorSubtitle, 'lbl-time-filter': t.timeFilter,
        'legend-title': t.legendTitle, 'leg-free': t.free,
        'leg-partial': t.partial, 'leg-full': t.full,
        'modal-existing-title': t.existingTitle, 'modal-form-title': t.formTitle,
        'lbl-start': t.lblStart, 'lbl-end': t.lblEnd,
        'lbl-name': t.lblName, 'lbl-guests': t.lblGuests,
        'lbl-phone': t.lblPhone, 'btn-save': t.btnSave,
        'txt-add-table': t.newTable, 'txt-add-room': t.newRoom,
        'txt-add-wall': t.addWall, 'summary-box-title': t.dailySummaryTitle,
        'summary-box-subtitle': t.dailySummarySub, 'lbl-total-guests-label': t.totalGuestsLabel,
        'th-time': t.thTime, 'th-table': t.thTable, 'th-name': t.thName,
        'th-guests': t.thGuests, 'th-phone': t.thPhone, 'th-actions': t.thActions,
        'txt-edit-mode': state.isEditMode ? t.editModeOn : t.editModeOff
    };

    for (const [id, text] of Object.entries(elementsToTranslate)) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    checkClientPrivacy();
    refreshUI();
}

function toggleEditMode() {
    state.isEditMode = !state.isEditMode;
    const btnEdit = document.getElementById('btn-toggle-edit');
    const btnAddTable = document.getElementById('btn-add-table');
    const btnAddRoom = document.getElementById('btn-add-room');
    const btnAddWall = document.getElementById('btn-add-wall');
    const t = translations[state.currentLang];

    if (state.isEditMode) {
        btnEdit.className = "px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white shadow-sm transition flex items-center space-x-1.5";
        document.getElementById('txt-edit-mode').innerText = t.editModeOn;
        btnAddTable.classList.remove('hidden');
        btnAddRoom.classList.remove('hidden');
        btnAddWall.classList.remove('hidden');
    } else {
        btnEdit.className = "px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center space-x-1.5";
        document.getElementById('txt-edit-mode').innerText = t.editModeOff;
        btnAddTable.classList.add('hidden');
        btnAddRoom.classList.add('hidden');
        btnAddWall.classList.add('hidden');
    }
    renderTables(openTableModal);
}

async function saveRoomsToLocal() {
    const restId = state.currentRestaurantId || localStorage.getItem('currentRestaurantId');
    if (!state.rooms || state.rooms.length === 0) return;
    
    const roomsData = JSON.stringify(state.rooms);
    
    if (restId) {
        localStorage.setItem('restabook_rooms_' + restId, roomsData);
        localStorage.setItem('rooms_' + restId, roomsData);
    }
    localStorage.setItem('restabook_rooms_global', roomsData);

    if (state.supabaseClient && restId && restId !== 'tutti') {
        try {
            const { error } = await state.supabaseClient
                .from('restaurants')
                .update({ rooms_config: state.rooms })
                .eq('restaurant_id', restId);

            if (error) console.error("Errore nel salvataggio su Supabase:", error.message);
        } catch (err) {
            console.error("Errore di rete durante il salvataggio:", err);
        }
    }
}

async function addCustomWall() {
    let room = state.rooms.find(r => r.id === state.currentRoomId) || state.rooms[0];
    if (room) state.currentRoomId = room.id;
    
    if (room) {
        if (!room.walls) room.walls = [];
        room.walls.push({ x1: 50, y1: 50, x2: 250, y2: 50, type: 'wall' });
        
        if (window.saveRoomsToLocal) window.saveRoomsToLocal();
        refreshUI();
    }
}

function openTableModal(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;
    const currentDateStr = formatDateKey(state.currentDate);

    document.getElementById('modal-table-title').innerText = `Tavolo / Tisch ${table.table_number}`;
    document.getElementById('modal-table-info').innerText = `${translations[state.currentLang].seats}: ${table.seats} | Data: ${currentDateStr}`;
    document.getElementById('form-table-id').value = tableId;

    document.getElementById('booking-form').reset();
    checkClientPrivacy();

    const rotateBtnContainer = document.getElementById('modal-rotate-container');
    rotateBtnContainer.innerHTML = `
        <button type="button" id="delete-table-modal-btn" class="w-full bg-rose-600 text-white font-medium py-1.5 rounded-lg hover:bg-rose-700 transition text-xs mb-3">
            <i class="fa-solid fa-trash mr-1"></i> Elimina Tavolo / Tisch löschen
        </button>
    `;

    document.getElementById('delete-table-modal-btn').onclick = async () => {
        await state.supabaseClient.from('bookings').delete().eq('table_id', tableId);
        await state.supabaseClient.from('tables').delete().eq('id', tableId);
        document.getElementById('booking-modal').classList.add('hidden');
        await loadData();
    };

    const listContainer = document.getElementById('modal-bookings-list');
    const tableBookings = state.bookings.filter(b => b.tableId === tableId && b.date === currentDateStr);

    listContainer.innerHTML = '';
    if (tableBookings.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-gray-400 italic">${translations[state.currentLang].noBookings}</p>`;
    } else {
        tableBookings.forEach(b => {
            const item = document.createElement('div');
            item.className = "flex justify-between items-center bg-gray-50 border border-gray-200 p-2 rounded-lg text-xs";
            item.innerHTML = `
                <div>
                    <span class="font-bold text-indigo-600">${b.startTime} - ${b.endTime}</span>
                    <span class="font-semibold ml-2">${b.name}</span> (${b.guests} pers.)
                </div>
                <button class="delete-b-btn text-rose-500 hover:text-rose-700 p-1"><i class="fa-solid fa-trash"></i></button>
            `;
            item.querySelector('.delete-b-btn').onclick = () => deleteBooking(b.id);
            listContainer.appendChild(item);
        });
    }

    document.getElementById('booking-modal').classList.remove('hidden');
}

async function saveBooking(e) {
    e.preventDefault();
    if (!state.supabaseClient) return;
    
    const tableId = document.getElementById('form-table-id').value;
    const startTime = document.getElementById('form-start-time').value;
    const endTime = document.getElementById('form-end-time').value;
    const name = document.getElementById('form-name').value;
    const guests = parseInt(document.getElementById('form-guests').value, 10);
    const phone = document.getElementById('form-phone').value;
    const dateStr = formatDateKey(state.currentDate);

    const table = state.tables.find(t => t.id === tableId);
    const t = translations[state.currentLang];

    if (!table) return;

    if (guests > table.seats) {
        alert(t.errCapacity + table.seats + ")");
        return;
    }

    const existingTableBookings = state.bookings.filter(b => b.tableId === tableId && b.date === dateStr);
    const hasOverlap = existingTableBookings.some(b => startTime < b.endTime && endTime > b.startTime);

    if (hasOverlap) {
        alert(t.errOverlap);
        return;
    }

    const { error } = await state.supabaseClient
        .from('bookings')
        .insert([{
            table_id: tableId,
            date: dateStr,
            start_time: startTime,
            end_time: endTime,
            name: name,
            guests: guests,
            phone: phone,
            restaurant_id: state.currentRestaurantId
        }]);

    if (error) {
        alert("Errore salvataggio: " + error.message);
        return;
    }

    await loadData();
    document.getElementById('booking-modal').classList.add('hidden');
    document.getElementById('booking-form').reset();
}

async function deleteBooking(bookingId) {
    if (!state.supabaseClient) return;
    await state.supabaseClient.from('bookings').delete().eq('id', bookingId);
    await loadData();
    document.getElementById('booking-modal').classList.add('hidden');
}

async function saveNewTable(e) {
    e.preventDefault();
    if (!state.supabaseClient) return;
    const tableNumber = document.getElementById('new-table-number').value;
    const seats = parseInt(document.getElementById('new-table-seats').value, 10);
    const shape = document.getElementById('new-table-shape').value;

    const { error } = await state.supabaseClient
        .from('tables')
        .insert([{
            table_number: tableNumber,
            seats: seats,
            shape: shape,
            pos_x: 50,
            pos_y: 50,
            width: seats <= 2 ? 70 : seats <= 4 ? 90 : 120,
            height: 90,
            rotation: 0,
            room_id: state.currentRoomId,
            restaurant_id: state.currentRestaurantId,
            restaurant_name: state.currentRestaurantName
        }]);

    if (error) {
        alert("Errore nella creazione del tavolo: " + error.message);
        return;
    }

    document.getElementById('table-config-modal').classList.add('hidden');
    document.getElementById('new-table-number').value = '';
    await loadData();
}

async function saveNewRoom(e) {
    e.preventDefault();
    const roomName = document.getElementById('new-room-name').value.trim();
    if (!roomName) return;

    const newId = 'sala-' + Date.now();
    state.rooms.push({ 
        id: newId, 
        name: roomName,
        walls: []
    });
    state.currentRoomId = newId;
    if (window.saveRoomsToLocal) window.saveRoomsToLocal();
    document.getElementById('room-config-modal').classList.add('hidden');
    document.getElementById('new-room-name').value = '';
    refreshUI();
}

function checkClientPrivacy() {
    const privacyContainer = document.getElementById('privacy-container');
    const privacyConsent = document.getElementById('privacy-consent');
    const privacyLabel = document.getElementById('privacy-label-text');
    const t = translations[state.currentLang];

    if (!privacyConsent) return;

    privacyConsent.required = false;
    privacyConsent.checked = true; 

    if (privacyContainer) {
        privacyContainer.classList.add('bg-indigo-50/60', 'border', 'border-indigo-100', 'p-2', 'rounded-lg');
    }
    
    if (privacyLabel) {
        privacyLabel.innerText = t.privacyText || "Datenschutzbestimmungen akzeptiert";
    }
}

// Rendi globale la funzione di salvataggio per farla usare anche a floor.js
window.saveRoomsToLocal = saveRoomsToLocal;
