require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { randomUUID } = require('crypto'); // AGREGAR ESTA LÍNEA

const app = express();
app.use(express.json());
app.use(cors());

// MODIFICAR ESTAS LÍNEAS - Cambiar URLs de Square
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const SQUARE_API_URL = SQUARE_ENVIRONMENT === 'sandbox' 
  ? 'https://connect.squareupsandbox.com/v2' 
  : 'https://connect.squareup.com/v2';

// Mantener la URL original para payment links (si aún la necesitas)
const SQUARE_PAYMENT_LINKS_URL = 'https://connect.squareup.com/v2/online-checkout/payment-links';

// Configuración de nodemailer para enviar emails (SIN CAMBIOS)
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// AGREGAR ESTE NUEVO ENDPOINT PARA PAGOS INTEGRADOS
app.post("/process-payment", async (req, res) => {
    try {
        const { sourceId, amount, bookingData } = req.body;

        // Validar datos requeridos
        if (!sourceId || !amount || !bookingData) {
            return res.status(400).json({ 
                success: false, 
                error: "Missing required payment data" 
            });
        }

        // Crear el pago en Square
        const paymentPayload = {
            source_id: sourceId,
            idempotency_key: randomUUID(),
            amount_money: {
                amount: amount, // Ya viene en centavos
                currency: "USD"
            },
            location_id: process.env.SQUARE_LOCATION_ID,
            note: `Booking: ${bookingData.bookingType} - ${bookingData.pickupDate}`,
            autocomplete: true
        };

        console.log('Creating payment with payload:', JSON.stringify(paymentPayload, null, 2));

        const response = await fetch(`${SQUARE_API_URL}/payments`, {
            method: 'POST',
            headers: {
                'Square-Version': '2024-02-20',
                'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentPayload)
        });

        const paymentResult = await response.json();

        if (!response.ok) {
            console.error('Square payment error:', paymentResult);
            throw new Error(paymentResult.errors?.[0]?.detail || 'Payment processing failed');
        }

        console.log('Payment successful:', paymentResult.payment.id);

        // Enviar email de confirmación
        try {
            await sendConfirmationEmail(bookingData, paymentResult.payment);
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // No fallar el pago si el email falla
        }

        // Retornar éxito
        res.json({ 
            success: true, 
            paymentId: paymentResult.payment.id,
            message: "Payment processed successfully"
        });

    } catch (error) {
        console.error("Payment processing error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Payment processing failed"
        });
    }
});

// AGREGAR ESTA NUEVA FUNCIÓN
async function sendConfirmationEmail(bookingData, payment) {
    const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .booking-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
                .payment-info { background: #e8f5e8; padding: 15px; margin: 15px 0; border-radius: 5px; }
                .footer { text-align: center; padding: 20px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Booking Confirmed!</h1>
                    <p>Your payment has been processed successfully</p>
                </div>
                
                <div class="content">
                    <div class="booking-details">
                        <h2>Booking Details</h2>
                        <p><strong>Service:</strong> ${bookingData.bookingType}</p>
                        <p><strong>Date:</strong> ${bookingData.pickupDate}</p>
                        <p><strong>Time:</strong> ${bookingData.pickupTime}</p>
                        <p><strong>Pickup:</strong> ${bookingData.pickup}</p>
                        <p><strong>Dropoff:</strong> ${bookingData.dropoff}</p>
                        ${bookingData.passengers ? `<p><strong>Passengers:</strong> ${bookingData.passengers}</p>` : ''}
                    </div>
                    
                    <div class="payment-info">
                        <h2>Payment Information</h2>
                        <p><strong>Amount:</strong> $${(payment.amount_money.amount / 100).toFixed(2)}</p>
                        <p><strong>Payment ID:</strong> ${payment.id}</p>
                        <p><strong>Status:</strong> Confirmed</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Thank you for choosing our transportation service!</p>
                </div>
            </div>
        </body>
        </html>
    `;

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: bookingData.email,
        cc: 'info@jrodtransportation.com',
        subject: `Booking Confirmation - ${bookingData.bookingType} on ${bookingData.pickupDate}`,
        html: emailHtml
    });
}

// AGREGAR ESTE NUEVO ENDPOINT
app.get("/square-config", (req, res) => {
    res.json({
        applicationId: process.env.SQUARE_APPLICATION_ID,
        locationId: process.env.SQUARE_LOCATION_ID,
        environment: SQUARE_ENVIRONMENT
    });
});

// MANTENER TU ENDPOINT ORIGINAL (sin cambios)
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
                redirect_url: "https://www.jrodtransportation.com/payment-success"
            },
            additional_data: {
                email,
                ...additionalData
            }
        };

        const response = await fetch(SQUARE_PAYMENT_LINKS_URL, {
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

// MANTENER TU WEBHOOK ORIGINAL (sin cambios)
app.post("/webhook/square", async (req, res) => {
    const signatureHeader = req.get('x-square-signature');
    const payload = req.body;

    const generatedSignature = crypto
        .createHmac('sha1', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
        .update(JSON.stringify(payload))
        .digest('base64');

    if (signatureHeader !== generatedSignature) {
        return res.status(401).send('Unauthorized');
    }

    if (payload.type === 'payment.created') {
        try {
            const payment = payload.data.object.payment;
            const additionalData = payment.additional_data || {};

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

        } catch (error) {
            console.error('Error processing webhook:', error);
        }
    }

    res.status(200).send('Webhook received');
});

// MODIFICAR ESTA LÍNEA - Health check mejorado
app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "ok", 
        environment: SQUARE_ENVIRONMENT,
        hasSquareConfig: !!(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_ACCESS_TOKEN)
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔧 Square Environment: ${SQUARE_ENVIRONMENT}`);
    console.log(`📧 Email configured: ${process.env.EMAIL_USER ? 'Yes' : 'No'}`);
    console.log(`🔑 Square configured: ${process.env.SQUARE_APPLICATION_ID ? 'Yes' : 'No'}`);
});
