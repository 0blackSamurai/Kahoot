require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is not set!');
  process.exit(1);
}

if (!process.env.DB_URL) {
  console.error('❌ DB_URL environment variable is not set!');
  process.exit(1);
} else if (!process.env.DB_URL.startsWith('mongodb://') && !process.env.DB_URL.startsWith('mongodb+srv://')) {
  console.error('❌ Invalid DB_URL format. It must start with "mongodb://" or "mongodb+srv://"');
  console.error('Current value:', process.env.DB_URL);
  process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const http = require('http');
const socketIo = require('socket.io');

const { setAuthStatus } = require('./middleware/authMiddleware');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const quizRoutes = require('./routes/quizRoutes'); 

// Initialize app and server for Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Create a logging system for multiplayer events
function logGameEvent(gameCode, event, data) {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[GAME:${gameCode}] ${event}`, data ? JSON.stringify(data) : '');
    }
}

// Configure multer
const upload = multer();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Add this middleware to log auth cookies on each request
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    const authCookie = req.cookies.user;
    console.log('Auth cookie present:', !!authCookie);
  }
  next();
});

app.use(upload.none()); // Parse multipart/form-data
app.use(setAuthStatus); // This MUST come before routes to properly set variables

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection - removed deprecated options
console.log('⏳ Connecting to MongoDB...');
mongoose.connect(process.env.DB_URL, {
  // Removed deprecated options
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 5000
})
  .then(() => {
    console.log("✅ Database connection successful");
  })
  .catch((err) => {
    console.error("❌ Database connection error:", err);
    console.error("Please check your DB_URL in .env file and ensure MongoDB is running.");
  });

// Socket.io game management
const gameRooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Add error handler for each socket
    socket.on('error', (error) => {
        console.error('Socket error:', error, 'for socket ID:', socket.id);
    });

    // When a host creates a game room
    socket.on('create-game', ({ gameCode, hostId, quiz }) => {
        console.log('Created game:', gameCode);
        
        // Create game room
        gameRooms[gameCode] = {
            hostSocket: socket.id,
            hostId: hostId,
            quiz: quiz,
            players: [],
            status: 'waiting',
            currentQuestion: 0
        };
        
        // Join the socket to this game's room
        socket.join(gameCode);
    });

    // When a player tries to join a game
    socket.on('join-game', ({ gameCode, playerName, playerId }) => {
        console.log('Player attempting to join:', playerName, 'to game:', gameCode);
        
        if (!gameRooms[gameCode]) {
            socket.emit('join-failed', { message: 'Game not found' });
            return;
        }
        
        // Check game status - allow joining even if game is playing
        if (gameRooms[gameCode].status === 'finished') {
            socket.emit('join-failed', { message: 'Game has ended' });
            return;
        }
        
        // Check if player already exists (by id or socket id)
        const existingPlayer = gameRooms[gameCode].players.find(p => 
            (playerId && p.id === playerId) || p.socketId === socket.id
        );
        
        if (existingPlayer) {
            // Update socket id if player reconnects
            existingPlayer.socketId = socket.id;
            socket.join(gameCode);
            
            // Send join success with game state info
            socket.emit('join-success', {
                gameCode,
                playerName: existingPlayer.name,
                quizTitle: gameRooms[gameCode].quiz.title,
                gameInProgress: gameRooms[gameCode].status === 'playing',
                currentQuestionIndex: gameRooms[gameCode].currentQuestion
            });
            
            // If game is already playing, send the current question info immediately
            if (gameRooms[gameCode].status === 'playing') {
                socket.emit('question-started', { 
                    questionIndex: gameRooms[gameCode].currentQuestion 
                });
            }
            
            // Send current players to everyone
            io.to(gameCode).emit('player-list-update', { 
                players: gameRooms[gameCode].players 
            });
            
            return;
        }
        
        // Add player to game
        const player = {
            id: playerId || socket.id,
            name: playerName,
            socketId: socket.id,
            score: 0,
            answers: []
        };
        
        gameRooms[gameCode].players.push(player);
        
        // Join the socket to this game's room
        socket.join(gameCode);
        
        // Notify host about new player
        socket.to(gameRooms[gameCode].hostSocket).emit('player-joined', player);
        
        // Send confirmation to player with game state info
        socket.emit('join-success', {
            gameCode,
            playerName,
            quizTitle: gameRooms[gameCode].quiz.title,
            gameInProgress: gameRooms[gameCode].status === 'playing',
            currentQuestionIndex: gameRooms[gameCode].currentQuestion
        });
        
        // If game is already playing, send the current question info immediately
        if (gameRooms[gameCode].status === 'playing') {
            socket.emit('question-started', { 
                questionIndex: gameRooms[gameCode].currentQuestion 
            });
        }
        
        // Send all players to everyone
        io.to(gameCode).emit('player-list-update', { 
            players: gameRooms[gameCode].players 
        });
    });

    // When host starts the game
    socket.on('start-game', ({ gameCode }) => {
        console.log('Starting game:', gameCode);
        if (!gameRooms[gameCode]) return;
        
        gameRooms[gameCode].status = 'playing';
        
        // Notify all players in the room that game has started
        io.to(gameCode).emit('game-started');
        
        // After a short delay, send the first question
        // This ensures clients have time to process the game-started event
        setTimeout(() => {
            io.to(gameCode).emit('question-started', { questionIndex: 0 });
        }, 500);
    });

    // Add new handler for getting question data
    socket.on('get-question', ({ gameCode, questionIndex }) => {
        if (!gameRooms[gameCode]) return;
        
        const quiz = gameRooms[gameCode].quiz;
        if (!quiz || !quiz.questions || questionIndex >= quiz.questions.length) return;
        
        const question = quiz.questions[questionIndex];
        
        // Log the question type for debugging
        console.log(`Sending question data. Type: ${question.questionType || 'multiple-choice'}`);
        
        // Send question data without revealing answers
        socket.emit('question-data', {
            questionText: question.questionText,
            questionType: question.questionType || 'multiple-choice', // Ensure question type is properly set
            timeLimit: question.timeLimit || 30,
            totalQuestions: quiz.questions.length,
            options: question.options ? question.options.map(opt => ({
                text: opt.text
                // Remove isCorrect to avoid cheating
            })) : [],
            // Include empty textAnswer structure for text questions to ensure client knows it's a text question
            textAnswer: question.questionType === 'text-answer' ? {
                placeholder: "Skriv inn svaret her..."
            } : undefined
        });
    });

    // Add handler for getting current game state
    socket.on('get-game-state', ({ gameCode }) => {
        if (!gameRooms[gameCode]) {
            socket.emit('game-not-found');
            return;
        }
        
        const game = gameRooms[gameCode];
        
        // Send current game state
        socket.emit('game-state', {
            status: game.status,
            currentQuestion: game.currentQuestion,
            totalQuestions: game.quiz.questions.length
        });
    });

    // Handle player submitted answers for all question types
    socket.on('submit-answer', ({ gameCode, questionIndex, answerIndex, textAnswer, answer, playerId, timeLeft }) => {
        if (!gameRooms[gameCode]) return;
        
        const game = gameRooms[gameCode];
        const question = game.quiz.questions[questionIndex];
        if (!question) return;
        
        // Log incoming answer data for debugging
        console.log(`Received answer from player. QuestionType: ${question.questionType}, TextAnswer: ${textAnswer !== undefined ? 'present' : 'absent'}`);
        
        // Find the player
        const playerIndex = game.players.findIndex(p => 
            (playerId && p.id === playerId) || p.socketId === socket.id
        );
        
        if (playerIndex === -1) return;
        
        const player = game.players[playerIndex];
        
        // Determine if answer is correct based on question type
        let isCorrect = false;
        let points = 0;
        
        // Calculate base points for time remaining (max 1000)
        const basePoints = Math.floor(1000 * (timeLeft / (question.timeLimit || 30)));
        
        const questionType = question.questionType || 'multiple-choice';
        
        switch (questionType) {
            case 'multiple-choice':
                // Multiple choice handling
                if (answerIndex >= 0 && question.options && answerIndex < question.options.length) {
                    isCorrect = question.options[answerIndex].isCorrect === true;
                }
                break;
                
            case 'text-answer':
                // Improved text answer processing
                console.log(`Processing text answer: "${textAnswer}" from player ${player.name}`);
                
                if (textAnswer !== undefined && question.textAnswer) {
                    const userAnswer = String(textAnswer).trim();
                    const correctAnswer = question.textAnswer.correctAnswer;
                    const caseSensitive = question.textAnswer.caseSensitive || false;
                    const exactMatch = question.textAnswer.exactMatch || false;
                    const alternativeAnswers = question.textAnswer.alternativeAnswers || [];
                    
                    console.log(`Text answer settings: caseSensitive=${caseSensitive}, exactMatch=${exactMatch}`);
                    console.log(`Correct answer: "${correctAnswer}"`);
                    
                    // Check if answer is correct based on settings
                    if (caseSensitive) {
                        if (exactMatch) {
                            isCorrect = userAnswer === correctAnswer || 
                                      alternativeAnswers.includes(userAnswer);
                        } else {
                            isCorrect = correctAnswer.includes(userAnswer) || 
                                      alternativeAnswers.some(alt => alt.includes(userAnswer));
                        }
                    } else {
                        const lowerUserAnswer = userAnswer.toLowerCase();
                        const lowerCorrectAnswer = correctAnswer.toLowerCase();
                        const lowerAlternatives = alternativeAnswers.map(alt => alt.toLowerCase());
                        
                        if (exactMatch) {
                            isCorrect = lowerUserAnswer === lowerCorrectAnswer || 
                                      lowerAlternatives.includes(lowerUserAnswer);
                        } else {
                            isCorrect = lowerCorrectAnswer.includes(lowerUserAnswer) || 
                                      lowerAlternatives.some(alt => alt.includes(lowerUserAnswer));
                        }
                    }
                    
                    console.log(`Text answer result: "${textAnswer}" is ${isCorrect ? 'CORRECT' : 'WRONG'}`);
                }
                break;
                
            case 'true-false':
                // True-false handling
                const boolAnswer = (answer === true || answer === 'true');
                isCorrect = boolAnswer === question.isTrueCorrect;
                break;
        }
        
        // Award points if correct
        if (isCorrect) {
            points = basePoints;
            
            // Apply point multiplier if defined in question
            if (question.points === 'double') {
                points *= 2;
            } else if (question.points === 'no-points') {
                points = 0;
            }
            
            // Add points to player score
            player.score += points;
        }
        
        // Store answer for this question
        player.answers[questionIndex] = {
            questionType,
            answerIndex: questionType === 'multiple-choice' ? answerIndex : undefined,
            textAnswer: questionType === 'text-answer' ? textAnswer : undefined,
            answer: questionType === 'true-false' ? answer : undefined,
            isCorrect,
            points
        };
        
        // Notify host about the answer
        io.to(game.hostSocket).emit('player-answered', {
            playerId: player.id,
            playerName: player.name,
            questionIndex,
            questionType,
            answerIndex: questionType === 'multiple-choice' ? answerIndex : undefined,
            textAnswer: questionType === 'text-answer' ? textAnswer : undefined,
            answer: questionType === 'true-false' ? answer : undefined,
            isCorrect
        });
        
        // Send result back to player
        socket.emit('answer-result', {
            isCorrect,
            points,
            correctAnswerIndex: questionType === 'multiple-choice' ? answerIndex : undefined,
            correctAnswer: questionType === 'text-answer' && !isCorrect ? question.textAnswer?.correctAnswer : undefined
        });
    });

    // Add handler for player requesting results
    socket.on('request-results', ({ gameCode, playerId }) => {
        if (!gameRooms[gameCode]) return;
        
        const game = gameRooms[gameCode];
        
        // Create a copy of players with rankings
        const rankedPlayers = [...game.players];
        
        // Sort by score and assign ranks
        rankedPlayers.sort((a, b) => b.score - a.score);
        rankedPlayers.forEach((player, index) => {
            player.rank = index + 1;
        });
        
        // Send results directly to the requesting player
        socket.emit('send-results', { players: rankedPlayers });
        
        console.log(`Sending game results to player ${playerId || socket.id}`);
    });
    
    // Add handler for player ready for next question
    socket.on('player-ready-for-next', ({ gameCode, questionIndex, playerId }) => {
        if (!gameRooms[gameCode]) return;
        
        // Notify host that a player is ready for the next question
        const hostSocket = gameRooms[gameCode].hostSocket;
        io.to(hostSocket).emit('player-ready-for-next', { playerId, questionIndex });
    });

    // Add enhanced end-question event handler
    socket.on('end-question', ({ gameCode }) => {
        if (!gameRooms[gameCode]) return;
        
        // Notify all players
        io.to(gameCode).emit('question-ended');
    });

    // Add reveal-answer event handler
    socket.on('reveal-answer', ({ gameCode, questionType, correctAnswer }) => {
        if (!gameRooms[gameCode]) return;
        
        // Forward the reveal to all players
        io.to(gameCode).emit('reveal-answer', {
            questionType,
            correctAnswer
        });
    });

    // Enhanced game-over event
    socket.on('game-over', ({ gameCode, players }) => {
        if (!gameRooms[gameCode]) return;
        
        // Mark game as finished
        gameRooms[gameCode].status = 'finished';
        
        // Send results to all players with full player data
        io.to(gameCode).emit('game-over', { players });
    });

    // Add handler for player updating their score
    socket.on('update-player-score', ({ gameCode, playerId, score, questionIndex }) => {
        if (!gameRooms[gameCode]) return;
        
        const game = gameRooms[gameCode];
        
        // Find the player
        const playerIndex = game.players.findIndex(p => 
            (playerId && p.id === playerId) || p.socketId === socket.id
        );
        
        if (playerIndex === -1) return;
        
        // Update player's score
        game.players[playerIndex].score = score;
        
        // Notify host about the score update
        io.to(game.hostSocket).emit('player-score-updated', {
            playerId: game.players[playerIndex].id,
            playerName: game.players[playerIndex].name,
            score: score,
            questionIndex
        });
        
        console.log(`Updated player ${game.players[playerIndex].name} score to ${score}`);
    });

    // When host advances to next question
    socket.on('host-advance-question', ({ gameCode }) => {
        if (!gameRooms[gameCode]) return;
        
        // Update game state
        gameRooms[gameCode].currentQuestion++;
        
        // Notify players that the host is advancing to next question
        io.to(gameCode).emit('host-advance-question');
    });
});

// Add this middleware to make io accessible in routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes - ensure correct order to avoid conflicts
app.use('/', authRoutes);       // Auth routes first for login, register, etc.
app.use('/user', userRoutes);   // User routes with prefix
app.use('/quiz', quizRoutes);   // Quiz routes with prefix

// Add route for checking available routes - useful for debugging
app.get('/debug/routes', (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
        const routes = [];
        app._router.stack.forEach(function(middleware){
            if(middleware.route) { // routes registered directly on the app
                routes.push({
                    path: middleware.route.path,
                    methods: Object.keys(middleware.route.methods).filter(m => middleware.route.methods[m])
                });
            } else if(middleware.name === 'router') { // router middleware
                middleware.handle.stack.forEach(function(handler){
                    const route = handler.route;
                    if(route) {
                        routes.push({
                            path: route.path,
                            methods: Object.keys(route.methods).filter(m => route.methods[m])
                        });
                    }
                });
            }
        });
        return res.json({ routes });
    }
          
    return res.status(404).send('Not found in production mode');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  // If JSON is requested or it's an API route, return JSON error
  if (req.path.startsWith('/api') || 
     (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ error: 'Server error', message: err.message });
  }

  // Otherwise render error page with appropriate locals
  res.status(500).render('error', { 
    title: 'Error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {},
    isAuthenticated: res.locals.isAuthenticated || false,
    isAdmin: res.locals.isAdmin || false,
    isSupportStaff: res.locals.isSupportStaff || false,
    userRole: res.locals.userRole || null
  });
});

// 404 handler with improved formatting
app.use((req, res) => {
    const path = req.path;
    console.log(`404 Not Found: ${req.method} ${path}`);
    // If JSON is requested or it's an API route, return JSON error
    if (path.startsWith('/api') || 
       (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(404).json({ 
            error: 'Not Found', 
            message: `The requested URL ${path} was not found on this server.` 
        });
    }
    
    // Otherwise render error page
    res.status(404).render('error', { 
        title: 'Not Found',
        message: `Page not found: ${path}`, 
        error: {
            status: 404,
            stack: process.env.NODE_ENV === 'development' ? 
                `The route ${path} is not defined in your application.` : ''
        },
        isAuthenticated: res.locals.isAuthenticated || false,
        isAdmin: res.locals.isAdmin || false,
        isSupportStaff: res.locals.isSupportStaff || false,
        userRole: res.locals.userRole || null
    });
});

// Start the server with port fallback mechanism
const PORT = process.env.PORT || 3005;
const MAX_PORT_ATTEMPTS = 10;

function startServer(port, attempt = 1) {
    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
            console.warn(`⚠️ Port ${port} is in use, trying ${port + 1}...`);
            server.close();
            startServer(port + 1, attempt + 1);
        } else {
            console.error(`❌ Failed to start server after ${attempt} attempts:`, err);
            process.exit(1);
        }
    });

    server.listen(port, () => {
        console.log(`🚀 Server started on port ${port}`);
    });
}

// Try to start server on the preferred port, with fallback
startServer(PORT);