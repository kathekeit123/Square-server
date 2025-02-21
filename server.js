require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(cors());

const SQUARE_API_URL = 'https://connect.squareup.com/v2/online-checkout/payment-links';

// Create transporter only when needed
const createTransporter = () => {
    return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // upgrade later with STARTTLS
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });
};

app.post("/create-checkout-session", async (req, res) => {
    try {
        const { price, email, description, fullBookingData } = req.body;

        // Validate required data
        if (!price || !email || !description || !fullBookingData) {
            throw new Error('Missing required booking data');
        }

        // Try to send email
        try {
            const transporter = createTransporter();
            const emailHTML = `
                <h2>New Booking Details</h2>
                <p><strong>Date:</strong> ${fullBookingData.date}</p>
                <p><strong>Time:</strong> ${fullBookingData.time}</p>
                <p><strong>Vehicle:</strong> ${fullBookingData.vehicle}</p>
                <p><strong>Pickup:</strong> ${fullBookingData.pickup}</p>
                <p><strong>Dropoff:</strong> ${fullBookingData.dropoff}</p>
                <p><strong>Stops:</strong> ${fullBookingData.stops?.join(', ') || 'None'}</p>
                <p><strong>Passengers:</strong> ${fullBookingData.passengers}</p>
                <p><strong>Kids:</strong> ${fullBookingData.kids}</p>
                <p><strong>Luggage:</strong> ${fullBookingData.luggage}</p>
                <p><strong>Phone:</strong> ${fullBookingData.phone}</p>
                <p><strong>Email:</strong> ${fullBookingData.email}</p>
                <p><strong>Price:</strong> $${fullBookingData.price}</p>
                ${fullBookingData.locationType === 'airport' ? `
                    <h3>Airport Details</h3>
                    <p><strong>Airline:</strong> ${fullBookingData.airline}</p>
                    <p><strong>Flight Number:</strong> ${fullBookingData.flightNumber}</p>
                    <p><strong>Arrival Time:</strong> ${fullBookingData.arrivalTime}</p>
                ` : ''}
            `;

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: 'katherinetamara123@gmail.com',
                subject: `New Booking - ${fullBookingData.date}`,
                html: emailHTML
            });
            
            console.log('Email sent successfully');
        } catch (emailError) {
            console.error('Email error:', emailError);
            // Continue with payment even if email fails
        }

        // Square payment process
        const amountInCents = Math.round(price * 100);
        const payload = {
            idempotency_key: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
            quick_pay: {
                name: description || "Payment",
                price_money: {
                    amount: amountInCents,
                    currency: "USD"
                },
                location_id: process.env.SQUARE_LOCATION_ID
            }
        };

        const response = await fetch(SQUARE_API_URL, {
            method: 'POST',
            headers: {
                'Square-Version': '2024-02-20',
                'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.errors?.[0]?.detail || 'Failed to create payment link');
        }

        if (data.payment_link?.url) {
            res.json({ 
                url: data.payment_link.url,
                id: data.payment_link.id 
            });
        } else {
            throw new Error("Payment link not found in response");
        }

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ 
            error: "Operation failed",
            details: error.message 
        });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// Only start the server if we're not in Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}

// For Vercel
module.exports = app;
