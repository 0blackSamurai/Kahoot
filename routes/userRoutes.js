const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');
const { isAuthenticated, isAdmin } = require('../middleware/authMiddleware');

// Render the index page
router.get('/', (req, res) => {
    res.render('index', { title: 'Welcome' });
});

// FAQ page
router.get('/faq', (req, res) => {
    res.render('faq', { title: 'Frequently Asked Questions' });
});

// User management routes (admin only)
router.get('/all', isAuthenticated, isAdmin, userController.getAllUsers);
router.put('/users/role', isAuthenticated, isAdmin, userController.updateUserRole);
router.get('/users/support-staff', isAuthenticated, isAdmin, userController.getSupportStaff);
router.get('/user-management', isAuthenticated, isAdmin, userController.renderUserManagement);

// Update the delete route to handle both DELETE and GET methods
router.delete('/users/:userId', isAuthenticated, isAdmin, userController.deleteUser);
router.get('/users/:userId', isAuthenticated, isAdmin, userController.deleteUser);

// Dashboard data route - restricted to admins
router.get('/dashboard-data', isAuthenticated, isAdmin, userController.getDashboardData);

// User manual/help routes
router.get('/help', isAuthenticated, (req, res) => {
    res.render('userManual', { 
        title: 'User Manual',
        userRole: req.user.role
    });
});

module.exports = router;