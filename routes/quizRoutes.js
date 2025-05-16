const express = require('express');
const router = express.Router();
const quizController = require('../controller/quizController');
const { isAuthenticated, isAdmin } = require('../middleware/authMiddleware');

// Quiz routes
router.get('/create', isAuthenticated, quizController.renderCreateQuiz);
router.post('/create', isAuthenticated, quizController.createQuiz);
router.get('/all', isAuthenticated, quizController.getAllQuizzes);
router.get('/admin/all', isAuthenticated, isAdmin, quizController.getAllQuizzesForAdmin);
router.get('/export', isAuthenticated, isAdmin, quizController.exportQuizzes);
router.get('/my-quizzes', isAuthenticated, quizController.getUserQuizzes);
router.get('/view/:id', isAuthenticated, quizController.viewQuiz);
router.get('/edit/:id', isAuthenticated, quizController.renderEditQuiz);
router.post('/edit/:id', isAuthenticated, quizController.updateQuiz);

// Host and play routes
router.get('/host/:id', isAuthenticated, quizController.hostQuiz);
router.get('/play/:id', isAuthenticated, quizController.playQuiz);
router.post('/submit/:id', isAuthenticated, quizController.submitQuizAnswers);

// Game joining routes
router.get('/join', quizController.joinQuiz); // Using the same function for GET and POST
router.post('/join', quizController.joinQuiz);
router.post('/join-by-id', quizController.joinQuizById);
// Fix for the middleware issue - remove the non-existent middleware
router.get('/lobby/:code', quizController.gameLobby);
router.get('/public-games', quizController.getPublicGames);

// Quiz discovery route - access to all public quizzes
router.get('/discover', quizController.getPublicQuizzes);

// Add new route for player's game view
router.get('/play-game/:code', quizController.playGameAsPlayer);

// Delete routes
router.delete('/delete/:id', isAuthenticated, quizController.deleteQuiz);
router.get('/delete/:id', isAuthenticated, quizController.deleteQuiz);

module.exports = router;
