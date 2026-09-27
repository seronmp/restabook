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

async function loadAndRenderTables() {
    const restaurantId = localStorage.getItem('current_restaurant_id');
    if (!restaurantId || !window.supabase) return;

    const client = window.supabase.createClient('https://wqnqhmozprrxrcssesoq.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY');

    // 1. Verifichiamo se Supabase ci dà i dati
    const { data: tables, error } = await client
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantId);

    console.log("DATI DA SUPABASE:", tables);
    if (error) console.error("ERRORE SUPABASE:", error.message);

    // 2. Verifichiamo se trova il riquadro della mappa
    const mapContainer = document.querySelector('.border-dashed');
    console.log("CONTENITORE MAPPA TROVATO?", mapContainer);

    if (!mapContainer) {
        console.error("ERRORE: Il riquadro della mappa non è stato trovato nella pagina HTML.");
        return;
    }

    const oldWrapper = document.getElementById('rendered-tables-wrapper');
    if (oldWrapper) oldWrapper.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'rendered-tables-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.minHeight = '400px';

    if (tables && tables.length > 0) {
        tables.forEach(t => {
            const tableEl = document.createElement('div');
            tableEl.style.position = 'absolute';
            tableEl.style.left = (t.pos_x || (50 + Math.random() * 300)) + 'px';
            tableEl.style.top = (t.pos_y || (50 + Math.random() * 200)) + 'px';
            tableEl.style.width = '75px';
            tableEl.style.height = '75px';
            tableEl.style.backgroundColor = '#10B981'; 
            tableEl.style.color = 'white';
            tableEl.style.borderRadius = '10px';
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
    } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.paddingTop = '150px';
        emptyMsg.style.color = '#6B7280';
        emptyMsg.style.fontWeight = '500';
        emptyMsg.textContent = 'Nessun tavolo registrato per questo locale. Clicca su "Modifica Sala" per crearne uno!';
        wrapper.appendChild(emptyMsg);
    }

    mapContainer.appendChild(wrapper);
}
setTimeout(loadAndRenderTables, 1500);
