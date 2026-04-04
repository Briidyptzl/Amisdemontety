// ============ AUTHENTICATION SYSTEM ============

// Données des administrateurs
const ADMINS = [
    { email: 'admin@amismontety.fr', password: 'admin2026', name: 'Administrateur' },
    { email: 'baudoin@amismontety.fr', password: 'pass2026', name: 'Baudoin Pezeril' },
    { email: 'pierre@amismontety.fr', password: 'pass2026', name: 'Pierre Edouard Caussin' },
    { email: 'fabrice@amismontety.fr', password: 'pass2026', name: 'Fabrice Autrique' }
];

// ============ LOGIN FUNCTION ============
function login(event) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    
    const admin = ADMINS.find(a => a.email === email && a.password === password);
    
    if (admin) {
        // Stockage sécurisé
        sessionStorage.setItem('adminLogged', JSON.stringify({
            email: admin.email,
            name: admin.name,
            loginTime: new Date().toISOString()
        }));
        
        // Fermer le modal
        closeLoginModal();
        
        // Afficher le contenu admin
        const adminContainer = document.getElementById('adminContainer');
        if (adminContainer) adminContainer.style.display = 'block';
        
        // Afficher le nom de l'utilisateur
        const userInfoSpan = document.getElementById('userInfo');
        if (userInfoSpan) userInfoSpan.textContent = admin.name;
        
        // Initialiser les données si nécessaire
        if (typeof initAll === 'function') {
            initAll();
        }
        
        alert('Connexion réussie !');
    } else {
        alert('Email ou mot de passe incorrect');
    }
}

// ============ SHOW LOGIN MODAL ============
function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
    }
}

// ============ CLOSE LOGIN MODAL ============
function closeLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
}

// ============ LOGOUT FUNCTION ============
function logout() {
    if (confirm('Vous êtes sûr de vouloir vous déconnecter ?')) {
        sessionStorage.removeItem('adminLogged');
        // Rafraîchir la page pour revenir à l'état de connexion
        location.reload();
    }
}

// ============ CHECK LOGIN ============
function checkAuth() {
    const loggedIn = sessionStorage.getItem('adminLogged');
    const adminContainer = document.getElementById('adminContainer');
    
    // Ne pas masquer/afficher le container ici, laisser checkAdminAuth gérer
    return !!loggedIn;
}

// ============ PASSWORD RESET FUNCTIONS ============
function showForgotPasswordModal() {
    closeLoginModal();
    const forgotModal = document.getElementById('forgotPasswordModal');
    if (forgotModal) forgotModal.style.display = 'flex';
}

function closeForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) modal.style.display = 'none';
    showLoginModal();
}

function closeResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) modal.style.display = 'none';
    showLoginModal();
}

function sendResetCode(e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail')?.value;
    
    if (!email) {
        alert('Veuillez entrer votre email');
        return;
    }
    
    const admin = ADMINS.find(a => a.email === email);
    
    if (admin) {
        const resetCode = Math.random().toString(36).substring(2, 15).toUpperCase();
        alert(`✅ Code de réinitialisation: ${resetCode}\n\nUtilisez ce code pour réinitialiser votre mot de passe.`);
        
        closeForgotPasswordModal();
        
        const resetModal = document.getElementById('resetPasswordModal');
        if (resetModal) {
            document.getElementById('resetEmailHidden').value = email;
            resetModal.style.display = 'flex';
        }
    } else {
        alert('❌ Cet email n\'est pas enregistré comme administrateur.');
    }
}

function resetPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmailHidden')?.value;
    const code = document.getElementById('resetCode')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmNewPassword')?.value;
    
    // Pour simplifier, on accepte n'importe quel code
    if (code.length < 4) {
        alert('❌ Code de réinitialisation incorrect.');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('❌ Les mots de passe ne correspondent pas.');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('❌ Le mot de passe doit faire au moins 6 caractères.');
        return;
    }
    
    // Mettre à jour le mot de passe
    const admin = ADMINS.find(a => a.email === email);
    if (admin) {
        admin.password = newPassword;
        alert('✅ Mot de passe réinitialisé avec succès !');
        closeResetPasswordModal();
        
        // Réinitialiser les champs
        document.getElementById('resetCode').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
    }
}

// Exporter les fonctions pour une utilisation globale
window.login = login;
window.logout = logout;
window.checkAuth = checkAuth;
window.showLoginModal = showLoginModal;
window.closeLoginModal = closeLoginModal;
window.showForgotPasswordModal = showForgotPasswordModal;
window.closeForgotPasswordModal = closeForgotPasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.sendResetCode = sendResetCode;
window.resetPassword = resetPassword;