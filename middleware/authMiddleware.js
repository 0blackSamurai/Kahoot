const jwt = require('jsonwebtoken');

// Add authentication status to res.locals for views
exports.setAuthStatus = (req, res, next) => {
    const token = req.cookies.user;
    
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Store user info in request and response locals
            req.user = decoded;
            res.locals.isAuthenticated = true;
            res.locals.userRole = decoded.role;
            res.locals.isAdmin = decoded.role === 'Admin';
            res.locals.isSupportStaff = ['1st Line', '2nd Line'].includes(decoded.role);
            res.locals.username = decoded.username;
            res.locals.userId = decoded.userId;
            
            // Log decoded token info
            if (process.env.NODE_ENV !== 'production') {
                console.log('Decoded token:', decoded);
            }
        } catch (err) {
            // Token verification failed
            console.error('Token verification failed:', err.message);
            res.locals.isAuthenticated = false;
            res.locals.userRole = null;
            res.locals.isAdmin = false;
            res.locals.isSupportStaff = false;
            res.locals.username = null;
            res.locals.userId = null;
            res.clearCookie('user');
        }
    } else {
        // No token found
        res.locals.isAuthenticated = false;
        res.locals.userRole = null;
        res.locals.isAdmin = false;
        res.locals.isSupportStaff = false;
        res.locals.username = null;
        res.locals.userId = null;
    }
    
    next();
};

// Middleware for protected routes
exports.isAuthenticated = (req, res, next) => {
    const token = req.cookies.user;
    
    if (!token) {
        return res.redirect('/login');
    }
    
    try {
        // Verify token and add user info to request
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        // Clear invalid cookie and redirect to login
        console.error('Authentication error:', err.message);
        res.clearCookie('user');
        res.redirect('/login');
    }
};

// Middleware for admin-only routes
exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).render('error', {
            title: 'Access Denied', 
            message: 'You need administrator privileges to access this page',
            error: { status: 403 }
        });
    }
};