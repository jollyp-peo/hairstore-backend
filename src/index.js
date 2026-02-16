import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/authRoute.js';
import paymentRoute from './routes/paymentRoute.js'
import profileRoute from './routes/profileRoute.js'
import addressRoutes from "./routes/addressRoutes.js";
import { rawBodyBuffer } from './middleware/rawBody.js';
import { globalLimiter } from "./middleware/rateLimiter.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
// import ngrok from '@ngrok/ngrok';


const app = express();

// Trust proxy for production deployment
app.set('trust proxy', 1);


// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));


// app.use(helmet());
const allowedOrigins = [
  'http://localhost:5173',
  'https://hairbyurban.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ["GET","POST","PUT","DELETE"],
}));

// Raw body parser for webhooks (must come before express.json())
app.use('/webhook', express.raw({ type: 'application/json' }));

// raw body for webhook; then JSON parser
app.use(express.json({ verify: rawBodyBuffer }));


// app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use(globalLimiter);


// Ngrok setup for local testing (uncomment if needed)
// (async () => {
//   const url = await ngrok.connect(PORT);
//   console.log(`Ngrok URL: ${url}`);
// })();


// routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoute);
app.use('/api/profile', profileRoute);
app.use("/api/addresses", addressRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);



// global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Server error' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Paystack Payment Service',
    timestamp: new Date().toISOString()
  });
}); 

//for debugg
app.use((req, res, next) => {
  console.log(`Incoming: ${req.method} ${req.originalUrl}`);
  console.log("Headers:", req.headers.authorization);
  next();
});

// CSP Middleware
app.use((req, res, next) => {
  const csp = `
    default-src 'self';
    script-src 'self' https://sandbox.sdk.monnify.com https://sdk.monnify.com https://code.jquery.com https://cdn.jsdelivr.net;
    connect-src 'self' https://sandbox.sdk.monnify.com https://sandbox.monnify.com https://api.monnify.com https://sdk.monnify.com;
    style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://sandbox.sdk.monnify.com https://sdk.monnify.com;
    img-src 'self' data: https://sandbox.sdk.monnify.com https://sdk.monnify.com;
    font-src 'self' https://cdn.jsdelivr.net;
  `.replace(/\n/g, ''); // remove newlines

  res.setHeader("Content-Security-Policy", csp);
  next();
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
});

