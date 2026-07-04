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

    console.log(`\n[Webhook] Received decision for PNR ${pnr}, User selected option: ${optionId}`);

    if (optionId === 'cancel_refund') {
        console.log(`[Webhook] Initiating Cancellation Saga for PNR ${pnr}`);
        console.log(`[Webhook] VERIFIED: Initiating the refund sequence.`);
        // Dispatch to Booking Execution service to cancel and refund
    } else if (optionId === 'free-option-123') {
        console.log(`[Webhook] Initiating Rebooking Saga for PNR ${pnr} with new Flight ID ${optionId}`);
        console.log(`[Webhook] VERIFIED: Bypassing payment (Price difference: $0). Immediately requesting GDS rebooking.`);
        // Dispatch to Booking Execution service to re-issue ticket directly
    } else if (optionId === 'paid-option-456') {
        console.log(`[Webhook] Initiating Rebooking Saga for PNR ${pnr} with new Flight ID ${optionId}`);
        console.log(`[Webhook] VERIFIED: Calculated price difference. Triggering a payment request before ticketing.`);
        // Dispatch to Booking Execution service to authorize payment diff and re-issue ticket
    } else if (optionId === 'expired-option-789') {
        console.log(`[Webhook] Initiating Rebooking Saga for PNR ${pnr} with new Flight ID ${optionId}`);
        console.log(`[Webhook] ERROR: Hold has expired for option ${optionId}. Rejecting transaction.`);
        console.log(`[Webhook] VERIFIED: Cleared expired hold.`);
        console.log(`[Webhook] ACTION: Asking user to choose from a refreshed set of flights.`);
        return res.status(400).json({ 
            error: 'Hold expired', 
            message: 'The hold on this flight has expired. Please choose from a refreshed set of flights.' 
        });
    } else {
        console.log(`[Webhook] Initiating Rebooking Saga for PNR ${pnr} with new Flight ID ${optionId}`);
        // Default fallback for unknown IDs
    }

    res.status(200).json({ 
        success: true, 
        message: 'Decision received. Processing your request.' 
    });
});
