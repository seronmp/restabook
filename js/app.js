// ==========================================
// 1. SUPER-PATCH ADMIN (LOGIN E MENU)
// ==========================================
setTimeout(async () => {
    const supabaseUrl = 'https://wqnqhmozprrxrcssesoq.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY';
    
    let sbClient;
    if (typeof window.supabase !== 'undefined') {
        sbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        const { data } = await sbClient.auth.getSession();
        if (data && data.session) {
            const loginCont = document.getElementById('login-container');
            const appCont = document.getElementById('app-container');
            if (loginCont) loginCont.style.display = 'none';
            if (appCont) appCont.style.display = 'block'; 
            creaBottoniAdmin();
        }
    }

    const oldForm = document.getElementById('login-form');
    if (oldForm && sbClient) {
        const newForm = oldForm.cloneNode(true);
        oldForm.parentNode.replaceChild(newForm, oldForm);

        newForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const btn = newForm.querySelector('button');
            if (btn) btn.innerText = "Accesso in corso...";

            const emailInput = document.getElementById('login-email').value;
            const passwordInput = document.getElementById('login-password').value;

            const { data, error } = await sbClient.auth.signInWithPassword({
                email: emailInput,
                password: passwordInput
            });

            if (error) {
                alert("Errore di accesso: " + error.message);
                if (btn) btn.innerText = "Accedi";
            } else if (data.user) {
                document.getElementById('login-container').style.display = 'none';
                document.getElementById('app-container').style.display = 'block'; 
                
                window.history.pushState({}, '', '?p=/admin');
                creaBottoniAdmin();
            }
        });
    }

    async function creaBottoniAdmin() {
        if (!document.getElementById('admin-super-menu')) {
            const adminMenu = document.createElement('div');
            adminMenu.id = 'admin-super-menu';
            adminMenu.style.position = 'fixed';
            adminMenu.style.top = '12px';
            adminMenu.style.right = '850px'; // Spostati a destra per non accavallarsi
            adminMenu.style.zIndex = '9999';
            adminMenu.style.display = 'flex';
            adminMenu.style.gap = '10px';
            adminMenu.style.alignItems = 'center';

            adminMenu.innerHTML = `
                <select id="select-restaurant" style="background-color: white; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <option value="">-- Seleziona Ristorante --</option>
                </select>
                <button id="btn-create-restaurant" style="background-color: white; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">+ Nuovo Ristorante</button>
                <button id="btn-logout" style="background-color: white; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Esci</button>
            `;

            document.body.appendChild(adminMenu);

            if (sbClient) {
                const { data: restaurants, error } = await sbClient
                    .from('restaurants')
                    .select('id, name');
                
                if (!error && restaurants) {
                    const selectDropdown = document.getElementById('select-restaurant');
                    restaurants.forEach(r => {
                        const opt = document.createElement('option');
                        opt.value = r.id;
                        opt.textContent = r.name;
                        selectDropdown.appendChild(opt);
                    });

                    const savedRestId = localStorage.getItem('current_restaurant_id');
                    if (savedRestId) {
                        selectDropdown.value = savedRestId;
                    }

                    selectDropdown.addEventListener('change', (e) => {
                        const selectedId = e.target.value;
                        if (selectedId) {
                            localStorage.setItem('current_restaurant_id', selectedId);
                            window.location.reload();
                        } else {
                            localStorage.removeItem('current_restaurant_id');
                        }
                    });
                }
            }

            document.getElementById('btn-create-restaurant').addEventListener('click', () => {
                window.location.href = 'register.html';
            });

            document.getElementById('btn-logout').addEventListener('click', async () => {
                if (sbClient) await sbClient.auth.signOut();
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = window.location.pathname; 
            });
        }
    }
    
    if (window.location.href.includes('admin')) {
        creaBottoniAdmin();
    }

}, 1000);

// ==========================================
// 2. ATTIVAZIONE BOTTONE MODIFICA SALA
// ==========================================
setTimeout(() => {
    let isEditMode = false;
    const btnToggleEdit = document.getElementById('btn-toggle-edit');
    const txtEditMode = document.getElementById('txt-edit-mode');
    const btnAddWall = document.getElementById('btn-add-wall');
    const btnAddRoom = document.getElementById('btn-add-room');
    const btnAddTable = document.getElementById('btn-add-table');

    if (btnToggleEdit) {
        const newBtnEdit = btnToggleEdit.cloneNode(true);
        btnToggleEdit.parentNode.replaceChild(newBtnEdit, btnToggleEdit);

        newBtnEdit.addEventListener('click', () => {
            const currentRestId = localStorage.getItem('current_restaurant_id');
            if (!currentRestId) {
                alert("Attenzione: seleziona prima un ristorante dal menu a tendina in alto per modificare la sua sala!");
                return;
            }

            isEditMode = !isEditMode;
            
            if (isEditMode) {
                newBtnEdit.classList.replace('bg-gray-100', 'bg-indigo-600');
                newBtnEdit.classList.replace('text-gray-700', 'text-white');
                if(txtEditMode) txtEditMode.innerText = "Chiudi Modifica / Schließen";
                
                if (btnAddWall) btnAddWall.classList.remove('hidden');
                if (btnAddRoom) btnAddRoom.classList.remove('hidden');
                if (btnAddTable) btnAddTable.classList.remove('hidden');
            } else {
                newBtnEdit.classList.replace('bg-indigo-600', 'bg-gray-100');
                newBtnEdit.classList.replace('text-white', 'text-gray-700');
                if(txtEditMode) txtEditMode.innerText = "Modifica Sala & Muri / Wände bearbeiten";
                
                if (btnAddWall) btnAddWall.classList.add('hidden');
                if (btnAddRoom) btnAddRoom.classList.add('hidden');
                if (btnAddTable) btnAddTable.classList.add('hidden');
            }
        });
    }
}, 1800);

// ==========================================
// 3. CARICAMENTO E VISUALIZZAZIONE TAVOLI CON SALE (TRAMITE ROOM_ID)
// ==========================================
async function loadAndRenderTables() {
    const restaurantId = localStorage.getItem('current_restaurant_id');
    if (!restaurantId || !window.supabase) return;

    const supabaseUrl = 'https://wqnqhmozprrxrcssesoq.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY';
    const client = window.supabase.createClient(supabaseUrl, supabaseKey);

    const { data: tables, error } = await client
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantId);

    if (error) {
        console.error("Errore caricamento tavoli:", error.message);
        return;
    }

    const mapContainer = document.querySelector('.border-dashed');
    if (!mapContainer) return;

    // Pulisci vecchi elementi se ricarichiamo
    const oldTabs = document.getElementById('room-tabs-container');
    if (oldTabs) oldTabs.remove();
    const oldWrapper = document.getElementById('rendered-tables-wrapper');
    if (oldWrapper) oldWrapper.remove();

    if (!tables || tables.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.id = 'rendered-tables-wrapper';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.paddingTop = '150px';
        emptyMsg.style.color = '#6B7280';
        emptyMsg.textContent = 'Nessun tavolo registrato per questo locale. Aggiungili dal pannello di controllo.';
        mapContainer.appendChild(emptyMsg);
        return;
    }

    // Trova i room_id unici (se null o vuoto, usa "Sala Principale")
    const rooms = [...new Set(tables.map(t => t.room_id ? t.room_id : 'Sala Principale'))];
    let currentRoom = rooms[0];

    // Crea il contenitore dei bottoni delle sale
    const tabsContainer = document.createElement('div');
    tabsContainer.id = 'room-tabs-container';
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '10px';
    tabsContainer.style.marginBottom = '15px';
    tabsContainer.style.padding = '10px';
    tabsContainer.style.backgroundColor = '#F3F4F6';
    tabsContainer.style.borderRadius = '8px';
    
    mapContainer.parentNode.insertBefore(tabsContainer, mapContainer);

    const wrapper = document.createElement('div');
    wrapper.id = 'rendered-tables-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.minHeight = '400px';
    mapContainer.appendChild(wrapper);

    // Funzione che disegna i tavoli della sala selezionata
    function renderRoom(selectedRoom) {
        wrapper.innerHTML = ''; 
        
        // Colora il bottone attivo
        Array.from(tabsContainer.children).forEach(btn => {
            if (btn.dataset.room === String(selectedRoom)) {
                btn.style.backgroundColor = '#4F46E5'; 
                btn.style.color = 'white';
            } else {
                btn.style.backgroundColor = '#E5E7EB'; 
                btn.style.color = '#374151';
            }
        });

        // Filtra i tavoli per il room_id selezionato
        const filteredTables = tables.filter(t => {
            const tableRoom = t.room_id ? t.room_id : 'Sala Principale';
            return tableRoom === selectedRoom;
        });

        filteredTables.forEach(t => {
            const tableEl = document.createElement('div');
            tableEl.style.position = 'absolute';
            tableEl.style.left = (t.pos_x || (50 + Math.random() * 300)) + 'px';
            tableEl.style.top = (t.pos_y || (50 + Math.random() * 200)) + 'px';
            tableEl.style.width = '75px';
            tableEl.style.height = '75px';
            tableEl.style.backgroundColor = '#10B981'; 
            tableEl.style.color = 'white';
            
            tableEl.style.borderRadius = t.shape === 'circle' ? '50%' : '10px'; 
            tableEl.style.display = 'flex';
            tableEl.style.flexDirection = 'column';
            tableEl.style.alignItems = 'center';
            tableEl.style.justifyContent = 'center';
            tableEl.style.fontWeight = 'bold';
            tableEl.style.cursor = 'pointer';
            tableEl.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';

            tableEl.innerHTML = `
                <span style="font-size: 14px;">${t.table_number || 'Tavolo'}</span>
                <span style="font-size: 11px; opacity: 0.9;">${t.seats || 4} posti</span>
            `;

            wrapper.appendChild(tableEl);
        });
    }

    // Crea un bottone cliccabile per ogni room_id trovato
    rooms.forEach(room => {
        const btn = document.createElement('button');
        // Se il room_id è un numero (es. 1, 2), aggiungiamo la parola "Sala " per renderlo più bello
        const isNumeric = !isNaN(room) && room !== 'Sala Principale';
        btn.innerText = isNumeric ? `Sala ${room}` : room;
        
        btn.dataset.room = room; // Salva il valore originale nel dataset
        btn.style.padding = '8px 16px';
        btn.style.borderRadius = '6px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.border = 'none';
        btn.style.transition = 'all 0.2s';
        
        btn.addEventListener('click', () => renderRoom(room));
        tabsContainer.appendChild(btn);
    });

    renderRoom(currentRoom);
}

setTimeout(loadAndRenderTables, 1500);
