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
    

        document.getElementById('btn-create-restaurant').addEventListener('click', () => {
            alert("Hai cliccato Nuovo Ristorante! Cerco di aprire register.html...");
            window.location.href = 'register.html'; // Assicurati che questo file esista su GitHub!
        });

        document.getElementById('btn-logout').addEventListener('click', async () => {
            alert("Hai cliccato Esci! Sto pulendo la memoria e disconnettendo Supabase...");
            if (sbClient) {
                await sbClient.auth.signOut();
            } else if (typeof window.supabase !== 'undefined') {
                // Se sbClient si è "perso", usa l'oggetto globale per fare il logout
                const tempClient = window.supabase.createClient(supabaseUrl, supabaseKey);
                await tempClient.auth.signOut();
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = window.location.pathname; 

            // --- ATTIVAZIONE BOTTONE MODIFICA SALA ---
let isEditMode = false;
const btnToggleEdit = document.getElementById('btn-toggle-edit');
const txtEditMode = document.getElementById('txt-edit-mode');
const btnAddWall = document.getElementById('btn-add-wall');
const btnAddRoom = document.getElementById('btn-add-room');
const btnAddTable = document.getElementById('btn-add-table');

if (btnToggleEdit) {
    btnToggleEdit.addEventListener('click', () => {
        isEditMode = !isEditMode; // Accende e spegne la modalità
        
        if (isEditMode) {
            // STATO ACCESO: Bottone blu e mostra gli strumenti
            btnToggleEdit.classList.replace('bg-gray-100', 'bg-indigo-600');
            btnToggleEdit.classList.replace('text-gray-700', 'text-white');
            if(txtEditMode) txtEditMode.innerText = "Chiudi Modifica / Schließen";
            
            if (btnAddWall) btnAddWall.classList.remove('hidden');
            if (btnAddRoom) btnAddRoom.classList.remove('hidden');
            if (btnAddTable) btnAddTable.classList.remove('hidden');
        } else {
            // STATO SPENTO: Bottone grigio e nasconde gli strumenti
            btnToggleEdit.classList.replace('bg-indigo-600', 'bg-gray-100');
            btnToggleEdit.classList.replace('text-white', 'text-gray-700');
            if(txtEditMode) txtEditMode.innerText = "Modifica Sala & Muri / Wände bearbeiten";
            
            if (btnAddWall) btnAddWall.classList.add('hidden');
            if (btnAddRoom) btnAddRoom.classList.add('hidden');
            if (btnAddTable) btnAddTable.classList.add('hidden');
        }
    });
}
        });
    }
