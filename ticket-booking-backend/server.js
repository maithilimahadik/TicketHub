const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const socketIo = require('socket.io');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000",
        credentials: true
    }
});

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'ticket_booking_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let db;

async function initDatabase() {
    try {
        db = await mysql.createPool(dbConfig);
        console.log('Connected to MySQL database');
        
        // Test the connection
        const connection = await db.getConnection();
        await connection.ping();
        connection.release();
        console.log('Database connection verified');
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
}

const JWT_SECRET = 'uEuIArHtbuCoPBcUyOpwIRx9Wj0SL0kI97RwCYLzvcw';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-event', (eventId) => {
        socket.join(`event-${eventId}`);
        console.log(`Socket ${socket.id} joined event ${eventId}`);
    });
    
    socket.on('leave-event', (eventId) => {
        socket.leave(`event-${eventId}`);
        console.log(`Socket ${socket.id} left event ${eventId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Registration endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, fullName, phone } = req.body;
        
        // Validate required fields
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const [existingUser] = await db.execute(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email, username]
        );
        
        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.execute(
            'INSERT INTO users (username, email, password, full_name, phone) VALUES (?, ?, ?, ?, ?)',
            [username, email, hashedPassword, fullName, phone || null]
        );
        
        res.status(201).json({ 
            message: 'User registered successfully', 
            userId: result.insertId 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        const [users] = await db.execute(
            'SELECT id, username, email, password, full_name FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get all events
app.get('/api/events', async (req, res) => {
    try {
        const [events] = await db.execute(`
            SELECT id, title, description, venue, event_date, total_seats,
                   available_seats, price, image_url, category, created_at
            FROM events 
            WHERE event_date > NOW()
            ORDER BY event_date ASC
        `);
        
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// Get single event
app.get('/api/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [events] = await db.execute(`
            SELECT id, title, description, venue, event_date, total_seats,
                   available_seats, price, image_url, category, created_at
            FROM events 
            WHERE id = ?
        `, [id]);
        
        if (events.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        res.json(events[0]);
    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

// Get seats for an event
app.get('/api/events/:id/seats', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [seats] = await db.execute(`
            SELECT id, seat_number, row_name, section, is_booked
            FROM seats 
            WHERE event_id = ?
            ORDER BY row_name, CAST(seat_number AS UNSIGNED)
        `, [id]);
        
        res.json(seats);
    } catch (error) {
        console.error('Error fetching seats:', error);
        res.status(500).json({ error: 'Failed to fetch seats' });
    }
});

// Helper function to get available seats count
async function getAvailableSeatsCount(eventId) {
    try {
        const [result] = await db.execute(
            'SELECT available_seats FROM events WHERE id = ?',
            [eventId]
        );
        return result[0]?.available_seats || 0;
    } catch (error) {
        console.error('Error getting available seats count:', error);
        return 0;
    }
}

// Enhanced QR Code generation function
async function generateQRCode(bookingData) {
    try {
        const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
        
        const qrData = {
            bookingId: bookingData.bookingId,
            bookingReference: bookingData.bookingReference,
            eventTitle: bookingData.eventTitle,
            venue: bookingData.venue,
            eventDate: bookingData.eventDate,
            seatNumbers: bookingData.seatNumbers,
            totalAmount: bookingData.totalAmount,
            userName: bookingData.userName,
            verificationUrl: `${baseUrl}/api/verify-ticket/${bookingData.bookingReference}`,
            generatedAt: new Date().toISOString()
        };
        
        const qrDataString = JSON.stringify(qrData);
        
        const qrCodeDataURL = await QRCode.toDataURL(qrDataString, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            errorCorrectionLevel: 'M'
        });
        
        console.log('QR Code generated successfully for booking:', bookingData.bookingReference);
        return qrCodeDataURL;
    } catch (error) {
        console.error('QR Code generation error:', error);
        throw new Error('Failed to generate QR code: ' + error.message);
    }
}

// Book seats endpoint - FIXED VERSION
app.post('/api/book', authenticateToken, async (req, res) => {
    let connection;
    
    try {
        const { eventId, seatIds, totalAmount } = req.body;
        const userId = req.user.id;
        
        // Validate input
        if (!eventId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0 || !totalAmount) {
            return res.status(400).json({ error: 'Invalid booking data' });
        }
        
        console.log('Booking request:', { eventId, seatIds, totalAmount, userId });
        
        connection = await db.getConnection();
        await connection.beginTransaction();
        
        // Check if seats are still available with row lock
        const placeholders = seatIds.map(() => '?').join(',');
        const [seatCheck] = await connection.execute(`
            SELECT id, is_booked, seat_number, row_name, section 
            FROM seats 
            WHERE id IN (${placeholders}) AND event_id = ?
            FOR UPDATE
        `, [...seatIds, eventId]);
        
        if (seatCheck.length !== seatIds.length) {
            await connection.rollback();
            return res.status(400).json({ error: 'Some seats not found' });
        }
        
        const bookedSeats = seatCheck.filter(seat => seat.is_booked);
        if (bookedSeats.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                error: 'Some seats are no longer available',
                bookedSeats: bookedSeats.map(s => `${s.row_name}${s.seat_number}`)
            });
        }
        
        // Get event and user details
        const [eventDetails] = await connection.execute(`
            SELECT title, venue, event_date, available_seats FROM events WHERE id = ?
        `, [eventId]);
        
        if (eventDetails.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Event not found' });
        }
        
        if (eventDetails[0].available_seats < seatIds.length) {
            await connection.rollback();
            return res.status(400).json({ error: 'Not enough seats available' });
        }
        
        const [userDetails] = await connection.execute(`
            SELECT username, full_name FROM users WHERE id = ?
        `, [userId]);
        
        if (userDetails.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Generate booking reference
        const bookingReference = 'BK' + Date.now() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        
        // Create booking record
        const [bookingResult] = await connection.execute(`
            INSERT INTO bookings (user_id, event_id, seats_booked, total_amount, booking_reference, booking_status, created_at)
            VALUES (?, ?, ?, ?, ?, 'confirmed', NOW())
        `, [userId, eventId, seatIds.length, totalAmount, bookingReference]);
        
        const bookingId = bookingResult.insertId;
        console.log('Booking created with ID:', bookingId);
        
        // Update seats as booked
        await connection.execute(`
            UPDATE seats 
            SET is_booked = TRUE, booking_id = ?
            WHERE id IN (${placeholders})
        `, [bookingId, ...seatIds]);
        
        // Update available seats count
        await connection.execute(`
            UPDATE events 
            SET available_seats = available_seats - ?
            WHERE id = ?
        `, [seatIds.length, eventId]);
        
        // Prepare seat numbers for QR code
        const seatNumbers = seatCheck.map(seat => `${seat.row_name}${seat.seat_number}`);
        
        // Generate QR code
        const qrCodeData = {
            bookingId,
            bookingReference,
            eventTitle: eventDetails[0].title,
            venue: eventDetails[0].venue,
            eventDate: eventDetails[0].event_date,
            seatNumbers,
            totalAmount,
            userName: userDetails[0].full_name || userDetails[0].username
        };
        
        let qrCode = null;
        try {
            qrCode = await generateQRCode(qrCodeData);
            
            // Update booking with QR code
            await connection.execute(`
                UPDATE bookings SET qr_code = ? WHERE id = ?
            `, [qrCode, bookingId]);
        } catch (qrError) {
            console.error('QR Code generation failed:', qrError);
            // Don't fail the booking if QR code generation fails
        }
        
        // Commit transaction
        await connection.commit();
        console.log('Booking transaction committed successfully');
        
        // Emit socket event for real-time updates
        try {
            const newAvailableSeats = await getAvailableSeatsCount(eventId);
            io.to(`event-${eventId}`).emit('seats-updated', {
                eventId,
                bookedSeats: seatIds,
                availableSeats: newAvailableSeats
            });
        } catch (socketError) {
            console.error('Socket emission error:', socketError);
        }
        
        res.json({
            message: 'Booking successful',
            bookingId,
            bookingReference,
            seatIds,
            seatNumbers,
            qrCode: qrCode || null
        });
        
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }
        console.error('Booking error:', error);
        res.status(500).json({ 
            error: 'Booking failed', 
            details: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Get user bookings
app.get('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [bookings] = await db.execute(`
            SELECT b.id, b.booking_reference, b.seats_booked, b.total_amount,
                   b.booking_status, b.created_at, b.qr_code,
                   e.title as event_title, e.venue, e.event_date
            FROM bookings b
            JOIN events e ON b.event_id = e.id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC
        `, [userId]);
        
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// Verify ticket endpoint
app.get('/api/verify-ticket/:reference', async (req, res) => {
    try {
        const { reference } = req.params;
        
        const [bookings] = await db.execute(`
            SELECT b.*, e.title as event_title, e.venue, e.event_date,
                   u.full_name, u.username
            FROM bookings b
            JOIN events e ON b.event_id = e.id
            JOIN users u ON b.user_id = u.id
            WHERE b.booking_reference = ?
        `, [reference]);
        
        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        const booking = bookings[0];
        
        // Get seat details
        const [seats] = await db.execute(`
            SELECT seat_number, row_name FROM seats WHERE booking_id = ?
        `, [booking.id]);
        
        res.json({
            valid: true,
            booking: {
                ...booking,
                seats: seats.map(seat => `${seat.row_name}${seat.seat_number}`)
            }
        });
    } catch (error) {
        console.error('Ticket verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    try {
        await initDatabase();
        
        const PORT = process.env.PORT || 5001;
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Health check available at http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: 'rzp_test_VugK5o41eLYIDe',
  key_secret: '8zNvV1flRMYpkwNtbXsovLZC'
});

app.post('/api/create-order', authenticateToken, async (req, res) => {
  const { amount } = req.body;

  try {
    const options = {
      amount: amount * 100, // amount in paise
      currency: 'INR',
      receipt: 'receipt_order_' + Date.now()
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error('Razorpay order error:', err);
    res.status(500).json({ error: 'Failed to create Razorpay order' });
  }
});


startServer();

module.exports = app;

