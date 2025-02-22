app.post("/create-checkout-session", async (req, res) => {
    try {
        const { price, email, description, discountCode } = req.body;

        // Convert price to smallest currency unit (cents)
        const amountInCents = Math.round(price * 100);

        // Base payload
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

        // Add discount if code is provided
        if (discountCode) {
            payload.discounts = [{
                name: "Promo Code",
                code: discountCode
            }];
        }

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

        // Return the payment link URL
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

// Add endpoint to validate discount codes
app.post("/validate-discount", async (req, res) => {
    try {
        const { discountCode } = req.body;

        // Call Square Catalog API to check if the discount exists
        const response = await fetch('https://connect.squareup.com/v2/catalog/search', {
            method: 'POST',
            headers: {
                'Square-Version': '2024-02-20',
                'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                object_types: ["DISCOUNT"],
                query: {
                    exact_query: {
                        attribute_name: "discount_code",
                        attribute_value: discountCode
                    }
                }
            })
        });

        const data = await response.json();

        if (!response.ok || !data.objects || data.objects.length === 0) {
            throw new Error('Invalid discount code');
        }

        res.json({
            valid: true,
            discount: data.objects[0]
        });
    } catch (error) {
        res.status(400).json({ 
            valid: false,
            error: error.message 
        });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
