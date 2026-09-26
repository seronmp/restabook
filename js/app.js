// --- INIZIO SUPER-PATCH ADMIN (FORZA BRUTA) ---
setTimeout(async () => {
    const supabaseUrl = 'https://wqnqhmozprrxrcssesoq.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY';
    
    let sbClient;
    if (typeof window.supabase !== 'undefined') {
        sbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        // 1. SE SEI GIÀ LOGGATO, SALTA IL LOGIN E MOSTRA L'APP
        const { data } = await sbClient.auth.getSession();
        if (data && data.session) {
            document.getElementById('login-container').style.display = 'none';
            // Corretto in 'block' per mantenere l'impaginazione verticale di Tailwind
            document.getElementById('app-container').style.display = 'block'; 
            creaBottoniAdmin();
        }
    }

    // 2. DISTRUGGE IL VECCHIO FORM CHE RICARICA A VUOTO
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
                // 3. ACCESSO RIUSCITO: CAMBIO SCHERMATA
                document.getElementById('login-container').style.display = 'none';
                // Corretto in 'block' per mantenere l'impaginazione verticale di Tailwind
                document.getElementById('app-container').style.display = 'block'; 
                
                window.history.pushState({}, '', '?p=/admin');
                creaBottoniAdmin();
            }
        });
    }

    // FUNZIONE PER CREARE I BOTTONI DA SUPERADMIN
    function creaBottoniAdmin() {
        if (!document.getElementById('admin-super-menu')) {
            const adminMenu = document.createElement('div');
            adminMenu.id = 'admin-super-menu';
            adminMenu.style.position = 'fixed';
            adminMenu.style.top = '12px';
            adminMenu.style.right = '350px'; 
            adminMenu.style.zIndex = '9999';
            adminMenu.style.display = 'flex';
            adminMenu.style.gap = '10px';

            adminMenu.innerHTML = `
                <button id="btn-create-restaurant" style="background-color: white; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">+ Nuovo Ristorante</button>
                <button id="btn-logout" style="background-color: white; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Esci</button>
            `;

            document.body.appendChild(adminMenu);

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
