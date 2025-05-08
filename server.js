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

    // When a host creates a game room
    socket.on('create-game', ({ gameCode, hostId, quiz }) => {
        console.log('Host created game:', gameCode);
        
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
        
        if (gameRooms[gameCode].status !== 'waiting') {
            socket.emit('join-failed', { message: 'Game already in progress' });
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
        
        // Send confirmation to player
        socket.emit('join-success', { 
            gameCode,
            playerName,
            quizTitle: gameRooms[gameCode].quiz.title
        });
        
        // Send all players to the new player
        socket.emit('player-list-update', { players: gameRooms[gameCode].players });
    });

    // When host starts the game
    socket.on('start-game', ({ gameCode }) => {
        if (!gameRooms[gameCode]) return;
        
        gameRooms[gameCode].status = 'playing';
        
        // Notify all players in the room
        io.to(gameCode).emit('game-started');
    });

    // When host advances to next question
    socket.on('next-question', ({ gameCode, questionIndex }) => {
        if (!gameRooms[gameCode]) return;
        
        gameRooms[gameCode].currentQuestion = questionIndex;
        
        // Notify all players in the room
        io.to(gameCode).emit('question-started', { questionIndex });
    });

    // When player submits an answer
    socket.on('submit-answer', ({ gameCode, questionIndex, answerIndex, playerId }) => {
        if (!gameRooms[gameCode]) return;
        
        const player = gameRooms[gameCode].players.find(p => p.id === playerId || p.socketId === socket.id);
        if (!player) return;
        
        // Record the answer
        const question = gameRooms[gameCode].quiz.questions[questionIndex];
        const isCorrect = question.options[answerIndex].isCorrect;
        const answerTime = Date.now(); // This would normally be used for time-based scoring
        
        // Save the answer
        player.answers[questionIndex] = {
            answerIndex,
            isCorrect,
            time: answerTime
        };
        
        // Update score if correct
        if (isCorrect) {
            player.score += 1000; // Basic scoring, could be more complex
        }
        
        // Notify host about the answer
        socket.to(gameRooms[gameCode].hostSocket).emit('player-answered', {
            playerId: player.id,
            playerName: player.name,
            questionIndex,
            answerIndex,
            isCorrect
        });
    });

    // When a player disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Check if this socket was a host or player in any game
        Object.keys(gameRooms).forEach(gameCode => {
            // If host disconnected, notify players and end game
            if (gameRooms[gameCode].hostSocket === socket.id) {
                io.to(gameCode).emit('host-disconnected');
                delete gameRooms[gameCode];
            } 
            // If player disconnected, notify host
            else {
                const playerIndex = gameRooms[gameCode].players.findIndex(p => p.socketId === socket.id);
                if (playerIndex !== -1) {
                    const player = gameRooms[gameCode].players[playerIndex];
                    gameRooms[gameCode].players.splice(playerIndex, 1);
                    socket.to(gameRooms[gameCode].hostSocket).emit('player-left', { 
                        playerId: player.id,
                        playerName: player.name
                    });
                }
            }
        });
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

// Start the server
const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
});