// main.js - Scripts communs à tout le site

// Fonction pour soumettre un message de contact
function submitContactMessage(e) {
    e.preventDefault();
    const message = {
        id: Date.now(),
        name: document.getElementById('contactName').value,
        email: document.getElementById('contactEmail').value,
        subject: document.getElementById('contactSubject').value,
        message: document.getElementById('contactMessage').value,
        date: new Date().toISOString(),
        read: false,
        important: false
    };
    
    const messages = JSON.parse(localStorage.getItem('montety_contact_messages') || '[]');
    messages.unshift(message);
    localStorage.setItem('montety_contact_messages', JSON.stringify(messages));
    
    alert('Merci pour votre message ! Nous vous répondrons dans les plus brefs délais.');
    e.target.reset();
}

// Initialisation du calendrier public
let publicCalendar = null;

function initPublicCalendar(events) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    publicCalendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'fr',
        initialView: 'listWeek',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: events.map(event => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            color: event.color
        })),
        eventClick: function(info) {
            const event = events.find(e => e.id === info.event.id);
            if (event) showEventDetailModal(event);
        },
        height: 'auto',
        buttonText: {
            today: 'Aujourd\'hui',
            month: 'Mois',
            week: 'Semaine',
            list: 'Liste'
        }
    });
    publicCalendar.render();
}

// Affichage du modal de détail d'événement
function showEventDetailModal(event) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('eventDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'eventDetailModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-modal-btn" onclick="closeEventDetailModal()">✕</button>
                <h3 id="detailTitle"></h3>
                <div><label>Date</label><p id="detailDateTime"></p></div>
                <div><label>Lieu</label><p id="detailLocation"></p></div>
                <div><label>Description</label><p id="detailDescription"></p></div>
                <button class="btn-primary" onclick="closeEventDetailModal()">Fermer</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    const dateStr = startDate.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = `${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    
    document.getElementById('detailTitle').textContent = event.title;
    document.getElementById('detailDateTime').textContent = `${dateStr} • ${timeStr}`;
    document.getElementById('detailLocation').textContent = event.location || '13 boulevard Commandant Nicolas, 83100 Toulon';
    document.getElementById('detailDescription').textContent = event.description || 'Aucune description disponible.';
    
    modal.classList.add('active');
}

function closeEventDetailModal() {
    const modal = document.getElementById('eventDetailModal');
    if (modal) modal.classList.remove('active');
}

// Chargement des événements depuis localStorage
function loadEvents() {
    const storedEvents = localStorage.getItem('montety_events');
    if (storedEvents) {
        const events = JSON.parse(storedEvents);
        events.forEach(event => {
            event.start = new Date(event.start);
            event.end = new Date(event.end);
        });
        return events;
    }
    return [];
}

// Escape HTML pour éviter les injections
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Smooth scrolling pour les ancres
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === "#") return;
        const targetElement = document.querySelector(targetId);
        if (targetElement && document.getElementById('publicPage')?.classList?.contains('hidden') === false) {
            e.preventDefault();
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    const events = loadEvents();
    if (document.getElementById('calendar')) {
        initPublicCalendar(events);
    }
    const fy = document.getElementById('footerYear');
    if (fy) fy.textContent = new Date().getFullYear();
});