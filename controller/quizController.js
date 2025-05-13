const Quiz = require('../models/quizModel');

// Get all quizzes - for admin users
exports.getAllQuizzesForAdmin = async (req, res) => {
    try {
        // Admins can see all quizzes
        const quizzes = await Quiz.find()
            .sort({ createdAt: -1 })
            .populate('createdBy', 'username');

        console.log(`Found ${quizzes.length} quizzes for admin view`);
        
        res.json({ quizzes });
    } catch (error) {
        console.error('Error fetching all quizzes for admin:', error);
        res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
};

// Get all quizzes - regular users see public quizzes and their own
exports.getAllQuizzes = async (req, res) => {
    try {
        // Regular users can see public quizzes and their own
        const quizzes = await Quiz.find({
            $or: [
                { isPublic: true },
                { createdBy: req.user.userId }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('createdBy', 'username');

        console.log(`Found ${quizzes.length} quizzes for user view`);
        
        // For admin route, we'll expose this endpoint directly
        if (req.originalUrl.includes('admin')) {
            return res.render('admin/quizzes', { 
                title: 'Manage Quizzes',
                quizzes 
            });
        }
        
        res.json({ quizzes });
    } catch (error) {
        console.error('Error fetching quizzes:', error);
        res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
};

// Get user's created quizzes
exports.getUserQuizzes = async (req, res) => {
    try {
        // Ensure we have a user ID
        if (!req.user || !req.user.userId) {
            console.error('User not authenticated or missing userId');
            return res.redirect('/login');
        }
        
        console.log('Finding quizzes for user ID:', req.user.userId);
        
        const quizzes = await Quiz.find({ createdBy: req.user.userId })
            .sort({ updatedAt: -1 });
        
        res.render('list', {
            title: 'My Quizzes',
            quizzes,
            isMyQuizzes: true
        });
    } catch (error) {
        console.error('Error fetching user quizzes:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load your quizzes',
            error: { status: 500 }
        });
    }
};

// Render quiz creation page
exports.renderCreateQuiz = (req, res) => {
    res.render('create', {
        title: 'Create Quiz'
    });
};

// Process quiz creation
exports.createQuiz = async (req, res) => {
    try {
        // Debug info
        console.log('User data in createQuiz:', req.user);
        
        if (!req.user || !req.user.userId) {
            console.error('User not authenticated or missing userId');
            return res.status(401).render('error', {
                title: 'Authentication Error',
                message: 'You must be logged in to create a quiz',
                error: { status: 401 }
            });
        }
        
        const { title, description, questions, isPublic } = req.body;
        
        // Parse question data from form
        let parsedQuestions;
        try {
            parsedQuestions = Array.isArray(questions) ? questions : JSON.parse(questions);
        } catch (err) {
            console.error('Error parsing questions JSON:', err);
            return res.status(400).render('error', {
                title: 'Error',
                message: 'Invalid question data format',
                error: { status: 400 }
            });
        }
        
        // Process questions to include points
        const processedQuestions = parsedQuestions.map(q => ({
            questionText: q.questionText,
            options: q.options,
            timeLimit: q.timeLimit || 30,
            points: q.points || 'standard',
            media: {
                type: 'none',
                url: '',
                alt: ''
            }
        }));
        
        // Create new quiz with explicit userId to avoid any confusion
        const newQuiz = new Quiz({
            title,
            description,
            createdBy: req.user.userId,
            questions: processedQuestions,
            isPublic: isPublic === 'on' || isPublic === true,
            theme: 'dark'
        });
        
        console.log('Saving quiz with creator ID:', req.user.userId);
        await newQuiz.save();
        res.redirect('/quiz/my-quizzes');
    } catch (error) {
        console.error('Error creating quiz:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to create quiz: ' + error.message,
            error: { status: 500 }
        });
    }
};

// View quiz details
exports.viewQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .populate('createdBy', 'username');
            
        if (!quiz) {
            return res.status(404).render('error', {
                title: 'Quiz Not Found',
                message: 'The requested quiz could not be found',
                error: { status: 404 }
            });
        }
        
        // Check if user is authorized to view this quiz
        const isOwner = req.user && req.user.userId === quiz.createdBy.toString();
        if (!quiz.isPublic && !isOwner) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to view this quiz',
                error: { status: 403 }
            });
        }
        
        // Using the main 'view' view instead of 'quiz/view'
        res.render('view', {
            title: quiz.title,
            quiz,
            isOwner
        });
    } catch (error) {
        console.error('Error viewing quiz:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load quiz',
            error: { status: 500 }
        });
    }
};

// Render quiz edit page
exports.renderEditQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        
        if (!quiz) {
            return res.status(404).render('error', {
                title: 'Quiz Not Found',
                message: 'The requested quiz could not be found',
                error: { status: 404 }
            });
        }
        
        // Check if user is authenticated
        if (!req.user || !req.user.userId) {
            console.error('User not authenticated or missing userId');
            return res.status(401).render('error', {
                title: 'Authentication Error',
                message: 'You must be logged in to edit a quiz',
                error: { status: 401 }
            });
        }
        
        // Debug output
        console.log('Quiz creator:', quiz.createdBy.toString());
        console.log('Current user:', req.user.userId);
        
        // Check if user is authorized to edit this quiz
        if (req.user.userId !== quiz.createdBy.toString()) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to edit this quiz',
                error: { status: 403 }
            });
        }
        
        // Using the edit view directly
        res.render('edit', {
            title: 'Edit Quiz',
            quiz
        });
    } catch (error) {
        console.error('Error loading quiz for edit:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load quiz for editing',
            error: { status: 500 }
        });
    }
};

// Process quiz update
exports.updateQuiz = async (req, res) => {
    try {
        const { title, description, questions, isPublic } = req.body;
        const quizId = req.params.id;
        
        // Find the quiz and verify ownership
        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }
        
        // Check if user is authenticated
        if (!req.user || !req.user.userId) {
            console.error('User not authenticated or missing userId');
            return res.status(401).render('error', {
                title: 'Authentication Error',
                message: 'You must be logged in to update a quiz',
                error: { status: 401 }
            });
        }
        
        if (req.user.userId !== quiz.createdBy.toString()) {
            return res.status(403).json({ message: 'Not authorized to edit this quiz' });
        }
        
        // Parse question data from form
        let parsedQuestions;
        try {
            parsedQuestions = Array.isArray(questions) ? questions : JSON.parse(questions);
        } catch (err) {
            return res.status(400).json({ message: 'Invalid question data format' });
        }
        
        // Process questions to include points
        const processedQuestions = parsedQuestions.map(q => ({
            questionText: q.questionText,
            options: q.options,
            timeLimit: q.timeLimit || 30,
            points: q.points || 'standard',
            media: q.media || { type: 'none', url: '', alt: '' }
        }));
        
        // Update quiz
        quiz.title = title;
        quiz.description = description;
        quiz.questions = processedQuestions;
        quiz.isPublic = isPublic === 'on' || isPublic === true;
        quiz.updatedAt = Date.now();
        
        await quiz.save();
        res.redirect(`/quiz/view/${quizId}`);
    } catch (error) {
        console.error('Error updating quiz:', error);
        res.status(500).json({ message: 'Failed to update quiz' });
    }
};

// Play quiz
exports.playQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        
        if (!quiz) {
            return res.status(404).render('error', {
                title: 'Quiz Not Found',
                message: 'The requested quiz could not be found',
                error: { status: 404 }
            });
        }
        
        // Check if quiz is public or user is owner
        const isOwner = req.user && req.user.userId === quiz.createdBy.toString();
        if (!quiz.isPublic && !isOwner) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to play this quiz',
                error: { status: 403 }
            });
        }
        
        // Hide correct answers when sending to client
        const playableQuiz = {
            _id: quiz._id,
            title: quiz.title,
            description: quiz.description,
            questions: quiz.questions.map(q => ({
                _id: q._id,
                questionText: q.questionText,
                timeLimit: q.timeLimit,
                options: q.options.map(opt => ({
                    _id: opt._id,
                    text: opt.text
                    // Exclude isCorrect field
                }))
            }))
        };
        
        // Using the play view directly
        res.render('play', {
            title: `Play: ${quiz.title}`,
            quiz: playableQuiz
        });
    } catch (error) {
        console.error('Error loading quiz for play:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load quiz',
            error: { status: 500 }
        });
    }
};

// Submit quiz answers
exports.submitQuizAnswers = async (req, res) => {
    try {
        const { answers } = req.body;
        const quizId = req.params.id;
        
        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }
        
        // Calculate score
        let parsedAnswers;
        try {
            parsedAnswers = JSON.parse(answers);
        } catch (err) {
            return res.status(400).json({ message: 'Invalid answers format' });
        }
        
        let score = 0;
        let total = 0;
        
        quiz.questions.forEach((question, qIndex) => {
            total++;
            const userAnswers = parsedAnswers[qIndex] || [];
            
            // Check if user selected all correct options and no incorrect ones
            const correctOptions = question.options.filter(opt => opt.isCorrect);
            const userCorrect = userAnswers.every(answerIndex => {
                const option = question.options[answerIndex];
                return option && option.isCorrect;
            });
            
            const userSelectedAllCorrect = correctOptions.length === userAnswers.length;
            
            if (userCorrect && userSelectedAllCorrect) {
                score++;
            }
        });
        
        res.json({
            score,
            total,
            percentage: Math.round((score / total) * 100)
        });
    } catch (error) {
        console.error('Error processing quiz submission:', error);
        res.status(500).json({ message: 'Failed to process quiz submission' });
    }
};

// Delete quiz
exports.deleteQuiz = async (req, res) => {
    try {
        const quizId = req.params.id;
        console.log(`Attempting to delete quiz with ID: ${quizId}`);
        
        const quiz = await Quiz.findById(quizId);
        
        if (!quiz) {
            console.log(`Quiz not found with ID: ${quizId}`);
            return res.status(404).json({ error: 'Quiz not found' });
        }
        
        // Check if user is authorized to delete (admin or quiz creator)
        const isAdmin = req.user && req.user.role === 'Admin';
        const isCreator = quiz.createdBy && quiz.createdBy.toString() === req.user.userId;
        
        console.log(`User role: ${req.user.role}, isAdmin: ${isAdmin}, isCreator: ${isCreator}`);
        
        if (!isAdmin && !isCreator) {
            console.log('User not authorized to delete this quiz');
            return res.status(403).json({ error: 'You do not have permission to delete this quiz' });
        }
        
        await Quiz.findByIdAndDelete(quizId);
        console.log(`Quiz deleted successfully: ${quizId}`);
        
        // If it's a GET request, redirect to appropriate page
        if (req.method === 'GET') {
            if (isAdmin && req.headers.referer && req.headers.referer.includes('dashboard')) {
                return res.redirect('/dashboard#quizzes');
            } else {
                return res.redirect('/profile');
            }
        }
        
        // For DELETE requests, send JSON response
        res.status(200).json({ message: 'Quiz deleted successfully' });
    } catch (error) {
        console.error('Error deleting quiz:', error);
        
        // Handle based on request type
        if (req.method === 'GET') {
            return res.status(500).render('error', {
                title: 'Error',
                message: 'Could not delete quiz',
                error: { status: 500 }
            });
        }
        
        res.status(500).json({ error: 'Failed to delete quiz' });
    }
};

// Host quiz
exports.hostQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        
        if (!quiz) {
            return res.status(404).render('error', {
                title: 'Quiz Not Found',
                message: 'The requested quiz could not be found',
                error: { status: 404 }
            });
        }
        
        // Check if user is authorized to host this quiz
        const isOwner = req.user && req.user.userId === quiz.createdBy.toString();
        if (!quiz.isPublic && !isOwner) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have permission to host this quiz',
                error: { status: 403 }
            });
        }
        
        // Generate a unique 4-letter game code
        const gameCode = generateGameCode();
        
        // Store the game in active games (in a real app, this would be in a database or cache)
        // For now, we'll use a simple global object
        if (!global.activeGames) {
            global.activeGames = {};
        }
        
        // Create unique host ID (for direct joining)
        const hostId = `host_${req.user.userId}_${Date.now()}`;
        
        global.activeGames[gameCode] = {
            quiz: quiz,
            host: req.user.userId,
            hostId: hostId, // Store the host ID for direct joining
            players: [],
            status: 'waiting', // waiting, playing, finished
            currentQuestion: 0,
            startTime: Date.now()
        };
        
        // Store a reference to the game by hostId as well
        global.activeGames[hostId] = global.activeGames[gameCode];
        
        // Increment play count
        quiz.playCount = (quiz.playCount || 0) + 1;
        await quiz.save();
        
        // Render the host view
        res.render('host', {
            title: `Host: ${quiz.title}`,
            quiz,
            gameCode,
            hostId
        });
    } catch (error) {
        console.error('Error hosting quiz:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to host quiz',
            error: { status: 500 }
        });
    }
};

// Join quiz by game code
exports.joinQuiz = async (req, res) => {
    // If GET request, just render the join form - fix by checking the request method
    if (req.method === 'GET') {
        return res.render('join', {
            title: 'Join Quiz'
        });
    }
    
    // Now safely extract gameCode from POST request
    const { gameCode } = req.body || {};
    
    // If no gameCode provided in POST request, show error
    if (!gameCode) {
        return res.render('join', {
            title: 'Join Quiz',
            error: 'Please enter a game code.'
        });
    }
    
    // Check if the game exists
    if (!global.activeGames || !global.activeGames[gameCode.toUpperCase()]) {
        return res.render('join', {
            title: 'Join Quiz',
            error: 'Game not found. Please check your game code.'
        });
    }
    
    const game = global.activeGames[gameCode.toUpperCase()];
    
    // Check if game is already in progress
    if (game.status !== 'waiting') {
        return res.render('join', {
            title: 'Join Quiz',
            error: 'This game has already started.'
        });
    }
    
    // Generate a player ID if not logged in
    const playerId = req.user ? req.user.userId : `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const playerName = req.user ? req.user.username : req.body.playerName || 'Anonymous';
    
    // Add player to the game
    game.players.push({
        id: playerId,
        name: playerName,
        score: 0,
        answers: []
    });
    
    // Redirect to the game lobby
    res.redirect(`/quiz/lobby/${gameCode.toUpperCase()}`);
};

// Join quiz by host ID
exports.joinQuizById = async (req, res) => {
    const { hostId } = req.body;
    
    if (!hostId) {
        return res.render('join', {
            title: 'Join Quiz',
            error: 'Host ID is required.'
        });
    }
    
    // Check if the game exists with this host ID
    if (!global.activeGames || !global.activeGames[hostId]) {
        return res.render('join', {
            title: 'Join Quiz',
            error: 'Game not found. Please check the host ID.'
        });
    }
    
    const game = global.activeGames[hostId];
    
    // Check if game is already in progress
    if (game.status !== 'waiting') {
        return res.render('join', {
            title: 'Join Quiz',
            error: 'This game has already started.'
        });
    }
    
    // Generate a player ID if not logged in
    const playerId = req.user ? req.user.userId : `player_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const playerName = req.user ? req.user.username : req.body.playerName || 'Anonymous';
    
    // Add player to the game
    game.players.push({
        id: playerId,
        name: playerName,
        score: 0,
        answers: []
    });
    
    // Find the game code for redirection
    let gameCode = null;
    for (const [code, g] of Object.entries(global.activeGames)) {
        if (g === game && code.length === 4) {  // Game codes are 4 characters
            gameCode = code;
            break;
        }
    }
    
    if (!gameCode) {
        return res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to join game - could not determine game code',
            error: { status: 500 }
        });
    }
    
    // Redirect to the game lobby
    res.redirect(`/quiz/lobby/${gameCode}`);
};

// Game lobby
exports.gameLobby = async (req, res) => {
    const gameCode = req.params.code;
    
    // Check if the game exists
    if (!global.activeGames || !global.activeGames[gameCode]) {
        return res.status(404).render('error', {
            title: 'Game Not Found',
            message: 'The game could not be found. Please check your game code.',
            error: { status: 404 }
        });
    }
    
    const game = global.activeGames[gameCode];
    
    // Get player name from query params or session
    let playerName = req.query.playerName;
    
    // If no player name in query, check if user is authenticated
    if (!playerName && req.user) {
        playerName = req.user.username;
    }
    
    // If still no player name, redirect to join page
    if (!playerName) {
        return res.redirect('/quiz/join');
    }
    
    // Render the lobby view
    res.render('lobby', {
        title: 'Game Lobby',
        gameCode,
        quiz: game.quiz,
        players: game.players,
        playerName: playerName
    });
};

// Add this new handler for player game view
exports.playGameAsPlayer = async (req, res) => {
    const gameCode = req.params.code;
    
    // Check if the game exists
    if (!global.activeGames || !global.activeGames[gameCode]) {
        return res.status(404).render('error', {
            title: 'Game Not Found',
            message: 'The game could not be found. Please check your game code.',
            error: { status: 404 }
        });
    }
    
    const game = global.activeGames[gameCode];
    
    // Get player info
    let playerName = '';
    let playerId = '';
    
    if (req.user) {
        // Authenticated user
        playerName = req.user.username;
        playerId = req.user.userId;
    } else if (req.query.playerName) {
        // Player name from query parameter
        playerName = req.query.playerName;
    } else if (req.cookies.playerName) {
        // Player name from cookie
        playerName = req.cookies.playerName;
    } else {
        // No player identified, redirect to join page
        return res.redirect('/quiz/join');
    }
    
    // Set player name cookie for potential reconnection
    res.cookie('playerName', playerName, { maxAge: 3600000 }); // 1 hour
    
    // Find player in game or the game is now in playing state
    const playerExists = game.players.some(p => 
        (req.user && p.id === req.user.userId) || 
        (!req.user && p.name === playerName)
    );
    
    if (!playerExists && game.status !== 'waiting') {
        // If game already started and player not found, show error
        return res.status(403).render('error', {
            title: 'Cannot Join Game',
            message: 'This game has already started. You cannot join at this point.',
            error: { status: 403 }
        });
    }
    
    // If player doesn't exist but game is in waiting, redirect to lobby
    if (!playerExists && game.status === 'waiting') {
        return res.redirect(`/quiz/lobby/${gameCode}?playerName=${encodeURIComponent(playerName)}`);
    }
    
    // Render player view
    res.render('player', {
        title: 'Playing Quiz',
        gameCode,
        playerName,
        gameTitle: game.quiz.title
    });
};

// Get public games for join page
exports.getPublicGames = async (req, res) => {
    try {
        // Only return active games
        const activeGames = [];
        
        if (global.activeGames) {
            for (const [gameCode, game] of Object.entries(global.activeGames)) {
                // Only include games with valid game codes (4 characters)
                if (gameCode.length === 4 && game.status === 'waiting') {
                    activeGames.push({
                        gameCode: gameCode,
                        title: game.quiz.title,
                        hostName: game.hostId.split('_')[1] || 'Host',
                        players: game.players,
                        createdAt: game.startTime
                    });
                }
            }
        }
        
        return res.json({ games: activeGames });
    } catch (error) {
        console.error('Error fetching public games:', error);
        return res.status(500).json({ error: 'Failed to fetch games' });
    }
};

// Add this new method to export quizzes as CSV
exports.exportQuizzes = async (req, res) => {
    try {
        const quizzes = await Quiz.find()
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 });
        
        // Create CSV header
        let csv = 'ID,Title,Creator,Questions,Visibility,Created Date\n';
        
        // Add quiz data
        quizzes.forEach(quiz => {
            const createdDate = new Date(quiz.createdAt).toISOString().split('T')[0];
            const creatorName = quiz.createdBy ? quiz.createdBy.username : 'Unknown';
            const questionCount = quiz.questions ? quiz.questions.length : 0;
            const visibility = quiz.isPublic ? 'Public' : 'Private';
            const title = quiz.title.replace(/,/g, ' '); // Replace commas to avoid CSV issues
            
            csv += `${quiz._id},${title},${creatorName},${questionCount},${visibility},${createdDate}\n`;
        });
        
        // Set response headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=quizzes-export.csv');
        
        // Send the CSV data
        res.status(200).send(csv);
    } catch (error) {
        console.error('Error exporting quizzes:', error);
        res.status(500).json({ error: 'Failed to export quizzes' });
    }
};

// Helper function to generate a random 4-letter game code
function generateGameCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes O and I to avoid confusion
    let code = '';
    
    // Generate a random 4-letter code
    for (let i = 0; i < 4; i++) {
        code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    // Check if code already exists (avoid collisions)
    if (global.activeGames && global.activeGames[code]) {
        return generateGameCode(); // Try again
    }
    
    return code;
}
