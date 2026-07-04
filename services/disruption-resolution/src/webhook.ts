import express from 'express';
import cors from 'cors';

export const webhookRouter = express.Router();

webhookRouter.use(cors());
webhookRouter.use(express.json());

webhookRouter.post('/decision', async (req, res) => {
    const { pnr, optionId, userId } = req.body;

    if (!pnr || !optionId) {
        return res.status(400).json({ error: 'Missing pnr or optionId' });
    }

    console.log(`[Webhook] Received decision for PNR ${pnr}, User selected option: ${optionId}`);

    // Here we would:
    // 1. Validate the hold hasn't expired (by querying the database or cache)
    // 2. Trigger the RebookingSaga in booking-execution service
    
    if (optionId === 'cancel_refund') {
        console.log(`[Webhook] Initiating Cancellation Saga for PNR ${pnr}`);
        // Dispatch to Booking Execution service to cancel and refund
    } else {
        console.log(`[Webhook] Initiating Rebooking Saga for PNR ${pnr} with new Flight ID ${optionId}`);
        // Dispatch to Booking Execution service to authorize payment diff (if any) and re-issue ticket
    }

    res.status(200).json({ 
        success: true, 
        message: 'Decision received. Processing your request.' 
    });
});
