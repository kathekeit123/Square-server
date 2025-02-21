require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const SQUARE_API_URL = 'https://connect.squareup.com/v2/online-checkout/payment-links';

app.post("/create-checkout-session", async (req, res) => {
    try {
        const { price, email, description } = req.body;

        // Log the incoming request
        console.log('Received request:', { price, email, description });

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

        // Log the Square payload
        console.log('Square payload:', payload);

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
        
        // Log the Square response
        console.log('Square response:', data);

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
            error: "Payment session creation failed",
            details: error.message 
        });
    }
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// Export for Vercel
module.exports = app;
