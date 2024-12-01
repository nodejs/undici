// server.js

const express = require('express');
const stripe = require('stripe')('your-stripe-secret-key'); // Replace with your Stripe secret key
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Middleware to parse incoming requests
app.use(bodyParser.json());

// Endpoint to handle one-time payment requests
app.post('/pay', async (req, res) => {
  try {
    const { amount, token } = req.body;

    // Create a payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in cents (e.g., $10 = 1000)
      currency: 'usd',
      payment_method: token.id,
      confirmation_method: 'manual',
      confirm: true,
    });

    // Check payment status
    if (paymentIntent.status === 'succeeded') {
      res.status(200).send({ success: true, message: 'Payment successful' });
    } else {
      res.status(400).send({ success: false, message: 'Payment failed' });
    }
  } catch (error) {
    console.error('Payment Error:', error);
    res.status(500).send({ success: false, message: 'Payment processing error' });
  }
});

// Endpoint to handle subscription creation
app.post('/subscribe', async (req, res) => {
  try {
    const { token, planId } = req.body; // Assume a predefined subscription plan

    // Create a customer and subscribe to a plan
    const customer = await stripe.customers.create({
      payment_method: token.id,
      email: req.body.email,
      invoice_settings: { default_payment_method: token.id },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ plan: planId }], // Replace with your Stripe plan ID
      expand: ['latest_invoice.payment_intent'],
    });

    if (subscription.status === 'active') {
      res.status(200).send({ success: true, message: 'Subscription successful' });
    } else {
      res.status(400).send({ success: false, message: 'Subscription failed' });
    }
  } catch (error) {
    console.error('Subscription Error:', error);
    res.status(500).send({ success: false, message: 'Subscription error' });
  }
});

// Starting the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
