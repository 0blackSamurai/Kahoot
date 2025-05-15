const User = require('../models/userModel');
const Quiz = require('../models/quizModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    const { username, epost, passord, confirmpassord } = req.body;

    try {
        // Validate input
        if (!username || !epost || !passord || !confirmpassord) {
            return res.status(400).send('All fields are required');
        }

        if (passord !== confirmpassord) {
            return res.status(400).send('Passwords do not match');
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ epost }, { username }] 
        });
        
        if (existingUser) {
            return res.status(400).send('User with this email or username already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(passord, parseInt(process.env.SALTROUNDS));

        // Create new user
        const newUser = new User({
            username,
            epost,
            passord: hashedPassword,
            role: 'User' // Default role
        });

        await newUser.save();
        
        // Auto-login after registration
        const token = jwt.sign(
            { userId: newUser._id, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '48h' }
        );
        
        res.cookie('user', token, { httpOnly: true });
        res.redirect('/profile');
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).send('Error registering user');
    }
};

exports.login = async (req, res) => {
    const { epost, passord } = req.body;
    
    try {
        // Find user by email
        const user = await User.findOne({ epost });

        if (!user) {
            return res.render('login', { 
                title: 'Login',
                error: 'User not found. Please check your email or register.' 
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(passord, user.passord);

        if (!isMatch) {
            return res.render('login', { 
                title: 'Login',
                error: 'Invalid password. Please try again.' 
            });
        }

        // Create token with correct userId property and include email
        const token = jwt.sign(
            { 
                userId: user._id.toString(), // Ensure userId is a string
                role: user.role,
                username: user.username,
                email: user.epost // Include email in the token
            },
            process.env.JWT_SECRET,
            { expiresIn: '48h' }
        );
        
        // Log token debug info (remove in production)
        console.log('Generated token with user ID:', user._id.toString());
        
        // Set HTTP-only cookie
        res.cookie('user', token, { 
            httpOnly: true,
            maxAge: 48 * 60 * 60 * 1000 // 48 hours
        });
        
        // Redirect based on role
        if (user.role === 'Admin') {
            return res.redirect('/dashboard');
        } else {
            return res.redirect('/profile');
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', {
            title: 'Login',
            error: 'An error occurred during login. Please try again.'
        });
    }
};

exports.logout = (req, res) => {
    try {
      res.clearCookie('user');
      res.redirect('/login');
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).send('An error occurred during logout');
    }
};

exports.renderRegisterPage = (req, res) => {
    // If already logged in, redirect to profile
    if (res.locals.isAuthenticated) {
        return res.redirect('/profile');
    }
    res.render('register', { title: 'Create Account' });
};

exports.renderLoginPage = (req, res) => {
    // If already logged in, redirect to profile
    if (res.locals.isAuthenticated) {
        return res.redirect('/profile');
    }
    res.render('login', { title: 'Login' });
};

exports.renderForgotPasswordPage = (req, res) => {
    // If already logged in, redirect to profile
    if (res.locals.isAuthenticated) {
        return res.redirect('/profile');
    }
    res.render('forgot-password', { title: 'Forgot Password' });
};

exports.forgotPassword = async (req, res) => {
    const { epost } = req.body;
    
    try {
        const user = await User.findOne({ epost });
        
        if (!user) {
            return res.status(404).json({
                success: false, 
                message: 'No account with that email address exists.'
            });
        }
        
        // In a real application, we would generate a token and send an email
        // For this demo, we'll just return a success message
        return res.status(200).json({
            success: true,
            message: 'If an account with that email exists, you will receive password reset instructions.'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.'
        });
    }
};

exports.renderDashboardPage = async (req, res) => {
    const quizzes = await Quiz.find({ createdBy: req.user.userId })
            .sort({ updatedAt: -1 });
    res.render('dashboard', { title: 'Admin Dashboard',
        quizzes: quizzes 
    });
};

exports.renderProfilePage = async (req, res) => {
    try {
        // Find user profile info
        const user = await User.findById(req.user.userId).select('-passord');
        
        if (!user) {
            return res.status(404).render('error', {
                title: 'User Not Found',
                message: 'User profile could not be found',
                error: { status: 404 }
            });
        }
        
        // Get user's quizzes for profile page
        const userQuizzes = await Quiz.find({ createdBy: req.user.userId })
            .sort({ updatedAt: -1 })
            .limit(5); // Just get the most recent ones for the profile page
        
        res.render('profile', {
            title: 'Your Profile',
            user,
            userQuizzes
        });
    } catch (error) {
        console.error('Error rendering profile page:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load profile page',
            error: { status: 500 }
        });
    }
};