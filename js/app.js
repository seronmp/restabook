import { state, translations } from './config.js';
import { initAuth } from './auth.js';
import { renderCalendar, renderDailySummary, formatDateKey } from './calendar.js';
import { renderRooms, renderTables } from './floor.js';

document.addEventListener('DOMContentLoaded', () => {
    initAuth(async () => {
        await loadData();
        setupEventListeners();
    });
});

async function loadData() {
    if (!state.currentRestaurantId || !state.supabaseClient) return;

    try {
        let queryTables = state.supabaseClient.from('tables').select('*');
        let queryBookings = state.supabaseClient.from('bookings').select('*');

        if (state.currentRestaurantId !== 'tutti') {
            queryTables = queryTables.eq('restaurant_id', state.currentRestaurantId);
            queryBookings = queryBookings.eq('restaurant_id', state.currentRestaurantId);
        }

        const { data: tablesData } = await queryTables;
        state.tables = (tablesData || []).map(t => ({
            id: t.id,
            table_number: t.table_number,
            seats: t.seats,
            shape: t.shape,
            pos_x: t.pos_x ?? 50,
            pos_y: t.pos_y ?? 50,
            width: t.width ?? (t.seats <= 2 ? 70 : t.seats <= 4 ? 90 : t.seats <= 8 ? 120 : 150),
            height: t.height ?? (t.seats <= 8 ? 90 : 100),
            rotation: t.rotation ?? 0,
            room_id: t.room_id || 'sala-principale',
            restaurant_id: t.restaurant_id
        }));

      const { data: bookingsData } = await queryBookings;
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

function refreshUI() {
    renderRooms(refreshUI);
    renderCalendar(refreshUI);
    renderTables(openTableModal);
    renderDailySummary(deleteBooking);
}

function setupEventListeners() {
    // Lingua
    document.getElementById('btn-it').addEventListener('click', () => setLanguage('it'));
    document.getElementById('btn-de').addEventListener('click', () => setLanguage('de'));

    // Calendario mesi
    document.getElementById('cal-prev').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar(refreshUI);
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar(refreshUI);
    });

    // Filtro orario
    document.getElementById('filter-time').addEventListener('change', () => renderTables(openTableModal));

    // Modalità modifica
    document.getElementById('btn-toggle-edit').addEventListener('click', toggleEditMode);

    // Aggiungi muri/sale/tavoli
    document.getElementById('btn-add-wall').addEventListener('click', addCustomWall);
    document.getElementById('btn-add-room').addEventListener('click', () => document.getElementById('room-config-modal').classList.remove('hidden'));
    document.getElementById('btn-add-table').addEventListener('click', () => document.getElementById('table-config-modal').classList.remove('hidden'));

    // Chiusura modali
    document.getElementById('close-booking-modal').addEventListener('click', () => document.getElementById('booking-modal').classList.add('hidden'));
    document.getElementById('close-table-config-modal').addEventListener('click', () => document.getElementById('table-config-modal').classList.add('hidden'));
    document.getElementById('close-room-config-modal').addEventListener('click', () => document.getElementById('room-config-modal').classList.add('hidden'));

    // Form di prenotazione
    document.getElementById('booking-form').addEventListener('submit', saveBooking);
    document.getElementById('form-phone').addEventListener('input', checkClientPrivacy);

    // Form nuovo tavolo e sala
    document.getElementById('table-config-form').addEventListener('submit', saveNewTable);
    document.getElementById('room-config-form').addEventListener('submit', saveNewRoom);
}

function setLanguage(lang) {
    state.currentLang = lang;
    document.getElementById('btn-it').className = lang === 'it' ? 'px-3 py-1 rounded-md text-sm font-medium bg-white shadow-sm' : 'px-3 py-1 rounded-md text-sm font-medium text-gray-600';
    document.getElementById('btn-de').className = lang === 'de' ? 'px-3 py-1 rounded-md text-sm font-medium bg-white shadow-sm' : 'px-3 py-1 rounded-md text-sm font-medium text-gray-600';
    
    const t = translations[lang];
    document.getElementById('opt-all').innerText = t.timeFilterAll;
    document.getElementById('opt-lunch').innerText = t.timeFilterLunch;
    document.getElementById('opt-dinner1').innerText = t.timeFilterDinner1;
    document.getElementById('opt-dinner2').innerText = t.timeFilterDinner2;
                
    document.getElementById('app-title').innerText = state.currentRestaurantName || t.title;
    document.getElementById('calendar-title').innerText = t.calendar;
    document.getElementById('floor-title').innerText = t.floorTitle;
    document.getElementById('floor-subtitle').innerText = t.floorSubtitle;
    document.getElementById('lbl-time-filter').innerText = t.timeFilter;
    document.getElementById('legend-title').innerText = t.legendTitle;
    document.getElementById('leg-free').innerText = t.free;
    document.getElementById('leg-partial').innerText = t.partial;
    document.getElementById('leg-full').innerText = t.full;
    document.getElementById('modal-existing-title').innerText = t.existingTitle;
    document.getElementById('modal-form-title').innerText = t.formTitle;
    document.getElementById('lbl-start').innerText = t.lblStart;
    document.getElementById('lbl-end').innerText = t.lblEnd;
    document.getElementById('lbl-name').innerText = t.lblName;
    document.getElementById('lbl-guests').innerText = t.lblGuests;
    document.getElementById('lbl-phone').innerText = t.lblPhone;
    document.getElementById('btn-save').innerText = t.btnSave;
    document.getElementById('txt-add-table').innerText = t.newTable;
    document.getElementById('txt-add-room').innerText = t.newRoom;
    document.getElementById('txt-add-wall').innerText = t.addWall;
    document.getElementById('summary-box-title').innerText = t.dailySummaryTitle;
    document.getElementById('summary-box-subtitle').innerText = t.dailySummarySub;
    document.getElementById('lbl-total-guests-label').innerText = t.totalGuestsLabel;
    document.getElementById('th-time').innerText = t.thTime;
    document.getElementById('th-table').innerText = t.thTable;
    document.getElementById('th-name').innerText = t.thName;
    document.getElementById('th-guests').innerText = t.thGuests;
    document.getElementById('th-phone').innerText = t.thPhone;
    document.getElementById('th-actions').innerText = t.thActions;

    document.getElementById('txt-edit-mode').innerText = state.isEditMode ? t.editModeOn : t.editModeOff;

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

function addCustomWall() {
    const room = state.rooms.find(r => r.id === state.currentRoomId);
    if (!room) return;
    room.walls.push({ x1: 100, y1: 150, x2: 300, y2: 150, type: 'wall' });
    renderTables(openTableModal);
}

function openTableModal(tableId) {
    const table = state.tables.find(t => t.id === tableId);
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
    const guests = parseInt(document.getElementById('form-guests').value);
    const phone = document.getElementById('form-phone').value;
    const dateStr = formatDateKey(state.currentDate);

    const table = state.tables.find(t => t.id === tableId);
    const t = translations[state.currentLang];

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
    const seats = parseInt(document.getElementById('new-table-seats').value);
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
            restaurant_id: state.currentRestaurantId
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
        walls: [
            { x1: 20, y1: 20, x2: 600, y2: 20, type: 'wall' },
            { x1: 600, y1: 20, x2: 600, y2: 400, type: 'wall' },
            { x1: 600, y1: 400, x2: 20, y2: 400, type: 'wall' },
            { x1: 20, y1: 400, x2: 20, y2: 20, type: 'wall' }
        ]
    });
    state.currentRoomId = newId;

    document.getElementById('room-config-modal').classList.add('hidden');
    document.getElementById('new-room-name').value = '';
    refreshUI();
}

function checkClientPrivacy() {
    const phoneInput = document.getElementById('form-phone').value.trim();
    const privacyContainer = document.getElementById('privacy-container');
    const privacyConsent = document.getElementById('privacy-consent');
    const privacyLabel = document.getElementById('privacy-label-text');
    const t = translations[state.currentLang];

    if (!phoneInput) {
        privacyContainer.classList.remove('bg-indigo-50/60', 'border', 'border-indigo-100', 'p-2', 'rounded-lg');
        privacyConsent.required = true;
        privacyConsent.checked = false;
        privacyConsent.disabled = false;
        privacyLabel.innerText = t.privacyNewText;
        return;
    }

    const existingClient = state.bookings.some(b => b.phone && b.phone.trim() === phoneInput);

    if (existingClient) {
        privacyConsent.checked = true;
        privacyConsent.required = false;
        privacyConsent.disabled = true;
        privacyLabel.innerText = t.privacyText;
        privacyContainer.classList.add('bg-indigo-50/60', 'border', 'border-indigo-100', 'p-2', 'rounded-lg');
    } else {
        privacyContainer.classList.remove('bg-indigo-50/60', 'border', 'border-indigo-100', 'p-2', 'rounded-lg');
        privacyConsent.required = true;
        privacyConsent.checked = false;
        privacyConsent.disabled = false;
        privacyLabel.innerText = t.privacyNewText;
    }
}
