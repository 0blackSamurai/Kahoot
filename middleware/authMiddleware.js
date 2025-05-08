const jwt = require('jsonwebtoken');

function isAuthenticated(req, res, next) {
    const token = req.cookies.user; // Ensure the cookie name matches
    
    console.log('Checking authentication token...');
    
    if (!token) {
        console.log("No token found, redirecting to login");
        return res.redirect("/login?redirectTo=" + req.originalUrl);
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Authenticated user:", decoded);
        
        // Store user info in request object
        req.user = {
            userId: decoded.userId,
            role: decoded.role
        };
        
        next();
    } catch (err) {
        console.log("JWT Error:", err);
        res.clearCookie('user');
        return res.redirect("/login?redirectTo=" + req.originalUrl);
    }
}

// Auth middleware for admins
exports.isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (req.user.role !== 'Admin') {
        console.log('Access denied: User role =', req.user.role);
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
};

function isAdmin(req, res, next) {
    console.log("User Role:", req.user ? req.user.role : "No user"); // Debugging log
    if (req.user && req.user.role === 'Admin') { // Ensure req.user exists and role is Admin
        return next();
    }
    return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'This action requires administrator privileges',
        error: { status: 403 }
    });
}

function isSupportStaff(req, res, next) {
    if (req.user && (req.user.role === '1st Line' || req.user.role === '2nd Line')) {
        return next();
    }
    return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'This action requires support staff privileges',
        error: { status: 403 }
    });
}

function setAuthStatus(req, res, next) {
    const token = req.cookies.user; // Ensure the cookie name matches
    
    // Initialize all required variables to default values
    res.locals.isAuthenticated = false;
    res.locals.isAdmin = false;
    res.locals.isSupportStaff = false;
    res.locals.userRole = null;
    res.locals.userId = null;
    res.locals.username = null;
    res.locals.email = null;

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Set both req.user and res.locals for consistency
            req.user = {
                userId: decoded.userId,
                role: decoded.role,
                username: decoded.username,
                email: decoded.email
            };
            
            res.locals.isAuthenticated = true;
            res.locals.isAdmin = decoded.role === 'Admin';
            res.locals.isSupportStaff = decoded.role === '1st Line' || decoded.role === '2nd Line';
            res.locals.userRole = decoded.role;
            res.locals.userId = decoded.userId;
            res.locals.username = decoded.username;
            res.locals.email = decoded.email;
            
            console.log('Auth status set: User ID:', decoded.userId, 'Role:', decoded.role);
        } catch (err) {
            console.error("Token verification error in setAuthStatus:", err);
            // Clear invalid cookie
            res.clearCookie('user');
        }
    } else {
        console.log('No authentication token found');
    }
    next();
}

module.exports = { isAuthenticated, isAdmin, isSupportStaff, setAuthStatus };