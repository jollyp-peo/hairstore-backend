import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoute.js';
import paymentRoute from './routes/paymentRoute.js'
import { rawBodyBuffer } from './middleware/rawBody.js';
import ngrok from '@ngrok/ngrok';


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
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Raw body parser for webhooks (must come before express.json())
app.use('/webhook', express.raw({ type: 'application/json' }));

// raw body for webhook; then JSON parser
app.use(express.json({ verify: rawBodyBuffer }));


// app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoute);


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


const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Start ngrok tunnel
  if (process.env.NODE_ENV !== 'production') {
    const listener = await ngrok.connect({
      addr: PORT,
      authtoken: process.env.NGROK_AUTHTOKEN,
    });
    console.log(`Ngrok tunnel: ${listener.url()}`);

    // Optional: update webhook URL env var dynamically
    console.log(`Webhook URL: ${listener.url()}/api/payments/webhook`);
  }
});

