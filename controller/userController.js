const User = require('../models/userModel');
const Quiz = require('../models/quizModel'); // Fixed missing closing parenthesis

// Dashboard data aggregation
exports.getDashboardData = async (req, res) => {
    try {
        // Count total users
        const userCount = await User.countDocuments();
        
        // Count users by role
        const usersByRole = await User.aggregate([
            {
                $group: {
                    _id: "$role",
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Count total quizzes
        const quizCount = await Quiz.countDocuments();
        
        // Get public vs private quiz counts
        const quizzesByVisibility = await Quiz.aggregate([
            {
                $group: {
                    _id: "$isPublic",
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get top categories (if category field exists)
        let quizzesByCategory = [];
        if (await Quiz.findOne({ category: { $exists: true } })) {
            quizzesByCategory = await Quiz.aggregate([
                {
                    $group: {
                        _id: "$category",
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]);
        }
        
        // Get recent users
        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('username epost role createdAt');
        
        // Get recent quizzes
        const recentQuizzes = await Quiz.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('createdBy', 'username')
            .select('title isPublic questions createdAt createdBy');
        
        return res.json({
            userCount,
            usersByRole,
            quizCount,
            quizzesByVisibility,
            quizzesByCategory,
            recentUsers,
            recentQuizzes
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
};

// Get all users (for admin)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find()
            .sort({ createdAt: -1 })
            .select('-passord'); // Exclude password field
        
        return res.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
};

// Update user role (for admin)
exports.updateUserRole = async (req, res) => {
    try {
        const { userId, role } = req.body;
        
        if (!userId || !role) {
            return res.status(400).json({ error: 'User ID and role are required' });
        }
        
        // Check if role is valid
        const validRoles = ['Admin', 'User', '1st Line', '2nd Line'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        
        // Prevent admins from changing their own role
        if (userId === req.user.userId) {
            return res.status(403).json({ error: 'You cannot change your own role' });
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { role },
            { new: true }
        ).select('-passord');
        
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`User ${userId} role updated to ${role} by admin ${req.user.userId}`);
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
};

// Get support staff (1st Line and 2nd Line)
exports.getSupportStaff = async (req, res) => {
    try {
        const supportStaff = await User.find({
            role: { $in: ['1st Line', '2nd Line'] }
        }).select('-passord');
        
        res.status(200).json(supportStaff);
    } catch (error) {
        console.error('Error fetching support staff:', error);
        res.status(500).json({ error: 'Failed to fetch support staff' });
    }
};

// Render user management page (admin only)
exports.renderUserManagement = async (req, res) => {
    try {
        const users = await User.find().select('-passord');
        res.render('userManagement', { 
            title: 'User Management',
            users 
        });
    } catch (error) {
        console.error('Error rendering user management:', error);
        res.status(500).send('Server error');
    }
};

// Delete user (admin only)
exports.deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        
        console.log('Delete user request received for ID:', userId);
        console.log('Request method:', req.method);
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        // Check if the user exists
        const user = await User.findById(userId);
        
        if (!user) {
            console.log('User not found with ID:', userId);
            // Handle different response formats based on request type
            if (req.xhr || req.headers.accept.includes('application/json')) {
                return res.status(404).json({ error: 'User not found' });
            } else {
                return res.status(404).render('error', {
                    title: 'User Not Found',
                    message: 'The requested user could not be found',
                    error: { status: 404 }
                });
            }
        }
        
        // Prevent admins from deleting themselves
        if (userId === req.user.userId) {
            const errorMsg = 'You cannot delete your own account';
            if (req.xhr || req.headers.accept.includes('application/json')) {
                return res.status(400).json({ error: errorMsg });
            } else {
                return res.status(400).render('error', {
                    title: 'Error',
                    message: errorMsg,
                    error: { status: 400 }
                });
            }
        }
        
        // Delete the user
        await User.findByIdAndDelete(userId);
        console.log('User deleted successfully:', userId);
        
        // Handle different response formats based on request type
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(200).json({ message: 'User deleted successfully' });
        } else {
            // For GET requests (browser navigation), redirect back to the dashboard
            return res.redirect('/dashboard#users');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        if (req.xhr || req.headers.accept.includes('application/json')) {
            return res.status(500).json({ error: 'Failed to delete user' });
        } else {
            return res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to delete user: ' + error.message,
                error: { status: 500 }
            });
        }
    }
};