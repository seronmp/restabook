// --- INIZIO SUPER-PATCH ADMIN (FORZA BRUTA) ---
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

    // UNICA FUNZIONE PER CREARE I BOTTONI E IL MENU A TENDINA DEI RISTORANTI
    async function creaBottoniAdmin() {
        if (!document.getElementById('admin-super-menu')) {
            const adminMenu = document.createElement('div');
            adminMenu.id = 'admin-super-menu';
            adminMenu.style.position = 'fixed';
            adminMenu.style.top = '12px';
            adminMenu.style.right = '200px'; 
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

            // Carica la lista dei ristoranti da Supabase nel menu a tendina
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
// --- FINE SUPER-PATCH ADMIN ---

// --- ATTIVAZIONE BOTTONE MODIFICA SALA ---
setTimeout(() => {
    let isEditMode = false;
    const btnToggleEdit = document.getElementById('btn-toggle-edit');
    const txtEditMode = document.getElementById('txt-edit-mode');
    const btnAddWall = document.getElementById('btn-add-wall');
    const btnAddRoom = document.getElementById('btn-add-room');
    const btnAddTable = document.getElementById('btn-add-table');

    if (btnToggleEdit) {
        btnToggleEdit.addEventListener('click', () => {
            isEditMode = !isEditMode;
            
            if (isEditMode) {
                btnToggleEdit.classList.replace('bg-gray-100', 'bg-indigo-600');
                btnToggleEdit.classList.replace('text-gray-700', 'text-white');
                if(txtEditMode) txtEditMode.innerText = "Chiudi Modifica / Schließen";
                
                if (btnAddWall) btnAddWall.classList.remove('hidden');
                if (btnAddRoom) btnAddRoom.classList.remove('hidden');
                if (btnAddTable) btnAddTable.classList.remove('hidden');
            } else {
                btnToggleEdit.classList.replace('bg-indigo-600', 'bg-gray-100');
                btnToggleEdit.classList.replace('text-white', 'text-gray-700');
                if(txtEditMode) txtEditMode.innerText = "Modifica Sala & Muri / Wände bearbeiten";
                
                if (btnAddWall) btnAddWall.classList.add('hidden');
                if (btnAddRoom) btnAddRoom.classList.add('hidden');
                if (btnAddTable) btnAddTable.classList.add('hidden');
            }
        });
    }
}, 1500);
// --- FINE ATTIVAZIONE BOTTONE MODIFICA SALA ---
