const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const quizController = require('../controller/quizController');

// Auth routes
router.get('/login', authController.renderLoginPage);
router.post('/login', authController.login);
router.get('/register', authController.renderRegisterPage);
router.post('/register', authController.register);
router.get('/logout', authController.logout);

// Forgot password routes
router.get('/forgot-password', authController.renderForgotPasswordPage);
router.post('/forgot-password', authController.forgotPassword);

// Protected routes
router.get('/profile', isAuthenticated, authController.renderProfilePage);
router.get('/dashboard', isAuthenticated, authController.renderDashboardPage);

// Quiz routes
router.get('/create', isAuthenticated, quizController.renderCreateQuiz);

// Home route
router.get('/', (req, res) => {
    if (res.locals.isAuthenticated) {
        return res.redirect('/profile');
    }
    res.redirect('/login');
});

module.exports = router;