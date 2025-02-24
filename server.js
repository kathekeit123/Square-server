require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const SQUARE_API_URL = 'https://connect.squareup.com/v2/online-checkout/payment-links';

app.post("/create-checkout-session", async (req, res) => {
    try {
        const { price, email, description, fullBookingData } = req.body;

        // Convert price to smallest currency unit (cents)
        const amountInCents = Math.round(price * 100);

        // Crear una descripción detallada para el resumen de la orden
        const orderDescription = `
Booking Details
────────────────
Date: ${fullBookingData.date}
Time: ${fullBookingData.time}
Vehicle: ${fullBookingData.vehicle}

Route
From: ${fullBookingData.pickup}
To: ${fullBookingData.dropoff}
${fullBookingData.stops?.length ? `Stops: ${fullBookingData.stops.join(', ')}` : ''}

Passengers: ${fullBookingData.passengers}
Kids: ${fullBookingData.kids}
Luggage: ${fullBookingData.luggage}

Contact
Phone: ${fullBookingData.phone}
Email: ${fullBookingData.email}

${fullBookingData.locationType === 'airport' ? `
Flight Info
Airline: ${fullBookingData.airline}
Flight: ${fullBookingData.flightNumber}
Time: ${fullBookingData.arrivalTime}
` : ''}`;

        const payload = {
            idempotency_key: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
            quick_pay: {
                name: orderDescription,
                price_money: {
                    amount: amountInCents,
                    currency: "USD"
                },
                location_id: process.env.SQUARE_LOCATION_ID
            },
            checkout_options: {
                allow_coupons: true,
                ask_for_shipping_address: false,
                redirect_url: "https://katherines-amazing-site-45502f.webflow.io/booknow"
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
        console.error("Square Payment Error:", error);
        res.status(500).json({ 
            error: "Payment session creation failed",
            details: error.message 
        });
    }
});
// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
