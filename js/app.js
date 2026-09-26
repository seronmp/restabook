// --- INIZIO SUPER-PATCH ADMIN ---
setTimeout(() => {
    // 1. SBLOCCO DEL LOGIN INTERNO ALLA SPA
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            e.stopImmediatePropagation(); 
            
            const btn = loginForm.querySelector('button');
            if (btn) btn.innerText = "Accesso in corso...";

            const emailInput = document.getElementById('login-email').value;
            const passwordInput = document.getElementById('login-password').value;

            // Le tue chiavi Supabase corrette
            const supabaseUrl = 'https://wqnqhmozprrxrcssesoq.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY';
            
            if (typeof window.supabase !== 'undefined') {
                const sbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
                
                const { data, error } = await sbClient.auth.signInWithPassword({
                    email: emailInput,
                    password: passwordInput
                });

                if (error) {
                    alert("Errore di accesso: " + error.message);
                    if (btn) btn.innerText = "Accedi";
                } else if (data.user) {
                    // Ti fa entrare e nasconde il login
                    window.location.href = '?p=/admin&logged=true'; 
                }
            }
        });
    }

    // 2. GENERAZIONE BOTTONI SUPERADMIN (Solo se nell'URL c'è 'admin')
    if (window.location.href.includes('admin')) {
        const adminMenu = document.createElement('div');
        adminMenu.style.position = 'fixed';
        adminMenu.style.top = '12px';
        adminMenu.style.right = '350px'; 
        adminMenu.style.zIndex = '9999';
        adminMenu.style.display = 'flex';
        adminMenu.style.gap = '10px';

        adminMenu.innerHTML = `
            <button id="btn-create-restaurant" style="background-color: transparent; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">+ Nuovo Ristorante</button>
            <button id="btn-logout" style="background-color: transparent; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">Esci</button>
        `;

        document.body.appendChild(adminMenu);

        document.getElementById('btn-create-restaurant').addEventListener('click', () => {
            window.location.href = 'register.html';
        });

        document.getElementById('btn-logout').addEventListener('click', async () => {
            const supabaseUrl = 'https://wqnqhmozprrxrcssesoq.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY';
            if (typeof window.supabase !== 'undefined') {
                const sbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
                await sbClient.auth.signOut();
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = window.location.pathname; 
        });
    }
}, 1500);
// --- FINE SUPER-PATCH ADMIN ---
