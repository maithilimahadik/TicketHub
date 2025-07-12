import React, { useState, useEffect, useContext, createContext } from 'react';
import { Calendar, MapPin, Users, CreditCard, User, LogOut, Ticket, Download, X  } from 'lucide-react';
import io from 'socket.io-client';

const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          id: payload.id,
          username: payload.username,
          email: payload.email
        });
      } catch (error) {
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, [token]);

  const login = (userData, authToken) => {
    localStorage.setItem('token', authToken);
    setToken(authToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};


const api = {
  baseUrl: 'http://localhost:5001/api',
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  },

  register: (userData) => api.request('/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  login: (credentials) => api.request('/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),

  getEvents: () => api.request('/events'),
  getEvent: (id) => api.request(`/events/${id}`),
  getSeats: (eventId) => api.request(`/events/${eventId}/seats`),

  book: (bookingData) => api.request('/book', {
    method: 'POST',
    body: JSON.stringify(bookingData),
  }),

  getBookings: () => api.request('/bookings'),
};

let socket;

const getSocket = () => {
  if (!socket) {
    socket = io('http://localhost:5001');
  }
  return socket;
};


const QRCodeModal = ({ isOpen, onClose, bookingData }) => {
  if (!isOpen) return null;

  const downloadQRCode = () => {
    // Create a download link for the QR code
    const link = document.createElement('a');
    link.href = bookingData.qrCode;
    link.download = `ticket-${bookingData.bookingReference}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">🎫 Your Ticket</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-center">
          <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-xl p-6 mb-4">
            <img
              src={bookingData.qrCode}
              alt="Ticket QR Code"
              className="w-48 h-48 mx-auto mb-4 bg-white p-2 rounded-lg shadow-sm"
            />
            <div className="text-sm text-gray-600 space-y-1">
              <p className="font-semibold text-purple-800">{bookingData.eventTitle}</p>
              <p>Booking Ref: {bookingData.bookingReference}</p>
              <p>Seats: {bookingData.seatsBooked}</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={downloadQRCode}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold flex items-center justify-center space-x-2"
            >
              <Download className="h-5 w-5" />
              <span>Download Ticket</span>
            </button>
            
            <button
              onClick={onClose}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
            >
              Close
            </button>
          </div>

          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              📱 Present this QR code at the venue for entry. Save or screenshot for offline access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Header = () => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Ticket className="h-8 w-8" />
            <h1 className="text-2xl font-bold">TicketHub</h1>
          </div>
          {user && (
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>Welcome, {user.username}</span>
              </span>
              <button
                onClick={logout}
                className="flex items-center space-x-2 bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const AuthForm = ({ isLogin, onToggle }) => {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const response = await api.login({
          email: formData.email,
          password: formData.password
        });
        login(response.user, response.token);
      } else {
        await api.register(formData);
        alert('Registration successful! Please log in.');
        onToggle();
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Ticket className="h-12 w-12 text-purple-600 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-800">
            {isLogin ? 'Welcome Back' : 'Join TicketHub'}
          </h2>
          <p className="text-gray-600 mt-2">
            {isLogin ? 'Sign in to book amazing events' : 'Create your account to get started'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-gray-600">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              onClick={onToggle}
              className="text-purple-600 hover:text-purple-700 font-semibold ml-2"
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

// const EventCard = ({ event, onSelect }) => {
//   const formatDate = (dateString) => {
//     return new Date(dateString).toLocaleDateString('en-US', {
//       weekday: 'long',
//       year: 'numeric',
//       month: 'long',
//       day: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit'
//     });
//   };

//   return (
//     <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      
//       {/* Image header */}
//       <div className="h-48 w-full overflow-hidden relative">
//         <img
//           src={event.image_url || 'https://via.placeholder.com/400x200?text=No+Image'}
//           alt={event.title}
//           className="w-full h-full object-cover"
//         />
//         <div className="absolute inset-0 bg-black bg-opacity-20"></div>
//         <div className="absolute bottom-4 left-4">
//           <span className="bg-white bg-opacity-90 text-gray-800 px-3 py-1 rounded-full text-sm font-semibold">
//             {event.category}
//           </span>
//         </div>
//       </div>

//       <div className="p-6">
//         <h3 className="text-xl font-bold text-gray-800 mb-2">{event.title}</h3>
//         <p className="text-gray-600 mb-4 line-clamp-2">{event.description}</p>
//         <div className="space-y-2 mb-4">
//           <div className="flex items-center text-gray-600">
//             <Calendar className="h-4 w-4 mr-2" />
//             <span className="text-sm">{formatDate(event.event_date)}</span>
//           </div>
//           <div className="flex items-center text-gray-600">
//             <MapPin className="h-4 w-4 mr-2" />
//             <span className="text-sm">{event.venue}</span>
//           </div>
//           <div className="flex items-center text-gray-600">
//             <Users className="h-4 w-4 mr-2" />
//             <span className="text-sm">{event.available_seats} seats available</span>
//           </div>
//         </div>
//         <div className="flex items-center justify-between">
//           <div className="text-2xl font-bold text-purple-600">
//             Rs.{event.price}
//           </div>
//           <button
//             onClick={() => onSelect(event)}
//             className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold"
//           >
//             Book Now
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// const EventCard = ({ event, onSelect }) => {
//   const formatDate = (dateString) => {
//     return new Date(dateString).toLocaleDateString('en-US', {
//       weekday: 'long',
//       year: 'numeric',
//       month: 'long',
//       day: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit'
//     });
//   };

//   return (
//     <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
//       <div className="h-48 bg-gradient-to-r from-purple-400 to-blue-400 relative">
//         <div className="absolute inset-0 bg-black bg-opacity-20"></div>
//         <div className="absolute bottom-4 left-4">
//           <span className="bg-white bg-opacity-90 text-gray-800 px-3 py-1 rounded-full text-sm font-semibold">
//             {event.category}
//           </span>
//         </div>
//       </div>
      
//       <div className="p-6">
//         <h3 className="text-xl font-bold text-gray-800 mb-2">{event.title}</h3>
//         <p className="text-gray-600 mb-4 line-clamp-2">{event.description}</p>
        
//         <div className="space-y-2 mb-4">
//           <div className="flex items-center text-gray-600">
//             <Calendar className="h-4 w-4 mr-2" />
//             <span className="text-sm">{formatDate(event.event_date)}</span>
//           </div>
//           <div className="flex items-center text-gray-600">
//             <MapPin className="h-4 w-4 mr-2" />
//             <span className="text-sm">{event.venue}</span>
//           </div>
//           <div className="flex items-center text-gray-600">
//             <Users className="h-4 w-4 mr-2" />
//             <span className="text-sm">{event.available_seats} seats available</span>
//           </div>
//         </div>
        
//         <div className="flex items-center justify-between">
//           <div className="text-2xl font-bold text-purple-600">
//             Rs.{event.price}
//           </div>
//           <button
//             onClick={() => onSelect(event)}
//             className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold"
//           >
//             Book Now
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

const EventCard = ({ event, onSelect }) => {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Smart theme-based image selection
  const getThemeMatchedImage = () => {
    if (event.image_url) {
      return event.image_url;
    }
    
    // Define theme-specific image collections
    const themeImages = {
      // Music & Concert Events
      'concert': [
        'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&h=400&fit=crop', // Concert stage lights
        'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=400&fit=crop', // Live performance
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=400&fit=crop', // DJ mixing
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop', // Rock concert
        'https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=800&h=400&fit=crop'  // Music festival crowd
      ],
      
      // Theater & Drama
      'theater': [
        'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800&h=400&fit=crop', // Theater stage
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=400&fit=crop', // Broadway style
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=400&fit=crop', // Opera house
        'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=800&h=400&fit=crop'  // Theater masks
      ],
      
      // Sports Events
      'sports': [
        'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&h=400&fit=crop', // Stadium
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=400&fit=crop', // Soccer field
        'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=400&fit=crop', // Basketball
        'https://images.unsplash.com/photo-1578662996442-48f103fc96?w=800&h=400&fit=crop'   // Tennis court
      ],
      
      // Comedy Shows
      'comedy': [
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=400&fit=crop', // Comedy club
        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=400&fit=crop', // Stand-up stage
        'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&h=400&fit=crop'  // Microphone
      ],
      
      // Business & Conference
      'conference': [
        'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&h=400&fit=crop', // Conference hall
        'https://images.unsplash.com/photo-1549451371-64aa98a6f660?w=800&h=400&fit=crop', // Tech presentation
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=400&fit=crop', // Business meeting
        'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=400&fit=crop'  // Networking
      ],
      
      // Art & Exhibition
      'art': [
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=400&fit=crop', // Art gallery
        'https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=800&h=400&fit=crop', // Modern art
        'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=800&h=400&fit=crop'  // Art exhibition
      ],
      
      // Food & Culinary
      'food': [
        'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=400&fit=crop', // Food festival
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=400&fit=crop', // Fine dining
        'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=800&h=400&fit=crop'  // Cooking event
      ],
      
      // Technology & Gaming
      'technology': [
        'https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=800&h=400&fit=crop', // Gaming setup
        'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=400&fit=crop', // Tech conference
        'https://images.unsplash.com/photo-1504384764586-bb4cdc1707b0?w=800&h=400&fit=crop'  // VR/AR event
      ],
      
      // Fashion & Beauty
      'fashion': [
        'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&h=400&fit=crop', // Fashion show
        'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&h=400&fit=crop', // Runway
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=400&fit=crop'  // Fashion event
      ],
      
      // Health & Wellness
      'wellness': [
        'https://images.unsplash.com/photo-1517263904808-5dc91e3e7044?w=800&h=400&fit=crop', // Yoga/fitness
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop', // Wellness retreat
        'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800&h=400&fit=crop'   // Meditation
      ],
      
      // Outdoor & Adventure
      'outdoor': [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop', // Mountain adventure
        'https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=800&h=400&fit=crop', // Beach event
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=400&fit=crop'  // Forest gathering
      ]
    };
    
    // Function to detect theme from event data
    const detectEventTheme = () => {
      const title = event.title.toLowerCase();
      const description = (event.description || '').toLowerCase();
      const category = (event.category || '').toLowerCase();
      const venue = (event.venue || '').toLowerCase();
      
      const searchText = `${title} ${description} ${category} ${venue}`;
      
      // Music/Concert keywords
      if (searchText.match(/concert|music|band|singer|dj|festival|rock|jazz|classical|pop|hip hop|electronic|acoustic|live music/)) {
        return 'concert';
      }
      
      // Theater keywords
      if (searchText.match(/theater|theatre|play|drama|musical|opera|performance|stage|broadway|acting/)) {
        return 'theater';
      }
      
      // Sports keywords
      if (searchText.match(/sports|football|soccer|basketball|tennis|cricket|baseball|hockey|stadium|match|game|tournament/)) {
        return 'sports';
      }
      
      // Comedy keywords
      if (searchText.match(/comedy|comedian|stand.up|humor|funny|joke|laugh/)) {
        return 'comedy';
      }
      
      // Business/Conference keywords
      if (searchText.match(/conference|seminar|workshop|business|corporate|meeting|summit|symposium|networking/)) {
        return 'conference';
      }
      
      // Art keywords
      if (searchText.match(/art|gallery|exhibition|painting|sculpture|artist|creative|design|museum/)) {
        return 'art';
      }
      
      // Food keywords
      if (searchText.match(/food|restaurant|culinary|cooking|chef|cuisine|dining|taste|feast|wine|beer/)) {
        return 'food';
      }
      
      // Technology keywords
      if (searchText.match(/tech|technology|gaming|ai|software|coding|startup|digital|innovation|gadget/)) {
        return 'technology';
      }
      
      // Fashion keywords
      if (searchText.match(/fashion|style|beauty|runway|model|designer|clothing|boutique/)) {
        return 'fashion';
      }
      
      // Wellness keywords
      if (searchText.match(/yoga|fitness|wellness|health|meditation|spa|workout|gym|mental health/)) {
        return 'wellness';
      }
      
      // Outdoor keywords
      if (searchText.match(/outdoor|adventure|hiking|camping|nature|park|beach|mountain|forest|garden/)) {
        return 'outdoor';
      }
      
      // Default fallback based on category
      const categoryMap = {
        'concert': 'concert',
        'music': 'concert',
        'theater': 'theater',
        'sports': 'sports',
        'comedy': 'comedy',
        'conference': 'conference',
        'business': 'conference',
        'art': 'art',
        'food': 'food',
        'tech': 'technology',
        'fashion': 'fashion',
        'wellness': 'wellness',
        'outdoor': 'outdoor'
      };
      
      return categoryMap[category] || 'conference'; // Default theme
    };
    
    const theme = detectEventTheme();
    const imageArray = themeImages[theme] || themeImages['conference'];
    
    // Use event ID to consistently select same image for same event
    const imageIndex = event.id % imageArray.length;
    return imageArray[imageIndex];
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      <div className="h-48 relative overflow-hidden">
        <img
          src={getThemeMatchedImage()}
          alt={event.title}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          onError={(e) => {
            // Fallback to gradient if image fails to load
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        {/* Fallback gradient background (hidden by default) */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-purple-400 to-blue-400 items-center justify-center text-white font-bold text-lg"
          style={{ display: 'none' }}
        >
          {event.category}
        </div>
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
        <div className="absolute bottom-4 left-4">
          <span className="bg-white bg-opacity-90 text-gray-800 px-3 py-1 rounded-full text-sm font-semibold">
            {event.category}
          </span>
        </div>
        {/* Theme indicator (optional) */}
        <div className="absolute top-2 right-2">
          <span className="bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            🎯
          </span>
        </div>
      </div>
      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-2">{event.title}</h3>
        <p className="text-gray-600 mb-4 line-clamp-2">{event.description}</p>
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            <span className="text-sm">{formatDate(event.event_date)}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <MapPin className="h-4 w-4 mr-2" />
            <span className="text-sm">{event.venue}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <Users className="h-4 w-4 mr-2" />
            <span className="text-sm">{event.available_seats} seats available</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-purple-600">
            Rs.{event.price}
          </div>
          <button
            onClick={() => onSelect(event)}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold"
          >
            Book Now
          </button>
        </div>
      </div>
    </div>
  );
};
// const EventCard = ({ event, onSelect }) => {
//   const getImageByCategory = (category) => {
//     const categoryImages = {
//       'Music': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f',
//       'Technology': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
//       'Food & Drink': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0',
//       'Art & Culture': 'https://images.unsplash.com/photo-1578662996442-48f60103fc96',
//       'Sports': 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211',
//       'Theatre': 'https://unsplash.com/photos/red-curtain-stage-m3th3rIQ9-w',
//       'Education': 'https://unsplash.com/photos/education-concept-old-books-and-eye-glasses-on-blackboard-background-Sk9JF1KDz6M',
//       'Spiritual': 'https://unsplash.com/photos/a-person-doing-yoga-in-the-middle-of-a-body-of-water-SaAvBPYGJyw',
//       'default': 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30'
//     };
    
//     return categoryImages[category] || categoryImages.default;
//   };

//   const formatDate = (dateString) => {
//     return new Date(dateString).toLocaleDateString('en-US', {
//       weekday: 'long',
//       year: 'numeric',
//       month: 'long',
//       day: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit'
//     });
//   };

//   return (
//     <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
//       <div className="h-48 relative">
//         <img 
//           src={event.image || getImageByCategory(event.category)} 
//           alt={event.title}
//           className="w-full h-full object-cover"
//           onError={(e) => {
//             e.target.style.display = 'none';
//             e.target.nextSibling.style.display = 'block';
//           }}
//         />
//         <div 
//           className="absolute inset-0 bg-gradient-to-r from-purple-400 to-blue-400" 
//           style={{ display: 'none' }}
//         ></div>
//         <div className="absolute inset-0 bg-black bg-opacity-20"></div>
//         <div className="absolute bottom-4 left-4">
//           <span className="bg-white bg-opacity-90 text-gray-800 px-3 py-1 rounded-full text-sm font-semibold">
//             {event.category}
//           </span>
//         </div>
//       </div>
      
//       {/* Rest of your component remains the same */}
//       <div className="p-6">
//         <h3 className="text-xl font-bold text-gray-800 mb-2">{event.title}</h3>
//         <p className="text-gray-600 mb-4 line-clamp-2">{event.description}</p>
        
//         <div className="space-y-2 mb-4">
//           <div className="flex items-center text-gray-600">
//             <Calendar className="h-4 w-4 mr-2" />
//             <span className="text-sm">{formatDate(event.event_date)}</span>
//           </div>
//           <div className="flex items-center text-gray-600">
//             <MapPin className="h-4 w-4 mr-2" />
//             <span className="text-sm">{event.venue}</span>
//           </div>
//           <div className="flex items-center text-gray-600">
//             <Users className="h-4 w-4 mr-2" />
//             <span className="text-sm">{event.available_seats} seats available</span>
//           </div>
//         </div>
        
//         <div className="flex items-center justify-between">
//           <div className="text-2xl font-bold text-purple-600">
//             Rs.{event.price}
//           </div>
//           <button
//             onClick={() => onSelect(event)}
//             className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold"
//           >
//             Book Now
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

const SeatSelection = ({ event, onBack, onBook }) => {
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);

  useEffect(() => {
    loadSeats();
    
    const socket = getSocket();
    socket.emit('join-event', event.id);
    
    socket.on('seats-updated', (data) => {
      if (data.eventId === event.id) {
        setSeats(prev => prev.map(seat => ({
          ...seat,
          is_booked: data.bookedSeats.includes(seat.id) ? true : seat.is_booked
        })));
      }
    });

    return () => {
      socket.emit('leave-event', event.id);
      socket.off('seats-updated');
    };
  }, [event.id]);

  const loadSeats = async () => {
    try {
      const seatsData = await api.getSeats(event.id);
      setSeats(seatsData);
    } catch (error) {
      console.error('Failed to load seats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeatClick = (seat) => {
    if (seat.is_booked) return;
    
    setSelectedSeats(prev => {
      const isSelected = prev.includes(seat.id);
      if (isSelected) {
        return prev.filter(id => id !== seat.id);
      } else {
        return [...prev, seat.id];
      }
    });
  };

  // const handleBooking = async () => {
  //   if (selectedSeats.length === 0) return;
    
  //   try {
  //     const totalAmount = selectedSeats.length * event.price;
  //     const response = await api.book({
  //       eventId: event.id,
  //       seatIds: selectedSeats,
  //       totalAmount
  //     });
      
  //     // Store booking result and show QR modal
  //     setBookingResult({
  //       ...response,
  //       eventTitle: event.title,
  //       seatsBooked: selectedSeats.length
  //     });
  //     setShowQRModal(true);
      
  //   } catch (error) {
  //     alert('Booking failed: ' + error.message);
  //   }
  // };

  const handleBooking = async () => {
    if (selectedSeats.length === 0) return;
  
    const totalAmount = selectedSeats.length * event.price;
  
    try {
      // 1. Create Razorpay order
      const orderData = await api.request('/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount: totalAmount }),
      });
  
      // 2. Open Razorpay checkout
      const options = {
        key: 'rzp_test_VugK5o41eLYIDe', // Razorpay key_id
        amount: orderData.amount,
        currency: 'INR',
        name: 'TicketHub',
        description: 'Event Ticket Booking',
        order_id: orderData.id,
        handler: async function (response) {
          // 3. Proceed to book seats only if payment is successful
          const bookingResponse = await api.book({
            eventId: event.id,
            seatIds: selectedSeats,
            totalAmount,
            razorpayPaymentId: response.razorpay_payment_id,
          });
  
          setBookingResult({
            ...bookingResponse,
            eventTitle: event.title,
            seatsBooked: selectedSeats.length
          });
          setShowQRModal(true);
        },
        theme: {
          color: '#6366f1'
        }
      };
  
      const rzp = new window.Razorpay(options);
      rzp.open();
  
    } catch (error) {
      alert('Payment failed: ' + error.message);
    }
  };
  

  const handleQRModalClose = () => {
    setShowQRModal(false);
    onBook(); // Navigate to booking history
  };

  const getSeatColor = (seat) => {
    if (seat.is_booked) return 'bg-red-500';
    if (selectedSeats.includes(seat.id)) return 'bg-green-500';
    return 'bg-gray-300 hover:bg-blue-400';
  };

  const groupedSeats = seats.reduce((acc, seat) => {
    if (!acc[seat.row_name]) {
      acc[seat.row_name] = [];
    }
    acc[seat.row_name].push(seat);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{event.title}</h2>
          <p className="text-gray-600">Select your seats</p>
        </div>
        <button
          onClick={onBack}
          className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
        >
          Back to Events
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-center space-x-6 mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gray-300 rounded"></div>
            <span className="text-sm">Available</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-sm">Selected</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-sm">Booked</span>
          </div>
        </div>
        
        <div className="bg-gray-200 text-center py-2 rounded-lg mb-4">
          <span className="text-gray-700 font-semibold">STAGE</span>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto mb-6">
        {Object.entries(groupedSeats)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([rowName, rowSeats]) => (
            <div key={rowName} className="flex items-center justify-center mb-2">
              <div className="w-8 text-center font-semibold text-gray-600">
                {rowName}
              </div>
              <div className="flex space-x-1 mx-4">
                {rowSeats
                  .sort((a, b) => parseInt(a.seat_number) - parseInt(b.seat_number))
                  .map(seat => (
                    <button
                      key={seat.id}
                      onClick={() => handleSeatClick(seat)}
                      disabled={seat.is_booked}
                      className={`w-8 h-8 rounded text-xs font-semibold text-white transition-colors ${getSeatColor(seat)} ${
                        seat.is_booked ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                      title={`${rowName}${seat.seat_number} - ${seat.section}`}
                    >
                      {seat.seat_number}
                    </button>
                  ))}
              </div>
            </div>
          ))}
      </div>

      {selectedSeats.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-purple-800 mb-2">Booking Summary</h3>
          <div className="flex justify-between items-center">
            <span className="text-purple-700">
              {selectedSeats.length} seat(s) selected
            </span>
            <span className="text-xl font-bold text-purple-800">
              Rs.{(selectedSeats.length * event.price).toFixed(2)}
            </span>
          </div>
        </div>
      )}
      
      <QRCodeModal
        isOpen={showQRModal}
        onClose={handleQRModalClose}
        bookingData={bookingResult}
      />

      <div className="flex justify-end">
        <button
          onClick={handleBooking}
          disabled={selectedSeats.length === 0}
          className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-3 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          <CreditCard className="h-5 w-5" />
          <span>Book {selectedSeats.length} Seat(s)</span>
        </button>
      </div>
    </div>
  );
};

const BookingHistory = ({ onBack }) => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);


  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    try {
      const bookingsData = await api.getBookings();
      setBookings(bookingsData);
    } catch (error) {
      console.error('Failed to load bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const showTicketQR = (booking) => {
    if (booking.qr_code) {
      setSelectedBooking({
        qrCode: booking.qr_code,
        bookingReference: booking.booking_reference,
        eventTitle: booking.event_title,
        seatsBooked: booking.seats_booked
      });
      setShowQRModal(true);
    }
  };


  


  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

return (
  <>
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">My Bookings</h2>
        <button
          onClick={onBack}
          className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
        >
          Back to Events
        </button>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-12">
          <Ticket className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">No bookings yet</h3>
          <p className="text-gray-500">Start booking amazing events!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map(booking => (
            <div key={booking.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-800">{booking.event_title}</h3>
                  <p className="text-gray-600">{booking.venue}</p>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(booking.event_date)}
                    </span>
                    <span className="flex items-center">
                      <Users className="h-4 w-4 mr-1" />
                      {booking.seats_booked} seat(s)
                    </span>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-xl font-bold text-purple-600">
                    Rs.{booking.total_amount}
                  </div>
                  <div className="text-sm text-gray-500">
                    Ref: {booking.booking_reference}
                  </div>
                  <div className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                    booking.booking_status === 'confirmed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {booking.booking_status.toUpperCase()}
                  </div>
                  {booking.qr_code && (
                    <div className="mt-2">
                      <button
                        onClick={() => showTicketQR(booking)}
                        className="bg-purple-600 text-white px-3 py-1 rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center space-x-1"
                      >
                        <Ticket className="h-3 w-3" />
                        <span>Show Ticket</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* QR Code Modal */}
    <QRCodeModal
      isOpen={showQRModal}
      onClose={() => setShowQRModal(false)}
      bookingData={selectedBooking}
    />
  </>
);
};

const Dashboard = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [currentView, setCurrentView] = useState('events'); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const eventsData = await api.getEvents();
      setEvents(eventsData);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventSelect = (event) => {
    setSelectedEvent(event);
    setCurrentView('booking');
  };

  const handleBackToEvents = () => {
    setSelectedEvent(null);
    setCurrentView('events');
    loadEvents(); 
  };

  const handleBookingComplete = () => {
    setCurrentView('history');
    setSelectedEvent(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {currentView === 'events' && (
          <>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-800">Upcoming Events</h2>
                <p className="text-gray-600 mt-2">Discover and book amazing events</p>
              </div>
              <button
                onClick={() => setCurrentView('history')}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
              >
                <Ticket className="h-5 w-5" />
                <span>My Bookings</span>
              </button>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-600 mb-2">No events available</h3>
                <p className="text-gray-500">Check back later for new events!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {events.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onSelect={handleEventSelect}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {currentView === 'booking' && selectedEvent && (
          <SeatSelection
            event={selectedEvent}
            onBack={handleBackToEvents}
            onBook={handleBookingComplete}
          />
        )}

        {currentView === 'history' && (
          <BookingHistory onBack={handleBackToEvents} />
        )}
      </div>
    </div>
  );
};


const App = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { user } = useAuth();

  if (!user) {
    return (
      <AuthForm
        isLogin={isLogin}
        onToggle={() => setIsLogin(!isLogin)}
      />
    );
  }

  return <Dashboard />;
};

const TicketBookingApp = () => {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
};

export default TicketBookingApp;