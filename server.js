require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(cors());

const SQUARE_API_URL = 'https://connect.squareup.com/v2/online-checkout/payment-links';

// Configuración de nodemailer para enviar emails
const transporter = nodemailer.createTransport({
    service: 'gmail', // O tu proveedor de correo
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.post("/create-checkout-session", async (req, res) => {
    try {
        const { price, email, description, ...additionalData } = req.body;

        // Convert price to smallest currency unit (cents)
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
            },
            checkout_options: {
                allow_coupons: true,
                ask_for_shipping_address: false,
                redirect_url: "https://www.jrodtransportation.com/payment-success
            },
            // Adjuntar datos adicionales del formulario para referencia posterior
            additional_data: {
                email,
                ...additionalData
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

// Webhook para manejar eventos de pago de Square
app.post("/webhook/square", async (req, res) => {
    // Verificar la firma del webhook para autenticidad
    const signatureHeader = req.get('x-square-signature');
    const payload = req.body;

    // Generar la firma para verificar la autenticidad del webhook
    const generatedSignature = crypto
        .createHmac('sha1', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
        .update(JSON.stringify(payload))
        .digest('base64');

    // Verificar la firma del webhook
    if (signatureHeader !== generatedSignature) {
        return res.status(401).send('Unauthorized');
    }

    // Manejar diferentes tipos de eventos
    if (payload.type === 'payment.created') {
        try {
            // Extraer información del pago
            const payment = payload.data.object.payment;
            
            // Buscar los datos adicionales asociados con este pago
            // Nota: Esto dependerá de cómo Square maneja la asociación de datos adicionales
            const additionalData = payment.additional_data || {};

            // Enviar correo electrónico de confirmación
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: additionalData.email || payment.email_address,
                subject: 'Confirmación de Pago',
                html: `
                    <h1>Confirmación de Pago</h1>
                    <p>Gracias por tu pago.</p>
                    <h2>Detalles del Pago:</h2>
                    <ul>
                        <li>Monto: $${(payment.amount_money.amount / 100).toFixed(2)}</li>
                        <li>Fecha: ${new Date().toLocaleString()}</li>
                    </ul>
                    <h2>Información Adicional:</h2>
                    <pre>${JSON.stringify(additionalData, null, 2)}</pre>
                `
            });

            // Opcional: Guardar detalles del pago en una base de datos
            // await savePaymentToDatabase(payment, additionalData);

        } catch (error) {
            console.error('Error processing webhook:', error);
        }
    }

    // Responder que el webhook se procesó correctamente
    res.status(200).send('Webhook received');
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
