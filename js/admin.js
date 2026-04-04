// admin.js - Scripts pour la page administration
// ============ DATA MANAGEMENT ============
let members = JSON.parse(localStorage.getItem('montety_accepted_members')) || [];
let memberships = JSON.parse(localStorage.getItem('montety_memberships')) || [];
let council = JSON.parse(localStorage.getItem('montety_council_members')) || [];
let expenses = JSON.parse(localStorage.getItem('montety_expenses')) || [];
let events = JSON.parse(localStorage.getItem('montety_events')) || [];
let messages = JSON.parse(localStorage.getItem('montety_contact_messages')) || [];
let donations = JSON.parse(localStorage.getItem('montety_donations')) || [];
let settings = JSON.parse(localStorage.getItem('montety_settings')) || {
    cotisationAmount: 20,
    assocName: 'Les Amis de Montety',
    assocEmail: 'contact@amismontety.fr',
    assocPhone: '',
    assocAddress: '13 boulevard Commandant Nicolas, 83100 Toulon'
};

// Variables pour les graphiques et calendrier
let revenueChart = null;
let membershipEvolutionChart = null;
let adminCalendar = null;
let currentEditEventId = null;
let currentMailingList = [];

// Notifications
let notifications = JSON.parse(localStorage.getItem('montety_notifications')) || [
    { id: 1, message: 'Bienvenue dans l\'espace administration', type: 'info', date: new Date().toISOString(), read: false }
];

// ============ FONCTIONS DE SAUVEGARDE ============
function saveMembers() { localStorage.setItem('montety_accepted_members', JSON.stringify(members)); }
function saveMemberships() { localStorage.setItem('montety_memberships', JSON.stringify(memberships)); }
function saveCouncil() { localStorage.setItem('montety_council_members', JSON.stringify(council)); }
function saveExpenses() { localStorage.setItem('montety_expenses', JSON.stringify(expenses)); }
function saveEvents() { localStorage.setItem('montety_events', JSON.stringify(events)); }
function saveMessages() { localStorage.setItem('montety_contact_messages', JSON.stringify(messages)); }
function saveDonations() { localStorage.setItem('montety_donations', JSON.stringify(donations)); }
function saveSettings() { localStorage.setItem('montety_settings', JSON.stringify(settings)); }
function saveNotifications() { localStorage.setItem('montety_notifications', JSON.stringify(notifications)); }

// ============ NOTIFICATIONS ============
function addNotification(message, type = 'info') {
    notifications.unshift({ id: Date.now(), message: message, type: type, date: new Date().toISOString(), read: false });
    if (notifications.length > 20) notifications.pop();
    saveNotifications();
    renderNotifications();
}

function renderNotifications() {
    const container = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');
    if (!container) return;
    const unreadCount = notifications.filter(n => !n.read).length;
    if (badge) {
        badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        badge.textContent = unreadCount;
    }
    if (notifications.length === 0) {
        container.innerHTML = '<div style="padding: 10px; text-align: center; color: #999;">Aucune notification</div>';
        return;
    }
    container.innerHTML = notifications.map(n => `
        <div class="notification-item ${!n.read ? 'unread' : ''}" onclick="markNotificationRead(${n.id})">
            <div>${n.message}</div>
            <div class="date">${new Date(n.date).toLocaleString()}</div>
        </div>
    `).join('');
}

function markNotificationRead(id) {
    const notif = notifications.find(n => n.id === id);
    if (notif) notif.read = true;
    saveNotifications();
    renderNotifications();
}

function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    if (panel) panel.classList.toggle('show');
}

// ============ FONCTIONS DE CALCUL ============
function isExpired(member) {
    const today = new Date();
    const joinDate = new Date(member.joinDate);
    const endDate = new Date(joinDate.getFullYear(), 11, 31);
    return today > endDate && !member.paid;
}

function getMembersWithExpiry() {
    return members.map(m => {
        const joinDate = new Date(m.joinDate);
        const endDate = new Date(joinDate.getFullYear(), 11, 31);
        return { ...m, endDate, expired: isExpired(m) };
    });
}

// ============ NAVIGATION ============
function switchTab(tabName) {
    // Mettre à jour la sidebar via data-tab (fiable)
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`.sidebar-item[data-tab="${tabName}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Mettre à jour le contenu
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) selectedTab.classList.add('active');

    // Mettre à jour le titre
    const titles = {
        dashboard: 'Dashboard',
        members: 'Adhérents',
        council: 'Bureau d\'Administration',
        budget: 'Budget',
        events: 'Événements',
        messages: 'Messages',
        access: 'Gestion des accès'
    };
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) pageTitleEl.textContent = titles[tabName] || 'Page';

    // Rafraîchir les données
    if (tabName === 'members') { renderMembers(); updateMembershipChart('year'); }
    if (tabName === 'council') renderCouncil();
    if (tabName === 'budget') { renderDonationsList(); renderExpenses(); updateBudgetStats(); }
    if (tabName === 'events') {
        if (adminCalendar) { adminCalendar.render(); }
        else { initAdminCalendar(); }
        renderEvents();
        renderEventQuestions();
    }
    if (tabName === 'messages') renderMessages();
    if (tabName === 'dashboard') updateDashboard();
    if (tabName === 'access') {
        // Vérification de sécurité : seuls super_admin et comptes autorisés peuvent accéder à cet onglet
        if (typeof isSuperAdmin === 'function' && !isSuperAdmin()) {
            alert('Accès non autorisé.');
            switchTab('dashboard');
            return;
        }
        renderAccess();
    }
}

function switchMemberTab(tab) {
    renderMembers(tab);
}

// ============ MEMBERS FUNCTIONS ============
function showMemberModal() { document.getElementById('memberModal').classList.add('active'); }
function closeMemberModal() { document.getElementById('memberModal').classList.remove('active'); }

function addMember(e) {
    e.preventDefault();
    const joinDate = document.getElementById('memberJoinDate').value;
    const isPaid = document.getElementById('memberPaid').value === 'true';
    const memberTypeEl = document.getElementById('memberType');
    const amountEl = document.getElementById('memberPaymentAmount');
    const methodEl = document.getElementById('memberPaymentMethod');
    const newMember = {
        id: Date.now(),
        lastName: document.getElementById('memberLastName').value,
        firstName: document.getElementById('memberFirstName').value,
        email: document.getElementById('memberEmail').value,
        phone: document.getElementById('memberPhone').value,
        birthDate: document.getElementById('memberBirthDate').value,
        joinDate: joinDate,
        paid: isPaid,
        memberType: memberTypeEl ? memberTypeEl.value : 'MA',
        paymentDate: isPaid ? new Date().toISOString() : null,
        paymentAmount: amountEl && amountEl.value ? parseFloat(amountEl.value) : null,
        paymentMethod: methodEl ? methodEl.value : ''
    };
    members.push(newMember);
    saveMembers();
    // Vider le formulaire
    ['memberLastName','memberFirstName','memberEmail','memberPhone','memberBirthDate','memberJoinDate','memberPaymentAmount'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const paidEl = document.getElementById('memberPaid'); if (paidEl) paidEl.value = 'false';
    const typeEl = document.getElementById('memberType'); if (typeEl) typeEl.value = 'MA';
    const methodEl2 = document.getElementById('memberPaymentMethod'); if (methodEl2) methodEl2.value = '';
    closeMemberModal();
    renderMembers();
    updateDashboard();
    addNotification(`Nouvel adhérent : ${newMember.firstName} ${newMember.lastName}`);
    alert('Adhérent ajouté !');
}

// ── Recherche globale + tri + filtres par colonne ──
let currentMemberSearch = '';
let memberSortCol = null;
let memberSortDir = 1; // 1 = asc, -1 = desc
let memberColFilters = {};

function filterMembers() {
    currentMemberSearch = (document.getElementById('memberSearchInput')?.value || '').toLowerCase().trim();
    renderMembers();
}

function sortMemberCol(col) {
    if (memberSortCol === col) {
        memberSortDir *= -1;
    } else {
        memberSortCol = col;
        memberSortDir = 1;
    }
    renderMembers();
}

function setMemberColFilter(col, val) {
    memberColFilters[col] = val.trim().toLowerCase();
    renderMembers();
}

function getMemberEffectiveType(m, expired) {
    if (m.memberType === 'MH') return 'MH';
    if (expired) return 'inactif';
    if (m.memberType === 'MB') return 'MB';
    return 'MA';
}

const METHOD_LABELS = { cheque: 'Chèque', liquide: 'Liquide', virement: 'Virement', cb: 'CB' };

function renderMembers() {
    const tbody = document.getElementById('membersList');
    if (!tbody) return;

    const today = new Date();
    const search = currentMemberSearch;

    // Enrichir chaque membre avec endDate + expired + effectiveType
    const enriched = members.map(m => {
        const joinDate = new Date(m.joinDate);
        const endDate  = new Date(joinDate.getFullYear(), 11, 31);
        const expired  = isExpired(m);
        const upToDate = m.paid && !expired;
        const effectiveType = getMemberEffectiveType(m, expired);
        return { ...m, _joinDate: joinDate, _endDate: endDate, _expired: expired, _upToDate: upToDate, _effectiveType: effectiveType };
    });

    // 1. Filtrage recherche globale
    let filtered = enriched.filter(m => {
        if (!search) return true;
        const fields = [
            m.lastName, m.firstName, m.email, m.phone || '',
            m._joinDate.toLocaleDateString('fr-FR'),
            m._endDate.toLocaleDateString('fr-FR'),
            m.paid ? 'payé' : 'non payé',
            m._effectiveType,
            m.paymentMethod ? METHOD_LABELS[m.paymentMethod] || m.paymentMethod : '',
            m.paymentAmount != null ? String(m.paymentAmount) : ''
        ].join(' ').toLowerCase();
        return fields.includes(search);
    });

    // 2. Filtres par colonne
    const cf = memberColFilters;
    filtered = filtered.filter(m => {
        if (cf.lastName   && !m.lastName?.toLowerCase().includes(cf.lastName))   return false;
        if (cf.firstName  && !m.firstName?.toLowerCase().includes(cf.firstName))  return false;
        if (cf.email      && !m.email?.toLowerCase().includes(cf.email))          return false;
        if (cf.phone      && !(m.phone||'').toLowerCase().includes(cf.phone))     return false;
        if (cf.type       && m._effectiveType.toLowerCase() !== cf.type)          return false;
        if (cf.joinDate   && m._joinDate < new Date(cf.joinDate))                 return false;
        if (cf.paid === '1' && !m.paid)  return false;
        if (cf.paid === '0' &&  m.paid)  return false;
        if (cf.paymentMethod && (m.paymentMethod || '') !== cf.paymentMethod)     return false;
        if (cf.paymentAmount && (m.paymentAmount == null || m.paymentAmount < parseFloat(cf.paymentAmount))) return false;
        return true;
    });

    // 3. Tri
    if (memberSortCol) {
        filtered.sort((a, b) => {
            let va, vb;
            switch (memberSortCol) {
                case 'lastName':       va = a.lastName?.toLowerCase();  vb = b.lastName?.toLowerCase();  break;
                case 'firstName':      va = a.firstName?.toLowerCase(); vb = b.firstName?.toLowerCase(); break;
                case 'email':          va = a.email?.toLowerCase();     vb = b.email?.toLowerCase();     break;
                case 'type':           va = a._effectiveType;           vb = b._effectiveType;           break;
                case 'joinDate':       va = a._joinDate;                vb = b._joinDate;                break;
                case 'endDate':        va = a._endDate;                 vb = b._endDate;                 break;
                case 'paid':           va = a.paid ? 1 : 0;            vb = b.paid ? 1 : 0;             break;
                case 'paymentAmount':  va = a.paymentAmount || 0;       vb = b.paymentAmount || 0;       break;
                case 'paymentMethod':  va = a.paymentMethod || '';      vb = b.paymentMethod || '';      break;
                default: return 0;
            }
            if (va < vb) return -1 * memberSortDir;
            if (va > vb) return  1 * memberSortDir;
            return 0;
        });
    }

    // Mise à jour des icônes de tri
    ['lastName','firstName','email','type','joinDate','endDate','paid','paymentAmount','paymentMethod'].forEach(col => {
        const el = document.getElementById('sort-' + col);
        if (!el) return;
        if (memberSortCol === col) {
            el.textContent = memberSortDir === 1 ? ' ↑' : ' ↓';
        } else {
            el.textContent = ' ⇅';
        }
    });

    // Compteur
    const countEl = document.getElementById('memberSearchCount');
    if (countEl) countEl.textContent = filtered.length < members.length
        ? `${filtered.length} / ${members.length} adhérent(s)`
        : `${members.length} adhérent(s)`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center">Aucun adhérent trouvé</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(m => {
        const isCouncil = council.some(c => c.email === m.email);

        // Couleur de ligne
        let rowStyle = '';
        if (m._upToDate) {
            rowStyle = 'background:linear-gradient(90deg,#e8f5e9 0%,#f1faf2 100%); border-left:4px solid #28a745;';
        } else {
            rowStyle = 'background:linear-gradient(90deg,#fdecea 0%,#fdf5f5 100%); border-left:4px solid #dc3545;';
        }

        // Badge cotisation
        const cotisationIcon = m.paid
            ? '<span style="color:#28a745;font-weight:700;">✔ Payée</span>'
            : (m._expired
                ? '<span style="color:#dc3545;font-weight:700;">⚠ Expirée</span>'
                : '<span style="color:#ffc107;font-weight:700;">○ En attente</span>');

        // Badge type
        let typeBadge;
        switch (m._effectiveType) {
            case 'MH':      typeBadge = '<span style="background:#6f42c1;color:white;padding:2px 7px;border-radius:10px;font-size:0.75rem;font-weight:700;">MH</span>'; break;
            case 'inactif': typeBadge = '<span style="background:#6c757d;color:white;padding:2px 7px;border-radius:10px;font-size:0.75rem;font-weight:700;">Inactif</span>'; break;
            case 'MB':      typeBadge = '<span style="background:#f4b942;color:#24435d;padding:2px 7px;border-radius:10px;font-size:0.75rem;font-weight:700;">MB</span>'; break;
            default:        typeBadge = '<span style="background:#28a745;color:white;padding:2px 7px;border-radius:10px;font-size:0.75rem;font-weight:700;">MA</span>';
        }

        // Méthode de paiement
        const methodLabel = m.paymentMethod ? (METHOD_LABELS[m.paymentMethod] || m.paymentMethod) : '—';
        const amountLabel  = m.paymentAmount != null ? m.paymentAmount.toFixed(2) + ' €' : '—';

        return `
            <tr data-member-id="${m.id}" style="${rowStyle}">
                <td><input type="checkbox" class="member-checkbox"
                    data-id="${m.id}"
                    data-email="${escapeHtml(m.email)}"
                    data-name="${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}">
                </td>
                <td>${escapeHtml(m.lastName)}</td>
                <td>${escapeHtml(m.firstName)}</td>
                <td>${escapeHtml(m.email)}</td>
                <td>${escapeHtml(m.phone || '—')}</td>
                <td>${typeBadge}</td>
                <td>${m._joinDate.toLocaleDateString('fr-FR')}</td>
                <td>${m._endDate.toLocaleDateString('fr-FR')}</td>
                <td style="white-space:nowrap;">
                    ${cotisationIcon}
                    <input type="checkbox" ${m.paid ? 'checked' : ''} onchange="togglePayment(${m.id}, this.checked)" style="margin-left:6px;" title="Changer le statut">
                </td>
                <td style="text-align:right; font-weight:600;">${amountLabel}</td>
                <td>${methodLabel}</td>
                <td style="white-space:nowrap;">
                    ${isCouncil ? '<span class="council-badge">👑 CA</span>' : `<button class="btn-icon btn-info" onclick="addToCouncil(${m.id})" title="Nommer au CA">➕</button>`}
                    <button class="btn-icon btn-danger" onclick="deleteMember(${m.id})" title="Supprimer">🗑️</button>
                </td>
            </tr>`;
    }).join('');
}

function togglePayment(id, paid) {
    const member = members.find(m => m.id === id);
    if (member) {
        member.paid = paid;
        if (paid && !member.paymentDate) member.paymentDate = new Date().toISOString();
        saveMembers();
        renderMembers();
        updateDashboard();
        updateBudgetStats();
        addNotification(`Statut de cotisation modifié pour ${member.firstName} ${member.lastName}`);
    }
}

function deleteMember(id) {
    if (confirm('Confirmer la suppression ?')) {
        const member = members.find(m => m.id === id);
        members = members.filter(m => m.id !== id);
        saveMembers();
        renderMembers();
        updateDashboard();
        updateMembershipChart();
        addNotification(`Adhérent supprimé : ${member.firstName} ${member.lastName}`);
        alert('Adhérent supprimé !');
    }
}

function addToCouncil(memberId) {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    if (council.find(c => c.email === member.email)) { alert('Déjà membre du bureau.'); return; }

    if (!confirm(`Nommer ${member.firstName} ${member.lastName} au bureau d'administration ?\n\nCela créera un accès au portail admin et lui enverra ses identifiants par email.`)) return;

    const since = new Date().toISOString(); // date de désignation = aujourd'hui
    // Générer le mot de passe et créer le compte admin
    const newPwd = (typeof generatePassword === 'function') ? generatePassword() : Math.random().toString(36).substring(2, 12);
    if (typeof upsertAdminAccount === 'function') upsertAdminAccount(member.email, `${member.firstName} ${member.lastName}`, newPwd, 'admin');

    council.push({
        id: Date.now(),
        lastName: member.lastName,
        firstName: member.firstName,
        email: member.email,
        role: 'membre',
        since: since
    });
    saveCouncil();

    // Email avec identifiants complets
    const name = `${member.firstName} ${member.lastName}`;
    const subject = encodeURIComponent('Nomination au bureau — Accès administration Les Amis de Montety');
    const body = encodeURIComponent(
        `Bonjour ${name},\n\n` +
        `Vous avez été désigné(e) membre du bureau d\'administration de l\'association Les Amis de Montety.\n\n` +
        `Voici vos identifiants pour accéder à l\'espace d\'administration du site :\n\n` +
        `    Email        : ${member.email}\n` +
        `    Mot de passe : ${newPwd}\n\n` +
        `Connectez-vous sur : ${window.location.href}\n\n` +
        `Nous vous invitons à changer votre mot de passe dès votre première connexion via le bouton ⚙️ Paramètres.\n\n` +
        `Cordialement,\nLes Amis de Montety`
    );
    window.open(`mailto:${member.email}?subject=${subject}&body=${body}`, '_blank');

    renderMembers();
    renderCouncil();
    if (typeof renderAccess === 'function') renderAccess();
    addNotification(`${name} nommé(e) au bureau — accès admin créé`);
    alert(`✅ ${name} nommé(e) au bureau !\nEmail avec identifiants préparé dans votre client mail.`);
}

function exportMembers() {
    let csv = 'Nom,Prénom,Email,Téléphone,Date adhésion,Fin adhésion,Payé\n';
    members.forEach(m => {
        const joinDate = new Date(m.joinDate);
        const endDate = new Date(joinDate.getFullYear(), 11, 31);
        csv += `${m.lastName},${m.firstName},${m.email},${m.phone || ''},${new Date(m.joinDate).toLocaleDateString()},${endDate.toLocaleDateString()},${m.paid ? 'Oui' : 'Non'}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adherents_${new Date().getFullYear()}.csv`;
    a.click();
}

function openMailingList() {
    // Récupère uniquement les lignes affichées (filtrées) cochées
    const selected = Array.from(document.querySelectorAll('#membersList .member-checkbox:checked')).map(cb => ({
        email: cb.dataset.email,
        name: cb.dataset.name
    }));
    if (selected.length === 0) {
        // Si aucune sélection, proposer d'envoyer à tous les filtrés
        const allVisible = Array.from(document.querySelectorAll('#membersList .member-checkbox')).map(cb => ({
            email: cb.dataset.email,
            name: cb.dataset.name
        }));
        if (allVisible.length === 0) { alert('Aucun adhérent affiché'); return; }
        if (!confirm(`Aucune ligne sélectionnée. Envoyer à tous les adhérents affichés (${allVisible.length}) ?`)) return;
        currentMailingList = allVisible;
    } else {
        currentMailingList = selected;
    }
    const names = currentMailingList.map(s => s.name).join(', ');
    document.getElementById('mailingRecipients').innerHTML =
        `<strong>📋 ${currentMailingList.length} destinataire(s) :</strong><br><span style="color:var(--text-muted);font-size:0.85rem;">${names.length > 150 ? names.substring(0,150)+'…' : names}</span>`;
    document.getElementById('mailingBody').value = '';
    document.getElementById('mailingListModal').classList.add('active');
}

function closeMailingListModal() { document.getElementById('mailingListModal').classList.remove('active'); }

function sendMailingList() {
    const body = document.getElementById('mailingBody').value;
    if (!body.trim()) {
        alert('Veuillez écrire un message');
        return;
    }
    const emails = currentMailingList.map(m => m.email).join(';');
    const subject = 'Information - Les Amis de Montety';
    window.open(`mailto:${emails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    closeMailingListModal();
    alert('Email ouvert dans votre client mail');
}

function toggleSelectAll() {
    // Ne coche que les lignes actuellement affichées (filtrées)
    const checked = document.getElementById('selectAllMembers').checked;
    document.querySelectorAll('#membersList .member-checkbox').forEach(cb => cb.checked = checked);
}

// ============ COUNCIL FUNCTIONS ============
function showCouncilModal() { document.getElementById('councilModal').classList.add('active'); }
function closeCouncilModal() { document.getElementById('councilModal').classList.remove('active'); }

function addCouncilMember(e) {
    e.preventDefault();
    const email = document.getElementById('councilEmail').value;
    const firstName = document.getElementById('councilFirstName').value;
    const lastName = document.getElementById('councilLastName').value;
    const sinceField = document.getElementById('councilSince');
    const since = (sinceField && sinceField.value)
        ? new Date(sinceField.value).toISOString()
        : new Date().toISOString();

    // Créer le compte admin pour ce membre du bureau
    const newPwd = (typeof generatePassword === 'function') ? generatePassword() : Math.random().toString(36).substring(2, 12);
    if (typeof upsertAdminAccount === 'function') upsertAdminAccount(email, `${firstName} ${lastName}`, newPwd, 'admin');

    const phoneEl = document.getElementById('councilPhone');
    const member = {
        id: Date.now(),
        lastName: lastName,
        firstName: firstName,
        email: email,
        phone: phoneEl ? phoneEl.value : '',
        role: document.getElementById('councilRole').value,
        since: since
    };
    council.push(member);
    saveCouncil();

    // Ouvrir un email pré-rempli avec les identifiants
    const fullName = `${firstName} ${lastName}`;
    const subject  = encodeURIComponent('Nomination au bureau — Accès administration Les Amis de Montety');
    const body     = encodeURIComponent(
        `Bonjour ${fullName},\n\n` +
        `Vous avez été désigné(e) membre du bureau d'administration de l'association Les Amis de Montety.\n\n` +
        `Voici vos identifiants pour accéder à l'espace d'administration du site :\n\n` +
        `    Email        : ${email}\n` +
        `    Mot de passe : ${newPwd}\n\n` +
        `Connectez-vous sur : ${window.location.href}\n\n` +
        `Nous vous invitons à changer votre mot de passe dès votre première connexion via le bouton ⚙️ Paramètres.\n\n` +
        `Cordialement,\nLes Amis de Montety`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');

    closeCouncilModal();
    renderCouncil();
    if (typeof renderAccess === 'function') renderAccess();
    addNotification(`Nouveau membre au CA : ${firstName} ${lastName} — accès admin créé`);
    alert(`✅ ${fullName} ajouté(e) au bureau !\nEmail avec identifiants préparé dans votre client mail.`);
}

function updateCouncilRole(id, role) {
    const member = council.find(m => m.id === id);
    if (member) {
        member.role = role;
        saveCouncil();
        renderCouncil();
        addNotification(`Rôle modifié pour ${member.firstName} ${member.lastName}`);
    }
}

function deleteCouncil(id) {
    if (confirm('Confirmer la suppression ?')) {
        const member = council.find(m => m.id === id);
        council = council.filter(m => m.id !== id);
        saveCouncil();
        renderCouncil();
        addNotification(`Membre retiré du CA : ${member.firstName} ${member.lastName}`);
    }
}

function renderCouncil() {
    const tbody = document.getElementById('councilList');
    if (!tbody) return;
    if (council.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Aucun membre du bureau</td></tr>';
        return;
    }

    tbody.innerHTML = council.map(m => {
        // Tous les membres du bureau ont (ou peuvent avoir) un accès admin
        const sinceDate = m.since ? new Date(m.since).toLocaleDateString('fr-FR') : '—';
        return `
        <tr>
            <td>${escapeHtml(m.lastName)} ${escapeHtml(m.firstName)}</td>
            <td>
                <select onchange="updateCouncilRole(${m.id}, this.value)">
                    <option value="membre"      ${m.role === 'membre'      ? 'selected' : ''}>Membre</option>
                    <option value="president"   ${m.role === 'president'   ? 'selected' : ''}>Président</option>
                    <option value="tresorier"   ${m.role === 'tresorier'   ? 'selected' : ''}>Trésorier</option>
                    <option value="commissaire" ${m.role === 'commissaire' ? 'selected' : ''}>Commissaire aux comptes</option>
                </select>
            </td>
            <td>${escapeHtml(m.email)}</td>
            <td>${escapeHtml(m.phone || '—')}</td>
            <td>${sinceDate}</td>
            <td style="white-space:nowrap;">
                <button class="btn-icon btn-danger" onclick="deleteCouncil(${m.id})" title="Retirer du bureau">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// ============ BUDGET FUNCTIONS ============
function showExpenseModal() { document.getElementById('expenseModal').classList.add('active'); }
function closeExpenseModal() { document.getElementById('expenseModal').classList.remove('active'); }

function addExpense(e) {
    e.preventDefault();
    const expense = {
        id: Date.now(),
        description: document.getElementById('expenseDesc').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        date: document.getElementById('expenseDate').value,
        responsible: document.getElementById('expenseResponsible').value
    };
    expenses.push(expense);
    saveExpenses();
    ['expenseDesc','expenseAmount','expenseDate','expenseResponsible'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    closeExpenseModal();
    renderExpenses();
    updateBudgetStats();
    addNotification(`Dépense ajoutée : ${expense.description} (${expense.amount}€)`);
    alert('Dépense enregistrée !');
}

function deleteExpense(id) {
    if (confirm('Supprimer cette dépense ?')) {
        const expense = expenses.find(e => e.id === id);
        expenses = expenses.filter(e => e.id !== id);
        saveExpenses();
        renderExpenses();
        updateBudgetStats();
        addNotification(`Dépense supprimée : ${expense.description}`);
    }
}

function renderExpenses() {
    const tbody = document.getElementById('expensesList');
    if (expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Aucune dépense</td></tr>';
        return;
    }
    tbody.innerHTML = expenses.sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `
        <tr>
            <td>${e.date}</td>
            <td>${escapeHtml(e.description)}</td>
            <td>${escapeHtml(e.responsible || '-')}</td>
            <td>${e.amount.toFixed(2)}€</td>
            <td><button class="btn-icon btn-danger" onclick="deleteExpense(${e.id})">🗑️</button></td>
        </tr>
    `).join('');
}

// ============ DONATIONS FUNCTIONS ============
function showAddDonationModal() { document.getElementById('addDonationModal').classList.add('active'); }
function closeAddDonationModal() { document.getElementById('addDonationModal').classList.remove('active'); }

function addDonationAdmin(e) {
    e.preventDefault();
    const donation = {
        id: Date.now(),
        name: document.getElementById('adminDonationName').value,
        email: document.getElementById('adminDonationEmail').value,
        amount: parseFloat(document.getElementById('adminDonationAmount').value),
        message: document.getElementById('adminDonationMessage').value,
        date: new Date().toISOString()
    };
    donations.push(donation);
    saveDonations();
    ['adminDonationName','adminDonationEmail','adminDonationAmount','adminDonationMessage'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    renderDonationsList();
    updateBudgetStats();
    closeAddDonationModal();
    addNotification(`Don ajouté : ${donation.name} (${donation.amount}€)`);
    alert('Don ajouté !');
}

function deleteDonation(id) {
    if (confirm('Supprimer ce don ?')) {
        donations = donations.filter(d => d.id !== id);
        saveDonations();
        renderDonationsList();
        updateBudgetStats();
        addNotification('Don supprimé');
    }
}

function renderDonationsList() {
    const tbody = document.getElementById('donationsList');
    if (donations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Aucun don</td></tr>';
        return;
    }
    tbody.innerHTML = donations.sort((a, b) => new Date(b.date) - new Date(a.date)).map(d => `
        <tr>
            <td>${new Date(d.date).toLocaleDateString()}</td>
            <td>${escapeHtml(d.name)}</td>
            <td>${escapeHtml(d.email)}</td>
            <td>${d.amount}€</td>
            <td>${escapeHtml(d.message || '-')}</td>
            <td>
                <button class="btn-icon btn-danger" onclick="deleteDonation(${d.id})">🗑️</button>
                <button class="btn-icon btn-info" onclick="window.open('mailto:${escapeHtml(d.email)}?subject=Merci pour votre don&body=Bonjour ${escapeHtml(d.name)}, merci pour votre don de ${d.amount}€','_blank')">✉️ Merci</button>
            </td>
        </tr>
    `).join('');
}

// ============ BUDGET STATS ============
function updateBudgetStats() {
    const paidCount = members.filter(m => m.paid && !isExpired(m)).length;
    const totalCotisations = paidCount * settings.cotisationAmount;
    const totalDonations = donations.reduce((s, d) => s + d.amount, 0);
    const totalExpensesAmount = expenses.reduce((s, e) => s + e.amount, 0);
    const balance = totalCotisations + totalDonations - totalExpensesAmount;
    
    document.getElementById('totalRecettes').textContent = (totalCotisations + totalDonations).toFixed(2) + '€';
    document.getElementById('totalExpensesAmount').textContent = totalExpensesAmount.toFixed(2) + '€';
    document.getElementById('totalBalance').textContent = balance.toFixed(2) + '€';
    document.getElementById('stat-paid').textContent = totalCotisations.toFixed(2) + '€';
    document.getElementById('stat-donations').textContent = totalDonations.toFixed(2) + '€';
    document.getElementById('stat-expenses').textContent = totalExpensesAmount.toFixed(2) + '€';
    document.getElementById('stat-balance').textContent = balance.toFixed(2) + '€';
}

// ── Filtre dashboard ──
let _dashRange = 'all';

function setDashFilter(range, btn) {
    _dashRange = range;
    // Boutons actifs
    document.querySelectorAll('.dash-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // Label
    const labels = { all: 'Toutes les données', year: 'Cette année', '6months': '6 derniers mois', '3months': '3 derniers mois', custom: 'Période personnalisée' };
    const labelEl = document.getElementById('dashFilterLabel');
    if (labelEl) labelEl.textContent = labels[range] || '';
    updateDashboard();
}

function getDashDateRange() {
    const now = new Date();
    if (_dashRange === 'year')    return { from: new Date(now.getFullYear(), 0, 1), to: now };
    if (_dashRange === '6months') return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: now };
    if (_dashRange === '3months') return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: now };
    if (_dashRange === 'custom') {
        const f = document.getElementById('dashFrom')?.value;
        const t = document.getElementById('dashTo')?.value;
        return { from: f ? new Date(f) : null, to: t ? new Date(t + 'T23:59:59') : null };
    }
    return { from: null, to: null }; // all
}

function inDateRange(dateVal, range) {
    if (!dateVal) return false;
    const d = new Date(dateVal);
    if (range.from && d < range.from) return false;
    if (range.to   && d > range.to)   return false;
    return true;
}

function updateDashboard() {
    const range = getDashDateRange();

    // ── Adhérents — snapshot actuel (pas filtré par date, c'est un état courant) ──
    const activeMembers  = members.filter(m => !isExpired(m));
    const mhCount        = activeMembers.filter(m => m.memberType === 'MH').length;
    const mbCount        = activeMembers.filter(m => m.memberType === 'MB').length;
    const maCount        = activeMembers.filter(m => !m.memberType || m.memberType === 'MA').length;
    const inactifCount   = members.filter(m => isExpired(m)).length;
    const newInPeriod    = members.filter(m => inDateRange(m.joinDate || m.paymentDate, range)).length;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('stat-members', members.length);
    setEl('stat-active',  activeMembers.length);
    setEl('stat-ma',      maCount);
    setEl('stat-mb',      mbCount);
    setEl('stat-mh',      mhCount);
    setEl('stat-inactif', inactifCount);
    setEl('stat-new',     newInPeriod);
    setEl('stat-events',  events.filter(e => e.status === 'validated').length);

    // ── Finances filtrées par la période sélectionnée ──
    const filteredDonations = donations.filter(d => inDateRange(d.date, range));
    const filteredExpenses  = expenses.filter(e  => inDateRange(e.date, range));
    const filteredMembers   = members.filter(m => inDateRange(m.joinDate || m.paymentDate, range) && m.paid);

    const totalCotisations    = filteredMembers.length * settings.cotisationAmount;
    const totalDonationsAmt   = filteredDonations.reduce((s, d) => s + d.amount, 0);
    const totalExpensesAmt    = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    const balance             = totalCotisations + totalDonationsAmt - totalExpensesAmt;

    setEl('stat-paid',      totalCotisations.toFixed(2) + ' €');
    setEl('stat-donations', totalDonationsAmt.toFixed(2) + ' €');
    setEl('stat-expenses',  totalExpensesAmt.toFixed(2) + ' €');
    setEl('stat-balance',   (balance >= 0 ? '+' : '') + balance.toFixed(2) + ' €');

    const balanceEl = document.getElementById('stat-balance');
    if (balanceEl) balanceEl.style.color = balance >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    // Budget tab stats (non filtré)
    updateBudgetStats();

    // Graphiques
    updateDashboardCharts(range);
}

function updateDashboardCharts(range) {
    updateRevenueChart(range);
    updateMembershipChart(range);
}

function updateRevenueChart(range) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const filteredMembers   = members.filter(m => inDateRange(m.joinDate || m.paymentDate, range) && m.paid);
    const filteredDonations = donations.filter(d => inDateRange(d.date, range));

    // Regrouper par mois
    const byMonth = {};
    filteredMembers.forEach(m => {
        const key = new Date(m.joinDate || m.paymentDate).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        byMonth[key] = byMonth[key] || { cotis: 0, dons: 0 };
        byMonth[key].cotis += settings.cotisationAmount;
    });
    filteredDonations.forEach(d => {
        const key = new Date(d.date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        byMonth[key] = byMonth[key] || { cotis: 0, dons: 0 };
        byMonth[key].dons += d.amount;
    });

    const keys   = Object.keys(byMonth).sort((a, b) => new Date('1 ' + a) - new Date('1 ' + b));
    const cotis  = keys.map(k => byMonth[k].cotis);
    const dons   = keys.map(k => byMonth[k].dons);

    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: keys.length ? keys : ['Aucune donnée'],
            datasets: [
                { label: 'Cotisations (€)', data: cotis, backgroundColor: 'rgba(36,67,93,0.75)', borderRadius: 4 },
                { label: 'Dons (€)',         data: dons,  backgroundColor: 'rgba(244,185,66,0.8)', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function updateMembershipChart(range) {
    const ctx = document.getElementById('membershipEvolutionChart');
    if (!ctx) return;

    const filtered = members.filter(m => inDateRange(m.joinDate || m.paymentDate, range));
    const byMonth  = {};
    filtered.forEach(m => {
        const key = new Date(m.joinDate || m.paymentDate).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        byMonth[key] = (byMonth[key] || 0) + 1;
    });
    const keys = Object.keys(byMonth).sort((a, b) => new Date('1 ' + a) - new Date('1 ' + b));
    let cum = 0;
    const data = keys.map(k => { cum += byMonth[k]; return cum; });

    if (membershipEvolutionChart) membershipEvolutionChart.destroy();
    membershipEvolutionChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: keys.length ? keys : ['Aucune donnée'],
            datasets: [{ label: 'Adhérents cumulés', data, borderColor: '#f4b942', backgroundColor: 'rgba(244,185,66,0.12)', fill: true, tension: 0.4, pointRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ============ EXPORT BUDGET WORD ============
function exportBudgetWord() {
    const president = council.find(m => m.role === 'president') || council[0];
    const tresorier = council.find(m => m.role === 'tresorier') || council[0];
    const commissaire = council.find(m => m.role === 'commissaire');
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const paidCount = members.filter(m => m.paid && !isExpired(m)).length;
    const totalCotisations = paidCount * settings.cotisationAmount;
    const totalDonations = donations.reduce((s, d) => s + d.amount, 0);
    const totalExpensesAmount = expenses.reduce((s, e) => s + e.amount, 0);
    const balance = totalCotisations + totalDonations - totalExpensesAmount;
    
    let tableRows = `
        <tr><td>Cotisations des adhérents</td><td>${paidCount} adhérents x ${settings.cotisationAmount}€</td><td>${totalCotisations.toFixed(2)} €</td></tr>
        <tr><td>Dons</td><td>${donations.length} dons</td><td>${totalDonations.toFixed(2)} €</td></tr>
        <tr><td><strong>TOTAL RECETTES</strong></td><td></td><td><strong>${(totalCotisations + totalDonations).toFixed(2)} €</strong></td></tr>
    `;
    expenses.forEach(e => {
        tableRows += `<tr><td>Dépense - ${escapeHtml(e.description)}</td><td>${escapeHtml(e.responsible || '')}</td><td>${e.amount.toFixed(2)} €</td></tr>`;
    });
    tableRows += `
        <tr><td><strong>TOTAL DEPENSES</strong></td><td></td><td><strong>${totalExpensesAmount.toFixed(2)} €</strong></td></tr>
        <tr><td><strong>SOLDE</strong></td><td></td><td><strong>${balance.toFixed(2)} €</strong></td></tr>
    `;
    
    const docContent = `<!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Budget - Les Amis de Montety</title>
    <style>
        body { font-family: Arial; margin: 2cm; }
        .header { text-align: center; margin-bottom: 2rem; }
        .signatures { display: flex; justify-content: space-between; margin-top: 3rem; }
        .signature { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 2rem; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .date { text-align: right; margin-bottom: 2rem; }
    </style>
    </head>
    <body>
        <div class="header">
            <h1>Les Amis de Montety</h1>
            <h2>Association loi 1901</h2>
            <h3>BUDGET PREVISIONNEL</h3>
        </div>
        <div class="date"><p>Toulon, le ${today}</p></div>
        <p><strong>Objet :</strong> Constitution du budget de l'exercice ${new Date().getFullYear()}</p>
        <p>Ce jour, le Conseil d'Administration de l'association « Les Amis de Montety » s'est réuni afin de procéder à l'établissement du budget prévisionnel annuel de fonctionnement.</p>
        <p>Ce budget est précisé dans l'annexe de ce document.</p>
        <div class="signatures">
            <div class="signature">
                <p><strong>Président de l'association</strong><br>« Les Amis de Montety »<br><br>${president ? president.firstName + ' ' + president.lastName : '_________________'}</p>
            </div>
            <div class="signature">
                <p><strong>Trésorier de l'association</strong><br>« Les Amis de Montety »<br><br>${tresorier ? tresorier.firstName + ' ' + tresorier.lastName : '_________________'}</p>
            </div>
        </div>
        ${commissaire ? `<div style="margin-top: 1rem;"><p><strong>Commissaire aux comptes</strong><br>${commissaire.firstName} ${commissaire.lastName}</p></div>` : ''}
        <h2 style="margin-top: 3rem;">ANNEXE I - TABLEAU RECAPITULATIF</h2>
        <table>
            <thead><tr><th>Libellé</th><th>Détail</th><th>Montant (€)</th></tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
        <p style="margin-top: 2rem;">Fait à Toulon, le ${today}</p>
    </body>
    </html>`;
    
    const blob = new Blob([docContent], { type: 'application/msword' });
    const fileName = prompt('Nom du fichier', `budget_amis_montety_${new Date().getFullYear()}.doc`);
    if (fileName) saveAs(blob, fileName.endsWith('.doc') ? fileName : fileName + '.doc');
}

// ============ EXPORT COMPTABLE ============
function exportBudgetAccounting() {
    // Demander la période d'exercice
    const currentYear = new Date().getFullYear();
    const defaultFrom = `${currentYear}-01-01`;
    const defaultTo   = `${currentYear}-12-31`;
    const fromInput = prompt('Date de début de l\'exercice (AAAA-MM-JJ) :', defaultFrom);
    if (fromInput === null) return;
    const toInput   = prompt('Date de fin de l\'exercice (AAAA-MM-JJ) :', defaultTo);
    if (toInput === null) return;
    const fromDate = new Date(fromInput); fromDate.setHours(0,0,0,0);
    const toDate   = new Date(toInput);   toDate.setHours(23,59,59,999);
    if (isNaN(fromDate) || isNaN(toDate) || fromDate > toDate) {
        alert('Dates invalides. Veuillez saisir des dates au format AAAA-MM-JJ.');
        return;
    }
    const inRange = d => { const dt = new Date(d); return dt >= fromDate && dt <= toDate; };

    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const periodLabel = `${fromDate.toLocaleDateString('fr-FR')} – ${toDate.toLocaleDateString('fr-FR')}`;
    const year = fromDate.getFullYear();

    // Calculs filtrés sur la période
    const paidMembers   = members.filter(m => m.paid && !isExpired(m));
    const mhMembers     = paidMembers.filter(m => m.memberType === 'MH');
    const mbMembers     = paidMembers.filter(m => m.memberType === 'MB');
    const maMembers     = paidMembers.filter(m => !m.memberType || m.memberType === 'MA');
    const inactifCount  = members.filter(m => isExpired(m)).length;

    const donsFiltered     = donations.filter(d => inRange(d.date));
    const depensesFiltered = expenses.filter(e => inRange(e.date));

    const cotisations   = maMembers.length * settings.cotisationAmount;
    const totalDons     = donsFiltered.reduce((s, d) => s + d.amount, 0);
    const totalDepenses = depensesFiltered.reduce((s, e) => s + e.amount, 0);
    const recettes      = cotisations + totalDons;
    const solde         = recettes - totalDepenses;

    // Lignes dépenses (filtrées sur la période)
    const lignesDepenses = depensesFiltered.length > 0 ? depensesFiltered.map(e =>
        `<tr><td style="padding:5px 10px;">${escapeHtml(e.description)}</td>
         <td style="padding:5px 10px;">${new Date(e.date).toLocaleDateString('fr-FR')}</td>
         <td style="padding:5px 10px;">${escapeHtml(e.responsible || '-')}</td>
         <td style="padding:5px 10px; text-align:right;">${e.amount.toFixed(2)} €</td></tr>`
    ).join('') : '<tr><td colspan="4" style="padding:5px 10px; color:#999;">Aucune dépense sur cette période</td></tr>';

    // Lignes dons (filtrés sur la période)
    const lignesDons = donsFiltered.length > 0 ? donsFiltered.map(d =>
        `<tr><td style="padding:5px 10px;">${escapeHtml(d.name)}</td>
         <td style="padding:5px 10px;">${new Date(d.date).toLocaleDateString('fr-FR')}</td>
         <td style="padding:5px 10px;">${escapeHtml(d.message || '-')}</td>
         <td style="padding:5px 10px; text-align:right;">${d.amount.toFixed(2)} €</td></tr>`
    ).join('') : '<tr><td colspan="4" style="padding:5px 10px; color:#999;">Aucun don sur cette période</td></tr>';

    const president   = council.find(m => m.role === 'president')   || {};
    const tresorier   = council.find(m => m.role === 'tresorier')   || {};
    const commissaire = council.find(m => m.role === 'commissaire');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport comptable ${year} – Les Amis de Montety</title>
<style>
  body { font-family: 'Arial', sans-serif; margin: 2.5cm; color: #222; font-size: 11pt; }
  h1 { text-align:center; color: #24435d; font-size: 18pt; margin-bottom: 2px; }
  h2 { text-align:center; color: #24435d; font-size: 13pt; margin-top: 0; }
  .subtitle { text-align:center; color:#666; font-size:10pt; margin-bottom: 30px; }
  h3 { color: #24435d; border-bottom: 2px solid #f4b942; padding-bottom: 4px; font-size: 12pt; margin-top: 28px; }
  table { width:100%; border-collapse: collapse; margin-top: 10px; }
  th { background: #24435d; color: white; padding: 7px 10px; text-align: left; font-size: 10pt; }
  tr:nth-child(even) { background: #f8f9fa; }
  .total-row { background: #f4b942 !important; font-weight: bold; }
  .solde-row { background: ${solde >= 0 ? '#d4edda' : '#f8d7da'} !important; font-weight: bold; font-size: 12pt; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 15px 0 25px; }
  .stat-box { background: #f8f9fa; border-left: 4px solid #24435d; padding: 10px 14px; border-radius: 6px; }
  .stat-box.accent { border-color: #f4b942; }
  .stat-box.green { border-color: #28a745; }
  .stat-box.red { border-color: #dc3545; }
  .stat-label { font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-value { font-size: 16pt; font-weight: 900; color: #24435d; margin-top: 4px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
  .sig { text-align: center; min-width: 180px; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; width: 160px; margin-left: auto; margin-right: auto; }
  @media print { body { margin: 1.5cm; } }
</style>
</head>
<body>
  <h1>Les Amis de Montety</h1>
  <h2>Rapport financier — Exercice ${year}</h2>
  <p class="subtitle">Période : ${periodLabel} | Édité le ${dateStr} | Association loi 1901</p>

  <h3>📊 Situation des adhérents</h3>
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-label">Total adhérents</div><div class="stat-value">${members.length}</div></div>
    <div class="stat-box green"><div class="stat-label">Membres Adhérents (MA)</div><div class="stat-value">${maMembers.length}</div></div>
    <div class="stat-box accent"><div class="stat-label">Membres Bienfaiteurs (MB)</div><div class="stat-value">${mbMembers.length}</div></div>
    <div class="stat-box" style="border-color:#6f42c1;"><div class="stat-label">Membres Honneur (MH)</div><div class="stat-value">${mhMembers.length}</div></div>
  </div>

  <h3>💰 Synthèse comptable</h3>
  <table>
    <thead><tr><th>Libellé</th><th>Détail</th><th style="text-align:right;">Montant</th></tr></thead>
    <tbody>
      <tr><td style="padding:6px 10px;">Cotisations membres adhérents</td><td style="padding:6px 10px;">${maMembers.length} × ${settings.cotisationAmount} €</td><td style="padding:6px 10px; text-align:right;">${cotisations.toFixed(2)} €</td></tr>
      <tr><td style="padding:6px 10px;">Dons reçus</td><td style="padding:6px 10px;">${donations.length} don(s)</td><td style="padding:6px 10px; text-align:right;">${totalDons.toFixed(2)} €</td></tr>
      <tr class="total-row"><td style="padding:6px 10px;" colspan="2">TOTAL RECETTES</td><td style="padding:6px 10px; text-align:right;">${recettes.toFixed(2)} €</td></tr>
      <tr><td style="padding:6px 10px;">Total dépenses</td><td style="padding:6px 10px;">${expenses.length} dépense(s)</td><td style="padding:6px 10px; text-align:right; color:#dc3545;">– ${totalDepenses.toFixed(2)} €</td></tr>
      <tr class="solde-row"><td style="padding:8px 10px;" colspan="2">SOLDE DE L'EXERCICE</td><td style="padding:8px 10px; text-align:right;">${solde >= 0 ? '+' : ''}${solde.toFixed(2)} €</td></tr>
    </tbody>
  </table>

  <h3>📋 Détail des dépenses</h3>
  <table>
    <thead><tr><th>Description</th><th>Date</th><th>Responsable</th><th style="text-align:right;">Montant</th></tr></thead>
    <tbody>${lignesDepenses}</tbody>
    <tfoot><tr class="total-row"><td colspan="3" style="padding:6px 10px;">TOTAL DÉPENSES</td><td style="padding:6px 10px; text-align:right;">${totalDepenses.toFixed(2)} €</td></tr></tfoot>
  </table>

  <h3>💝 Détail des dons</h3>
  <table>
    <thead><tr><th>Donateur</th><th>Date</th><th>Message</th><th style="text-align:right;">Montant</th></tr></thead>
    <tbody>${lignesDons}</tbody>
    <tfoot><tr class="total-row"><td colspan="3" style="padding:6px 10px;">TOTAL DONS</td><td style="padding:6px 10px; text-align:right;">${totalDons.toFixed(2)} €</td></tr></tfoot>
  </table>

  <div class="signatures">
    <div class="sig">
      <div class="stat-label">Le Président</div>
      <div class="sig-line"></div>
      <div style="margin-top:6px;">${president.firstName || ''} ${president.lastName || '_________________'}</div>
    </div>
    <div class="sig">
      <div class="stat-label">Le Trésorier</div>
      <div class="sig-line"></div>
      <div style="margin-top:6px;">${tresorier.firstName || ''} ${tresorier.lastName || '_________________'}</div>
    </div>
    ${commissaire ? `<div class="sig"><div class="stat-label">Commissaire aux comptes</div><div class="sig-line"></div><div style="margin-top:6px;">${commissaire.firstName} ${commissaire.lastName}</div></div>` : ''}
  </div>
  <p style="margin-top:40px; font-size:9pt; color:#999; text-align:center;">Document généré le ${dateStr} — Les Amis de Montety, Association loi 1901</p>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) alert('Veuillez autoriser les popups pour imprimer/exporter le rapport comptable.');
}

// ============ CHARTS ============
function initRevenueChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const cotisationsByMonth = Array(12).fill(0);
    const donsByMonth = Array(12).fill(0);
    
    members.filter(m => m.paid && m.paymentDate).forEach(m => {
        const month = new Date(m.paymentDate).getMonth();
        cotisationsByMonth[month] += settings.cotisationAmount;
    });
    donations.forEach(d => {
        const month = new Date(d.date).getMonth();
        donsByMonth[month] += d.amount;
    });
    
    revenueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'Cotisations (€)', data: cotisationsByMonth, backgroundColor: 'rgba(36,67,93,0.7)' },
                { label: 'Dons (€)', data: donsByMonth, backgroundColor: 'rgba(244,185,66,0.7)' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true } } }
    });
}

function updateMembershipChart(range = 'year') {
    const now = new Date();
    let startDate;
    if (range === 'year') startDate = new Date(now.getFullYear(), 0, 1);
    else if (range === '6months') startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    else if (range === '3months') startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    else startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const membersByMonth = {};
    members.forEach(m => {
        const date = new Date(m.joinDate);
        if (date >= startDate) {
            const key = date.toLocaleDateString('fr', { month: 'short', year: 'numeric' });
            membersByMonth[key] = (membersByMonth[key] || 0) + 1;
        }
    });
    
    const sortedKeys = Object.keys(membersByMonth).sort((a, b) => new Date(a) - new Date(b));
    let cumulative = 0;
    const data = sortedKeys.map(key => { cumulative += membersByMonth[key]; return cumulative; });
    const ctx = document.getElementById('membershipEvolutionChart').getContext('2d');
    
    if (membershipEvolutionChart) membershipEvolutionChart.destroy();
    membershipEvolutionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedKeys,
            datasets: [{ label: 'Adhérents cumulés', data: data, borderColor: '#f4b942', backgroundColor: 'rgba(244,185,66,0.1)', fill: true, tension: 0.4 }]
        },
        options: { responsive: true, maintainAspectRatio: true }
    });
}

// ============ EVENTS FUNCTIONS ============

// Sélecteur couleur ergonomique
function selectColor(hex) {
    document.getElementById('eventColor').value = hex;
    document.getElementById('colorPickerNative').value = hex;
    document.getElementById('colorPreview').style.background = hex;
    // Mettre à jour la swatch sélectionnée
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('selected', s.dataset.color === hex);
    });
    // Label couleur
    const labels = {
        '#f4b942': 'Or (défaut)', '#24435d': 'Marine', '#28a745': 'Vert',
        '#dc3545': 'Rouge', '#17a2b8': 'Bleu ciel', '#6f42c1': 'Violet', '#fd7e14': 'Orange'
    };
    document.getElementById('colorLabel').textContent = labels[hex] || hex;
}

function setEventFormReadonly(readonly) {
    const fields = ['eventTitle','eventStart','eventEnd','eventLocation','eventDescription','eventVisaComment','eventType','eventVisioLink','eventVisioCode'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = readonly;
    });
    document.querySelectorAll('.color-swatch').forEach(s => s.style.pointerEvents = readonly ? 'none' : 'auto');
    document.getElementById('saveEventBtn').style.display = readonly ? 'none' : 'inline-block';
    document.getElementById('validateEventBtn').style.display = readonly ? 'none' : 'inline-block';
    document.getElementById('eventValidatedBanner').style.display = readonly ? 'block' : 'none';
}

function showAddEventModal() {
    document.getElementById('eventModalTitle').innerText = '➕ Ajouter un événement';
    document.getElementById('eventId').value = '';
    document.getElementById('eventStatus').value = 'pending';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventType').value = 'public';
    document.getElementById('eventStart').value = '';
    document.getElementById('eventEnd').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventDescription').value = '';
    document.getElementById('eventVisioLink').value = '';
    document.getElementById('eventVisioCode').value = '';
    document.getElementById('eventVisioCodeGroup').style.display = 'none';
    document.getElementById('eventVisaComment').value = '';
    selectColor('#f4b942');
    clearEventAttachment();
    document.getElementById('deleteEventBtn').style.display = 'none';
    document.getElementById('validateEventBtn').style.display = 'none';
    currentEditEventId = null;
    setEventFormReadonly(false);
    document.getElementById('eventModal').classList.add('active');
}

// Afficher/masquer le champ code selon si lien visio est rempli
document.addEventListener('DOMContentLoaded', function() {
    const visioLinkEl = document.getElementById('eventVisioLink');
    if (visioLinkEl) {
        visioLinkEl.addEventListener('input', function() {
            document.getElementById('eventVisioCodeGroup').style.display = this.value.trim() ? '' : 'none';
        });
    }
});

function fillEventTemplate(tpl) {
    const now = new Date();
    // arrondir à l'heure suivante
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    const end = new Date(now.getTime() + 60 * 60 * 1000); // +1h

    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (tpl === 'ag') {
        document.getElementById('eventTitle').value = 'Assemblée générale';
        document.getElementById('eventType').value = 'public';
        document.getElementById('eventDescription').value = 'Assemblée générale annuelle de l\'association Les Amis de Montety.';
        selectColor('#24435d');
    } else if (tpl === 'apero') {
        document.getElementById('eventTitle').value = 'Apéro des membres';
        document.getElementById('eventType').value = 'public';
        document.getElementById('eventDescription').value = 'Moment convivial pour les membres et sympathisants de l\'association.';
        selectColor('#f4b942');
    }
    document.getElementById('eventStart').value = fmt(now);
    document.getElementById('eventEnd').value   = fmt(end);
    document.getElementById('eventLocation').value = document.getElementById('eventLocation').value || 'Paroisse Saint Vincent de Paul, Toulon (83100)';
}

function showEditEventModal(id) {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    const validated = ev.status === 'validated';

    document.getElementById('eventModalTitle').innerText = validated ? '✅ Événement validé' : '✏️ Modifier l\'événement';
    document.getElementById('eventId').value = ev.id;
    document.getElementById('eventStatus').value = ev.status || 'pending';
    document.getElementById('eventTitle').value = ev.title;
    document.getElementById('eventType').value = ev.type || 'public';
    document.getElementById('eventStart').value = new Date(ev.start).toISOString().slice(0, 16);
    document.getElementById('eventEnd').value = new Date(ev.end).toISOString().slice(0, 16);
    document.getElementById('eventLocation').value = ev.location || '';
    document.getElementById('eventDescription').value = ev.description || '';
    document.getElementById('eventVisioLink').value = ev.visioLink || '';
    document.getElementById('eventVisioCode').value = ev.visioCode || '';
    document.getElementById('eventVisioCodeGroup').style.display = ev.visioLink ? '' : 'none';
    document.getElementById('eventVisaComment').value = ev.visaComment || '';
    selectColor(ev.color || '#f4b942');

    // Pièce jointe existante
    clearEventAttachment();
    if (ev.attachment) {
        _eventAttachmentData = ev.attachment;
        renderEventAttachmentPreview();
    }

    document.getElementById('deleteEventBtn').style.display = 'inline-block';
    // Bouton valider uniquement si en attente
    document.getElementById('validateEventBtn').style.display = validated ? 'none' : 'inline-block';
    currentEditEventId = ev.id;
    setEventFormReadonly(validated);
    document.getElementById('eventModal').classList.add('active');
}

function closeEventModal() { document.getElementById('eventModal').classList.remove('active'); }

function refreshCalendar() {
    if (!adminCalendar) return;
    adminCalendar.removeAllEvents();
    adminCalendar.addEventSource(events.map(e => ({
        id: e.id,
        title: e.title + (e.type === 'conseil_administration' ? ' 🔒' : ''),
        start: e.start,
        end: e.end,
        color: e.color || '#f4b942',
        classNames: e.status === 'pending' ? ['event-pending'] : [],
        extendedProps: { status: e.status, visaComment: e.visaComment, type: e.type || 'public', visioLink: e.visioLink || '', visioCode: e.visioCode || '' }
    })));
}

// ── Pièce jointe événement (stockage temporaire FileReader) ──
let _eventAttachmentData = null; // { name, type, size, data (base64) }

function handleEventFile(input) {
    const file = input.files[0];
    if (!file) return;
    const MAX = 2 * 1024 * 1024; // 2 Mo
    if (file.size > MAX) {
        alert('Fichier trop volumineux (max 2 Mo). Réduisez la taille de votre image ou fichier.');
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(ev) {
        _eventAttachmentData = { name: file.name, type: file.type, size: file.size, data: ev.target.result };
        renderEventAttachmentPreview();
    };
    reader.readAsDataURL(file);
}

function renderEventAttachmentPreview() {
    const preview = document.getElementById('eventAttachmentPreview');
    const zone    = document.getElementById('fileUploadZone');
    if (!preview || !_eventAttachmentData) return;
    const isImage = _eventAttachmentData.type.startsWith('image/');
    const sizeKb  = (_eventAttachmentData.size / 1024).toFixed(0);
    preview.style.display = 'block';
    preview.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.7rem;background:#f0fdf4;border:1.5px solid #a5d6a7;border-radius:10px;padding:0.6rem 0.9rem;">
            ${isImage
                ? `<img src="${_eventAttachmentData.data}" style="height:54px;border-radius:6px;object-fit:cover;border:1px solid #ccc;">`
                : `<span style="font-size:1.8rem;">${_eventAttachmentData.type.includes('pdf') ? '📄' : '📎'}</span>`}
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.85rem;color:#24435d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(_eventAttachmentData.name)}</div>
                <div style="font-size:0.75rem;color:#718096;">${sizeKb} Ko</div>
            </div>
            <button type="button" onclick="clearEventAttachment()" style="background:#fdecea;color:#c62828;border:none;border-radius:8px;padding:0.25rem 0.6rem;font-size:0.8rem;cursor:pointer;" title="Supprimer">✕</button>
        </div>`;
    if (zone) {
        zone.innerHTML = `<div style="font-size:0.82rem;color:#28a745;font-weight:600;">✅ Fichier sélectionné — cliquez pour en choisir un autre</div>`;
    }
}

function clearEventAttachment() {
    _eventAttachmentData = null;
    const preview = document.getElementById('eventAttachmentPreview');
    const zone    = document.getElementById('fileUploadZone');
    const input   = document.getElementById('eventAttachmentInput');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    if (input)   input.value = '';
    if (zone) zone.innerHTML = `
        <div class="file-upload-icon">📎</div>
        <div class="file-upload-text">Cliquez pour ajouter une image ou un fichier</div>
        <div class="file-upload-hint">JPG, PNG, GIF, WebP, PDF, DOCX</div>`;
}

function saveEvent(e) {
    e.preventDefault();
    const id = document.getElementById('eventId').value;
    const title = document.getElementById('eventTitle').value;
    const type = document.getElementById('eventType').value || 'public';
    const start = new Date(document.getElementById('eventStart').value);
    const end = new Date(document.getElementById('eventEnd').value);
    const location = document.getElementById('eventLocation').value;
    const description = document.getElementById('eventDescription').value;
    const color = document.getElementById('eventColor').value;
    const visioLink = document.getElementById('eventVisioLink').value.trim();
    const visioCode = document.getElementById('eventVisioCode').value.trim();
    const visaComment = document.getElementById('eventVisaComment').value;
    const attachment = _eventAttachmentData || null;

    if (!title || !start || !end) { alert('Veuillez remplir les champs obligatoires'); return; }

    if (id) {
        const index = events.findIndex(ev => ev.id === id);
        if (index !== -1) {
            events[index] = { ...events[index], title, type, start, end, location, description, color, visioLink, visioCode, visaComment, attachment };
        }
    } else {
        events.push({ id: Date.now().toString(), title, type, start, end, location, description, color, visioLink, visioCode, visaComment, attachment, status: 'pending' });
    }

    saveEvents();
    refreshCalendar();
    renderEvents();
    updateDashboard();
    // Vider le formulaire événement
    ['eventId','eventTitle','eventStart','eventEnd','eventLocation','eventDescription','eventVisioLink','eventVisioCode','eventVisaComment'].forEach(fid => { const el = document.getElementById(fid); if(el) el.value = ''; });
    const typeEl2 = document.getElementById('eventType'); if(typeEl2) typeEl2.value = 'public';
    selectColor('#f4b942');
    clearEventAttachment();
    closeEventModal();
    addNotification(`Événement "${title}" enregistré (en attente de validation)`);
    alert('Événement enregistré !');
}

function validateCurrentEvent() {
    if (!currentEditEventId) return;
    const ev = events.find(e => e.id === currentEditEventId);
    if (!ev) return;
    if (!confirm(`Valider l'événement "${ev.title}" ? Il sera publié sur le site.`)) return;
    ev.status = 'validated';
    saveEvents();
    refreshCalendar();
    renderEvents();
    updateDashboard();
    closeEventModal();
    addNotification(`✅ Événement "${ev.title}" validé et publié`);
    alert('Événement validé et publié !');
}

function deleteCurrentEvent() {
    if (!currentEditEventId) return;
    const ev = events.find(e => e.id === currentEditEventId);
    if (!ev) return;
    const msg = ev.status === 'validated'
        ? `Supprimer l'événement validé "${ev.title}" ? Il sera retiré du site.`
        : `Supprimer l'événement "${ev.title}" ?`;
    if (!confirm(msg)) return;
    events = events.filter(e => e.id !== currentEditEventId);
    saveEvents();
    refreshCalendar();
    renderEvents();
    updateDashboard();
    closeEventModal();
    addNotification(`Événement "${ev.title}" supprimé`);
    alert('Événement supprimé !');
}

function deleteEvent(id) {
    const ev = events.find(e => e.id === id);
    if (!ev || !confirm(`Supprimer "${ev.title}" ?`)) return;
    events = events.filter(e => e.id !== id);
    saveEvents();
    refreshCalendar();
    renderEvents();
    updateDashboard();
    addNotification(`Événement "${ev.title}" supprimé`);
}

function renderEvents() {
    const tbody = document.getElementById('eventsList');
    if (!tbody) return;
    // Filtrer : uniquement événements futurs ou en cours (fin >= aujourd'hui minuit)
    const now = new Date(); now.setHours(0,0,0,0);
    const upcoming = events.filter(e => {
        const end = e.end ? new Date(e.end) : new Date(e.start);
        return end >= now;
    });
    if (upcoming.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Aucun événement à venir</td></tr>';
        return;
    }
    const sorted = [...upcoming].sort((a, b) => new Date(a.start) - new Date(b.start));
    tbody.innerHTML = sorted.map(e => {
        const badge = e.status === 'validated'
            ? '<span class="badge-validated">✅ Validé</span>'
            : '<span class="badge-pending">⏳ En attente</span>';
        const editBtn = e.status === 'validated'
            ? `<button class="btn-icon btn-info" onclick="showEditEventModal('${e.id}')" title="Voir / Supprimer">👁️</button>`
            : `<button class="btn-icon btn-info" onclick="showEditEventModal('${e.id}')" title="Modifier / Valider">✏️</button>`;
        return `
            <tr>
                <td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${e.color||'#f4b942'};margin-right:6px;vertical-align:middle;"></span>${escapeHtml(e.title)}</td>
                <td>${new Date(e.start).toLocaleDateString('fr-FR')}</td>
                <td>${escapeHtml(e.location || '-')}</td>
                <td>${badge}</td>
                <td style="white-space:nowrap;">
                    ${editBtn}
                    <button class="btn-icon btn-danger" onclick="deleteEvent('${e.id}')" title="Supprimer">🗑️</button>
                </td>
            </tr>`;
    }).join('');
    // Mettre à jour le stat dashboard
    const statEl = document.getElementById('stat-events');
    if (statEl) statEl.textContent = events.filter(e => e.status === 'validated').length;
}

function initAdminCalendar() {
    const calendarEl = document.getElementById('adminCalendar');
    if (!calendarEl) return;
    if (adminCalendar) adminCalendar.destroy();
    adminCalendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'fr',
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
        events: events.map(e => ({
            id: e.id,
            title: (e.status === 'pending' ? '⏳ ' : '✅ ') + e.title + (e.type === 'conseil_administration' ? ' 🔒' : ''),
            start: e.start,
            end: e.end,
            color: e.color || '#f4b942',
            classNames: e.status === 'pending' ? ['event-pending'] : [],
            extendedProps: { status: e.status, type: e.type || 'public', visioLink: e.visioLink || '', visioCode: e.visioCode || '' }
        })),
        // Double-clic uniquement pour ouvrir la modale
        eventDidMount: function(info) {
            info.el.title = info.event.extendedProps.status === 'pending'
                ? 'En attente de validation — double-cliquer pour modifier'
                : 'Événement validé — double-cliquer pour voir';
            info.el.style.cursor = 'pointer';
            let clickTimer = null;
            info.el.addEventListener('click', function(e) {
                if (clickTimer) {
                    // Double-clic détecté
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    showEditEventModal(info.event.id);
                } else {
                    clickTimer = setTimeout(() => { clickTimer = null; }, 300);
                }
            });
        },
        eventClick: function(info) { /* géré par double-clic dans eventDidMount */ },
        height: 'auto',
        buttonText: {
            today:     'Aujourd\'hui',
            month:     'Mois',
            week:      'Semaine',
            day:       'Jour',
            list:      'Liste'
        },
        allDayText:    'Toute la journée',
        moreLinkText:  (n) => `+ ${n} autres`,
        noEventsText:  'Aucun événement',
        weekText:      'Sem.'
    });
    adminCalendar.render();
}

// ============ EVENT QUESTIONS ============

function getEventQuestions() {
    return JSON.parse(localStorage.getItem('montety_event_questions') || '[]');
}
function saveEventQuestions(q) {
    localStorage.setItem('montety_event_questions', JSON.stringify(q));
}

function updateQuestionsBadge() {
    const unread = getEventQuestions().filter(q => !q.read).length;
    const badge  = document.getElementById('unreadQuestionsBadge');
    const count  = document.getElementById('unreadQuestionsCount');
    if (badge) {
        badge.textContent   = unread;
        badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    }
    if (count) {
        count.textContent   = unread > 0 ? `${unread} non lue(s)` : '';
        count.style.display = unread > 0 ? '' : 'none';
    }
}

function renderEventQuestions() {
    updateQuestionsBadge();
    const tbody = document.getElementById('questionsList');
    if (!tbody) return;
    const questions = getEventQuestions();
    if (questions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#999;">Aucune question reçue</td></tr>';
        return;
    }
    const sorted = [...questions].sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = sorted.map(q => {
        const statusBadge = q.answered
            ? '<span style="background:#d4edda;color:#155724;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:700;">✅ Répondu</span>'
            : '<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:700;">⏳ En attente</span>';
        const unreadStyle = !q.read ? 'font-weight:700; background:#fffde7;' : '';
        return `<tr style="${unreadStyle}">
            <td style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(q.eventTitle)}">${escapeHtml(q.eventTitle)}</td>
            <td>
                <div>${escapeHtml(q.authorName || 'Anonyme')}</div>
                ${q.authorEmail ? `<div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(q.authorEmail)}</div>` : ''}
            </td>
            <td style="max-width:200px;">
                <div style="white-space:normal; font-size:0.88rem;">${escapeHtml(q.question)}</div>
                ${q.answered && q.answer ? `<div style="font-size:0.82rem;color:#28a745;margin-top:4px;border-left:3px solid #28a745;padding-left:6px;">${escapeHtml(q.answer)}</div>` : ''}
            </td>
            <td style="white-space:nowrap;font-size:0.82rem;">${new Date(q.date).toLocaleDateString('fr-FR')}</td>
            <td>${statusBadge}</td>
            <td style="white-space:nowrap;">
                ${!q.answered
                    ? `<button class="btn-icon btn-info" onclick="openAnswerModal(${q.id})" title="Répondre">✏️ Répondre</button>`
                    : `<button class="btn-icon btn-info" onclick="openAnswerModal(${q.id})" title="Modifier la réponse">✏️ Modifier</button>`}
                <button class="btn-icon btn-danger" onclick="deleteQuestion(${q.id})" title="Supprimer">🗑️</button>
            </td>
        </tr>`;
    }).join('');
    // Marquer toutes comme lues à l'affichage
    const qs = getEventQuestions();
    qs.forEach(q => q.read = true);
    saveEventQuestions(qs);
    updateQuestionsBadge();
}

function openAnswerModal(id) {
    const q = getEventQuestions().find(q => q.id === id);
    if (!q) return;
    const answer = prompt(
        `❓ Question de ${q.authorName || 'Anonyme'} sur « ${q.eventTitle} »:\n\n"${q.question}"\n\nVotre réponse (visible par tous les visiteurs) :`,
        q.answer || ''
    );
    if (answer === null) return; // annulé
    const qs = getEventQuestions();
    const found = qs.find(item => item.id === id);
    if (found) {
        found.answer     = answer.trim();
        found.answered   = answer.trim().length > 0;
        found.answeredAt = new Date().toISOString();
    }
    saveEventQuestions(qs);
    renderEventQuestions();
    // Envoyer un email de réponse si email connu
    if (found && found.authorEmail && found.answer) {
        const subj = encodeURIComponent(`Réponse à votre question — ${found.eventTitle}`);
        const body = encodeURIComponent(
            `Bonjour ${found.authorName || ''},\n\n` +
            `Votre question : "${found.question}"\n\n` +
            `Notre réponse : ${found.answer}\n\n` +
            `Cordialement,\nLes Amis de Montety`
        );
        window.open(`mailto:${found.authorEmail}?subject=${subj}&body=${body}`, '_blank');
    }
    addNotification(`Réponse envoyée pour la question sur « ${found.eventTitle} »`);
}

function deleteQuestion(id) {
    if (!confirm('Supprimer cette question ?')) return;
    const qs = getEventQuestions().filter(q => q.id !== id);
    saveEventQuestions(qs);
    renderEventQuestions();
}

// ============ MESSAGES FUNCTIONS ============
function updateUnreadBadge() {
    const unreadCount = messages.filter(m => !m.read).length;
    const badge = document.getElementById('unreadMessagesBadge');
    if (!badge) return;
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderMessages() {
    updateUnreadBadge();
    const tbody = document.getElementById('messagesList');
    if (messages.length === 0) {
        tbody.innerHTML = ' <td colspan="8" class="text-center">Aucun message</td>';
        return;
    }
    tbody.innerHTML = messages.map(m => `
        <tr class="${m.important ? 'important' : ''} ${!m.read ? 'unread' : ''}">
            <td><input type="checkbox" class="message-checkbox" data-id="${m.id}"></td>
            <td>${!m.read ? '📖 Non lu' : (m.important ? '⭐ Important' : '✓ Lu')}</td>
            <td>${escapeHtml(m.name)}</td>
            <td>${escapeHtml(m.email)}</td>
            <td>${escapeHtml(m.subject)}</td>
            <td class="message-preview">${escapeHtml(m.message.substring(0, 50))}${m.message.length > 50 ? '...' : ''}</td>
            <td>${new Date(m.date).toLocaleString()}</td>
            <td>
                <button class="btn-icon btn-info" onclick="viewMessage(${m.id})">👁️ Voir</button>
                <button class="btn-icon btn-primary" onclick="replyToMessage(${m.id})">✉️ Répondre</button>
                <button class="btn-icon btn-danger" onclick="deleteMessage(${m.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function viewMessage(id) {
    const m = messages.find(m => m.id === id);
    if (m) {
        if (!m.read) { m.read = true; saveMessages(); renderMessages(); }
        document.getElementById('viewMessageTitle').innerText = m.subject;
        document.getElementById('viewMessageContent').innerHTML = `
            <div><label>De :</label><p>${escapeHtml(m.name)} (${escapeHtml(m.email)})</p></div>
            <div><label>Date :</label><p>${new Date(m.date).toLocaleString()}</p></div>
            <div><label>Message :</label><p style="white-space: pre-wrap;">${escapeHtml(m.message)}</p></div>
        `;
        document.getElementById('viewMessageModal').classList.add('active');
        window.currentViewMessageId = id;
    }
}

function closeViewMessageModal() { document.getElementById('viewMessageModal').classList.remove('active'); }

function replyFromView() { closeViewMessageModal(); replyToMessage(window.currentViewMessageId); }

function replyToMessage(id) {
    const m = messages.find(m => m.id === id);
    if (m) {
        document.getElementById('replyMessageId').value = id;
        document.getElementById('replyTo').value = m.email;
        document.getElementById('replySubject').value = `Re: ${m.subject}`;
        document.getElementById('replyBody').value = `Bonjour ${m.name},\n\n`;
        document.getElementById('replyMessageModal').classList.add('active');
    }
}

function closeReplyMessageModal() { document.getElementById('replyMessageModal').classList.remove('active'); }

function sendReply(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('replyMessageId').value);
    const to = document.getElementById('replyTo').value;
    const subject = document.getElementById('replySubject').value;
    const body = document.getElementById('replyBody').value;
    const m = messages.find(m => m.id === id);
    if (m) { m.replied = true; saveMessages(); renderMessages(); }
    window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    closeReplyMessageModal();
    alert('Réponse ouverte dans votre client email');
}

function deleteMessage(id) {
    if (confirm('Supprimer ce message ?')) {
        messages = messages.filter(m => m.id !== id);
        saveMessages();
        renderMessages();
    }
}

function markSelectedAsRead() {
    document.querySelectorAll('.message-checkbox:checked').forEach(cb => {
        const m = messages.find(m => m.id === parseInt(cb.dataset.id));
        if (m) m.read = true;
    });
    saveMessages();
    renderMessages();
}

function markSelectedAsUnread() {
    document.querySelectorAll('.message-checkbox:checked').forEach(cb => {
        const m = messages.find(m => m.id === parseInt(cb.dataset.id));
        if (m) m.read = false;
    });
    saveMessages();
    renderMessages();
}

function markSelectedAsImportant() {
    document.querySelectorAll('.message-checkbox:checked').forEach(cb => {
        const m = messages.find(m => m.id === parseInt(cb.dataset.id));
        if (m) m.important = !m.important;
    });
    saveMessages();
    renderMessages();
}

function deleteSelectedMessages() {
    const selected = document.querySelectorAll('.message-checkbox:checked');
    if (selected.length === 0) { alert('Aucun message sélectionné'); return; }
    if (confirm(`Supprimer ${selected.length} message(s) ?`)) {
        const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
        messages = messages.filter(m => !ids.includes(m.id));
        saveMessages();
        renderMessages();
    }
}

function toggleSelectAllMessages() {
    const selectAll = document.getElementById('selectAllMessages');
    document.querySelectorAll('.message-checkbox').forEach(cb => cb.checked = selectAll.checked);
}

// ============ UTILITIES ============
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============ SETTINGS ============
function loadSettings() {
    document.getElementById('assocName').value = settings.assocName;
    document.getElementById('assocEmail').value = settings.assocEmail;
    document.getElementById('assocPhone').value = settings.assocPhone || '';
    document.getElementById('assocAddress').value = settings.assocAddress;
    document.getElementById('cotisationAmount').value = settings.cotisationAmount;
}

function saveSettingsPage() {
    settings.assocName = document.getElementById('assocName').value;
    settings.assocEmail = document.getElementById('assocEmail').value;
    settings.assocPhone = document.getElementById('assocPhone').value;
    settings.assocAddress = document.getElementById('assocAddress').value;
    settings.cotisationAmount = parseFloat(document.getElementById('cotisationAmount').value);
    saveSettings();
    alert('Paramètres enregistrés !');
}

// ============ ÉVÉNEMENTS PAR DÉFAUT : CIRCUIT DE VISA ============
function initDefaultEvents() {
    if (events.length === 0) {
        const defaultEvents = [
            {
                id: 'visa-2026-05',
                title: 'Circuit de Visa – Pèlerinage Montety',
                start: new Date('2026-05-16T09:00:00'),
                end: new Date('2026-05-16T18:00:00'),
                location: 'Toulon – Montety',
                description: 'Circuit annuel de Visa organisé par Les Amis de Montety. Départ depuis le parvis de l\'église.',
                color: '#f4b942',
                status: 'pending',
                visaComment: 'À valider après confirmation de la paroisse.'
            },
            {
                id: 'visa-2026-10',
                title: 'Circuit de Visa – Pèlerinage Automne',
                start: new Date('2026-10-10T09:00:00'),
                end: new Date('2026-10-10T18:00:00'),
                location: 'Toulon – Montety',
                description: 'Édition automnale du Circuit de Visa.',
                color: '#fd7e14',
                status: 'pending',
                visaComment: 'Date à confirmer.'
            }
        ];
        events.push(...defaultEvents);
        saveEvents();
    } else {
        // Migrer les anciens événements sans statut
        let changed = false;
        events.forEach(e => {
            if (!e.status) { e.status = 'pending'; changed = true; }
        });
        if (changed) saveEvents();
    }
}

// ============ GESTION DES ACCÈS (onglet super admin) ============

function renderAccess() {
    const tbody = document.getElementById('accessList');
    if (!tbody) return;
    const accounts = (typeof getAdminAccounts === 'function') ? getAdminAccounts() : [];
    if (accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Aucun compte</td></tr>';
        return;
    }
    tbody.innerHTML = accounts.map(acc => {
        const isSA = acc.role === 'super_admin';
        const roleLabel = isSA ? '⭐ Super Admin'
            : acc.role === 'simple' ? '🔵 Simple'
            : '👤 Admin';
        const statusBadge = acc.active !== false
            ? '<span style="color:#28a745;font-weight:600;">✔ Actif</span>'
            : '<span style="color:#dc3545;font-weight:600;">✘ Désactivé</span>';
        const createdAt = acc.createdAt ? new Date(acc.createdAt).toLocaleDateString('fr-FR') : '—';
        const resetBtn = !isSA
            ? `<button class="btn-icon btn-info" style="background:#6c8ebf;color:white;white-space:nowrap;"
                title="Générer un nouveau mot de passe et envoyer par email"
                onclick="resetMemberPassword('${escapeHtml(acc.email)}','${escapeHtml(acc.name||acc.email)}')">🔑 Réinitialiser</button>`
            : '<span style="font-size:0.75rem;color:#a0aec0;">—</span>';
        return `
        <tr>
            <td>${escapeHtml(acc.name || '')}</td>
            <td>${escapeHtml(acc.email)}</td>
            <td>${roleLabel}</td>
            <td>${statusBadge}</td>
            <td>${createdAt}</td>
            <td style="white-space:nowrap;display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                ${resetBtn}
                ${!isSA ? `
                <button class="btn-icon" style="background:${acc.active !== false ? '#ffc107' : '#28a745'};color:white;"
                    title="${acc.active !== false ? 'Désactiver' : 'Activer'} le compte"
                    onclick="toggleAccountAccess('${escapeHtml(acc.email)}')">${acc.active !== false ? '⏸' : '▶'}</button>
                <button class="btn-icon btn-danger" title="Supprimer le compte"
                    onclick="deleteAccount('${escapeHtml(acc.email)}')">🗑️</button>
                ` : '<span style="font-size:0.75rem;color:#a0aec0;">Compte protégé</span>'}
            </td>
        </tr>`;
    }).join('');
}

function resetMemberPassword(email, name) {
    if (!confirm(`Réinitialiser le mot de passe de ${name} et lui envoyer un email ?`)) return;
    if (typeof sendNewPasswordToMember === 'function') {
        sendNewPasswordToMember(email, name);
        addNotification(`Mot de passe réinitialisé pour ${name} — email préparé`);
    } else {
        alert('Fonction d\'envoi indisponible.');
    }
}

function toggleAccountAccess(email) {
    if (typeof getAdminAccounts !== 'function') return;
    const accounts = getAdminAccounts();
    const acc = accounts.find(a => a.email === email);
    if (!acc) return;
    if (acc.role === 'super_admin') { alert('Impossible de désactiver le compte super administrateur.'); return; }
    acc.active = acc.active === false ? true : false;
    if (typeof saveAdminAccounts === 'function') saveAdminAccounts(accounts);
    renderAccess();
    addNotification(`Compte ${email} ${acc.active ? 'activé' : 'désactivé'}`);
}

function deleteAccount(email) {
    if (typeof getAdminAccounts !== 'function') return;
    const accounts = getAdminAccounts();
    const acc = accounts.find(a => a.email === email);
    if (!acc) return;
    if (acc.role === 'super_admin') { alert('Impossible de supprimer le compte super administrateur.'); return; }
    if (!confirm(`Supprimer le compte admin de ${acc.name || email} ?`)) return;
    const updated = accounts.filter(a => a.email !== email);
    if (typeof saveAdminAccounts === 'function') saveAdminAccounts(updated);
    renderAccess();
    addNotification(`Compte ${email} supprimé`);
}

function showAddAccessModal() {
    const modal = document.getElementById('addAccessModal');
    if (modal) {
        document.getElementById('accessEmail').value = '';
        document.getElementById('accessName').value = '';
        modal.classList.add('active');
    }
}

function closeAddAccessModal() {
    const modal = document.getElementById('addAccessModal');
    if (modal) modal.classList.remove('active');
}

function createAccessAccount(e) {
    e.preventDefault();
    const email = document.getElementById('accessEmail').value.trim();
    const name = document.getElementById('accessName').value.trim();
    if (!email) { alert('Email requis'); return; }
    if (typeof sendNewPasswordToMember === 'function') {
        sendNewPasswordToMember(email, name || email);
    } else if (typeof upsertAdminAccount === 'function') {
        const pwd = (typeof generatePassword === 'function') ? generatePassword() : Math.random().toString(36).substring(2, 12);
        upsertAdminAccount(email, name, pwd, 'admin');
        alert(`Compte créé !\nEmail : ${email}\nMot de passe : ${pwd}`);
    }
    closeAddAccessModal();
    renderAccess();
}

// ============ INITIALISATION PRINCIPALE ============
function initAll() {
    // Événements par défaut si aucun n'existe
    initDefaultEvents();

    // Connexion des boutons
    document.getElementById('showMemberModalBtn')?.addEventListener('click', showMemberModal);
    document.getElementById('exportMembersBtn')?.addEventListener('click', exportMembers);
    document.getElementById('openMailingListBtn')?.addEventListener('click', openMailingList);
    document.getElementById('showAddEventModalBtn')?.addEventListener('click', showAddEventModal);
    document.getElementById('markReadBtn')?.addEventListener('click', markSelectedAsRead);
    document.getElementById('markUnreadBtn')?.addEventListener('click', markSelectedAsUnread);
    document.getElementById('markImportantBtn')?.addEventListener('click', markSelectedAsImportant);
    document.getElementById('deleteMessagesBtn')?.addEventListener('click', deleteSelectedMessages);
    document.getElementById('showExpenseModalBtn')?.addEventListener('click', showExpenseModal);
    document.getElementById('showAddDonationModalBtn')?.addEventListener('click', showAddDonationModal);
    document.getElementById('exportBudgetWordBtn')?.addEventListener('click', exportBudgetWord);
    document.getElementById('showCouncilModalBtn')?.addEventListener('click', showCouncilModal);
    document.getElementById('selectAllMembers')?.addEventListener('change', toggleSelectAll);
    document.getElementById('selectAllMessages')?.addEventListener('change', toggleSelectAllMessages);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Rendu initial
    renderMembers();
    renderCouncil();
    renderMessages();
    renderDonationsList();
    renderExpenses();
    renderEvents();
    updateDashboard();
    updateBudgetStats();
    updateMembershipChart('year');
    initAdminCalendar();
    initRevenueChart();
    renderNotifications();
    updateQuestionsBadge();
}

// DOMContentLoaded : auth gérée par admin.html, rien à faire ici
document.addEventListener('DOMContentLoaded', function() {
    // L'authentification et l'appel à initAll() sont gérés
    // par le script inline de admin.html (handleLogin / checkAdminAuth)
});