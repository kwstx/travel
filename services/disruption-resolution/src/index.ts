import express from 'express';
import { webhookRouter } from './webhook';
import { DisruptionOrchestrator } from './orchestrator';

const app = express();
const port = process.env.PORT || 3006;

app.use('/api/disruption', webhookRouter);

const orchestrator = new DisruptionOrchestrator();

// Mock endpoint to manually trigger a disruption event for testing
app.post('/api/test/trigger-disruption', express.json(), async (req, res) => {
    const { pnr, userId, flightId, reason } = req.body;
    
    if (!pnr || !userId || !flightId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await orchestrator.handleDisruptionEvent({
            pnr,
            userId,
            flightId,
            reason: reason || 'weather'
        });
        res.status(200).json({ success: true, message: 'Disruption event triggered and being processed.' });
    } catch (error) {
        console.error('[App] Error handling disruption event', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Disruption Resolution Service listening on port ${port}`);
});
